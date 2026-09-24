import { ERROS, STATUS_NOTA_FISCAL } from "@arkos/shared-types";
import { criarAutenticacao, tokenInterno } from "@arkos/auth-middleware";
import { env } from "../../env.js";
import { consultar } from "../../db.js";
import { textoObrigatorio, textoOpcional, validarCorpo, z } from "../../lib/validacao.js";
import { emitirNfce, ErroFocusNfe } from "./focusnfe.js";
import { montarPayloadNfce } from "./nfce.js";
import {
  buscarVendaParaNota,
  buscarProdutoParaNota,
  buscarItensVendidosNoPeriodo,
  listarProdutosParaRelatorio,
  ErroServico,
} from "./servicos.js";
import { gerarCsv, nomeArquivo, periodo } from "./relatorios.js";

/** Sem classificação cadastrada no produto: cai aqui, nunca "inventa" alíquota. */
const CST_PADRAO = "49";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

const SchemaEmitirNota = z.object({
  venda_id: textoObrigatorio("Informe venda_id."),
  cpf_nota: textoOpcional(),
});

const SchemaRegistrarControlado = z.object({
  venda_id: textoObrigatorio("Informe venda_id."),
  produto_id: textoObrigatorio("Informe produto_id."),
  receita_id: textoObrigatorio("Informe receita_id."),
});

const SchemaEnviarSngpc = z.object({
  ids: z.array(z.string().min(1, "id inválido")).min(1, "Informe os ids dos registros a enviar."),
});

// cpf_nota é criptografado em repouso (pgcrypto, migration 0025,
// docs/PENDENCIAS.md) — decripta aqui pra todo SELECT/RETURNING que usa esta
// lista, sem precisar mexer em cada rota.
const COLUNAS_NOTA = `id, venda_id, chave_acesso, status, numero, serie, url_consulta,
       mensagem_erro, xml_url,
       pgp_sym_decrypt(cpf_nota, current_setting('app.crypto_key'))::text AS cpf_nota,
       emitida_em`;

/** Erro vindo de outro serviço (vendas/estoque): preserva o código de negócio quando existir. */
function responderErroServico(resposta, erro) {
  const status = erro.status >= 400 && erro.status < 500 ? 422 : 502;
  return resposta.code(status).send({ erro: erro.codigo ?? ERROS.FALHA_INTEGRACAO, mensagem: erro.message });
}

/** Grava (nova nota) ou atualiza (reemissão depois de um erro) o resultado real da Focus NFe. */
async function gravarNota({
  idExistente,
  vendaId,
  cpfNota,
  status,
  chaveAcesso = null,
  numero = null,
  serie = null,
  urlConsulta = null,
  mensagemErro = null,
  retornoFocus = null,
}) {
  const retornoFocusJson = retornoFocus ? JSON.stringify(retornoFocus) : null;

  if (idExistente) {
    const { rows } = await consultar(
      `UPDATE fiscal.notas_fiscais
          SET status = $2, chave_acesso = $3, numero = $4, serie = $5,
              url_consulta = $6, mensagem_erro = $7, retorno_focus = $8, emitida_em = now()
        WHERE id = $1
        RETURNING ${COLUNAS_NOTA}`,
      [idExistente, status, chaveAcesso, numero, serie, urlConsulta, mensagemErro, retornoFocusJson]
    );
    return rows[0];
  }

  const { rows } = await consultar(
    `INSERT INTO fiscal.notas_fiscais
          (venda_id, chave_acesso, status, numero, serie, url_consulta, mensagem_erro, retorno_focus, cpf_nota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               pgp_sym_encrypt($9::text, current_setting('app.crypto_key')))
     RETURNING ${COLUNAS_NOTA}`,
    [vendaId, chaveAcesso, status, numero, serie, urlConsulta, mensagemErro, retornoFocusJson, cpfNota]
  );
  return rows[0];
}

/**
 * Rotas de docs/API-CONTRATOS.md — fiscal-service.
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  app.addHook("preHandler", auth.autenticar);

  /**
   * Emite a NFC-e de verdade na Focus NFe (homologação). Idempotente só
   * quando já saiu autorizada: reemitir a mesma venda com status `erro`
   * tenta de novo (é assim que o operador "reemite depois" uma nota que
   * falhou — a Focus NFe reprocessa o mesmo `ref` quando a tentativa
   * anterior não foi autorizada).
   */
  app.post("/notas-fiscais", { preHandler: validarCorpo(SchemaEmitirNota) }, async (requisicao, resposta) => {
    const { venda_id: vendaId, cpf_nota: cpfNota } = requisicao.body;
    // Não o header cru da requisição original — o navegador real autentica
    // só por cookie httpOnly, nunca manda Authorization.
    const token = tokenInterno(requisicao.usuario, { secret: env.JWT_SECRET });

    const { rows: existentes } = await consultar(
      `SELECT ${COLUNAS_NOTA} FROM fiscal.notas_fiscais WHERE venda_id = $1`,
      [vendaId]
    );
    const existente = existentes[0] ?? null;
    if (existente && existente.status === STATUS_NOTA_FISCAL.EMITIDA) {
      return { nota: existente, reemitida: false };
    }

    let venda;
    try {
      venda = await buscarVendaParaNota(vendaId, token);
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }
    if (!venda) {
      return resposta.code(404).send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Venda não encontrada." });
    }

    // Cada item carrega só o snapshot comercial (nome, tipo_controle) — o dado
    // fiscal (NCM/CFOP/código/unidade) mora no cadastro do produto, no
    // estoque-service (docs/ARQUITETURA.md).
    let itensComDadoFiscal;
    try {
      itensComDadoFiscal = await Promise.all(
        venda.itens.map(async (item) => {
          const produto = await buscarProdutoParaNota(item.produto_id, token);
          return {
            ...item,
            ncm: produto?.ncm ?? null,
            cfop: produto?.cfop ?? null,
            codigo: produto?.codigo ?? null,
            unidade_venda: produto?.unidade_venda ?? null,
          };
        })
      );
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // Erro de emissão — payload incompleto (NCM/CFOP faltando, CNPJ emitente
    // não configurado), rejeição da SEFAZ ou falha ao chamar a Focus NFe —
    // nunca bloqueia a venda: grava como `erro`, com o motivo, para o operador
    // tentar reemitir depois (é o vendas-service quem decide isso: não desfaz
    // a venda por causa de uma nota que não saiu).
    //
    // A falta de NCM/CFOP é checada ANTES de chamar a Focus NFe de propósito —
    // evita gastar uma tentativa de emissão com dado incompleto.
    const semDadoFiscal = itensComDadoFiscal.find((item) => !item.ncm || !item.cfop);

    let dadosGravar;
    if (semDadoFiscal) {
      dadosGravar = {
        status: STATUS_NOTA_FISCAL.ERRO,
        mensagemErro:
          `Produto "${semDadoFiscal.produto_nome}" está sem NCM/CFOP cadastrado — ` +
          "complete o cadastro fiscal do produto para emitir a nota.",
      };
    } else if (!env.FARMACIA.cnpj) {
      dadosGravar = {
        status: STATUS_NOTA_FISCAL.ERRO,
        mensagemErro: "FARMACIA_CNPJ não configurado no .env — preencha o CNPJ emitente para emitir notas fiscais.",
      };
    } else {
      const payload = montarPayloadNfce({ itens: itensComDadoFiscal, pagamentos: venda.pagamentos, cpfNota });
      try {
        const { statusHttp, corpo } = await emitirNfce(payload, vendaId);
        const autorizado = corpo?.status === "autorizado";
        dadosGravar = autorizado
          ? {
              status: STATUS_NOTA_FISCAL.EMITIDA,
              chaveAcesso: corpo?.chave_nfe ?? null,
              numero: corpo?.numero ?? null,
              serie: corpo?.serie ?? null,
              urlConsulta: corpo?.url_consulta_nf ?? corpo?.qrcode_url ?? null,
              retornoFocus: corpo,
            }
          : {
              status: STATUS_NOTA_FISCAL.ERRO,
              mensagemErro: corpo?.mensagem_sefaz ?? corpo?.mensagem ?? `Focus NFe respondeu HTTP ${statusHttp}.`,
              retornoFocus: corpo,
            };
      } catch (erro) {
        if (!(erro instanceof ErroFocusNfe)) throw erro;
        dadosGravar = { status: STATUS_NOTA_FISCAL.ERRO, mensagemErro: erro.message };
      }
    }

    const nota = await gravarNota({
      idExistente: existente?.id ?? null,
      vendaId,
      cpfNota: cpfNota ?? existente?.cpf_nota ?? null,
      ...dadosGravar,
    });

    return resposta.code(existente ? 200 : 201).send({ nota, reemitida: Boolean(existente) });
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
      `SELECT ${COLUNAS_NOTA}
         FROM fiscal.notas_fiscais ${onde}
        ORDER BY emitida_em DESC
        LIMIT 300`,
      valores
    );

    return { notas: rows };
  });

  app.get("/notas-fiscais/:venda_id", async (requisicao, resposta) => {
    const { rows } = await consultar(
      `SELECT ${COLUNAS_NOTA}, retorno_focus FROM fiscal.notas_fiscais WHERE venda_id = $1`,
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
   * Vendas do período agrupadas por NCM/CST de PIS e COFINS, com base de
   * cálculo e valor de cada tributo — o mesmo recorte do relatório mensal que
   * a contabilidade pede (docs/PENDENCIAS.md). Junta o item vendido (vendas-
   * service) com a classificação fiscal do produto (estoque-service): nenhum
   * dos dois módulos guarda os dois lados, então a junção é feita aqui.
   *
   * Produto sem CST/alíquota cadastrada entra no grupo "49" com alíquota
   * zero — a mesma cautela do cadastro (§ migration 0026): melhor aparecer
   * como pendente de classificar do que sair um valor de imposto inventado.
   */
  app.get("/relatorios/vendas-pis-cofins", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) {
      return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem: intervalo.erro });
    }

    const token = tokenInterno(requisicao.usuario, { secret: env.JWT_SECRET });
    let itensVendidos;
    let produtos;
    try {
      [itensVendidos, produtos] = await Promise.all([
        buscarItensVendidosNoPeriodo(intervalo.de, intervalo.ate, token),
        listarProdutosParaRelatorio(token),
      ]);
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    const produtoPorId = new Map(produtos.map((produto) => [produto.id, produto]));

    const linhas = itensVendidos.map((item) => {
      const produto = produtoPorId.get(item.produto_id);
      const valorContabil = Number(item.valor_contabil);
      const aliquotaPis = Number(produto?.aliquota_pis ?? 0);
      const aliquotaCofins = Number(produto?.aliquota_cofins ?? 0);
      return {
        ncm: produto?.ncm ?? "(sem NCM)",
        cst_pis: produto?.cst_pis ?? CST_PADRAO,
        cst_cofins: produto?.cst_cofins ?? CST_PADRAO,
        valor_contabil: valorContabil,
        aliquota_pis: aliquotaPis,
        valor_pis: Number(((valorContabil * aliquotaPis) / 100).toFixed(2)),
        aliquota_cofins: aliquotaCofins,
        valor_cofins: Number(((valorContabil * aliquotaCofins) / 100).toFixed(2)),
      };
    });
    linhas.sort((a, b) => a.cst_pis.localeCompare(b.cst_pis) || a.ncm.localeCompare(b.ncm));

    const totais = [
      {
        titulo: "Valor contabil (R$)",
        valor: linhas.reduce((total, linha) => total + linha.valor_contabil, 0),
      },
      { titulo: "Valor PIS (R$)", valor: linhas.reduce((total, linha) => total + linha.valor_pis, 0) },
      {
        titulo: "Valor COFINS (R$)",
        valor: linhas.reduce((total, linha) => total + linha.valor_cofins, 0),
      },
    ];

    const csv = gerarCsv(
      [
        { titulo: "CST PIS", valor: (l) => l.cst_pis },
        { titulo: "CST COFINS", valor: (l) => l.cst_cofins },
        { titulo: "NCM", valor: (l) => l.ncm },
        { titulo: "Valor contabil (R$)", valor: (l) => l.valor_contabil },
        { titulo: "Aliquota PIS (%)", valor: (l) => l.aliquota_pis },
        { titulo: "Valor PIS (R$)", valor: (l) => l.valor_pis },
        { titulo: "Aliquota COFINS (%)", valor: (l) => l.aliquota_cofins },
        { titulo: "Valor COFINS (R$)", valor: (l) => l.valor_cofins },
      ],
      linhas,
      totais
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="${nomeArquivo("vendas_pis_cofins", intervalo.de, intervalo.ate)}"`
      )
      .send(csv);
  });

  /**
   * Registro de controlado para o SNGPC — mockado: `enviado_anvisa` fica false
   * até existir a integração real com a Anvisa (§7).
   */
  app.post(
    "/controlados-sngpc",
    { preHandler: validarCorpo(SchemaRegistrarControlado) },
    async (requisicao, resposta) => {
      const { venda_id, produto_id, receita_id } = requisicao.body;

      const { rows } = await consultar(
        `INSERT INTO fiscal.controlados_sngpc (venda_id, produto_id, receita_id)
              VALUES ($1, $2, $3)
           RETURNING id, venda_id, produto_id, receita_id, enviado_anvisa, criado_em`,
        [venda_id, produto_id, receita_id]
      );

      return resposta.code(201).send({ registro: rows[0] });
    }
  );

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
    {
      preHandler: [auth.exigirPermissao("validar_receita"), validarCorpo(SchemaEnviarSngpc)],
    },
    async (requisicao, resposta) => {
      const { ids } = requisicao.body;

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
