/**
 * Gráficos do Arkos, sobre Recharts, usando as cores e tokens do design
 * system (docs/REGRAS-VISUAIS.md) em vez da paleta padrão da lib.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  const [{ value, payload: item }] = payload;
  return (
    <CartaoTooltip>
      <p className="text-rotulo text-secundario">{formatarData(label)}</p>
      <p className="text-corpo font-semibold text-texto">{formatarMoeda(value)}</p>
      <p className="text-rotulo text-secundario">{item.vendas} venda(s)</p>
    </CartaoTooltip>
  );
}

/** Área com o valor vendido por dia no período. */
export function GraficoVendasPorDia({ dados }) {
  return (
    <div className="font-sans">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
          <Area
            type="monotone"
            dataKey="valor"
            stroke="var(--cor-info)"
            strokeWidth={2}
            fill="url(#areaVendasPorDia)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const CORES_CLASSE = {
  A: "var(--cor-sucesso)",
  B: "var(--cor-info)",
  C: "var(--cor-texto-secundario)",
};

function TooltipCurvaAbc({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <CartaoTooltip>
      <p className="text-rotulo text-secundario">Classe {item.classe}</p>
      <p className="text-corpo font-semibold text-texto">{formatarMoeda(item.receita)}</p>
      <p className="text-rotulo text-secundario">
        {item.itens} produto(s) — {item.participacao.toFixed(1).replace(".", ",")}% da receita
      </p>
    </CartaoTooltip>
  );
}

/** Barras com a receita de cada classe da curva ABC. */
export function GraficoCurvaAbc({ dados }) {
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
            tickFormatter={(valor) => formatarMoeda(valor)}
            tick={{ fill: "var(--cor-texto-secundario)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<TooltipCurvaAbc />} cursor={{ fill: "var(--cor-borda)", opacity: 0.4 }} />
          <Bar dataKey="receita" radius={[6, 6, 0, 0]} maxBarSize={72}>
            {dados.map((item) => (
              <Cell key={item.classe} fill={CORES_CLASSE[item.classe]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
