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

/**
 * @param {keyof typeof PREFIXOS} servico
 * @param {string} caminho
 * @param {{ metodo?: string, corpo?: unknown }} [opcoes]
 */
export async function chamar(servico, caminho, opcoes = {}) {
  const { metodo = "GET", corpo } = opcoes;
  const prefixo = PREFIXOS[servico];
  if (!prefixo) throw new Error(`Serviço desconhecido: ${servico}`);

  const cabecalhos = {};
  if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";

  // Token viaja num cookie httpOnly (setado pelo backend no login) — o
  // navegador manda sozinho, mas só em requisição same-origin ou com
  // `credentials: "include"` em cross-origin.
  const resposta = await fetch(`${prefixo}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    credentials: "include",
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    if (resposta.status === 401) {
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
  const resposta = await fetch(`${PREFIXOS[servico]}${caminho}`, {
    credentials: "include",
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
  post: (caminho, corpo) => chamar(servico, caminho, { metodo: "POST", corpo }),
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
