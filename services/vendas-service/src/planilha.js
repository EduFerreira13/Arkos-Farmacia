import { deflateRawSync } from "node:zlib";

/**
 * Gerador de planilha .xlsx com mais de uma aba.
 *
 * O CSV resolve a exportação simples, mas não tem aba: para separar os dados do
 * resumo em folhas diferentes é preciso o formato do Excel. Um .xlsx é um ZIP
 * com alguns XMLs dentro, e é isso que este arquivo monta — sem trazer uma
 * biblioteca de planilha (que pesa alguns megabytes) para dentro do serviço.
 *
 * Escopo de propósito pequeno: texto, número e data já formatada como texto,
 * cabeçalho em negrito e largura de coluna. Nada de fórmula, cor ou gráfico.
 */

// ------------------------------------------------------------------- ZIP

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let indice = 0; indice < 256; indice += 1) {
    let valor = indice;
    for (let bit = 0; bit < 8; bit += 1) {
      valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
    }
    tabela[indice] = valor;
  }
  return tabela;
})();

function crc32(buffer) {
  let crc = -1;
  for (let indice = 0; indice < buffer.length; indice += 1) {
    crc = (crc >>> 8) ^ TABELA_CRC[(crc ^ buffer[indice]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Monta o ZIP no formato que o Excel espera (deflate cru, sem diretórios).
 * @param {{ nome: string, conteudo: string }[]} arquivos
 */
function zipar(arquivos) {
  const entradas = [];
  const pedacos = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const dados = Buffer.from(arquivo.conteudo, "utf8");
    const comprimido = deflateRawSync(dados);
    const nome = Buffer.from(arquivo.nome, "utf8");
    const soma = crc32(dados);

    const cabecalhoLocal = Buffer.alloc(30);
    cabecalhoLocal.writeUInt32LE(0x04034b50, 0); // assinatura
    cabecalhoLocal.writeUInt16LE(20, 4); // versão necessária
    cabecalhoLocal.writeUInt16LE(0, 6); // sem sinalizadores
    cabecalhoLocal.writeUInt16LE(8, 8); // método deflate
    cabecalhoLocal.writeUInt16LE(0, 10); // hora
    cabecalhoLocal.writeUInt16LE(0x21, 12); // data (1980-01-01, fixa por simplicidade)
    cabecalhoLocal.writeUInt32LE(soma, 14);
    cabecalhoLocal.writeUInt32LE(comprimido.length, 18);
    cabecalhoLocal.writeUInt32LE(dados.length, 22);
    cabecalhoLocal.writeUInt16LE(nome.length, 26);
    cabecalhoLocal.writeUInt16LE(0, 28);

    pedacos.push(cabecalhoLocal, nome, comprimido);
    entradas.push({ nome, soma, comprimido: comprimido.length, original: dados.length, deslocamento });
    deslocamento += cabecalhoLocal.length + nome.length + comprimido.length;
  }

  const central = [];
  for (const entrada of entradas) {
    const cabecalho = Buffer.alloc(46);
    cabecalho.writeUInt32LE(0x02014b50, 0);
    cabecalho.writeUInt16LE(20, 4);
    cabecalho.writeUInt16LE(20, 6);
    cabecalho.writeUInt16LE(0, 8);
    cabecalho.writeUInt16LE(8, 10);
    cabecalho.writeUInt16LE(0, 12);
    cabecalho.writeUInt16LE(0x21, 14);
    cabecalho.writeUInt32LE(entrada.soma, 16);
    cabecalho.writeUInt32LE(entrada.comprimido, 20);
    cabecalho.writeUInt32LE(entrada.original, 24);
    cabecalho.writeUInt16LE(entrada.nome.length, 28);
    cabecalho.writeUInt32LE(entrada.deslocamento, 42);

    central.push(cabecalho, entrada.nome);
  }

  const corpoCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(corpoCentral.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return Buffer.concat([...pedacos, corpoCentral, fim]);
}

// ------------------------------------------------------------------ XLSX

const escaparXml = (valor) =>
  String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Converte índice de coluna em letra: 0 vira A, 26 vira AA. */
function letraDaColuna(indice) {
  let letra = "";
  let numero = indice + 1;
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    numero = Math.floor((numero - 1) / 26);
  }
  return letra;
}

function celula(referencia, valor, estilo) {
  const atributoEstilo = estilo ? ` s="${estilo}"` : "";

  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${referencia}"${atributoEstilo}><v>${valor}</v></c>`;
  }
  if (valor === null || valor === undefined || valor === "") {
    return `<c r="${referencia}"${atributoEstilo}/>`;
  }
  return `<c r="${referencia}" t="inlineStr"${atributoEstilo}><is><t xml:space="preserve">${escaparXml(
    valor
  )}</t></is></c>`;
}

/**
 * @param {{ titulo: string, valor: (linha: any) => unknown }[]} colunas
 * @param {any[]} linhas
 */
function montarAba(colunas, linhas) {
  const larguras = colunas
    .map((coluna, indice) => {
      const tamanho = Math.min(Math.max(String(coluna.titulo).length + 4, 12), 52);
      return `<col min="${indice + 1}" max="${indice + 1}" width="${tamanho}" customWidth="1"/>`;
    })
    .join("");

  const cabecalho = colunas
    .map((coluna, indice) => celula(`${letraDaColuna(indice)}1`, coluna.titulo, 1))
    .join("");

  const corpo = linhas
    .map((linha, posicao) => {
      const numeroLinha = posicao + 2;
      const celulas = colunas
        .map((coluna, indice) => {
          const valor = coluna.valor(linha);
          const ehDinheiro = String(coluna.titulo).includes("(R$)");
          return celula(`${letraDaColuna(indice)}${numeroLinha}`, valor, ehDinheiro ? 2 : undefined);
        })
        .join("");
      return `<row r="${numeroLinha}">${celulas}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${larguras}</cols>` +
    `<sheetData><row r="1">${cabecalho}</row>${corpo}</sheetData>` +
    `</worksheet>`
  );
}

/**
 * Gera o arquivo .xlsx.
 *
 * @param {{ nome: string, colunas: { titulo: string, valor: (linha: any) => unknown }[], linhas: any[] }[]} abas
 * @returns {Buffer}
 */
export function gerarXlsx(abas) {
  const planilhas = abas.map((aba, indice) => ({
    nome: `xl/worksheets/sheet${indice + 1}.xml`,
    conteudo: montarAba(aba.colunas, aba.linhas),
  }));

  const referencias = abas
    .map(
      (aba, indice) =>
        `<sheet name="${escaparXml(aba.nome.slice(0, 31))}" sheetId="${indice + 1}" r:id="rId${
          indice + 1
        }"/>`
    )
    .join("");

  const relacoes = abas
    .map(
      (_, indice) =>
        `<Relationship Id="rId${indice + 1}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
        `Target="worksheets/sheet${indice + 1}.xml"/>`
    )
    .join("");

  const tipos = abas
    .map(
      (_, indice) =>
        `<Override PartName="/xl/worksheets/sheet${indice + 1}.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");

  return zipar([
    {
      nome: "[Content_Types].xml",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        tipos +
        `</Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ` +
        `Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${referencias}</sheets></workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        relacoes +
        `<Relationship Id="rId${abas.length + 1}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ` +
        `Target="styles.xml"/>` +
        `</Relationships>`,
    },
    {
      // Estilo 1: cabeçalho em negrito. Estilo 2: dinheiro com duas casas.
      nome: "xl/styles.xml",
      conteudo:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
        `<borders count="1"><border/></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="3">` +
        `<xf xfId="0"/>` +
        `<xf xfId="0" fontId="1" applyFont="1"/>` +
        `<xf xfId="0" numFmtId="164" applyNumberFormat="1"/>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    },
    ...planilhas,
  ]);
}
