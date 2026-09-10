/**
 * Testa a camada local do PDV offline (IndexedDB) isolada, sem navegador —
 * "fake-indexeddb" implementa a API real em memória, então o módulo testado
 * é o mesmo que roda no Chrome, sem mock de função nenhuma.
 *
 * Uso: npm run test:offline --workspace=apps/web
 */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  adicionarVendaPendente,
  atualizarVendaPendente,
  buscarProdutoDoCatalogo,
  buscarProdutoPorCodigoBarras,
  limparSessaoUsuario,
  limparVendaEmAndamento,
  listarCatalogo,
  listarVendasPendentes,
  obterMetaCatalogo,
  obterSessaoUsuario,
  obterVendaEmAndamento,
  produtoParaCatalogo,
  removerVendaPendente,
  salvarCatalogo,
  salvarSessaoUsuario,
  salvarVendaEmAndamento,
} from "../src/lib/bancoOffline.js";

/** Limpa tudo pela própria API pública — nenhum atalho de teste no módulo. */
beforeEach(async () => {
  await salvarCatalogo([]);
  await limparSessaoUsuario();
  await limparVendaEmAndamento();
  for (const registro of await listarVendasPendentes()) {
    await removerVendaPendente(registro.id);
  }
});

test("produtoParaCatalogo pega o lote não vencido que vence primeiro, ignora vencido e zerado", () => {
  const produto = {
    id: "p1",
    nome: "Dipirona",
    codigo_barras: "789",
    preco_venda: 12,
    tipo_controle: "livre",
    lotes: [
      { quantidade: 5, vencido: true, data_validade: "2020-01-01" },
      { quantidade: 0, vencido: false, data_validade: "2026-01-01" },
      { quantidade: 3, vencido: false, data_validade: "2027-06-15" },
      { quantidade: 2, vencido: false, data_validade: "2028-01-01" },
    ],
  };

  const registro = produtoParaCatalogo(produto);
  assert.equal(registro.data_validade_proximo_lote, "2027-06-15");
  assert.equal(registro.quantidade_atual, 5); // 3 + 2, o zerado e o vencido ficam fora
});

test("produtoParaCatalogo devolve validade nula quando não há lote válido", () => {
  const registro = produtoParaCatalogo({ id: "p2", nome: "X", preco_venda: 1, tipo_controle: "livre", lotes: [] });
  assert.equal(registro.data_validade_proximo_lote, null);
  assert.equal(registro.quantidade_atual, 0);
});

test("salvarCatalogo substitui o catálogo inteiro e grava a meta de atualização", async () => {
  await salvarCatalogo([
    { id: "a", nome: "A", codigo_barras: "111", preco_venda: 10, tipo_controle: "livre", quantidade_atual: 5, data_validade_proximo_lote: "2030-01-01" },
  ]);
  assert.equal((await listarCatalogo()).length, 1);

  await salvarCatalogo([
    { id: "b", nome: "B", codigo_barras: "222", preco_venda: 20, tipo_controle: "livre", quantidade_atual: 2, data_validade_proximo_lote: "2030-01-01" },
  ]);
  const catalogo = await listarCatalogo();
  assert.equal(catalogo.length, 1);
  assert.equal(catalogo[0].id, "b"); // "a" não sobrou — substituição completa, não incremental

  const meta = await obterMetaCatalogo();
  assert.ok(meta.atualizado_em);
});

test("busca no catálogo por id e por código de barras", async () => {
  await salvarCatalogo([
    { id: "a", nome: "A", codigo_barras: "111", preco_venda: 10, tipo_controle: "livre", quantidade_atual: 5, data_validade_proximo_lote: "2030-01-01" },
  ]);
  assert.equal((await buscarProdutoDoCatalogo("a")).nome, "A");
  assert.equal(await buscarProdutoDoCatalogo("inexistente"), null);
  assert.equal((await buscarProdutoPorCodigoBarras("111")).id, "a");
  assert.equal(await buscarProdutoPorCodigoBarras("000"), null);
});

test("sessão do usuário: salva, lê e limpa", async () => {
  assert.equal(await obterSessaoUsuario(), null);

  await salvarSessaoUsuario({
    id: "u1", nome: "Ana", perfil: "operador_caixa", permissoes: { desconto_max_pct: 5 },
  });
  const sessao = await obterSessaoUsuario();
  assert.equal(sessao.perfil, "operador_caixa");
  assert.equal(sessao.permissoes.desconto_max_pct, 5);
  assert.ok(sessao.cacheado_em);

  await limparSessaoUsuario();
  assert.equal(await obterSessaoUsuario(), null);
});

test("fila de vendas pendentes: adiciona, lista em ordem, atualiza e remove", async () => {
  const primeira = await adicionarVendaPendente({ id: "v1", itens: [] });
  assert.equal(primeira.status, "pendente");
  assert.equal(primeira.tentativas, 0);

  await new Promise((resolve) => setTimeout(resolve, 2)); // garante criado_em_local diferente
  await adicionarVendaPendente({ id: "v2", itens: [] });

  const lista = await listarVendasPendentes();
  assert.deepEqual(lista.map((registro) => registro.id), ["v1", "v2"]);

  const atualizada = await atualizarVendaPendente("v1", {
    status: "erro",
    tentativas: 1,
    ultimo_erro: "pagamento_insuficiente",
  });
  assert.equal(atualizada.status, "erro");
  assert.equal(atualizada.payload.id, "v1"); // o payload original não se perde na atualização

  assert.equal(await atualizarVendaPendente("nao-existe", { status: "erro" }), null);

  await removerVendaPendente("v1");
  assert.deepEqual((await listarVendasPendentes()).map((registro) => registro.id), ["v2"]);
});

test("venda em andamento: salva, lê e limpa o carrinho", async () => {
  assert.equal(await obterVendaEmAndamento(), null);

  await salvarVendaEmAndamento({ itens: [{ produto_id: "a", quantidade: 2 }], desconto_venda: 0 });
  const carrinho = await obterVendaEmAndamento();
  assert.equal(carrinho.itens.length, 1);
  assert.ok(carrinho.atualizado_em);

  await limparVendaEmAndamento();
  assert.equal(await obterVendaEmAndamento(), null);
});
