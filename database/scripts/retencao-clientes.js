#!/usr/bin/env node
/**
 * Aplica a política de retenção do CRM (docs/REGRAS-NEGOCIO.md, decisão
 * registrada em docs/PENDENCIAS.md): cliente sem nenhuma compra há mais de 2
 * anos (ou cadastrado há mais de 2 anos e nunca comprou) tem os dados
 * pessoais anonimizados — mesma anonimização do pedido de exclusão
 * (`POST /vendas/clientes/:id/excluir-dados`), só que disparada pelo prazo em
 * vez de um pedido explícito do cliente.
 *
 * Por padrão só LISTA quem seria afetado (dry-run) — nada é alterado. Rodar
 * com `--aplicar` para de fato anonimizar.
 *
 * Uso:
 *   node database/scripts/retencao-clientes.js            (lista, não altera)
 *   node database/scripts/retencao-clientes.js --aplicar   (anonimiza de vez)
 *
 * Requer: DATABASE_URL (ver .env) e o pacote "pg" instalado. Não tem
 * agendamento automático (sem infraestrutura de cron no projeto) — rodar
 * manualmente quando quiser aplicar a política, ou agendar via cron do SO.
 */

const path = require("path");
const { Client } = require("pg"); // npm install pg

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const PRAZO_RETENCAO_SQL = "2 years";
const PRAZO_RETENCAO_LEGIVEL = "2 anos";

const CONSULTAR_ELEGIVEIS = `
  SELECT cl.id, cl.nome, cl.criado_em,
         MAX(v.criado_em) AS ultima_compra_em
    FROM vendas.clientes cl
    LEFT JOIN vendas.vendas v ON v.cliente_id = cl.id
   WHERE cl.dados_excluidos_em IS NULL
   GROUP BY cl.id
  HAVING COALESCE(MAX(v.criado_em), cl.criado_em) < now() - interval '${PRAZO_RETENCAO_SQL}'
   ORDER BY COALESCE(MAX(v.criado_em), cl.criado_em) ASC
`;

const ANONIMIZAR = `
  UPDATE vendas.clientes
     SET nome = 'Cliente removido (LGPD - retenção)',
         cpf = NULL,
         telefone = NULL,
         email = NULL,
         convenio = NULL,
         observacao = NULL,
         endereco = NULL,
         data_nascimento = NULL,
         aceita_contato = false,
         ativo = false,
         dados_excluidos_por = NULL,
         dados_excluidos_em = now()
   WHERE id = $1
`;

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows } = await client.query(CONSULTAR_ELEGIVEIS);

    if (!rows.length) {
      console.log(`Nenhum cliente sem compra há mais de ${PRAZO_RETENCAO_LEGIVEL}. Nada a fazer.`);
      return;
    }

    console.log(`${rows.length} cliente(s) sem compra há mais de ${PRAZO_RETENCAO_LEGIVEL}:`);
    for (const linha of rows) {
      const referencia = linha.ultima_compra_em ?? linha.criado_em;
      const motivo = linha.ultima_compra_em ? "última compra" : "cadastrado, nunca comprou";
      console.log(`  - ${linha.nome} (${linha.id}) — ${motivo} em ${referencia.toISOString()}`);
    }

    if (!aplicar) {
      console.log("\nModo consulta (dry-run) — nada foi alterado.");
      console.log("Rode com --aplicar para anonimizar de fato estes cadastros.");
      return;
    }

    for (const linha of rows) {
      await client.query(ANONIMIZAR, [linha.id]);
    }
    console.log(`\n${rows.length} cliente(s) anonimizado(s).`);
  } finally {
    await client.end();
  }
}

main().catch((erro) => {
  console.error("Erro ao aplicar retenção:", erro.message);
  process.exitCode = 1;
});
