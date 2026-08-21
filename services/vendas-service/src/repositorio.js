import { consultar, emTransacao } from "./db.js";

/** Acesso ao schema `vendas`. */

export async function criarVenda(usuarioId) {
  const { rows } = await consultar(
    `INSERT INTO vendas.vendas (usuario_id) VALUES ($1)
       RETURNING id, usuario_id, status, valor_total, desconto, criado_em`,
    [usuarioId]
  );
  return rows[0];
}

export async function buscarVenda(id) {
  const { rows } = await consultar(
    `SELECT id, usuario_id, status, valor_total, desconto, motivo_cancelamento, criado_em
       FROM vendas.vendas WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarItens(vendaId) {
  const { rows } = await consultar(
    `SELECT id, venda_id, produto_id, lote_id, quantidade, preco_unitario,
            produto_nome, tipo_controle
       FROM vendas.itens_venda
      WHERE venda_id = $1
      ORDER BY id`,
    [vendaId]
  );
  return rows;
}

export async function listarPagamentos(vendaId) {
  const { rows } = await consultar(
    `SELECT id, venda_id, forma_pagamento, valor
       FROM vendas.pagamentos WHERE venda_id = $1 ORDER BY id`,
    [vendaId]
  );
  return rows;
}

export async function buscarReceita(vendaId) {
  const { rows } = await consultar(
    `SELECT id, venda_id, medico_nome, medico_crm, paciente_nome, data_emissao
       FROM vendas.receitas WHERE venda_id = $1`,
    [vendaId]
  );
  return rows[0] ?? null;
}

/** Monta a venda completa (itens, pagamentos, receita). */
export async function buscarVendaCompleta(id) {
  const venda = await buscarVenda(id);
  if (!venda) return null;
  const [itens, pagamentos, receita] = await Promise.all([
    listarItens(id),
    listarPagamentos(id),
    buscarReceita(id),
  ]);
  return { ...venda, itens, pagamentos, receita };
}

/**
 * Insere o item e recalcula o total da venda na mesma transação.
 * `lote_id` guarda o lote de referência (o que vence primeiro no momento da
 * inclusão); a baixa real é FEFO na finalização e pode atravessar lotes.
 */
export function inserirItem({
  vendaId,
  produtoId,
  loteId,
  quantidade,
  precoUnitario,
  produtoNome,
  tipoControle,
}) {
  return emTransacao(async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO vendas.itens_venda
         (venda_id, produto_id, lote_id, quantidade, preco_unitario, produto_nome, tipo_controle)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, venda_id, produto_id, lote_id, quantidade, preco_unitario,
                 produto_nome, tipo_controle`,
      [vendaId, produtoId, loteId, quantidade, precoUnitario, produtoNome, tipoControle]
    );

    await recalcularTotal(cliente, vendaId);
    return rows[0];
  });
}

export function removerItem({ vendaId, itemId }) {
  return emTransacao(async (cliente) => {
    const { rowCount } = await cliente.query(
      `DELETE FROM vendas.itens_venda WHERE id = $1 AND venda_id = $2`,
      [itemId, vendaId]
    );
    if (!rowCount) return false;
    await recalcularTotal(cliente, vendaId);
    return true;
  });
}

/** valor_total = soma dos itens - desconto (nunca negativo). */
async function recalcularTotal(cliente, vendaId) {
  await cliente.query(
    `UPDATE vendas.vendas v
        SET valor_total = GREATEST(COALESCE((
              SELECT SUM(i.quantidade * i.preco_unitario)
                FROM vendas.itens_venda i WHERE i.venda_id = v.id
            ), 0) - v.desconto, 0)
      WHERE v.id = $1`,
    [vendaId]
  );
}

export function definirDesconto({ vendaId, desconto }) {
  return emTransacao(async (cliente) => {
    await cliente.query(`UPDATE vendas.vendas SET desconto = $2 WHERE id = $1`, [
      vendaId,
      desconto,
    ]);
    await recalcularTotal(cliente, vendaId);
  });
}

export async function salvarReceita({ vendaId, medicoNome, medicoCrm, pacienteNome, dataEmissao }) {
  const { rows } = await consultar(
    `INSERT INTO vendas.receitas (venda_id, medico_nome, medico_crm, paciente_nome, data_emissao)
          VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (venda_id) DO UPDATE
            SET medico_nome = EXCLUDED.medico_nome,
                medico_crm = EXCLUDED.medico_crm,
                paciente_nome = EXCLUDED.paciente_nome,
                data_emissao = EXCLUDED.data_emissao
       RETURNING id, venda_id, medico_nome, medico_crm, paciente_nome, data_emissao`,
    [vendaId, medicoNome, medicoCrm, pacienteNome, dataEmissao]
  );
  return rows[0];
}

export async function inserirPagamento({ vendaId, formaPagamento, valor }) {
  const { rows } = await consultar(
    `INSERT INTO vendas.pagamentos (venda_id, forma_pagamento, valor)
          VALUES ($1, $2, $3)
       RETURNING id, venda_id, forma_pagamento, valor`,
    [vendaId, formaPagamento, valor]
  );
  return rows[0];
}

export async function removerPagamentos(vendaId) {
  await consultar(`DELETE FROM vendas.pagamentos WHERE venda_id = $1`, [vendaId]);
}

export async function marcarFinalizada(vendaId) {
  const { rows } = await consultar(
    `UPDATE vendas.vendas SET status = 'finalizada'
      WHERE id = $1 AND status = 'aberta'
      RETURNING id, status, valor_total, desconto, criado_em`,
    [vendaId]
  );
  return rows[0] ?? null;
}

export async function marcarCancelada({ vendaId, motivo }) {
  const { rows } = await consultar(
    `UPDATE vendas.vendas SET status = 'cancelada', motivo_cancelamento = $2
      WHERE id = $1 AND status = 'aberta'
      RETURNING id, status, motivo_cancelamento`,
    [vendaId, motivo]
  );
  return rows[0] ?? null;
}

/** Atualiza o lote de referência do item para o primeiro lote realmente baixado. */
export async function atualizarLoteDoItem({ itemId, loteId }) {
  await consultar(`UPDATE vendas.itens_venda SET lote_id = $2 WHERE id = $1`, [itemId, loteId]);
}

export async function listarVendasDoDia() {
  const { rows } = await consultar(
    `SELECT v.id, v.usuario_id, v.status, v.valor_total, v.desconto, v.criado_em,
            (SELECT COUNT(*) FROM vendas.itens_venda i WHERE i.venda_id = v.id)::int AS total_itens,
            (SELECT string_agg(DISTINCT p.forma_pagamento, ', ')
               FROM vendas.pagamentos p WHERE p.venda_id = v.id) AS formas_pagamento
       FROM vendas.vendas v
      WHERE v.criado_em::date = current_date
      ORDER BY v.criado_em DESC`
  );
  return rows;
}

/**
 * Resumo do dia para o dashboard e para o fluxo de caixa do financeiro:
 * total, ticket médio e quebra por forma de pagamento.
 */
export async function resumoDoDia() {
  const { rows: totais } = await consultar(
    `SELECT total_vendas::int AS total_vendas, valor_total_dia, ticket_medio
       FROM vendas.vw_vendas_hoje`
  );

  const { rows: porForma } = await consultar(
    `SELECT p.forma_pagamento, SUM(p.valor) AS valor, COUNT(*)::int AS quantidade
       FROM vendas.pagamentos p
       JOIN vendas.vendas v ON v.id = p.venda_id
      WHERE v.status = 'finalizada' AND v.criado_em::date = current_date
      GROUP BY p.forma_pagamento
      ORDER BY p.forma_pagamento`
  );

  return {
    total_vendas: totais[0]?.total_vendas ?? 0,
    valor_total_dia: totais[0]?.valor_total_dia ?? 0,
    ticket_medio: totais[0]?.ticket_medio ?? 0,
    por_forma_pagamento: porForma,
  };
}
