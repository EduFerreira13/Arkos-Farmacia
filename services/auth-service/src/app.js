import Fastify from "fastify";
import { ERROS } from "@arkos/shared-types";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { consultar } from "./db.js";
import { registrarRotas } from "./rotas.js";

/**
 * Erro de dado do Postgres não é falha do servidor: é entrada inválida, e a
 * resposta tem de dizer isso em vez de devolver 500 sem explicação.
 */
const MENSAGEM_POR_CODIGO = {
  22001: "Algum campo passou do tamanho permitido no cadastro.",
  22003: "Valor numérico fora da faixa permitida.",
  22007: "Data inválida.",
  22008: "Data ou hora fora da faixa permitida.",
  "22P02": "Valor inválido para o tipo esperado.",
  23502: "Campo obrigatório não informado.",
  23503: "O registro referenciado não existe.",
  23505: "Já existe um registro com esse dado único.",
  23514: "O valor informado não é aceito por uma regra do banco.",
};

function registrarTratamentoDeErro(app) {
  app.setErrorHandler((erro, requisicao, resposta) => {
    const mensagem = MENSAGEM_POR_CODIGO[erro.code];

    if (mensagem) {
      const status = erro.code === "23505" ? 409 : 400;
      requisicao.log.warn({ codigo: erro.code, detalhe: erro.detail }, "erro de dado");
      return resposta.code(status).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
    }

    // Erro de validação do próprio Fastify (corpo fora do formato).
    if (erro.validation) {
      return resposta
        .code(400)
        .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Corpo da requisição inválido." });
    }

    requisicao.log.error(erro);
    return resposta.code(erro.statusCode && erro.statusCode < 500 ? erro.statusCode : 500).send({
      erro: "erro_interno",
      mensagem: "Erro inesperado no serviço. O log do serviço tem o detalhe.",
    });
  });
}

export function construirApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "development" ? "info" : "warn" },
  });

  app.register(cors, { origin: true });
  registrarTratamentoDeErro(app);

  app.get("/health", async () => {
    let banco = "ok";
    try {
      await consultar("SELECT 1");
    } catch (erro) {
      banco = `erro: ${erro.message}`;
    }
    return { servico: env.NOME_SERVICO, status: "ok", banco };
  });

  // Prefixo /auth conforme docs/API-CONTRATOS.md.
  app.register(registrarRotas, { prefix: "/auth" });

  return app;
}
