import { useMemo, useState } from "react";
import { History, Receipt } from "lucide-react";
import { FORMA_PAGAMENTO_LABEL, STATUS_VENDA } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { FiltroPeriodo, diasAtras } from "../componentes/FiltroPeriodo.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const TOM_STATUS = {
  [STATUS_VENDA.ABERTA]: "alerta",
  [STATUS_VENDA.FINALIZADA]: "sucesso",
  [STATUS_VENDA.CANCELADA]: "erro",
};

/** Histórico de vendas com filtros de período, status, controlado e busca. */
export function HistoricoVendas() {
  const [periodo, definirPeriodo] = useState({ de: diasAtras(29), ate: diasAtras(0) });
  const [status, definirStatus] = useState("");
  const [controlado, definirControlado] = useState("");
  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    if (status) query.set("status", status);
    if (controlado) query.set("controlado", controlado);
    if (buscaAplicada.trim()) query.set("busca", buscaAplicada.trim());
    query.set("limite", "500");
    return query.toString();
  }, [periodo, status, controlado, buscaAplicada]);

  const { dados, carregando, erro } = usarBusca(() => api.vendas.get(`?${consulta}`), [consulta]);

  const totais = dados?.totais;
  const linhaTotais = dados?.vendas.length
    ? {
        __rotulo: `${formatarNumero(totais.cupons_finalizados)} de ${formatarNumero(
          totais.cupons
        )} cupom(ns) finalizado(s)`,
        total_itens: formatarNumero(
          dados.vendas.reduce((soma, venda) => soma + (venda.total_itens ?? 0), 0)
        ),
        desconto: formatarMoeda(totais.descontos),
        valor_total: formatarMoeda(totais.valor_finalizado),
      }
    : null;

  return (
    <>
      <TituloPagina
        titulo="Histórico de vendas"
        descricao="Todas as vendas do período, com filtro por status, controlado e busca."
        acoes={
          <ExportarRelatorio
            servico="vendas"
            caminho="/relatorio"
            titulo="Exportar histórico"
            descricao="Mesma janela de datas que você escolher aqui na tela."
            modelo={{
              nome: "agrupar",
              rotulo: "Formato",
              opcoes: [
                { valor: "", rotulo: "Um cupom por linha" },
                { valor: "produto", rotulo: "Total por produto" },
              ],
            }}
          />
        }
      />

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
              { chave: "id", titulo: "Venda", renderizar: (venda) => venda.id.slice(0, 8) },
              {
                chave: "cliente_nome",
                titulo: "Cliente",
                renderizar: (venda) => venda.cliente_nome || venda.paciente_nome || "—",
              },
              {
                chave: "total_itens",
                titulo: "Itens",
                alinhamento: "direita",
                renderizar: (venda) => formatarNumero(venda.total_itens),
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
                        .split(", ")
                        .map((forma) => FORMA_PAGAMENTO_LABEL[forma] ?? forma)
                        .join(" + ")
                    : "—",
              },
              {
                chave: "status",
                titulo: "Status",
                renderizar: (venda) => <Badge tom={TOM_STATUS[venda.status]}>{venda.status}</Badge>,
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

      {totais ? (
        <Card className="mt-4">
          <CardCabecalho titulo="Resumo do período" icone={History} />
          <div className="grid grid-cols-4 divide-x divide-borda">
            {[
              ["Cupons finalizados", formatarNumero(totais.cupons_finalizados)],
              ["Valor finalizado", formatarMoeda(totais.valor_finalizado)],
              ["Ticket médio", formatarMoeda(totais.ticket_medio)],
              ["Descontos concedidos", formatarMoeda(totais.descontos)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="px-5 py-4">
                <p className="text-rotulo text-secundario">{rotulo}</p>
                <p className="mt-1 text-h3 text-texto">{valor}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
