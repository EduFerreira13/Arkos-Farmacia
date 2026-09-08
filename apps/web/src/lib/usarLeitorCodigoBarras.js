import { useEffect, useRef, useState } from "react";

/**
 * Leitor USB de código de barras comum é teclado (emulação HID): ele "digita"
 * cada caractere do código sozinho, muito mais rápido que gente de verdade
 * consegue, e fecha com Enter. Este hook escuta o teclado da janela inteira —
 * sem precisar de nenhum campo com foco — e só chama `aoLer(codigo)` quando a
 * sequência inteira, até o Enter, veio rápido demais pra ser digitação manual.
 *
 * Digitação normal (gente digitando com calma) nunca dispara: qualquer intervalo
 * maior que `limiteMs` entre duas teclas reinicia a captura. Pra testar sem o
 * leitor físico, digitar rápido de propósito é pouco confiável — use um campo
 * de teste à parte que chame `aoLer` direto no Enter, sem passar por este hook.
 *
 * @param {(codigo: string) => void} aoLer Chamado com o código completo.
 * @param {{ ativo?: boolean, limiteMs?: number, tamanhoMinimo?: number }} [opcoes]
 *   `ativo`: liga/desliga a escuta sem desmontar o hook (padrão: true).
 *   `limiteMs`: intervalo máximo entre teclas pra contar como leitor (padrão: 80).
 *   `tamanhoMinimo`: menor código aceito — evita Enter solto disparando leitura
 *   vazia (padrão: 3).
 * @returns {{ escutando: boolean }}
 */
export function usarLeitorCodigoBarras(aoLer, opcoes = {}) {
  const { ativo = true, limiteMs = 80, tamanhoMinimo = 3 } = opcoes;

  const buffer = useRef("");
  const ultimoCaractereEm = useRef(0);
  const emSequenciaRapida = useRef(false);
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;

  const [escutando, definirEscutando] = useState(ativo);
  useEffect(() => definirEscutando(ativo), [ativo]);

  useEffect(() => {
    if (!ativo) return;

    function aoTeclar(evento) {
      // Atalho de teclado de verdade (Ctrl+C, Alt+Tab...) não é leitura de
      // código — nunca é isso que um leitor USB manda.
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

      if (evento.key === "Enter") {
        const codigo = buffer.current;
        const foiRapido = emSequenciaRapida.current;
        buffer.current = "";
        emSequenciaRapida.current = false;

        if (foiRapido && codigo.length >= tamanhoMinimo) {
          // Suprime o Enter: sem isso, ele ainda submeteria um formulário ou
          // pularia de campo em campo se algo tiver foco.
          evento.preventDefault();
          aoLerRef.current(codigo);
        }
        return;
      }

      // Ignora teclas que não são um caractere (Shift, Tab, setas...); não
      // conta como intervalo pra não estragar o cronômetro da sequência.
      if (evento.key.length !== 1) return;

      const agora = performance.now();
      const intervalo = agora - ultimoCaractereEm.current;
      ultimoCaractereEm.current = agora;

      if (intervalo <= limiteMs && buffer.current.length > 0) {
        buffer.current += evento.key;
        emSequenciaRapida.current = true;
        // A partir da 2ª tecla rápida já dá pra apostar que é o leitor —
        // suprime pra não vazar o código dentro de um campo de texto focado.
        evento.preventDefault();
      } else {
        // Muito lento pra ser leitor, ou é a 1ª tecla de uma sequência nova.
        buffer.current = evento.key;
        emSequenciaRapida.current = false;
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ativo, limiteMs, tamanhoMinimo]);

  return { escutando };
}
