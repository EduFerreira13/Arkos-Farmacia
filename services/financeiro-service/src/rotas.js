import {
  ERROS,
  ORIGEM_MOVIMENTACAO_CAIXA,
  TIPO_MOVIMENTACAO_CAIXA,
} from "@arkos/shared-types";
import { criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { vendas } from "./servicos.js";
import {
  abrirCaixa,
  buscarCaixa,
  buscarCaixaAberto,
  fecharCaixa,
  inserirContaPagar,
  inserirContaReceber,
  inserirMovimentacao,
  listarContas,
  listarMovimentacoes,
  quitarContaPagar,
  quitarContaReceber,
  totaisContas,
  totaisDoCaixa,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

function invalido(resposta, mensagem) {
  return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
}

function valorValido(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Number(numero.toFixed(2)) : null;
}

/**
 * Rotas de docs/API-CONTRATOS.md — financeiro-service.
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  app.addHook("preHandler", auth.autenticar);

  /** §5 — um caixa aberto por usuário de cada vez. */
  app.post("/caixa/abrir", async (requisicao, resposta) => {
    const valorAbertura = Number(requisicao.body?.valor_abertura ?? 0);
    if (!Number.isFinite(valorAbertura) || valorAbertura < 0) {
      return invalido(resposta, "valor_abertura inválido.");
    }

    const aberto = await buscarCaixaAberto(requisicao.usuario.id);
    if (aberto) {
      return resposta.code(409).send({
        erro: ERROS.CAIXA_JA_ABERTO,
        mensagem: "Você já tem um caixa aberto. Feche o atual antes de abrir outro.",
        caixa: aberto,
      });
    }

    const caixa = await abrirCaixa({ usuarioId: requisicao.usuario.id, valorAbertura });
    return resposta.code(201).send({ caixa });
  });

  app.get("/caixa/status", async (requisicao) => {
    const caixa = await buscarCaixaAberto(requisicao.usuario.id);
    if (!caixa) return { caixa: null };

    const totais = await totaisDoCaixa(caixa.id);
    const esperado = Number(caixa.valor_abertura) + Number(totais.entradas) - Number(totais.saidas);

    return {
      caixa,
      totais: { ...totais, valor_esperado: Number(esperado.toFixed(2)) },
      movimentacoes: await listarMovimentacoes(caixa.id),
    };
  });

  app.post("/caixa/:id/fechar", async (requisicao, resposta) => {
    const valorContado = Number(requisicao.body?.valor_fechamento_contado);
    if (!Number.isFinite(valorContado) || valorContado < 0) {
      return invalido(resposta, "valor_fechamento_contado inválido.");
    }

    const caixa = await buscarCaixa(requisicao.params.id);
    if (!caixa) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Caixa não encontrado." });
    }
    // Caixa é do operador: só ele (ou um admin) fecha o próprio turno.
    if (caixa.usuario_id !== requisicao.usuario.id && requisicao.usuario.perfil !== "administrador") {
      return resposta.code(403).send({
        erro: ERROS.SEM_PERMISSAO,
        mensagem: "Este caixa pertence a outro operador.",
      });
    }

    const resultado = await fecharCaixa({ caixaId: caixa.id, valorContado });
    if (resultado.erro === "ja_fechado") {
      return resposta
        .code(422)
        .send({ erro: ERROS.CAIXA_FECHADO, mensagem: "Este caixa já está fechado." });
    }

    return resultado;
  });

  /**
   * Lançamento no caixa. Venda finalizada chega aqui pelo vendas-service com
   * origem `venda` — nunca é digitada por alguém (§5). Lançamento manual usa
   * origem `lancamento_manual`.
   */
  app.post("/caixa/movimentacoes", async (requisicao, resposta) => {
    const { tipo, valor, origem, descricao, venda_id } = requisicao.body ?? {};

    if (!Object.values(TIPO_MOVIMENTACAO_CAIXA).includes(tipo)) {
      return invalido(resposta, "tipo deve ser entrada ou saida.");
    }
    if (!Object.values(ORIGEM_MOVIMENTACAO_CAIXA).includes(origem)) {
      return invalido(resposta, "origem deve ser venda ou lancamento_manual.");
    }
    const valorNumero = valorValido(valor);
    if (!valorNumero) return invalido(resposta, "valor precisa ser maior que zero.");

    if (origem === ORIGEM_MOVIMENTACAO_CAIXA.LANCAMENTO_MANUAL && !descricao) {
      return invalido(resposta, "Lançamento manual exige descricao.");
    }

    const caixa = await buscarCaixaAberto(requisicao.usuario.id);
    if (!caixa) {
      return resposta.code(422).send({
        erro: ERROS.CAIXA_FECHADO,
        mensagem: "Nenhum caixa aberto para este operador — abra o caixa antes de operar.",
      });
    }

    const movimentacao = await inserirMovimentacao({
      caixaId: caixa.id,
      tipo,
      valor: valorNumero,
      origem,
      descricao,
      vendaId: venda_id ?? null,
    });

    return resposta.code(201).send({ movimentacao });
  });

  app.get("/contas-pagar", async (requisicao) => ({
    contas: await listarContas("contas_pagar", requisicao.query?.status),
  }));

  app.post("/contas-pagar", { preHandler: auth.exigirPermissao("ver_financeiro") }, async (requisicao, resposta) => {
    const { fornecedor_id, descricao, valor, vencimento } = requisicao.body ?? {};
    if (!descricao || !vencimento) return invalido(resposta, "Informe descricao e vencimento.");
    const valorNumero = valorValido(valor);
    if (!valorNumero) return invalido(resposta, "valor precisa ser maior que zero.");

    const conta = await inserirContaPagar({
      fornecedorId: fornecedor_id,
      descricao,
      valor: valorNumero,
      vencimento,
    });
    return resposta.code(201).send({ conta });
  });

  app.patch("/contas-pagar/:id/pagar", { preHandler: auth.exigirPermissao("ver_financeiro") }, async (requisicao, resposta) => {
    const conta = await quitarContaPagar(requisicao.params.id);
    if (!conta) {
      return resposta.code(422).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Conta não encontrada ou já paga.",
      });
    }
    return { conta };
  });

  app.get("/contas-receber", async (requisicao) => ({
    contas: await listarContas("contas_receber", requisicao.query?.status),
  }));

  app.post("/contas-receber", { preHandler: auth.exigirPermissao("ver_financeiro") }, async (requisicao, resposta) => {
    const { origem, descricao, valor, vencimento } = requisicao.body ?? {};
    if (!origem || !descricao || !vencimento) {
      return invalido(resposta, "Informe origem, descricao e vencimento.");
    }
    const valorNumero = valorValido(valor);
    if (!valorNumero) return invalido(resposta, "valor precisa ser maior que zero.");

    const conta = await inserirContaReceber({
      origem,
      descricao,
      valor: valorNumero,
      vencimento,
    });
    return resposta.code(201).send({ conta });
  });

  app.patch("/contas-receber/:id/receber", { preHandler: auth.exigirPermissao("ver_financeiro") }, async (requisicao, resposta) => {
    const conta = await quitarContaReceber(requisicao.params.id);
    if (!conta) {
      return resposta.code(422).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Conta não encontrada ou já recebida.",
      });
    }
    return { conta };
  });

  /**
   * Fluxo de caixa do dia: soma das vendas por forma de pagamento vem do
   * vendas-service (docs/API-CONTRATOS.md), o resto é do próprio schema.
   */
  app.get("/fluxo-caixa/hoje", async (requisicao) => {
    const caixa = await buscarCaixaAberto(requisicao.usuario.id);

    let resumoVendas = null;
    let falhaVendas = null;
    try {
      resumoVendas = await vendas.resumoDoDia(requisicao.headers.authorization);
    } catch (erro) {
      // Fluxo de caixa não quebra se o vendas-service estiver fora do ar.
      falhaVendas = erro.message;
    }

    const totais = caixa ? await totaisDoCaixa(caixa.id) : null;
    const esperado = caixa
      ? Number(caixa.valor_abertura) + Number(totais.entradas) - Number(totais.saidas)
      : null;

    return {
      caixa: caixa
        ? { ...caixa, totais: { ...totais, valor_esperado: Number(esperado.toFixed(2)) } }
        : null,
      vendas: resumoVendas,
      contas: await totaisContas(),
      aviso_integracao: falhaVendas,
    };
  });
}
