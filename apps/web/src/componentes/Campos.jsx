import { useId } from "react";

/** Inputs do design system: radius 8px, label 12px/500, sem emoji. */

const BASE_CONTROLE =
  "w-full rounded-botao border border-borda bg-card px-3 text-corpo text-texto " +
  "placeholder:text-secundario focus-visible:foco-arkos disabled:bg-borda/40 disabled:text-secundario";

function Envolvente({ id, rotulo, erro, ajuda, children, className = "" }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {rotulo ? (
        <label htmlFor={id} className="text-rotulo text-secundario">
          {rotulo}
        </label>
      ) : null}
      {children}
      {erro ? (
        <span className="text-rotulo text-erro" role="alert">
          {erro}
        </span>
      ) : ajuda ? (
        <span className="text-rotulo text-secundario">{ajuda}</span>
      ) : null}
    </div>
  );
}

export function CampoTexto({ rotulo, erro, ajuda, className, ...resto }) {
  const id = useId();
  return (
    <Envolvente id={id} rotulo={rotulo} erro={erro} ajuda={ajuda} className={className}>
      <input
        id={id}
        className={`${BASE_CONTROLE} h-10 ${erro ? "border-erro" : ""}`}
        aria-invalid={erro ? "true" : undefined}
        {...resto}
      />
    </Envolvente>
  );
}

export function CampoSelect({ rotulo, erro, ajuda, opcoes = [], className, ...resto }) {
  const id = useId();
  return (
    <Envolvente id={id} rotulo={rotulo} erro={erro} ajuda={ajuda} className={className}>
      <select
        id={id}
        className={`${BASE_CONTROLE} h-10 ${erro ? "border-erro" : ""}`}
        aria-invalid={erro ? "true" : undefined}
        {...resto}
      >
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </Envolvente>
  );
}

export function CampoTextoLongo({ rotulo, erro, ajuda, className, linhas = 3, ...resto }) {
  const id = useId();
  return (
    <Envolvente id={id} rotulo={rotulo} erro={erro} ajuda={ajuda} className={className}>
      <textarea
        id={id}
        rows={linhas}
        className={`${BASE_CONTROLE} py-2 ${erro ? "border-erro" : ""}`}
        aria-invalid={erro ? "true" : undefined}
        {...resto}
      />
    </Envolvente>
  );
}
