import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * O backend é um processo só (`apps/api`), com um módulo por domínio, cada um
 * no seu prefixo (docs/API-CONTRATOS.md). O front fala sempre com
 * `/api/<módulo>/...` e o proxy do Vite reescreve para o prefixo real do
 * backend, sempre no mesmo destino — evita CORS no desenvolvimento e mantém
 * uma origem só no navegador.
 */
export default defineConfig(({ mode }) => {
  const raiz = path.join(process.cwd(), "..", "..");
  const env = loadEnv(mode, raiz, "");

  const porta = (nome, padrao) => Number(env[nome] ?? padrao);
  const alvo = `http://localhost:${porta("PORT", 3000)}`;

  // Todo módulo cai no mesmo destino agora: só tira o "/api" da frente e o
  // que sobra já é o prefixo que o backend espera (/auth, /estoque...).
  const modulo = {
    target: alvo,
    changeOrigin: true,
    rewrite: (caminho) => caminho.replace(/^\/api/, ""),
  };

  return {
    plugins: [react()],
    server: {
      port: porta("WEB_PORT", 5173),
      // Sem isso, porta ocupada faz o Vite subir silencioso na próxima livre
      // (5174, 5175...) — parece que funcionou, mas era outro processo velho
      // ainda preso na 5173. Falhando alto, o erro já aponta a causa.
      strictPort: true,
      proxy: {
        "/api/auth": modulo,
        "/api/estoque": modulo,
        "/api/vendas": modulo,
        "/api/financeiro": modulo,
        "/api/fiscal": modulo,
        "/api/compras": modulo,
        // GET /health não é um módulo — vive na raiz do backend
        // (apps/api/src/app.js), fora de qualquer prefixo. Sem esta entrada,
        // o provider de conectividade (apps/web/src/lib/conectividade.jsx)
        // não alcança o health-check em dev (em produção funciona porque o
        // nginx.conf usa um location /api/ genérico).
        "/api/health": modulo,
      },
    },
  };
});
