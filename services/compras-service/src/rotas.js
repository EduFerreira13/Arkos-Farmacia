import {
  ERROS,
  FORMA_PAGAMENTO_COMPRA,
  FORMA_PAGAMENTO_COMPRA_LABEL,
  FORMA_PAGAMENTO_COMPRA_LISTA,
  STATUS_PEDIDO_COMPRA,
  STATUS_PEDIDO_COMPRA_LABEL,
  STATUS_PEDIDO_COMPRA_LISTA,
} from "@arkos/shared-types";
import { criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { ErroServico, estoque, financeiro } from "./servicos.js";
import { formatarData, formatarDataHora, gerarCsv, nomeArquivo, periodo } from "./relatorios.js";
import { gerarOrdemDeCompraPdf } from "./pdf.js";
import {
  buscarPedido,
  buscarPedidoCompleto,
  criarPedido,
  listarItens,
  listarPedidos,
  listarPedidosNoPeriodo,
  marcarCancelado,
  registrarRecebimento,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

/** Compras mexe em estoque e gera conta a pagar: exige permissão de ajuste. */
const PERMISSAO = "ajustar_estoque";

function invalido(resposta, mensagem) {
  return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
}

function bloqueado(resposta, mensagem) {
  return resposta.code(422).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
}

function responderErroServico(resposta, erro) {
  const status = erro.status >= 400 && erro.status < 500 ? 422 : 502;
  return resposta.code(status).send({
    erro: erro.codigo ?? ERROS.FALHA_INTEGRACAO,
    mensagem: erro.message,
    servico: erro.servico,
  });
}

/**
 * Rotas do compras-service (docs/API-CONTRATOS.md).
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  app.addHook("preHandler", auth.autenticar);

  /** Filtros da tela de pedidos — os mesmos que o relatório aceita. */
  function filtrosDePedido(query = {}) {
    return {
      status: query.status,
      de: query.de,
      ate: query.ate,
      forma_pagamento: query.forma_pagamento,
      fornecedor_id: query.fornecedor_id,
      busca: query.busca,
    };
  }

  function filtrosValidos(resposta, filtros) {
    if (filtros.status && !STATUS_PEDIDO_COMPRA_LISTA.includes(filtros.status)) {
      return invalido(resposta, `status inválido. Use: ${STATUS_PEDIDO_COMPRA_LISTA.join(", ")}.`);
    }
    if (
      filtros.forma_pagamento &&
      !FORMA_PAGAMENTO_COMPRA_LISTA.includes(filtros.forma_pagamento)
    ) {
      return invalido(
        resposta,
        `forma_pagamento inválida. Use: ${FORMA_PAGAMENTO_COMPRA_LISTA.join(", ")}.`
      );
    }
    return null;
  }

  app.get("/pedidos", async (requisicao, resposta) => {
    const filtros = filtrosDePedido(requisicao.query);
    const recusa = filtrosValidos(resposta, filtros);
    if (recusa) return recusa;
    return { pedidos: await listarPedidos(filtros) };
  });

  app.get("/pedidos/:id", async (requisicao, resposta) => {
    const pedido = await buscarPedidoCompleto(requisicao.params.id);
    if (!pedido) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Pedido não encontrado." });
    }
    return { pedido };
  });

  /**
   * Sugestão automática de compra (§4): monta a lista a partir dos produtos
   * abaixo do mínimo, sugerindo repor até o dobro do estoque mínimo.
   */
  app.get("/sugestao", async (requisicao, resposta) => {
    const token = requisicao.headers.authorization;
    try {
      const [alertas, catalogo] = await Promise.all([
        estoque.estoqueBaixo(token),
        estoque.listarProdutos(token),
      ]);

      const porId = new Map(catalogo.produtos.map((produto) => [produto.id, produto]));
      const sugestoes = alertas.produtos.map((alerta) => {
        const produto = porId.get(alerta.produto_id) ?? {};
        const alvo = Math.max(alerta.estoque_minimo * 2, alerta.estoque_minimo + 1);
        return {
          produto_id: alerta.produto_id,
          produto_nome: alerta.nome,
          saldo_atual: alerta.quantidade_atual,
          estoque_minimo: alerta.estoque_minimo,
          quantidade_sugerida: Math.max(alvo - alerta.quantidade_atual, 1),
          preco_custo: produto.preco_custo ?? 0,
          fornecedor_id: produto.fornecedor_id ?? null,
          fornecedor_nome: produto.fornecedor_nome ?? null,
        };
      });

      return { sugestoes };
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }
  });

  /**
   * Cria o pedido já como pendente de entrega (§4). Não existe rascunho: o
   * pedido só nasce quando a compra foi decidida, e a partir daí o que se
   * espera dele é a mercadoria chegar.
   */
  app.post("/pedidos", { preHandler: auth.exigirPermissao(PERMISSAO) }, async (requisicao, resposta) => {
    const { fornecedor_id, forma_pagamento, frete, desconto, itens } = requisicao.body ?? {};
    const token = requisicao.headers.authorization;

    if (!fornecedor_id) return invalido(resposta, "Informe fornecedor_id.");
    if (!Array.isArray(itens) || !itens.length) {
      return invalido(resposta, "Informe ao menos um item no pedido.");
    }

    const formaPagamento = forma_pagamento ?? FORMA_PAGAMENTO_COMPRA.BOLETO;
    if (!FORMA_PAGAMENTO_COMPRA_LISTA.includes(formaPagamento)) {
      return invalido(
        resposta,
        `forma_pagamento inválida. Use: ${FORMA_PAGAMENTO_COMPRA_LISTA.join(", ")}.`
      );
    }

    const valorFrete = Number(frete ?? 0);
    const valorDesconto = Number(desconto ?? 0);
    if (!Number.isFinite(valorFrete) || valorFrete < 0) {
      return invalido(resposta, "frete inválido.");
    }
    if (!Number.isFinite(valorDesconto) || valorDesconto < 0) {
      return invalido(resposta, "desconto inválido.");
    }

    for (const item of itens) {
      if (!item.produto_id) return invalido(resposta, "Todo item precisa de produto_id.");
      if (!Number.isInteger(Number(item.quantidade)) || Number(item.quantidade) <= 0) {
        return invalido(resposta, "Quantidade de cada item deve ser inteiro maior que zero.");
      }
      if (!Number.isFinite(Number(item.preco_unitario)) || Number(item.preco_unitario) < 0) {
        return invalido(resposta, "Preço unitário inválido.");
      }
    }

    try {
      // Nome do fornecedor e dos produtos vêm do estoque-service e ficam
      // gravados no pedido, que passa a não depender mais dele para ser lido.
      const { fornecedores } = await estoque.listarFornecedores(token);
      const fornecedor = fornecedores.find((registro) => registro.id === fornecedor_id);
      if (!fornecedor) return invalido(resposta, "Fornecedor não encontrado no cadastro.");

      const itensCompletos = [];
      for (const item of itens) {
        const { produto } = await estoque.buscarProduto(item.produto_id, token);
        itensCompletos.push({
          produto_id: produto.id,
          produto_nome: produto.nome,
          quantidade: Number(item.quantidade),
          preco_unitario: Number(item.preco_unitario),
        });
      }

      // O desconto não pode virar pedido negativo: mais fácil recusar aqui do
      // que descobrir um total zerado só quando a conta a pagar for criada.
      const totalItens = itensCompletos.reduce(
        (soma, item) => soma + item.quantidade * item.preco_unitario,
        0
      );
      if (valorDesconto > totalItens + valorFrete) {
        return invalido(resposta, "O desconto não pode ser maior que o valor do pedido.");
      }

      const pedidoId = await criarPedido({
        fornecedorId: fornecedor.id,
        fornecedorNome: fornecedor.nome,
        formaPagamento,
        frete: valorFrete,
        desconto: valorDesconto,
        usuarioId: requisicao.usuario.id,
        itens: itensCompletos,
      });

      return resposta.code(201).send({ pedido: await buscarPedidoCompleto(pedidoId) });
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }
  });

  /**
   * Ordem de compra em PDF — é o documento que vai para o fornecedor, com os
   * dados da farmácia, do fornecedor, os itens, as quantidades e os valores.
   * Fica disponível a qualquer momento: gerar de novo devolve o mesmo papel.
   */
  app.get("/pedidos/:id/ordem-de-compra.pdf", async (requisicao, resposta) => {
    const pedido = await buscarPedidoCompleto(requisicao.params.id);
    if (!pedido) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Pedido não encontrado." });
    }

    // Os dados do fornecedor moram no estoque-service; o pedido guarda só o
    // nome. Se a consulta falhar, o PDF ainda sai — com o que o pedido tem.
    let fornecedor = { nome: pedido.fornecedor_nome };
    try {
      const { fornecedores } = await estoque.listarFornecedores(requisicao.headers.authorization);
      fornecedor =
        fornecedores.find((registro) => registro.id === pedido.fornecedor_id) ?? fornecedor;
    } catch (erro) {
      requisicao.log.warn(
        { pedidoId: pedido.id, erro: erro.message },
        "ordem de compra gerada sem os dados completos do fornecedor"
      );
    }

    const arquivo = gerarOrdemDeCompraPdf({
      farmacia: env.FARMACIA,
      fornecedor,
      pedido: {
        numero: pedido.numero,
        emitido_em: formatarDataHora(pedido.criado_em),
        forma_pagamento: FORMA_PAGAMENTO_COMPRA_LABEL[pedido.forma_pagamento] ?? pedido.forma_pagamento,
        situacao: STATUS_PEDIDO_COMPRA_LABEL[pedido.status] ?? pedido.status,
        entregue_em: formatarData(pedido.entregue_em) || null,
        frete: pedido.frete,
        desconto: pedido.desconto,
        valor_total: pedido.valor_total,
      },
      itens: pedido.itens,
    });

    return resposta
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="ordem_de_compra_${pedido.numero}.pdf"`)
      .send(arquivo);
  });

  app.post("/pedidos/:id/cancelar", { preHandler: auth.exigirPermissao(PERMISSAO) }, async (requisicao, resposta) => {
    const motivo = requisicao.body?.motivo;
    if (!motivo || !String(motivo).trim()) {
      return invalido(resposta, "motivo do cancelamento é obrigatório.");
    }

    const cancelado = await marcarCancelado({
      pedidoId: requisicao.params.id,
      motivo: String(motivo).trim(),
    });
    if (!cancelado) return bloqueado(resposta, "Pedido já recebido ou já cancelado.");
    return { pedido: await buscarPedidoCompleto(requisicao.params.id) };
  });

  /**
   * Recebimento de mercadoria (§4): conferência obrigatória item a item antes
   * de dar entrada. Divergência entre pedido e recebido é registrada e sinalizada,
   * mas não bloqueia a entrada. Cada item recebido entra como lote no estoque e o
   * total recebido vira conta a pagar do fornecedor.
   */
  app.post("/pedidos/:id/receber", { preHandler: auth.exigirPermissao(PERMISSAO) }, async (requisicao, resposta) => {
    const { itens, entregue_em } = requisicao.body ?? {};
    const token = requisicao.headers.authorization;

    if (entregue_em && !/^\d{4}-\d{2}-\d{2}$/.test(entregue_em)) {
      return invalido(resposta, "entregue_em deve estar no formato AAAA-MM-DD.");
    }

    const pedido = await buscarPedido(requisicao.params.id);
    if (!pedido) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Pedido não encontrado." });
    }
    if (pedido.status === STATUS_PEDIDO_COMPRA.RECEBIDO) {
      return bloqueado(resposta, "Este pedido já foi recebido.");
    }
    if (pedido.status === STATUS_PEDIDO_COMPRA.CANCELADO) {
      return bloqueado(resposta, "Pedido cancelado.");
    }
    if (!Array.isArray(itens) || !itens.length) {
      return invalido(resposta, "Informe a conferência de cada item recebido.");
    }

    const itensPedido = await listarItens(pedido.id);
    const conferidos = [];

    for (const item of itens) {
      const original = itensPedido.find((registro) => registro.id === item.item_pedido_id);
      if (!original) return invalido(resposta, "Item de conferência não pertence a este pedido.");

      const recebida = Number(item.quantidade_recebida);
      if (!Number.isInteger(recebida) || recebida < 0) {
        return invalido(resposta, `Quantidade recebida inválida para ${original.produto_nome}.`);
      }
      if (recebida > 0 && (!item.numero_lote || !item.data_validade)) {
        return invalido(
          resposta,
          `Informe número de lote e validade para ${original.produto_nome}.`
        );
      }

      conferidos.push({
        item_pedido_id: original.id,
        produto_id: original.produto_id,
        produto_nome: original.produto_nome,
        quantidade_pedida: original.quantidade,
        quantidade_recebida: recebida,
        numero_lote: item.numero_lote ?? "",
        data_validade: item.data_validade ?? null,
        divergencia: recebida - original.quantidade,
        preco_unitario: Number(original.preco_unitario),
      });
    }

    if (!conferidos.some((item) => item.quantidade_recebida > 0)) {
      return invalido(resposta, "Nenhum item recebido — nada a dar entrada.");
    }

    // 1) Entrada no estoque, lote por lote.
    const entradas = [];
    try {
      for (const item of conferidos) {
        if (item.quantidade_recebida <= 0) continue;
        const resultado = await estoque.darEntradaLote(
          {
            produtoId: item.produto_id,
            numeroLote: item.numero_lote,
            quantidade: item.quantidade_recebida,
            dataValidade: item.data_validade,
            motivo: `recebimento do pedido ${pedido.numero}`,
          },
          token
        );
        entradas.push({ produto_nome: item.produto_nome, lote: resultado.lote });
      }
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // 2) Conta a pagar do que foi efetivamente recebido (§5). Frete e desconto
    // são do pedido inteiro, então entram proporcionalmente ao que chegou.
    const valorItensRecebidos = conferidos.reduce(
      (soma, item) => soma + item.quantidade_recebida * item.preco_unitario,
      0
    );
    const valorItensPedidos = conferidos.reduce(
      (soma, item) => soma + item.quantidade_pedida * item.preco_unitario,
      0
    );
    const proporcao = valorItensPedidos > 0 ? valorItensRecebidos / valorItensPedidos : 0;
    const valorRecebido = Number(
      Math.max(
        valorItensRecebidos + (Number(pedido.frete) - Number(pedido.desconto)) * proporcao,
        0
      ).toFixed(2)
    );

    let conta = null;
    if (valorRecebido > 0) {
      try {
        const resultado = await financeiro.criarContaPagar(
          {
            fornecedorId: pedido.fornecedor_id,
            descricao: `Pedido de compra ${pedido.numero} - ${pedido.fornecedor_nome}`,
            valor: valorRecebido,
            // Sem campo de vencimento na conferência: o financeiro usa o padrão
            // de 30 dias e ajusta na tela de contas, onde isso é assunto.
            vencimento: null,
          },
          token
        );
        conta = resultado.conta;
      } catch (erro) {
        // O estoque já entrou: não desfaz a mercadoria que chegou de verdade,
        // avisa para lançar a conta manualmente.
        requisicao.log.error(
          { pedidoId: pedido.id, erro: erro.message },
          "recebimento entrou no estoque mas a conta a pagar falhou"
        );
      }
    }

    const registro = await registrarRecebimento({
      pedidoId: pedido.id,
      usuarioId: requisicao.usuario.id,
      entregueEm: entregue_em ?? null,
      itens: conferidos,
    });

    return {
      pedido: await buscarPedidoCompleto(pedido.id),
      recebimento: registro,
      entradas,
      conta_pagar: conta,
      valor_recebido: valorRecebido,
      // §4: divergência alerta o gestor, não impede a entrada.
      alerta_divergencia: registro.tem_divergencia
        ? conferidos
            .filter((item) => item.divergencia !== 0)
            .map(
              (item) =>
                `${item.produto_nome}: pedido ${item.quantidade_pedida}, recebido ${item.quantidade_recebida}`
            )
        : null,
      aviso_conta: conta ? null : "Conta a pagar não foi criada — lance manualmente no financeiro.",
    };
  });

  /** Pedidos em planilha, com os mesmos filtros da tela. */
  app.get("/relatorios/pedidos", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) return invalido(resposta, intervalo.erro);

    const filtros = { ...filtrosDePedido(requisicao.query), ...intervalo };
    const recusa = filtrosValidos(resposta, filtros);
    if (recusa) return recusa;

    const linhas = await listarPedidosNoPeriodo(filtros);
    const soma = (filtro) =>
      linhas.filter(filtro).reduce((total, linha) => total + Number(linha.valor_total), 0);

    const csv = gerarCsv(
      [
        { titulo: "Numero", valor: (l) => l.numero },
        { titulo: "Data do pedido", valor: (l) => formatarDataHora(l.criado_em) },
        { titulo: "Fornecedor", valor: (l) => l.fornecedor_nome },
        {
          titulo: "Situacao",
          valor: (l) => STATUS_PEDIDO_COMPRA_LABEL[l.status] ?? l.status,
        },
        {
          titulo: "Forma de pagamento",
          valor: (l) => FORMA_PAGAMENTO_COMPRA_LABEL[l.forma_pagamento] ?? l.forma_pagamento,
        },
        { titulo: "Itens", valor: (l) => l.itens ?? "" },
        { titulo: "Unidades", valor: (l) => l.total_unidades ?? 0 },
        { titulo: "Entregue em", valor: (l) => formatarData(l.entregue_em) },
        { titulo: "Recebido em", valor: (l) => formatarDataHora(l.recebido_em) },
        { titulo: "Motivo do cancelamento", valor: (l) => l.motivo_cancelamento ?? "" },
        { titulo: "Frete (R$)", valor: (l) => Number(l.frete) },
        { titulo: "Desconto (R$)", valor: (l) => Number(l.desconto) },
        { titulo: "Valor do pedido (R$)", valor: (l) => Number(l.valor_total) },
      ],
      linhas,
      [
        { titulo: "Pedidos na lista", valor: linhas.length },
        { titulo: "Valor total pedido (R$)", valor: soma(() => true) },
        {
          titulo: "Valor recebido (R$)",
          valor: soma((l) => l.status === STATUS_PEDIDO_COMPRA.RECEBIDO),
        },
        {
          titulo: "Pendentes de entrega",
          valor: linhas.filter((l) => l.status === STATUS_PEDIDO_COMPRA.PENDENTE_ENTREGA).length,
        },
        { titulo: "Frete somado (R$)", valor: linhas.reduce((t, l) => t + Number(l.frete), 0) },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="${nomeArquivo("pedidos_compra", intervalo.de, intervalo.ate)}"`
      )
      .send(csv);
  });
}
