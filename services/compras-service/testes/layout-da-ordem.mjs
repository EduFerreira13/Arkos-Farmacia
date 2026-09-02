/**
 * Teste de layout da ordem de compra em PDF.
 *
 * Existe por causa de um defeito real: o rótulo "TOTAL DO PEDIDO" encostava no
 * valor e saía impresso como "TOTAL DO PEDIDOR$ 55,00". A causa era o
 * alinhamento à direita usar largura estimada por contagem de letras, que
 * subestima o negrito.
 *
 * O teste reconstrói a caixa de cada trecho de texto a partir do fluxo de
 * conteúdo do arquivo gerado e reprova qualquer sobreposição na mesma linha ou
 * qualquer texto fora da folha — a família inteira do defeito, não só o caso
 * que apareceu. Roda sem banco e sem serviço no ar.
 *
 * Uso: npm run test:pdf
 */

import { gerarOrdemDeCompraPdf } from "../src/pdf.js";

/**
 * O teste mede com régua própria, e não com `pdf-metricas.js`.
 *
 * Na primeira versão ele importava a mesma função de largura que o gerador usa
 * — e por isso passava até com a métrica quebrada de propósito: as duas pontas
 * erravam junto e concordavam. Uma tabela independente aqui é duplicação de
 * propósito: é o que faz o teste discordar do código quando o código erra.
 *
 * Valores das métricas da Adobe para Helvetica e Helvetica-Bold, em milésimos
 * do corpo da fonte. Só o que o documento imprime.
 */
const LARGURA_DO_CARACTERE = {
  normal: {
    " ": 278, "!": 278, "\"": 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
    J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
    S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
    j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
    s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
    "·": 278, "—": 1000,
  },
  negrito: {
    " ": 278, "!": 333, "\"": 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
    A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
    J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
    S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278,
    j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389,
    s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
    "·": 278, "—": 1000,
  },
};

// Dígito é dígito em qualquer peso nas duas fontes.
for (const peso of ["normal", "negrito"]) {
  for (const digito of "0123456789") LARGURA_DO_CARACTERE[peso][digito] = 556;
}

/** Acentuada tem o avanço da letra base nas fontes padrão do PDF. */
const BASE_DA_ACENTUADA = {
  á: "a", à: "a", â: "a", ã: "a", é: "e", ê: "e", í: "i", ó: "o", ô: "o",
  õ: "o", ú: "u", ç: "c", Á: "A", À: "A", Â: "A", Ã: "A", É: "E", Ê: "E",
  Í: "I", Ó: "O", Ô: "O", Õ: "O", Ú: "U", Ç: "C",
};

function larguraTexto(texto, tamanho, peso = "normal", espacamento = 0) {
  const tabela = LARGURA_DO_CARACTERE[peso];
  let milesimos = 0;
  let caracteres = 0;

  for (const caractere of String(texto)) {
    caracteres += 1;
    milesimos += tabela[caractere] ?? tabela[BASE_DA_ACENTUADA[caractere]] ?? tabela[" "];
  }

  return (milesimos * tamanho) / 1000 + espacamento * caracteres;
}

const LARGURA_FOLHA = 595.28;
const ALTURA_FOLHA = 841.89;

const FARMACIA = {
  nome: "Farmácia Arkos",
  cnpj: "12.345.678/0001-90",
  endereco: "Av. Central, 1200 - Uberlândia/MG",
  telefone: "(34) 3210-0000",
};

const FORNECEDOR = {
  nome: "Distribuidora Panvel Norte LTDA",
  cnpj: "98.765.432/0001-10",
  telefone: "(51) 3030-1000",
  email: "pedidos@panvelnorte.com.br",
};

const item = (numero, nome, quantidade, preco) => ({
  produto_codigo: `PRD-${String(numero).padStart(5, "0")}`,
  produto_nome: nome,
  quantidade,
  preco_unitario: preco,
});

/**
 * Os casos existem para esticar o layout onde ele pode estourar: valores
 * longos empurram as colunas da direita, nome comprido invade a coluna
 * seguinte, muitos itens quebram a página, e campo vazio testa o que some.
 */
const CASOS = [
  {
    nome: "pedido de um item",
    pedido: { frete: 10, desconto: 5, valor_total: 55, entregue_em: "01/09/2026" },
    itens: [item(1, "Produto Integracao 184830", 10, 5)],
  },
  {
    nome: "valores de seis dígitos e nome longo",
    pedido: { frete: 1250.75, desconto: 9999.9, valor_total: 128450.35, entregue_em: null },
    itens: [
      item(2, "Dipirona Monoidratada 500mg 20 comprimidos caixa com 200 unidades", 1200, 98.75),
      item(3, "Fralda Geriátrica Tamanho G pacote com 8 unidades", 9999, 21.5),
    ],
  },
  {
    nome: "46 itens em várias páginas",
    pedido: { frete: 48.9, desconto: 0, valor_total: 9876.54, entregue_em: null },
    itens: Array.from({ length: 46 }, (_, indice) =>
      item(indice + 1, `Medicamento de nome comprido para forçar a quebra ${indice + 1}`, indice + 1, 4.2 + indice)
    ),
  },
  {
    nome: "farmácia e fornecedor sem dados opcionais",
    farmacia: { nome: "Farmácia Arkos" },
    fornecedor: { nome: "Fornecedor sem cadastro completo" },
    pedido: { frete: 0, desconto: 0, valor_total: 42, entregue_em: null },
    itens: [item(4, "Produto sem código", 1, 42)],
  },
];

// ------------------------------------------------------------------ conferência

/** Trechos de texto do fluxo, com posição, corpo e peso da fonte. */
function trechosDeTexto(fluxo) {
  const padrao =
    /BT [\d. ]+ rg \/(F1|F2) ([\d.]+) Tf (?:([\d.]+) Tc )?1 0 0 1 ([-\d.]+) ([-\d.]+) Tm \((.*?)\) Tj ET/g;

  return [...fluxo.matchAll(padrao)]
    .map(([, fonte, tamanho, espacamento, x, y, conteudo]) => ({
      texto: conteudo,
      peso: fonte === "F2" ? "negrito" : "normal",
      tamanho: Number(tamanho),
      espacamento: Number(espacamento ?? 0),
      x: Number(x),
      y: Number(y),
    }))
    .filter((trecho) => trecho.texto.trim())
    .map((trecho) => ({
      ...trecho,
      fim: trecho.x + larguraTexto(trecho.texto, trecho.tamanho, trecho.peso, trecho.espacamento),
    }));
}

let falhas = 0;
let verificacoes = 0;

function ok(descricao, condicao, detalhe = "") {
  verificacoes += 1;
  if (condicao) {
    console.log(`PASS ${descricao}`);
    return;
  }
  falhas += 1;
  console.log(`FALHA ${descricao}${detalhe ? ` :: ${detalhe}` : ""}`);
}

for (const caso of CASOS) {
  console.log(`\n--- ${caso.nome}`);

  const arquivo = gerarOrdemDeCompraPdf({
    farmacia: caso.farmacia ?? FARMACIA,
    fornecedor: caso.fornecedor ?? FORNECEDOR,
    pedido: {
      numero: "PC-2026-00012",
      emitido_em: "01/09/2026, 20:43",
      forma_pagamento: "Transferência bancária",
      situacao: "Pendente de entrega",
      ...caso.pedido,
    },
    itens: caso.itens,
  });

  const conteudo = arquivo.toString("latin1");
  ok("gera um PDF", conteudo.startsWith("%PDF-"));
  ok("traz o número do pedido", conteudo.includes("PC-2026-00012"));

  // Estrutura: cada entrada da xref precisa apontar para o objeto que promete,
  // senão o leitor recusa o arquivo inteiro.
  const inicioXref = Number(/startxref\s+(\d+)/.exec(conteudo)[1]);
  const deslocamentos = [...conteudo.slice(inicioXref).matchAll(/^(\d{10}) 00000 n $/gm)].map(
    (achado) => Number(achado[1])
  );
  const xrefIntegra = deslocamentos.every((posicao, indice) =>
    conteudo.startsWith(`${indice + 1} 0 obj`, posicao)
  );
  ok("xref aponta para os objetos certos", xrefIntegra);

  const fluxosIntegros = [...conteudo.matchAll(/<< \/Length (\d+) >>\nstream\n/g)].every(
    (achado) => {
      const inicio = achado.index + achado[0].length;
      const fim = conteudo.indexOf("\nendstream", inicio);
      return Buffer.byteLength(conteudo.slice(inicio, fim), "latin1") === Number(achado[1]);
    }
  );
  ok("tamanho declarado dos fluxos bate com o conteúdo", fluxosIntegros);

  const fluxos = [...conteudo.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((a) => a[1]);

  const colisoes = [];
  const foraDaFolha = [];

  fluxos.forEach((fluxo, indiceDaPagina) => {
    const trechos = trechosDeTexto(fluxo);

    // Agrupa por linha de base para comparar só o que divide a mesma altura.
    const porLinha = new Map();
    for (const trecho of trechos) {
      const chave = Math.round(trecho.y / 2) * 2;
      porLinha.set(chave, [...(porLinha.get(chave) ?? []), trecho]);
    }

    for (const naLinha of porLinha.values()) {
      const ordenados = [...naLinha].sort((a, b) => a.x - b.x);
      for (let indice = 0; indice < ordenados.length - 1; indice += 1) {
        const atual = ordenados[indice];
        const seguinte = ordenados[indice + 1];
        // Meio ponto de folga absorve arredondamento de coordenada.
        if (atual.fim > seguinte.x + 0.5) {
          colisoes.push(
            `pág.${indiceDaPagina + 1}: "${atual.texto}" encosta em "${seguinte.texto}"`
          );
        }
      }
    }

    for (const trecho of trechos) {
      if (trecho.x < 0 || trecho.fim > LARGURA_FOLHA || trecho.y < 20 || trecho.y > ALTURA_FOLHA) {
        foraDaFolha.push(`pág.${indiceDaPagina + 1}: "${trecho.texto}"`);
      }
    }
  });

  ok("nenhum texto invade a coluna vizinha", colisoes.length === 0, colisoes.join(" | "));
  ok("nenhum texto sai da folha", foraDaFolha.length === 0, foraDaFolha.join(" | "));
  ok(
    "todas as páginas trazem rodapé numerado",
    fluxos.every((fluxo, indice) =>
      fluxo.includes(`(Página ${indice + 1} de ${fluxos.length})`)
    )
  );
}

console.log(
  falhas
    ? `\n${falhas} de ${verificacoes} verificações falharam.`
    : `\nTODAS AS ${verificacoes} VERIFICACOES PASSARAM`
);
process.exit(falhas ? 1 : 0);
