/**
 * Parte pura da orquestração de sincronização do PDV offline — sem React,
 * sem `fetch`/IndexedDB direto: tudo que faz I/O entra por parâmetro
 * (mesmo espírito de `conectividadeNucleo.js`), pra rodar em `node --test`
 * sem precisar de navegador nem servidor no ar.
 */

/** A cada refresh, quantos produtos buscam o detalhe (com lotes) em paralelo. */
export const CONCORRENCIA_ATUALIZACAO_CATALOGO = 8;

/** Catálogo pequeno de farmácia piloto: 10 min equilibra atualidade (preço,
 * validade) contra carga no estoque-service — ver docs/PENDENCIAS.md. */
export const INTERVALO_ATUALIZACAO_CATALOGO_MS = 10 * 60 * 1000;

/**
 * Roda `fn` para cada item de `itens`, no máximo `limite` chamadas em voo ao
 * mesmo tempo — nunca uma promise por item sem limite (`GET /produtos/:id`
 * um por vez esperaria, mas todos de uma vez sobrecarrega o estoque-service
 * num catálogo grande).
 * @template T, R
 * @param {T[]} itens
 * @param {number} limite
 * @param {(item: T, indice: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapComConcorrenciaLimitada(itens, limite, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo;
      proximo += 1;
      resultados[indice] = await fn(itens[indice], indice);
    }
  }

  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, trabalhador);
  await Promise.all(trabalhadores);
  return resultados;
}

/**
 * Busca a listagem de produtos e, com concorrência limitada, o detalhe (com
 * lotes) de cada um, já mapeado para o formato do catálogo local via
 * `paraRegistroCatalogo`. Quem chama decide quando rodar e como salvar
 * (`salvarCatalogo`, em `bancoOffline.js`) — esta função só busca e mapeia.
 *
 * Falha no detalhe de UM produto não derruba o refresh inteiro: o produto
 * entra no catálogo sem validade de lote conhecida (`data_validade_proximo_lote:
 * null`), o que `@arkos/vendas-core` trata como bloqueio duro — mais seguro
 * que arriscar vender vencido por causa de uma falha de rede pontual.
 *
 * @param {{
 *   listarProdutos: () => Promise<{ produtos: object[] }>,
 *   buscarProduto: (id: string) => Promise<{ produto: object }>,
 *   paraRegistroCatalogo: (produto: object) => object,
 *   concorrencia?: number,
 * }} deps
 */
export async function buscarCatalogoAtualizado({
  listarProdutos,
  buscarProduto,
  paraRegistroCatalogo,
  concorrencia = CONCORRENCIA_ATUALIZACAO_CATALOGO,
}) {
  const { produtos } = await listarProdutos();

  return mapComConcorrenciaLimitada(produtos, concorrencia, async (produtoResumido) => {
    try {
      const { produto } = await buscarProduto(produtoResumido.id);
      return paraRegistroCatalogo(produto);
    } catch {
      return {
        id: produtoResumido.id,
        nome: produtoResumido.nome,
        codigo_barras: produtoResumido.codigo_barras ?? null,
        preco_venda: produtoResumido.preco_venda,
        tipo_controle: produtoResumido.tipo_controle,
        principio_ativo: produtoResumido.principio_ativo ?? null,
        unidade_venda: produtoResumido.unidade_venda ?? null,
        venda_sob_encomenda: produtoResumido.venda_sob_encomenda === true,
        quantidade_atual: produtoResumido.quantidade_atual ?? 0,
        data_validade_proximo_lote: null,
      };
    }
  });
}

/**
 * Processa a fila de vendas pendentes, uma de cada vez, na ordem em que
 * `listarVendasPendentes` devolve (já ordenada por `criado_em_local` — ver
 * bancoOffline.js). Nunca reenvia uma venda já removida: cada uma só é
 * tocada uma vez, na sequência abaixo.
 *
 * - Sucesso (2xx): remove da fila.
 * - Erro de negócio (a chamada completou, mas com status de erro — ex.:
 *   pagamento_insuficiente, desconto_acima_do_limite): marca erro e segue
 *   para a próxima — uma venda ruim não trava as outras.
 * - Erro de transporte (a chamada nem completou — rede caiu de novo): marca
 *   pendente de novo e PÁRA aqui; a próxima detecção de "voltou online"
 *   retoma a fila do mesmo ponto.
 *
 * @param {{
 *   listarVendasPendentes: () => Promise<Array<{ id: string, payload: object, tentativas?: number }>>,
 *   sincronizarVenda: (payload: object) => Promise<{ status: number, dados?: object }>,
 *   removerVendaPendente: (id: string) => Promise<void>,
 *   atualizarVendaPendente: (id: string, mudancas: object) => Promise<void>,
 * }} deps
 * @returns {Promise<{ sincronizadas: number, comErro: number, parouPorFalhaDeRede: boolean }>}
 */
export async function processarFilaPendente({
  listarVendasPendentes,
  sincronizarVenda,
  removerVendaPendente,
  atualizarVendaPendente,
}) {
  const fila = await listarVendasPendentes();
  let sincronizadas = 0;
  let comErro = 0;

  for (const registro of fila) {
    let resultado;
    try {
      resultado = await sincronizarVenda(registro.payload);
    } catch (falha) {
      await atualizarVendaPendente(registro.id, {
        status: "pendente",
        tentativas: (registro.tentativas ?? 0) + 1,
        ultimo_erro: falha.message,
      });
      return { sincronizadas, comErro, parouPorFalhaDeRede: true };
    }

    if (resultado.status >= 200 && resultado.status < 300) {
      await removerVendaPendente(registro.id);
      sincronizadas += 1;
      continue;
    }

    comErro += 1;
    await atualizarVendaPendente(registro.id, {
      status: "erro",
      tentativas: (registro.tentativas ?? 0) + 1,
      ultimo_erro: resultado.dados?.mensagem ?? `Sincronização recusada (HTTP ${resultado.status}).`,
    });
  }

  return { sincronizadas, comErro, parouPorFalhaDeRede: false };
}
