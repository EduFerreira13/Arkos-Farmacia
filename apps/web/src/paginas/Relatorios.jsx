import { useMemo, useState } from "react";
import { BarChart3, Percent, TrendingUp, Trophy } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { FiltroPeriodo, diasAtras } from "../componentes/FiltroPeriodo.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const TOM_CLASSE = { A: "sucesso", B: "info", C: "neutro" };

/**
 * Relatórios e indicadores. A receita por produto vem do vendas-service e o
 * custo do estoque-service; margem e curva ABC são calculadas aqui, cruzando os
 * dois — nenhum serviço precisa conhecer o schema do outro.
 */
export function Relatorios() {
  const [periodo, definirPeriodo] = useState({ de: diasAtras(29), ate: diasAtras(0) });

  const consulta = useMemo(() => `?de=${periodo.de}&ate=${periodo.ate}`, [periodo]);

  const analise = usarBusca(() => api.vendas.get(`/analise${consulta}`), [consulta]);
  const catalogo = usarBusca(() => api.estoque.get("/produtos"), []);

  const carregando = analise.carregando || catalogo.carregando;
  const falha = analise.erro || catalogo.erro;

  /** Cruza vendas com custo, calcula margem e classifica em A, B e C. */
  const linhas = useMemo(() => {
    if (!analise.dados || !catalogo.dados) return [];

    const custoPorProduto = new Map(
      catalogo.dados.produtos.map((produto) => [produto.id, Number(produto.preco_custo)])
    );

    const comMargem = analise.dados.por_produto.map((item) => {
      const custoUnitario = custoPorProduto.get(item.produto_id) ?? 0;
      const receita = Number(item.receita);
      const custoTotal = custoUnitario * item.unidades;
      const lucro = receita - custoTotal;
      return {
        ...item,
        receita,
        custo_unitario: custoUnitario,
        custo_total: custoTotal,
        lucro,
        margem_pct: receita > 0 ? (lucro / receita) * 100 : 0,
        custo_conhecido: custoUnitario > 0,
      };
    });

    // Curva ABC pela receita acumulada: A até 80%, B até 95%, C o resto.
    const receitaTotal = comMargem.reduce((soma, item) => soma + item.receita, 0);
    let acumulado = 0;

    return comMargem
      .slice()
      .sort((a, b) => b.receita - a.receita)
      .map((item) => {
        acumulado += item.receita;
        const percentualAcumulado = receitaTotal > 0 ? (acumulado / receitaTotal) * 100 : 0;
        return {
          ...item,
          participacao_pct: receitaTotal > 0 ? (item.receita / receitaTotal) * 100 : 0,
          acumulado_pct: percentualAcumulado,
          classe: percentualAcumulado <= 80 ? "A" : percentualAcumulado <= 95 ? "B" : "C",
        };
      });
  }, [analise.dados, catalogo.dados]);

  const totais = analise.dados?.totais;
  const lucroTotal = linhas.reduce((soma, item) => soma + item.lucro, 0);
  const receitaTotal = linhas.reduce((soma, item) => soma + item.receita, 0);
  const margemMedia = receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0;
  const semCusto = linhas.filter((item) => !item.custo_conhecido).length;

  const porClasse = ["A", "B", "C"].map((classe) => {
    const doGrupo = linhas.filter((item) => item.classe === classe);
    return {
      classe,
      itens: doGrupo.length,
      receita: doGrupo.reduce((soma, item) => soma + item.receita, 0),
      participacao: receitaTotal
        ? (doGrupo.reduce((soma, item) => soma + item.receita, 0) / receitaTotal) * 100
        : 0,
    };
  });

  const maisVendidos = linhas.slice().sort((a, b) => b.unidades - a.unidades).slice(0, 10);

  return (
    <>
      <TituloPagina
        titulo="Relatórios e indicadores"
        descricao="Vendas por período e por produto, mais vendidos, margem e curva ABC."
        acoes={
          <>
            <ExportarRelatorio
              servico="vendas"
              caminho="/relatorio"
              titulo="Exportar vendas"
              modelo={{
                nome: "agrupar",
                rotulo: "Formato",
                opcoes: [
                  { valor: "produto", rotulo: "Total por produto" },
                  { valor: "", rotulo: "Um cupom por linha" },
                ],
              }}
            />
            <ExportarRelatorio
              servico="estoque"
              caminho="/relatorios/estoque"
              titulo="Exportar posição de estoque"
              comPeriodo={false}
              rotulo="Exportar estoque"
            />
          </>
        }
      />

      <Card className="mb-4">
        <div className="px-5 py-4">
          <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />
        </div>
      </Card>

      {carregando ? <Carregando texto="Cruzando vendas e custos" /> : null}
      {falha ? <Aviso tom="erro">{falha.message}</Aviso> : null}

      {analise.dados && catalogo.dados ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <CardIndicador
              rotulo="Vendas no período"
              valor={formatarMoeda(totais.valor)}
              detalhe={`${formatarNumero(totais.cupons)} cupons finalizados`}
              icone={TrendingUp}
            />
            <CardIndicador
              rotulo="Ticket médio"
              valor={formatarMoeda(totais.ticket_medio)}
              detalhe={`${formatarMoeda(totais.descontos)} de desconto concedido`}
              icone={BarChart3}
            />
            <CardIndicador
              rotulo="Lucro bruto estimado"
              valor={formatarMoeda(lucroTotal)}
              detalhe="receita menos custo dos itens vendidos"
              icone={Percent}
              tom={lucroTotal >= 0 ? "sucesso" : "erro"}
            />
            <CardIndicador
              rotulo="Margem média"
              valor={`${margemMedia.toFixed(1).replace(".", ",")}%`}
              detalhe="sobre a receita do período"
              icone={Percent}
              tom={margemMedia >= 30 ? "sucesso" : margemMedia >= 15 ? "alerta" : "erro"}
            />
          </div>

          {semCusto ? (
            <Aviso tom="alerta">
              {semCusto} produto(s) vendido(s) estão sem preço de custo cadastrado — a margem deles
              aparece como 100% até o custo ser informado.
            </Aviso>
          ) : null}

          <div className="grid grid-cols-[1fr_1fr] gap-4">
            <Card>
              <CardCabecalho
                titulo="Mais vendidos"
                descricao="Por unidades saídas no período."
                icone={Trophy}
              />
              <Tabela
                colunas={[
                  { chave: "produto_nome", titulo: "Produto" },
                  {
                    chave: "unidades",
                    titulo: "Unidades",
                    alinhamento: "direita",
                    renderizar: (item) => formatarNumero(item.unidades),
                  },
                  {
                    chave: "cupons",
                    titulo: "Cupons",
                    alinhamento: "direita",
                    renderizar: (item) => formatarNumero(item.cupons),
                  },
                  {
                    chave: "receita",
                    titulo: "Receita",
                    alinhamento: "direita",
                    renderizar: (item) => formatarMoeda(item.receita),
                  },
                ]}
                linhas={maisVendidos}
                chave={(item) => item.produto_id}
                vazio={
                  <EstadoVazio
                    icone={Trophy}
                    titulo="Nenhuma venda no período"
                    descricao="Escolha outra janela de datas."
                  />
                }
              />
            </Card>

            <Card>
              <CardCabecalho
                titulo="Curva ABC"
                descricao="A: até 80% da receita. B: até 95%. C: o resto."
                icone={BarChart3}
              />
              <CardCorpo className="space-y-3">
                {porClasse.map((grupo) => (
                  <div key={grupo.classe}>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-corpo text-texto">
                        <Badge tom={TOM_CLASSE[grupo.classe]}>Classe {grupo.classe}</Badge>{" "}
                        <span className="text-secundario">
                          {formatarNumero(grupo.itens)} produto(s)
                        </span>
                      </p>
                      <p className="text-corpo text-texto">{formatarMoeda(grupo.receita)}</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-borda">
                      <div
                        className={`h-full rounded-full ${
                          grupo.classe === "A"
                            ? "bg-sucesso"
                            : grupo.classe === "B"
                              ? "bg-info"
                              : "bg-secundario"
                        }`}
                        style={{ width: `${grupo.participacao}%` }}
                      />
                    </div>
                    <p className="mt-1 text-rotulo text-secundario">
                      {grupo.participacao.toFixed(1).replace(".", ",")}% da receita
                    </p>
                  </div>
                ))}

                <div className="border-t border-borda pt-3">
                  <p className="text-rotulo text-secundario">
                    Vendas por dia no período
                  </p>
                  <ul className="mt-2 space-y-1">
                    {analise.dados.por_dia.map((dia) => (
                      <li key={dia.dia} className="flex items-center justify-between text-rotulo">
                        <span className="text-secundario">{formatarData(dia.dia)}</span>
                        <span className="text-texto">
                          {formatarMoeda(dia.valor)} — {dia.cupons} cupom(ns)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardCorpo>
            </Card>
          </div>

          <Card>
            <CardCabecalho
              titulo="Margem por produto"
              descricao="Receita, custo dos itens vendidos e participação na receita total."
              icone={Percent}
            />
            <Tabela
              colunas={[
                {
                  chave: "classe",
                  titulo: "ABC",
                  largura: "72px",
                  renderizar: (item) => <Badge tom={TOM_CLASSE[item.classe]}>{item.classe}</Badge>,
                },
                { chave: "produto_nome", titulo: "Produto" },
                {
                  chave: "unidades",
                  titulo: "Un.",
                  alinhamento: "direita",
                  renderizar: (item) => formatarNumero(item.unidades),
                },
                {
                  chave: "receita",
                  titulo: "Receita",
                  alinhamento: "direita",
                  renderizar: (item) => formatarMoeda(item.receita),
                },
                {
                  chave: "custo_total",
                  titulo: "Custo",
                  alinhamento: "direita",
                  renderizar: (item) =>
                    item.custo_conhecido ? formatarMoeda(item.custo_total) : "—",
                },
                {
                  chave: "lucro",
                  titulo: "Lucro",
                  alinhamento: "direita",
                  renderizar: (item) => (
                    <span className={item.lucro >= 0 ? "text-sucesso" : "text-erro"}>
                      {formatarMoeda(item.lucro)}
                    </span>
                  ),
                },
                {
                  chave: "margem_pct",
                  titulo: "Margem",
                  alinhamento: "direita",
                  renderizar: (item) => `${item.margem_pct.toFixed(1).replace(".", ",")}%`,
                },
                {
                  chave: "participacao_pct",
                  titulo: "Participação",
                  alinhamento: "direita",
                  renderizar: (item) => `${item.participacao_pct.toFixed(1).replace(".", ",")}%`,
                },
              ]}
              linhas={linhas}
              totais={
                linhas.length
                  ? {
                      __rotulo: `${linhas.length} produto(s) vendido(s)`,
                      receita: formatarMoeda(receitaTotal),
                      custo_total: formatarMoeda(
                        linhas.reduce((soma, item) => soma + item.custo_total, 0)
                      ),
                      lucro: formatarMoeda(lucroTotal),
                      margem_pct: `${margemMedia.toFixed(1).replace(".", ",")}%`,
                    }
                  : null
              }
              chave={(item) => item.produto_id}
              vazio={
                <EstadoVazio
                  icone={Percent}
                  titulo="Sem vendas para calcular margem"
                  descricao="Escolha outro período."
                />
              }
            />
          </Card>
        </div>
      ) : null}
    </>
  );
}
