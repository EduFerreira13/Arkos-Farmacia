import { useMemo, useState } from "react";
import { Ban, FileText, Plus, Trash2, Truck } from "lucide-react";
import {
  FORMA_PAGAMENTO_COMPRA,
  FORMA_PAGAMENTO_COMPRA_LABEL,
  FORMA_PAGAMENTO_COMPRA_LISTA,
  STATUS_PEDIDO_COMPRA,
  STATUS_PEDIDO_COMPRA_LABEL,
  STATUS_PEDIDO_COMPRA_LISTA,
} from "@arkos/shared-types";
import { api, baixarArquivo } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarNumero,
  hojeISO,
} from "../lib/formato.js";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import { CampoBusca } from "../componentes/CampoBusca.jsx";
import { CampoSelect, CampoTexto, CampoTextoLongo } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { BarraDePesquisa, LimparFiltros, LinhaDeFiltros } from "../componentes/Filtros.jsx";
import { diasAtras } from "../componentes/FiltroPeriodo.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const TOM_STATUS = {
  [STATUS_PEDIDO_COMPRA.PENDENTE_ENTREGA]: "info",
  [STATUS_PEDIDO_COMPRA.RECEBIDO]: "sucesso",
  [STATUS_PEDIDO_COMPRA.CANCELADO]: "erro",
};

const OPCOES_PAGAMENTO = FORMA_PAGAMENTO_COMPRA_LISTA.map((forma) => ({
  valor: forma,
  rotulo: FORMA_PAGAMENTO_COMPRA_LABEL[forma],
}));

/** Fornecedor identificado como aparece na nota: razão social e CNPJ. */
const rotuloDoFornecedor = (fornecedor) => fornecedor.nome;
const cnpjDoFornecedor = (fornecedor) =>
  fornecedor.cnpj ? `CNPJ ${fornecedor.cnpj}` : "sem CNPJ cadastrado";

/** Baixa a ordem de compra em PDF, avisando na tela se o serviço recusar. */
async function baixarOrdem(pedido, aoFalhar) {
  try {
    await baixarArquivo(
      "compras",
      `/pedidos/${pedido.id}/ordem-de-compra.pdf`,
      `ordem_de_compra_${pedido.numero}.pdf`
    );
  } catch (falha) {
    aoFalhar(falha.message);
  }
}

/**
 * Monta um pedido escolhendo fornecedor e itens do catálogo.
 *
 * Não existe rascunho: o pedido é criado quando a compra está decidida, e já
 * nasce pendente de entrega. Assim que sai, o sistema gera a ordem de compra em
 * PDF — o documento que vai para o fornecedor.
 */
function FormularioPedido({ itensIniciais = [], aoFechar, aoSalvar }) {
  const [fornecedorId, definirFornecedorId] = useState("");
  const [formaPagamento, definirFormaPagamento] = useState(FORMA_PAGAMENTO_COMPRA.BOLETO);
  const [frete, definirFrete] = useState("");
  const [desconto, definirDesconto] = useState("");
  const [itens, definirItens] = useState(itensIniciais);
  const [produtoId, definirProdutoId] = useState("");
  const [quantidade, definirQuantidade] = useState("");
  const [preco, definirPreco] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);
  const [criado, definirCriado] = useState(null);

  const auxiliares = usarBusca(
    () =>
      Promise.all([api.estoque.get("/fornecedores"), api.estoque.get("/produtos")]).then(
        ([fornecedores, produtos]) => ({
          fornecedores: fornecedores.fornecedores,
          produtos: produtos.produtos,
        })
      ),
    []
  );

  const totalItens = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
  const total = Math.max(totalItens + Number(frete || 0) - Number(desconto || 0), 0);

  const fornecedor =
    auxiliares.dados?.fornecedores.find((registro) => registro.id === fornecedorId) ?? null;

  function adicionarItem(evento) {
    evento.preventDefault();
    const produto = auxiliares.dados?.produtos.find((registro) => registro.id === produtoId);
    if (!produto) return;

    definirItens([
      ...itens.filter((item) => item.produto_id !== produto.id),
      {
        produto_id: produto.id,
        produto_codigo: produto.codigo,
        produto_nome: produto.nome,
        quantidade: Number(quantidade),
        preco_unitario: Number(preco || produto.preco_custo),
      },
    ]);
    definirProdutoId("");
    definirQuantidade("");
    definirPreco("");
  }

  async function submeter() {
    definirErro(null);
    if (!fornecedorId) return definirErro("Escolha o fornecedor.");
    if (!itens.length) return definirErro("Adicione ao menos um item.");

    definirEnviando(true);
    try {
      const resposta = await api.compras.post("/pedidos", {
        fornecedor_id: fornecedorId,
        forma_pagamento: formaPagamento,
        frete: Number(frete || 0),
        desconto: Number(desconto || 0),
        itens: itens.map((item) => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
        })),
      });
      definirCriado(resposta.pedido);
      // A ordem sai na hora: é o papel que o fornecedor precisa receber.
      await baixarOrdem(resposta.pedido, definirErro);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  // Depois de criado, a tela vira o comprovante do que foi feito.
  if (criado) {
    return (
      <Modal
        aberto
        titulo={`Pedido ${criado.numero} criado`}
        aoFechar={aoSalvar}
        rodape={
          <>
            <Botao
              variante="secundario"
              icone={FileText}
              onClick={() => baixarOrdem(criado, definirErro)}
            >
              Baixar ordem de compra
            </Botao>
            <Botao onClick={aoSalvar}>Concluir</Botao>
          </>
        }
      >
        <div className="space-y-4">
          <Aviso tom="sucesso">
            O pedido está pendente de entrega, e a ordem de compra em PDF foi baixada. Ela traz os
            dados da farmácia e do fornecedor, os itens, as quantidades e os valores.
          </Aviso>

          <dl className="space-y-1.5 text-corpo">
            <div className="flex justify-between">
              <dt className="text-secundario">Fornecedor</dt>
              <dd className="text-texto">{criado.fornecedor_nome}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secundario">Forma de pagamento</dt>
              <dd className="text-texto">
                {FORMA_PAGAMENTO_COMPRA_LABEL[criado.forma_pagamento] ?? criado.forma_pagamento}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secundario">Total do pedido</dt>
              <dd className="font-semibold text-texto">{formatarMoeda(criado.valor_total)}</dd>
            </div>
          </dl>

          {erro ? <Aviso tom="alerta">{erro}</Aviso> : null}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      aberto
      largura="max-w-4xl"
      titulo="Novo pedido de compra"
      descricao="Ao salvar, o pedido fica pendente de entrega e a ordem de compra é gerada em PDF."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={submeter} disabled={enviando}>
            {enviando ? "Salvando" : "Criar pedido"}
          </Botao>
        </>
      }
    >
      {auxiliares.carregando ? <Carregando texto="Carregando cadastros" /> : null}
      {auxiliares.erro ? <Aviso tom="erro">{auxiliares.erro.message}</Aviso> : null}

      {auxiliares.dados ? (
        <div className="space-y-4">
          <CampoBusca
            rotulo="Fornecedor"
            required
            valor={fornecedorId}
            placeholder="Busque pela razão social ou pelo CNPJ"
            opcoes={auxiliares.dados.fornecedores.map((registro) => ({
              valor: registro.id,
              rotulo: rotuloDoFornecedor(registro),
              detalhe: cnpjDoFornecedor(registro),
            }))}
            aoEscolher={definirFornecedorId}
            ajuda={fornecedor ? cnpjDoFornecedor(fornecedor) : undefined}
            vazio="Nenhum fornecedor com esse termo. Cadastre em Cadastros > Fornecedores."
          />

          <div className="grid grid-cols-3 gap-4">
            <CampoSelect
              rotulo="Forma de pagamento"
              value={formaPagamento}
              onChange={(evento) => definirFormaPagamento(evento.target.value)}
              opcoes={OPCOES_PAGAMENTO}
            />
            <CampoTexto
              rotulo="Frete"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={frete}
              onChange={(evento) => definirFrete(evento.target.value)}
              ajuda="Entra no total e na conta a pagar."
            />
            <CampoTexto
              rotulo="Desconto"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={desconto}
              onChange={(evento) => definirDesconto(evento.target.value)}
              ajuda="Desconto combinado no pedido inteiro."
            />
          </div>

          <form onSubmit={adicionarItem} className="flex items-end gap-3 border-t border-borda pt-4">
            <CampoBusca
              rotulo="Produto"
              className="flex-1"
              valor={produtoId}
              placeholder="Busque por código, nome ou princípio ativo"
              opcoes={auxiliares.dados.produtos.map((produto) => ({
                valor: produto.id,
                rotulo: produto.nome,
                detalhe: `${produto.codigo ?? "sem código"} — saldo ${produto.quantidade_atual}`,
              }))}
              aoEscolher={(valor, opcao) => {
                definirProdutoId(valor);
                if (!opcao) return;
                const produto = auxiliares.dados.produtos.find(
                  (registro) => registro.id === valor
                );
                if (produto) definirPreco(String(produto.preco_custo));
              }}
            />
            <CampoTexto
              rotulo="Quantidade"
              type="number"
              min="1"
              className="w-28"
              value={quantidade}
              onChange={(evento) => definirQuantidade(evento.target.value)}
            />
            <CampoTexto
              rotulo="Custo unitário"
              type="number"
              step="0.01"
              min="0"
              className="w-32"
              value={preco}
              onChange={(evento) => definirPreco(evento.target.value)}
            />
            <Botao
              variante="secundario"
              type="submit"
              icone={Plus}
              disabled={!produtoId || !quantidade}
            >
              Adicionar
            </Botao>
          </form>

          {itens.length ? (
            <>
              <Tabela
                colunas={[
                  {
                    chave: "produto_codigo",
                    titulo: "Código",
                    largura: "104px",
                    renderizar: (item) => item.produto_codigo || "—",
                  },
                  { chave: "produto_nome", titulo: "Produto" },
                  {
                    chave: "quantidade",
                    titulo: "Qtd.",
                    alinhamento: "direita",
                    renderizar: (item) => formatarNumero(item.quantidade),
                  },
                  {
                    chave: "preco_unitario",
                    titulo: "Custo",
                    alinhamento: "direita",
                    renderizar: (item) => formatarMoeda(item.preco_unitario),
                  },
                  {
                    chave: "subtotal",
                    titulo: "Subtotal",
                    alinhamento: "direita",
                    renderizar: (item) => formatarMoeda(item.quantidade * item.preco_unitario),
                  },
                  {
                    chave: "acoes",
                    titulo: "",
                    renderizar: (item) => (
                      <BotaoIcone
                        icone={Trash2}
                        rotulo={`Remover ${item.produto_nome}`}
                        onClick={() =>
                          definirItens(itens.filter((atual) => atual.produto_id !== item.produto_id))
                        }
                      />
                    ),
                  },
                ]}
                linhas={itens}
                chave={(item) => item.produto_id}
              />

              <dl className="ml-auto w-72 space-y-1 text-corpo">
                <div className="flex justify-between">
                  <dt className="text-secundario">Subtotal dos itens</dt>
                  <dd className="text-texto">{formatarMoeda(totalItens)}</dd>
                </div>
                {Number(frete || 0) ? (
                  <div className="flex justify-between">
                    <dt className="text-secundario">Frete</dt>
                    <dd className="text-texto">{formatarMoeda(frete)}</dd>
                  </div>
                ) : null}
                {Number(desconto || 0) ? (
                  <div className="flex justify-between">
                    <dt className="text-secundario">Desconto</dt>
                    <dd className="text-texto">- {formatarMoeda(desconto)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-borda pt-1 font-semibold">
                  <dt className="text-texto">Total do pedido</dt>
                  <dd className="text-texto">{formatarMoeda(total)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-corpo text-secundario">Nenhum item no pedido ainda.</p>
          )}

          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * Conferência do recebimento: quantidade recebida, lote e validade por item,
 * mais a data em que a mercadoria chegou.
 */
function ModalRecebimento({ pedido, aoFechar, aoReceber }) {
  const [linhas, definirLinhas] = useState(
    pedido.itens.map((item) => ({
      item_pedido_id: item.id,
      produto_nome: item.produto_nome,
      quantidade_pedida: item.quantidade,
      quantidade_recebida: String(item.quantidade),
      numero_lote: "",
      data_validade: "",
    }))
  );
  const [entregueEm, definirEntregueEm] = useState(hojeISO());
  const [erro, definirErro] = useState(null);
  const [resultado, definirResultado] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const atualizar = (indice, campo, valor) =>
    definirLinhas(
      linhas.map((linha, posicao) => (posicao === indice ? { ...linha, [campo]: valor } : linha))
    );

  async function confirmar() {
    definirErro(null);
    definirEnviando(true);
    try {
      const resposta = await api.compras.post(`/pedidos/${pedido.id}/receber`, {
        entregue_em: entregueEm,
        itens: linhas.map((linha) => ({
          item_pedido_id: linha.item_pedido_id,
          quantidade_recebida: Number(linha.quantidade_recebida || 0),
          numero_lote: linha.numero_lote,
          data_validade: linha.data_validade || null,
        })),
      });
      definirResultado(resposta);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      largura="max-w-4xl"
      titulo="Receber mercadoria"
      descricao={`Pedido ${pedido.numero} — ${pedido.fornecedor_nome}`}
      aoFechar={resultado ? aoReceber : aoFechar}
      rodape={
        resultado ? (
          <Botao onClick={aoReceber}>Concluir</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Voltar
            </Botao>
            <Botao onClick={confirmar} disabled={enviando}>
              {enviando ? "Registrando" : "Confirmar recebimento"}
            </Botao>
          </>
        )
      }
    >
      {resultado ? (
        <div className="space-y-4">
          <Aviso tom="sucesso">
            Entrada registrada em {formatarData(resultado.pedido.entregue_em)}.
          </Aviso>

          {resultado.alerta_divergencia ? (
            <Aviso tom="alerta" titulo="Chegou diferente do pedido">
              <ul className="mt-1 space-y-0.5">
                {resultado.alerta_divergencia.map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
            </Aviso>
          ) : null}

          <dl className="space-y-1 text-corpo">
            <div className="flex justify-between">
              <dt className="text-secundario">Valor recebido</dt>
              <dd className="text-texto">{formatarMoeda(resultado.valor_recebido)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secundario">Lotes que entraram no estoque</dt>
              <dd className="text-texto">{resultado.entradas.length}</dd>
            </div>
          </dl>

          {resultado.conta_pagar ? (
            <Aviso tom="info">
              Conta a pagar de {formatarMoeda(resultado.conta_pagar.valor)} criada com vencimento em{" "}
              {formatarData(resultado.conta_pagar.vencimento)}.
            </Aviso>
          ) : (
            <Aviso tom="alerta">{resultado.aviso_conta}</Aviso>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Aviso tom="info">
            Confira item a item antes de dar entrada. O que chegar a menos não bloqueia o
            recebimento — a entrada é feita pelo que veio de fato.
          </Aviso>

          <CampoTexto
            rotulo="Data da entrega"
            type="date"
            className="w-52"
            max={hojeISO()}
            value={entregueEm}
            onChange={(evento) => definirEntregueEm(evento.target.value)}
            ajuda="O dia em que a mercadoria chegou na farmácia."
          />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-corpo">
              <thead>
                <tr className="border-b border-borda text-left">
                  {["Produto", "Pedido", "Recebido", "Lote", "Validade"].map((titulo) => (
                    <th
                      key={titulo}
                      className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario"
                    >
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, indice) => (
                  <tr key={linha.item_pedido_id} className="border-b border-borda/70">
                    <td className="px-3 py-2 text-texto">{linha.produto_nome}</td>
                    <td className="px-3 py-2 text-secundario">{linha.quantidade_pedida}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={linha.quantidade_recebida}
                        onChange={(evento) =>
                          atualizar(indice, "quantidade_recebida", evento.target.value)
                        }
                        className="h-9 w-24 rounded-botao border border-borda bg-card px-2 text-corpo text-texto focus-visible:foco-arkos"
                        aria-label={`Quantidade recebida de ${linha.produto_nome}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={linha.numero_lote}
                        onChange={(evento) => atualizar(indice, "numero_lote", evento.target.value)}
                        placeholder="Lote"
                        className="h-9 w-32 rounded-botao border border-borda bg-card px-2 text-corpo text-texto focus-visible:foco-arkos"
                        aria-label={`Lote de ${linha.produto_nome}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        min={hojeISO()}
                        value={linha.data_validade}
                        onChange={(evento) =>
                          atualizar(indice, "data_validade", evento.target.value)
                        }
                        className="h-9 rounded-botao border border-borda bg-card px-2 text-corpo text-texto focus-visible:foco-arkos"
                        aria-label={`Validade de ${linha.produto_nome}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </div>
      )}
    </Modal>
  );
}

function ModalCancelamento({ pedido, aoFechar, aoCancelar }) {
  const [motivo, definirMotivo] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  async function confirmar() {
    definirErro(null);
    definirEnviando(true);
    try {
      await api.compras.post(`/pedidos/${pedido.id}/cancelar`, { motivo });
      aoCancelar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo="Cancelar pedido"
      descricao={`Pedido ${pedido.numero} — ${pedido.fornecedor_nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="destrutivo" onClick={confirmar} disabled={enviando || !motivo.trim()}>
            {enviando ? "Cancelando" : "Confirmar cancelamento"}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <CampoTextoLongo
          rotulo="Motivo do cancelamento"
          required
          value={motivo}
          onChange={(evento) => definirMotivo(evento.target.value)}
        />
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      </div>
    </Modal>
  );
}

const FILTROS_VAZIOS = {
  busca: "",
  status: "",
  forma_pagamento: "",
  fornecedor_id: "",
  de: diasAtras(89),
  ate: hojeISO(),
};

export function Compras() {
  const [filtros, definirFiltros] = useState(FILTROS_VAZIOS);
  const [formularioAberto, definirFormularioAberto] = useState(false);
  const [pedidoRecebendo, definirPedidoRecebendo] = useState(null);
  const [pedidoCancelando, definirPedidoCancelando] = useState(null);
  const [erro, definirErro] = useState(null);

  const mudar = (nome, valor) => definirFiltros((atual) => ({ ...atual, [nome]: valor }));

  const fornecedores = usarBusca(() => api.estoque.get("/fornecedores"), []);

  // O mesmo objeto abastece a lista e o relatório.
  const parametros = useMemo(() => {
    const limpos = {};
    for (const [nome, valor] of Object.entries(filtros)) {
      const texto = String(valor ?? "").trim();
      if (texto) limpos[nome] = texto;
    }
    return limpos;
  }, [filtros]);

  const consulta = useMemo(() => {
    const texto = new URLSearchParams(parametros).toString();
    return texto ? `?${texto}` : "";
  }, [parametros]);

  const { dados, carregando, recarregar, erro: erroBusca } = usarBusca(
    () => api.compras.get(`/pedidos${consulta}`),
    [consulta]
  );

  const resumoDosFiltros = useMemo(() => {
    const itens = [`Período: ${formatarData(filtros.de)} a ${formatarData(filtros.ate)}`];
    if (filtros.busca.trim()) itens.push(`Pesquisa: ${filtros.busca.trim()}`);
    if (filtros.status) itens.push(`Situação: ${STATUS_PEDIDO_COMPRA_LABEL[filtros.status]}`);
    if (filtros.forma_pagamento) {
      itens.push(`Pagamento: ${FORMA_PAGAMENTO_COMPRA_LABEL[filtros.forma_pagamento]}`);
    }
    if (filtros.fornecedor_id) {
      const fornecedor = fornecedores.dados?.fornecedores.find(
        (registro) => registro.id === filtros.fornecedor_id
      );
      if (fornecedor) itens.push(`Fornecedor: ${fornecedor.nome}`);
    }
    return itens;
  }, [filtros, fornecedores.dados]);

  const filtrosAtivos = Object.keys(FILTROS_VAZIOS).some(
    (nome) => filtros[nome] !== FILTROS_VAZIOS[nome]
  );

  async function abrirRecebimento(pedido) {
    definirErro(null);
    try {
      const completo = await api.compras.get(`/pedidos/${pedido.id}`);
      definirPedidoRecebendo(completo.pedido);
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  const pedidos = dados?.pedidos ?? [];

  return (
    <>
      <TituloPagina
        titulo="Pedidos de compra"
        acoes={
          <>
            <ExportarRelatorio
              servico="compras"
              caminho="/relatorios/pedidos"
              titulo="Relatório de pedidos"
              descricao="Pedidos do período com fornecedor, situação, pagamento e valor."
              rotulo="Relatório"
              parametros={parametros}
              periodoInicial={{ de: filtros.de, ate: filtros.ate }}
              resumoDosFiltros={resumoDosFiltros}
            />
            <Botao icone={Plus} onClick={() => definirFormularioAberto(true)}>
              Novo pedido
            </Botao>
          </>
        }
      />

      {erro ? (
        <Aviso tom="erro" className="mb-4">
          {erro}
        </Aviso>
      ) : null}

      <Card>
        <LinhaDeFiltros
          acoes={
            <LimparFiltros ativo={filtrosAtivos} aoLimpar={() => definirFiltros(FILTROS_VAZIOS)} />
          }
        >
          <BarraDePesquisa
            rotulo="Pesquisar pedido"
            placeholder="Número do pedido, fornecedor ou produto"
            valor={filtros.busca}
            aoMudar={(valor) => mudar("busca", valor)}
          />
          <CampoSelect
            rotulo="Situação"
            className="w-52"
            value={filtros.status}
            onChange={(evento) => mudar("status", evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todas" },
              ...STATUS_PEDIDO_COMPRA_LISTA.map((status) => ({
                valor: status,
                rotulo: STATUS_PEDIDO_COMPRA_LABEL[status],
              })),
            ]}
          />
          <CampoSelect
            rotulo="Fornecedor"
            className="w-56"
            value={filtros.fornecedor_id}
            onChange={(evento) => mudar("fornecedor_id", evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todos" },
              ...(fornecedores.dados?.fornecedores ?? []).map((registro) => ({
                valor: registro.id,
                rotulo: registro.nome,
              })),
            ]}
          />
          <CampoSelect
            rotulo="Forma de pagamento"
            className="w-52"
            value={filtros.forma_pagamento}
            onChange={(evento) => mudar("forma_pagamento", evento.target.value)}
            opcoes={[{ valor: "", rotulo: "Todas" }, ...OPCOES_PAGAMENTO]}
          />
          <CampoTexto
            rotulo="Do dia"
            type="date"
            className="w-40"
            value={filtros.de}
            max={filtros.ate}
            onChange={(evento) => mudar("de", evento.target.value)}
          />
          <CampoTexto
            rotulo="Até o dia"
            type="date"
            className="w-40"
            value={filtros.ate}
            min={filtros.de}
            max={hojeISO()}
            onChange={(evento) => mudar("ate", evento.target.value)}
          />
        </LinhaDeFiltros>

        {carregando ? <Carregando texto="Carregando pedidos" /> : null}
        {erroBusca ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erroBusca.message}</Aviso>
          </div>
        ) : null}

        {dados ? (
          <Tabela
            colunas={[
              // O número vem primeiro: é por ele que se procura o pedido no
              // telefone com o fornecedor. Quebrado em duas linhas ele deixa de
              // ser legível de relance, daí o whitespace-nowrap.
              {
                chave: "numero",
                titulo: "Pedido",
                largura: "140px",
                renderizar: (pedido) => (
                  <span className="whitespace-nowrap font-medium">{pedido.numero}</span>
                ),
              },
              {
                chave: "criado_em",
                titulo: "Criado",
                largura: "150px",
                renderizar: (pedido) => (
                  <span className="whitespace-nowrap">{formatarDataHora(pedido.criado_em)}</span>
                ),
              },
              { chave: "fornecedor_nome", titulo: "Fornecedor" },
              {
                chave: "total_itens",
                titulo: "Itens",
                alinhamento: "direita",
                renderizar: (pedido) =>
                  `${formatarNumero(pedido.total_itens)} (${formatarNumero(
                    pedido.total_unidades ?? 0
                  )} un.)`,
              },
              {
                chave: "forma_pagamento",
                titulo: "Pagamento",
                renderizar: (pedido) =>
                  FORMA_PAGAMENTO_COMPRA_LABEL[pedido.forma_pagamento] ?? pedido.forma_pagamento,
              },
              {
                chave: "status",
                titulo: "Situação",
                largura: "148px",
                renderizar: (pedido) => (
                  <Badge tom={TOM_STATUS[pedido.status]} className="whitespace-nowrap">
                    {STATUS_PEDIDO_COMPRA_LABEL[pedido.status] ?? pedido.status}
                  </Badge>
                ),
              },
              {
                chave: "entregue_em",
                titulo: "Entrega",
                largura: "104px",
                renderizar: (pedido) => (
                  <span className="whitespace-nowrap">
                    {pedido.entregue_em ? formatarData(pedido.entregue_em) : "—"}
                  </span>
                ),
              },
              {
                chave: "valor_total",
                titulo: "Valor",
                alinhamento: "direita",
                renderizar: (pedido) => formatarMoeda(pedido.valor_total),
              },
              {
                chave: "acoes",
                titulo: "",
                renderizar: (pedido) => (
                  <span className="flex justify-end gap-2">
                    <BotaoIcone
                      icone={FileText}
                      rotulo={`Baixar ordem de compra ${pedido.numero}`}
                      onClick={() => baixarOrdem(pedido, definirErro)}
                    />
                    {pedido.status === STATUS_PEDIDO_COMPRA.PENDENTE_ENTREGA ? (
                      <>
                        <Botao
                          tamanho="pequeno"
                          icone={Truck}
                          onClick={() => abrirRecebimento(pedido)}
                        >
                          Receber
                        </Botao>
                        <BotaoIcone
                          icone={Ban}
                          rotulo="Cancelar pedido"
                          onClick={() => definirPedidoCancelando(pedido)}
                        />
                      </>
                    ) : null}
                  </span>
                ),
              },
            ]}
            linhas={pedidos}
            chave={(pedido) => pedido.id}
            vazio={
              <EstadoVazio
                icone={Truck}
                titulo={filtrosAtivos ? "Nenhum pedido com esses filtros" : "Nenhum pedido de compra"}
                descricao={
                  filtrosAtivos
                    ? "Ajuste os filtros para ver outros pedidos."
                    : "Crie um pedido ou use a sugestão de compra a partir do estoque baixo."
                }
                acao={
                  filtrosAtivos ? null : (
                    <Botao icone={Plus} onClick={() => definirFormularioAberto(true)}>
                      Novo pedido
                    </Botao>
                  )
                }
              />
            }
          />
        ) : null}
      </Card>

      {formularioAberto ? (
        <FormularioPedido
          aoFechar={() => definirFormularioAberto(false)}
          aoSalvar={() => {
            definirFormularioAberto(false);
            recarregar();
          }}
        />
      ) : null}

      {pedidoRecebendo ? (
        <ModalRecebimento
          pedido={pedidoRecebendo}
          aoFechar={() => definirPedidoRecebendo(null)}
          aoReceber={() => {
            definirPedidoRecebendo(null);
            recarregar();
          }}
        />
      ) : null}

      {pedidoCancelando ? (
        <ModalCancelamento
          pedido={pedidoCancelando}
          aoFechar={() => definirPedidoCancelando(null)}
          aoCancelar={() => {
            definirPedidoCancelando(null);
            recarregar();
          }}
        />
      ) : null}
    </>
  );
}
