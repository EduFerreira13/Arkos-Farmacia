import {
  ERROS,
  TIPO_CONTROLE,
  TIPO_CONTROLE_LISTA,
  TIPO_MOVIMENTACAO,
  TIPO_MOVIMENTACAO_LISTA,
  exigeReceita,
} from "@arkos/shared-types";
import { criarAutenticacao, temPermissao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import {
  ErroNegocio,
  registrarEntradaLote,
  registrarMovimentacaoManual,
  registrarSaidaFefo,
} from "./movimentacoes.js";
import {
  atualizarProduto,
  buscarProduto,
  buscarProdutoPorCodigoBarras,
  inserirCategoria,
  inserirFornecedor,
  inserirProduto,
  listarCategorias,
  listarEstoqueBaixo,
  listarFornecedores,
  listarHistoricoPrecos,
  listarLotes,
  listarMovimentacoes,
  listarProdutos,
  listarProdutosAVencer,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

function responderErro(resposta, erro) {
  if (erro instanceof ErroNegocio) {
    return resposta.code(erro.status).send({ erro: erro.codigo, mensagem: erro.message });
  }
  throw erro;
}

function invalido(resposta, mensagem) {
  return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
}

function numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function inteiroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Rotas de docs/API-CONTRATOS.md — estoque-service.
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  // Toda rota do serviço exige token válido.
  app.addHook("preHandler", auth.autenticar);

  app.get("/produtos", async (requisicao, resposta) => {
    const { nome, codigo_barras, categoria_id, tipo_controle } = requisicao.query ?? {};

    if (tipo_controle && !TIPO_CONTROLE_LISTA.includes(tipo_controle)) {
      return invalido(resposta, `tipo_controle inválido. Use: ${TIPO_CONTROLE_LISTA.join(", ")}.`);
    }

    return { produtos: await listarProdutos({ nome, codigo_barras, categoria_id, tipo_controle }) };
  });

  app.get("/produtos/:id", async (requisicao, resposta) => {
    const produto = await buscarProduto(requisicao.params.id);
    if (!produto) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Produto não encontrado." });
    }
    const [lotes, historico] = await Promise.all([
      listarLotes(produto.id),
      listarHistoricoPrecos(produto.id),
    ]);
    return { produto: { ...produto, lotes }, historico_precos: historico };
  });

  /** Atalho usado pelo PDV para leitura de código de barras. */
  app.get("/produtos/codigo-barras/:codigo", async (requisicao, resposta) => {
    const produto = await buscarProdutoPorCodigoBarras(requisicao.params.codigo);
    if (!produto) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Nenhum produto com este código de barras." });
    }
    return { produto };
  });

  app.post("/produtos", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const corpo = requisicao.body ?? {};
    const tipoControle = corpo.tipo_controle ?? TIPO_CONTROLE.LIVRE;

    if (!TIPO_CONTROLE_LISTA.includes(tipoControle)) {
      return invalido(resposta, `tipo_controle inválido. Use: ${TIPO_CONTROLE_LISTA.join(", ")}.`);
    }

    // §1 — campos obrigatórios do cadastro.
    const obrigatorios = ["nome", "fabricante", "categoria_id", "codigo_barras", "unidade_venda"];
    const faltando = obrigatorios.filter((campo) => !corpo[campo]);
    if (faltando.length) {
      return invalido(resposta, `Campos obrigatórios ausentes: ${faltando.join(", ")}.`);
    }

    const precoVenda = Number(corpo.preco_venda);
    const precoCusto = Number(corpo.preco_custo ?? 0);
    if (!Number.isFinite(precoVenda) || precoVenda <= 0) {
      return invalido(resposta, "preco_venda precisa ser maior que zero.");
    }
    if (!Number.isFinite(precoCusto) || precoCusto < 0) {
      return invalido(resposta, "preco_custo inválido.");
    }

    const estoqueMinimo = Number(corpo.estoque_minimo ?? 0);
    if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
      return invalido(resposta, "estoque_minimo precisa ser um inteiro maior ou igual a zero.");
    }

    // §1 — controlado exige princípio ativo e classe terapêutica, que são o que
    // acionam as regras de venda restrita.
    if (exigeReceita(tipoControle)) {
      if (!corpo.principio_ativo) {
        return invalido(resposta, "Medicamento controlado exige principio_ativo.");
      }
      if (!corpo.classe_terapeutica) {
        return invalido(resposta, "Medicamento controlado exige classe_terapeutica.");
      }
    }

    try {
      const produto = await inserirProduto({
        ...corpo,
        tipo_controle: tipoControle,
        preco_venda: precoVenda,
        preco_custo: precoCusto,
        estoque_minimo: estoqueMinimo,
        venda_sob_encomenda: Boolean(corpo.venda_sob_encomenda),
      });
      return resposta.code(201).send({ produto });
    } catch (erro) {
      // 23505 = unique_violation, 23503 = foreign_key_violation no Postgres.
      if (erro.code === "23505") {
        return resposta.code(409).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "Já existe produto com este código de barras.",
        });
      }
      if (erro.code === "23503") {
        return invalido(resposta, "Categoria ou fornecedor informado não existe.");
      }
      throw erro;
    }
  });

  app.patch("/produtos/:id", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const { id } = requisicao.params;
    const corpo = requisicao.body ?? {};

    if (corpo.tipo_controle && !TIPO_CONTROLE_LISTA.includes(corpo.tipo_controle)) {
      return invalido(resposta, `tipo_controle inválido. Use: ${TIPO_CONTROLE_LISTA.join(", ")}.`);
    }
    for (const campo of ["preco_venda", "preco_custo"]) {
      if (corpo[campo] === undefined) continue;
      const valor = Number(corpo[campo]);
      if (!Number.isFinite(valor) || valor < 0) {
        return invalido(resposta, `${campo} inválido.`);
      }
      corpo[campo] = valor;
    }

    const produto = await atualizarProduto(id, corpo, requisicao.usuario.id);
    if (!produto) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Produto não encontrado." });
    }
    return { produto };
  });

  app.post("/lotes", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const { produto_id, numero_lote, quantidade, data_validade, motivo } = requisicao.body ?? {};

    if (!produto_id || !numero_lote || !data_validade) {
      return invalido(resposta, "Informe produto_id, numero_lote e data_validade.");
    }
    const quantidadeValida = inteiroPositivo(quantidade);
    if (!quantidadeValida) {
      return invalido(resposta, "quantidade precisa ser um inteiro maior que zero.");
    }

    try {
      const lote = await registrarEntradaLote({
        produtoId: produto_id,
        numeroLote: numero_lote,
        quantidade: quantidadeValida,
        dataValidade: data_validade,
        motivo,
        usuarioId: requisicao.usuario.id,
      });
      return resposta.code(201).send({ lote });
    } catch (erro) {
      return responderErro(resposta, erro);
    }
  });

  /**
   * Saída usa FEFO e é permitida a quem pode vender (o vendas-service repassa
   * o token do operador ao dar baixa). Entrada, ajuste, perda e devolução são
   * operações de estoque e exigem permissão de ajuste (§6).
   */
  app.post("/movimentacoes", async (requisicao, resposta) => {
    const { produto_id, lote_id, tipo, quantidade, motivo } = requisicao.body ?? {};

    if (!TIPO_MOVIMENTACAO_LISTA.includes(tipo)) {
      return invalido(resposta, `tipo inválido. Use: ${TIPO_MOVIMENTACAO_LISTA.join(", ")}.`);
    }
    if (!produto_id) return invalido(resposta, "Informe produto_id.");

    const permissaoNecessaria =
      tipo === TIPO_MOVIMENTACAO.SAIDA ? "vender" : "ajustar_estoque";
    if (!temPermissao(requisicao.usuario, permissaoNecessaria)) {
      return resposta.code(403).send({
        erro: ERROS.SEM_PERMISSAO,
        mensagem: "Seu perfil não tem permissão para esta movimentação.",
      });
    }

    try {
      if (tipo === TIPO_MOVIMENTACAO.SAIDA) {
        const quantidadeValida = inteiroPositivo(quantidade);
        if (!quantidadeValida) {
          return invalido(resposta, "quantidade precisa ser um inteiro maior que zero.");
        }
        const resultado = await registrarSaidaFefo({
          produtoId: produto_id,
          quantidade: quantidadeValida,
          motivo,
          usuarioId: requisicao.usuario.id,
        });
        return resposta.code(201).send({ saida: resultado });
      }

      if (tipo === TIPO_MOVIMENTACAO.ENTRADA) {
        return invalido(
          resposta,
          "Entrada de estoque é feita por POST /lotes, que exige número de lote e validade."
        );
      }

      // Ajuste, perda e devolução: lote explícito e motivo obrigatório (§2).
      if (!lote_id) return invalido(resposta, "Informe lote_id para ajuste, perda ou devolução.");
      if (!motivo || !String(motivo).trim()) {
        return invalido(resposta, "motivo é obrigatório em ajuste, perda e devolução.");
      }

      const quantidadeNumero = Number(quantidade);
      const quantidadeOk =
        tipo === TIPO_MOVIMENTACAO.AJUSTE
          ? Number.isInteger(quantidadeNumero) && quantidadeNumero >= 0
          : Number.isInteger(quantidadeNumero) && quantidadeNumero > 0;
      if (!quantidadeOk) {
        return invalido(
          resposta,
          tipo === TIPO_MOVIMENTACAO.AJUSTE
            ? "No ajuste, quantidade é a contagem física do lote (inteiro >= 0)."
            : "quantidade precisa ser um inteiro maior que zero."
        );
      }

      const resultado = await registrarMovimentacaoManual({
        tipo,
        produtoId: produto_id,
        loteId: lote_id,
        quantidade: quantidadeNumero,
        motivo: String(motivo).trim(),
        usuarioId: requisicao.usuario.id,
      });
      return resposta.code(201).send(resultado);
    } catch (erro) {
      return responderErro(resposta, erro);
    }
  });

  app.get("/movimentacoes", async (requisicao) => {
    const { produto_id, limite } = requisicao.query ?? {};
    const limiteValido = numeroPositivo(limite) ?? 100;
    return {
      movimentacoes: await listarMovimentacoes({
        produtoId: produto_id,
        limite: Math.min(limiteValido, 500),
      }),
    };
  });

  app.get("/alertas/estoque-baixo", async () => {
    return { produtos: await listarEstoqueBaixo() };
  });

  app.get("/alertas/vencimento", async (requisicao, resposta) => {
    const { dias } = requisicao.query ?? {};
    const janelas = [30, 60, 90];
    const diasValidos = dias === undefined ? 90 : Number(dias);
    if (!janelas.includes(diasValidos)) {
      return invalido(resposta, `dias deve ser uma das janelas: ${janelas.join(", ")}.`);
    }
    return { dias: diasValidos, lotes: await listarProdutosAVencer(diasValidos) };
  });

  // Cadastros auxiliares — o formulário de produto precisa deles.
  app.get("/categorias", async () => ({ categorias: await listarCategorias() }));

  app.post("/categorias", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const nome = requisicao.body?.nome;
    if (!nome) return invalido(resposta, "Informe nome.");
    return resposta.code(201).send({ categoria: await inserirCategoria(nome) });
  });

  app.get("/fornecedores", async () => ({ fornecedores: await listarFornecedores() }));

  app.post("/fornecedores", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const corpo = requisicao.body ?? {};
    if (!corpo.nome) return invalido(resposta, "Informe nome.");
    try {
      return resposta.code(201).send({ fornecedor: await inserirFornecedor(corpo) });
    } catch (erro) {
      if (erro.code === "23505") {
        return resposta
          .code(409)
          .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Já existe fornecedor com este CNPJ." });
      }
      throw erro;
    }
  });
}
