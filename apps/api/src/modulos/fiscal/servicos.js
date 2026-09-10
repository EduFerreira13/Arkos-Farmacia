import { ERROS } from "@arkos/shared-types";
import { env } from "../../env.js";

/**
 * O fiscal-service não lê os schemas de vendas/estoque direto: para montar a
 * nota, busca a venda completa e o dado fiscal do produto (NCM/CFOP) pela API
 * de cada um, exatamente como vendas-service faz com estoque/financeiro
 * (docs/ARQUITETURA.md) — mesmo estando hoje no mesmo processo.
 */

export class ErroServico extends Error {
  constructor(servico, status, corpo) {
    super(corpo?.mensagem || `Falha ao chamar ${servico} (HTTP ${status}).`);
    this.name = "ErroServico";
    this.servico = servico;
    this.status = status;
    this.codigo = corpo?.erro ?? ERROS.FALHA_INTEGRACAO;
  }
}

async function chamar(servico, url, token) {
  let resposta;
  try {
    resposta = await fetch(url, { headers: token ? { Authorization: token } : {} });
  } catch (erro) {
    throw new ErroServico(servico, 503, {
      mensagem: `${servico}-service não respondeu (${erro.message}).`,
    });
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new ErroServico(servico, resposta.status, dados);
  return dados;
}

export async function buscarVendaParaNota(vendaId, token) {
  const dados = await chamar("vendas", `${env.VENDAS_URL}/vendas/${vendaId}`, token);
  return dados?.venda ?? null;
}

export async function buscarProdutoParaNota(produtoId, token) {
  const dados = await chamar("estoque", `${env.ESTOQUE_URL}/produtos/${produtoId}`, token);
  return dados?.produto ?? null;
}
