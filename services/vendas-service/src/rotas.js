import {
  ERROS,
  FORMA_PAGAMENTO_LISTA,
  STATUS_VENDA,
  exigeReceita,
} from "@arkos/shared-types";
import { criarAutenticacao, descontoMaximoPct } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { ErroServico, estoque, financeiro } from "./servicos.js";
import {
  atualizarLoteDoItem,
  buscarVenda,
  buscarVendaCompleta,
  criarVenda,
  definirDesconto,
  inserirItem,
  inserirPagamento,
  listarItens,
  listarVendasDoDia,
  marcarCancelada,
  marcarFinalizada,
  removerItem,
  resumoDoDia,
  salvarReceita,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

const CENTAVO = 0.005; // tolerância para comparar dinheiro em ponto flutuante

function invalido(resposta, mensagem) {
  return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem });
}

function naoEncontrado(resposta, mensagem) {
  return resposta.code(404).send({ erro: ERROS.NAO_ENCONTRADO, mensagem });
}

function bloqueado(resposta, codigo, mensagem) {
  return resposta.code(422).send({ erro: codigo, mensagem });
}

/** Erro vindo de outro serviço: preserva o código de negócio quando existir. */
function responderErroServico(resposta, erro) {
  const status = erro.status >= 400 && erro.status < 500 ? 422 : 502;
  return resposta.code(status).send({
    erro: erro.codigo ?? ERROS.FALHA_INTEGRACAO,
    mensagem: erro.message,
    servico: erro.servico,
  });
}

async function carregarVendaAberta(id, resposta) {
  const venda = await buscarVenda(id);
  if (!venda) {
    naoEncontrado(resposta, "Venda não encontrada.");
    return null;
  }
  if (venda.status !== STATUS_VENDA.ABERTA) {
    bloqueado(
      resposta,
      ERROS.VENDA_JA_FINALIZADA,
      `Esta venda está ${venda.status} e não aceita mais alterações.`
    );
    return null;
  }
  return venda;
}

/**
 * Rotas de docs/API-CONTRATOS.md — vendas-service.
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  app.addHook("preHandler", auth.autenticar);

  app.post("/", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await criarVenda(requisicao.usuario.id);
    return resposta.code(201).send({ venda: { ...venda, itens: [], pagamentos: [], receita: null } });
  });

  app.get("/", async () => ({ vendas: await listarVendasDoDia() }));

  app.get("/resumo/hoje", async () => await resumoDoDia());

  app.get("/:id", async (requisicao, resposta) => {
    const venda = await buscarVendaCompleta(requisicao.params.id);
    if (!venda) return naoEncontrado(resposta, "Venda não encontrada.");
    return { venda };
  });

  app.post("/:id/itens", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const { produto_id, quantidade } = requisicao.body ?? {};
    const quantidadeNumero = Number(quantidade);
    if (!produto_id) return invalido(resposta, "Informe produto_id.");
    if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0) {
      return invalido(resposta, "quantidade precisa ser um inteiro maior que zero.");
    }

    let dadosProduto;
    try {
      dadosProduto = await estoque.buscarProduto(produto_id, requisicao.headers.authorization);
    } catch (erro) {
      if (erro instanceof ErroServico && erro.status === 404) {
        return naoEncontrado(resposta, "Produto não encontrado no estoque.");
      }
      return responderErroServico(resposta, erro);
    }

    const produto = dadosProduto.produto;

    // Lotes vencidos não entram na conta: produto vencido é bloqueio duro (§2/§8).
    const lotesValidos = (produto.lotes ?? [])
      .filter((lote) => !lote.vencido && lote.quantidade > 0)
      .sort((a, b) => a.data_validade.localeCompare(b.data_validade));

    const disponivel = lotesValidos.reduce((soma, lote) => soma + lote.quantidade, 0);

    // §1 — produto sem estoque não pode ser vendido, exceto sob encomenda.
    const jaNoCarrinho = (await listarItens(venda.id))
      .filter((item) => item.produto_id === produto_id)
      .reduce((soma, item) => soma + item.quantidade, 0);

    if (!produto.venda_sob_encomenda && jaNoCarrinho + quantidadeNumero > disponivel) {
      return bloqueado(
        resposta,
        ERROS.ESTOQUE_INSUFICIENTE,
        `Estoque insuficiente para ${produto.nome}: disponível ${disponivel}, no carrinho ${jaNoCarrinho}.`
      );
    }

    const item = await inserirItem({
      vendaId: venda.id,
      produtoId: produto.id,
      loteId: lotesValidos[0]?.id ?? null,
      quantidade: quantidadeNumero,
      precoUnitario: produto.preco_venda,
      produtoNome: produto.nome,
      tipoControle: produto.tipo_controle,
    });

    return resposta.code(201).send({
      item,
      venda: await buscarVendaCompleta(venda.id),
      exige_receita: exigeReceita(produto.tipo_controle),
    });
  });

  app.delete("/:id/itens/:itemId", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const removido = await removerItem({ vendaId: venda.id, itemId: requisicao.params.itemId });
    if (!removido) return naoEncontrado(resposta, "Item não encontrado nesta venda.");
    return { venda: await buscarVendaCompleta(venda.id) };
  });

  /** Desconto respeita o limite percentual do perfil (§3). */
  app.post("/:id/desconto", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const desconto = Number(requisicao.body?.desconto);
    if (!Number.isFinite(desconto) || desconto < 0) {
      return invalido(resposta, "desconto inválido.");
    }

    const itens = await listarItens(venda.id);
    const bruto = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
    if (desconto > bruto) {
      return invalido(resposta, "O desconto não pode ser maior que o valor dos itens.");
    }

    const limitePct = descontoMaximoPct(requisicao.usuario);
    const pctPedido = bruto > 0 ? (desconto / bruto) * 100 : 0;
    if (pctPedido - limitePct > 0.01) {
      return bloqueado(
        resposta,
        ERROS.DESCONTO_ACIMA_DO_LIMITE,
        `Seu perfil pode aplicar até ${limitePct}% de desconto (pedido: ${pctPedido.toFixed(1)}%).`
      );
    }

    await definirDesconto({ vendaId: venda.id, desconto });
    return { venda: await buscarVendaCompleta(venda.id) };
  });

  /**
   * Registro da receita — obrigatório quando há item controlado (§3).
   * Farmacêutico, gerente e admin validam receita; o operador de caixa pode
   * registrar os dados, mas a trava de finalização é a mesma para todos.
   */
  app.post("/:id/receita", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const { medico_nome, medico_crm, paciente_nome, data_emissao } = requisicao.body ?? {};
    const faltando = [];
    if (!medico_nome) faltando.push("medico_nome");
    if (!medico_crm) faltando.push("medico_crm");
    if (!paciente_nome) faltando.push("paciente_nome");
    if (!data_emissao) faltando.push("data_emissao");
    if (faltando.length) {
      return invalido(resposta, `Dados da receita ausentes: ${faltando.join(", ")}.`);
    }

    const receita = await salvarReceita({
      vendaId: venda.id,
      medicoNome: medico_nome,
      medicoCrm: medico_crm,
      pacienteNome: paciente_nome,
      dataEmissao: data_emissao,
    });

    return resposta.code(201).send({ receita });
  });

  app.post("/:id/pagamentos", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const { forma_pagamento, valor } = requisicao.body ?? {};
    if (!FORMA_PAGAMENTO_LISTA.includes(forma_pagamento)) {
      return invalido(
        resposta,
        `forma_pagamento inválida. Use: ${FORMA_PAGAMENTO_LISTA.join(", ")}.`
      );
    }
    const valorNumero = Number(valor);
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      return invalido(resposta, "valor precisa ser maior que zero.");
    }

    const pagamento = await inserirPagamento({
      vendaId: venda.id,
      formaPagamento: forma_pagamento,
      valor: valorNumero,
    });

    return resposta.code(201).send({ pagamento, venda: await buscarVendaCompleta(venda.id) });
  });

  /**
   * Finalização — ordem do fluxo em docs/API-CONTRATOS.md:
   * valida receita de controlado (bloqueio duro), dá baixa FEFO no estoque,
   * lança no caixa e só então marca a venda como finalizada. Se a baixa passa
   * e o passo seguinte falha, o estoque é estornado para não ficar torto.
   */
  app.post("/:id/finalizar", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const token = requisicao.headers.authorization;
    const completa = await buscarVendaCompleta(venda.id);

    if (!completa.itens.length) {
      return invalido(resposta, "Não é possível finalizar uma venda sem itens.");
    }

    // Regra crítica §3: item controlado sem receita vinculada bloqueia a venda.
    const controlados = completa.itens.filter((item) => exigeReceita(item.tipo_controle));
    if (controlados.length && !completa.receita) {
      return bloqueado(
        resposta,
        ERROS.RECEITA_OBRIGATORIA,
        "Item controlado sem receita vinculada."
      );
    }

    const totalPago = completa.pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
    if (totalPago + CENTAVO < completa.valor_total) {
      return bloqueado(
        resposta,
        ERROS.PAGAMENTO_INSUFICIENTE,
        `Pagamentos somam ${totalPago.toFixed(2)} e a venda é ${completa.valor_total.toFixed(2)}.`
      );
    }

    // 1) Baixa no estoque, item por item, sempre por FEFO.
    const baixas = [];
    try {
      for (const item of completa.itens) {
        const resultado = await estoque.darSaidaFefo(
          {
            produtoId: item.produto_id,
            quantidade: item.quantidade,
            motivo: `venda ${venda.id}`,
          },
          token
        );
        baixas.push({ item, lotes: resultado.saida.lotes });
        const primeiroLote = resultado.saida.lotes[0]?.lote_id;
        if (primeiroLote && primeiroLote !== item.lote_id) {
          await atualizarLoteDoItem({ itemId: item.id, loteId: primeiroLote });
        }
      }
    } catch (erro) {
      await estornarBaixas(baixas, token, venda.id, requisicao.log);
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // 2) Lançamento automático no caixa (§5 — venda nunca é lançamento manual).
    try {
      await financeiro.lancarNoCaixa(
        {
          valor: completa.valor_total,
          origem: "venda",
          descricao: `Venda ${venda.id}`,
        },
        token
      );
    } catch (erro) {
      await estornarBaixas(baixas, token, venda.id, requisicao.log);
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // 3) Venda finalizada. A nota fiscal entra na Fase 5 (fiscal-service).
    const finalizada = await marcarFinalizada(venda.id);
    if (!finalizada) {
      return bloqueado(
        resposta,
        ERROS.VENDA_JA_FINALIZADA,
        "A venda mudou de status durante a finalização."
      );
    }

    return {
      venda: await buscarVendaCompleta(venda.id),
      baixa_estoque: baixas.map(({ item, lotes }) => ({
        item_id: item.id,
        produto_nome: item.produto_nome,
        lotes,
      })),
      troco: Number((totalPago - completa.valor_total).toFixed(2)),
    };
  });

  /** Cancelamento exige perfil superior e motivo (§3). */
  app.post(
    "/:id/cancelar",
    { preHandler: auth.exigirPermissao("cancelar_venda") },
    async (requisicao, resposta) => {
      const { motivo } = requisicao.body ?? {};
      if (!motivo || !String(motivo).trim()) {
        return invalido(resposta, "motivo do cancelamento é obrigatório.");
      }

      const venda = await buscarVenda(requisicao.params.id);
      if (!venda) return naoEncontrado(resposta, "Venda não encontrada.");

      if (venda.status === STATUS_VENDA.FINALIZADA) {
        // Estorno de venda finalizada (devolver estoque e caixa) ficou fora do
        // MVP — ver docs/PENDENCIAS.md.
        return bloqueado(
          resposta,
          ERROS.VENDA_JA_FINALIZADA,
          "Venda já finalizada: o estorno com devolução de estoque e caixa não está no MVP."
        );
      }
      if (venda.status === STATUS_VENDA.CANCELADA) {
        return bloqueado(resposta, ERROS.VENDA_JA_FINALIZADA, "Venda já está cancelada.");
      }

      const cancelada = await marcarCancelada({
        vendaId: venda.id,
        motivo: String(motivo).trim(),
      });
      return { venda: cancelada };
    }
  );
}

/**
 * Devolve ao estoque o que já havia sido baixado quando um passo posterior da
 * finalização falha — evita venda não finalizada com estoque a menos.
 */
async function estornarBaixas(baixas, token, vendaId, log) {
  for (const { item, lotes } of baixas) {
    for (const lote of lotes) {
      try {
        await estoque.devolverLote(
          {
            produtoId: item.produto_id,
            loteId: lote.lote_id,
            quantidade: lote.quantidade,
            motivo: `estorno da finalizacao da venda ${vendaId}`,
          },
          token
        );
      } catch (erro) {
        log?.error(
          { vendaId, loteId: lote.lote_id, erro: erro.message },
          "falha ao estornar baixa de estoque — conferir manualmente"
        );
      }
    }
  }
}
