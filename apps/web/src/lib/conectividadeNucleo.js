/**
 * Parte pura da detecção de conectividade — sem JSX, sem `window`, só lógica
 * — para poder rodar em `node --test` sem transformar nada (o Provider React
 * fica em `conectividade.jsx`, que importa daqui).
 */

export const INTERVALO_PING_MS = 15_000;
export const TIMEOUT_PING_MS = 4_000;

/** Falhas seguidas para declarar offline — 1 sucesso já basta para declarar online. */
const FALHAS_PARA_OFFLINE = 2;

/**
 * Máquina de estado da histerese: evita alternar o modo do PDV por causa de
 * uma falha de rede isolada (um pico de latência, um timeout raro).
 * @param {{ online: boolean, falhasSeguidas: number }} estado
 * @param {boolean} sucesso
 */
export function avaliarConectividade(estado, sucesso) {
  if (sucesso) return { online: true, falhasSeguidas: 0 };

  const falhasSeguidas = estado.falhasSeguidas + 1;
  return { online: estado.online ? falhasSeguidas < FALHAS_PARA_OFFLINE : false, falhasSeguidas };
}

/**
 * Um ping = online só com HTTP 200 **e** `banco: "ok"` no corpo — health
 * respondendo com o banco fora do ar não conta (é justamente o Postgres que
 * a sincronização offline precisa). Nunca lança: qualquer falha vira `false`.
 */
export async function pingSaudavel({ timeoutMs = TIMEOUT_PING_MS } = {}) {
  const controle = new AbortController();
  const tempoLimite = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const resposta = await fetch("/api/health", { signal: controle.signal });
    if (!resposta.ok) return false;
    const dados = await resposta.json();
    return dados?.banco === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(tempoLimite);
  }
}
