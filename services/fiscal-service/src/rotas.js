import { createHash } from "node:crypto";
import { ERROS, STATUS_NOTA_FISCAL } from "@arkos/shared-types";
import { criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { consultar } from "./db.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

/**
 * Chave de acesso simulada: 44 dígitos derivados do ID da venda, então a mesma
 * venda sempre gera a mesma chave. No MVP a emissão é mockada (§7 das regras de
 * negócio) — a estrutura de dados já é a real para trocar pelo provedor depois.
 */
function chaveAcessoSimulada(vendaId) {
  const digest = createHash("sha256").update(String(vendaId)).digest("hex");
  const digitos = digest.replace(/\D/g, "");
  return digitos.padEnd(44, "0").slice(0, 44);
}

function invalido(resposta, mensagem) {
  return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
}

/**
 * Rotas de docs/API-CONTRATOS.md — fiscal-service (mockado no MVP).
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  app.addHook("preHandler", auth.autenticar);

  app.post("/notas-fiscais", async (requisicao, resposta) => {
    const vendaId = requisicao.body?.venda_id;
    if (!vendaId) return invalido(resposta, "Informe venda_id.");

    // Emissão é idempotente: reemitir a mesma venda devolve a nota existente.
    const { rows: existentes } = await consultar(
      `SELECT id, venda_id, chave_acesso, status, xml_url, emitida_em
         FROM fiscal.notas_fiscais WHERE venda_id = $1`,
      [vendaId]
    );
    if (existentes.length) {
      return { nota: existentes[0], reemitida: false };
    }

    const chave = chaveAcessoSimulada(vendaId);
    const { rows } = await consultar(
      `INSERT INTO fiscal.notas_fiscais (venda_id, chave_acesso, status, xml_url)
            VALUES ($1, $2, $3, $4)
         RETURNING id, venda_id, chave_acesso, status, xml_url, emitida_em`,
      [vendaId, chave, STATUS_NOTA_FISCAL.SIMULADO, `/xml-simulado/${chave}.xml`]
    );

    return resposta.code(201).send({ nota: rows[0], reemitida: false });
  });

  app.get("/notas-fiscais/:venda_id", async (requisicao, resposta) => {
    const { rows } = await consultar(
      `SELECT id, venda_id, chave_acesso, status, xml_url, emitida_em
         FROM fiscal.notas_fiscais WHERE venda_id = $1`,
      [requisicao.params.venda_id]
    );
    if (!rows.length) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Nenhuma nota para esta venda." });
    }
    return { nota: rows[0] };
  });

  /**
   * Registro de controlado para o SNGPC — mockado: `enviado_anvisa` fica false
   * até existir a integração real com a Anvisa (§7).
   */
  app.post("/controlados-sngpc", async (requisicao, resposta) => {
    const { venda_id, produto_id, receita_id } = requisicao.body ?? {};
    if (!venda_id || !produto_id || !receita_id) {
      return invalido(resposta, "Informe venda_id, produto_id e receita_id.");
    }

    const { rows } = await consultar(
      `INSERT INTO fiscal.controlados_sngpc (venda_id, produto_id, receita_id)
            VALUES ($1, $2, $3)
         RETURNING id, venda_id, produto_id, receita_id, enviado_anvisa, criado_em`,
      [venda_id, produto_id, receita_id]
    );

    return resposta.code(201).send({ registro: rows[0] });
  });

  app.get("/controlados-sngpc", async (requisicao) => {
    const { venda_id } = requisicao.query ?? {};
    const valores = [];
    let onde = "";
    if (venda_id) {
      valores.push(venda_id);
      onde = "WHERE venda_id = $1";
    }
    const { rows } = await consultar(
      `SELECT id, venda_id, produto_id, receita_id, enviado_anvisa, criado_em
         FROM fiscal.controlados_sngpc ${onde}
        ORDER BY criado_em DESC
        LIMIT 200`,
      valores
    );
    return { registros: rows };
  });
}
