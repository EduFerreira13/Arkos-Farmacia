import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  LayoutGrid,
  Package,
  Percent,
  PieChart,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero, hojeISO } from "../lib/formato.js";
import { CampoTexto } from "../componentes/Campos.jsx";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { ATALHOS_PERIODO, diasAtras } from "../componentes/FiltroPeriodo.jsx";
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
  { chave: "vendas-do-dia", rotulo: "Vendas do dia", icone: TrendingUp },
  { chave: "mais-vendidos", rotulo: "Mais vendidos", icone: Trophy },
  { chave: "curva-abc", rotulo: "Curva ABC", icone: BarChart3 },
  { chave: "margem", rotulo: "Margem por produto", icone: Percent },
];

// Meta mínima de faturamento diário, combinada com o dono da farmácia — sem
// tela de parâmetros ainda, então fica fixa aqui (ver docs/PENDENCIAS.md).
const META_MINIMA_DIARIA = 2100;

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

  // Custo por produto vem do estoque-service — usado tanto na margem por
  // produto quanto no lucro por dia, sem nenhum dos dois serviços precisar
  // conhecer o schema do outro.
  const custoPorProduto = useMemo(() => {
    if (!catalogo.dados) return new Map();
    return new Map(catalogo.dados.produtos.map((produto) => [produto.id, Number(produto.preco_custo)]));
  }, [catalogo.dados]);

  /** Cruza vendas com custo, calcula margem e classifica em A, B e C. */
  const linhas = useMemo(() => {
    if (!analise.dados || !catalogo.dados) return [];

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
  }, [analise.dados, catalogo.dados, custoPorProduto]);

  /**
   * Lucro por dia: cruza o faturamento por dia com o custo dos itens vendidos
   * naquele dia (por_dia_produto), do mesmo jeito que a margem por produto
   * cruza o período inteiro.
   */
  const vendasPorDia = useMemo(() => {
    if (!analise.dados || !catalogo.dados) return [];

    const custoPorDia = new Map();
    for (const item of analise.dados.por_dia_produto ?? []) {
      const custoUnitario = custoPorProduto.get(item.produto_id) ?? 0;
      const custoAcumulado = custoPorDia.get(item.dia) ?? 0;
      custoPorDia.set(item.dia, custoAcumulado + custoUnitario * item.unidades);
    }

    return analise.dados.por_dia.map((dia) => {
      const valor = Number(dia.valor);
      const custo = custoPorDia.get(dia.dia) ?? 0;
      return { ...dia, valor, custo, lucro: valor - custo };
    });
  }, [analise.dados, catalogo.dados, custoPorProduto]);

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

  const maisVendidos = linhas.slice().sort((a, b) => b.unidades - a.unidades);

  // Indicadores da Visão geral que olham dia a dia, não só o total do período.
  const diasComVenda = vendasPorDia.length;
  const diasAbaixoMeta = vendasPorDia.filter((dia) => dia.valor < META_MINIMA_DIARIA).length;
  const melhorDia = vendasPorDia.reduce(
    (melhor, dia) => (!melhor || dia.valor > melhor.valor ? dia : melhor),
    null
  );
  const classeA = porClasseFaturamento.find((grupo) => grupo.classe === "A");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TituloPagina titulo="Relatórios" />

      <Card className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <CampoTexto
              aria-label="Do dia"
              type="date"
              className="w-40"
              value={periodo.de}
              max={periodo.ate}
              onChange={(evento) => definirPeriodo({ ...periodo, de: evento.target.value })}
            />
            <span className="text-corpo text-secundario">até</span>
            <CampoTexto
              aria-label="Até o dia"
              type="date"
              className="w-40"
              value={periodo.ate}
              min={periodo.de}
              max={hojeISO()}
              onChange={(evento) => definirPeriodo({ ...periodo, ate: evento.target.value })}
            />
            <div className="flex h-10 items-center gap-1 rounded-botao border border-borda p-1">
              {ATALHOS_PERIODO.map((atalho) => {
                const de = diasAtras(atalho.dias);
                const ativo = periodo.de === de && periodo.ate === hojeISO();
                return (
                  <button
                    key={atalho.rotulo}
                    type="button"
                    onClick={() => definirPeriodo({ de, ate: hojeISO() })}
                    className={[
                      "h-full rounded-botao px-3 text-rotulo transition-colors",
                      ativo ? "bg-primario text-white" : "text-secundario hover:bg-borda/60",
                    ].join(" ")}
                  >
                    {atalho.rotulo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </Card>

      {carregando ? <Carregando texto="Cruzando vendas e custos" /> : null}
      {falha ? <Aviso tom="erro">{falha.message}</Aviso> : null}

      {analise.dados && catalogo.dados ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex shrink-0 gap-1">
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

          <div className="min-h-0 flex-1 overflow-y-auto">
            {aba === "visao-geral" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <CardIndicador
                    compacto
                    rotulo="Faturamento no período"
                    valor={formatarMoeda(totais.valor)}
                    detalhe={`${formatarNumero(totais.vendas)} vendas finalizadas`}
                    icone={TrendingUp}
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
                    rotulo="Ticket médio"
                    valor={formatarMoeda(totais.ticket_medio)}
                    detalhe={`${formatarMoeda(totais.descontos)} de desconto concedido`}
                    icone={BarChart3}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Margem média"
                    valor={`${margemMedia.toFixed(1).replace(".", ",")}%`}
                    detalhe="sobre a receita do período"
                    icone={Percent}
                    tom={margemMedia >= 30 ? "sucesso" : margemMedia >= 15 ? "alerta" : "erro"}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Melhor dia do período"
                    valor={melhorDia ? formatarMoeda(melhorDia.valor) : "—"}
                    detalhe={melhorDia ? formatarData(melhorDia.dia) : "sem vendas no período"}
                    icone={Calendar}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Dias abaixo da meta"
                    valor={formatarNumero(diasAbaixoMeta)}
                    detalhe={`de ${formatarNumero(diasComVenda)} dia(s) com venda — meta ${formatarMoeda(META_MINIMA_DIARIA)}/dia`}
                    icone={AlertTriangle}
                    tom={diasAbaixoMeta > 0 ? "alerta" : "sucesso"}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Produtos vendidos"
                    valor={formatarNumero(linhas.length)}
                    detalhe={semCusto ? `${semCusto} sem custo cadastrado` : "todos com custo cadastrado"}
                    icone={Package}
                    tom={semCusto > 0 ? "alerta" : "marca"}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Concentração na Classe A"
                    valor={classeA ? `${classeA.participacao.toFixed(1).replace(".", ",")}%` : "—"}
                    detalhe={
                      classeA
                        ? `${formatarNumero(classeA.itens)} produto(s) geram a maior parte da receita`
                        : "sem dados no período"
                    }
                    icone={PieChart}
                  />
                </div>

                {semCusto ? (
                  <Aviso tom="alerta">
                    {semCusto} produto(s) vendido(s) estão sem preço de custo cadastrado — a margem
                    deles aparece como 100% até o custo ser informado.
                  </Aviso>
                ) : null}
              </div>
            ) : null}

            {aba === "vendas-do-dia" ? (
              <Card className="flex h-full flex-col">
                <CardCabecalho
                  titulo="Vendas do dia"
                  descricao={`Faturamento e lucro por dia, com a meta mínima diária (${formatarMoeda(META_MINIMA_DIARIA)}).`}
                  icone={TrendingUp}
                />
                <CardCorpo className="min-h-0 flex-1 overflow-y-auto">
                  {vendasPorDia.length ? (
                    <GraficoVendasPorDia dados={vendasPorDia} meta={META_MINIMA_DIARIA} />
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
              <Card className="flex h-full flex-col">
                <CardCabecalho
                  titulo="Mais vendidos"
                  descricao="Por unidades saídas no período."
                  icone={Trophy}
                />
                <div className="min-h-0 flex-1 overflow-y-auto">
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
                </div>
              </Card>
            ) : null}

            {aba === "curva-abc" ? (
              <Card className="flex h-full flex-col">
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
                <CardCorpo className="min-h-0 flex-1 space-y-4 overflow-y-auto">
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
              <Card className="flex h-full flex-col">
                <CardCabecalho
                  titulo="Margem por produto"
                  descricao="Receita, custo dos itens vendidos e participação na receita total."
                  icone={Percent}
                />
                {semCusto ? (
                  <div className="shrink-0 px-5 pt-4">
                    <Aviso tom="alerta">
                      {semCusto} produto(s) vendido(s) estão sem preço de custo cadastrado — a
                      margem deles aparece como 100% até o custo ser informado.
                    </Aviso>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto">
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
                        renderizar: (item) =>
                          `${item.participacao_pct.toFixed(1).replace(".", ",")}%`,
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
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
