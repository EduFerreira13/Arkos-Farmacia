import pg from "pg";
import { env } from "./env.js";

// numeric(10,2) volta como string por padrão no driver; o serviço trabalha com
// number e formata na borda (docs/MODELO-DADOS.md — dinheiro nunca em float no
// banco, mas em JS o valor já vem arredondado em 2 casas pelo próprio tipo).
pg.types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));
// bigint (COUNT) como number — as contagens do MVP cabem com folga.
pg.types.setTypeParser(20, (valor) => (valor === null ? null : Number(valor)));
// date sem conversão para Date, evita deslocamento de fuso em data_validade.
pg.types.setTypeParser(1082, (valor) => valor);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // O dia do negócio é o dia local da farmácia, não o dia UTC do servidor: sem
  // isso, uma venda das 21h entraria no movimento do dia seguinte (current_date
  // e criado_em::date são resolvidos no fuso da sessão).
  options: `-c timezone=${env.TZ_NEGOCIO}`,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

/**
 * @param {string} sql
 * @param {unknown[]} [parametros]
 */
export function consultar(sql, parametros = []) {
  return pool.query(sql, parametros);
}

/**
 * Roda a função dentro de uma transação, com rollback em caso de erro.
 * @template T
 * @param {(cliente: import("pg").PoolClient) => Promise<T>} acao
 * @returns {Promise<T>}
 */
export async function emTransacao(acao) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await acao(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}

export function encerrarPool() {
  return pool.end();
}
