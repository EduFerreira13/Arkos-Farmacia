#!/usr/bin/env node
/**
 * Roda todos os arquivos .sql em database/migrations/, em ordem alfabética
 * (por isso o prefixo numérico 0000_, 0001_, ...), contra o banco em DATABASE_URL.
 *
 * Uso: npm run migrate
 * Requer: variável de ambiente DATABASE_URL (ver .env) e o pacote "pg" instalado.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg"); // npm install pg

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Nenhuma migration encontrada em database/migrations/.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const file of files) {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`Rodando migration: ${file}`);
      await client.query(sql);
      console.log(`OK: ${file}`);
    }
    console.log("Todas as migrations foram aplicadas com sucesso.");
  } catch (err) {
    console.error("Erro ao rodar migrations:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
