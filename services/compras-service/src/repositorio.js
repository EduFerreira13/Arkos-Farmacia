import { consultar, emTransacao } from "./db.js";

/** Acesso ao schema `compras`. */

export async function listarPedidos({ status, de, ate } = {}) {
  const condicoes = [];
  const valores = [];

  if (status) {
    valores.push(status);
    condicoes.push(`p.status = $${valores.length}`);
  }
  if (de) {
    valores.push(de);
    condicoes.push(`p.criado_em::date >= $${valores.length}::date`);
  }
  if (ate) {
    valores.push(ate);
    condicoes.push(`p.criado_em::date <= $${valores.length}::date`);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await consultar(
    `SELECT p.id, p.fornecedor_id, p.fornecedor_nome, p.status, p.observacao,
            p.motivo_cancelamento, p.valor_total, p.usuario_id,
            p.criado_em, p.enviado_em, p.recebido_em,
            (SELECT COUNT(*) FROM compras.itens_pedido i WHERE i.pedido_id = p.id)::int AS total_itens,
            (SELECT SUM(i.quantidade) FROM compras.itens_pedido i WHERE i.pedido_id = p.id)::int AS total_unidades,
            EXISTS (
              SELECT 1 FROM compras.recebimentos r
               WHERE r.pedido_id = p.id AND r.tem_divergencia
            ) AS teve_divergencia
       FROM compras.pedidos p
       ${onde}
      ORDER BY p.criado_em DESC
      LIMIT 300`,
    valores
  );
  return rows;
}

export async function buscarPedido(id) {
  const { rows } = await consultar(
    `SELECT id, fornecedor_id, fornecedor_nome, status, observacao, motivo_cancelamento,
            valor_total, usuario_id, criado_em, enviado_em, recebido_em
       FROM compras.pedidos WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarItens(pedidoId) {
  const { rows } = await consultar(
    `SELECT id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario
       FROM compras.itens_pedido WHERE pedido_id = $1 ORDER BY produto_nome`,
    [pedidoId]
  );
  return rows;
}

export async function listarRecebimentos(pedidoId) {
  const { rows } = await consultar(
    `SELECT r.id, r.pedido_id, r.usuario_id, r.observacao, r.tem_divergencia, r.recebido_em,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id,
                  'produto_id', i.produto_id,
                  'produto_nome', i.produto_nome,
                  'quantidade_pedida', i.quantidade_pedida,
                  'quantidade_recebida', i.quantidade_recebida,
                  'numero_lote', i.numero_lote,
                  'data_validade', i.data_validade,
                  'divergencia', i.divergencia
                ) ORDER BY i.produto_nome
              ) FILTER (WHERE i.id IS NOT NULL), '[]'
            ) AS itens
       FROM compras.recebimentos r
       LEFT JOIN compras.itens_recebimento i ON i.recebimento_id = r.id
      WHERE r.pedido_id = $1
      GROUP BY r.id
      ORDER BY r.recebido_em DESC`,
    [pedidoId]
  );
  return rows;
}

export async function buscarPedidoCompleto(id) {
  const pedido = await buscarPedido(id);
  if (!pedido) return null;
  const [itens, recebimentos] = await Promise.all([listarItens(id), listarRecebimentos(id)]);
  return { ...pedido, itens, recebimentos };
}

/** Cria o pedido e seus itens na mesma transação, já com o total somado. */
export function criarPedido({ fornecedorId, fornecedorNome, observacao, usuarioId, itens }) {
  return emTransacao(async (cliente) => {
    const total = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);

    const { rows } = await cliente.query(
      `INSERT INTO compras.pedidos
         (fornecedor_id, fornecedor_nome, observacao, usuario_id, valor_total)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [fornecedorId, fornecedorNome, observacao ?? null, usuarioId, Number(total.toFixed(2))]
    );
    const pedidoId = rows[0].id;

    for (const item of itens) {
      await cliente.query(
        `INSERT INTO compras.itens_pedido
           (pedido_id, produto_id, produto_nome, quantidade, preco_unitario)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario]
      );
    }

    return pedidoId;
  });
}

export async function marcarEnviado(pedidoId) {
  const { rows } = await consultar(
    `UPDATE compras.pedidos
        SET status = 'enviado', enviado_em = now()
      WHERE id = $1 AND status = 'rascunho'
      RETURNING id, status, enviado_em`,
    [pedidoId]
  );
  return rows[0] ?? null;
}

export async function marcarCancelado({ pedidoId, motivo }) {
  const { rows } = await consultar(
    `UPDATE compras.pedidos
        SET status = 'cancelado', motivo_cancelamento = $2
      WHERE id = $1 AND status IN ('rascunho', 'enviado')
      RETURNING id, status, motivo_cancelamento`,
    [pedidoId, motivo]
  );
  return rows[0] ?? null;
}

/**
 * Registra o recebimento conferido item a item (§4): grava as quantidades, a
 * divergência de cada linha e marca o pedido como recebido.
 */
export function registrarRecebimento({ pedidoId, usuarioId, observacao, itens }) {
  return emTransacao(async (cliente) => {
    const temDivergencia = itens.some((item) => item.divergencia !== 0);

    const { rows } = await cliente.query(
      `INSERT INTO compras.recebimentos (pedido_id, usuario_id, observacao, tem_divergencia)
            VALUES ($1, $2, $3, $4)
         RETURNING id, recebido_em`,
      [pedidoId, usuarioId, observacao ?? null, temDivergencia]
    );
    const recebimentoId = rows[0].id;

    for (const item of itens) {
      await cliente.query(
        `INSERT INTO compras.itens_recebimento
           (recebimento_id, item_pedido_id, produto_id, produto_nome, quantidade_pedida,
            quantidade_recebida, numero_lote, data_validade, divergencia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          recebimentoId,
          item.item_pedido_id,
          item.produto_id,
          item.produto_nome,
          item.quantidade_pedida,
          item.quantidade_recebida,
          item.numero_lote,
          item.data_validade,
          item.divergencia,
        ]
      );
    }

    await cliente.query(
      `UPDATE compras.pedidos SET status = 'recebido', recebido_em = now() WHERE id = $1`,
      [pedidoId]
    );

    return { recebimento_id: recebimentoId, tem_divergencia: temDivergencia };
  });
}

/** Pedidos do período para o relatório em planilha. */
export async function listarPedidosNoPeriodo({ de, ate }) {
  const { rows } = await consultar(
    `SELECT p.criado_em, p.fornecedor_nome, p.status, p.valor_total, p.observacao,
            p.enviado_em, p.recebido_em, p.usuario_id,
            (SELECT string_agg(i.produto_nome || ' x' || i.quantidade, ' | ' ORDER BY i.produto_nome)
               FROM compras.itens_pedido i WHERE i.pedido_id = p.id) AS itens,
            EXISTS (
              SELECT 1 FROM compras.recebimentos r WHERE r.pedido_id = p.id AND r.tem_divergencia
            ) AS teve_divergencia
       FROM compras.pedidos p
      WHERE p.criado_em::date BETWEEN $1::date AND $2::date
      ORDER BY p.criado_em`,
    [de, ate]
  );
  return rows;
}
