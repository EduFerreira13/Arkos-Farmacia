#!/usr/bin/env node
/**
 * Roda as migrations de database/migrations/ em ordem alfabética (por isso o
 * prefixo numérico 0000_, 0001_, ...), contra o banco em DATABASE_URL.
 *
 * Cada arquivo roda **uma vez só**: o que já foi aplicado fica registrado em
 * `public.arkos_migrations`. Antes disso o comando reaplicava tudo a cada
 * execução — e como a 0000 apaga os schemas, rodar o migrate de novo para
 * aplicar uma migration nova levava junto o banco inteiro.
 *
 * Uso: npm run migrate
 * Requer: variável de ambiente DATABASE_URL (ver .env) e o pacote "pg" instalado.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg"); // npm install pg

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

const CRIAR_REGISTRO = `
  CREATE TABLE IF NOT EXISTS public.arkos_migrations (
    arquivo     text PRIMARY KEY,
    aplicada_em timestamptz NOT NULL DEFAULT now()
  )
`;

/**
 * Banco que já tem o Arkos instalado mas ainda não tem o registro: são as
 * migrations que rodaram antes desta mudança. Marca todas como aplicadas em vez
 * de tentar rodar de novo — reaplicar a 0000 apagaria tudo.
 */
async function adotarBancoExistente(client, arquivos) {
  const { rows } = await client.query(`SELECT to_regclass('auth.usuarios') AS instalado`);
  if (!rows[0].instalado) return false;

  const { rows: registradas } = await client.query(
    `SELECT count(*)::int AS total FROM public.arkos_migrations`
  );
  if (registradas[0].total > 0) return false;

  for (const arquivo of arquivos) {
    await client.query(`INSERT INTO public.arkos_migrations (arquivo) VALUES ($1)`, [arquivo]);
  }
  console.log(
    `Banco já tinha o Arkos instalado: ${arquivos.length} migration(s) marcadas como aplicadas.`
  );
  return true;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  const arquivos = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  if (arquivos.length === 0) {
    console.log("Nenhuma migration encontrada em database/migrations/.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(CRIAR_REGISTRO);

    if (await adotarBancoExistente(client, arquivos)) {
      console.log("Nada a aplicar.");
      return;
    }

    const { rows } = await client.query(`SELECT arquivo FROM public.arkos_migrations`);
    const jaAplicadas = new Set(rows.map((linha) => linha.arquivo));

    let aplicadas = 0;
    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) {
        console.log(`Já aplicada: ${arquivo}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, arquivo), "utf8");
      console.log(`Rodando migration: ${arquivo}`);

      // Cada migration é uma transação: falhou no meio, não deixa metade feita.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO public.arkos_migrations (arquivo) VALUES ($1)`, [arquivo]);
        await client.query("COMMIT");
      } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;
      }

      console.log(`OK: ${arquivo}`);
      aplicadas += 1;
    }

    console.log(
      aplicadas
        ? `${aplicadas} migration(s) aplicada(s) com sucesso.`
        : "Banco já estava atualizado."
    );
  } catch (erro) {
    console.error("Erro ao rodar migrations:", erro.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
