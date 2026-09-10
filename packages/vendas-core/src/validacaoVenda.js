import { ERROS, exigeReceita } from "@arkos/shared-types";
import { brutoDaVenda, calcularTroco, descontoTotalItens, totalPago, valorTotalVenda } from "./calculos.js";
import { validarTetoDesconto } from "./descontos.js";
import { validarPagamentoSuficiente } from "./pagamento.js";

/**
 * Venda sem item não finaliza (`apps/api/.../rotas.js`, `/finalizar`).
 * @param {Array} itens
 */
export function validarItens(itens) {
  if (!itens?.length) {
    return {
      valido: false,
      erro: { codigo: ERROS.DADOS_INVALIDOS, mensagem: "Não é possível finalizar uma venda sem itens." },
    };
  }
  return { valido: true };
}

/**
 * Regra crítica (docs/REGRAS-NEGOCIO.md §3/§8): item com `tipo_controle`
 * diferente de `livre` só pode ser vendido com receita vinculada. Bloqueio
 * duro, não flexibilizado offline.
 * @param {{ itens: Array<{tipo_controle?: string}>, receita: object|null }} params
 */
export function validarReceitaObrigatoria({ itens, receita }) {
  const controlados = itens.filter((item) => exigeReceita(item.tipo_controle));
  if (controlados.length && !receita) {
    return {
      valido: false,
      controlados,
      erro: { codigo: ERROS.RECEITA_OBRIGATORIA, mensagem: "Item controlado sem receita vinculada." },
    };
  }
  return { valido: true, controlados };
}

/**
 * Regra sanitária, bloqueio duro (docs/REGRAS-NEGOCIO.md §1/§8): produto sem
 * lote válido (não vencido) não pode ser vendido. Recebe o produto já
 * resolvido do catálogo cacheado (campo `data_validade_proximo_lote` — a
 * validade do lote não vencido que vence primeiro, o mesmo que o servidor usa
 * por FEFO em `apps/api/src/modulos/vendas/rotas.js:861-864`).
 *
 * Deliberadamente um dia mais rígido que o servidor (que só bloqueia
 * `data_validade < hoje`): como o catálogo offline pode estar levemente
 * desatualizado, "vence hoje" já é tratado como vencido — margem de segurança
 * para o intervalo entre sincronizações do catálogo.
 *
 * @param {{ nome?: string, data_validade_proximo_lote?: string|null }} produtoCache
 * @param {string} [dataReferencia] Data ISO (YYYY-MM-DD); padrão: hoje.
 */
export function validarProdutoNaoVencido(produtoCache, dataReferencia) {
  const hoje = dataReferencia ?? new Date().toISOString().slice(0, 10);
  const validade = produtoCache?.data_validade_proximo_lote;
  if (!validade || validade <= hoje) {
    return {
      valido: false,
      erro: {
        codigo: ERROS.PRODUTO_VENCIDO,
        mensagem: `${produtoCache?.nome ?? "Produto"} vencido ou sem lote válido disponível.`,
      },
    };
  }
  return { valido: true };
}

/**
 * Ponto de entrada único: compõe as validações duras de finalização, mais o
 * teto de desconto acumulado e o total/troco. Usado tanto pelo `/finalizar`
 * de hoje (online, passo a passo) quanto pelo novo endpoint de sincronização
 * offline e pelo PDV rodando sem rede.
 *
 * @param {{
 *   itens: Array<{quantidade:number, preco_unitario:number, desconto?:number, tipo_controle?:string}>,
 *   receita: object|null,
 *   pagamentos: Array<{valor:number}>,
 *   descontoVenda?: number,
 *   usuario: object,
 * }} params
 */
export function validarFinalizacao({ itens, receita, pagamentos, descontoVenda = 0, usuario }) {
  const erros = [];

  const resultadoItens = validarItens(itens);
  if (!resultadoItens.valido) erros.push(resultadoItens.erro);

  const resultadoReceita = validarReceitaObrigatoria({ itens, receita });
  if (!resultadoReceita.valido) erros.push(resultadoReceita.erro);

  const bruto = brutoDaVenda(itens);
  const totalDescontado = descontoTotalItens(itens) + Number(descontoVenda ?? 0);
  const teto = validarTetoDesconto({ bruto, totalDescontado, usuario });
  if (!teto.valido) {
    erros.push({
      codigo: ERROS.DESCONTO_ACIMA_DO_LIMITE,
      mensagem: `Somando os descontos da venda dá ${teto.pctPedido.toFixed(1)}%, e o perfil vai até ${teto.limitePct}%.`,
    });
  }

  const valorTotal = valorTotalVenda({ itens, descontoVenda });
  const pago = totalPago(pagamentos ?? []);
  if (!validarPagamentoSuficiente({ totalPago: pago, valorTotal })) {
    erros.push({
      codigo: ERROS.PAGAMENTO_INSUFICIENTE,
      mensagem: `Pagamentos somam ${pago.toFixed(2)} e a venda é ${valorTotal.toFixed(2)}.`,
    });
  }

  return {
    valido: erros.length === 0,
    erros,
    valores: { bruto, valorTotal, totalPago: pago, troco: calcularTroco(pago, valorTotal) },
  };
}
