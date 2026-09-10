/**
 * Matemática pura da venda: sem I/O, sem depender de banco. Roda tanto no
 * `apps/api` (validação no servidor) quanto no navegador (PDV offline).
 *
 * `valorTotalVenda` replica, em JS, a fórmula que hoje só existe em SQL
 * (`apps/api/src/modulos/vendas/repositorio.js`, `recalcularTotal`):
 *   valor_total = max(0, Σ(quantidade*preço − desconto_item) − desconto_venda)
 * Isso passa a ser a fonte de verdade tanto para o cálculo offline no
 * navegador quanto para o endpoint de sincronização — o SQL incremental
 * continua existindo, sem mudança, para o fluxo online passo a passo.
 */

/** Arredonda para 2 casas decimais, igual ao `numeric(10,2)` do banco. */
export function arredondarMoeda(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

/** Subtotal bruto do item, antes de qualquer desconto. */
export function subtotalItem({ quantidade, preco_unitario }) {
  return quantidade * preco_unitario;
}

/** Soma dos subtotais brutos de todos os itens (sem descontos). */
export function brutoDaVenda(itens) {
  return itens.reduce((soma, item) => soma + subtotalItem(item), 0);
}

/** Soma dos descontos já aplicados item a item. */
export function descontoTotalItens(itens) {
  return itens.reduce((soma, item) => soma + Number(item.desconto ?? 0), 0);
}

/**
 * Total da venda: mesma fórmula do `recalcularTotal` em SQL, nunca negativo.
 * @param {{ itens: Array<{quantidade:number, preco_unitario:number, desconto?:number}>, descontoVenda?: number }} params
 */
export function valorTotalVenda({ itens, descontoVenda = 0 }) {
  const liquidoDosItens = itens.reduce(
    (soma, item) => soma + (subtotalItem(item) - Number(item.desconto ?? 0)),
    0
  );
  return Math.max(0, arredondarMoeda(liquidoDosItens - Number(descontoVenda ?? 0)));
}

/** Soma de todos os pagamentos registrados. */
export function totalPago(pagamentos) {
  return pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
}

/** Troco: pagamentos acima do total nunca são bloqueados, viram troco. */
export function calcularTroco(totalPagoValor, valorTotal) {
  return arredondarMoeda(totalPagoValor - valorTotal);
}
