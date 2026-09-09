import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// O .env fica na raiz do monorepo — um único lugar para as credenciais de dev.
dotenv.config({ path: path.join(aqui, "..", "..", "..", ".env"), quiet: true });

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export const env = {
  NOME_SERVICO: "arkos-api",
  DATABASE_URL: process.env.DATABASE_URL,
  PORT,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "8h",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  TZ_NEGOCIO: process.env.TZ_NEGOCIO ?? "America/Sao_Paulo",

  // Consulta pública de CNPJ usada no cadastro de fornecedor (modulos/estoque/cnpj.js).
  // Sem chave e sem custo; trocar de provedor é trocar esta URL.
  CNPJ_API_URL: process.env.CNPJ_API_URL ?? "https://brasilapi.com.br/api/cnpj/v1",

  // Antes eram seis processos conversando por HTTP entre si; agora é um só,
  // mas os módulos continuam se chamando por HTTP (docs/ARQUITETURA.md) — só
  // que sempre no mesmo host:porta, cada um no seu prefixo. Onde o módulo
  // chamador já inclui o próprio prefixo no caminho da chamada (é o caso de
  // vendas, chamado pelo financeiro), a URL fica só na base, sem prefixo.
  ESTOQUE_URL: `${BASE_URL}/estoque`,
  FINANCEIRO_URL: `${BASE_URL}/financeiro`,
  FISCAL_URL: `${BASE_URL}/fiscal`,
  VENDAS_URL: BASE_URL,

  // Impressora térmica do PDV (ESC/POS). Sem impressora física ainda: aponta
  // para o emulador local (`npm run dev:impressora`, na raiz do monorepo) por
  // padrão. Quando a impressora chegar, só troca essa variável no .env — o
  // código de impressao.js nunca muda.
  PRINTER_URL: process.env.PRINTER_URL ?? "tcp://localhost:9100",

  // Identificação da farmácia impressa na ordem de compra e no recibo do PDV.
  // Não é segredo — é o que já vai impresso no documento que chega ao
  // fornecedor/cliente —, mas fica no .env porque muda de instalação para
  // instalação.
  FARMACIA: {
    nome: process.env.FARMACIA_NOME ?? "Farmácia Arkos",
    cnpj: process.env.FARMACIA_CNPJ ?? "",
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
