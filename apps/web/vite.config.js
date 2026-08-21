import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Cada serviço roda numa porta própria (docs/API-CONTRATOS.md). O front fala
 * sempre com `/api/<servico>/...` e o proxy do Vite entrega na porta certa —
 * evita CORS no desenvolvimento e mantém uma origem só no navegador.
 */
export default defineConfig(({ mode }) => {
  const raiz = path.join(process.cwd(), "..", "..");
  const env = loadEnv(mode, raiz, "");

  const porta = (nome, padrao) => Number(env[nome] ?? padrao);

  const alvo = (portaServico, prefixo, destino) => ({
    target: `http://localhost:${portaServico}`,
    changeOrigin: true,
    rewrite: (caminho) => caminho.replace(new RegExp(`^${prefixo}`), destino),
  });

  return {
    plugins: [react()],
    server: {
      port: porta("WEB_PORT", 5173),
      proxy: {
        "/api/auth": alvo(porta("AUTH_SERVICE_PORT", 3001), "/api/auth", "/auth"),
        "/api/estoque": alvo(porta("ESTOQUE_SERVICE_PORT", 3002), "/api/estoque", ""),
        "/api/vendas": alvo(porta("VENDAS_SERVICE_PORT", 3003), "/api/vendas", "/vendas"),
        "/api/financeiro": alvo(porta("FINANCEIRO_SERVICE_PORT", 3004), "/api/financeiro", ""),
        "/api/fiscal": alvo(porta("FISCAL_SERVICE_PORT", 3005), "/api/fiscal", ""),
      },
    },
  };
});
