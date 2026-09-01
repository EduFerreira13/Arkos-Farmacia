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
  formatarData,
  formatarDataHora,
  gerarCsv,
  hojeNoFuso,
  nomeArquivo,
  periodo,
} from "./relatorios.js";
import {
  ErroNegocio,
  registrarEntradaLote,
  registrarMovimentacaoManual,
  registrarSaidaFefo,
} from "./movimentacoes.js";
import {
  atualizarFornecedor,
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
  listarMovimentacoesNoPeriodo,
  listarPosicaoEstoque,
  listarProdutos,
  listarProdutosAVencer,
  proximoCodigoProduto,
} from "./repositorio.js";
import { consultarCnpj, ErroCnpj } from "./cnpj.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

function responderErro(resposta, erro) {
  if (erro instanceof ErroNegocio) {
    return resposta.code(erro.status).send({ erro: erro.codigo, mensagem: erro.message });
  }
  throw erro;
}

/**
 * `dias_de_uso` é opcional: vazio significa "não se aplica" e é gravado como
 * null. Devolve INVALIDO quando veio algo que não é um prazo utilizável, para o
 * chamador recusar com mensagem em vez de gravar lixo.
 */
const INVALIDO = Symbol("dias_de_uso invalido");

function validarDiasDeUso(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const dias = Number(valor);
  if (!Number.isInteger(dias) || dias <= 0) return INVALIDO;
  return dias;
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
    const { nome, busca, codigo_barras, categoria_id, tipo_controle, com_saldo } =
      requisicao.query ?? {};

    if (tipo_controle && !TIPO_CONTROLE_LISTA.includes(tipo_controle)) {
      return invalido(resposta, `tipo_controle inválido. Use: ${TIPO_CONTROLE_LISTA.join(", ")}.`);
    }

    return {
      produtos: await listarProdutos({
        // `busca` é o nome novo do filtro livre; `nome` continua valendo para
        // quem já chamava assim (o PDV, entre outros).
        nome: busca ?? nome,
        codigo_barras,
        categoria_id,
        tipo_controle,
        // Inventário e perda só listam o que existe fisicamente.
        com_saldo: com_saldo === "true" || com_saldo === true,
      }),
    };
  });

  /**
   * Código sugerido para o próximo cadastro. É a primeira coisa que a tela de
   * novo produto mostra: sequencial e legível, no lugar do UUID.
   */
  app.get("/produtos/proximo-codigo", async () => ({ codigo: await proximoCodigoProduto() }));

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

    // Duração do tratamento: opcional, mas se vier tem de ser um prazo real.
    const diasDeUso = validarDiasDeUso(corpo.dias_de_uso);
    if (diasDeUso === INVALIDO) {
      return invalido(resposta, "dias_de_uso precisa ser um inteiro maior que zero.");
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
        // Sem código informado, o serviço gera o próximo da sequência.
        codigo: String(corpo.codigo ?? "").trim() || (await proximoCodigoProduto()),
        tipo_controle: tipoControle,
        preco_venda: precoVenda,
        preco_custo: precoCusto,
        estoque_minimo: estoqueMinimo,
        venda_sob_encomenda: Boolean(corpo.venda_sob_encomenda),
        dias_de_uso: diasDeUso,
      });
      return resposta.code(201).send({ produto });
    } catch (erro) {
      // 23505 = unique_violation, 23503 = foreign_key_violation no Postgres.
      if (erro.code === "23505") {
        const porCodigo = String(erro.detail ?? "").includes("(codigo)");
        return resposta.code(409).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: porCodigo
            ? "Já existe produto com este código."
            : "Já existe produto com este código de barras.",
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

    if (corpo.dias_de_uso !== undefined) {
      const dias = validarDiasDeUso(corpo.dias_de_uso);
      if (dias === INVALIDO) {
        return invalido(resposta, "dias_de_uso precisa ser um inteiro maior que zero.");
      }
      corpo.dias_de_uso = dias;
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
   * Saída (FEFO) e devolução são as duas pontas de uma venda, então bastam a
   * permissão de vender — o vendas-service repassa o token do operador ao dar
   * baixa e ao estornar uma finalização que falhou no meio. Ajuste e perda
   * mexem no saldo sem venda por trás e exigem ajustar_estoque (§6).
   */
  app.post("/movimentacoes", async (requisicao, resposta) => {
    const { produto_id, lote_id, tipo, quantidade, motivo } = requisicao.body ?? {};

    if (!TIPO_MOVIMENTACAO_LISTA.includes(tipo)) {
      return invalido(resposta, `tipo inválido. Use: ${TIPO_MOVIMENTACAO_LISTA.join(", ")}.`);
    }
    if (!produto_id) return invalido(resposta, "Informe produto_id.");

    const permissaoNecessaria = [TIPO_MOVIMENTACAO.SAIDA, TIPO_MOVIMENTACAO.DEVOLUCAO].includes(
      tipo
    )
      ? "vender"
      : "ajustar_estoque";
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

  app.get("/movimentacoes", async (requisicao, resposta) => {
    const { produto_id, tipo, de, ate, busca, limite } = requisicao.query ?? {};
    if (tipo && !TIPO_MOVIMENTACAO_LISTA.includes(tipo)) {
      return invalido(resposta, `tipo inválido. Use: ${TIPO_MOVIMENTACAO_LISTA.join(", ")}.`);
    }
    const limiteValido = numeroPositivo(limite) ?? 100;
    return {
      movimentacoes: await listarMovimentacoes({
        produtoId: produto_id,
        tipo,
        de,
        ate,
        busca,
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

  /** Posição de estoque em planilha (CSV que o Excel abre direto). */
  app.get("/relatorios/estoque", async (requisicao, resposta) => {
    const { busca, tipo_controle, categoria_id, com_saldo } = requisicao.query ?? {};
    if (tipo_controle && !TIPO_CONTROLE_LISTA.includes(tipo_controle)) {
      return invalido(resposta, `tipo_controle inválido. Use: ${TIPO_CONTROLE_LISTA.join(", ")}.`);
    }

    // O arquivo sai com o que está na tela: mesmos filtros, mesma lista.
    const linhas = await listarPosicaoEstoque({
      busca,
      tipo_controle,
      categoria_id,
      com_saldo: com_saldo === "true" || com_saldo === true,
    });
    const valorEmEstoque = (linha) => linha.saldo_disponivel * Number(linha.preco_custo);

    const csv = gerarCsv(
      [
        { titulo: "Codigo", valor: (l) => l.codigo ?? "" },
        { titulo: "Produto", valor: (l) => l.nome },
        { titulo: "Categoria", valor: (l) => l.categoria_nome ?? "" },
        { titulo: "Principio ativo", valor: (l) => l.principio_ativo ?? "" },
        { titulo: "Fabricante", valor: (l) => l.fabricante ?? "" },
        { titulo: "Fornecedor", valor: (l) => l.fornecedor_nome ?? "" },
        { titulo: "Codigo de barras", valor: (l) => l.codigo_barras ?? "" },
        { titulo: "Tipo de controle", valor: (l) => l.tipo_controle },
        { titulo: "Classe terapeutica", valor: (l) => l.classe_terapeutica ?? "" },
        { titulo: "Unidade de venda", valor: (l) => l.unidade_venda },
        { titulo: "Saldo disponivel", valor: (l) => l.saldo_disponivel },
        { titulo: "Saldo vencido", valor: (l) => l.saldo_vencido },
        { titulo: "Estoque minimo", valor: (l) => l.estoque_minimo },
        {
          titulo: "Situacao",
          valor: (l) =>
            l.saldo_disponivel === 0
              ? "Sem estoque"
              : l.saldo_disponivel <= l.estoque_minimo
                ? "Abaixo do minimo"
                : "Normal",
        },
        { titulo: "Proxima validade", valor: (l) => formatarData(l.proxima_validade) },
        { titulo: "Preco de custo (R$)", valor: (l) => Number(l.preco_custo) },
        { titulo: "Preco de venda (R$)", valor: (l) => Number(l.preco_venda) },
        { titulo: "Valor em estoque pelo custo (R$)", valor: valorEmEstoque },
      ],
      linhas,
      [
        { titulo: "Produtos", valor: linhas.length },
        {
          titulo: "Unidades disponiveis",
          valor: linhas.reduce((t, l) => t + l.saldo_disponivel, 0),
        },
        {
          titulo: "Produtos abaixo do minimo",
          valor: linhas.filter((l) => l.saldo_disponivel <= l.estoque_minimo).length,
        },
        {
          titulo: "Valor total em estoque pelo custo (R$)",
          valor: linhas.reduce((t, l) => t + valorEmEstoque(l), 0),
        },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="estoque_posicao_${hojeNoFuso()}.csv"`)
      .send(csv);
  });

  /** Auditoria de movimentações do período em planilha. */
  app.get("/relatorios/movimentacoes", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) return invalido(resposta, intervalo.erro);

    const { tipo, produto_id, busca } = requisicao.query ?? {};
    if (tipo && !TIPO_MOVIMENTACAO_LISTA.includes(tipo)) {
      return invalido(resposta, `tipo inválido. Use: ${TIPO_MOVIMENTACAO_LISTA.join(", ")}.`);
    }

    const linhas = await listarMovimentacoesNoPeriodo({ ...intervalo, tipo, produto_id, busca });
    const soma = (tipo) =>
      linhas.filter((l) => l.tipo === tipo).reduce((t, l) => t + l.quantidade, 0);

    const csv = gerarCsv(
      [
        { titulo: "Data e hora", valor: (l) => formatarDataHora(l.criado_em) },
        { titulo: "Tipo", valor: (l) => l.tipo },
        { titulo: "Codigo do produto", valor: (l) => l.produto_codigo ?? "" },
        { titulo: "Produto", valor: (l) => l.produto_nome },
        { titulo: "Tipo de controle", valor: (l) => l.tipo_controle },
        { titulo: "Lote", valor: (l) => l.numero_lote ?? "" },
        { titulo: "Validade do lote", valor: (l) => formatarData(l.data_validade) },
        { titulo: "Quantidade", valor: (l) => l.quantidade },
        { titulo: "Motivo", valor: (l) => l.motivo ?? "" },
        { titulo: "Usuario responsavel", valor: (l) => l.usuario_id },
      ],
      linhas,
      [
        { titulo: "Movimentacoes no periodo", valor: linhas.length },
        { titulo: "Unidades que entraram", valor: soma("entrada") + soma("devolucao") },
        { titulo: "Unidades que sairam em venda", valor: soma("saida") },
        { titulo: "Unidades perdidas", valor: soma("perda") },
        // No ajuste a quantidade é o delta: positivo achou sobra, negativo falta.
        { titulo: "Saldo dos ajustes de inventario", valor: soma("ajuste") },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="${nomeArquivo(
          tipo ? `movimentacoes_${tipo}` : "movimentacoes_estoque",
          intervalo.de,
          intervalo.ate
        )}"`
      )
      .send(csv);
  });

  // Cadastros auxiliares — o formulário de produto precisa deles.
  app.get("/categorias", async () => ({ categorias: await listarCategorias() }));

  app.post("/categorias", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const nome = requisicao.body?.nome;
    if (!nome) return invalido(resposta, "Informe nome.");
    return resposta.code(201).send({ categoria: await inserirCategoria(nome) });
  });

  app.get("/fornecedores", async (requisicao) => ({
    fornecedores: await listarFornecedores({ busca: requisicao.query?.busca }),
  }));

  /**
   * Consulta pública de CNPJ (Receita Federal via BrasilAPI). Fica no serviço,
   * e não no navegador, porque o endpoint público não libera CORS — e assim a
   * tela não precisa saber qual provedor está sendo usado.
   */
  app.get("/fornecedores/consulta-cnpj/:cnpj", async (requisicao, resposta) => {
    try {
      return { fornecedor: await consultarCnpj(requisicao.params.cnpj) };
    } catch (erro) {
      if (erro instanceof ErroCnpj) {
        return resposta
          .code(erro.status)
          .send({ erro: erro.codigo, mensagem: erro.message });
      }
      throw erro;
    }
  });

  /** Fornecedores em planilha, com o mesmo filtro da tela. */
  app.get("/relatorios/fornecedores", async (requisicao, resposta) => {
    const linhas = await listarFornecedores({ busca: requisicao.query?.busca });

    const csv = gerarCsv(
      [
        { titulo: "Fornecedor", valor: (l) => l.nome },
        { titulo: "CNPJ", valor: (l) => l.cnpj ?? "" },
        { titulo: "Telefone", valor: (l) => l.telefone ?? "" },
        { titulo: "Email", valor: (l) => l.email ?? "" },
        { titulo: "Produtos vinculados", valor: (l) => l.total_produtos },
      ],
      linhas,
      [
        { titulo: "Fornecedores na lista", valor: linhas.length },
        { titulo: "Com CNPJ cadastrado", valor: linhas.filter((l) => l.cnpj).length },
        { titulo: "Sem produto vinculado", valor: linhas.filter((l) => !l.total_produtos).length },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="fornecedores_${hojeNoFuso()}.csv"`)
      .send(csv);
  });

  app.patch("/fornecedores/:id", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    try {
      const fornecedor = await atualizarFornecedor(requisicao.params.id, requisicao.body ?? {});
      if (!fornecedor) return invalido(resposta, "Informe algum campo para atualizar.");
      return { fornecedor };
    } catch (erro) {
      if (erro.code === "23505") {
        return resposta
          .code(409)
          .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Já existe fornecedor com este CNPJ." });
      }
      throw erro;
    }
  });

  app.post("/fornecedores", { preHandler: auth.exigirPermissao("ajustar_estoque") }, async (requisicao, resposta) => {
    const corpo = requisicao.body ?? {};
    if (!corpo.nome) return invalido(resposta, "Informe nome.");
    if (corpo.cnpj && String(corpo.cnpj).length > 18) {
      return invalido(resposta, "CNPJ deve ter no máximo 18 caracteres (00.000.000/0000-00).");
    }
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
