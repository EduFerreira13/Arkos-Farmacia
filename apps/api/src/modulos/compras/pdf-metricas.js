/**
 * Larguras de avanço das fontes Helvetica e Helvetica-Bold.
 *
 * Sem elas não dá para alinhar texto à direita: a versão anterior estimava a
 * largura por contagem de caracteres, subestimava o negrito, e o rótulo
 * "TOTAL DO PEDIDO" acabava colidindo com o valor ao lado. Medida chutada não
 * alinha — ou se mede a fonte, ou não se alinha à direita.
 *
 * Os valores são os das métricas da Adobe, em milésimos do tamanho da fonte
 * (um "A" em Helvetica 10pt ocupa 667/1000 × 10 = 6,67pt). Estão aqui só os
 * caracteres imprimíveis do ASCII; letra acentuada tem o mesmo avanço da letra
 * base nas fontes padrão do PDF, então `à` é resolvido como `a`.
 */

const ASCII = " !\"#$%&'()*+,-./0123456789:;<=>?@" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`" +
  "abcdefghijklmnopqrstuvwxyz{|}~";

// prettier-ignore
const NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// prettier-ignore
const NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const tabela = (larguras) => {
  const mapa = new Map();
  for (let indice = 0; indice < ASCII.length; indice += 1) {
    mapa.set(ASCII[indice], larguras[indice]);
  }
  return mapa;
};

const LARGURAS = { normal: tabela(NORMAL), negrito: tabela(NEGRITO) };

/**
 * Letra acentuada resolve para a letra base: nas fontes padrão do PDF o
 * acento é composto por cima, sem alterar o avanço.
 */
const SEM_ACENTO = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
  ç: "c", ñ: "n", ý: "y", ÿ: "y",
  À: "A", Á: "A", Â: "A", Ã: "A", Ä: "A", Å: "A",
  È: "E", É: "E", Ê: "E", Ë: "E",
  Ì: "I", Í: "I", Î: "I", Ï: "I",
  Ò: "O", Ó: "O", Ô: "O", Õ: "O", Ö: "O",
  Ù: "U", Ú: "U", Û: "U", Ü: "U",
  Ç: "C", Ñ: "N", Ý: "Y",
};

/** Sinais tipográficos fora do ASCII que o documento usa. */
const EXTRAS = {
  normal: { "—": 1000, "–": 556, "·": 278, "•": 350, "“": 333, "”": 333, "‘": 222, "’": 222 },
  negrito: { "—": 1000, "–": 556, "·": 278, "•": 350, "“": 500, "”": 500, "‘": 278, "’": 278 },
};

/**
 * Largura de um texto, em pontos.
 *
 * @param {string} texto
 * @param {number} tamanho corpo da fonte em pontos
 * @param {"normal"|"negrito"} [peso]
 * @param {number} [espacamento] espaço extra entre caracteres (operador Tc)
 */
export function larguraTexto(texto, tamanho, peso = "normal", espacamento = 0) {
  const tabelaDoPeso = LARGURAS[peso];
  const extras = EXTRAS[peso];
  let milesimos = 0;
  let caracteres = 0;

  for (const caractere of String(texto)) {
    caracteres += 1;
    const largura =
      tabelaDoPeso.get(caractere) ??
      tabelaDoPeso.get(SEM_ACENTO[caractere]) ??
      extras[caractere] ??
      // Desconhecido: usa a largura do espaço, que é a menor aposta errada.
      tabelaDoPeso.get(" ");
    milesimos += largura;
  }

  return (milesimos * tamanho) / 1000 + espacamento * caracteres;
}

/**
 * Corta o texto para caber na largura dada, com reticências. Usa a métrica
 * real, então o corte acontece onde o texto de fato encostaria na coluna
 * seguinte — e não onde uma contagem de letras achou que encostaria.
 */
export function encurtarPara(texto, larguraMaxima, tamanho, peso = "normal") {
  const original = String(texto ?? "");
  if (larguraTexto(original, tamanho, peso) <= larguraMaxima) return original;

  const reticencias = larguraTexto("...", tamanho, peso);
  let corte = "";

  for (const caractere of original) {
    if (larguraTexto(corte + caractere, tamanho, peso) + reticencias > larguraMaxima) break;
    corte += caractere;
  }

  return `${corte.trimEnd()}...`;
}

/** Quebra o texto em linhas que caibam na largura, sem partir palavra. */
export function quebrarEmLinhas(texto, larguraMaxima, tamanho, peso = "normal") {
  const linhas = [];
  let atual = "";

  for (const palavra of String(texto ?? "").split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (larguraTexto(tentativa, tamanho, peso) <= larguraMaxima) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    // Palavra sozinha maior que a linha: corta, senão vaza para fora da coluna.
    atual = larguraTexto(palavra, tamanho, peso) > larguraMaxima
      ? encurtarPara(palavra, larguraMaxima, tamanho, peso)
      : palavra;
  }

  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}
