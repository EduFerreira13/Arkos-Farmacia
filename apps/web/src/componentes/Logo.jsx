/**
 * Marca do Arkos: montanha estilizada em degradê azul → ciano e wordmark sem
 * serifa (docs/REGRAS-VISUAIS.md §1). Versão vetorial definitiva do logo ainda
 * é pendência — ver docs/PENDENCIAS.md.
 */

export function Simbolo({ tamanho = 32, className = "" }) {
  const idGradiente = `gradiente-arkos-${tamanho}`;
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Arkos"
      className={className}
    >
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="32" x2="32" y2="0">
          <stop offset="0%" stopColor="#152A54" />
          <stop offset="50%" stopColor="#1E4E9C" />
          <stop offset="100%" stopColor="#20B8C4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${idGradiente})`} />
      <path d="M6 23.5 L15 9 L20 17 L22.5 13.5 L26 23.5 Z" fill="#FFFFFF" opacity="0.95" />
    </svg>
  );
}

export function Logo({ tamanho = 32, mostrarNome = true, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Simbolo tamanho={tamanho} />
      {mostrarNome ? (
        <span className="text-h3 font-bold tracking-tight text-marinho dark:text-white">Arkos</span>
      ) : null}
    </div>
  );
}
