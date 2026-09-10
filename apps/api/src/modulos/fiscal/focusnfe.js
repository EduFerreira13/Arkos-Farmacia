import { env } from "../../env.js";

/**
 * Cliente HTTP para a Focus NFe (emissão de NFC-e, `POST /v2/nfce`).
 * Autenticação HTTP Basic: usuário é o token da empresa, senha vazia — mas o
 * esquema Basic exige mandar os dois lados do ":" mesmo com a senha em
 * branco (RFC 7617), então nunca omitir o `:` final.
 *
 * A emissão é síncrona: a mesma resposta já traz autorizado ou rejeitado
 * (`corpo.status`). Por isso `emitirNfce` só lança erro para falha de
 * transporte ou configuração ausente — rejeição da SEFAZ chega como resposta
 * normal, e quem decide o que fazer com ela é o chamador (rotas.js), que trata
 * isso como erro de emissão, não como falha de integração (a venda não pode
 * ser bloqueada por uma rejeição da SEFAZ).
 */

export class ErroFocusNfe extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroFocusNfe";
  }
}

function autenticacaoBasic(token) {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

/**
 * @param {object} payload Corpo da requisição (ver montarPayloadNfce em nfce.js)
 * @param {string} ref Identificador único da nota no nosso sistema — usamos o venda_id.
 *   Reenviar o mesmo `ref` reprocessa a nota se a tentativa anterior não foi
 *   autorizada (é assim que a Focus NFe torna a emissão idempotente).
 * @returns {Promise<{ statusHttp: number, corpo: object|null }>}
 */
export async function emitirNfce(payload, ref) {
  const token = env.FOCUS_NFE.tokenHomologacao;
  if (!token) {
    throw new ErroFocusNfe(
      "FOCUS_NFE_TOKEN_HOMOLOGACAO não configurado — preencha o .env para emitir notas fiscais."
    );
  }

  const url = `${env.FOCUS_NFE.urlBase}/v2/nfce?ref=${encodeURIComponent(ref)}`;

  let resposta;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: autenticacaoBasic(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (erro) {
    throw new ErroFocusNfe(`Focus NFe não respondeu (${erro.message}).`);
  }

  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    throw new ErroFocusNfe(
      `Focus NFe respondeu um corpo que não é JSON (HTTP ${resposta.status}).`
    );
  }

  return { statusHttp: resposta.status, corpo };
}
