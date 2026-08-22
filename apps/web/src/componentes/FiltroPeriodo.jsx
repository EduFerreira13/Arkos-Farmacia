import { CampoTexto } from "./Campos.jsx";
import { hojeISO } from "../lib/formato.js";

/** Atalhos de período usados nas telas de histórico e relatório. */
export const ATALHOS_PERIODO = [
  { rotulo: "Hoje", dias: 0 },
  { rotulo: "7 dias", dias: 6 },
  { rotulo: "30 dias", dias: 29 },
  { rotulo: "90 dias", dias: 89 },
];

export function diasAtras(dias) {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Filtro de período com atalhos. `periodo` é `{ de, ate }` e `aoMudar` recebe o
 * novo par — quem usa decide quando refazer a consulta.
 */
export function FiltroPeriodo({ periodo, aoMudar, className = "" }) {
  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <CampoTexto
        rotulo="Do dia"
        type="date"
        className="w-40"
        value={periodo.de}
        max={periodo.ate}
        onChange={(evento) => aoMudar({ ...periodo, de: evento.target.value })}
      />
      <CampoTexto
        rotulo="Até o dia"
        type="date"
        className="w-40"
        value={periodo.ate}
        min={periodo.de}
        max={hojeISO()}
        onChange={(evento) => aoMudar({ ...periodo, ate: evento.target.value })}
      />
      <div className="flex items-center gap-1 rounded-botao border border-borda p-1">
        {ATALHOS_PERIODO.map((atalho) => {
          const de = diasAtras(atalho.dias);
          const ativo = periodo.de === de && periodo.ate === hojeISO();
          return (
            <button
              key={atalho.rotulo}
              type="button"
              onClick={() => aoMudar({ de, ate: hojeISO() })}
              className={[
                "rounded-botao px-3 py-1 text-rotulo transition-colors",
                ativo ? "bg-primario text-white" : "text-secundario hover:bg-borda/60",
              ].join(" ")}
            >
              {atalho.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
