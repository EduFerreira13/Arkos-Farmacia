/**
 * Gerador da ordem de compra em PDF.
 *
 * Mesma escolha do gerador de planilha do vendas-service: um PDF de texto é um
 * formato simples o bastante para ser escrito à mão, e uma biblioteca de PDF
 * traz alguns megabytes e uma superfície de atualização que este serviço não
 * precisa carregar para imprimir uma folha.
 *
 * O alinhamento à direita sai das métricas reais da Helvetica
 * (`pdf-metricas.js`), não de estimativa por contagem de letras. A marca é o
 * traçado oficial de `marca/svg/elemento-arkos.svg`, convertido de SVG para
 * operadores de PDF — o mesmo princípio do `Logo.jsx` no frontend: a marca
 * nunca é redesenhada à mão.
 */

import { encurtarPara, larguraTexto, quebrarEmLinhas } from "./pdf-metricas.js";

// A4 em pontos (1 pt = 1/72 pol).
const LARGURA = 595.28;
const ALTURA = 841.89;

const MARGEM = 42;
const DIREITA = LARGURA - MARGEM;
const LARGURA_UTIL = DIREITA - MARGEM;

const FONTES = { normal: "F1", negrito: "F2" };

/** Paleta da marca (docs/REGRAS-VISUAIS.md §2), em componentes 0–1. */
const COR = {
  marinho: [0.082, 0.165, 0.329], // #152A54
  primario: [0.118, 0.306, 0.612], // #1E4E9C
  ciano: [0.125, 0.722, 0.769], // #20B8C4
  texto: [0.102, 0.137, 0.196], // #1A2332
  secundario: [0.357, 0.396, 0.447], // #5B6572
  borda: [0.886, 0.902, 0.925], // #E2E6EC
  fundo: [0.961, 0.969, 0.980], // #F5F7FA
  branco: [1, 1, 1],
  cianoClaro: [0.65, 0.87, 0.9],
  marinhoClaro: [0.62, 0.68, 0.78],
};

// ------------------------------------------------------------------- texto

/**
 * Sinais tipográficos que não existem no Latin-1 mas existem no WinAnsi, que é
 * a codificação declarada nas fontes. Sem esta tabela, um travessão viraria "?".
 */
const WINANSI = {
  "—": 0x97,
  "–": 0x96,
  "•": 0x95,
  "“": 0x93,
  "”": 0x94,
  "‘": 0x91,
  "’": 0x92,
  "…": 0x85,
};

/** Escapa o que quebraria a string literal do PDF e converte para WinAnsi. */
function textoPdf(valor) {
  const semQuebra = String(valor ?? "").replace(/[\r\n\t]+/g, " ");
  let saida = "";

  for (const caractere of semQuebra) {
    const codigo = caractere.codePointAt(0);
    if (caractere === "\\") saida += "\\\\";
    else if (caractere === "(") saida += "\\(";
    else if (caractere === ")") saida += "\\)";
    else if (WINANSI[caractere]) saida += String.fromCharCode(WINANSI[caractere]);
    else if (codigo < 256) saida += caractere;
    else saida += "?";
  }

  return saida;
}

// -------------------------------------------------------------- marca vetorial

/**
 * Símbolo do Arkos, traçado de `marca/svg/elemento-arkos.svg`. Não editar à
 * mão: se a marca mudar, reexportar o SVG e recopiar. A caixa é a área de tinta
 * do vetor, sem o respiro que o CorelDRAW exporta.
 */
const MARCA_CAIXA = { x: 75, y: 75, largura: 851, altura: 600 };
const MARCA_TRACADOS = [
  "M176.69 527.6c8.68,-3.17 15.51,-8.64 20.72,-16.58 42.03,-64.12 146.76,-170.13 208.23,-254.02 41.17,-56.18 77.25,-116.31 94.86,-182.03 47.86,178.56 213.54,299.47 303.09,436.05 5.21,7.94 12.04,13.41 20.72,16.58 62.24,22.72 101.72,79.15 101.72,145.41l0 1.75c-59.57,-27.45 -124.78,-51.79 -197.02,-72.03 -23.76,-6.64 -49.1,-57.34 -94.07,-100.52l-33.39 -30.06 -101.05 -71.24 -101.05 71.24c-38.24,32.12 -76.72,71.79 -103.13,112.66 -5.88,9.1 -13.9,15.01 -24.33,17.92 -72.24,20.24 -137.45,44.58 -197.02,72.03l0 -1.75c0,-66.26 39.48,-122.69 101.72,-145.41z",
  "M188.51 356.36c42.12,-20.59 83.05,-42.76 128.99,-67.06 -16.77,19.99 -33.98,39.66 -50.98,59.17 -25.14,28.27 -50.76,57.05 -74,86.44 -12.55,15.62 -24.47,31.48 -35.03,47.43 -32.87,12.43 -60.89,32.23 -82.52,57.18l0 -1.3c0,-79.22 42.36,-147.07 113.54,-181.86zm737.52 181.86l0 1.3c-21.63,-24.95 -49.65,-44.75 -82.52,-57.18 -43.88,-66.42 -103.68,-128.06 -158.85,-192.42 45.55,24.09 86.12,46.05 127.85,66.44 71.16,34.8 113.52,102.64 113.52,181.86z",
];

const PROPORCAO_MARCA = MARCA_CAIXA.largura / MARCA_CAIXA.altura;

/**
 * Converte um `d` de SVG em operadores de traçado do PDF.
 *
 * Cobre só o que os vetores da marca usam — mover, reta, curva cúbica e
 * fechar, em versão absoluta e relativa. Um `d` com arco ou curva quadrática
 * passaria batido, e por isso a origem do traçado fica fixa em `marca/svg/`.
 */
function tracadoSvgParaPdf(d) {
  const partes = d.match(/[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const saida = [];
  const num = (valor) => Number(valor).toFixed(3);

  let comando = null;
  let x = 0;
  let y = 0;
  let inicioX = 0;
  let inicioY = 0;
  let posicao = 0;

  const proximo = () => Number(partes[posicao++]);

  while (posicao < partes.length) {
    const token = partes[posicao];

    if (/[MmLlHhVvCcZz]/.test(token)) {
      comando = token;
      posicao += 1;
      if (comando === "Z" || comando === "z") {
        saida.push("h");
        x = inicioX;
        y = inicioY;
        continue;
      }
    }

    const relativo = comando === comando?.toLowerCase();

    switch (comando?.toUpperCase()) {
      case "M": {
        const px = proximo();
        const py = proximo();
        x = relativo ? x + px : px;
        y = relativo ? y + py : py;
        inicioX = x;
        inicioY = y;
        saida.push(`${num(x)} ${num(y)} m`);
        // Coordenada extra depois de um M vale como L (regra do SVG).
        comando = relativo ? "l" : "L";
        break;
      }
      case "L": {
        const px = proximo();
        const py = proximo();
        x = relativo ? x + px : px;
        y = relativo ? y + py : py;
        saida.push(`${num(x)} ${num(y)} l`);
        break;
      }
      case "H": {
        const px = proximo();
        x = relativo ? x + px : px;
        saida.push(`${num(x)} ${num(y)} l`);
        break;
      }
      case "V": {
        const py = proximo();
        y = relativo ? y + py : py;
        saida.push(`${num(x)} ${num(y)} l`);
        break;
      }
      case "C": {
        const x1 = relativo ? x + proximo() : proximo();
        const y1 = relativo ? y + proximo() : proximo();
        const x2 = relativo ? x + proximo() : proximo();
        const y2 = relativo ? y + proximo() : proximo();
        const x3 = relativo ? x + proximo() : proximo();
        const y3 = relativo ? y + proximo() : proximo();
        saida.push(
          `${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(x3)} ${num(y3)} c`
        );
        x = x3;
        y = y3;
        break;
      }
      default:
        posicao += 1;
    }
  }

  return saida.join("\n");
}

// ------------------------------------------------------------------- página

/** Acumula os comandos de desenho de uma página. */
class Pagina {
  constructor() {
    this.comandos = [];
  }

  #cor(valor) {
    return valor.map((canal) => canal.toFixed(3)).join(" ");
  }

  texto(valor, x, y, opcoes = {}) {
    const { tamanho = 10, peso = "normal", cor = COR.texto, espacamento = 0 } = opcoes;
    this.comandos.push(
      `BT ${this.#cor(cor)} rg /${FONTES[peso]} ${tamanho} Tf ` +
        (espacamento ? `${espacamento} Tc ` : "") +
        `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${textoPdf(valor)}) Tj ET` +
        (espacamento ? "\nBT 0 Tc ET" : "")
    );
  }

  textoDireita(valor, xDireita, y, opcoes = {}) {
    const largura = larguraTexto(
      valor,
      opcoes.tamanho ?? 10,
      opcoes.peso ?? "normal",
      opcoes.espacamento ?? 0
    );
    this.texto(valor, xDireita - largura, y, opcoes);
  }

  retangulo(x, y, largura, altura, cor) {
    this.comandos.push(
      `${this.#cor(cor)} rg ${x.toFixed(2)} ${y.toFixed(2)} ` +
        `${largura.toFixed(2)} ${altura.toFixed(2)} re f`
    );
  }

  linha(x1, y, x2, opcoes = {}) {
    const { espessura = 0.6, cor = COR.borda } = opcoes;
    this.comandos.push(
      `${this.#cor(cor)} RG ${espessura} w ${x1.toFixed(2)} ${y.toFixed(2)} m ` +
        `${x2.toFixed(2)} ${y.toFixed(2)} l S`
    );
  }

  /** Símbolo do Arkos, com o canto inferior esquerdo em (x, y). */
  marca(x, y, altura, cor) {
    const largura = altura * PROPORCAO_MARCA;
    const escalaX = largura / MARCA_CAIXA.largura;
    const escalaY = altura / MARCA_CAIXA.altura;

    // O eixo Y do SVG cresce para baixo e o do PDF para cima: o `d` negativo
    // da matriz espelha o desenho, e o deslocamento reposiciona a caixa.
    const matriz = [
      escalaX,
      0,
      0,
      -escalaY,
      x - MARCA_CAIXA.x * escalaX,
      y + altura + MARCA_CAIXA.y * escalaY,
    ];

    this.comandos.push(
      `q ${matriz.map((valor) => valor.toFixed(4)).join(" ")} cm ${this.#cor(cor)} rg`
    );
    for (const tracado of MARCA_TRACADOS) this.comandos.push(tracadoSvgParaPdf(tracado));
    // f* = regra par-ímpar, que é a do vetor original (fill-rule: evenodd).
    this.comandos.push("f* Q");
  }

  get conteudo() {
    return this.comandos.join("\n");
  }
}

// ------------------------------------------------------------------ documento

/** Monta o arquivo PDF a partir das páginas já desenhadas. */
function montarDocumento(paginas, titulo) {
  const objetos = [];
  const idPaginas = 2;
  const idFonteNormal = 3;
  const idFonteNegrito = 4;
  const primeiraPagina = 5;

  const referencias = paginas
    .map((_, indice) => `${primeiraPagina + indice * 2} 0 R`)
    .join(" ");

  objetos[1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  objetos[idPaginas] = `<< /Type /Pages /Kids [${referencias}] /Count ${paginas.length} >>`;
  objetos[idFonteNormal] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[idFonteNegrito] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  paginas.forEach((pagina, indice) => {
    const idPagina = primeiraPagina + indice * 2;
    const idConteudo = idPagina + 1;
    objetos[idPagina] =
      `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] ` +
      `/Resources << /Font << /F1 ${idFonteNormal} 0 R /F2 ${idFonteNegrito} 0 R >> >> ` +
      `/Contents ${idConteudo} 0 R >>`;

    const fluxo = pagina.conteudo;
    objetos[idConteudo] =
      `<< /Length ${Buffer.byteLength(fluxo, "latin1")} >>\nstream\n${fluxo}\nendstream`;
  });

  const idInfo = objetos.length;
  objetos[idInfo] = `<< /Title (${textoPdf(titulo)}) /Producer (Arkos) >>`;

  let saida = "%PDF-1.4\n";
  const deslocamentos = [];

  for (let id = 1; id < objetos.length; id += 1) {
    deslocamentos[id] = Buffer.byteLength(saida, "latin1");
    saida += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }

  const inicioXref = Buffer.byteLength(saida, "latin1");
  const total = objetos.length;

  saida += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id += 1) {
    saida += `${String(deslocamentos[id]).padStart(10, "0")} 00000 n \n`;
  }
  saida +=
    `trailer\n<< /Size ${total} /Root 1 0 R /Info ${idInfo} 0 R >>\n` +
    `startxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(saida, "latin1");
}

/** R$ 1.234,50 — escrito à mão porque o Intl usa espaço estreito, que a fonte
 *  base não tem, e o valor sairia com caractere trocado. */
function dinheiro(valor) {
  const [inteiro, centavos] = Number(valor ?? 0).toFixed(2).split(".");
  const sinal = inteiro.startsWith("-") ? "-" : "";
  const digitos = sinal ? inteiro.slice(1) : inteiro;
  const comMilhar = digitos.replace(/\B(?=(\d{3})+$)/g, ".");
  return `${sinal}R$ ${comMilhar},${centavos}`;
}

// -------------------------------------------------------------------- layout

const ALTURA_FAIXA = 104;

/** Colunas da tabela de itens: a de item começa à esquerda, as demais fecham à direita. */
const COLUNA = {
  item: MARGEM,
  itemFim: MARGEM + 286,
  quantidade: MARGEM + 336,
  unitario: MARGEM + 424,
  subtotal: DIREITA,
};

/** Faixa da marca no topo: identifica a farmácia e nomeia o documento. */
function faixaDoTopo(pagina, { farmacia, pedido }) {
  const base = ALTURA - ALTURA_FAIXA;
  pagina.retangulo(0, base, LARGURA, ALTURA_FAIXA, COR.marinho);
  // Fio ciano no rodapé da faixa: o único traço decorativo, e o que amarra o
  // documento à marca sem depender de imagem.
  pagina.retangulo(0, base, LARGURA, 3, COR.ciano);

  pagina.marca(MARGEM, base + 54, 26, COR.branco);

  pagina.texto(farmacia.nome, MARGEM, base + 30, {
    tamanho: 14,
    peso: "negrito",
    cor: COR.branco,
  });

  const identificacao = [
    farmacia.cnpj ? `CNPJ ${farmacia.cnpj}` : null,
    farmacia.endereco,
    farmacia.telefone,
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (identificacao) {
    pagina.texto(encurtarPara(identificacao, LARGURA_UTIL * 0.62, 8), MARGEM, base + 17, {
      tamanho: 8,
      cor: COR.marinhoClaro,
    });
  }

  pagina.textoDireita("ORDEM DE COMPRA", DIREITA, base + 56, {
    tamanho: 8,
    peso: "negrito",
    cor: COR.cianoClaro,
    espacamento: 1.6,
  });
  pagina.textoDireita(pedido.numero, DIREITA, base + 30, {
    tamanho: 19,
    peso: "negrito",
    cor: COR.branco,
  });

  return base - 34;
}

/** Rótulo pequeno em caixa alta sobre o valor — a hierarquia dos blocos de dados. */
function campo(pagina, x, y, rotulo, valor, largura) {
  pagina.texto(rotulo.toUpperCase(), x, y, {
    tamanho: 6.5,
    peso: "negrito",
    cor: COR.secundario,
    espacamento: 0.9,
  });
  pagina.texto(encurtarPara(valor, largura, 9.5), x, y - 13, { tamanho: 9.5 });
  return y - 30;
}

/** Fornecedor à esquerda, condições comerciais à direita. */
function partes(pagina, y, { pedido, fornecedor }) {
  const meio = MARGEM + LARGURA_UTIL / 2 + 10;
  const largura = LARGURA_UTIL / 2 - 20;

  pagina.texto("FORNECEDOR", MARGEM, y, {
    tamanho: 7,
    peso: "negrito",
    cor: COR.primario,
    espacamento: 1.2,
  });
  pagina.texto("CONDIÇÕES", meio, y, {
    tamanho: 7,
    peso: "negrito",
    cor: COR.primario,
    espacamento: 1.2,
  });

  let linha = y - 10;
  pagina.linha(MARGEM, linha, MARGEM + largura, { cor: COR.borda });
  pagina.linha(meio, linha, DIREITA, { cor: COR.borda });
  linha -= 18;

  let esquerda = linha;
  pagina.texto(encurtarPara(fornecedor.nome, largura, 11, "negrito"), MARGEM, esquerda, {
    tamanho: 11,
    peso: "negrito",
  });
  esquerda -= 15;

  for (const valor of [
    fornecedor.cnpj ? `CNPJ ${fornecedor.cnpj}` : null,
    fornecedor.telefone,
    fornecedor.email,
  ].filter(Boolean)) {
    pagina.texto(encurtarPara(valor, largura, 9.5), MARGEM, esquerda, {
      tamanho: 9.5,
      cor: COR.secundario,
    });
    esquerda -= 14;
  }

  let direita = linha;
  const condicoes = [
    ["Emissão", pedido.emitido_em],
    ["Pagamento", pedido.forma_pagamento],
    ["Situação", pedido.situacao],
    pedido.entregue_em ? ["Entrega", pedido.entregue_em] : null,
  ].filter(Boolean);

  for (const [rotulo, valor] of condicoes) {
    pagina.texto(rotulo, meio, direita, { tamanho: 9.5, cor: COR.secundario });
    pagina.textoDireita(valor, DIREITA, direita, { tamanho: 9.5 });
    direita -= 14;
  }

  return Math.min(esquerda, direita) - 16;
}

/** Cabeçalho da tabela de itens, com fundo claro. */
function cabecalhoDaTabela(pagina, y) {
  const altura = 22;
  pagina.retangulo(MARGEM, y - altura + 6, LARGURA_UTIL, altura, COR.fundo);

  const linhaDeTexto = y - 9;
  const estilo = { tamanho: 7, peso: "negrito", cor: COR.secundario, espacamento: 1 };

  pagina.texto("ITEM", COLUNA.item + 10, linhaDeTexto, estilo);
  pagina.textoDireita("QTD", COLUNA.quantidade, linhaDeTexto, estilo);
  pagina.textoDireita("UNITÁRIO", COLUNA.unitario, linhaDeTexto, estilo);
  pagina.textoDireita("SUBTOTAL", COLUNA.subtotal - 10, linhaDeTexto, estilo);

  return y - altura - 6;
}

/** Uma linha de item; devolve a altura ocupada. */
function linhaDoItem(pagina, y, item, alternada) {
  const larguraNome = COLUNA.itemFim - COLUNA.item - 20;
  const linhas = quebrarEmLinhas(item.produto_nome, larguraNome, 9.5).slice(0, 2);
  const altura = Math.max(26, 14 + linhas.length * 12);

  if (alternada) {
    pagina.retangulo(MARGEM, y - altura + 8, LARGURA_UTIL, altura, [0.985, 0.988, 0.993]);
  }

  let topo = y - 4;
  if (item.produto_codigo) {
    pagina.texto(item.produto_codigo, COLUNA.item + 10, topo, {
      tamanho: 7.5,
      peso: "negrito",
      cor: COR.primario,
    });
    topo -= 11;
  }

  for (const linha of linhas) {
    pagina.texto(linha, COLUNA.item + 10, topo, { tamanho: 9.5 });
    topo -= 12;
  }

  // Números alinhados pela primeira linha do nome, não pelo centro do bloco.
  const linhaDosNumeros = y - (item.produto_codigo ? 15 : 4);
  pagina.textoDireita(String(item.quantidade), COLUNA.quantidade, linhaDosNumeros, {
    tamanho: 9.5,
  });
  pagina.textoDireita(dinheiro(item.preco_unitario), COLUNA.unitario, linhaDosNumeros, {
    tamanho: 9.5,
    cor: COR.secundario,
  });
  pagina.textoDireita(
    dinheiro(item.quantidade * Number(item.preco_unitario)),
    COLUNA.subtotal - 10,
    linhaDosNumeros,
    { tamanho: 9.5, peso: "negrito" }
  );

  pagina.linha(MARGEM, y - altura + 6, DIREITA, { espessura: 0.4 });
  return altura;
}

/** Fechamento: subtotal, frete, desconto e o total em bloco cheio. */
function fechamento(pagina, y, { pedido, subtotalItens }) {
  const inicio = MARGEM + LARGURA_UTIL - 250;
  const rotuloDireita = DIREITA - 96;
  let linha = y - 18;

  const parcelas = [
    ["Subtotal dos itens", subtotalItens],
    Number(pedido.frete) ? ["Frete", Number(pedido.frete)] : null,
    Number(pedido.desconto) ? ["Desconto", -Number(pedido.desconto)] : null,
  ].filter(Boolean);

  for (const [rotulo, valor] of parcelas) {
    pagina.textoDireita(rotulo, rotuloDireita, linha, { tamanho: 9.5, cor: COR.secundario });
    pagina.textoDireita(dinheiro(valor), DIREITA, linha, { tamanho: 9.5 });
    linha -= 16;
  }

  linha -= 6;
  const alturaBloco = 34;
  pagina.retangulo(inicio, linha - alturaBloco + 10, 250, alturaBloco, COR.marinho);

  const linhaDoTotal = linha - 12;
  pagina.texto("TOTAL DO PEDIDO", inicio + 14, linhaDoTotal, {
    tamanho: 7.5,
    peso: "negrito",
    cor: COR.cianoClaro,
    espacamento: 1,
  });
  pagina.textoDireita(dinheiro(pedido.valor_total), DIREITA - 14, linhaDoTotal - 1, {
    tamanho: 14,
    peso: "negrito",
    cor: COR.branco,
  });

  return linha - alturaBloco;
}

/** Rodapé fixo: o aviso de conferência e a assinatura do sistema. */
function rodape(pagina, resumo, numeroDaPagina, totalDePaginas) {
  const y = MARGEM + 16;
  pagina.linha(MARGEM, y + 16, DIREITA, { espessura: 0.4 });

  pagina.texto(resumo, MARGEM, y, { tamanho: 8, cor: COR.secundario });
  pagina.texto(
    "Conferir lote e validade de cada item na entrega.",
    MARGEM,
    y - 11,
    { tamanho: 8, cor: COR.secundario }
  );

  pagina.textoDireita("Documento gerado pelo Arkos", DIREITA, y, {
    tamanho: 8,
    cor: COR.secundario,
  });
  pagina.textoDireita(
    `Página ${numeroDaPagina} de ${totalDePaginas}`,
    DIREITA,
    y - 11,
    { tamanho: 8, cor: COR.secundario }
  );
}

/**
 * Ordem de compra em PDF: dados da farmácia, do fornecedor, itens com
 * quantidade e valor, e o fechamento com frete e desconto.
 *
 * @param {{ farmacia: {nome: string, cnpj?: string, endereco?: string, telefone?: string},
 *   fornecedor: {nome: string, cnpj?: string, telefone?: string, email?: string},
 *   pedido: {numero: string, emitido_em: string, forma_pagamento: string, situacao: string,
 *     entregue_em?: string|null, frete: number, desconto: number, valor_total: number},
 *   itens: {produto_nome: string, produto_codigo?: string, quantidade: number,
 *     preco_unitario: number}[] }} dados
 * @returns {Buffer}
 */
export function gerarOrdemDeCompraPdf({ farmacia, fornecedor, pedido, itens }) {
  const paginas = [];
  let pagina = new Pagina();
  paginas.push(pagina);

  let y = faixaDoTopo(pagina, { farmacia, pedido });
  y = partes(pagina, y, { pedido, fornecedor });
  y = cabecalhoDaTabela(pagina, y);

  const subtotalItens = itens.reduce(
    (soma, item) => soma + item.quantidade * Number(item.preco_unitario),
    0
  );

  // Espaço que o fechamento ocupa; abaixo disso a folha acabou.
  const PISO_DA_TABELA = MARGEM + 60;

  itens.forEach((item, indice) => {
    if (y < PISO_DA_TABELA + 40) {
      pagina = new Pagina();
      paginas.push(pagina);
      y = faixaDoTopo(pagina, { farmacia, pedido });
      y = cabecalhoDaTabela(pagina, y);
    }
    y -= linhaDoItem(pagina, y, item, indice % 2 === 1);
  });

  // O fechamento nunca fica órfão numa página sem a tabela acima dele.
  if (y < PISO_DA_TABELA + 110) {
    pagina = new Pagina();
    paginas.push(pagina);
    y = faixaDoTopo(pagina, { farmacia, pedido });
  }
  fechamento(pagina, y, { pedido, subtotalItens });

  const unidades = itens.reduce((soma, item) => soma + item.quantidade, 0);
  const resumo =
    `${itens.length} ${itens.length === 1 ? "item" : "itens"}, ` +
    `${unidades} ${unidades === 1 ? "unidade" : "unidades"}.`;

  paginas.forEach((folha, indice) => rodape(folha, resumo, indice + 1, paginas.length));

  return montarDocumento(paginas, `Ordem de compra ${pedido.numero}`);
}
