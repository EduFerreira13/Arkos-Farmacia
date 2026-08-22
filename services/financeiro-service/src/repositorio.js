import { consultar, emTransacao } from "./db.js";

/** Acesso ao schema `financeiro`. */

export async function buscarCaixaAberto(usuarioId) {
  const { rows } = await consultar(
    `SELECT id, usuario_id, valor_abertura, aberto_em
       FROM financeiro.caixa
      WHERE usuario_id = $1 AND fechado_em IS NULL`,
    [usuarioId]
  );
  return rows[0] ?? null;
}

export async function buscarCaixa(id) {
  const { rows } = await consultar(
    `SELECT id, usuario_id, valor_abertura, valor_fechamento_esperado,
            valor_fechamento_contado, aberto_em, fechado_em
       FROM financeiro.caixa WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function abrirCaixa({ usuarioId, valorAbertura }) {
  const { rows } = await consultar(
    `INSERT INTO financeiro.caixa (usuario_id, valor_abertura)
          VALUES ($1, $2)
       RETURNING id, usuario_id, valor_abertura, aberto_em`,
    [usuarioId, valorAbertura]
  );
  return rows[0];
}

/** Entradas menos saídas do caixa, mais o valor de abertura. */
export async function totaisDoCaixa(caixaId) {
  const { rows } = await consultar(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor END), 0) AS entradas,
       COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor END), 0) AS saidas,
       COALESCE(SUM(CASE WHEN origem = 'venda' THEN valor END), 0) AS entradas_venda,
       COUNT(*)::int AS lancamentos
     FROM financeiro.movimentacoes_caixa
     WHERE caixa_id = $1`,
    [caixaId]
  );
  return rows[0];
}

export async function listarMovimentacoes(caixaId) {
  const { rows } = await consultar(
    `SELECT id, caixa_id, tipo, valor, origem, descricao, venda_id, criado_em
       FROM financeiro.movimentacoes_caixa
      WHERE caixa_id = $1
      ORDER BY criado_em DESC`,
    [caixaId]
  );
  return rows;
}

export async function inserirMovimentacao({ caixaId, tipo, valor, origem, descricao, vendaId }) {
  const { rows } = await consultar(
    `INSERT INTO financeiro.movimentacoes_caixa
       (caixa_id, tipo, valor, origem, descricao, venda_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, caixa_id, tipo, valor, origem, descricao, venda_id, criado_em`,
    [caixaId, tipo, valor, origem, descricao ?? null, vendaId ?? null]
  );
  return rows[0];
}

/**
 * Fecha o caixa comparando o esperado (abertura + entradas - saídas) com o
 * valor contado pelo operador (§5).
 */
export function fecharCaixa({ caixaId, valorContado }) {
  return emTransacao(async (cliente) => {
    const { rows: caixas } = await cliente.query(
      `SELECT id, valor_abertura, fechado_em FROM financeiro.caixa WHERE id = $1 FOR UPDATE`,
      [caixaId]
    );
    if (!caixas.length) return { erro: "nao_encontrado" };
    if (caixas[0].fechado_em) return { erro: "ja_fechado" };

    const { rows: totais } = await cliente.query(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor END), 0) AS saidas
       FROM financeiro.movimentacoes_caixa WHERE caixa_id = $1`,
      [caixaId]
    );

    const esperado =
      Number(caixas[0].valor_abertura) + Number(totais[0].entradas) - Number(totais[0].saidas);

    const { rows } = await cliente.query(
      `UPDATE financeiro.caixa
          SET valor_fechamento_esperado = $2,
              valor_fechamento_contado = $3,
              fechado_em = now()
        WHERE id = $1
        RETURNING id, usuario_id, valor_abertura, valor_fechamento_esperado,
                  valor_fechamento_contado, aberto_em, fechado_em`,
      [caixaId, esperado, valorContado]
    );

    return {
      caixa: rows[0],
      entradas: Number(totais[0].entradas),
      saidas: Number(totais[0].saidas),
      divergencia: Number((Number(valorContado) - esperado).toFixed(2)),
    };
  });
}

export async function listarContas(tabela, status) {
  const valores = [];
  let onde = "";
  if (status) {
    valores.push(status);
    onde = `WHERE status = $1`;
  }
  const { rows } = await consultar(
    `SELECT * FROM financeiro.${tabela} ${onde} ORDER BY vencimento`,
    valores
  );
  return rows;
}

export async function inserirContaPagar({ fornecedorId, descricao, valor, vencimento }) {
  const { rows } = await consultar(
    `INSERT INTO financeiro.contas_pagar (fornecedor_id, descricao, valor, vencimento)
          VALUES ($1, $2, $3, $4)
       RETURNING id, fornecedor_id, descricao, valor, vencimento, status, pago_em`,
    [fornecedorId ?? null, descricao, valor, vencimento]
  );
  return rows[0];
}

export async function inserirContaReceber({ origem, descricao, valor, vencimento }) {
  const { rows } = await consultar(
    `INSERT INTO financeiro.contas_receber (origem, descricao, valor, vencimento)
          VALUES ($1, $2, $3, $4)
       RETURNING id, origem, descricao, valor, vencimento, status, recebido_em`,
    [origem, descricao, valor, vencimento]
  );
  return rows[0];
}

export async function quitarContaPagar(id) {
  const { rows } = await consultar(
    `UPDATE financeiro.contas_pagar
        SET status = 'pago', pago_em = now()
      WHERE id = $1 AND status <> 'pago'
      RETURNING id, descricao, valor, vencimento, status, pago_em`,
    [id]
  );
  return rows[0] ?? null;
}

export async function quitarContaReceber(id) {
  const { rows } = await consultar(
    `UPDATE financeiro.contas_receber
        SET status = 'recebido', recebido_em = now()
      WHERE id = $1 AND status <> 'recebido'
      RETURNING id, descricao, valor, vencimento, status, recebido_em`,
    [id]
  );
  return rows[0] ?? null;
}

/** Contas vencidas e ainda pendentes — usado no fluxo de caixa do dia. */
export async function totaisContas() {
  const { rows } = await consultar(
    `SELECT
       (SELECT COALESCE(SUM(valor), 0) FROM financeiro.contas_pagar
         WHERE status = 'pendente') AS a_pagar,
       (SELECT COALESCE(SUM(valor), 0) FROM financeiro.contas_pagar
         WHERE status = 'pendente' AND vencimento < current_date) AS a_pagar_atrasado,
       (SELECT COALESCE(SUM(valor), 0) FROM financeiro.contas_receber
         WHERE status = 'pendente') AS a_receber,
       (SELECT COALESCE(SUM(valor), 0) FROM financeiro.contas_receber
         WHERE status = 'pendente' AND vencimento < current_date) AS a_receber_atrasado`
  );
  return rows[0];
}

/**
 * Movimentações de caixa de um período, com o operador dono do caixa.
 * @param {{ de: string, ate: string }} intervalo
 */
export async function listarMovimentacoesNoPeriodo({ de, ate }) {
  const { rows } = await consultar(
    `SELECT m.criado_em, m.tipo, m.valor, m.origem, m.descricao, m.venda_id,
            c.usuario_id, c.aberto_em, c.fechado_em
       FROM financeiro.movimentacoes_caixa m
       JOIN financeiro.caixa c ON c.id = m.caixa_id
      WHERE m.criado_em::date BETWEEN $1::date AND $2::date
      ORDER BY m.criado_em`,
    [de, ate]
  );
  return rows;
}

/** Caixas abertos/fechados no período, para conferência do fechamento. */
export async function listarCaixasNoPeriodo({ de, ate }) {
  const { rows } = await consultar(
    `SELECT id, usuario_id, valor_abertura, valor_fechamento_esperado,
            valor_fechamento_contado, aberto_em, fechado_em
       FROM financeiro.caixa
      WHERE aberto_em::date BETWEEN $1::date AND $2::date
      ORDER BY aberto_em`,
    [de, ate]
  );
  return rows;
}

/**
 * Contas de um período por data de vencimento.
 * @param {"contas_pagar"|"contas_receber"} tabela
 * @param {{ de: string, ate: string }} intervalo
 */
export async function listarContasNoPeriodo(tabela, { de, ate }) {
  const { rows } = await consultar(
    `SELECT * FROM financeiro.${tabela}
      WHERE vencimento BETWEEN $1::date AND $2::date
      ORDER BY vencimento`,
    [de, ate]
  );
  return rows;
}
