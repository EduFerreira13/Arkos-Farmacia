/**
 * Gerador de PDF da ordem de compra.
 *
 * Mesma escolha do gerador de planilha do vendas-service: um PDF de texto é um
 * formato simples o bastante para ser escrito à mão, e uma biblioteca de PDF
 * traz alguns megabytes e uma superfície de atualização que este serviço não
 * precisa carregar para imprimir uma folha.
 *
 * Escopo de propósito pequeno: página A4 retrato, Helvetica em três pesos de
 * tamanho, linhas horizontais e texto alinhado à esquerda ou à direita. Nada de
 * imagem, cor de fundo ou quebra automática de parágrafo.
 */

// A4 em pontos (1 pt = 1/72 pol).
const LARGURA = 595.28;
const ALTURA = 841.89;

const FONTES = {
  normal: "F1", // Helvetica
  negrito: "F2", // Helvetica-Bold
};

/**
 * Escapa o que quebraria a string literal do PDF e troca o que está fora do
 * Latin-1 (a fonte base não tem esses glifos) por um equivalente sem acento.
 */
function textoPdf(valor) {
  const semQuebra = String(valor ?? "").replace(/[\r\n\t]+/g, " ");
  let saida = "";

  for (const caractere of semQuebra) {
    const codigo = caractere.codePointAt(0);
    if (caractere === "\\") saida += "\\\\";
    else if (caractere === "(") saida += "\\(";
    else if (caractere === ")") saida += "\\)";
    else if (codigo < 256) saida += caractere;
    else saida += "?";
  }

  return saida;
}

/** Corta o texto no limite de largura da coluna, com reticências. */
function encurtar(valor, maximo) {
  const texto = String(valor ?? "");
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}...`;
}

/**
 * Largura aproximada de um texto em Helvetica. Não é a métrica exata da fonte —
 * é o suficiente para alinhar número à direita sem carregar a tabela de
 * larguras: dígito e maiúscula ocupam mais que minúscula, e espaço, bem menos.
 */
function larguraAproximada(texto, tamanho) {
  let unidades = 0;
  for (const caractere of String(texto)) {
    if (caractere === " ") unidades += 0.28;
    else if (/[.,:;'|]/.test(caractere)) unidades += 0.26;
    else if (/[0-9A-Z$]/.test(caractere)) unidades += 0.6;
    else if (/[ilj]/.test(caractere)) unidades += 0.24;
    else unidades += 0.52;
  }
  return unidades * tamanho;
}

/** Acumula os comandos de desenho de uma página. */
class Pagina {
  constructor() {
    this.comandos = [];
  }

  texto(valor, x, y, { tamanho = 10, peso = "normal" } = {}) {
    this.comandos.push(
      `BT /${FONTES[peso]} ${tamanho} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ` +
        `(${textoPdf(valor)}) Tj ET`
    );
  }

  textoDireita(valor, xDireita, y, opcoes = {}) {
    const tamanho = opcoes.tamanho ?? 10;
    this.texto(valor, xDireita - larguraAproximada(valor, tamanho), y, opcoes);
  }

  linha(x1, y, x2, { espessura = 0.5, cinza = 0.75 } = {}) {
    this.comandos.push(
      `${cinza} G ${espessura} w ${x1.toFixed(2)} ${y.toFixed(2)} m ` +
        `${x2.toFixed(2)} ${y.toFixed(2)} l S 0 G`
    );
  }

  get conteudo() {
    return this.comandos.join("\n");
  }
}

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
  objetos[idPaginas] =
    `<< /Type /Pages /Kids [${referencias}] /Count ${paginas.length} >>`;
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

  // Corpo do arquivo, guardando o deslocamento de cada objeto para a xref.
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

/** R$ 1.234,50 — o Intl não entra aqui porque a fonte base não tem o "R$" com
 *  espaço estreito que ele usa, e o resultado sairia com caractere trocado. */
function dinheiro(valor) {
  const [inteiro, centavos] = Number(valor ?? 0).toFixed(2).split(".");
  const sinal = inteiro.startsWith("-") ? "-" : "";
  const digitos = sinal ? inteiro.slice(1) : inteiro;
  const comMilhar = digitos.replace(/\B(?=(\d{3})+$)/g, ".");
  return `${sinal}R$ ${comMilhar},${centavos}`;
}

// ------------------------------------------------------------ layout da folha

const MARGEM = 48;
const DIREITA = LARGURA - MARGEM;

// Colunas da tabela de itens, da esquerda para a direita.
const COLUNAS = {
  produto: MARGEM,
  quantidade: MARGEM + 300,
  unitario: MARGEM + 380,
  subtotal: DIREITA,
};

function cabecalho(pagina, { farmacia, pedido }) {
  let y = ALTURA - MARGEM;

  pagina.texto(farmacia.nome, MARGEM, y, { tamanho: 16, peso: "negrito" });
  pagina.textoDireita("ORDEM DE COMPRA", DIREITA, y, { tamanho: 13, peso: "negrito" });
  y -= 16;

  const identificacao = [
    farmacia.cnpj ? `CNPJ ${farmacia.cnpj}` : null,
    farmacia.telefone,
  ]
    .filter(Boolean)
    .join("   ");
  if (identificacao) pagina.texto(identificacao, MARGEM, y, { tamanho: 9 });
  pagina.textoDireita(pedido.numero, DIREITA, y, { tamanho: 12, peso: "negrito" });
  y -= 12;

  if (farmacia.endereco) pagina.texto(farmacia.endereco, MARGEM, y, { tamanho: 9 });
  y -= 14;

  pagina.linha(MARGEM, y, DIREITA);
  return y - 22;
}

/** Bloco de duas colunas: fornecedor à esquerda, condições à direita. */
function partes(pagina, y, { pedido, fornecedor }) {
  const meio = MARGEM + 270;

  pagina.texto("FORNECEDOR", MARGEM, y, { tamanho: 9, peso: "negrito" });
  pagina.texto("CONDICOES", meio, y, { tamanho: 9, peso: "negrito" });
  y -= 14;

  const esquerda = [
    fornecedor.nome,
    fornecedor.cnpj ? `CNPJ ${fornecedor.cnpj}` : null,
    fornecedor.telefone,
    fornecedor.email,
  ].filter(Boolean);

  const direita = [
    `Emissao: ${pedido.emitido_em}`,
    `Pagamento: ${pedido.forma_pagamento}`,
    `Situacao: ${pedido.situacao}`,
    pedido.entregue_em ? `Entregue em: ${pedido.entregue_em}` : null,
  ].filter(Boolean);

  const linhas = Math.max(esquerda.length, direita.length);
  for (let indice = 0; indice < linhas; indice += 1) {
    if (esquerda[indice]) pagina.texto(esquerda[indice], MARGEM, y, { tamanho: 10 });
    if (direita[indice]) pagina.texto(direita[indice], meio, y, { tamanho: 10 });
    y -= 13;
  }

  return y - 12;
}

function cabecalhoDaTabela(pagina, y) {
  pagina.texto("ITEM", COLUNAS.produto, y, { tamanho: 9, peso: "negrito" });
  pagina.textoDireita("QTD", COLUNAS.quantidade + 40, y, { tamanho: 9, peso: "negrito" });
  pagina.textoDireita("UNITARIO", COLUNAS.unitario + 70, y, { tamanho: 9, peso: "negrito" });
  pagina.textoDireita("SUBTOTAL", COLUNAS.subtotal, y, { tamanho: 9, peso: "negrito" });
  y -= 6;
  pagina.linha(MARGEM, y, DIREITA);
  return y - 15;
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

  let y = cabecalho(pagina, { farmacia, pedido });
  y = partes(pagina, y, { pedido, fornecedor });
  y = cabecalhoDaTabela(pagina, y);

  const subtotalItens = itens.reduce(
    (soma, item) => soma + item.quantidade * Number(item.preco_unitario),
    0
  );

  for (const item of itens) {
    // Folha cheia: abre outra e repete o cabeçalho da tabela.
    if (y < MARGEM + 120) {
      pagina = new Pagina();
      paginas.push(pagina);
      y = ALTURA - MARGEM;
      pagina.texto(`${pedido.numero} (continuacao)`, MARGEM, y, {
        tamanho: 10,
        peso: "negrito",
      });
      y = cabecalhoDaTabela(pagina, y - 18);
    }

    const nome = item.produto_codigo
      ? `${item.produto_codigo}  ${item.produto_nome}`
      : item.produto_nome;

    pagina.texto(encurtar(nome, 58), COLUNAS.produto, y, { tamanho: 10 });
    pagina.textoDireita(String(item.quantidade), COLUNAS.quantidade + 40, y, { tamanho: 10 });
    pagina.textoDireita(dinheiro(item.preco_unitario), COLUNAS.unitario + 70, y, { tamanho: 10 });
    pagina.textoDireita(
      dinheiro(item.quantidade * Number(item.preco_unitario)),
      COLUNAS.subtotal,
      y,
      { tamanho: 10 }
    );
    y -= 15;
  }

  y -= 4;
  pagina.linha(MARGEM, y, DIREITA);
  y -= 18;

  const fechamento = [
    ["Subtotal dos itens", subtotalItens],
    Number(pedido.frete) ? ["Frete", Number(pedido.frete)] : null,
    Number(pedido.desconto) ? ["Desconto", -Number(pedido.desconto)] : null,
  ].filter(Boolean);

  for (const [rotulo, valor] of fechamento) {
    pagina.textoDireita(rotulo, COLUNAS.unitario + 70, y, { tamanho: 10 });
    pagina.textoDireita(dinheiro(valor), COLUNAS.subtotal, y, { tamanho: 10 });
    y -= 14;
  }

  pagina.textoDireita("TOTAL DO PEDIDO", COLUNAS.unitario + 70, y, {
    tamanho: 11,
    peso: "negrito",
  });
  pagina.textoDireita(dinheiro(pedido.valor_total), COLUNAS.subtotal, y, {
    tamanho: 11,
    peso: "negrito",
  });

  y -= 34;
  pagina.texto(
    `${itens.length} item(ns), ${itens.reduce((soma, item) => soma + item.quantidade, 0)} unidade(s).`,
    MARGEM,
    y,
    { tamanho: 9 }
  );
  y -= 12;
  pagina.texto(
    "Conferir lote e validade de cada item na entrega. Documento gerado pelo Arkos.",
    MARGEM,
    y,
    { tamanho: 9 }
  );

  return montarDocumento(paginas, `Ordem de compra ${pedido.numero}`);
}
