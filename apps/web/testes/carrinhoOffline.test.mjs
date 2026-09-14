/**
 * Testa o carrinho offline (monta e valida uma venda no navegador, sem
 * chamada de API) — usa @arkos/vendas-core de verdade, não um mock, então
 * também confere que a integração entre os dois pacotes está correta.
 *
 * Uso: npm run test:offline --workspace=apps/web
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ErroCarrinhoOffline,
  adicionarItemLocal,
  adicionarPagamentoLocal,
  alterarQuantidadeLocal,
  aplicarDescontoLocal,
  criarVendaLocal,
  descontarItemLocal,
  finalizarVendaLocal,
  removerItemLocal,
  removerPagamentoLocal,
  removerReceitaLocal,
  vincularReceitaLocal,
} from "../src/lib/carrinhoOffline.js";

const OPERADOR_CAIXA = { perfil: "operador_caixa", permissoes: { desconto_max_pct: 5 } };

const PRODUTO_LIVRE = {
  id: "p1",
  nome: "Dipirona",
  tipo_controle: "livre",
  preco_venda: 20,
  data_validade_proximo_lote: "2030-01-01",
};

const PRODUTO_CONTROLADO = {
  id: "p2",
  nome: "Rivotril",
  tipo_controle: "tarja_preta",
  preco_venda: 40,
  data_validade_proximo_lote: "2030-01-01",
};

const PRODUTO_VENCIDO = {
  id: "p3",
  nome: "Xarope",
  tipo_controle: "livre",
  preco_venda: 15,
  data_validade_proximo_lote: null,
};

test("criarVendaLocal nasce aberta, vazia e marcada como origem_local", () => {
  const venda = criarVendaLocal();
  assert.equal(venda.origem_local, true);
  assert.equal(venda.status, "aberta");
  assert.deepEqual(venda.itens, []);
  assert.deepEqual(venda.pagamentos, []);
  assert.equal(venda.receita, null);
  assert.ok(venda.id);
  assert.ok(venda.criado_em_offline);
});

test("adicionarItemLocal soma na mesma linha quando o produto já está no carrinho", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 2);
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 3);

  assert.equal(venda.itens.length, 1);
  assert.equal(venda.itens[0].quantidade, 5);
  assert.equal(venda.valor_total, 100); // 5 * 20
});

test("adicionarItemLocal BLOQUEIO DURO: produto sem validade conhecida (vencido) nunca entra no carrinho", () => {
  const venda = criarVendaLocal();
  assert.throws(
    () => adicionarItemLocal(venda, PRODUTO_VENCIDO, 1),
    ErroCarrinhoOffline
  );
});

test("alterarQuantidadeLocal recalcula o total, e recusa quantidade menor que 1", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 1);
  venda = alterarQuantidadeLocal(venda, venda.itens[0].id, 4);
  assert.equal(venda.valor_total, 80);

  assert.throws(() => alterarQuantidadeLocal(venda, venda.itens[0].id, 0), ErroCarrinhoOffline);
});

test("removerItemLocal tira o item e recalcula o total", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 2);
  venda = removerItemLocal(venda, venda.itens[0].id);
  assert.equal(venda.itens.length, 0);
  assert.equal(venda.valor_total, 0);
});

test("descontarItemLocal aceita desconto dentro do teto do perfil, e bloqueia acima do teto", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 5); // bruto 100

  // 5% de 100 = 5 — exatamente o teto do operador de caixa.
  venda = descontarItemLocal(venda, venda.itens[0].id, 5, "reais", OPERADOR_CAIXA);
  assert.equal(venda.itens[0].desconto, 5);
  assert.equal(venda.valor_total, 95);

  assert.throws(
    () => descontarItemLocal(venda, venda.itens[0].id, 10, "reais", OPERADOR_CAIXA),
    ErroCarrinhoOffline
  );
});

test("descontarItemLocal recusa desconto maior que o valor do item", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 1); // bruto 20
  assert.throws(
    () => descontarItemLocal(venda, venda.itens[0].id, 21, "reais", { perfil: "administrador" }),
    ErroCarrinhoOffline
  );
});

test("aplicarDescontoLocal aceita percentual dentro do teto e soma com desconto de item ao validar", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 5); // bruto 100

  venda = aplicarDescontoLocal(venda, 5, "pct", OPERADOR_CAIXA); // 5% de 100 = 5
  assert.equal(venda.desconto, 5);
  assert.equal(venda.valor_total, 95);
});

test("aplicarDescontoLocal bloqueia se o desconto do item já usou o teto do perfil", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 5); // bruto 100
  venda = descontarItemLocal(venda, venda.itens[0].id, 5, "reais", OPERADOR_CAIXA); // já no teto

  assert.throws(() => aplicarDescontoLocal(venda, 1, "reais", OPERADOR_CAIXA), ErroCarrinhoOffline);
});

test("receita: vincula e remove", () => {
  let venda = criarVendaLocal();
  const receita = { medico_nome: "Dra. Teste", medico_crm: "1", paciente_nome: "Fulano", data_emissao: "2026-01-01" };
  venda = vincularReceitaLocal(venda, receita);
  assert.deepEqual(venda.receita, receita);
  venda = removerReceitaLocal(venda);
  assert.equal(venda.receita, null);
});

test("pagamentos: adiciona e remove", () => {
  let venda = criarVendaLocal();
  venda = adicionarPagamentoLocal(venda, "dinheiro", 50);
  venda = adicionarPagamentoLocal(venda, "pix", 30);
  assert.equal(venda.pagamentos.length, 2);

  venda = removerPagamentoLocal(venda, venda.pagamentos[0].id);
  assert.equal(venda.pagamentos.length, 1);
  assert.equal(venda.pagamentos[0].forma_pagamento, "pix");
});

test("finalizarVendaLocal BLOQUEIO DURO: controlado sem receita não gera payload", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_CONTROLADO, 1);
  venda = adicionarPagamentoLocal(venda, "dinheiro", 40);

  assert.throws(() => finalizarVendaLocal(venda, OPERADOR_CAIXA), ErroCarrinhoOffline);
});

test("finalizarVendaLocal BLOQUEIO DURO: pagamento insuficiente não gera payload", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 1);
  venda = adicionarPagamentoLocal(venda, "dinheiro", 1);

  assert.throws(() => finalizarVendaLocal(venda, OPERADOR_CAIXA), ErroCarrinhoOffline);
});

test("finalizarVendaLocal monta o payload de /vendas/sincronizar-offline e calcula o troco", () => {
  let venda = criarVendaLocal();
  venda = adicionarItemLocal(venda, PRODUTO_LIVRE, 2); // 40
  venda = adicionarItemLocal(venda, PRODUTO_CONTROLADO, 1); // 40, total bruto 80
  venda = vincularReceitaLocal(venda, {
    medico_nome: "Dra. Teste",
    medico_crm: "1",
    paciente_nome: "Fulano",
    data_emissao: "2026-01-01",
  });
  venda = adicionarPagamentoLocal(venda, "dinheiro", 90); // paga a mais: vira troco

  const { payload, troco } = finalizarVendaLocal(venda, OPERADOR_CAIXA, { cpfNota: "12345678900" });

  assert.equal(payload.id, venda.id);
  assert.equal(payload.itens.length, 2);
  assert.equal(payload.desconto_venda, 0);
  assert.deepEqual(payload.pagamentos, [{ forma_pagamento: "dinheiro", valor: 90 }]);
  assert.equal(payload.receita.paciente_nome, "Fulano");
  assert.equal(payload.cpf_nota, "12345678900");
  assert.equal(troco, 10); // 90 - 80
  // O payload nunca leva valor_total nem lote_id: o servidor recalcula e decide o lote (FEFO).
  assert.equal(payload.valor_total, undefined);
  assert.equal(payload.itens[0].lote_id, undefined);
});
