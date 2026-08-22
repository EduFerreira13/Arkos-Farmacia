import { useMemo, useState } from "react";
import { Ban, Plus, Send, Trash2, Truck } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarMoeda, formatarNumero, hojeISO } from "../lib/formato.js";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto, CampoTextoLongo } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
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
  rascunho: "neutro",
  enviado: "info",
  recebido: "sucesso",
  cancelado: "erro",
};

/** Monta um pedido escolhendo fornecedor e itens do catálogo. */
function FormularioPedido({ itensIniciais = [], aoFechar, aoSalvar }) {
  const [fornecedorId, definirFornecedorId] = useState("");
  const [observacao, definirObservacao] = useState("");
  const [itens, definirItens] = useState(itensIniciais);
  const [produtoId, definirProdutoId] = useState("");
  const [quantidade, definirQuantidade] = useState("");
  const [preco, definirPreco] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

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

  const total = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);

  function adicionarItem(evento) {
    evento.preventDefault();
    const produto = auxiliares.dados?.produtos.find((registro) => registro.id === produtoId);
    if (!produto) return;

    definirItens([
      ...itens.filter((item) => item.produto_id !== produto.id),
      {
        produto_id: produto.id,
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
      await api.compras.post("/pedidos", {
        fornecedor_id: fornecedorId,
        observacao: observacao || null,
        itens: itens.map((item) => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
        })),
      });
      aoSalvar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      largura="max-w-3xl"
      titulo="Novo pedido de compra"
      descricao="O pedido nasce em rascunho: você confere antes de enviar ao fornecedor."
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
          <div className="grid grid-cols-2 gap-4">
            <CampoSelect
              rotulo="Fornecedor"
              required
              value={fornecedorId}
              onChange={(evento) => definirFornecedorId(evento.target.value)}
              opcoes={[
                { valor: "", rotulo: "Selecione" },
                ...auxiliares.dados.fornecedores.map((fornecedor) => ({
                  valor: fornecedor.id,
                  rotulo: fornecedor.nome,
                })),
              ]}
            />
            <CampoTexto
              rotulo="Observação"
              value={observacao}
              onChange={(evento) => definirObservacao(evento.target.value)}
              placeholder="Ex: reposição semanal"
            />
          </div>

          <form onSubmit={adicionarItem} className="flex items-end gap-3 border-t border-borda pt-4">
            <CampoSelect
              rotulo="Produto"
              className="flex-1"
              value={produtoId}
              onChange={(evento) => {
                definirProdutoId(evento.target.value);
                const produto = auxiliares.dados.produtos.find(
                  (registro) => registro.id === evento.target.value
                );
                if (produto) definirPreco(String(produto.preco_custo));
              }}
              opcoes={[
                { valor: "", rotulo: "Selecione o produto" },
                ...auxiliares.dados.produtos.map((produto) => ({
                  valor: produto.id,
                  rotulo: `${produto.nome} (saldo ${produto.quantidade_atual})`,
                })),
              ]}
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
            <Tabela
              colunas={[
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
              totais={{ __rotulo: "Total do pedido", subtotal: formatarMoeda(total) }}
            />
          ) : (
            <p className="text-corpo text-secundario">Nenhum item no pedido ainda.</p>
          )}

          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** Conferência do recebimento: quantidade recebida, lote e validade por item. */
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
  const [observacao, definirObservacao] = useState("");
  const [vencimento, definirVencimento] = useState("");
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
        observacao: observacao || null,
        vencimento_conta: vencimento || null,
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
      descricao={`Pedido ${pedido.id.slice(0, 8)} — ${pedido.fornecedor_nome}`}
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
          <Aviso tom={resultado.recebimento.tem_divergencia ? "alerta" : "sucesso"}>
            {resultado.recebimento.tem_divergencia
              ? "Recebido com divergência — a entrada foi feita e a diferença ficou registrada."
              : "Recebido conforme o pedido."}
          </Aviso>

          {resultado.alerta_divergencia ? (
            <ul className="space-y-1 text-corpo text-texto">
              {resultado.alerta_divergencia.map((linha) => (
                <li key={linha}>{linha}</li>
              ))}
            </ul>
          ) : null}

          <dl className="space-y-1 text-corpo">
            <div className="flex justify-between">
              <dt className="text-secundario">Valor recebido</dt>
              <dd>{formatarMoeda(resultado.valor_recebido)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secundario">Lotes que entraram no estoque</dt>
              <dd>{resultado.entradas.length}</dd>
            </div>
          </dl>

          {resultado.conta_pagar ? (
            <Aviso tom="info">
              Conta a pagar de {formatarMoeda(resultado.conta_pagar.valor)} criada com vencimento em{" "}
              {String(resultado.conta_pagar.vencimento).slice(0, 10).split("-").reverse().join("/")}.
            </Aviso>
          ) : (
            <Aviso tom="alerta">{resultado.aviso_conta}</Aviso>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Aviso tom="info">
            Confira item a item antes de dar entrada. Divergência não bloqueia o recebimento, mas
            fica registrada e sinalizada para o gestor.
          </Aviso>

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
                {linhas.map((linha, indice) => {
                  const diferenca = Number(linha.quantidade_recebida || 0) - linha.quantidade_pedida;
                  return (
                    <tr key={linha.item_pedido_id} className="border-b border-borda/70">
                      <td className="px-3 py-2 text-texto">
                        {linha.produto_nome}
                        {diferenca !== 0 ? (
                          <Badge tom={diferenca > 0 ? "alerta" : "erro"} className="ml-2">
                            {diferenca > 0 ? "+" : ""}
                            {diferenca}
                          </Badge>
                        ) : null}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <CampoTexto
              rotulo="Vencimento da conta a pagar"
              type="date"
              value={vencimento}
              onChange={(evento) => definirVencimento(evento.target.value)}
              ajuda="Em branco, entra para 30 dias."
            />
            <CampoTexto
              rotulo="Observação do recebimento"
              value={observacao}
              onChange={(evento) => definirObservacao(evento.target.value)}
              placeholder="Ex: duas caixas faltaram na entrega"
            />
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
      descricao={`Pedido ${pedido.id.slice(0, 8)} — ${pedido.fornecedor_nome}`}
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

export function Compras() {
  const [status, definirStatus] = useState("");
  const [formularioAberto, definirFormularioAberto] = useState(false);
  const [pedidoRecebendo, definirPedidoRecebendo] = useState(null);
  const [pedidoCancelando, definirPedidoCancelando] = useState(null);
  const [erro, definirErro] = useState(null);

  const consulta = useMemo(() => (status ? `?status=${status}` : ""), [status]);
  const { dados, carregando, recarregar, erro: erroBusca } = usarBusca(
    () => api.compras.get(`/pedidos${consulta}`),
    [consulta]
  );

  async function enviar(pedido) {
    definirErro(null);
    try {
      await api.compras.post(`/pedidos/${pedido.id}/enviar`, {});
      recarregar();
    } catch (falha) {
      definirErro(falha.message);
    }
  }

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
  const totais = pedidos.length
    ? {
        __rotulo: `${pedidos.length} pedido(s)`,
        valor_total: (() => {
          const soma = pedidos.reduce((total, pedido) => total + Number(pedido.valor_total), 0);
          return formatarMoeda(soma);
        })(),
      }
    : null;

  return (
    <>
      <TituloPagina
        titulo="Pedidos de compra"
        descricao="Do rascunho ao recebimento conferido, com entrada no estoque e conta a pagar."
        acoes={
          <>
            <ExportarRelatorio
              servico="compras"
              caminho="/relatorios/pedidos"
              titulo="Exportar pedidos"
              descricao="Pedidos criados no período, com valor e divergências."
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
        <div className="flex items-end gap-3 border-b border-borda px-5 py-4">
          <CampoSelect
            rotulo="Status"
            className="w-48"
            value={status}
            onChange={(evento) => definirStatus(evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todos" },
              { valor: "rascunho", rotulo: "Rascunho" },
              { valor: "enviado", rotulo: "Enviado ao fornecedor" },
              { valor: "recebido", rotulo: "Recebido" },
              { valor: "cancelado", rotulo: "Cancelado" },
            ]}
          />
        </div>

        {carregando ? <Carregando texto="Carregando pedidos" /> : null}
        {erroBusca ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erroBusca.message}</Aviso>
          </div>
        ) : null}

        {dados ? (
          <Tabela
            colunas={[
              {
                chave: "criado_em",
                titulo: "Criado",
                renderizar: (pedido) => formatarDataHora(pedido.criado_em),
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
                chave: "status",
                titulo: "Status",
                renderizar: (pedido) => (
                  <span className="flex items-center gap-2">
                    <Badge tom={TOM_STATUS[pedido.status]}>{pedido.status}</Badge>
                    {pedido.teve_divergencia ? <Badge tom="alerta">divergência</Badge> : null}
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
                    {pedido.status === "rascunho" ? (
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        icone={Send}
                        onClick={() => enviar(pedido)}
                      >
                        Enviar
                      </Botao>
                    ) : null}
                    {pedido.status === "enviado" ? (
                      <Botao tamanho="pequeno" icone={Truck} onClick={() => abrirRecebimento(pedido)}>
                        Receber
                      </Botao>
                    ) : null}
                    {pedido.status === "rascunho" || pedido.status === "enviado" ? (
                      <BotaoIcone
                        icone={Ban}
                        rotulo="Cancelar pedido"
                        onClick={() => definirPedidoCancelando(pedido)}
                      />
                    ) : null}
                  </span>
                ),
              },
            ]}
            linhas={pedidos}
            totais={totais}
            chave={(pedido) => pedido.id}
            vazio={
              <EstadoVazio
                icone={Truck}
                titulo="Nenhum pedido de compra"
                descricao="Crie um pedido ou use a sugestão de compra a partir do estoque baixo."
                acao={
                  <Botao icone={Plus} onClick={() => definirFormularioAberto(true)}>
                    Novo pedido
                  </Botao>
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
