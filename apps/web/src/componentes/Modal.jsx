import { useEffect } from "react";
import { X } from "lucide-react";
import { BotaoIcone } from "./Botao.jsx";

/**
 * Modal do design system: radius 12px, sombra sutil, fecha no Esc e no clique
 * de fundo. Nunca passa da altura da janela — cabeçalho e rodapé ficam fixos e
 * só o conteúdo rola.
 */
export function Modal({ aberto, titulo, descricao, aoFechar, children, rodape, largura = "max-w-lg" }) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") aoFechar?.();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  // Enquanto o modal está aberto, a página atrás não rola.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

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
        className={`flex max-h-[calc(100vh-3rem)] w-full ${largura} flex-col rounded-card border border-borda bg-card shadow-flutuante`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div>
            <h2 className="text-h3 text-texto">{titulo}</h2>
            {descricao ? <p className="mt-0.5 text-rotulo text-secundario">{descricao}</p> : null}
          </div>
          <BotaoIcone icone={X} rotulo="Fechar" onClick={aoFechar} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {rodape ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-borda px-5 py-4">
            {rodape}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
