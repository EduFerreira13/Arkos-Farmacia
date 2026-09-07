import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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

/** Senha com botão para revelar o texto — o padrão do olho, sem reinventar. */
export function CampoSenha({ rotulo, erro, ajuda, className, ...resto }) {
  const id = useId();
  const [revelada, definirRevelada] = useState(false);
  const Icone = revelada ? EyeOff : Eye;

  return (
    <Envolvente id={id} rotulo={rotulo} erro={erro} ajuda={ajuda} className={className}>
      <div className="relative">
        <input
          id={id}
          type={revelada ? "text" : "password"}
          className={`${BASE_CONTROLE} h-10 pr-10 ${erro ? "border-erro" : ""}`}
          aria-invalid={erro ? "true" : undefined}
          {...resto}
        />
        <button
          type="button"
          onClick={() => definirRevelada((atual) => !atual)}
          aria-label={revelada ? "Esconder senha" : "Mostrar senha"}
          title={revelada ? "Esconder senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-secundario hover:text-texto focus-visible:foco-arkos"
        >
          <Icone size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </Envolvente>
  );
}

/**
 * Caixa de seleção com o rótulo ao lado — a única do design system em que o
 * texto vem depois do controle, porque é assim que se lê uma afirmação.
 */
export function CampoCheckbox({ rotulo, ajuda, className = "", ...resto }) {
  const id = useId();
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-borda text-primario focus-visible:foco-arkos"
        {...resto}
      />
      <label htmlFor={id} className="text-corpo text-texto">
        {rotulo}
        {ajuda ? <span className="block text-rotulo text-secundario">{ajuda}</span> : null}
      </label>
    </div>
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
