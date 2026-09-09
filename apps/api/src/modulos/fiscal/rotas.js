import { createHash } from "node:crypto";
import { ERROS, STATUS_NOTA_FISCAL } from "@arkos/shared-types";
import { criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "../../env.js";
import { consultar } from "../../db.js";

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

  /** Notas emitidas no período — tela fiscal. */
  app.get("/notas-fiscais", async (requisicao) => {
    const { de, ate } = requisicao.query ?? {};
    const condicoes = [];
    const valores = [];

    if (de) {
      valores.push(de);
      condicoes.push(`emitida_em::date >= $${valores.length}::date`);
    }
    if (ate) {
      valores.push(ate);
      condicoes.push(`emitida_em::date <= $${valores.length}::date`);
    }

    const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const { rows } = await consultar(
      `SELECT id, venda_id, chave_acesso, status, xml_url, emitida_em
         FROM fiscal.notas_fiscais ${onde}
        ORDER BY emitida_em DESC
        LIMIT 300`,
      valores
    );

    return { notas: rows };
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
    const { venda_id, de, ate, pendentes } = requisicao.query ?? {};
    const condicoes = [];
    const valores = [];

    if (venda_id) {
      valores.push(venda_id);
      condicoes.push(`venda_id = $${valores.length}`);
    }
    if (de) {
      valores.push(de);
      condicoes.push(`criado_em::date >= $${valores.length}::date`);
    }
    if (ate) {
      valores.push(ate);
      condicoes.push(`criado_em::date <= $${valores.length}::date`);
    }
    if (pendentes === "sim") condicoes.push("enviado_anvisa = false");

    const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const { rows } = await consultar(
      `SELECT id, venda_id, produto_id, receita_id, enviado_anvisa, enviado_em, criado_em
         FROM fiscal.controlados_sngpc ${onde}
        ORDER BY criado_em DESC
        LIMIT 300`,
      valores
    );

    const { rows: totais } = await consultar(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE enviado_anvisa)::int AS enviados,
              COUNT(*) FILTER (WHERE NOT enviado_anvisa)::int AS pendentes
         FROM fiscal.controlados_sngpc`
    );

    return { registros: rows, totais: totais[0] };
  });

  /**
   * Marca registros como enviados ao SNGPC — **mockado**: no MVP não existe
   * transmissão real para a Anvisa, isto só registra que o envio foi feito, com
   * a data, para o controle da farmácia (§7).
   */
  app.post(
    "/controlados-sngpc/enviar",
    { preHandler: auth.exigirPermissao("validar_receita") },
    async (requisicao, resposta) => {
      const ids = requisicao.body?.ids;
      if (!Array.isArray(ids) || !ids.length) {
        return invalido(resposta, "Informe os ids dos registros a enviar.");
      }

      const { rows } = await consultar(
        `UPDATE fiscal.controlados_sngpc
            SET enviado_anvisa = true, enviado_em = now()
          WHERE id = ANY($1::uuid[]) AND enviado_anvisa = false
          RETURNING id, venda_id, enviado_anvisa, enviado_em`,
        [ids]
      );

      return {
        registros: rows,
        enviados: rows.length,
        aviso: "Envio simulado: a integração com a Anvisa não está no MVP.",
      };
    }
  );
}
