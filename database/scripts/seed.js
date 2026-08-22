#!/usr/bin/env node
/**
 * Cria um usuário por perfil para dar o primeiro login no sistema.
 * Só mexe no schema `auth` — dados de produto/estoque são cadastrados pela
 * própria interface (faz parte do fluxo do MVP).
 *
 * Uso: npm run seed
 * Idempotente: rodar de novo não duplica nem troca senha de quem já existe.
 */

const path = require("path");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const SENHA_PADRAO = "arkos123";

const USUARIOS = [
  { nome: "Caio Operador", email: "caixa@arkos.com", perfil: "operador_caixa" },
  { nome: "Marina Farmacêutica", email: "farmaceutico@arkos.com", perfil: "farmaceutico" },
  { nome: "Ana Gerente", email: "gerente@arkos.com", perfil: "gerente" },
  { nome: "Root Admin", email: "admin@arkos.com", perfil: "administrador" },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    options: `-c timezone=${process.env.TZ_NEGOCIO ?? "America/Sao_Paulo"}`,
  });
  await client.connect();

  try {
    const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);

    for (const usuario of USUARIOS) {
      const { rows } = await client.query(
        `SELECT id FROM auth.perfis WHERE nome = $1`,
        [usuario.perfil]
      );
      if (!rows.length) {
        console.error(
          `Perfil "${usuario.perfil}" não existe. Rode "npm run migrate" primeiro.`
        );
        process.exitCode = 1;
        return;
      }

      const resultado = await client.query(
        `INSERT INTO auth.usuarios (perfil_id, nome, email, senha_hash)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING
           RETURNING id`,
        [rows[0].id, usuario.nome, usuario.email, senhaHash]
      );

      console.log(
        resultado.rowCount
          ? `Criado: ${usuario.email} (${usuario.perfil})`
          : `Já existia: ${usuario.email}`
      );
    }

    console.log(`\nSenha padrão de todos os usuários de desenvolvimento: ${SENHA_PADRAO}`);
  } finally {
    await client.end();
  }
}

main();
