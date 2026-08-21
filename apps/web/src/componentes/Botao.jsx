/**
 * Botão do design system (docs/REGRAS-VISUAIS.md §5): radius 8px, sem emoji,
 * ícone opcional do set Lucide.
 */

const VARIANTES = {
  primario:
    "bg-primario text-white hover:bg-medio shadow-card disabled:bg-secundario disabled:shadow-none",
  secundario:
    "border border-primario text-primario bg-card hover:bg-primario/10 disabled:border-borda disabled:text-secundario",
  destrutivo: "bg-erro text-white hover:opacity-90 disabled:bg-secundario",
  fantasma: "text-texto hover:bg-borda/60 disabled:text-secundario",
};

const TAMANHOS = {
  medio: "h-10 px-4 text-corpo",
  pequeno: "h-8 px-3 text-rotulo",
  grande: "h-12 px-6 text-corpo-espacoso",
};

export function Botao({
  variante = "primario",
  tamanho = "medio",
  icone: Icone,
  children,
  className = "",
  type = "button",
  ...resto
}) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-botao font-medium transition-colors",
        "focus-visible:foco-arkos disabled:cursor-not-allowed",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      ].join(" ")}
      {...resto}
    >
      {Icone ? <Icone size={16} strokeWidth={2} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** Botão só de ícone — precisa de rótulo acessível. */
export function BotaoIcone({ icone: Icone, rotulo, className = "", ...resto }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-botao text-texto",
        "transition-colors hover:bg-borda/60 focus-visible:foco-arkos",
        className,
      ].join(" ")}
      {...resto}
    >
      <Icone size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
