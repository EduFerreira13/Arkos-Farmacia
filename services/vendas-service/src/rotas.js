import {
  ERROS,
  FORMA_PAGAMENTO_LISTA,
  STATUS_VENDA,
  exigeReceita,
} from "@arkos/shared-types";
import { criarAutenticacao, descontoMaximoPct } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { ErroServico, estoque, financeiro, fiscal } from "./servicos.js";
import {
  formatarDataHora,
  gerarCsv,
  nomeArquivo,
  periodo,
} from "./relatorios.js";
import {
  analisarClientes,
  atualizarResultadoContato,
  historicoDoCliente,
  listarContatos,
  registrarContato,
  resumoCrm,
} from "./crm.js";
import {
  analisarVendas,
  atualizarCliente,
  inserirCliente,
  listarClientes,
  listarReceitas,
  listarVendas,
  removerPagamento,
  vincularCliente,
} from "./consultas.js";
import {
  atualizarLoteDoItem,
  buscarVenda,
  buscarVendaCompleta,
  criarVenda,
  definirDesconto,
  inserirItem,
  inserirPagamento,
  listarItens,
  listarItensNoPeriodo,
  listarVendasDoDia,
  listarVendasNoPeriodo,
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

  /**
   * Histórico de vendas. Sem filtro de data, responde o movimento de hoje —
   * é o que a tela "Vendas do dia" usa. Aceita `de`, `ate`, `status`,
   * `controlado=sim|nao`, `busca` (produto, paciente ou cliente) e `limite`.
   */
  app.get("/", async (requisicao, resposta) => {
    const { de, ate, status, controlado, busca, limite } = requisicao.query ?? {};

    if (status && !Object.values(STATUS_VENDA).includes(status)) {
      return invalido(resposta, `status inválido. Use: ${Object.values(STATUS_VENDA).join(", ")}.`);
    }

    const vendas = await listarVendas({ de, ate, status, controlado, busca, limite });

    // Totais do recorte, para a tela não precisar somar de novo.
    const finalizadas = vendas.filter((venda) => venda.status === STATUS_VENDA.FINALIZADA);
    const somaFinalizadas = finalizadas.reduce((total, venda) => total + Number(venda.valor_total), 0);

    return {
      vendas,
      totais: {
        cupons: vendas.length,
        cupons_finalizados: finalizadas.length,
        valor_finalizado: Number(somaFinalizadas.toFixed(2)),
        ticket_medio: finalizadas.length
          ? Number((somaFinalizadas / finalizadas.length).toFixed(2))
          : 0,
        descontos: Number(
          finalizadas.reduce((total, venda) => total + Number(venda.desconto), 0).toFixed(2)
        ),
      },
    };
  });

  app.get("/resumo/hoje", async () => await resumoDoDia());

  /**
   * Relatório de vendas do período em planilha (CSV que o Excel abre direto).
   * `?de=AAAA-MM-DD&ate=AAAA-MM-DD`; sem parâmetros, traz o dia de hoje.
   * `?agrupar=produto` troca a lista de cupons pelo total por produto.
   */
  /** Números para os relatórios e o BI: por produto, por dia e por forma. */
  app.get("/analise", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) return invalido(resposta, intervalo.erro);
    return { periodo: intervalo, ...(await analisarVendas(intervalo)) };
  });

  /** Receitas retidas — tela fiscal/regulatória. */
  app.get("/receitas", async (requisicao) => {
    const { de, ate, busca } = requisicao.query ?? {};
    return { receitas: await listarReceitas({ de, ate, busca }) };
  });

  /**
   * Fila de relacionamento: clientes ordenados por urgência de contato, com a
   * situação de recompra, o produto de uso contínuo e a oferta sugerida a partir
   * do histórico. Cliente que pediu para não ser incomodado sai da lista.
   */
  app.get("/crm/clientes", async (requisicao, resposta) => {
    const { situacao, busca, incluir_sem_compra } = requisicao.query ?? {};

    const clientes = await analisarClientes({
      situacao,
      busca,
      incluirSemCompra: incluir_sem_compra !== "nao",
    });

    if (situacao && !clientes.length) {
      // Situação inválida devolve lista vazia, não erro: a tela filtra livremente.
      requisicao.log.debug({ situacao }, "nenhum cliente na situacao pedida");
    }

    return {
      clientes: clientes.filter((cliente) => cliente.aceita_contato),
      sem_contato: clientes.filter((cliente) => !cliente.aceita_contato).length,
    };
  });

  app.get("/crm/resumo", async () => await resumoCrm());

  app.get("/crm/clientes/:id", async (requisicao, resposta) => {
    const [analise] = await analisarClientes({ incluirSemCompra: true }).then((lista) =>
      lista.filter((cliente) => cliente.id === requisicao.params.id)
    );
    if (!analise) return naoEncontrado(resposta, "Cliente não encontrado.");

    return { cliente: analise, ...(await historicoDoCliente(requisicao.params.id)) };
  });

  app.get("/crm/contatos", async (requisicao) => {
    const { de, ate, resultado } = requisicao.query ?? {};
    return { contatos: await listarContatos({ de, ate, resultado }) };
  });

  app.post("/crm/contatos", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const { cliente_id, canal, motivo, oferta, observacao, resultado } = requisicao.body ?? {};

    const canais = ["telefone", "whatsapp", "email", "presencial"];
    if (!cliente_id) return invalido(resposta, "Informe cliente_id.");
    if (!canais.includes(canal)) {
      return invalido(resposta, `canal inválido. Use: ${canais.join(", ")}.`);
    }
    if (!motivo || !String(motivo).trim()) {
      return invalido(resposta, "motivo do contato é obrigatório.");
    }

    try {
      const contato = await registrarContato({
        clienteId: cliente_id,
        usuarioId: requisicao.usuario.id,
        canal,
        motivo: String(motivo).trim().slice(0, 80),
        oferta,
        observacao,
        resultado,
      });
      return resposta.code(201).send({ contato });
    } catch (erro) {
      if (erro.code === "23503") return invalido(resposta, "Cliente não encontrado.");
      if (erro.code === "22P02") return invalido(resposta, "resultado inválido para o contato.");
      throw erro;
    }
  });

  app.patch("/crm/contatos/:id", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const { resultado, observacao } = requisicao.body ?? {};
    const resultados = ["aguardando", "interessado", "sem_interesse", "nao_atendeu", "convertido"];
    if (!resultados.includes(resultado)) {
      return invalido(resposta, `resultado inválido. Use: ${resultados.join(", ")}.`);
    }

    const contato = await atualizarResultadoContato({
      contatoId: requisicao.params.id,
      resultado,
      observacao,
    });
    if (!contato) return naoEncontrado(resposta, "Contato não encontrado.");
    return { contato };
  });

  app.get("/clientes", async (requisicao) => ({
    clientes: await listarClientes({ busca: requisicao.query?.busca }),
  }));

  app.post("/clientes", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const corpo = requisicao.body ?? {};
    if (!corpo.nome || !String(corpo.nome).trim()) {
      return invalido(resposta, "Informe o nome do cliente.");
    }
    try {
      return resposta.code(201).send({ cliente: await inserirCliente(corpo) });
    } catch (erro) {
      if (erro.code === "23505") {
        return resposta
          .code(409)
          .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Já existe cliente com este CPF." });
      }
      throw erro;
    }
  });

  app.patch("/clientes/:id", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    try {
      const cliente = await atualizarCliente(requisicao.params.id, requisicao.body ?? {});
      if (!cliente) return invalido(resposta, "Informe algum campo para atualizar.");
      return { cliente };
    } catch (erro) {
      if (erro.code === "23505") {
        return resposta
          .code(409)
          .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Já existe cliente com este CPF." });
      }
      throw erro;
    }
  });

  app.get("/relatorio", async (requisicao, resposta) => {
    const intervalo = periodo(requisicao.query);
    if (intervalo.erro) {
      return resposta.code(400).send({ erro: ERROS.DADOS_INVALIDOS, mensagem: intervalo.erro });
    }

    const porProduto = requisicao.query?.agrupar === "produto";

    if (porProduto) {
      const itens = await listarItensNoPeriodo(intervalo);
      const csv = gerarCsv(
        [
          { titulo: "Produto", valor: (l) => l.produto_nome },
          { titulo: "Tipo de controle", valor: (l) => l.tipo_controle },
          { titulo: "Unidades vendidas", valor: (l) => l.unidades },
          { titulo: "Cupons", valor: (l) => l.vendas },
          { titulo: "Receita (R$)", valor: (l) => Number(l.receita) },
        ],
        itens,
        [
          { titulo: "Unidades no periodo", valor: itens.reduce((t, l) => t + l.unidades, 0) },
          {
            titulo: "Receita no periodo (R$)",
            valor: itens.reduce((t, l) => t + Number(l.receita), 0),
          },
        ]
      );
      return resposta
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="${nomeArquivo("vendas_por_produto", intervalo.de, intervalo.ate)}"`
        )
        .send(csv);
    }

    const vendas = await listarVendasNoPeriodo(intervalo);
    const finalizadas = vendas.filter((venda) => venda.status === STATUS_VENDA.FINALIZADA);

    const csv = gerarCsv(
      [
        { titulo: "Data e hora", valor: (v) => formatarDataHora(v.criado_em) },
        { titulo: "Venda", valor: (v) => v.id.slice(0, 8) },
        { titulo: "Status", valor: (v) => v.status },
        { titulo: "Itens", valor: (v) => v.total_itens },
        { titulo: "Unidades", valor: (v) => v.total_unidades ?? 0 },
        { titulo: "Produtos", valor: (v) => v.produtos ?? "" },
        { titulo: "Tem controlado", valor: (v) => (v.tem_controlado ? "Sim" : "Nao") },
        { titulo: "Paciente da receita", valor: (v) => v.paciente_nome ?? "" },
        { titulo: "Medico", valor: (v) => v.medico_nome ?? "" },
        {
          titulo: "Registro no Conselho Regional de Medicina",
          valor: (v) => v.medico_crm ?? "",
        },
        { titulo: "Formas de pagamento", valor: (v) => v.formas_pagamento ?? "" },
        { titulo: "Desconto (R$)", valor: (v) => Number(v.desconto) },
        { titulo: "Total (R$)", valor: (v) => Number(v.valor_total) },
        { titulo: "Motivo do cancelamento", valor: (v) => v.motivo_cancelamento ?? "" },
      ],
      vendas,
      [
        { titulo: "Cupons no periodo", valor: vendas.length },
        { titulo: "Cupons finalizados", valor: finalizadas.length },
        {
          titulo: "Total finalizado (R$)",
          valor: finalizadas.reduce((t, v) => t + Number(v.valor_total), 0),
        },
        {
          titulo: "Descontos concedidos (R$)",
          valor: finalizadas.reduce((t, v) => t + Number(v.desconto), 0),
        },
        {
          titulo: "Ticket medio (R$)",
          valor: finalizadas.length
            ? finalizadas.reduce((t, v) => t + Number(v.valor_total), 0) / finalizadas.length
            : 0,
        },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="${nomeArquivo("vendas", intervalo.de, intervalo.ate)}"`
      )
      .send(csv);
  });

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

    const itens = await listarItens(venda.id);
    const bruto = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);

    // Aceita desconto em reais (`desconto`) ou em percentual (`desconto_pct`) —
    // o caixa às vezes combina "10%", às vezes "5 reais".
    const corpo = requisicao.body ?? {};
    let desconto;

    if (corpo.desconto_pct !== undefined) {
      const percentual = Number(corpo.desconto_pct);
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        return invalido(resposta, "desconto_pct deve estar entre 0 e 100.");
      }
      desconto = Number(((bruto * percentual) / 100).toFixed(2));
    } else {
      desconto = Number(corpo.desconto);
      if (!Number.isFinite(desconto) || desconto < 0) {
        return invalido(resposta, "desconto inválido.");
      }
    }

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

  /** Remove uma forma de pagamento antes de finalizar (cliente trocou de ideia). */
  app.delete(
    "/:id/pagamentos/:pagamentoId",
    { preHandler: auth.exigirPermissao("vender") },
    async (requisicao, resposta) => {
      const venda = await carregarVendaAberta(requisicao.params.id, resposta);
      if (!venda) return resposta;

      const removido = await removerPagamento({
        vendaId: venda.id,
        pagamentoId: requisicao.params.pagamentoId,
      });
      if (!removido) return naoEncontrado(resposta, "Pagamento não encontrado nesta venda.");

      return { venda: await buscarVendaCompleta(venda.id) };
    }
  );

  /** Vincula (ou desvincula, com cliente_id nulo) o cliente da venda. */
  app.post("/:id/cliente", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const clienteId = requisicao.body?.cliente_id ?? null;
    try {
      await vincularCliente({ vendaId: venda.id, clienteId });
    } catch (erro) {
      if (erro.code === "23503") return invalido(resposta, "Cliente não encontrado.");
      throw erro;
    }
    return { venda: await buscarVendaCompleta(venda.id) };
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
          descricao: `Venda ${venda.id.slice(0, 8)}`,
          vendaId: venda.id,
        },
        token
      );
    } catch (erro) {
      await estornarBaixas(baixas, token, venda.id, requisicao.log);
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // 3) Nota fiscal (mockada no MVP) e registro dos controlados no SNGPC.
    let nota = null;
    try {
      const emissao = await fiscal.emitirNota({ vendaId: venda.id }, token);
      nota = emissao.nota;

      for (const item of controlados) {
        await fiscal.registrarControlado(
          { vendaId: venda.id, produtoId: item.produto_id, receitaId: completa.receita.id },
          token
        );
      }
    } catch (erro) {
      await estornarBaixas(baixas, token, venda.id, requisicao.log);
      await estornarCaixa(completa.valor_total, venda.id, token, requisicao.log);
      if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
      throw erro;
    }

    // 4) Só agora a venda vira finalizada.
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
      nota_fiscal: nota,
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

/** Estorna o lançamento de caixa quando a finalização falha depois dele. */
async function estornarCaixa(valor, vendaId, token, log) {
  try {
    await financeiro.estornarNoCaixa(
      { valor, descricao: `Estorno da venda ${vendaId.slice(0, 8)}`, vendaId },
      token
    );
  } catch (erro) {
    log?.error(
      { vendaId, erro: erro.message },
      "falha ao estornar lancamento de caixa — conferir manualmente"
    );
  }
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
