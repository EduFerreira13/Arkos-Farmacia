/**
 * Geração de planilha (CSV) para abrir no Excel.
 *
 * Separador `;`, decimal com vírgula e BOM no começo: é o que faz o Excel em
 * português abrir o arquivo já com as colunas separadas, sem passar pelo
 * assistente de importação.
 */

import { env } from "./env.js";

const SEPARADOR = ";";
const BOM = "﻿";

/** Coluna cujo título traz "(R$)" é dinheiro e sai sempre com duas casas. */
const ehDinheiro = (titulo) => String(titulo).includes("(R$)");

function celula(valor, dinheiro = false) {
  if (valor === null || valor === undefined) return "";

  if (typeof valor === "number") {
    // Quantidade inteira sai sem casas decimais — "2 itens", não "2,00 itens".
    if (!dinheiro && Number.isInteger(valor)) return String(valor);
    return valor.toFixed(2).replace(".", ",");
  }

  const texto = String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * @param {{ titulo: string, valor: (linha: any) => unknown }[]} colunas
 * @param {any[]} linhas
 * @param {{ titulo: string, valor: unknown }[]} [totais] linhas finais de totais
 */
export function gerarCsv(colunas, linhas, totais) {
  const partes = [colunas.map((coluna) => celula(coluna.titulo)).join(SEPARADOR)];

  for (const linha of linhas) {
    partes.push(
      colunas
        .map((coluna) => celula(coluna.valor(linha), ehDinheiro(coluna.titulo)))
        .join(SEPARADOR)
    );
  }

  if (totais?.length) {
    partes.push("");
    for (const total of totais) {
      partes.push(
        [celula(total.titulo), celula(total.valor, ehDinheiro(total.titulo))].join(SEPARADOR)
      );
    }
  }

  return BOM + partes.join("\r\n") + "\r\n";
}

/**
 * Hoje no fuso do negócio (AAAA-MM-DD). Usar o UTC aqui faria o relatório
 * "de hoje" pular para o dia seguinte depois das 21h em São Paulo.
 */
export function hojeNoFuso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: env.TZ_NEGOCIO }).format(new Date());
}

/** Nome de arquivo com o período, para não sobrescrever exportação anterior. */
export function nomeArquivo(prefixo, de, ate) {
  return `${prefixo}_${de}_a_${ate}.csv`;
}

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: env.TZ_NEGOCIO,
});

export function formatarDataHora(valor) {
  return valor ? dataHora.format(new Date(valor)) : "";
}

export function formatarData(valor) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Valida o período recebido na query. Sem parâmetros, usa o dia de hoje.
 * @param {{ de?: string, ate?: string }} query
 */
export function periodo(query = {}) {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  const hoje = hojeNoFuso();
  const de = query.de ?? hoje;
  const ate = query.ate ?? hoje;

  if (!formato.test(de) || !formato.test(ate)) {
    return { erro: "Datas devem estar no formato AAAA-MM-DD." };
  }
  if (de > ate) {
    return { erro: "A data inicial não pode ser depois da data final." };
  }
  return { de, ate };
}
