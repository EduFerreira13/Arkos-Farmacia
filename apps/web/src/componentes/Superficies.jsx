/**
 * Cards, avisos e badges. Regra do design system: nenhuma barra lateral
 * decorativa — destaque vem de fundo, ícone ou tipografia (§5).
 */

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function Card({ children, className = "", ...resto }) {
  return (
    <section
      className={`rounded-card border border-borda bg-card shadow-card ${className}`}
      {...resto}
    >
      {children}
    </section>
  );
}

export function CardCabecalho({ titulo, descricao, acoes, icone: Icone }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
      <div className="flex items-start gap-3">
        {Icone ? (
          <span className="mt-0.5 text-primario">
            <Icone size={20} strokeWidth={2} aria-hidden="true" />
          </span>
        ) : null}
        <div>
          <h2 className="text-h3 text-texto">{titulo}</h2>
          {descricao ? <p className="mt-0.5 text-rotulo text-secundario">{descricao}</p> : null}
        </div>
      </div>
      {acoes ? <div className="flex items-center gap-2">{acoes}</div> : null}
    </header>
  );
}

export function CardCorpo({ children, className = "" }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

const TONS_BADGE = {
  neutro: "bg-borda/70 text-texto",
  sucesso: "bg-sucesso/15 text-sucesso",
  alerta: "bg-alerta/20 text-alerta",
  erro: "bg-erro/15 text-erro",
  info: "bg-info/15 text-info",
  marca: "bg-ciano/15 text-ciano",
};

export function Badge({ tom = "neutro", children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-rotulo ${TONS_BADGE[tom]} ${className}`}
    >
      {children}
    </span>
  );
}

const TONS_AVISO = {
  sucesso: { classe: "bg-sucesso/12 text-sucesso", icone: CheckCircle2 },
  alerta: { classe: "bg-alerta/15 text-alerta", icone: AlertTriangle },
  erro: { classe: "bg-erro/12 text-erro", icone: XCircle },
  info: { classe: "bg-info/12 text-info", icone: Info },
};

export function Aviso({ tom = "info", titulo, children, className = "" }) {
  const { classe, icone: Icone } = TONS_AVISO[tom] ?? TONS_AVISO.info;
  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-card px-4 py-3 ${classe} ${className}`}
    >
      <Icone size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="text-corpo">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        {children ? <div className={titulo ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EstadoVazio({ titulo, descricao, icone: Icone, acao }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icone ? (
        <span className="text-secundario">
          <Icone size={28} strokeWidth={1.75} aria-hidden="true" />
        </span>
      ) : null}
      <div>
        <p className="text-h3 text-texto">{titulo}</p>
        {descricao ? <p className="mt-1 text-corpo text-secundario">{descricao}</p> : null}
      </div>
      {acao}
    </div>
  );
}

export function Carregando({ texto = "Carregando" }) {
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-12 text-secundario">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-borda border-t-primario"
        aria-hidden="true"
      />
      <span className="text-corpo">{texto}</span>
    </div>
  );
}

export function TituloPagina({ titulo, descricao, acoes }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-h1 text-texto">{titulo}</h1>
        {descricao ? <p className="mt-1 text-corpo text-secundario">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
