import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { api } from "../lib/api.js";
import { listarVendasPendentes } from "../lib/bancoOffline.js";
import { tentarNovamenteVendaPendente } from "../lib/sincronizacaoOffline.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarMoeda, formatarNumero, hojeISO } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
import { diasAtras, FiltroPeriodo } from "../componentes/FiltroPeriodo.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

/**
 * Duas origens de pendência bem diferentes (docs/PENDENCIAS.md — Fase 6):
 *
 * 1. Estoque pendente de conferência: dado do servidor (`vendas.vendas`,
 *    `estoque_conferencia_pendente`). A venda aconteceu de verdade, só a
 *    baixa ficou negativa por conflito de sincronização offline. Resolve com
 *    `POST /vendas/:id/conferir-estoque` (mesma permissão de cancelamento).
 * 2. Erro de sincronização: dado só do navegador (IndexedDB,
 *    `fila_vendas_pendentes` com status `erro`) — a venda nunca chegou ao
 *    servidor. Só existe nesta máquina/terminal (ver PENDENCIAS.md).
 */

/** Soma o que foi pago no carrinho offline — o payload não guarda valor_total (o servidor recalcula). */
function totalPagoNoPayload(payload) {
  return (payload.pagamentos ?? []).reduce((soma, pagamento) => soma + Number(pagamento.valor), 0);
}

function SecaoEstoquePendente() {
  const [periodo, definirPeriodo] = useState({ de: diasAtras(29), ate: hojeISO() });

  const consulta = useMemo(
    () => `de=${periodo.de}&ate=${periodo.ate}&conferencia_pendente=sim&limite=500`,
    [periodo]
  );
  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.vendas.get(`?${consulta}`),
    [consulta]
  );

  const [resolvendoId, definirResolvendoId] = useState(null);
  const [erroAoResolver, definirErroAoResolver] = useState(null);

  async function marcarConferido(venda) {
    definirErroAoResolver(null);
    definirResolvendoId(venda.id);
    try {
      await api.vendas.post(`/${venda.id}/conferir-estoque`);
      recarregar();
    } catch (falha) {
      definirErroAoResolver(falha.message);
    } finally {
      definirResolvendoId(null);
    }
  }

  return (
    <Card>
      <CardCabecalho
        titulo="Estoque pendente de conferência"
        descricao="Vendas offline sincronizadas com saldo insuficiente: a venda já aconteceu, só a baixa de estoque precisa de revisão."
      />
      <div className="border-b border-borda px-5 py-4">
        <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />
      </div>

      {carregando ? <Carregando texto="Carregando vendas pendentes de conferência" /> : null}
      {erro ? (
        <div className="px-5 py-4">
          <Aviso tom="erro">{erro.message}</Aviso>
        </div>
      ) : null}
      {erroAoResolver ? (
        <div className="px-5 py-4">
          <Aviso tom="erro">{erroAoResolver}</Aviso>
        </div>
      ) : null}

      {dados ? (
        dados.vendas.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-corpo">
              <thead>
                <tr className="border-b border-borda text-left">
                  <th className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario">Quando</th>
                  <th className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario">Venda</th>
                  <th className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario">Cliente</th>
                  <th className="px-3 py-2 text-right text-rotulo uppercase tracking-wide text-secundario">
                    Itens
                  </th>
                  <th className="px-3 py-2 text-right text-rotulo uppercase tracking-wide text-secundario">
                    Total
                  </th>
                  <th className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario">Situação</th>
                  <th className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario">Ação</th>
                </tr>
              </thead>
              <tbody>
                {dados.vendas.map((venda) => (
                  <tr key={venda.id} className="h-9 border-b border-borda/70 last:border-b-0">
                    <td className="px-3 py-2 text-texto">{formatarDataHora(venda.criado_em)}</td>
                    <td className="px-3 py-2 text-texto tabular-nums">
                      {venda.numero ? `#${String(venda.numero).padStart(4, "0")}` : venda.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-texto">{venda.cliente_nome || "Não informado"}</td>
                    <td className="px-3 py-2 text-right text-texto">{formatarNumero(venda.total_itens)}</td>
                    <td className="px-3 py-2 text-right text-texto">{formatarMoeda(venda.valor_total)}</td>
                    <td className="px-3 py-2">
                      <Badge tom="alerta">Aguardando conferência</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        disabled={resolvendoId === venda.id}
                        onClick={() => marcarConferido(venda)}
                      >
                        {resolvendoId === venda.id ? "Marcando" : "Marcar como conferido"}
                      </Botao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EstadoVazio
            icone={CheckCircle2}
            titulo="Nada pendente de conferência"
            descricao="Nenhuma venda offline deste período teve conflito de estoque na sincronização."
          />
        )
      ) : null}
    </Card>
  );
}

function SecaoErrosDeSincronizacao() {
  const [pendentes, definirPendentes] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [tentandoId, definirTentandoId] = useState(null);
  const [avisoPorId, definirAvisoPorId] = useState({});

  const carregar = useCallback(() => {
    definirCarregando(true);
    listarVendasPendentes()
      .then((lista) => definirPendentes(lista.filter((registro) => registro.status === "erro")))
      .catch(() => definirPendentes([]))
      .finally(() => definirCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function tentarNovamente(registro) {
    definirTentandoId(registro.id);
    definirAvisoPorId((atual) => ({ ...atual, [registro.id]: null }));
    try {
      const resultado = await tentarNovamenteVendaPendente(registro);
      if (resultado.falhaDeRede) {
        definirAvisoPorId((atual) => ({
          ...atual,
          [registro.id]: "Sem conexão com o servidor agora — tente de novo quando a rede voltar.",
        }));
      }
    } catch {
      // IndexedDB indisponível — a lista local não pôde ser atualizada agora.
    } finally {
      definirTentandoId(null);
      carregar();
    }
  }

  return (
    <Card className="mt-6">
      <CardCabecalho
        titulo="Erros de sincronização"
        descricao="Vendas fechadas no caixa deste terminal que ainda não foram aceitas pelo servidor."
      />
      <div className="border-b border-borda px-5 py-3">
        <Aviso tom="info">
          Esta lista só existe neste navegador/terminal. Se a farmácia tiver mais de um caixa no
          futuro, um erro aqui não aparece nos outros — ver docs/PENDENCIAS.md.
        </Aviso>
      </div>

      {carregando ? <Carregando texto="Lendo a fila local" /> : null}

      {!carregando && pendentes ? (
        pendentes.length ? (
          <div className="divide-y divide-borda/70">
            {pendentes.map((registro) => (
              <div key={registro.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-corpo text-texto">
                    {formatarDataHora(registro.criado_em_local)} ·{" "}
                    {formatarNumero(registro.payload.itens?.length ?? 0)} item(ns) ·{" "}
                    {formatarMoeda(totalPagoNoPayload(registro.payload))}
                  </p>
                  <p className="mt-0.5 text-rotulo text-erro">
                    {registro.ultimo_erro ?? "Motivo não registrado."}
                  </p>
                  <p className="mt-0.5 text-rotulo text-secundario">
                    Tentativa(s): {formatarNumero(registro.tentativas ?? 0)}
                  </p>
                  {avisoPorId[registro.id] ? (
                    <p className="mt-1 text-rotulo text-alerta">{avisoPorId[registro.id]}</p>
                  ) : null}
                </div>
                <Botao
                  tamanho="pequeno"
                  variante="secundario"
                  icone={RefreshCw}
                  disabled={tentandoId === registro.id}
                  onClick={() => tentarNovamente(registro)}
                >
                  {tentandoId === registro.id ? "Tentando" : "Tentar novamente"}
                </Botao>
              </div>
            ))}
          </div>
        ) : (
          <EstadoVazio
            icone={WifiOff}
            titulo="Nenhum erro de sincronização"
            descricao="Todas as vendas fechadas neste terminal já foram aceitas pelo servidor."
          />
        )
      ) : null}
    </Card>
  );
}

/** Conferência gerencial (Fase 6 do PDV offline): docs/PENDENCIAS.md. */
export function ConferenciaOffline() {
  return (
    <>
      <TituloPagina
        titulo="Conferência offline"
        descricao="Pendências deixadas pelo PDV rodando sem rede: estoque a conferir no servidor e vendas que ainda não foram sincronizadas deste terminal."
      />
      <SecaoEstoquePendente />
      <SecaoErrosDeSincronizacao />
    </>
  );
}
