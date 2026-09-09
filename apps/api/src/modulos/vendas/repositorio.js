import { consultar, emTransacao } from "../../db.js";

/** Acesso ao schema `vendas`. */

export async function criarVenda(usuarioId) {
  const { rows } = await consultar(
    `INSERT INTO vendas.vendas (usuario_id) VALUES ($1)
       RETURNING id, numero, usuario_id, status, valor_total, desconto, criado_em`,
    [usuarioId]
  );
  return rows[0];
}

export async function buscarVenda(id) {
  const { rows } = await consultar(
    `SELECT v.id, v.numero, v.usuario_id, v.status, v.valor_total, v.desconto,
            v.motivo_cancelamento, v.categoria_cancelamento, v.criado_em, v.cliente_id,
            c.nome AS cliente_nome, c.convenio AS cliente_convenio, c.telefone AS cliente_telefone
       FROM vendas.vendas v
       LEFT JOIN vendas.clientes c ON c.id = v.cliente_id
      WHERE v.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarItens(vendaId) {
  const { rows } = await consultar(
    `SELECT id, venda_id, produto_id, lote_id, quantidade, preco_unitario, desconto,
            produto_nome, tipo_controle, dias_de_uso
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
  diasDeUso,
}) {
  return emTransacao(async (cliente) => {
    // Mesmo produto lido duas vezes soma na linha que já existe: o carrinho
    // mostra "Dipirona x2" em vez de repetir o item.
    const { rows: existentes } = await cliente.query(
      `SELECT id, quantidade FROM vendas.itens_venda
        WHERE venda_id = $1 AND produto_id = $2
        ORDER BY id
        LIMIT 1
        FOR UPDATE`,
      [vendaId, produtoId]
    );

    const { rows } = existentes.length
      ? await cliente.query(
          `UPDATE vendas.itens_venda
              SET quantidade = quantidade + $2,
                  -- O snapshot da duração só é preenchido se ainda estiver
                  -- vazio: a linha guarda o que valia quando o item entrou.
                  dias_de_uso = COALESCE(dias_de_uso, $3)
            WHERE id = $1
            RETURNING id, venda_id, produto_id, lote_id, quantidade, preco_unitario, desconto,
                      produto_nome, tipo_controle, dias_de_uso`,
          [existentes[0].id, quantidade, diasDeUso ?? null]
        )
      : await cliente.query(
          `INSERT INTO vendas.itens_venda
             (venda_id, produto_id, lote_id, quantidade, preco_unitario, produto_nome,
              tipo_controle, dias_de_uso)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, venda_id, produto_id, lote_id, quantidade, preco_unitario, desconto,
                     produto_nome, tipo_controle, dias_de_uso`,
          [
            vendaId, produtoId, loteId, quantidade, precoUnitario, produtoNome,
            tipoControle, diasDeUso ?? null,
          ]
        );

    await recalcularTotal(cliente, vendaId);
    return rows[0];
  });
}

/** Ajusta a quantidade de um item (o carrinho tem os botões de mais e menos). */
export function alterarQuantidadeDoItem({ vendaId, itemId, quantidade }) {
  return emTransacao(async (cliente) => {
    const { rowCount } = await cliente.query(
      `UPDATE vendas.itens_venda SET quantidade = $3
        WHERE id = $1 AND venda_id = $2`,
      [itemId, vendaId, quantidade]
    );
    if (!rowCount) return false;
    await recalcularTotal(cliente, vendaId);
    return true;
  });
}

/** Desconto negociado em uma linha do carrinho. */
export function definirDescontoDoItem({ vendaId, itemId, desconto }) {
  return emTransacao(async (cliente) => {
    const { rowCount } = await cliente.query(
      `UPDATE vendas.itens_venda SET desconto = $3
        WHERE id = $1 AND venda_id = $2`,
      [itemId, vendaId, desconto]
    );
    if (!rowCount) return false;
    await recalcularTotal(cliente, vendaId);
    return true;
  });
}

export async function removerReceita(vendaId) {
  const { rowCount } = await consultar(`DELETE FROM vendas.receitas WHERE venda_id = $1`, [vendaId]);
  return rowCount > 0;
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

/**
 * valor_total = soma dos itens, menos o desconto de cada linha, menos o
 * desconto geral da venda. Nunca negativo.
 */
async function recalcularTotal(cliente, vendaId) {
  await cliente.query(
    `UPDATE vendas.vendas v
        SET valor_total = GREATEST(COALESCE((
              SELECT SUM(i.quantidade * i.preco_unitario - i.desconto)
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

export async function marcarFinalizada(vendaId) {
  const { rows } = await consultar(
    `UPDATE vendas.vendas SET status = 'finalizada', finalizado_em = now()
      WHERE id = $1 AND status = 'aberta'
      RETURNING id, numero, status, valor_total, desconto, criado_em`,
    [vendaId]
  );
  return rows[0] ?? null;
}

export async function marcarCancelada({ vendaId, motivo, categoria }) {
  const { rows } = await consultar(
    `UPDATE vendas.vendas
        SET status = 'cancelada', motivo_cancelamento = $2, categoria_cancelamento = $3
      WHERE id = $1 AND status = 'aberta'
      RETURNING id, numero, status, motivo_cancelamento, categoria_cancelamento`,
    [vendaId, motivo, categoria ?? null]
  );
  return rows[0] ?? null;
}

/** Atualiza o lote de referência do item para o primeiro lote realmente baixado. */
export async function atualizarLoteDoItem({ itemId, loteId }) {
  await consultar(`UPDATE vendas.itens_venda SET lote_id = $2 WHERE id = $1`, [itemId, loteId]);
}

/**
 * Resumo do dia para o dashboard e para o fluxo de caixa do financeiro:
 * total, ticket médio, quebra por forma de pagamento e variação contra ontem
 * (o card de indicador mostra a variação percentual — REGRAS-VISUAIS §4).
 */
export async function resumoDoDia() {
  // As três leituras são independentes: vão juntas para não somar latência.
  const [{ rows: totais }, { rows: ontem }, { rows: porForma }] = await Promise.all([
    consultar(
      `SELECT total_vendas::int AS total_vendas, valor_total_dia, ticket_medio
         FROM vendas.vw_vendas_hoje`
    ),
    consultar(
      `SELECT COUNT(*)::int AS total_vendas,
              COALESCE(SUM(valor_total), 0) AS valor_total_dia,
              COALESCE(AVG(valor_total), 0) AS ticket_medio
         FROM vendas.vendas
        WHERE status = 'finalizada'
          AND criado_em::date = current_date - 1`
    ),
    consultar(
    `SELECT p.forma_pagamento, SUM(p.valor) AS valor, COUNT(*)::int AS quantidade
       FROM vendas.pagamentos p
       JOIN vendas.vendas v ON v.id = p.venda_id
      WHERE v.status = 'finalizada' AND v.criado_em::date = current_date
        GROUP BY p.forma_pagamento
        ORDER BY p.forma_pagamento`
    ),
  ]);

  const variacao = (hoje, anterior) => {
    if (!anterior) return null;
    return Number((((hoje - anterior) / anterior) * 100).toFixed(1));
  };

  const valorHoje = totais[0]?.valor_total_dia ?? 0;
  const ticketHoje = totais[0]?.ticket_medio ?? 0;

  return {
    total_vendas: totais[0]?.total_vendas ?? 0,
    valor_total_dia: valorHoje,
    ticket_medio: ticketHoje,
    por_forma_pagamento: porForma,
    ontem: {
      total_vendas: ontem[0].total_vendas,
      valor_total_dia: ontem[0].valor_total_dia,
      ticket_medio: ontem[0].ticket_medio,
    },
    variacao_pct: {
      valor_total_dia: variacao(valorHoje, ontem[0].valor_total_dia),
      ticket_medio: variacao(ticketHoje, ontem[0].ticket_medio),
    },
  };
}

/**
 * Vendas de um período, para o relatório em planilha.
 * @param {{ de: string, ate: string }} intervalo datas AAAA-MM-DD, inclusivas
 */
export async function listarVendasNoPeriodo({ de, ate }) {
  const { rows } = await consultar(
    `SELECT v.id, v.numero, v.usuario_id, v.status, v.valor_total, v.desconto, v.criado_em,
            v.motivo_cancelamento, v.categoria_cancelamento, cl.nome AS cliente_nome,
            (SELECT COUNT(*) FROM vendas.itens_venda i WHERE i.venda_id = v.id)::int AS total_itens,
            (SELECT SUM(i.quantidade) FROM vendas.itens_venda i WHERE i.venda_id = v.id)::int AS total_unidades,
            (SELECT string_agg(DISTINCT p.forma_pagamento, ' + ')
               FROM vendas.pagamentos p WHERE p.venda_id = v.id) AS formas_pagamento,
            (SELECT string_agg(i.produto_nome, ' | ' ORDER BY i.id)
               FROM vendas.itens_venda i WHERE i.venda_id = v.id) AS produtos,
            EXISTS (SELECT 1 FROM vendas.itens_venda i
                     WHERE i.venda_id = v.id AND i.tipo_controle <> 'livre') AS tem_controlado,
            r.paciente_nome, r.medico_nome, r.medico_crm
       FROM vendas.vendas v
       LEFT JOIN vendas.receitas r ON r.venda_id = v.id
       LEFT JOIN vendas.clientes cl ON cl.id = v.cliente_id
      WHERE v.criado_em::date BETWEEN $1::date AND $2::date
      ORDER BY v.criado_em`,
    [de, ate]
  );
  return rows;
}

/** Itens vendidos no período, agrupados por produto — base do "mais vendidos". */
export async function listarItensNoPeriodo({ de, ate }) {
  const { rows } = await consultar(
    `SELECT i.produto_nome, i.tipo_controle,
            SUM(i.quantidade)::int AS unidades,
            COUNT(DISTINCT i.venda_id)::int AS vendas,
            SUM(i.quantidade * i.preco_unitario) AS receita
       FROM vendas.itens_venda i
       JOIN vendas.vendas v ON v.id = i.venda_id
      WHERE v.status = 'finalizada'
        AND v.criado_em::date BETWEEN $1::date AND $2::date
      GROUP BY i.produto_nome, i.tipo_controle
      ORDER BY unidades DESC, i.produto_nome`,
    [de, ate]
  );
  return rows;
}
