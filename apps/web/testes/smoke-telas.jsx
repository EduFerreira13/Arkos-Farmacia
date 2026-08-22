/**
 * Teste de fumaça das telas: monta cada página com um usuário autenticado e as
 * APIs respondendo dados de exemplo, e falha se alguma quebrar ao renderizar.
 *
 * Não substitui olhar a tela — pega o tipo de erro que só aparece em runtime
 * (componente inexistente, campo que vem nulo, chamada errada de hook).
 *
 * Uso: npm run testar:telas --workspace=apps/web
 */

import { JSDOM } from "jsdom";

// O DOM tem de existir antes de qualquer import do React.
const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
// navigator no Node 26 é somente leitura, então precisa de defineProperty.
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: React } = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { MemoryRouter } = await import("react-router-dom");

const { ProvedorPreferencias } = await import("../src/lib/preferencias.jsx");
const { ProvedorAutenticacao } = await import("../src/lib/autenticacao.jsx");

const { default: App } = await import("../src/App.jsx");

const paginas = {
  Dashboard: (await import("../src/paginas/Dashboard.jsx")).Dashboard,
  Produtos: (await import("../src/paginas/Produtos.jsx")).Produtos,
  EntradaLote: (await import("../src/paginas/EntradaLote.jsx")).EntradaLote,
  Alertas: (await import("../src/paginas/Alertas.jsx")).Alertas,
  PDV: (await import("../src/paginas/PDV.jsx")).PDV,
  Vendas: (await import("../src/paginas/Vendas.jsx")).Vendas,
  Caixa: (await import("../src/paginas/Caixa.jsx")).Caixa,
  Contas: (await import("../src/paginas/Contas.jsx")).Contas,
  Login: (await import("../src/paginas/Login.jsx")).Login,
};

// ----------------------------------------------------------------- fixtures

const USUARIO = {
  id: "11111111-1111-1111-1111-111111111111",
  nome: "Ana Gerente",
  email: "gerente@arkos.com",
  perfil: "gerente",
  permissoes: {
    vender: true,
    consultar_estoque: true,
    ajustar_estoque: true,
    validar_receita: true,
    cancelar_venda: true,
    ver_financeiro: true,
    desconto_max_pct: 15,
  },
  ativo: true,
};

const PERMISSOES_POR_PERFIL = {
  operador_caixa: { vender: true, consultar_estoque: true, desconto_max_pct: 5 },
  farmaceutico: { vender: true, consultar_estoque: true, validar_receita: true, desconto_max_pct: 5 },
  gerente: {
    vender: true,
    consultar_estoque: true,
    validar_receita: true,
    cancelar_venda: true,
    ajustar_estoque: true,
    ver_financeiro: true,
    desconto_max_pct: 15,
  },
  administrador: { acesso_total: true },
};

let perfilAtual = "gerente";

const PRODUTO = {
  id: "22222222-2222-2222-2222-222222222222",
  nome: "Dipirona Monoidratada 500mg 20 comprimidos",
  principio_ativo: "Dipirona monoidratada",
  fabricante: "Neo Quimica",
  classe_terapeutica: null,
  codigo_barras: "7891058001234",
  tipo_controle: "livre",
  unidade_venda: "caixa",
  ncm: "30049099",
  cfop: "5405",
  preco_custo: 4.2,
  preco_venda: 9.9,
  estoque_minimo: 15,
  venda_sob_encomenda: false,
  categoria_id: "33333333-3333-3333-3333-333333333333",
  categoria_nome: "Medicamento",
  fornecedor_id: "44444444-4444-4444-4444-444444444444",
  fornecedor_nome: "Distribuidora Panvel Norte",
  quantidade_atual: 12,
  criado_em: "2026-08-01T12:00:00.000Z",
};

const LOTE = {
  id: "55555555-5555-5555-5555-555555555555",
  produto_id: PRODUTO.id,
  numero_lote: "DIP-2504",
  quantidade: 12,
  data_validade: "2026-09-12",
  data_entrada: "2026-05-18",
  vencido: false,
};

const VENDA = {
  id: "66666666-6666-6666-6666-666666666666",
  usuario_id: USUARIO.id,
  status: "finalizada",
  valor_total: 21.4,
  desconto: 0,
  criado_em: "2026-08-21T12:18:00.000Z",
  total_itens: 2,
  formas_pagamento: "dinheiro",
  itens: [
    {
      id: "77777777-7777-7777-7777-777777777777",
      venda_id: "66666666-6666-6666-6666-666666666666",
      produto_id: PRODUTO.id,
      lote_id: LOTE.id,
      quantidade: 1,
      preco_unitario: 9.9,
      produto_nome: PRODUTO.nome,
      tipo_controle: "livre",
    },
  ],
  pagamentos: [
    {
      id: "88888888-8888-8888-8888-888888888888",
      venda_id: "66666666-6666-6666-6666-666666666666",
      forma_pagamento: "dinheiro",
      valor: 21.4,
    },
  ],
  receita: null,
};

const CAIXA = {
  id: "99999999-9999-9999-9999-999999999999",
  usuario_id: USUARIO.id,
  valor_abertura: 200,
  aberto_em: "2026-08-21T11:55:00.000Z",
};

const RESUMO_VENDAS = {
  total_vendas: 6,
  valor_total_dia: 493.6,
  ticket_medio: 82.27,
  por_forma_pagamento: [{ forma_pagamento: "dinheiro", valor: 67, quantidade: 2 }],
  ontem: { total_vendas: 7, valor_total_dia: 433.2, ticket_medio: 61.89 },
  variacao_pct: { valor_total_dia: 13.9, ticket_medio: 32.9 },
};

/** Respostas por rota — cobre o que as telas pedem ao montar. */
const RESPOSTAS = [
  [
    /\/api\/auth\/me$/,
    () => ({
      usuario: {
        ...USUARIO,
        perfil: perfilAtual,
        permissoes: PERMISSOES_POR_PERFIL[perfilAtual],
      },
    }),
  ],
  [/\/api\/estoque\/produtos\/[^/?]+$/, { produto: { ...PRODUTO, lotes: [LOTE] }, historico_precos: [] }],
  [/\/api\/estoque\/produtos/, { produtos: [PRODUTO] }],
  [/\/api\/estoque\/categorias/, { categorias: [{ id: PRODUTO.categoria_id, nome: "Medicamento" }] }],
  [/\/api\/estoque\/fornecedores/, { fornecedores: [{ id: PRODUTO.fornecedor_id, nome: "Distribuidora Panvel Norte" }] }],
  [
    /\/api\/estoque\/alertas\/vencimento/,
    {
      dias: 30,
      lotes: [
        {
          lote_id: LOTE.id,
          produto_id: PRODUTO.id,
          nome: PRODUTO.nome,
          numero_lote: LOTE.numero_lote,
          quantidade: 12,
          data_validade: "2026-09-12",
          dias_para_vencer: 22,
        },
      ],
    },
  ],
  [
    /\/api\/estoque\/alertas\/estoque-baixo/,
    { produtos: [{ produto_id: PRODUTO.id, nome: PRODUTO.nome, estoque_minimo: 15, quantidade_atual: 12 }] },
  ],
  [
    /\/api\/estoque\/movimentacoes/,
    {
      movimentacoes: [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          produto_id: PRODUTO.id,
          produto_nome: PRODUTO.nome,
          lote_id: LOTE.id,
          tipo: "entrada",
          quantidade: 20,
          motivo: "Entrada do lote DIP-2504",
          usuario_id: USUARIO.id,
          criado_em: "2026-08-18T13:00:00.000Z",
        },
      ],
    },
  ],
  [/\/api\/vendas\/resumo\/hoje/, RESUMO_VENDAS],
  [/\/api\/vendas\/[^/?]+$/, { venda: VENDA }],
  [/\/api\/vendas$/, { vendas: [VENDA] }],
  [
    /\/api\/financeiro\/caixa\/status/,
    {
      caixa: CAIXA,
      totais: { entradas: 394.1, saidas: 150, entradas_venda: 394.1, lancamentos: 5, valor_esperado: 444.1 },
      movimentacoes: [
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          caixa_id: CAIXA.id,
          tipo: "entrada",
          valor: 21.4,
          origem: "venda",
          descricao: "Venda 66666666",
          venda_id: VENDA.id,
          criado_em: "2026-08-21T12:18:00.000Z",
        },
      ],
    },
  ],
  [
    /\/api\/financeiro\/fluxo-caixa\/hoje/,
    {
      caixa: { ...CAIXA, totais: { entradas: 394.1, saidas: 150, valor_esperado: 444.1 } },
      vendas: RESUMO_VENDAS,
      contas: { a_pagar: 10407.25, a_pagar_atrasado: 2310.4, a_receber: 5305.7, a_receber_atrasado: 1875.2 },
      aviso_integracao: null,
    },
  ],
  [
    /\/api\/financeiro\/contas-pagar/,
    {
      contas: [
        {
          id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          descricao: "Nota fiscal 4521 - Distribuidora Panvel Norte",
          valor: 4820.75,
          vencimento: "2026-09-02",
          status: "pendente",
          fornecedor_id: PRODUTO.fornecedor_id,
          pago_em: null,
        },
      ],
    },
  ],
  [
    /\/api\/financeiro\/contas-receber/,
    {
      contas: [
        {
          id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          origem: "convenio",
          descricao: "Convenio Unimed",
          valor: 3240.6,
          vencimento: "2026-08-31",
          status: "pendente",
          recebido_em: null,
        },
      ],
    },
  ],
];

const chamadas = [];

globalThis.fetch = async (url) => {
  const endereco = String(url);
  chamadas.push(endereco);
  const encontrado = RESPOSTAS.find(([padrao]) => padrao.test(endereco));

  if (!encontrado) {
    return {
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => JSON.stringify({ erro: "nao_encontrado", mensagem: `Sem fixture para ${endereco}` }),
    };
  }

  const corpo = typeof encontrado[1] === "function" ? encontrado[1]() : encontrado[1];

  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(corpo),
  };
};

// Token presente faz o provedor de autenticação buscar /auth/me.
dom.window.localStorage.setItem("arkos.token", "token-de-teste");
globalThis.localStorage = dom.window.localStorage;

// ------------------------------------------------------------------ execução

let falhas = 0;
const errosDeConsole = [];
const erroOriginal = console.error;
console.error = (...args) => {
  const texto = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  // Ruído esperado do React em ambiente de teste.
  if (texto.includes("not wrapped in act") || texto.includes("ReactDOMTestUtils")) return;
  errosDeConsole.push(texto);
  erroOriginal(...args);
};

async function montar(nome, Pagina) {
  // A tela de login só aparece para quem não está autenticado.
  if (nome === "Login") localStorage.removeItem("arkos.token");
  else localStorage.setItem("arkos.token", "token-de-teste");

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const raiz = createRoot(container);
  errosDeConsole.length = 0;

  try {
    await act(async () => {
      raiz.render(
        React.createElement(
          ProvedorPreferencias,
          null,
          React.createElement(
            ProvedorAutenticacao,
            null,
            React.createElement(MemoryRouter, null, React.createElement(Pagina))
          )
        )
      );
    });

    // Deixa as promessas das buscas resolverem.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const texto = container.textContent ?? "";
    const semConteudo = texto.trim().length < 10;
    const comErro = errosDeConsole.length > 0;

    if (comErro || semConteudo) {
      falhas += 1;
      console.log(
        `FALHA — ${nome}${semConteudo ? " :: renderizou vazio" : ""}` +
          (comErro ? ` :: ${errosDeConsole[0].slice(0, 300)}` : "")
      );
    } else {
      console.log(`PASS — ${nome} :: ${texto.trim().slice(0, 70).replace(/\s+/g, " ")}`);
    }
  } catch (erro) {
    falhas += 1;
    console.log(`FALHA — ${nome} :: ${erro.message}`);
  } finally {
    await act(async () => raiz.unmount());
    container.remove();
  }
}

for (const [nome, Pagina] of Object.entries(paginas)) {
  await montar(nome, Pagina);
}

// ---------------------------------------------- navegação por perfil

const { MemoryRouter: Rota } = await import("react-router-dom");

/** Abre a rota dentro do App inteiro (menu + guarda de permissão). */
async function abrirRota(perfil, caminho, trechoEsperado, deveAbrir) {
  perfilAtual = perfil;
  localStorage.setItem("arkos.token", "token-de-teste");

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const raiz = createRoot(container);
  errosDeConsole.length = 0;

  try {
    await act(async () => {
      raiz.render(
        React.createElement(
          ProvedorPreferencias,
          null,
          React.createElement(
            ProvedorAutenticacao,
            null,
            React.createElement(Rota, { initialEntries: [caminho] }, React.createElement(App))
          )
        )
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const texto = container.textContent ?? "";
    const abriu = texto.includes(trechoEsperado);
    const ok = abriu === deveAbrir;
    if (!ok) falhas += 1;
    console.log(
      `${ok ? "PASS" : "FALHA"} — ${perfil} em ${caminho}: ${abriu ? "abriu" : "nao abriu"}` +
        ` (esperado ${deveAbrir ? "abrir" : "nao abrir"})` +
        (errosDeConsole.length ? ` :: ${errosDeConsole[0].slice(0, 160)}` : "")
    );
  } catch (erro) {
    falhas += 1;
    console.log(`FALHA — ${perfil} em ${caminho} :: ${erro.message}`);
  } finally {
    await act(async () => raiz.unmount());
    container.remove();
  }
}

console.log("");
const TELAS = [
  ["/caixa", "Abertura, lançamentos do turno"],
  ["/pdv", "ponto de venda"],
  ["/produtos", "Cadastro, preços e estoque"],
  ["/entrada-lote", "Toda entrada registra lote"],
  ["/contas", "A pagar por fornecedores"],
];
const ESPERADO = {
  administrador: ["/caixa", "/pdv", "/produtos", "/entrada-lote", "/contas"],
  gerente: ["/caixa", "/pdv", "/produtos", "/entrada-lote", "/contas"],
  farmaceutico: ["/caixa", "/pdv", "/produtos"],
  operador_caixa: ["/caixa", "/pdv", "/produtos"],
};

for (const [perfil, permitidas] of Object.entries(ESPERADO)) {
  for (const [caminho, trecho] of TELAS) {
    await abrirRota(perfil, caminho, trecho, permitidas.includes(caminho));
  }
}

const semFixture = chamadas.filter(
  (endereco) => !RESPOSTAS.some(([padrao]) => padrao.test(endereco))
);
if (semFixture.length) {
  console.log(`\nRotas chamadas sem fixture: ${[...new Set(semFixture)].join(", ")}`);
}

console.log(`\n${falhas === 0 ? "TODAS AS TELAS RENDERIZARAM" : `${falhas} TELA(S) COM FALHA`}`);
process.exit(falhas === 0 ? 0 : 1);
