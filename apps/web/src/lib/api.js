/**
 * Cliente HTTP único do front. O backend é um processo só (`apps/api`), mas
 * cada módulo continua no seu prefixo (o proxy do Vite manda tudo para o
 * mesmo host:porta — ver vite.config.js e docs/API-CONTRATOS.md). Manter os
 * prefixos aqui evita reescrever as chamadas dentro das telas.
 */

const PREFIXOS = {
  auth: "/api/auth",
  estoque: "/api/estoque",
  vendas: "/api/vendas",
  financeiro: "/api/financeiro",
  fiscal: "/api/fiscal",
  compras: "/api/compras",
};

export const CHAVE_TOKEN = "arkos.token";
/** Token do administrador guardado enquanto ele simula outro perfil. */
export const CHAVE_TOKEN_ORIGINAL = "arkos.token.original";

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

/**
 * Baixa um arquivo gerado pelo serviço (relatório em planilha). Precisa passar
 * pelo fetch, e não por um link direto, porque a rota exige o token.
 *
 * @param {keyof typeof PREFIXOS} servico
 * @param {string} caminho
 * @param {string} nomePadrao usado se o serviço não mandar Content-Disposition
 */
export async function baixarArquivo(servico, caminho, nomePadrao) {
  const token = lerToken();
  const resposta = await fetch(`${PREFIXOS[servico]}${caminho}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }
    throw new ErroApi(resposta.status, dados);
  }

  const cabecalho = resposta.headers.get("Content-Disposition") ?? "";
  const encontrado = /filename="?([^"]+)"?/.exec(cabecalho);
  const nome = encontrado?.[1] ?? nomePadrao;

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return nome;
}

const metodosDe = (servico) => ({
  get: (caminho) => chamar(servico, caminho),
  post: (caminho, corpo, extras) => chamar(servico, caminho, { metodo: "POST", corpo, ...extras }),
  patch: (caminho, corpo) => chamar(servico, caminho, { metodo: "PATCH", corpo }),
  del: (caminho) => chamar(servico, caminho, { metodo: "DELETE" }),
});

export const api = {
  auth: metodosDe("auth"),
  estoque: metodosDe("estoque"),
  vendas: metodosDe("vendas"),
  financeiro: metodosDe("financeiro"),
  fiscal: metodosDe("fiscal"),
  compras: metodosDe("compras"),
};
