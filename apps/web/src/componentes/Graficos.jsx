/**
 * Gráficos do Arkos, sobre Recharts, usando as cores e tokens do design
 * system (docs/REGRAS-VISUAIS.md) em vez da paleta padrão da lib.
 */

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarData, formatarMoeda } from "../lib/formato.js";

function CartaoTooltip({ children }) {
  return (
    <div className="rounded-card border border-borda bg-card px-3 py-2 shadow-flutuante">
      {children}
    </div>
  );
}

function TooltipVendasPorDia({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <CartaoTooltip>
      <p className="text-rotulo text-secundario">{formatarData(label)}</p>
      <p className="text-corpo font-semibold text-texto">
        <span style={{ color: "var(--cor-info)" }}>{formatarMoeda(item.valor)}</span> faturados
      </p>
      <p className="text-corpo font-semibold" style={{ color: "var(--cor-sucesso)" }}>
        {formatarMoeda(item.lucro)} de lucro
      </p>
      <p className="text-rotulo text-secundario">{item.vendas} venda(s)</p>
    </CartaoTooltip>
  );
}

const LEGENDA_VENDAS_POR_DIA = { fontSize: 12, color: "var(--cor-texto-secundario)" };

/**
 * Faturamento (área) e lucro (linha) por dia, com uma linha de referência
 * pontilhada para a meta mínima diária, quando informada.
 */
export function GraficoVendasPorDia({ dados, meta }) {
  // Recharts só põe Area/Line na legenda sozinho — a linha de referência da
  // meta entra manualmente pra aparecer junto.
  const legenda = [
    { value: "Faturamento", type: "square", color: "var(--cor-info)" },
    { value: "Lucro", type: "line", color: "var(--cor-sucesso)" },
  ];
  if (meta) legenda.push({ value: "Meta mínima", type: "line", color: "var(--cor-erro)" });

  return (
    <div className="font-sans">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="areaVendasPorDia" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cor-info)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--cor-info)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--cor-borda)" vertical={false} />
          <XAxis
            dataKey="dia"
            tickFormatter={(dia) => formatarData(dia).slice(0, 5)}
            tick={{ fill: "var(--cor-texto-secundario)", fontSize: 12 }}
            axisLine={{ stroke: "var(--cor-borda)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(valor) => formatarMoeda(valor)}
            tick={{ fill: "var(--cor-texto-secundario)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<TooltipVendasPorDia />} cursor={{ stroke: "var(--cor-borda)" }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={32}
            payload={legenda}
            wrapperStyle={LEGENDA_VENDAS_POR_DIA}
          />
          <Area
            type="monotone"
            dataKey="valor"
            name="Faturamento"
            stroke="var(--cor-info)"
            strokeWidth={2}
            fill="url(#areaVendasPorDia)"
          />
          <Line
            type="monotone"
            dataKey="lucro"
            name="Lucro"
            stroke="var(--cor-sucesso)"
            strokeWidth={2}
            dot={false}
          />
          {meta ? (
            <ReferenceLine
              y={meta}
              stroke="var(--cor-erro)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              ifOverflow="extendDomain"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const CORES_CLASSE = {
  A: "var(--cor-sucesso)",
  B: "var(--cor-info)",
  C: "var(--cor-texto-secundario)",
};

function TooltipCurvaAbc({ active, payload, chave, formatarValor }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <CartaoTooltip>
      <p className="text-rotulo text-secundario">Classe {item.classe}</p>
      <p className="text-corpo font-semibold text-texto">{formatarValor(item[chave])}</p>
      <p className="text-rotulo text-secundario">
        {item.itens} produto(s) — {item.participacao.toFixed(1).replace(".", ",")}% do total
      </p>
    </CartaoTooltip>
  );
}

/**
 * Barras com o valor de cada classe da curva ABC — `chave` diz qual campo de
 * `dados` mostrar (ex: "receita" ou "vendas") e `formatarValor` como exibi-lo.
 */
export function GraficoCurvaAbc({ dados, chave, formatarValor }) {
  return (
    <div className="font-sans">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--cor-borda)" vertical={false} />
          <XAxis
            dataKey="classe"
            tickFormatter={(classe) => `Classe ${classe}`}
            tick={{ fill: "var(--cor-texto-secundario)", fontSize: 12 }}
            axisLine={{ stroke: "var(--cor-borda)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatarValor}
            tick={{ fill: "var(--cor-texto-secundario)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            content={<TooltipCurvaAbc chave={chave} formatarValor={formatarValor} />}
            cursor={{ fill: "var(--cor-borda)", opacity: 0.4 }}
          />
          <Bar dataKey={chave} radius={[6, 6, 0, 0]} maxBarSize={72}>
            {dados.map((item) => (
              <Cell key={item.classe} fill={CORES_CLASSE[item.classe]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
