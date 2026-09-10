/** Tolerância para comparar dinheiro em ponto flutuante (mesma de `rotas.js`). */
export const TOLERANCIA_PAGAMENTO = 0.005;

/**
 * Pagamentos precisam somar pelo menos o total da venda — pagar a mais é
 * permitido e vira troco, não há teto (`apps/api/.../rotas.js`, `/finalizar`).
 */
export function validarPagamentoSuficiente({ totalPago, valorTotal, tolerancia = TOLERANCIA_PAGAMENTO }) {
  return totalPago + tolerancia >= valorTotal;
}
