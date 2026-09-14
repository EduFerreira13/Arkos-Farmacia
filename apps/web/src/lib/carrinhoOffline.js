/**
 * Monta e valida uma venda inteira no navegador, sem chamada de API — usa
 * @arkos/vendas-core para todo cálculo e validação, a mesma lógica que o
 * servidor roda em `/finalizar` e em `/vendas/sincronizar-offline`
 * (apps/api/src/modulos/vendas/rotas.js). Nenhuma regra de negócio é
 * reescrita aqui — só a orquestração do carrinho local.
 *
 * Funções puras: recebem a venda local e devolvem uma nova (nunca mutam em
 * lugar), ou lançam `ErroCarrinhoOffline` com a mesma mensagem que a API
 * devolveria — o chamador (PDV.jsx) já sabe mostrar `erro.message`, seja a
 * falha de uma chamada de rede ou de uma validação local.
 */

import {
  brutoDaVenda,
  calcularTroco,
  descontoPorPercentual,
  descontoTotalItens,
  totalPago,
  validarFinalizacao,
  validarProdutoNaoVencido,
  validarTetoDesconto,
  valorTotalVenda,
} from "@arkos/vendas-core";

export class ErroCarrinhoOffline extends Error {}

/** Nova venda local — `origem_local: true` marca que ela nunca existiu no servidor. */
export function criarVendaLocal() {
  return {
    id: crypto.randomUUID(),
    origem_local: true,
    status: "aberta",
    criado_em_offline: new Date().toISOString(),
    cliente_id: null,
    desconto: 0,
    itens: [],
    pagamentos: [],
    receita: null,
  };
}

function recalcularTotal(venda) {
  return { ...venda, valor_total: valorTotalVenda({ itens: venda.itens, descontoVenda: venda.desconto }) };
}

function validarTetoOuFalhar(bruto, totalDescontado, usuarioSessao) {
  const teto = validarTetoDesconto({ bruto, totalDescontado, usuario: usuarioSessao });
  if (!teto.valido) {
    throw new ErroCarrinhoOffline(
      `Somando os descontos da venda dá ${teto.pctPedido.toFixed(1)}%, e seu perfil vai até ${teto.limitePct}%.`
    );
  }
}

/**
 * Mesmo comportamento de `POST /:id/itens`: soma na linha já existente do
 * mesmo produto, e bloqueia duro produto sem lote válido (vencido, ou sem
 * validade conhecida no catálogo local).
 */
export function adicionarItemLocal(venda, produtoCatalogo, quantidade = 1) {
  const validacaoVencido = validarProdutoNaoVencido(produtoCatalogo);
  if (!validacaoVencido.valido) {
    throw new ErroCarrinhoOffline(validacaoVencido.erro.mensagem);
  }

  const existente = venda.itens.find((item) => item.produto_id === produtoCatalogo.id);
  const itens = existente
    ? venda.itens.map((item) =>
        item.id === existente.id ? { ...item, quantidade: item.quantidade + quantidade } : item
      )
    : [
        ...venda.itens,
        {
          id: crypto.randomUUID(),
          produto_id: produtoCatalogo.id,
          produto_nome: produtoCatalogo.nome,
          tipo_controle: produtoCatalogo.tipo_controle,
          quantidade,
          preco_unitario: produtoCatalogo.preco_venda,
          desconto: 0,
        },
      ];

  return recalcularTotal({ ...venda, itens });
}

export function alterarQuantidadeLocal(venda, itemId, quantidade) {
  if (quantidade < 1) {
    throw new ErroCarrinhoOffline("quantidade precisa ser um inteiro maior que zero.");
  }
  const itens = venda.itens.map((item) => (item.id === itemId ? { ...item, quantidade } : item));
  return recalcularTotal({ ...venda, itens });
}

export function removerItemLocal(venda, itemId) {
  return recalcularTotal({ ...venda, itens: venda.itens.filter((item) => item.id !== itemId) });
}

/** Mesma regra de `POST /:id/itens/:itemId/desconto`: teto sobre o ACUMULADO da venda, não o desconto isolado. */
export function descontarItemLocal(venda, itemId, valor, tipo, usuarioSessao) {
  const item = venda.itens.find((registro) => registro.id === itemId);
  if (!item) return venda;

  const brutoDoItem = item.quantidade * item.preco_unitario;
  const desconto = tipo === "pct" ? descontoPorPercentual(brutoDoItem, valor) : valor;
  if (desconto > brutoDoItem) {
    throw new ErroCarrinhoOffline("O desconto não pode ser maior que o valor do item.");
  }

  const outrosDescontos = descontoTotalItens(venda.itens.filter((registro) => registro.id !== itemId));
  const bruto = brutoDaVenda(venda.itens);
  validarTetoOuFalhar(bruto, desconto + outrosDescontos + Number(venda.desconto ?? 0), usuarioSessao);

  const itens = venda.itens.map((registro) => (registro.id === itemId ? { ...registro, desconto } : registro));
  return recalcularTotal({ ...venda, itens });
}

/** Mesma regra de `POST /:id/desconto`: desconto da venda inteira, aceita reais ou percentual. */
export function aplicarDescontoLocal(venda, valor, tipo, usuarioSessao) {
  const bruto = brutoDaVenda(venda.itens);
  const descontoNosItens = descontoTotalItens(venda.itens);
  const desconto = tipo === "pct" ? descontoPorPercentual(bruto, valor) : valor;
  if (desconto + descontoNosItens > bruto) {
    throw new ErroCarrinhoOffline("O desconto não pode ser maior que o valor dos itens.");
  }

  validarTetoOuFalhar(bruto, desconto + descontoNosItens, usuarioSessao);
  return recalcularTotal({ ...venda, desconto });
}

export function vincularReceitaLocal(venda, receita) {
  return { ...venda, receita };
}

export function removerReceitaLocal(venda) {
  return { ...venda, receita: null };
}

export function adicionarPagamentoLocal(venda, formaPagamento, valor) {
  return {
    ...venda,
    pagamentos: [...venda.pagamentos, { id: crypto.randomUUID(), forma_pagamento: formaPagamento, valor }],
  };
}

export function removerPagamentoLocal(venda, pagamentoId) {
  return { ...venda, pagamentos: venda.pagamentos.filter((pagamento) => pagamento.id !== pagamentoId) };
}

/**
 * Valida a venda inteira (mesmas regras de `POST /vendas/sincronizar-offline`
 * — receita obrigatória, teto de desconto, pagamento suficiente) e monta o
 * payload pronto para a fila. Quem chama decide gravar (`adicionarVendaPendente`,
 * em `bancoOffline.js`) e limpar o carrinho — esta função não toca no IndexedDB.
 */
export function finalizarVendaLocal(venda, usuarioSessao, { cpfNota = null } = {}) {
  const validacao = validarFinalizacao({
    itens: venda.itens,
    receita: venda.receita,
    pagamentos: venda.pagamentos,
    descontoVenda: venda.desconto,
    usuario: usuarioSessao,
  });
  if (!validacao.valido) {
    throw new ErroCarrinhoOffline(validacao.erros[0].mensagem);
  }

  const payload = {
    id: venda.id,
    criado_em_offline: venda.criado_em_offline,
    cliente_id: venda.cliente_id ?? null,
    itens: venda.itens.map(
      ({ produto_id, quantidade, preco_unitario, desconto, produto_nome, tipo_controle }) => ({
        produto_id,
        quantidade,
        preco_unitario,
        desconto,
        produto_nome,
        tipo_controle,
      })
    ),
    desconto_venda: venda.desconto,
    receita: venda.receita ?? null,
    pagamentos: venda.pagamentos.map(({ forma_pagamento, valor }) => ({ forma_pagamento, valor })),
    cpf_nota: cpfNota || null,
  };

  return {
    payload,
    troco: calcularTroco(totalPago(venda.pagamentos), validacao.valores.valorTotal),
  };
}
