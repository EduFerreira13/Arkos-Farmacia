// teste de deploy automático
import { construirApp } from "./app.js";
import { env, validarEnv } from "./env.js";
import { encerrarPool } from "./db.js";

validarEnv();

const app = construirApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`${env.NOME_SERVICO} ouvindo na porta ${env.PORT}`);
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, async () => {
    await app.close();
    await encerrarPool();
    process.exit(0);
  });
}
