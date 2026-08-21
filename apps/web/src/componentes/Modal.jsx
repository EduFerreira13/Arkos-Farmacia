import { useEffect } from "react";
import { X } from "lucide-react";
import { BotaoIcone } from "./Botao.jsx";

/** Modal simples: radius 12px, sombra sutil, fecha no Esc e no clique de fundo. */
export function Modal({ aberto, titulo, descricao, aoFechar, children, rodape, largura = "max-w-lg" }) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") aoFechar?.();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      onClick={aoFechar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(evento) => evento.stopPropagation()}
        className={`w-full ${largura} rounded-card border border-borda bg-card shadow-flutuante`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div>
            <h2 className="text-h3 text-texto">{titulo}</h2>
            {descricao ? <p className="mt-0.5 text-rotulo text-secundario">{descricao}</p> : null}
          </div>
          <BotaoIcone icone={X} rotulo="Fechar" onClick={aoFechar} />
        </header>
        <div className="px-5 py-4">{children}</div>
        {rodape ? (
          <footer className="flex items-center justify-end gap-2 border-t border-borda px-5 py-4">
            {rodape}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
