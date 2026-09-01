/**
 * Consulta de CNPJ na base pública da Receita Federal.
 *
 * O provedor é a BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/<cnpj>`),
 * que repassa o Cadastro Nacional da Pessoa Jurídica sem exigir chave. A
 * consulta fica aqui, e não no navegador, por dois motivos: o endpoint público
 * não libera CORS, e assim trocar de provedor não mexe em nenhuma tela.
 *
 * O que volta preenche o cadastro do fornecedor — razão social, telefone e
 * email —, e a pessoa confere antes de salvar. Nada é gravado por conta própria.
 *
 * Sem rede, a consulta falha com mensagem clara e o cadastro segue manual.
 */

import { env } from "./env.js";
import { ERROS } from "@arkos/shared-types";

const TEMPO_LIMITE_MS = 8000;

export class ErroCnpj extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.name = "ErroCnpj";
    this.status = status;
    this.codigo = codigo;
  }
}

/** Deixa só os 14 dígitos — a tela manda formatado (00.000.000/0000-00). */
export function apenasDigitos(cnpj) {
  return String(cnpj ?? "").replace(/\D/g, "");
}

/** 00.000.000/0000-00 a partir dos 14 dígitos. */
function formatar(digitos) {
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Dígitos verificadores do CNPJ. Vale a checagem antes de sair na rede: erro de
 * digitação é o caso comum, e assim a resposta é imediata.
 */
function digitosConferem(digitos) {
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return false;

  const calcular = (tamanho) => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let indice = 0; indice < tamanho; indice += 1) {
      soma += Number(digitos[indice]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return calcular(12) === Number(digitos[12]) && calcular(13) === Number(digitos[13]);
}

/** Telefone da Receita vem como DDD + número em campos separados. */
function telefoneDe(dados) {
  const ddd = String(dados.ddd_telefone_1 ?? "").replace(/\D/g, "");
  if (!ddd) return null;
  const numero = ddd.length > 2 ? ddd.slice(2) : "";
  const area = ddd.slice(0, 2);
  if (!numero) return null;
  const meio = numero.length > 8 ? numero.slice(0, 5) : numero.slice(0, 4);
  return `(${area}) ${meio}-${numero.slice(meio.length)}`;
}

/**
 * @param {string} cnpj com ou sem máscara
 * @returns {Promise<{cnpj: string, nome: string, razao_social: string,
 *   nome_fantasia: string|null, telefone: string|null, email: string|null,
 *   situacao: string|null, municipio: string|null, uf: string|null}>}
 */
export async function consultarCnpj(cnpj) {
  const digitos = apenasDigitos(cnpj);

  if (!digitosConferem(digitos)) {
    throw new ErroCnpj(400, ERROS.DADOS_INVALIDOS, "CNPJ inválido. Confira os 14 dígitos.");
  }

  let resposta;
  try {
    resposta = await fetch(`${env.CNPJ_API_URL}/${digitos}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch {
    throw new ErroCnpj(
      502,
      ERROS.FALHA_INTEGRACAO,
      "Não foi possível consultar a Receita agora. Preencha os dados do fornecedor à mão."
    );
  }

  if (resposta.status === 404) {
    throw new ErroCnpj(404, ERROS.NAO_ENCONTRADO, "Nenhuma empresa encontrada com este CNPJ.");
  }
  if (!resposta.ok) {
    throw new ErroCnpj(
      502,
      ERROS.FALHA_INTEGRACAO,
      "A consulta de CNPJ respondeu com erro. Tente de novo em instantes."
    );
  }

  const dados = await resposta.json();
  const razaoSocial = dados.razao_social ?? dados.nome ?? null;

  return {
    cnpj: formatar(digitos),
    // O cadastro do fornecedor guarda um nome só: a razão social é a que vale
    // na nota, então é ela que vai — o fantasia fica visível para conferência.
    nome: razaoSocial,
    razao_social: razaoSocial,
    nome_fantasia: dados.nome_fantasia || null,
    telefone: telefoneDe(dados),
    email: dados.email || null,
    situacao: dados.descricao_situacao_cadastral || null,
    municipio: dados.municipio || null,
    uf: dados.uf || null,
  };
}
