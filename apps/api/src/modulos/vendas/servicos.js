import { ERROS } from "@arkos/shared-types";
import { env } from "../../env.js";

/**
 * Chamadas HTTP para os outros serviços. O vendas-service nunca lê o schema de
 * estoque/financeiro/fiscal direto (docs/ARQUITETURA.md) — pergunta pela API,
 * repassando o token do operador que está no PDV.
 */

const BASES = {
  estoque: env.ESTOQUE_URL,
  financeiro: env.FINANCEIRO_URL,
  fiscal: env.FISCAL_URL,
};

export class ErroServico extends Error {
  constructor(servico, status, corpo) {
    super(corpo?.mensagem || `Falha ao chamar ${servico} (HTTP ${status}).`);
    this.name = "ErroServico";
    this.servico = servico;
    this.status = status;
    this.codigo = corpo?.erro ?? ERROS.FALHA_INTEGRACAO;
    this.corpo = corpo ?? null;
  }
}

/**
 * @param {"estoque"|"financeiro"|"fiscal"} servico
 * @param {string} caminho
 * @param {{ metodo?: string, corpo?: unknown, token: string }} opcoes
 */
export async function chamarServico(servico, caminho, { metodo = "GET", corpo, token }) {
  let resposta;
  try {
    resposta = await fetch(`${BASES[servico]}${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: token } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch (erro) {
    // Serviço fora do ar: erro de integração, não erro de negócio.
    throw new ErroServico(servico, 503, {
      erro: ERROS.FALHA_INTEGRACAO,
      mensagem: `${servico}-service não respondeu (${erro.message}).`,
    });
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) throw new ErroServico(servico, resposta.status, dados);
  return dados;
}

export const estoque = {
  buscarProduto: (produtoId, token) =>
    chamarServico("estoque", `/produtos/${produtoId}`, { token }),

  darSaidaFefo: ({ produtoId, quantidade, motivo }, token) =>
    chamarServico("estoque", "/movimentacoes", {
      metodo: "POST",
      token,
      corpo: { produto_id: produtoId, tipo: "saida", quantidade, motivo },
    }),

  devolverLote: ({ produtoId, loteId, quantidade, motivo }, token) =>
    chamarServico("estoque", "/movimentacoes", {
      metodo: "POST",
      token,
      corpo: { produto_id: produtoId, lote_id: loteId, tipo: "devolucao", quantidade, motivo },
    }),
};

export const financeiro = {
  lancarNoCaixa: ({ valor, origem, descricao, vendaId }, token) =>
    chamarServico("financeiro", "/caixa/movimentacoes", {
      metodo: "POST",
      token,
      corpo: { tipo: "entrada", valor, origem, descricao, venda_id: vendaId },
    }),

  estornarNoCaixa: ({ valor, descricao, vendaId }, token) =>
    chamarServico("financeiro", "/caixa/movimentacoes", {
      metodo: "POST",
      token,
      corpo: { tipo: "saida", valor, origem: "venda", descricao, venda_id: vendaId },
    }),
};

export const fiscal = {
  emitirNota: ({ vendaId }, token) =>
    chamarServico("fiscal", "/notas-fiscais", {
      metodo: "POST",
      token,
      corpo: { venda_id: vendaId },
    }),

  registrarControlado: ({ vendaId, produtoId, receitaId }, token) =>
    chamarServico("fiscal", "/controlados-sngpc", {
      metodo: "POST",
      token,
      corpo: { venda_id: vendaId, produto_id: produtoId, receita_id: receitaId },
    }),
};
