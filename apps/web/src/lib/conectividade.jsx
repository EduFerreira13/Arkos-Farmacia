import { createContext, useContext, useEffect, useState } from "react";
import { INTERVALO_PING_MS, avaliarConectividade, pingSaudavel } from "./conectividadeNucleo.js";

/**
 * Detecta queda de conexão para o PDV offline (Fase 5 é quem decide o que
 * fazer com esse estado — este módulo só expõe `online`).
 *
 * Não confia só em `navigator.onLine` (impreciso: fica `true` mesmo com o
 * Wi-Fi ligado numa rede sem saída para a internet) — faz ping periódico em
 * `GET /api/health`, que já confere a conexão do próprio backend com o
 * Postgres (`apps/api/src/app.js`), não só se o processo respondeu. A lógica
 * pura (histerese, o próprio ping) mora em `conectividadeNucleo.js`, testada
 * sem React nem DOM.
 */

export { avaliarConectividade, pingSaudavel, INTERVALO_PING_MS };

const ConectividadeContexto = createContext(null);

/**
 * @param {{ children: import("react").ReactNode, intervaloMs?: number }} props
 */
export function ProvedorConectividade({ children, intervaloMs = INTERVALO_PING_MS }) {
  const [estado, definirEstado] = useState({
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    falhasSeguidas: 0,
  });

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      const sucesso = await pingSaudavel();
      if (cancelado) return;
      definirEstado((atual) => avaliarConectividade(atual, sucesso));
    }

    verificar();
    const intervalo = setInterval(verificar, intervaloMs);

    // O evento "online" do navegador não é a fonte de verdade (por isso o
    // ping periódico existe), mas é um bom gatilho para checar na hora, sem
    // esperar o próximo tique do intervalo.
    const aoVoltarBrowser = () => verificar();
    window.addEventListener("online", aoVoltarBrowser);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
      window.removeEventListener("online", aoVoltarBrowser);
    };
  }, [intervaloMs]);

  return (
    <ConectividadeContexto.Provider value={estado}>{children}</ConectividadeContexto.Provider>
  );
}

export function usarConectividade() {
  const contexto = useContext(ConectividadeContexto);
  if (!contexto) {
    throw new Error("usarConectividade precisa estar dentro de ProvedorConectividade.");
  }
  return contexto;
}
