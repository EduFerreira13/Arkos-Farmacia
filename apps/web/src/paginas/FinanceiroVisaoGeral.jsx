import { Link } from "react-router-dom";
import { ArrowDownCircle, ArrowUpCircle, PieChart, Scale, Wallet } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda } from "../lib/formato.js";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import {
  Aviso,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const FAIXAS = [
  ["vencido", "Já vencido"],
  ["ate_7_dias", "Até 7 dias"],
  ["ate_15_dias", "8 a 15 dias"],
  ["ate_30_dias", "16 a 30 dias"],
  ["depois_de_30_dias", "Depois de 30 dias"],
];

/** Barra proporcional simples: compara a pagar e a receber na mesma faixa. */
function BarraComparativa({ pagar, receber, maximo }) {
  const largura = (valor) => (maximo > 0 ? `${Math.max((valor / maximo) * 100, valor > 0 ? 2 : 0)}%` : "0%");
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-24 text-right text-rotulo text-secundario">A receber</span>
        <span className="h-3 rounded-full bg-sucesso" style={{ width: largura(receber) }} />
        <span className="text-rotulo text-texto">{formatarMoeda(receber)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-24 text-right text-rotulo text-secundario">A pagar</span>
        <span className="h-3 rounded-full bg-erro" style={{ width: largura(pagar) }} />
        <span className="text-rotulo text-texto">{formatarMoeda(pagar)}</span>
      </div>
    </div>
  );
}

export function FinanceiroVisaoGeral() {
  const { dados, carregando, erro } = usarBusca(() => api.financeiro.get("/visao-geral"), []);

  const valorFaixa = (grupo, faixa) => Number(dados?.[grupo]?.por_faixa?.[faixa]?.valor ?? 0);

  const maximoFaixa = dados
    ? Math.max(
        ...FAIXAS.map(([faixa]) =>
          Math.max(valorFaixa("a_pagar", faixa), valorFaixa("a_receber", faixa))
        ),
        1
      )
    : 1;

  const maximoCurva = dados
    ? Math.max(
        ...dados.caixa_por_dia.map((dia) => Math.max(Number(dia.entradas), Number(dia.saidas))),
        1
      )
    : 1;

  return (
    <>
      <TituloPagina
        titulo="Visão geral do financeiro"
        descricao="O que entra contra o que sai, por faixa de vencimento."
        acoes={
          <ExportarRelatorio
            servico="financeiro"
            caminho="/relatorios/caixa"
            titulo="Exportar movimento de caixa"
            descricao="Lançamentos do período com totais e divergências."
          />
        }
      />

      {carregando ? <Carregando texto="Calculando posição" /> : null}
      {erro ? <Aviso tom="erro">{erro.message}</Aviso> : null}

      {dados ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <CardIndicador
              rotulo="A receber em aberto"
              valor={formatarMoeda(dados.a_receber.total)}
              detalhe={`${formatarMoeda(dados.atrasados.a_receber)} já vencido`}
              icone={ArrowUpCircle}
              tom="sucesso"
            />
            <CardIndicador
              rotulo="A pagar em aberto"
              valor={formatarMoeda(dados.a_pagar.total)}
              detalhe={`${formatarMoeda(dados.atrasados.a_pagar)} já vencido`}
              icone={ArrowDownCircle}
              tom="erro"
            />
            <CardIndicador
              rotulo="Saldo projetado"
              valor={formatarMoeda(dados.saldo_projetado)}
              detalhe={
                dados.saldo_projetado >= 0
                  ? "o que entra cobre o que sai"
                  : "falta caixa para cobrir as contas"
              }
              icone={Scale}
              tom={dados.saldo_projetado >= 0 ? "sucesso" : "erro"}
            />
            <CardIndicador
              rotulo="Resultado do mês"
              valor={formatarMoeda(dados.mes.resultado)}
              detalhe={`recebido ${formatarMoeda(dados.mes.recebido)} / pago ${formatarMoeda(
                dados.mes.pago
              )}`}
              icone={PieChart}
              tom={dados.mes.resultado >= 0 ? "sucesso" : "alerta"}
            />
          </div>

          <div className="grid grid-cols-[1.3fr_1fr] gap-4">
            <Card>
              <CardCabecalho
                titulo="Correlação por faixa de vencimento"
                descricao="Compara, em cada janela, quanto entra e quanto sai."
                icone={Scale}
              />
              <CardCorpo className="space-y-4">
                {FAIXAS.map(([faixa, rotulo]) => {
                  const pagar = valorFaixa("a_pagar", faixa);
                  const receber = valorFaixa("a_receber", faixa);
                  const saldo = receber - pagar;
                  return (
                    <div key={faixa}>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-corpo font-medium text-texto">{rotulo}</p>
                        <p
                          className={`text-rotulo ${saldo >= 0 ? "text-sucesso" : "text-erro"}`}
                        >
                          saldo {formatarMoeda(saldo)}
                        </p>
                      </div>
                      <BarraComparativa pagar={pagar} receber={receber} maximo={maximoFaixa} />
                    </div>
                  );
                })}
              </CardCorpo>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardCabecalho
                  titulo="Caixa dos últimos dias"
                  descricao="Entradas contra saídas por dia."
                  icone={Wallet}
                  acoes={
                    <Link
                      to="/caixa"
                      className="rounded-botao px-2 py-1 text-rotulo text-primario hover:bg-borda/60"
                    >
                      Abrir caixa
                    </Link>
                  }
                />
                <CardCorpo>
                  {dados.caixa_por_dia.length ? (
                    <ul className="space-y-2">
                      {dados.caixa_por_dia.map((dia) => (
                        <li key={dia.dia}>
                          <div className="flex items-center justify-between text-rotulo">
                            <span className="text-secundario">{formatarData(dia.dia)}</span>
                            <span className="text-texto">
                              {formatarMoeda(Number(dia.entradas) - Number(dia.saidas))}
                            </span>
                          </div>
                          <div className="mt-1 flex gap-1">
                            <span
                              className="h-2 rounded-full bg-sucesso"
                              style={{
                                width: `${(Number(dia.entradas) / maximoCurva) * 70 + 2}%`,
                              }}
                            />
                            <span
                              className="h-2 rounded-full bg-erro"
                              style={{ width: `${(Number(dia.saidas) / maximoCurva) * 70}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-corpo text-secundario">
                      Nenhum lançamento de caixa nos últimos dias.
                    </p>
                  )}
                </CardCorpo>
              </Card>

              {dados.vendas_hoje ? (
                <Card>
                  <CardCabecalho titulo="Vendas de hoje na loja" />
                  <CardCorpo>
                    <dl className="space-y-1.5 text-corpo">
                      <div className="flex justify-between">
                        <dt className="text-secundario">Cupons finalizados</dt>
                        <dd className="text-texto">{dados.vendas_hoje.total_vendas}</dd>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <dt>Total do dia</dt>
                        <dd>{formatarMoeda(dados.vendas_hoje.valor_total_dia)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-secundario">Ticket médio</dt>
                        <dd className="text-texto">
                          {formatarMoeda(dados.vendas_hoje.ticket_medio)}
                        </dd>
                      </div>
                    </dl>
                  </CardCorpo>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
