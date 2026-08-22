import { ERROS } from "@arkos/shared-types";
import { env } from "./env.js";

/**
 * Compras conversa com estoque (produtos, fornecedores e entrada de lote) e com
 * financeiro (conta a pagar do recebimento) sempre por HTTP, repassando o token
 * de quem está operando (docs/ARQUITETURA.md).
 */

const BASES = { estoque: env.ESTOQUE_URL, financeiro: env.FINANCEIRO_URL };

export class ErroServico extends Error {
  constructor(servico, status, corpo) {
    super(corpo?.mensagem || `Falha ao chamar ${servico} (HTTP ${status}).`);
    this.name = "ErroServico";
    this.servico = servico;
    this.status = status;
    this.codigo = corpo?.erro ?? ERROS.FALHA_INTEGRACAO;
  }
}

async function chamar(servico, caminho, { metodo = "GET", corpo, token } = {}) {
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
    throw new ErroServico(servico, 503, {
      mensagem: `${servico}-service não respondeu (${erro.message}).`,
    });
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) throw new ErroServico(servico, resposta.status, dados);
  return dados;
}

export const estoque = {
  buscarProduto: (produtoId, token) => chamar("estoque", `/produtos/${produtoId}`, { token }),

  listarFornecedores: (token) => chamar("estoque", "/fornecedores", { token }),

  estoqueBaixo: (token) => chamar("estoque", "/alertas/estoque-baixo", { token }),

  listarProdutos: (token) => chamar("estoque", "/produtos", { token }),

  darEntradaLote: ({ produtoId, numeroLote, quantidade, dataValidade, motivo }, token) =>
    chamar("estoque", "/lotes", {
      metodo: "POST",
      token,
      corpo: {
        produto_id: produtoId,
        numero_lote: numeroLote,
        quantidade,
        data_validade: dataValidade,
        motivo,
      },
    }),
};

export const financeiro = {
  criarContaPagar: ({ fornecedorId, descricao, valor, vencimento }, token) =>
    chamar("financeiro", "/contas-pagar", {
      metodo: "POST",
      token,
      corpo: { fornecedor_id: fornecedorId, descricao, valor, vencimento },
    }),
};
