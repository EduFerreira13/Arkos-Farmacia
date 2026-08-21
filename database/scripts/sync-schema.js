#!/usr/bin/env node
/**
 * Varre a estrutura real do banco (via information_schema) e regrava
 * database/schema/<schema>.md com um dicionário de dados atualizado.
 * Se algo mudou em relação ao que já estava salvo, faz um commit automático
 * com a mensagem "docs(database): sync schema". Se nada mudou, não commita.
 *
 * Uso: npm run sync:schema
 * Requer: DATABASE_URL no .env, pacote "pg" instalado, e que o comando rode
 * dentro de um repositório git.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Client } = require("pg");

const SCHEMA_DIR = path.join(__dirname, "..", "schema");
const SERVICE_SCHEMAS = ["auth", "estoque", "vendas", "financeiro", "fiscal"];

async function getTablesAndColumns(client, schemaName) {
  const { rows } = await client.query(
    `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1
    ORDER BY table_name, ordinal_position
    `,
    [schemaName]
  );
  return rows;
}

function renderMarkdown(schemaName, rows) {
  const byTable = {};
  for (const row of rows) {
    if (!byTable[row.table_name]) byTable[row.table_name] = [];
    byTable[row.table_name].push(row);
  }

  let md = `# Schema \`${schemaName}\`\n\n`;
  md += `> Gerado automaticamente por \`database/scripts/sync-schema.js\`. Não editar à mão.\n\n`;

  const tableNames = Object.keys(byTable).sort();
  if (tableNames.length === 0) {
    md += `_Nenhuma tabela encontrada neste schema._\n`;
    return md;
  }

  for (const tableName of tableNames) {
    md += `## ${tableName}\n\n`;
    md += `| Coluna | Tipo | Nulo? | Default |\n`;
    md += `|---|---|---|---|\n`;
    for (const col of byTable[tableName]) {
      md += `| ${col.column_name} | ${col.data_type} | ${col.is_nullable} | ${col.column_default ?? "-"} |\n`;
    }
    md += `\n`;
  }

  return md;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  fs.mkdirSync(SCHEMA_DIR, { recursive: true });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let anyChange = false;

  try {
    for (const schemaName of SERVICE_SCHEMAS) {
      const rows = await getTablesAndColumns(client, schemaName);
      const markdown = renderMarkdown(schemaName, rows);
      const filePath = path.join(SCHEMA_DIR, `${schemaName}.md`);

      const previous = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, "utf8")
        : null;

      if (previous !== markdown) {
        fs.writeFileSync(filePath, markdown, "utf8");
        console.log(`Atualizado: database/schema/${schemaName}.md`);
        anyChange = true;
      } else {
        console.log(`Sem mudanças: database/schema/${schemaName}.md`);
      }
    }
  } finally {
    await client.end();
  }

  if (!anyChange) {
    console.log("Nenhuma mudança detectada no banco. Nada para commitar.");
    return;
  }

  try {
    execSync(`git add ${SCHEMA_DIR}`, { stdio: "inherit" });
    execSync(`git commit -m "docs(database): sync schema"`, { stdio: "inherit" });
    console.log("Commit automático criado.");
  } catch (err) {
    console.error(
      "Não foi possível commitar automaticamente (talvez não haja mudanças staged, ou não seja um repo git). Verifique manualmente."
    );
  }
}

main();
