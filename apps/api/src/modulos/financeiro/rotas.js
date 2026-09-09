import {
  ERROS,
  ORIGEM_MOVIMENTACAO_CAIXA,
  TIPO_MOVIMENTACAO_CAIXA,
} from "@arkos/shared-types";
import { criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "../../env.js";
import { vendas } from "./servicos.js";
import {
  formatarData,
  formatarDataHora,
  gerarCsv,
  hojeNoFuso,
  nomeArquivo,
  periodo,
} from "./relatorios.js";
import {
  abrirCaixa,
  buscarCaixa,
  caixaPorDia,
  correlacaoContas,
  listarCaixasNoPeriodo,
  listarContasNoPeriodo,
  listarMovimentacoesNoPeriodo,
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
    if (!descricao) return invalido(resposta, "Informe descricao.");
    const valorNumero = valorValido(valor);
    if (!valorNumero) return invalido(resposta, "valor precisa ser maior que zero.");

    // Compra recebida sem data combinada entra com vencimento em 30 dias.
    const conta = await inserirContaPagar({
      fornecedorId: fornecedor_id,
      descricao,
      valor: valorNumero,
      vencimento: vencimento ?? null,
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

  /** Movimento de caixa do período em planilha (CSV que o Excel abre direto). */
  app.get("/relatorios/caixa", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) return invalido(resposta, intervalo.erro);

    const [linhas, caixas] = await Promise.all([
      listarMovimentacoesNoPeriodo(intervalo),
      listarCaixasNoPeriodo(intervalo),
    ]);

    const somaPorTipo = (tipo) =>
      linhas.filter((l) => l.tipo === tipo).reduce((t, l) => t + Number(l.valor), 0);
    const somaVendas = linhas
      .filter((l) => l.origem === "venda" && l.tipo === "entrada")
      .reduce((t, l) => t + Number(l.valor), 0);
    const divergencias = caixas
      .filter((c) => c.fechado_em)
      .reduce(
        (t, c) => t + (Number(c.valor_fechamento_contado) - Number(c.valor_fechamento_esperado)),
        0
      );

    const csv = gerarCsv(
      [
        { titulo: "Data e hora", valor: (l) => formatarDataHora(l.criado_em) },
        { titulo: "Tipo", valor: (l) => (l.tipo === "entrada" ? "Entrada" : "Saida") },
        {
          titulo: "Origem",
          valor: (l) => (l.origem === "venda" ? "Venda" : "Lancamento manual"),
        },
        { titulo: "Descricao", valor: (l) => l.descricao ?? "" },
        { titulo: "Venda de origem", valor: (l) => (l.venda_id ? l.venda_id.slice(0, 8) : "") },
        { titulo: "Operador do caixa", valor: (l) => l.usuario_id },
        { titulo: "Valor (R$)", valor: (l) => Number(l.valor) },
      ],
      linhas,
      [
        { titulo: "Lancamentos no periodo", valor: linhas.length },
        { titulo: "Entradas (R$)", valor: somaPorTipo("entrada") },
        { titulo: "Saidas (R$)", valor: somaPorTipo("saida") },
        { titulo: "Entradas de venda (R$)", valor: somaVendas },
        { titulo: "Resultado do periodo (R$)", valor: somaPorTipo("entrada") - somaPorTipo("saida") },
        { titulo: "Caixas abertos no periodo", valor: caixas.length },
        { titulo: "Caixas fechados", valor: caixas.filter((c) => c.fechado_em).length },
        { titulo: "Soma das divergencias de fechamento (R$)", valor: divergencias },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="${nomeArquivo("movimento_caixa", intervalo.de, intervalo.ate)}"`
      )
      .send(csv);
  });

  /** Contas a pagar ou a receber com vencimento no período, em planilha. */
  app.get("/relatorios/contas", { preHandler: auth.exigirPermissao("ver_financeiro") }, async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) return invalido(resposta, intervalo.erro);

    const tipo = requisicao.query?.tipo === "receber" ? "receber" : "pagar";
    const tabela = tipo === "receber" ? "contas_receber" : "contas_pagar";
    const linhas = await listarContasNoPeriodo(tabela, intervalo);

    const quitado = tipo === "receber" ? "recebido" : "pago";
    const soma = (filtro) =>
      linhas.filter(filtro).reduce((t, l) => t + Number(l.valor), 0);
    const hoje = hojeNoFuso();

    const csv = gerarCsv(
      [
        { titulo: "Vencimento", valor: (l) => formatarData(l.vencimento) },
        { titulo: "Descricao", valor: (l) => l.descricao },
        {
          titulo: tipo === "receber" ? "Origem" : "Fornecedor",
          valor: (l) => (tipo === "receber" ? l.origem : (l.fornecedor_id ?? "")),
        },
        {
          titulo: "Situacao",
          valor: (l) =>
            l.status === quitado
              ? quitado === "pago"
                ? "Paga"
                : "Recebida"
              : String(l.vencimento).slice(0, 10) < hoje
                ? "Atrasada"
                : "Pendente",
        },
        {
          titulo: quitado === "pago" ? "Pago em" : "Recebido em",
          valor: (l) => formatarDataHora(l.pago_em ?? l.recebido_em),
        },
        { titulo: "Valor (R$)", valor: (l) => Number(l.valor) },
      ],
      linhas,
      [
        { titulo: "Contas no periodo", valor: linhas.length },
        { titulo: "Total no periodo (R$)", valor: soma(() => true) },
        {
          titulo: "Total pendente (R$)",
          valor: soma((l) => l.status !== quitado),
        },
        {
          titulo: "Total atrasado (R$)",
          valor: soma((l) => l.status !== quitado && String(l.vencimento).slice(0, 10) < hoje),
        },
        {
          titulo: quitado === "pago" ? "Total pago (R$)" : "Total recebido (R$)",
          valor: soma((l) => l.status === quitado),
        },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="${nomeArquivo(`contas_a_${tipo}`, intervalo.de, intervalo.ate)}"`
      )
      .send(csv);
  });

  /**
   * Visão geral do financeiro: o que há para pagar e para receber por faixa de
   * vencimento, o resultado projetado dessa correlação, o que já foi quitado no
   * mês e a curva de caixa dos últimos dias.
   */
  app.get("/visao-geral", { preHandler: auth.exigirPermissao("ver_financeiro") }, async (requisicao) => {
    const [correlacao, curva, caixa, totais] = await Promise.all([
      correlacaoContas(),
      caixaPorDia(14),
      buscarCaixaAberto(requisicao.usuario.id),
      totaisContas(),
    ]);

    const somar = (linhas) => linhas.reduce((total, linha) => total + Number(linha.valor), 0);
    const aPagar = somar(correlacao.pagar);
    const aReceber = somar(correlacao.receber);

    const porFaixa = (linhas) =>
      Object.fromEntries(
        linhas.map((linha) => [linha.faixa, { valor: Number(linha.valor), quantidade: linha.quantidade }])
      );

    let resumoVendas = null;
    try {
      resumoVendas = await vendas.resumoDoDia(requisicao.headers.authorization);
    } catch {
      resumoVendas = null;
    }

    return {
      a_pagar: { total: Number(aPagar.toFixed(2)), por_faixa: porFaixa(correlacao.pagar) },
      a_receber: { total: Number(aReceber.toFixed(2)), por_faixa: porFaixa(correlacao.receber) },
      // Positivo = o que entra cobre o que sai no que está em aberto.
      saldo_projetado: Number((aReceber - aPagar).toFixed(2)),
      atrasados: {
        a_pagar: Number(totais.a_pagar_atrasado),
        a_receber: Number(totais.a_receber_atrasado),
      },
      mes: {
        pago: Number(correlacao.mes.pago_no_mes),
        recebido: Number(correlacao.mes.recebido_no_mes),
        resultado: Number(
          (Number(correlacao.mes.recebido_no_mes) - Number(correlacao.mes.pago_no_mes)).toFixed(2)
        ),
      },
      caixa_por_dia: curva,
      caixa_aberto: caixa,
      vendas_hoje: resumoVendas,
    };
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
