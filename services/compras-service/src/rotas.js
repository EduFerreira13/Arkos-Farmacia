import { ERROS } from "@arkos/shared-types";
import { criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { ErroServico, estoque, financeiro } from "./servicos.js";
import { formatarDataHora, gerarCsv, nomeArquivo, periodo } from "./relatorios.js";
import {
  buscarPedido,
  buscarPedidoCompleto,
  criarPedido,
  listarItens,
  listarPedidos,
  listarPedidosNoPeriodo,
  marcarCancelado,
  marcarEnviado,
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

  app.get("/pedidos", async (requisicao) => {
    const { status, de, ate } = requisicao.query ?? {};
    return { pedidos: await listarPedidos({ status, de, ate }) };
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

  app.post("/pedidos", { preHandler: auth.exigirPermissao(PERMISSAO) }, async (requisicao, resposta) => {
    const { fornecedor_id, observacao, itens } = requisicao.body ?? {};
    const token = requisicao.headers.authorization;

    if (!fornecedor_id) return invalido(resposta, "Informe fornecedor_id.");
    if (!Array.isArray(itens) || !itens.length) {
      return invalido(resposta, "Informe ao menos um item no pedido.");
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

      const pedidoId = await criarPedido({
        fornecedorId: fornecedor.id,
        fornecedorNome: fornecedor.nome,
        observacao,
        usuarioId: requisicao.usuario.id,
        itens: itensCompletos,
      });

      return resposta.code(201).send({ pedido: await buscarPedidoCompleto(pedidoId) });
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }
  });

  app.post("/pedidos/:id/enviar", { preHandler: auth.exigirPermissao(PERMISSAO) }, async (requisicao, resposta) => {
    const enviado = await marcarEnviado(requisicao.params.id);
    if (!enviado) {
      return bloqueado(resposta, "Só um pedido em rascunho pode ser enviado ao fornecedor.");
    }
    return { pedido: await buscarPedidoCompleto(requisicao.params.id) };
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
    const { itens, observacao, vencimento_conta } = requisicao.body ?? {};
    const token = requisicao.headers.authorization;

    const pedido = await buscarPedido(requisicao.params.id);
    if (!pedido) {
      return resposta
        .code(404)
        .send({ erro: ERROS.NAO_ENCONTRADO, mensagem: "Pedido não encontrado." });
    }
    if (pedido.status === "recebido") return bloqueado(resposta, "Este pedido já foi recebido.");
    if (pedido.status === "cancelado") return bloqueado(resposta, "Pedido cancelado.");
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
            motivo: `recebimento do pedido ${pedido.id.slice(0, 8)}`,
          },
          token
        );
        entradas.push({ produto_nome: item.produto_nome, lote: resultado.lote });
      }
    } catch (erro) {
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // 2) Conta a pagar do que foi efetivamente recebido (§5).
    const valorRecebido = Number(
      conferidos
        .reduce((soma, item) => soma + item.quantidade_recebida * item.preco_unitario, 0)
        .toFixed(2)
    );

    let conta = null;
    if (valorRecebido > 0) {
      try {
        const resultado = await financeiro.criarContaPagar(
          {
            fornecedorId: pedido.fornecedor_id,
            descricao: `Pedido de compra ${pedido.id.slice(0, 8)} - ${pedido.fornecedor_nome}`,
            valor: valorRecebido,
            vencimento: vencimento_conta ?? null,
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
      observacao,
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

  /** Pedidos do período em planilha. */
  app.get("/relatorios/pedidos", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) return invalido(resposta, intervalo.erro);

    const linhas = await listarPedidosNoPeriodo(intervalo);
    const soma = (filtro) =>
      linhas.filter(filtro).reduce((total, linha) => total + Number(linha.valor_total), 0);

    const csv = gerarCsv(
      [
        { titulo: "Data do pedido", valor: (l) => formatarDataHora(l.criado_em) },
        { titulo: "Fornecedor", valor: (l) => l.fornecedor_nome },
        { titulo: "Status", valor: (l) => l.status },
        { titulo: "Itens", valor: (l) => l.itens ?? "" },
        { titulo: "Enviado em", valor: (l) => formatarDataHora(l.enviado_em) },
        { titulo: "Recebido em", valor: (l) => formatarDataHora(l.recebido_em) },
        { titulo: "Teve divergencia", valor: (l) => (l.teve_divergencia ? "Sim" : "Nao") },
        { titulo: "Observacao", valor: (l) => l.observacao ?? "" },
        { titulo: "Valor do pedido (R$)", valor: (l) => Number(l.valor_total) },
      ],
      linhas,
      [
        { titulo: "Pedidos no periodo", valor: linhas.length },
        { titulo: "Valor total pedido (R$)", valor: soma(() => true) },
        { titulo: "Valor recebido (R$)", valor: soma((l) => l.status === "recebido") },
        {
          titulo: "Pedidos com divergencia",
          valor: linhas.filter((l) => l.teve_divergencia).length,
        },
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
