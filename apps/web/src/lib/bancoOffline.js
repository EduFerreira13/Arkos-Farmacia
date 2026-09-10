/**
 * Banco local do PDV (IndexedDB, nunca localStorage/sessionStorage — o
 * catálogo inteiro cabe aqui, e toda operação é assíncrona, sem travar a UI).
 *
 * Guarda o que o PDV precisa para montar uma venda inteira sem rede: uma
 * cópia do catálogo de produtos, a sessão do usuário autenticado (perfil e
 * permissões, para o teto de desconto do @arkos/vendas-core rodar offline),
 * a fila de vendas já fechadas no caixa esperando POST /vendas/sincronizar-offline,
 * e o carrinho da venda em andamento (sobrevive a um reload sem rede).
 *
 * Fase 5 é quem decide QUANDO chamar cada função daqui (o timer de
 * atualização do catálogo, o gatilho de sincronização da fila) — este módulo
 * só guarda e devolve dado, sem lógica de orquestração.
 */

export const NOME_BANCO = "arkos-pdv";
const VERSAO_BANCO = 1;

export const STORES = {
  CATALOGO: "catalogo_produtos",
  META_CATALOGO: "meta_sincronizacao_catalogo",
  SESSAO: "sessao_usuario",
  FILA_PENDENTES: "fila_vendas_pendentes",
  VENDA_EM_ANDAMENTO: "venda_em_andamento",
};

const CHAVE_META_CATALOGO = "catalogo";
const CHAVE_SESSAO = "atual";
const CHAVE_VENDA_EM_ANDAMENTO = "atual";

/** @param {IDBRequest} requisicao */
function promisificar(requisicao) {
  return new Promise((resolve, rejeitar) => {
    requisicao.onsuccess = () => resolve(requisicao.result);
    requisicao.onerror = () => rejeitar(requisicao.error);
  });
}

/** @param {IDBTransaction} tx */
function aguardarTransacao(tx) {
  return new Promise((resolve, rejeitar) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error ?? new Error("Transação do banco local abortada."));
  });
}

let promessaBanco = null;

/** Abre (criando/migrando se preciso) o banco local — uma conexão só, reaproveitada. */
export function abrirBanco() {
  if (promessaBanco) return promessaBanco;

  promessaBanco = new Promise((resolve, rejeitar) => {
    const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

    pedido.onupgradeneeded = () => {
      const banco = pedido.result;

      if (!banco.objectStoreNames.contains(STORES.CATALOGO)) {
        const catalogo = banco.createObjectStore(STORES.CATALOGO, { keyPath: "id" });
        catalogo.createIndex("codigo_barras", "codigo_barras", { unique: false });
      }
      if (!banco.objectStoreNames.contains(STORES.META_CATALOGO)) {
        banco.createObjectStore(STORES.META_CATALOGO, { keyPath: "chave" });
      }
      if (!banco.objectStoreNames.contains(STORES.SESSAO)) {
        banco.createObjectStore(STORES.SESSAO, { keyPath: "chave" });
      }
      if (!banco.objectStoreNames.contains(STORES.FILA_PENDENTES)) {
        const fila = banco.createObjectStore(STORES.FILA_PENDENTES, { keyPath: "id" });
        fila.createIndex("status", "status", { unique: false });
      }
      if (!banco.objectStoreNames.contains(STORES.VENDA_EM_ANDAMENTO)) {
        banco.createObjectStore(STORES.VENDA_EM_ANDAMENTO, { keyPath: "chave" });
      }
    };

    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });

  return promessaBanco;
}

async function transacao(nomes, modo) {
  const banco = await abrirBanco();
  return banco.transaction(nomes, modo);
}

// ------------------------------------------------------------------- catálogo

/**
 * Mapeia um Produto vindo de `GET /estoque/produtos/:id` (com `lotes`, cada
 * um já com `vencido` calculado pelo servidor) para o formato salvo no
 * catálogo local. `data_validade_proximo_lote` é a validade do lote não
 * vencido que vence primeiro — o mesmo critério de FEFO que
 * `apps/api/src/modulos/vendas/rotas.js` usa para decidir o próximo lote a
 * sair; fica `null` quando não há nenhum lote válido, o que
 * `@arkos/vendas-core` (`validarProdutoNaoVencido`) trata como bloqueio duro.
 * @param {{ id: string, nome: string, codigo_barras?: string, preco_venda: number,
 *   tipo_controle: string, lotes?: Array<{ quantidade: number, vencido: boolean, data_validade: string }> }} produto
 */
export function produtoParaCatalogo(produto) {
  const lotesValidos = (produto.lotes ?? [])
    .filter((lote) => !lote.vencido && lote.quantidade > 0)
    .sort((a, b) => a.data_validade.localeCompare(b.data_validade));

  return {
    id: produto.id,
    nome: produto.nome,
    codigo_barras: produto.codigo_barras ?? null,
    preco_venda: produto.preco_venda,
    tipo_controle: produto.tipo_controle,
    quantidade_atual: lotesValidos.reduce((soma, lote) => soma + lote.quantidade, 0),
    data_validade_proximo_lote: lotesValidos[0]?.data_validade ?? null,
  };
}

/** Substitui o catálogo inteiro — é assim que a atualização periódica funciona, nunca incremental. */
export async function salvarCatalogo(produtos) {
  const tx = await transacao([STORES.CATALOGO, STORES.META_CATALOGO], "readwrite");
  const catalogo = tx.objectStore(STORES.CATALOGO);

  catalogo.clear();
  for (const produto of produtos) catalogo.put(produto);
  tx.objectStore(STORES.META_CATALOGO).put({
    chave: CHAVE_META_CATALOGO,
    atualizado_em: new Date().toISOString(),
  });

  await aguardarTransacao(tx);
}

export async function listarCatalogo() {
  const tx = await transacao([STORES.CATALOGO], "readonly");
  return promisificar(tx.objectStore(STORES.CATALOGO).getAll());
}

export async function buscarProdutoDoCatalogo(produtoId) {
  const tx = await transacao([STORES.CATALOGO], "readonly");
  const produto = await promisificar(tx.objectStore(STORES.CATALOGO).get(produtoId));
  return produto ?? null;
}

/** Leitura de código de barras offline — mesmo atalho que o PDV já usa online. */
export async function buscarProdutoPorCodigoBarras(codigoBarras) {
  const tx = await transacao([STORES.CATALOGO], "readonly");
  const produto = await promisificar(
    tx.objectStore(STORES.CATALOGO).index("codigo_barras").get(codigoBarras)
  );
  return produto ?? null;
}

/** Idade do catálogo local — a tela offline mostra isso pro operador (Fase 5). */
export async function obterMetaCatalogo() {
  const tx = await transacao([STORES.META_CATALOGO], "readonly");
  const registro = await promisificar(tx.objectStore(STORES.META_CATALOGO).get(CHAVE_META_CATALOGO));
  return registro ?? null;
}

// ---------------------------------------------------------------- sessão

/**
 * Cacheia perfil/permissões do usuário logado a cada `GET /auth/me` — nunca
 * o cookie/JWT em si, só o que o teto de desconto do vendas-core precisa
 * para rodar sem rede.
 */
export async function salvarSessaoUsuario(usuario) {
  const registro = {
    chave: CHAVE_SESSAO,
    usuario_id: usuario.id,
    nome: usuario.nome,
    perfil: usuario.perfil,
    permissoes: usuario.permissoes ?? {},
    perfil_real: usuario.perfil_real ?? usuario.perfil ?? null,
    simulando: usuario.simulando === true,
    cacheado_em: new Date().toISOString(),
  };

  const tx = await transacao([STORES.SESSAO], "readwrite");
  tx.objectStore(STORES.SESSAO).put(registro);
  await aguardarTransacao(tx);
  return registro;
}

export async function obterSessaoUsuario() {
  const tx = await transacao([STORES.SESSAO], "readonly");
  const registro = await promisificar(tx.objectStore(STORES.SESSAO).get(CHAVE_SESSAO));
  return registro ?? null;
}

export async function limparSessaoUsuario() {
  const tx = await transacao([STORES.SESSAO], "readwrite");
  tx.objectStore(STORES.SESSAO).delete(CHAVE_SESSAO);
  await aguardarTransacao(tx);
}

// ----------------------------------------------------- fila de sincronização

/**
 * Registra uma venda já fechada no caixa offline, pronta para
 * `POST /vendas/sincronizar-offline`. `payload.id` (UUID gerado no client) é
 * também a chave do registro — o mesmo id que serve de idempotência no
 * servidor (`ON CONFLICT (id) DO NOTHING`, ver migration 0021).
 */
export async function adicionarVendaPendente(payload) {
  const registro = {
    id: payload.id,
    criado_em_local: new Date().toISOString(),
    status: "pendente",
    tentativas: 0,
    ultimo_erro: null,
    payload,
  };

  const tx = await transacao([STORES.FILA_PENDENTES], "readwrite");
  tx.objectStore(STORES.FILA_PENDENTES).put(registro);
  await aguardarTransacao(tx);
  return registro;
}

/** Ordenada por criado_em_local — a fila sincroniza na ordem em que as vendas aconteceram. */
export async function listarVendasPendentes() {
  const tx = await transacao([STORES.FILA_PENDENTES], "readonly");
  const registros = await promisificar(tx.objectStore(STORES.FILA_PENDENTES).getAll());
  return registros.sort((a, b) => a.criado_em_local.localeCompare(b.criado_em_local));
}

/** Atualiza status/tentativas/ultimo_erro de uma venda da fila (nunca o payload). */
export async function atualizarVendaPendente(id, mudancas) {
  const tx = await transacao([STORES.FILA_PENDENTES], "readwrite");
  const store = tx.objectStore(STORES.FILA_PENDENTES);
  const atual = await promisificar(store.get(id));
  if (!atual) {
    await aguardarTransacao(tx);
    return null;
  }
  const atualizado = { ...atual, ...mudancas };
  store.put(atualizado);
  await aguardarTransacao(tx);
  return atualizado;
}

/** Remove da fila só depois de uma sincronização confirmada (2xx) — nunca antes. */
export async function removerVendaPendente(id) {
  const tx = await transacao([STORES.FILA_PENDENTES], "readwrite");
  tx.objectStore(STORES.FILA_PENDENTES).delete(id);
  await aguardarTransacao(tx);
}

// ------------------------------------------------------------ venda em andamento

/** Carrinho da venda em construção — sobrevive a um reload enquanto offline. */
export async function salvarVendaEmAndamento(carrinho) {
  const tx = await transacao([STORES.VENDA_EM_ANDAMENTO], "readwrite");
  tx.objectStore(STORES.VENDA_EM_ANDAMENTO).put({
    chave: CHAVE_VENDA_EM_ANDAMENTO,
    ...carrinho,
    atualizado_em: new Date().toISOString(),
  });
  await aguardarTransacao(tx);
}

export async function obterVendaEmAndamento() {
  const tx = await transacao([STORES.VENDA_EM_ANDAMENTO], "readonly");
  const registro = await promisificar(
    tx.objectStore(STORES.VENDA_EM_ANDAMENTO).get(CHAVE_VENDA_EM_ANDAMENTO)
  );
  return registro ?? null;
}

/** Limpa o carrinho salvo — venda finalizada, enfileirada ou descartada. */
export async function limparVendaEmAndamento() {
  const tx = await transacao([STORES.VENDA_EM_ANDAMENTO], "readwrite");
  tx.objectStore(STORES.VENDA_EM_ANDAMENTO).delete(CHAVE_VENDA_EM_ANDAMENTO);
  await aguardarTransacao(tx);
}
