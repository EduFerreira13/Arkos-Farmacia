import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { consultar } from "./db.js";
import { registrarRotas } from "./rotas.js";

export function construirApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "development" ? "info" : "warn" },
  });

  app.register(cors, { origin: true });

  app.get("/health", async () => {
    let banco = "ok";
    try {
      await consultar("SELECT 1");
    } catch (erro) {
      banco = `erro: ${erro.message}`;
    }
    return { servico: env.NOME_SERVICO, status: "ok", banco };
  });

  // Prefixo /vendas conforme docs/API-CONTRATOS.md.
  app.register(registrarRotas, { prefix: "/vendas" });

  return app;
}
