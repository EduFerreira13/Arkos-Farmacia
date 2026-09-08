import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// O .env fica na raiz do monorepo — um único lugar para as credenciais de dev.
dotenv.config({ path: path.join(aqui, "..", "..", "..", ".env"), quiet: true });

export const env = {
  NOME_SERVICO: "vendas-service",
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: Number(process.env.VENDAS_SERVICE_PORT ?? 3003),
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "8h",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  TZ_NEGOCIO: process.env.TZ_NEGOCIO ?? "America/Sao_Paulo",

  // Comunicação entre serviços é sempre HTTP (docs/ARQUITETURA.md).
  ESTOQUE_URL: `http://localhost:${process.env.ESTOQUE_SERVICE_PORT ?? 3002}`,
  FINANCEIRO_URL: `http://localhost:${process.env.FINANCEIRO_SERVICE_PORT ?? 3004}`,
  FISCAL_URL: `http://localhost:${process.env.FISCAL_SERVICE_PORT ?? 3005}`,

  // Impressora térmica do PDV (ESC/POS). Sem impressora física ainda: aponta
  // para o emulador local (`npm run dev:impressora`, na raiz do monorepo) por
  // padrão. Quando a impressora chegar, só troca essa variável no .env — o
  // código de impressao.js nunca muda.
  PRINTER_URL: process.env.PRINTER_URL ?? "tcp://localhost:9100",

  // Mesmo dado que já vai na ordem de compra (docs/API-CONTRATOS.md não cobre
  // isso — é identificação impressa, não contrato entre serviços).
  FARMACIA: {
    nome: process.env.FARMACIA_NOME ?? "Farmácia Arkos",
    endereco: process.env.FARMACIA_ENDERECO ?? "",
    telefone: process.env.FARMACIA_TELEFONE ?? "",
  },
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
