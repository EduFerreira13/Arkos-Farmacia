import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brutoDaVenda,
  calcularTroco,
  descontoMaximoPct,
  descontoPorPercentual,
  totalPago,
  validarFinalizacao,
  validarItens,
  validarPagamentoSuficiente,
  validarProdutoNaoVencido,
  validarReceitaObrigatoria,
  validarTetoDesconto,
  valorTotalVenda,
} from "../src/index.js";

test("valorTotalVenda replica a fórmula do recalcularTotal em SQL", () => {
  const itens = [
    { quantidade: 2, preco_unitario: 10, desconto: 1 }, // 20 - 1 = 19
    { quantidade: 1, preco_unitario: 5, desconto: 0 }, // 5
  ];
  // SQL: GREATEST(SUM(qtd*preco - desconto_item) - desconto_venda, 0)
  assert.equal(valorTotalVenda({ itens, descontoVenda: 4 }), 20); // (19+5) - 4
  assert.equal(valorTotalVenda({ itens, descontoVenda: 0 }), 24);
});

test("valorTotalVenda nunca fica negativo mesmo com desconto maior que o bruto", () => {
  const itens = [{ quantidade: 1, preco_unitario: 10, desconto: 0 }];
  assert.equal(valorTotalVenda({ itens, descontoVenda: 999 }), 0);
});

test("brutoDaVenda soma quantidade*preco sem descontar nada", () => {
  const itens = [
    { quantidade: 3, preco_unitario: 2 },
    { quantidade: 1, preco_unitario: 10 },
  ];
  assert.equal(brutoDaVenda(itens), 16);
});

test("descontoMaximoPct: administrador e acesso_total sempre 100%, os demais usam desconto_max_pct", () => {
  assert.equal(descontoMaximoPct(null), 0);
  assert.equal(descontoMaximoPct({ perfil: "administrador" }), 100);
  assert.equal(descontoMaximoPct({ perfil: "gerente", permissoes: { acesso_total: true } }), 100);
  assert.equal(descontoMaximoPct({ perfil: "operador_caixa", permissoes: { desconto_max_pct: 5 } }), 5);
  assert.equal(descontoMaximoPct({ perfil: "operador_caixa" }), 0);
});

test("descontoPorPercentual arredonda em 2 casas", () => {
  assert.equal(descontoPorPercentual(99.99, 10), 10);
});

test("validarTetoDesconto verifica o ACUMULADO contra o bruto, não o desconto isolado", () => {
  const usuario = { perfil: "operador_caixa", permissoes: { desconto_max_pct: 5 } };
  // bruto 100, já tinha 4 de desconto de outro item, mais 1 agora = 5% exato: passa.
  const dentroDoLimite = validarTetoDesconto({ bruto: 100, totalDescontado: 5, usuario });
  assert.equal(dentroDoLimite.valido, true);

  // Mesmo teto, mas o acumulado (itens + venda) já passou de 5%.
  const acimaDoLimite = validarTetoDesconto({ bruto: 100, totalDescontado: 5.5, usuario });
  assert.equal(acimaDoLimite.valido, false);
  assert.equal(acimaDoLimite.limitePct, 5);
});

test("validarPagamentoSuficiente aceita a tolerância de meio centavo e pagamento a maior (troco)", () => {
  assert.equal(validarPagamentoSuficiente({ totalPago: 19.995, valorTotal: 20 }), true);
  assert.equal(validarPagamentoSuficiente({ totalPago: 19.99, valorTotal: 20 }), false);
  assert.equal(validarPagamentoSuficiente({ totalPago: 50, valorTotal: 20 }), true);
});

test("totalPago soma todos os pagamentos e calcularTroco nunca bloqueia pagamento a maior", () => {
  const pagamentos = [{ valor: 30 }, { valor: 20 }];
  assert.equal(totalPago(pagamentos), 50);
  assert.equal(calcularTroco(50, 45), 5);
});

test("validarItens bloqueia venda sem item", () => {
  assert.equal(validarItens([]).valido, false);
  assert.equal(validarItens([{ quantidade: 1, preco_unitario: 1 }]).valido, true);
});

test("validarReceitaObrigatoria bloqueia item controlado sem receita, mas libera item livre", () => {
  const controlado = [{ tipo_controle: "tarja_preta" }];
  assert.equal(validarReceitaObrigatoria({ itens: controlado, receita: null }).valido, false);
  assert.equal(validarReceitaObrigatoria({ itens: controlado, receita: {} }).valido, true);
  assert.equal(
    validarReceitaObrigatoria({ itens: [{ tipo_controle: "livre" }], receita: null }).valido,
    true
  );
});

test("validarProdutoNaoVencido bloqueia sem lote válido, vencido ou vencendo hoje; libera vencimento futuro", () => {
  const hoje = "2026-09-10";
  assert.equal(validarProdutoNaoVencido({ data_validade_proximo_lote: null }, hoje).valido, false);
  assert.equal(
    validarProdutoNaoVencido({ data_validade_proximo_lote: "2026-09-09" }, hoje).valido,
    false
  );
  // Vence hoje: tratado como vencido (margem de segurança do catálogo offline).
  assert.equal(
    validarProdutoNaoVencido({ data_validade_proximo_lote: "2026-09-10" }, hoje).valido,
    false
  );
  assert.equal(
    validarProdutoNaoVencido({ data_validade_proximo_lote: "2026-09-11" }, hoje).valido,
    true
  );
});

test("validarFinalizacao acumula todos os erros e calcula total/troco quando válida", () => {
  const usuario = { perfil: "operador_caixa", permissoes: { desconto_max_pct: 100 } };

  const semItem = validarFinalizacao({ itens: [], receita: null, pagamentos: [], usuario });
  assert.equal(semItem.valido, false);
  assert.equal(semItem.erros.length, 1);

  // Controlado sem receita E pagamento insuficiente: os dois erros aparecem juntos.
  const comControladoEPagamentoInsuficiente = validarFinalizacao({
    itens: [{ quantidade: 1, preco_unitario: 100, desconto: 0, tipo_controle: "tarja_preta" }],
    receita: null,
    pagamentos: [{ valor: 10 }],
    usuario,
  });
  assert.equal(comControladoEPagamentoInsuficiente.valido, false);
  assert.equal(comControladoEPagamentoInsuficiente.erros.length, 2);

  const valida = validarFinalizacao({
    itens: [{ quantidade: 2, preco_unitario: 10, desconto: 0, tipo_controle: "livre" }],
    receita: null,
    pagamentos: [{ valor: 25 }],
    descontoVenda: 0,
    usuario,
  });
  assert.equal(valida.valido, true);
  assert.equal(valida.valores.valorTotal, 20);
  assert.equal(valida.valores.troco, 5);
});
