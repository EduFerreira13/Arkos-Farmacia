import { z } from "zod";
import { ERROS } from "@arkos/shared-types";

/**
 * Valida (e sanitiza) o corpo da requisição com um schema zod, para usar como
 * `preHandler` de rota.
 *
 * Dois efeitos, um só mecanismo: zod por padrão descarta qualquer campo do
 * corpo que não esteja declarado no schema — então, além de validar tipo e
 * regra de cada campo, isto já é a whitelist de mass assignment (§ auditoria
 * de segurança): só o que o schema lista chega em `requisicao.body` daqui pra
 * frente, nunca o corpo cru.
 *
 * @param {import("zod").ZodType} schema
 */
export function validarCorpo(schema) {
  return async function validar(requisicao, resposta) {
    const resultado = schema.safeParse(requisicao.body ?? {});
    if (!resultado.success) {
      return resposta.code(400).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: mensagemDoErro(resultado.error),
      });
    }
    requisicao.body = resultado.data;
  };
}

/** Junta todo problema achado numa mensagem só, sempre no mesmo formato. */
function mensagemDoErro(erroZod) {
  return erroZod.issues
    .map((problema) => {
      const caminho = problema.path.join(".");
      return caminho ? `${caminho}: ${problema.message}` : problema.message;
    })
    .join("; ");
}

// ---------------------------------------------------------------- campos comuns

/** Texto obrigatório — mesma mensagem esteja o campo ausente ou vazio. */
export const textoObrigatorio = (mensagem) =>
  z.string({ error: mensagem }).trim().min(1, mensagem);

/** Texto opcional: ausente, vazio ou só espaço viram `null` (nunca string vazia salva). */
export const textoOpcional = () =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((valor) => (valor ? valor : null));

/** Valor monetário: número maior que zero, arredondado para 2 casas. */
export const valorMonetario = (mensagem) =>
  z
    .number({ error: mensagem })
    .positive(mensagem)
    .transform((valor) => Number(valor.toFixed(2)));

/** Mesma regra, mas aceita zero — abertura de caixa, por exemplo. */
export const valorNaoNegativo = (mensagem) =>
  z
    .number({ error: mensagem })
    .nonnegative(mensagem)
    .transform((valor) => Number(valor.toFixed(2)));

export { z };
