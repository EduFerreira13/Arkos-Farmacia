import { ERROS, TIPO_MOVIMENTACAO } from "@arkos/shared-types";
import { emTransacao } from "./db.js";

/** Erro de regra de negócio — vira resposta HTTP com código estável. */
export class ErroNegocio extends Error {
  constructor(codigo, mensagem, status = 422) {
    super(mensagem);
    this.name = "ErroNegocio";
    this.codigo = codigo;
    this.status = status;
  }
}

/**
 * Entrada de lote: cria (ou soma em) o lote e registra a movimentação de
 * auditoria na mesma transação (docs/REGRAS-NEGOCIO.md §2).
 */
export function registrarEntradaLote({
  produtoId,
  numeroLote,
  quantidade,
  dataValidade,
  motivo,
  usuarioId,
}) {
  return emTransacao(async (cliente) => {
    const { rows: produtos } = await cliente.query(
      `SELECT id FROM estoque.produtos WHERE id = $1`,
      [produtoId]
    );
    if (!produtos.length) {
      throw new ErroNegocio(ERROS.NAO_ENCONTRADO, "Produto não encontrado.", 404);
    }

    // Lote já vencido não entra: não poderia ser vendido de todo jeito (§2).
    const { rows: datas } = await cliente.query(
      `SELECT ($1::date < current_date) AS vencido`,
      [dataValidade]
    );
    if (datas[0].vencido) {
      throw new ErroNegocio(
        ERROS.PRODUTO_VENCIDO,
        "A data de validade informada já passou — lote vencido não pode entrar no estoque."
      );
    }

    const { rows: existentes } = await cliente.query(
      `SELECT id, quantidade FROM estoque.lotes
        WHERE produto_id = $1 AND numero_lote = $2 AND data_validade = $3
        FOR UPDATE`,
      [produtoId, numeroLote, dataValidade]
    );

    let lote;
    if (existentes.length) {
      const { rows } = await cliente.query(
        `UPDATE estoque.lotes SET quantidade = quantidade + $2
          WHERE id = $1
          RETURNING id, produto_id, numero_lote, quantidade, data_validade, data_entrada`,
        [existentes[0].id, quantidade]
      );
      lote = rows[0];
    } else {
      const { rows } = await cliente.query(
        `INSERT INTO estoque.lotes (produto_id, numero_lote, quantidade, data_validade)
              VALUES ($1, $2, $3, $4)
           RETURNING id, produto_id, numero_lote, quantidade, data_validade, data_entrada`,
        [produtoId, numeroLote, quantidade, dataValidade]
      );
      lote = rows[0];
    }

    await cliente.query(
      `INSERT INTO estoque.movimentacoes_estoque
         (produto_id, lote_id, tipo, quantidade, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        produtoId,
        lote.id,
        TIPO_MOVIMENTACAO.ENTRADA,
        quantidade,
        motivo ?? "entrada de lote",
        usuarioId,
      ]
    );

    return lote;
  });
}

/**
 * Saída de estoque pela regra FEFO (docs/REGRAS-NEGOCIO.md §2 e regra crítica
 * de docs/API-CONTRATOS.md): consome sempre o lote que vence primeiro, pulando
 * lote vencido, e pode atravessar mais de um lote se a quantidade exigir.
 *
 * Quem chama não escolhe o lote — só informa produto e quantidade.
 */
export function registrarSaidaFefo({ produtoId, quantidade, motivo, usuarioId }) {
  return emTransacao(async (cliente) => {
    const { rows: produtos } = await cliente.query(
      `SELECT id, nome, venda_sob_encomenda FROM estoque.produtos WHERE id = $1`,
      [produtoId]
    );
    if (!produtos.length) {
      throw new ErroNegocio(ERROS.NAO_ENCONTRADO, "Produto não encontrado.", 404);
    }

    // FOR UPDATE serializa saídas concorrentes do mesmo produto.
    const { rows: lotes } = await cliente.query(
      `SELECT id, numero_lote, quantidade, data_validade
         FROM estoque.lotes
        WHERE produto_id = $1
          AND quantidade > 0
          AND data_validade >= current_date
        ORDER BY data_validade ASC, data_entrada ASC
        FOR UPDATE`,
      [produtoId]
    );

    const disponivel = lotes.reduce((soma, lote) => soma + lote.quantidade, 0);
    if (disponivel < quantidade) {
      throw new ErroNegocio(
        ERROS.ESTOQUE_INSUFICIENTE,
        `Estoque insuficiente para ${produtos[0].nome}: disponível ${disponivel}, pedido ${quantidade}.`
      );
    }

    let restante = quantidade;
    const consumo = [];

    for (const lote of lotes) {
      if (restante <= 0) break;
      const retirar = Math.min(lote.quantidade, restante);

      await cliente.query(`UPDATE estoque.lotes SET quantidade = quantidade - $2 WHERE id = $1`, [
        lote.id,
        retirar,
      ]);

      const { rows: movimentacoes } = await cliente.query(
        `INSERT INTO estoque.movimentacoes_estoque
           (produto_id, lote_id, tipo, quantidade, motivo, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, criado_em`,
        [produtoId, lote.id, TIPO_MOVIMENTACAO.SAIDA, retirar, motivo ?? null, usuarioId]
      );

      consumo.push({
        movimentacao_id: movimentacoes[0].id,
        lote_id: lote.id,
        numero_lote: lote.numero_lote,
        data_validade: lote.data_validade,
        quantidade: retirar,
      });

      restante -= retirar;
    }

    return { produto_id: produtoId, quantidade, lotes: consumo };
  });
}

const SINAL_POR_TIPO = {
  [TIPO_MOVIMENTACAO.PERDA]: -1,
  [TIPO_MOVIMENTACAO.DEVOLUCAO]: +1,
};

/**
 * Ajuste, perda e devolução: o chamador informa o lote (é uma correção
 * pontual, não uma venda) e o motivo é obrigatório — §2 exige justificativa.
 * No ajuste, `quantidade` é a contagem física do lote (inventário).
 */
export function registrarMovimentacaoManual({
  tipo,
  produtoId,
  loteId,
  quantidade,
  motivo,
  usuarioId,
}) {
  return emTransacao(async (cliente) => {
    const { rows: lotes } = await cliente.query(
      `SELECT id, produto_id, quantidade FROM estoque.lotes
        WHERE id = $1 AND produto_id = $2
        FOR UPDATE`,
      [loteId, produtoId]
    );
    if (!lotes.length) {
      throw new ErroNegocio(
        ERROS.NAO_ENCONTRADO,
        "Lote não encontrado para este produto.",
        404
      );
    }

    const lote = lotes[0];
    let novaQuantidade;
    let quantidadeMovimentada;

    if (tipo === TIPO_MOVIMENTACAO.AJUSTE) {
      novaQuantidade = quantidade;
      quantidadeMovimentada = quantidade - lote.quantidade;
    } else {
      const sinal = SINAL_POR_TIPO[tipo];
      novaQuantidade = lote.quantidade + sinal * quantidade;
      quantidadeMovimentada = sinal * quantidade;
    }

    if (novaQuantidade < 0) {
      throw new ErroNegocio(
        ERROS.ESTOQUE_INSUFICIENTE,
        `O lote tem ${lote.quantidade} unidade(s) — a movimentação deixaria saldo negativo.`
      );
    }

    await cliente.query(`UPDATE estoque.lotes SET quantidade = $2 WHERE id = $1`, [
      lote.id,
      novaQuantidade,
    ]);

    // No ajuste, a quantidade gravada é o delta COM SINAL (contagem física menos
    // saldo do sistema): sem isso não se sabe se o inventário achou sobra ou
    // falta. Nos outros tipos o sentido já vem do próprio tipo.
    const quantidadeRegistrada =
      tipo === TIPO_MOVIMENTACAO.AJUSTE ? quantidadeMovimentada : Math.abs(quantidadeMovimentada);

    const { rows } = await cliente.query(
      `INSERT INTO estoque.movimentacoes_estoque
         (produto_id, lote_id, tipo, quantidade, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, produto_id, lote_id, tipo, quantidade, motivo, usuario_id, criado_em`,
      [produtoId, lote.id, tipo, quantidadeRegistrada, motivo, usuarioId]
    );

    return {
      movimentacao: rows[0],
      lote: { id: lote.id, quantidade_anterior: lote.quantidade, quantidade_atual: novaQuantidade },
    };
  });
}
