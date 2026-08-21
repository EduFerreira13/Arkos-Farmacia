/**
 * Cliente HTTP único do front. Cada serviço tem seu prefixo (o proxy do Vite
 * resolve a porta — ver vite.config.js e docs/API-CONTRATOS.md).
 */

const PREFIXOS = {
  auth: "/api/auth",
  estoque: "/api/estoque",
  vendas: "/api/vendas",
  financeiro: "/api/financeiro",
  fiscal: "/api/fiscal",
};

export const CHAVE_TOKEN = "arkos.token";

export class ErroApi extends Error {
  /**
   * @param {number} status
   * @param {{ erro?: string, mensagem?: string }} corpo
   */
  constructor(status, corpo) {
    super(corpo?.mensagem || corpo?.erro || `Falha na requisição (${status}).`);
    this.name = "ErroApi";
    this.status = status;
    this.codigo = corpo?.erro ?? null;
    this.corpo = corpo ?? null;
  }
}

export function lerToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function gravarToken(token) {
  if (token) localStorage.setItem(CHAVE_TOKEN, token);
  else localStorage.removeItem(CHAVE_TOKEN);
}

/**
 * @param {keyof typeof PREFIXOS} servico
 * @param {string} caminho
 * @param {{ metodo?: string, corpo?: unknown, semAuth?: boolean }} [opcoes]
 */
export async function chamar(servico, caminho, opcoes = {}) {
  const { metodo = "GET", corpo, semAuth = false } = opcoes;
  const prefixo = PREFIXOS[servico];
  if (!prefixo) throw new Error(`Serviço desconhecido: ${servico}`);

  const cabecalhos = {};
  if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";

  const token = semAuth ? null : lerToken();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  const resposta = await fetch(`${prefixo}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    if (resposta.status === 401) {
      gravarToken(null);
      window.dispatchEvent(new CustomEvent("arkos:sessao-expirada"));
    }
    throw new ErroApi(resposta.status, dados);
  }

  return dados;
}

const metodosDe = (servico) => ({
  get: (caminho) => chamar(servico, caminho),
  post: (caminho, corpo, extras) => chamar(servico, caminho, { metodo: "POST", corpo, ...extras }),
  patch: (caminho, corpo) => chamar(servico, caminho, { metodo: "PATCH", corpo }),
});

export const api = {
  auth: metodosDe("auth"),
  estoque: metodosDe("estoque"),
  vendas: metodosDe("vendas"),
  financeiro: metodosDe("financeiro"),
  fiscal: metodosDe("fiscal"),
};
