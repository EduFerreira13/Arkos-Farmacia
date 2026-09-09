#!/usr/bin/env node
/**
 * Teste do fluxo completo do MVP (docs/PLANO-DE-CONSTRUCAO.md, Fase 7):
 * login -> abertura de caixa -> cadastro de produto -> entrada de lote ->
 * venda com item controlado (bloqueio sem receita e conclusao com receita) ->
 * nota fiscal simulada -> lancamento e fechamento de caixa.
 *
 * Uso: com o backend rodando (`npm run dev:api`), `npm run test:fluxo`.
 * Cria dados de demonstracao no banco de desenvolvimento — nao rodar em producao.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const aqui = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(aqui, "..", ".env"), quiet: true });

const porta = (nome, padrao) => process.env[nome] ?? padrao;
const BASE = `http://localhost:${porta("PORT", 3000)}`;

// O backend e um processo so agora, mas cada modulo continua no seu prefixo
// (docs/API-CONTRATOS.md) — so muda pra quem ja chamava sem prefixo antes.
const S = {
  auth: BASE,
  estoque: `${BASE}/estoque`,
  vendas: BASE,
  financeiro: `${BASE}/financeiro`,
  fiscal: `${BASE}/fiscal`,
};

let falhas = 0;
const ok = (rotulo, cond, extra = "") => {
  if (!cond) falhas += 1;
  console.log(`${cond ? "PASS" : "FALHA"} — ${rotulo}${extra ? ` :: ${extra}` : ""}`);
};

async function req(url, { metodo = "GET", corpo, token } = {}) {
  const r = await fetch(url, {
    method: metodo,
    headers: {
      ...(corpo ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { status: r.status, dados: d };
}

// 0) health do backend
const h = await req(`${BASE}/health`);
ok("health backend", h.status === 200 && h.dados.banco === "ok");

// 1) login
const login = await req(`${S.auth}/auth/login`, {
  metodo: "POST", corpo: { email: "gerente@arkos.com", senha: "arkos123" },
});
ok("1. login do gerente", login.status === 200 && login.dados.usuario.perfil === "gerente");
const token = login.dados.token;

// 2) caixa do dia
const statusInicial = await req(`${S.financeiro}/caixa/status`, { token });
if (statusInicial.dados.caixa) {
  await req(`${S.financeiro}/caixa/${statusInicial.dados.caixa.id}/fechar`, {
    metodo: "POST", token, corpo: { valor_fechamento_contado: 0 },
  });
}
const abrir = await req(`${S.financeiro}/caixa/abrir`, {
  metodo: "POST", token, corpo: { valor_abertura: 100 },
});
ok("2. abre caixa com fundo de troco", abrir.status === 201 && abrir.dados.caixa.valor_abertura === 100);
const caixaId = abrir.dados.caixa.id;

const duplicado = await req(`${S.financeiro}/caixa/abrir`, {
  metodo: "POST", token, corpo: { valor_abertura: 50 },
});
ok("2b. bloqueia segundo caixa aberto", duplicado.status === 409 && duplicado.dados.erro === "caixa_ja_aberto");

// 3) cadastro de produto
const sufixo = String(Date.now()).slice(-6);
const hoje = new Date().toISOString().slice(0, 10);
const catId = (await req(`${S.estoque}/categorias`, { token })).dados.categorias
  .find((c) => c.nome === "Medicamento").id;

const criar = (extra) => req(`${S.estoque}/produtos`, {
  metodo: "POST", token,
  corpo: { fabricante: "Lab E2E", categoria_id: catId, unidade_venda: "caixa", preco_custo: 3, estoque_minimo: 4, ...extra },
});

const livre = (await criar({
  nome: `Ibuprofeno 400 ${sufixo}`, codigo_barras: `91${sufixo}`,
  principio_ativo: "Ibuprofeno", tipo_controle: "livre", preco_venda: 15,
})).dados.produto;
const controlado = (await criar({
  nome: `Diazepam 5mg ${sufixo}`, codigo_barras: `92${sufixo}`,
  principio_ativo: "Diazepam", classe_terapeutica: "psicotropico",
  tipo_controle: "tarja_preta", preco_venda: 40,
})).dados.produto;
ok("3. cadastra produto livre e controlado", Boolean(livre?.id && controlado?.id));

// 4) entrada de lote (dois lotes no livre para exercitar FEFO)
const lotes = [
  [livre, "L-FEFO-A", 4, "2027-01-31"],
  [livre, "L-FEFO-B", 10, "2028-05-31"],
  [controlado, "L-CTRL", 6, "2027-09-30"],
];
let entradasOk = true;
for (const [produto, numero, qtd, validade] of lotes) {
  const r = await req(`${S.estoque}/lotes`, {
    metodo: "POST", token,
    corpo: { produto_id: produto.id, numero_lote: numero, quantidade: qtd, data_validade: validade },
  });
  if (r.status !== 201) entradasOk = false;
}
ok("4. entrada dos lotes", entradasOk);

// 5) venda com item controlado
const venda = (await req(`${S.vendas}/vendas`, { metodo: "POST", token })).dados.venda;
await req(`${S.vendas}/vendas/${venda.id}/itens`, {
  metodo: "POST", token, corpo: { produto_id: livre.id, quantidade: 5 },
});
const itemControlado = await req(`${S.vendas}/vendas/${venda.id}/itens`, {
  metodo: "POST", token, corpo: { produto_id: controlado.id, quantidade: 1 },
});
ok("5. carrinho monta com item controlado",
  itemControlado.status === 201 && itemControlado.dados.venda.valor_total === 115,
  `total=${itemControlado.dados?.venda?.valor_total}`);

await req(`${S.vendas}/vendas/${venda.id}/pagamentos`, {
  metodo: "POST", token, corpo: { forma_pagamento: "cartao_debito", valor: 100 },
});
await req(`${S.vendas}/vendas/${venda.id}/pagamentos`, {
  metodo: "POST", token, corpo: { forma_pagamento: "dinheiro", valor: 20 },
});

const bloqueio = await req(`${S.vendas}/vendas/${venda.id}/finalizar`, { metodo: "POST", token });
ok("5b. BLOQUEIO: controlado sem receita nao finaliza",
  bloqueio.status === 422 && bloqueio.dados.erro === "receita_obrigatoria");

const estoqueIntacto = (await req(`${S.estoque}/produtos/${livre.id}`, { token })).dados.produto;
ok("5c. estoque nao foi tocado pelo bloqueio", estoqueIntacto.quantidade_atual === 14,
  `qtd=${estoqueIntacto.quantidade_atual}`);

await req(`${S.vendas}/vendas/${venda.id}/receita`, {
  metodo: "POST", token,
  corpo: {
    medico_nome: "Dra. Helena Prado", medico_crm: "CRM-SP 123456",
    paciente_nome: "Joao da Silva", data_emissao: hoje,
  },
});
const finalizada = await req(`${S.vendas}/vendas/${venda.id}/finalizar`, { metodo: "POST", token });
ok("6. venda finaliza com receita vinculada",
  finalizada.status === 200 && finalizada.dados.venda.status === "finalizada",
  `${finalizada.status} ${JSON.stringify(finalizada.dados).slice(0, 160)}`);
ok("6b. troco calculado", finalizada.dados?.troco === 5, `troco=${finalizada.dados?.troco}`);

const baixa = finalizada.dados?.baixa_estoque?.find((b) => b.produto_nome === livre.nome);
ok("6c. baixa do livre respeitou FEFO (4 do lote que vence antes + 1 do outro)",
  baixa?.lotes?.length === 2 && baixa.lotes[0].numero_lote === "L-FEFO-A" &&
  baixa.lotes[0].quantidade === 4 && baixa.lotes[1].quantidade === 1,
  JSON.stringify(baixa?.lotes));

const estoqueDepois = (await req(`${S.estoque}/produtos/${livre.id}`, { token })).dados.produto;
ok("6d. estoque baixado de 14 para 9", estoqueDepois.quantidade_atual === 9,
  `qtd=${estoqueDepois.quantidade_atual}`);

// 7) fiscal
ok("7. nota fiscal simulada emitida",
  finalizada.dados?.nota_fiscal?.status === "simulado" &&
  finalizada.dados?.nota_fiscal?.chave_acesso?.length === 44);

const notaConsulta = await req(`${S.fiscal}/notas-fiscais/${venda.id}`, { token });
ok("7b. nota consultavel pela venda", notaConsulta.status === 200);

const sngpc = await req(`${S.fiscal}/controlados-sngpc?venda_id=${venda.id}`, { token });
ok("7c. controlado registrado no SNGPC com enviado_anvisa false",
  sngpc.dados.registros.length === 1 && sngpc.dados.registros[0].enviado_anvisa === false);

// 8) caixa refletiu a venda
const statusCaixa = await req(`${S.financeiro}/caixa/status`, { token });
ok("8. caixa recebeu o lancamento automatico da venda",
  statusCaixa.dados.totais.entradas_venda === 115 &&
  statusCaixa.dados.totais.valor_esperado === 215,
  JSON.stringify(statusCaixa.dados.totais));

const lancamentoVenda = statusCaixa.dados.movimentacoes.find((m) => m.venda_id === venda.id);
ok("8b. lancamento rastreia a venda de origem", Boolean(lancamentoVenda) && lancamentoVenda.origem === "venda");

// 9) resumo e fluxo de caixa
const resumo = await req(`${S.vendas}/vendas/resumo/hoje`, { token });
ok("9. resumo do dia tem venda e quebra por forma de pagamento",
  resumo.dados.total_vendas >= 1 && resumo.dados.por_forma_pagamento.length >= 2,
  JSON.stringify(resumo.dados.por_forma_pagamento));

const fluxo = await req(`${S.financeiro}/fluxo-caixa/hoje`, { token });
ok("9b. fluxo de caixa junta caixa + vendas",
  fluxo.status === 200 && fluxo.dados.vendas.total_vendas >= 1 && fluxo.dados.caixa !== null);

// 10) fechamento com divergência
const fechar = await req(`${S.financeiro}/caixa/${caixaId}/fechar`, {
  metodo: "POST", token, corpo: { valor_fechamento_contado: 210 },
});
ok("10. fechamento compara esperado x contado",
  fechar.status === 200 && fechar.dados.caixa.valor_fechamento_esperado === 215 &&
  fechar.dados.divergencia === -5,
  JSON.stringify({ esp: fechar.dados?.caixa?.valor_fechamento_esperado, div: fechar.dados?.divergencia }));

const refechar = await req(`${S.financeiro}/caixa/${caixaId}/fechar`, {
  metodo: "POST", token, corpo: { valor_fechamento_contado: 1 },
});
ok("10b. caixa fechado nao fecha de novo", refechar.status === 422);

// 11) sem caixa aberto a venda nao finaliza e o estoque volta
const venda2 = (await req(`${S.vendas}/vendas`, { metodo: "POST", token })).dados.venda;
await req(`${S.vendas}/vendas/${venda2.id}/itens`, {
  metodo: "POST", token, corpo: { produto_id: livre.id, quantidade: 2 },
});
await req(`${S.vendas}/vendas/${venda2.id}/pagamentos`, {
  metodo: "POST", token, corpo: { forma_pagamento: "pix", valor: 30 },
});
const semCaixa = await req(`${S.vendas}/vendas/${venda2.id}/finalizar`, { metodo: "POST", token });
ok("11. sem caixa aberto a venda nao finaliza",
  semCaixa.status === 422 && semCaixa.dados.erro === "caixa_fechado",
  `${semCaixa.status} ${semCaixa.dados?.erro}`);

const estoqueEstornado = (await req(`${S.estoque}/produtos/${livre.id}`, { token })).dados.produto;
ok("11b. estoque estornado apos falha na finalizacao",
  estoqueEstornado.quantidade_atual === 9, `qtd=${estoqueEstornado.quantidade_atual}`);

const venda2Depois = (await req(`${S.vendas}/vendas/${venda2.id}`, { token })).dados.venda;
ok("11c. venda continua aberta para nova tentativa", venda2Depois.status === "aberta");

console.log(`\n${falhas === 0 ? "TODOS OS PASSOS PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
