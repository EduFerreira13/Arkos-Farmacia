import { TrendingDown, TrendingUp } from "lucide-react";
import { formatarPorcentagem } from "../lib/formato.js";

/**
 * Card de indicador do dashboard (docs/REGRAS-VISUAIS.md §5): número grande,
 * label pequena, ícone Lucide e variação colorida. Sem barra lateral colorida —
 * o destaque vem do ícone e da tipografia.
 */
export function CardIndicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  variacao,
  tom = "marca",
  compacto = false,
}) {
  const positiva = variacao !== null && variacao !== undefined && variacao >= 0;
  const corIcone = {
    marca: "text-primario",
    alerta: "text-alerta",
    erro: "text-erro",
    sucesso: "text-sucesso",
  }[tom];

  return (
    <section
      className={`rounded-card border border-borda bg-card shadow-card ${
        compacto ? "px-4 py-3" : "p-5"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className="text-rotulo uppercase tracking-wide text-secundario">{rotulo}</p>
        {Icone ? (
          <Icone size={compacto ? 16 : 20} strokeWidth={2} aria-hidden="true" className={corIcone} />
        ) : null}
      </div>

      <p className={`text-texto ${compacto ? "mt-1 text-h2" : "mt-3 text-indicador"}`}>{valor}</p>

      <div className={`flex items-center gap-2 ${compacto ? "mt-0.5" : "mt-2"}`}>
        {variacao === null || variacao === undefined ? (
          <span className="text-rotulo text-secundario">{detalhe}</span>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1 text-rotulo ${
                positiva ? "text-sucesso" : "text-erro"
              }`}
            >
              {positiva ? (
                <TrendingUp size={14} aria-hidden="true" />
              ) : (
                <TrendingDown size={14} aria-hidden="true" />
              )}
              {formatarPorcentagem(variacao)}
            </span>
            <span className="text-rotulo text-secundario">{detalhe}</span>
          </>
        )}
      </div>
    </section>
  );
}
