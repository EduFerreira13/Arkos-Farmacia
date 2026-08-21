import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// O .env fica na raiz do monorepo — um único lugar para as credenciais de dev.
dotenv.config({ path: path.join(aqui, "..", "..", "..", ".env"), quiet: true });

export const env = {
  NOME_SERVICO: "auth-service",
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: Number(process.env.AUTH_SERVICE_PORT ?? 3001),
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "8h",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

export function validarEnv() {
  const faltando = [];
  if (!env.DATABASE_URL) faltando.push("DATABASE_URL");
  if (!env.JWT_SECRET) faltando.push("JWT_SECRET");
  if (faltando.length) {
    throw new Error(
      `Variáveis de ambiente ausentes (${faltando.join(", ")}). Confira o .env da raiz.`
    );
  }
}
