import { ERROS } from "@arkos/shared-types";
import { env } from "./env.js";

/**
 * O financeiro não lê o schema de vendas: o resumo do dia vem pela API do
 * vendas-service (docs/ARQUITETURA.md e docs/API-CONTRATOS.md).
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

async function chamar(servico, base, caminho, token) {
  let resposta;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      headers: token ? { Authorization: token } : {},
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

export const vendas = {
  resumoDoDia: (token) => chamar("vendas", env.VENDAS_URL, "/vendas/resumo/hoje", token),
};
