import { consultar, emTransacao } from "../../db.js";

/** Acesso ao schema `compras`. */

/** Colunas do pedido usadas em toda listagem — o número vem primeiro. */
const CAMPOS_PEDIDO = `p.id, p.numero, p.fornecedor_id, p.fornecedor_nome, p.status,
       p.forma_pagamento, p.frete, p.desconto, p.observacao, p.motivo_cancelamento,
       p.valor_total, p.usuario_id, p.criado_em, p.recebido_em, p.entregue_em`;

/**
 * Filtros da tela: situação, período de criação, forma de pagamento,
 * fornecedor e busca livre — que pega o número do pedido, o fornecedor e o
 * nome dos produtos pedidos.
 *
 * @param {{ status?: string, de?: string, ate?: string, forma_pagamento?: string,
 *   fornecedor_id?: string, busca?: string }} filtros
 */
function condicoesDePedido(filtros = {}) {
  const condicoes = [];
  const valores = [];

  if (filtros.status) {
    valores.push(filtros.status);
    condicoes.push(`p.status = $${valores.length}`);
  }
  if (filtros.de) {
    valores.push(filtros.de);
    condicoes.push(`p.criado_em::date >= $${valores.length}::date`);
  }
  if (filtros.ate) {
    valores.push(filtros.ate);
    condicoes.push(`p.criado_em::date <= $${valores.length}::date`);
  }
  if (filtros.forma_pagamento) {
    valores.push(filtros.forma_pagamento);
    condicoes.push(`p.forma_pagamento = $${valores.length}`);
  }
  if (filtros.fornecedor_id) {
    valores.push(filtros.fornecedor_id);
    condicoes.push(`p.fornecedor_id = $${valores.length}`);
  }
  if (filtros.busca) {
    valores.push(`%${filtros.busca}%`);
    condicoes.push(
      `(p.numero ILIKE $${valores.length} OR p.fornecedor_nome ILIKE $${valores.length}
        OR EXISTS (SELECT 1 FROM compras.itens_pedido i
                    WHERE i.pedido_id = p.id AND i.produto_nome ILIKE $${valores.length}))`
    );
  }

  return { onde: condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "", valores };
}

export async function listarPedidos(filtros = {}) {
  const { onde, valores } = condicoesDePedido(filtros);
  const { rows } = await consultar(
    `SELECT ${CAMPOS_PEDIDO},
            (SELECT COUNT(*) FROM compras.itens_pedido i WHERE i.pedido_id = p.id)::int AS total_itens,
            (SELECT SUM(i.quantidade) FROM compras.itens_pedido i WHERE i.pedido_id = p.id)::int AS total_unidades
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
    `SELECT ${CAMPOS_PEDIDO} FROM compras.pedidos p WHERE p.id = $1`,
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

/**
 * Cria o pedido e seus itens na mesma transação. O total é itens + frete -
 * desconto: é esse valor que vira conta a pagar quando a mercadoria chega.
 *
 * O número (PC-AAAA-00001) sai do default da tabela, então dois pedidos criados
 * no mesmo instante não brigam pelo mesmo número.
 */
export function criarPedido({
  fornecedorId,
  fornecedorNome,
  formaPagamento,
  frete = 0,
  desconto = 0,
  usuarioId,
  itens,
}) {
  return emTransacao(async (cliente) => {
    const itensTotal = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
    const total = Math.max(itensTotal + Number(frete) - Number(desconto), 0);

    const { rows } = await cliente.query(
      `INSERT INTO compras.pedidos
         (fornecedor_id, fornecedor_nome, forma_pagamento, frete, desconto,
          usuario_id, valor_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        fornecedorId,
        fornecedorNome,
        formaPagamento,
        Number(Number(frete).toFixed(2)),
        Number(Number(desconto).toFixed(2)),
        usuarioId,
        Number(total.toFixed(2)),
      ]
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

export async function marcarCancelado({ pedidoId, motivo }) {
  const { rows } = await consultar(
    `UPDATE compras.pedidos
        SET status = 'cancelado', motivo_cancelamento = $2
      WHERE id = $1 AND status = 'pendente_entrega'
      RETURNING id, status, motivo_cancelamento`,
    [pedidoId, motivo]
  );
  return rows[0] ?? null;
}

/**
 * Registra o recebimento conferido item a item (§4): grava as quantidades, a
 * divergência de cada linha e marca o pedido como recebido.
 */
export function registrarRecebimento({ pedidoId, usuarioId, entregueEm, itens }) {
  return emTransacao(async (cliente) => {
    const temDivergencia = itens.some((item) => item.divergencia !== 0);

    const { rows } = await cliente.query(
      `INSERT INTO compras.recebimentos (pedido_id, usuario_id, tem_divergencia)
            VALUES ($1, $2, $3)
         RETURNING id, recebido_em`,
      [pedidoId, usuarioId, temDivergencia]
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
      `UPDATE compras.pedidos
          SET status = 'recebido', recebido_em = now(),
              entregue_em = COALESCE($2::date, current_date)
        WHERE id = $1`,
      [pedidoId, entregueEm ?? null]
    );

    return { recebimento_id: recebimentoId, tem_divergencia: temDivergencia };
  });
}

/** Pedidos para o relatório em planilha, com os mesmos filtros da tela. */
export async function listarPedidosNoPeriodo(filtros) {
  const { onde, valores } = condicoesDePedido(filtros);
  const { rows } = await consultar(
    `SELECT p.numero, p.criado_em, p.fornecedor_nome, p.status, p.forma_pagamento,
            p.frete, p.desconto, p.valor_total, p.recebido_em, p.entregue_em, p.usuario_id,
            p.motivo_cancelamento,
            (SELECT string_agg(i.produto_nome || ' x' || i.quantidade, ' | ' ORDER BY i.produto_nome)
               FROM compras.itens_pedido i WHERE i.pedido_id = p.id) AS itens,
            (SELECT SUM(i.quantidade) FROM compras.itens_pedido i WHERE i.pedido_id = p.id)::int
              AS total_unidades
       FROM compras.pedidos p
       ${onde}
      ORDER BY p.criado_em`,
    valores
  );
  return rows;
}
