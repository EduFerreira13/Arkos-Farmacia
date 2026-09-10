import { PERFIS } from "@arkos/shared-types";

/**
 * Limite de desconto do perfil, em porcentagem (docs/REGRAS-NEGOCIO.md §3).
 *
 * Implementação canônica — antes duplicada em `packages/auth-middleware` e em
 * `apps/web/src/lib/autenticacao.jsx`; os dois pontos agora reexportam esta.
 *
 * @param {{ perfil?: string, permissoes?: Record<string, unknown> }} usuario
 * @returns {number}
 */
export function descontoMaximoPct(usuario) {
  if (!usuario) return 0;
  if (usuario.perfil === PERFIS.ADMINISTRADOR) return 100;
  if (usuario.permissoes?.acesso_total === true) return 100;
  const limite = Number(usuario.permissoes?.desconto_max_pct ?? 0);
  return Number.isFinite(limite) ? limite : 0;
}

/** Converte um percentual em valor monetário sobre uma base, com 2 casas. */
export function descontoPorPercentual(baseValor, percentual) {
  return Number(((baseValor * percentual) / 100).toFixed(2));
}

/**
 * Teto de desconto por perfil, verificado sobre o ACUMULADO de todos os
 * descontos da venda (itens + venda), nunca sobre o desconto isolado da
 * chamada atual — replica `apps/api/src/modulos/vendas/rotas.js` (bloco
 * repetido nas rotas de desconto por item e por venda).
 *
 * @param {{ bruto: number, totalDescontado: number, usuario: object, tolerancia?: number }} params
 */
export function validarTetoDesconto({ bruto, totalDescontado, usuario, tolerancia = 0.01 }) {
  const limitePct = descontoMaximoPct(usuario);
  const pctPedido = bruto > 0 ? (totalDescontado / bruto) * 100 : 0;
  return { valido: pctPedido - limitePct <= tolerancia, limitePct, pctPedido };
}
