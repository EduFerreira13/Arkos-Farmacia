import Fastify from "fastify";
import { ERROS } from "@arkos/shared-types";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { consultar } from "./db.js";
import { registrarRotas as registrarRotasAuth } from "./modulos/auth/rotas.js";
import { registrarRotas as registrarRotasEstoque } from "./modulos/estoque/rotas.js";
import { registrarRotas as registrarRotasVendas } from "./modulos/vendas/rotas.js";
import { registrarRotas as registrarRotasFinanceiro } from "./modulos/financeiro/rotas.js";
import { registrarRotas as registrarRotasFiscal } from "./modulos/fiscal/rotas.js";
import { registrarRotas as registrarRotasCompras } from "./modulos/compras/rotas.js";

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

    // @fastify/rate-limit (ver modulos/auth/rotas.js): o erro já vem com a
    // mensagem certa em `codigoArkos`/`message`, só repassar.
    if (erro.statusCode === 429) {
      return resposta.code(429).send({ erro: erro.codigoArkos ?? "limite_excedido", mensagem: erro.message });
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

  // Antes de tudo: o token agora viaja em cookie httpOnly (packages/auth-middleware),
  // e `request.cookies`/`reply.setCookie` só existem depois deste registro.
  app.register(cookie);
  // credentials: true é o que faz o navegador mandar o cookie em requisição
  // cross-origin — necessário mesmo com o proxy same-origin do Vite/nginx,
  // porque cobre também quem acessa a API direto de outra origem.
  app.register(cors, { origin: env.FRONTEND_URL, credentials: true });
  app.register(helmet);
  // Global false: rate limit só vale nas rotas que pedirem via `config.rateLimit`
  // (hoje, só o login — ver modulos/auth/rotas.js).
  app.register(rateLimit, { global: false });
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

  // Um módulo por domínio de negócio, cada um no seu prefixo (docs/API-CONTRATOS.md).
  // Nenhum módulo lê o schema de outro — a comunicação entre eles continua via
  // HTTP (agora sempre para o mesmo host:porta), como antes da consolidação
  // (docs/ARQUITETURA.md).
  app.register(registrarRotasAuth, { prefix: "/auth" });
  app.register(registrarRotasEstoque, { prefix: "/estoque" });
  app.register(registrarRotasVendas, { prefix: "/vendas" });
  app.register(registrarRotasFinanceiro, { prefix: "/financeiro" });
  app.register(registrarRotasFiscal, { prefix: "/fiscal" });
  app.register(registrarRotasCompras, { prefix: "/compras" });

  return app;
}
