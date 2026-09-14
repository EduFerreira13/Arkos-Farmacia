/**
 * Testa a orquestração pura de sincronização (concorrência limitada,
 * atualização do catálogo, processamento da fila) com dependências falsas —
 * sem rede, sem IndexedDB, sem navegador.
 *
 * Uso: npm run test:offline --workspace=apps/web
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buscarCatalogoAtualizado,
  mapComConcorrenciaLimitada,
  processarFilaPendente,
} from "../src/lib/sincronizacaoNucleo.js";

test("mapComConcorrenciaLimitada preserva a ordem dos resultados e respeita o limite de paralelismo", async () => {
  let emVoo = 0;
  let picoEmVoo = 0;

  const resultados = await mapComConcorrenciaLimitada([1, 2, 3, 4, 5, 6], 2, async (item) => {
    emVoo += 1;
    picoEmVoo = Math.max(picoEmVoo, emVoo);
    await new Promise((resolve) => setTimeout(resolve, 5));
    emVoo -= 1;
    return item * 10;
  });

  assert.deepEqual(resultados, [10, 20, 30, 40, 50, 60]);
  assert.ok(picoEmVoo <= 2, `esperava no máximo 2 em voo ao mesmo tempo, teve ${picoEmVoo}`);
});

test("mapComConcorrenciaLimitada lida com lista vazia e limite maior que a lista", async () => {
  assert.deepEqual(await mapComConcorrenciaLimitada([], 5, async (item) => item), []);
  assert.deepEqual(await mapComConcorrenciaLimitada([1], 5, async (item) => item * 2), [2]);
});

test("buscarCatalogoAtualizado mapeia cada produto com o detalhe (lotes) buscado", async () => {
  const resultado = await buscarCatalogoAtualizado({
    listarProdutos: async () => ({ produtos: [{ id: "a" }, { id: "b" }] }),
    buscarProduto: async (id) => ({ produto: { id, nome: `Produto ${id}` } }),
    paraRegistroCatalogo: (produto) => ({ id: produto.id, nome: produto.nome, mapeado: true }),
  });

  assert.deepEqual(resultado, [
    { id: "a", nome: "Produto a", mapeado: true },
    { id: "b", nome: "Produto b", mapeado: true },
  ]);
});

test("buscarCatalogoAtualizado não derruba o refresh inteiro se o detalhe de um produto falhar", async () => {
  const resultado = await buscarCatalogoAtualizado({
    listarProdutos: async () => ({
      produtos: [
        { id: "ok", nome: "Ok", codigo_barras: "1", preco_venda: 10, tipo_controle: "livre", quantidade_atual: 5 },
        { id: "falha", nome: "Falha", codigo_barras: "2", preco_venda: 20, tipo_controle: "livre", quantidade_atual: 3 },
      ],
    }),
    buscarProduto: async (id) => {
      if (id === "falha") throw new Error("estoque-service não respondeu");
      return { produto: { id, nome: "Ok", lotes: [] } };
    },
    paraRegistroCatalogo: (produto) => ({ id: produto.id, data_validade_proximo_lote: "2030-01-01" }),
  });

  assert.equal(resultado.length, 2);
  const ok = resultado.find((registro) => registro.id === "ok");
  const falhou = resultado.find((registro) => registro.id === "falha");
  assert.equal(ok.data_validade_proximo_lote, "2030-01-01");
  // Produto cujo detalhe falhou: sem validade conhecida — bloqueio duro por
  // segurança (@arkos/vendas-core trata null como vencido), não some do catálogo.
  assert.equal(falhou.data_validade_proximo_lote, null);
  assert.equal(falhou.nome, "Falha");
});

// ------------------------------------------------------- processarFilaPendente

function filaFalsa(registros) {
  return async () => registros;
}

test("processarFilaPendente remove da fila as vendas sincronizadas com sucesso", async () => {
  const removidas = [];
  const atualizadas = [];

  const resultado = await processarFilaPendente({
    listarVendasPendentes: filaFalsa([
      { id: "v1", payload: { id: "v1" }, tentativas: 0 },
      { id: "v2", payload: { id: "v2" }, tentativas: 0 },
    ]),
    sincronizarVenda: async () => ({ status: 201, dados: { venda: {} } }),
    removerVendaPendente: async (id) => removidas.push(id),
    atualizarVendaPendente: async (id, mudancas) => atualizadas.push({ id, mudancas }),
  });

  assert.deepEqual(resultado, { sincronizadas: 2, comErro: 0, parouPorFalhaDeRede: false });
  assert.deepEqual(removidas, ["v1", "v2"]);
  assert.deepEqual(atualizadas, []);
});

test("processarFilaPendente: erro de negocio marca a venda e continua; sucesso remove a seguinte", async () => {
  const removidas = [];
  const atualizadas = [];
  let chamadas = 0;

  const resultado = await processarFilaPendente({
    listarVendasPendentes: filaFalsa([
      { id: "ruim", payload: {}, tentativas: 0 },
      { id: "boa", payload: {}, tentativas: 0 },
    ]),
    sincronizarVenda: async () => {
      chamadas += 1;
      if (chamadas === 1) return { status: 422, dados: { mensagem: "pagamento_insuficiente" } };
      return { status: 201, dados: {} };
    },
    removerVendaPendente: async (id) => removidas.push(id),
    atualizarVendaPendente: async (id, mudancas) => atualizadas.push({ id, mudancas }),
  });

  assert.deepEqual(resultado, { sincronizadas: 1, comErro: 1, parouPorFalhaDeRede: false });
  assert.deepEqual(removidas, ["boa"]);
  assert.equal(atualizadas.length, 1);
  assert.equal(atualizadas[0].id, "ruim");
  assert.equal(atualizadas[0].mudancas.status, "erro");
  assert.equal(atualizadas[0].mudancas.tentativas, 1);
});

test("processarFilaPendente: falha de rede para a fila (nao tenta as seguintes) e marca pendente de novo", async () => {
  const removidas = [];
  const atualizadas = [];
  let chamadas = 0;

  const resultado = await processarFilaPendente({
    listarVendasPendentes: filaFalsa([
      { id: "primeira", payload: {}, tentativas: 2 },
      { id: "segunda", payload: {}, tentativas: 0 },
    ]),
    sincronizarVenda: async () => {
      chamadas += 1;
      throw new Error("estoque-service não respondeu");
    },
    removerVendaPendente: async (id) => removidas.push(id),
    atualizarVendaPendente: async (id, mudancas) => atualizadas.push({ id, mudancas }),
  });

  assert.equal(chamadas, 1); // nunca tenta a segunda depois da falha de rede na primeira
  assert.deepEqual(resultado, { sincronizadas: 0, comErro: 0, parouPorFalhaDeRede: true });
  assert.deepEqual(removidas, []);
  assert.equal(atualizadas.length, 1);
  assert.equal(atualizadas[0].id, "primeira");
  assert.equal(atualizadas[0].mudancas.status, "pendente");
  assert.equal(atualizadas[0].mudancas.tentativas, 3);
});

test("processarFilaPendente nunca reprocessa uma venda ja removida (fila vazia nao chama sincronizarVenda)", async () => {
  let chamadas = 0;
  const resultado = await processarFilaPendente({
    listarVendasPendentes: filaFalsa([]),
    sincronizarVenda: async () => {
      chamadas += 1;
      return { status: 201 };
    },
    removerVendaPendente: async () => {},
    atualizarVendaPendente: async () => {},
  });

  assert.equal(chamadas, 0);
  assert.deepEqual(resultado, { sincronizadas: 0, comErro: 0, parouPorFalhaDeRede: false });
});
