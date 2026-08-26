import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import {
  CATEGORIA_CANCELAMENTO_LABEL,
  CATEGORIA_CANCELAMENTO_LISTA,
  FORMA_PAGAMENTO_LABEL,
  STATUS_VENDA,
} from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarMoeda, formatarNumero, hojeISO } from "../lib/formato.js";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto, CampoTextoLongo } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { FiltroPeriodo } from "../componentes/FiltroPeriodo.jsx";
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
  [STATUS_VENDA.ABERTA]: "alerta",
  [STATUS_VENDA.FINALIZADA]: "sucesso",
  [STATUS_VENDA.CANCELADA]: "erro",
};

/** Número curto e legível da venda: "#0341" em vez de um pedaço do UUID. */
const numeroDaVenda = (venda) =>
  venda.numero ? `#${String(venda.numero).padStart(4, "0")}` : venda.id.slice(0, 8);

/**
 * Cancelamento com motivo em duas partes: a categoria (lista fechada, é o que o
 * relatório agrupa) e a observação livre, que fica registrada com o usuário.
 */
function ModalCancelamento({ venda, aoFechar, aoCancelar }) {
  const [categoria, definirCategoria] = useState(CATEGORIA_CANCELAMENTO_LISTA[0]);
  const [motivo, definirMotivo] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  async function confirmar() {
    definirErro(null);
    definirEnviando(true);
    try {
      await api.vendas.post(`/${venda.id}/cancelar`, { categoria, motivo: motivo.trim() });
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
      titulo="Cancelar venda"
      descricao={`Venda ${numeroDaVenda(venda)} — ${formatarMoeda(venda.valor_total)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="destrutivo" onClick={confirmar} disabled={enviando}>
            {enviando ? "Cancelando" : "Confirmar cancelamento"}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <CampoSelect
          rotulo="Motivo do cancelamento"
          value={categoria}
          onChange={(evento) => definirCategoria(evento.target.value)}
          opcoes={CATEGORIA_CANCELAMENTO_LISTA.map((valor) => ({
            valor,
            rotulo: CATEGORIA_CANCELAMENTO_LABEL[valor],
          }))}
          ajuda="É por aqui que o relatório separa, por exemplo, o que virou só orçamento."
        />
        <CampoTextoLongo
          rotulo="Observação (opcional)"
          value={motivo}
          onChange={(evento) => definirMotivo(evento.target.value)}
          ajuda="Fica registrada junto com o seu usuário."
        />
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      </div>
    </Modal>
  );
}

/**
 * Lista suspensa de status. Só a venda em aberto pode mudar por aqui: dá para
 * retomar no ponto de venda ou cancelar. "Finalizar" não entra na lista porque
 * exige pagamento e caixa aberto — isso é trabalho do PDV, não de uma lista.
 */
function SeletorDeStatus({ venda, podeCancelar, aoRetomar, aoCancelar }) {
  if (venda.status !== STATUS_VENDA.ABERTA) {
    return (
      <div>
        <Badge tom={TOM_STATUS[venda.status]}>{venda.status}</Badge>
        {venda.status === STATUS_VENDA.CANCELADA && venda.categoria_cancelamento ? (
          <p className="mt-0.5 text-rotulo text-secundario">
            {CATEGORIA_CANCELAMENTO_LABEL[venda.categoria_cancelamento] ??
              venda.categoria_cancelamento}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <select
      aria-label={`Situação da venda ${numeroDaVenda(venda)}`}
      value=""
      onChange={(evento) => {
        if (evento.target.value === "retomar") aoRetomar(venda);
        if (evento.target.value === "cancelar") aoCancelar(venda);
        evento.target.value = "";
      }}
      className="h-8 rounded-botao border border-alerta bg-alerta/10 px-2 text-rotulo text-texto focus-visible:foco-arkos"
    >
      <option value="">Em aberto</option>
      <option value="retomar">Retomar no ponto de venda</option>
      {podeCancelar ? <option value="cancelar">Cancelar venda</option> : null}
    </select>
  );
}

/** Histórico de vendas com filtros de período, status, controlado e busca. */
export function HistoricoVendas() {
  const { usuario } = usarAutenticacao();
  const navegar = useNavigate();
  const podeCancelar = temPermissao(usuario, "cancelar_venda");

  // Abre no movimento de hoje: é o que se olha na maior parte das vezes. Para
  // ver mais atrás basta mexer no período, que fica logo acima da lista.
  const [periodo, definirPeriodo] = useState({ de: hojeISO(), ate: hojeISO() });
  const [status, definirStatus] = useState("");
  const [controlado, definirControlado] = useState("");
  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");
  const [vendaParaCancelar, definirVendaParaCancelar] = useState(null);

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    if (status) query.set("status", status);
    if (controlado) query.set("controlado", controlado);
    if (buscaAplicada.trim()) query.set("busca", buscaAplicada.trim());
    query.set("limite", "500");
    return query.toString();
  }, [periodo, status, controlado, buscaAplicada]);

  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.vendas.get(`?${consulta}`),
    [consulta]
  );

  const totais = dados?.totais;
  const linhaTotais = dados?.vendas.length
    ? {
        __rotulo: `${formatarNumero(totais.vendas_finalizados)} de ${formatarNumero(
          totais.vendas
        )} venda(s) finalizada(s)`,
        total_itens: formatarNumero(
          dados.vendas.reduce((soma, venda) => soma + (venda.total_itens ?? 0), 0)
        ),
        total_unidades: formatarNumero(
          dados.vendas.reduce((soma, venda) => soma + (venda.total_unidades ?? 0), 0)
        ),
        desconto: formatarMoeda(totais.descontos),
        valor_total: formatarMoeda(totais.valor_finalizado),
      }
    : null;

  return (
    <>
      <TituloPagina
        titulo="Histórico de vendas"
        descricao="Abre no movimento de hoje. Mude o período para consultar outros dias."
        acoes={
          <ExportarRelatorio
            servico="vendas"
            caminho="/relatorio"
            titulo="Exportar histórico"
            descricao="A planilha já vem com o período que está na tela."
            comXlsx
            periodoInicial={periodo}
            modelo={{
              nome: "agrupar",
              rotulo: "Conteúdo",
              opcoes: [
                { valor: "", rotulo: "Uma venda por linha" },
                { valor: "produto", rotulo: "Total por produto" },
              ],
            }}
          />
        }
      />

      {/* O resumo vem antes da lista: é o que a pessoa quer saber primeiro. */}
      {totais ? (
        <Card className="mb-4">
          <div className="grid grid-cols-4 divide-x divide-borda">
            {[
              ["Vendas finalizadas", formatarNumero(totais.vendas_finalizados)],
              ["Valor finalizado", formatarMoeda(totais.valor_finalizado)],
              ["Ticket médio", formatarMoeda(totais.ticket_medio)],
              ["Descontos concedidos", formatarMoeda(totais.descontos)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="px-5 py-3">
                <p className="text-rotulo text-secundario">{rotulo}</p>
                <p className="mt-0.5 text-h3 text-texto">{valor}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-borda px-5 py-4">
          <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />

          <CampoSelect
            rotulo="Status"
            className="w-40"
            value={status}
            onChange={(evento) => definirStatus(evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todos" },
              { valor: STATUS_VENDA.FINALIZADA, rotulo: "Finalizada" },
              { valor: STATUS_VENDA.ABERTA, rotulo: "Aberta" },
              { valor: STATUS_VENDA.CANCELADA, rotulo: "Cancelada" },
            ]}
          />

          <CampoSelect
            rotulo="Controlado"
            className="w-44"
            value={controlado}
            onChange={(evento) => definirControlado(evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todas as vendas" },
              { valor: "sim", rotulo: "Com controlado" },
              { valor: "nao", rotulo: "Sem controlado" },
            ]}
          />

          <form
            className="flex items-end gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              definirBuscaAplicada(busca);
            }}
          >
            <CampoTexto
              rotulo="Produto, paciente ou cliente"
              className="w-64"
              value={busca}
              onChange={(evento) => definirBusca(evento.target.value)}
              placeholder="Ex: clonazepam"
            />
            <button
              type="submit"
              className="h-10 rounded-botao border border-primario px-4 text-corpo text-primario hover:bg-primario/10 focus-visible:foco-arkos"
            >
              Buscar
            </button>
          </form>
        </div>

        {carregando ? <Carregando texto="Carregando vendas" /> : null}
        {erro ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erro.message}</Aviso>
          </div>
        ) : null}

        {dados ? (
          <Tabela
            colunas={[
              {
                chave: "criado_em",
                titulo: "Quando",
                renderizar: (venda) => formatarDataHora(venda.criado_em),
              },
              {
                chave: "numero",
                titulo: "Venda",
                renderizar: (venda) => (
                  <span className="tabular-nums">{numeroDaVenda(venda)}</span>
                ),
              },
              {
                chave: "cliente_nome",
                titulo: "Cliente",
                renderizar: (venda) => venda.cliente_nome || venda.paciente_nome || "Não informado",
              },
              {
                chave: "total_itens",
                titulo: "Itens",
                alinhamento: "direita",
                renderizar: (venda) => formatarNumero(venda.total_itens),
              },
              {
                chave: "total_unidades",
                titulo: "Unidades",
                alinhamento: "direita",
                renderizar: (venda) => formatarNumero(venda.total_unidades ?? 0),
              },
              {
                chave: "tem_controlado",
                titulo: "Controlado",
                renderizar: (venda) =>
                  venda.tem_controlado ? <Badge tom="erro">Sim</Badge> : <Badge>Não</Badge>,
              },
              {
                chave: "formas_pagamento",
                titulo: "Pagamento",
                renderizar: (venda) =>
                  venda.formas_pagamento
                    ? venda.formas_pagamento
                        .split(" + ")
                        .map((forma) => FORMA_PAGAMENTO_LABEL[forma] ?? forma)
                        .join(" + ")
                    : "—",
              },
              {
                chave: "status",
                titulo: "Status",
                renderizar: (venda) => (
                  <SeletorDeStatus
                    venda={venda}
                    podeCancelar={podeCancelar}
                    aoRetomar={(alvo) => navegar(`/pdv?venda=${alvo.id}`)}
                    aoCancelar={definirVendaParaCancelar}
                  />
                ),
              },
              {
                chave: "desconto",
                titulo: "Desconto",
                alinhamento: "direita",
                renderizar: (venda) => formatarMoeda(venda.desconto),
              },
              {
                chave: "valor_total",
                titulo: "Total",
                alinhamento: "direita",
                renderizar: (venda) => formatarMoeda(venda.valor_total),
              },
            ]}
            linhas={dados.vendas}
            totais={linhaTotais}
            chave={(venda) => venda.id}
            vazio={
              <EstadoVazio
                icone={Receipt}
                titulo="Nenhuma venda no período"
                descricao="Ajuste as datas ou os filtros para ver outras vendas."
              />
            }
          />
        ) : null}
      </Card>

      {vendaParaCancelar ? (
        <ModalCancelamento
          venda={vendaParaCancelar}
          aoFechar={() => definirVendaParaCancelar(null)}
          aoCancelar={() => {
            definirVendaParaCancelar(null);
            recarregar();
          }}
        />
      ) : null}
    </>
  );
}
