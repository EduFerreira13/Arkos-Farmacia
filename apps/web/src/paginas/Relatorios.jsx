import { useMemo, useState } from "react";
import { BarChart3, LayoutGrid, Percent, TrendingUp, Trophy } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarMoeda, formatarNumero } from "../lib/formato.js";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { FiltroPeriodo, diasAtras } from "../componentes/FiltroPeriodo.jsx";
import { GraficoCurvaAbc, GraficoVendasPorDia } from "../componentes/Graficos.jsx";
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
 * Classifica itens em A (até 80% do total acumulado), B (até 95%) e C (o
 * resto), pelo critério que `valorDe` extrai de cada item — serve tanto para
 * faturamento quanto para frequência de vendas.
 */
function classificarAbc(itens, valorDe) {
  const total = itens.reduce((soma, item) => soma + valorDe(item), 0);
  let acumulado = 0;

  return itens
    .slice()
    .sort((a, b) => valorDe(b) - valorDe(a))
    .map((item) => {
      const valor = valorDe(item);
      acumulado += valor;
      const percentualAcumulado = total > 0 ? (acumulado / total) * 100 : 0;
      return {
        ...item,
        participacao_pct: total > 0 ? (valor / total) * 100 : 0,
        classe: percentualAcumulado <= 80 ? "A" : percentualAcumulado <= 95 ? "B" : "C",
      };
    });
}

/** Agrupa itens já classificados (ver classificarAbc) em totais por classe. */
function agruparPorClasse(itensClassificados, valorDe, chaveValor) {
  const totalGeral = itensClassificados.reduce((soma, item) => soma + valorDe(item), 0);

  return ["A", "B", "C"].map((classe) => {
    const doGrupo = itensClassificados.filter((item) => item.classe === classe);
    const valorGrupo = doGrupo.reduce((soma, item) => soma + valorDe(item), 0);
    return {
      classe,
      itens: doGrupo.length,
      [chaveValor]: valorGrupo,
      participacao: totalGeral ? (valorGrupo / totalGeral) * 100 : 0,
    };
  });
}

const CRITERIOS_ABC = [
  { chave: "faturamento", rotulo: "Por faturamento" },
  { chave: "frequencia", rotulo: "Por frequência de vendas" },
];

const ABAS = [
  { chave: "visao-geral", rotulo: "Visão geral", icone: LayoutGrid },
  { chave: "mais-vendidos", rotulo: "Mais vendidos", icone: Trophy },
  { chave: "curva-abc", rotulo: "Curva ABC", icone: BarChart3 },
  { chave: "margem", rotulo: "Margem por produto", icone: Percent },
];

/**
 * Relatórios e indicadores. A receita por produto vem do vendas-service e o
 * custo do estoque-service; margem e curva ABC são calculadas aqui, cruzando os
 * dois — nenhum serviço precisa conhecer o schema do outro.
 */
export function Relatorios() {
  const [periodo, definirPeriodo] = useState({ de: diasAtras(29), ate: diasAtras(0) });
  const [aba, definirAba] = useState("visao-geral");
  const [criterioAbc, definirCriterioAbc] = useState("faturamento");

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

    // Curva ABC pelo faturamento acumulado: A até 80%, B até 95%, C o resto.
    // A classe de cada produto (usada na tabela de margem) é sempre esta.
    return classificarAbc(comMargem, (item) => item.receita);
  }, [analise.dados, catalogo.dados]);

  const totais = analise.dados?.totais;
  const lucroTotal = linhas.reduce((soma, item) => soma + item.lucro, 0);
  const receitaTotal = linhas.reduce((soma, item) => soma + item.receita, 0);
  const margemMedia = receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0;
  const semCusto = linhas.filter((item) => !item.custo_conhecido).length;

  const porClasseFaturamento = agruparPorClasse(linhas, (item) => item.receita, "receita");

  // Segunda curva ABC, agora pela frequência de vendas (nº de vendas que
  // incluíram o produto) em vez do faturamento — mesma regra 80/95/resto.
  const porClasseFrequencia = agruparPorClasse(
    classificarAbc(linhas, (item) => item.vendas),
    (item) => item.vendas,
    "vendas"
  );

  const porClasse = criterioAbc === "faturamento" ? porClasseFaturamento : porClasseFrequencia;

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
                  { valor: "", rotulo: "Uma venda por linha" },
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
        <div className="px-4 py-3">
          <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />
        </div>
      </Card>

      {carregando ? <Carregando texto="Cruzando vendas e custos" /> : null}
      {falha ? <Aviso tom="erro">{falha.message}</Aviso> : null}

      {analise.dados && catalogo.dados ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <CardIndicador
              compacto
              rotulo="Vendas no período"
              valor={formatarMoeda(totais.valor)}
              detalhe={`${formatarNumero(totais.vendas)} vendas finalizadas`}
              icone={TrendingUp}
            />
            <CardIndicador
              compacto
              rotulo="Ticket médio"
              valor={formatarMoeda(totais.ticket_medio)}
              detalhe={`${formatarMoeda(totais.descontos)} de desconto concedido`}
              icone={BarChart3}
            />
            <CardIndicador
              compacto
              rotulo="Lucro bruto estimado"
              valor={formatarMoeda(lucroTotal)}
              detalhe="receita menos custo dos itens vendidos"
              icone={Percent}
              tom={lucroTotal >= 0 ? "sucesso" : "erro"}
            />
            <CardIndicador
              compacto
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

          <div className="mb-4 flex gap-1">
            {ABAS.map(({ chave, rotulo, icone: Icone }) => (
              <button
                key={chave}
                type="button"
                onClick={() => definirAba(chave)}
                className={[
                  "flex items-center gap-2 rounded-botao px-4 py-2 text-corpo transition-colors",
                  aba === chave ? "bg-primario text-white" : "text-secundario hover:bg-borda/60",
                ].join(" ")}
              >
                <Icone size={16} strokeWidth={2} aria-hidden="true" />
                {rotulo}
              </button>
            ))}
          </div>

          {aba === "visao-geral" ? (
            <Card>
              <CardCabecalho
                titulo="Vendas por dia"
                descricao="Valor vendido a cada dia do período selecionado."
                icone={TrendingUp}
              />
              <CardCorpo>
                {analise.dados.por_dia.length ? (
                  <GraficoVendasPorDia dados={analise.dados.por_dia} />
                ) : (
                  <EstadoVazio
                    icone={TrendingUp}
                    titulo="Nenhuma venda no período"
                    descricao="Escolha outra janela de datas."
                  />
                )}
              </CardCorpo>
            </Card>
          ) : null}

          {aba === "mais-vendidos" ? (
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
                    chave: "vendas",
                    titulo: "Vendas",
                    alinhamento: "direita",
                    renderizar: (item) => formatarNumero(item.vendas),
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
          ) : null}

          {aba === "curva-abc" ? (
            <Card>
              <CardCabecalho
                titulo="Curva ABC"
                descricao={
                  criterioAbc === "faturamento"
                    ? "Por faturamento. A: até 80% da receita. B: até 95%. C: o resto."
                    : "Por frequência de vendas. A: até 80% das vendas. B: até 95%. C: o resto."
                }
                icone={BarChart3}
                acoes={
                  <div className="flex items-center gap-1 rounded-botao border border-borda p-1">
                    {CRITERIOS_ABC.map((criterio) => (
                      <button
                        key={criterio.chave}
                        type="button"
                        onClick={() => definirCriterioAbc(criterio.chave)}
                        className={[
                          "rounded-botao px-3 py-1 text-rotulo transition-colors",
                          criterioAbc === criterio.chave
                            ? "bg-primario text-white"
                            : "text-secundario hover:bg-borda/60",
                        ].join(" ")}
                      >
                        {criterio.rotulo}
                      </button>
                    ))}
                  </div>
                }
              />
              <CardCorpo className="space-y-4">
                <GraficoCurvaAbc
                  dados={porClasse}
                  chave={criterioAbc === "faturamento" ? "receita" : "vendas"}
                  formatarValor={criterioAbc === "faturamento" ? formatarMoeda : formatarNumero}
                />
                <div className="grid grid-cols-3 gap-4 border-t border-borda pt-4">
                  {porClasse.map((grupo) => (
                    <div key={grupo.classe}>
                      <p className="text-corpo text-texto">
                        <Badge tom={TOM_CLASSE[grupo.classe]}>Classe {grupo.classe}</Badge>
                      </p>
                      <p className="mt-2 text-corpo text-texto">
                        {formatarNumero(grupo.itens)} produto(s)
                      </p>
                      <p className="text-rotulo text-secundario">
                        {criterioAbc === "faturamento"
                          ? formatarMoeda(grupo.receita)
                          : `${formatarNumero(grupo.vendas)} venda(s)`}{" "}
                        — {grupo.participacao.toFixed(1).replace(".", ",")}%{" "}
                        {criterioAbc === "faturamento" ? "da receita" : "das vendas"}
                      </p>
                    </div>
                  ))}
                </div>
              </CardCorpo>
            </Card>
          ) : null}

          {aba === "margem" ? (
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
                    renderizar: (item) => (
                      <Badge tom={TOM_CLASSE[item.classe]}>{item.classe}</Badge>
                    ),
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
          ) : null}
        </div>
      ) : null}
    </>
  );
}
