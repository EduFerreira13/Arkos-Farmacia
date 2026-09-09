import {
  CATEGORIA_CANCELAMENTO_LISTA,
  ERROS,
  FORMA_PAGAMENTO_LISTA,
  STATUS_VENDA,
  exigeReceita,
} from "@arkos/shared-types";
import { criarAutenticacao, descontoMaximoPct } from "@arkos/auth-middleware";
import { env } from "../../env.js";
import { ErroServico, estoque, financeiro, fiscal } from "./servicos.js";
import { imprimirRecibo } from "./lib/impressora.js";
import {
  formatarData,
  formatarDataHora,
  gerarCsv,
  hojeNoFuso,
  nomeArquivo,
  periodo,
} from "./relatorios.js";
import { gerarXlsx } from "./planilha.js";
import {
  analisarClientes,
  atualizarResultadoContato,
  historicoDoCliente,
  ligarVendaAoContato,
  listarContatos,
  listarRetornosPendentes,
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
  alterarQuantidadeDoItem,
  atualizarLoteDoItem,
  buscarVenda,
  buscarVendaCompleta,
  criarVenda,
  definirDesconto,
  inserirItem,
  inserirPagamento,
  listarItens,
  listarItensNoPeriodo,
  listarVendasNoPeriodo,
  definirDescontoDoItem,
  marcarCancelada,
  marcarFinalizada,
  removerItem,
  removerReceita,
  resumoDoDia,
  salvarReceita,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

const CENTAVO = 0.005; // tolerância para comparar dinheiro em ponto flutuante

const DATA_INVALIDA = Symbol("data de retorno invalida");
const DESCONTO_INVALIDO = Symbol("desconto de oferta invalido");

/**
 * Data combinada para o próximo contato. Opcional — nem todo contato pede
 * retorno. Data no passado é recusada: retorno já nasceria atrasado, o que só
 * suja a lista de quem realmente ficou para trás.
 */
function validarDataDeRetorno(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return DATA_INVALIDA;
  if (String(valor) < hojeNoFuso()) return DATA_INVALIDA;
  return String(valor);
}

/** Desconto prometido no contato, para o balcão aplicar depois. */
function validarDescontoDaOferta(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const percentual = Number(valor);
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) return DESCONTO_INVALIDO;
  return percentual > 0 ? Number(percentual.toFixed(2)) : null;
}

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
   * sem período informado, responde o movimento de hoje. Aceita `de`, `ate`, `status`,
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
        vendas: vendas.length,
        vendas_finalizados: finalizadas.length,
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
   * `?agrupar=produto` troca a lista de vendas pelo total por produto.
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
    const { situacao, busca, incluir_sem_compra, incluir_silencio } = requisicao.query ?? {};

    const mostrarSilencio = incluir_silencio === "sim";

    const clientes = await analisarClientes({
      situacao,
      busca,
      incluirSemCompra: incluir_sem_compra !== "nao",
      incluirEmSilencio: mostrarSilencio,
    });

    if (situacao && !clientes.length) {
      // Situação inválida devolve lista vazia, não erro: a tela filtra livremente.
      requisicao.log.debug({ situacao }, "nenhum cliente na situacao pedida");
    }

    // Quantos ficaram de fora por contato recente. A tela avisa em vez de
    // simplesmente sumir com eles — lista que encolhe sem explicação assusta.
    const todos = mostrarSilencio
      ? clientes
      : await analisarClientes({
          situacao,
          busca,
          incluirSemCompra: incluir_sem_compra !== "nao",
          incluirEmSilencio: true,
        });

    return {
      clientes: clientes.filter((cliente) => cliente.aceita_contato),
      sem_contato: clientes.filter((cliente) => !cliente.aceita_contato).length,
      em_silencio: todos.filter((cliente) => cliente.em_silencio && cliente.aceita_contato).length,
      mostrando_em_silencio: mostrarSilencio,
    };
  });

  /**
   * Retornos combinados e ainda não atendidos. É a primeira coisa a olhar no
   * dia: prometer "te ligo quinta" e não ligar é pior do que não ter ligado.
   */
  app.get("/crm/retornos", async () => ({ retornos: await listarRetornosPendentes() }));

  app.get("/crm/resumo", async () => await resumoCrm());

  /**
   * Planilha do relacionamento: a fila de contato como está na tela, ou os
   * contatos já registrados. Serve para levar a lista de ligações para fora do
   * sistema (imprimir, dividir entre os atendentes).
   */
  app.get("/crm/relatorio", async (requisicao, resposta) => {
    const contatos = requisicao.query?.tipo === "contatos";

    // A planilha sai com os mesmos filtros que estao na tela: o relatorio precisa
    // bater com o que a pessoa esta vendo, senao nao serve de conferencia.
    const emXlsx = requisicao.query?.formato === "xlsx";

    if (contatos) {
      const registros = await listarContatos({
        de: requisicao.query?.de,
        ate: requisicao.query?.ate,
        resultado: requisicao.query?.resultado,
        canal: requisicao.query?.canal,
        busca: requisicao.query?.busca,
      });

      const colunasContatos = [
        { titulo: "Data e hora", valor: (l) => formatarDataHora(l.criado_em) },
        { titulo: "Cliente", valor: (l) => l.cliente_nome },
        { titulo: "Telefone", valor: (l) => l.telefone ?? "" },
        { titulo: "Canal", valor: (l) => l.canal },
        { titulo: "Motivo", valor: (l) => l.motivo },
        { titulo: "Oferta", valor: (l) => l.oferta ?? "" },
        { titulo: "Resultado", valor: (l) => l.resultado },
        { titulo: "Observacao", valor: (l) => l.observacao ?? "" },
      ];

      const comResultado = (valor) => registros.filter((l) => l.resultado === valor).length;
      const resumoContatos = [
        { indicador: "Contatos no periodo", valor: registros.length },
        { indicador: "Viraram compra", valor: comResultado("convertido") },
        { indicador: "Interessados", valor: comResultado("interessado") },
        { indicador: "Aguardando resposta", valor: comResultado("aguardando") },
        { indicador: "Nao atenderam", valor: comResultado("nao_atendeu") },
        { indicador: "Sem interesse", valor: comResultado("sem_interesse") },
        {
          indicador: "Conversao (%)",
          valor: registros.length
            ? Number(((comResultado("convertido") / registros.length) * 100).toFixed(1))
            : 0,
        },
      ];

      if (emXlsx) {
        const arquivo = gerarXlsx([
          { nome: "Contatos", colunas: colunasContatos, linhas: registros },
          {
            nome: "Resumo",
            colunas: [
              { titulo: "Indicador", valor: (l) => l.indicador },
              { titulo: "Valor", valor: (l) => l.valor },
            ],
            linhas: resumoContatos,
          },
        ]);

        return resposta
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          )
          .header("Content-Disposition", `attachment; filename="contatos_${hojeNoFuso()}.xlsx"`)
          .send(arquivo);
      }

      const csv = gerarCsv(
        colunasContatos,
        registros,
        resumoContatos.map((linha) => ({ titulo: linha.indicador, valor: linha.valor }))
      );

      return resposta
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="contatos_${hojeNoFuso()}.csv"`)
        .send(csv);
    }

    const clientes = (await analisarClientes({ situacao: requisicao.query?.situacao })).filter(
      (cliente) => cliente.aceita_contato
    );

    const colunasFila = [
        { titulo: "Cliente", valor: (l) => l.nome },
        { titulo: "Telefone", valor: (l) => l.telefone ?? "" },
        { titulo: "Convenio", valor: (l) => l.convenio ?? "Particular" },
        { titulo: "Situacao", valor: (l) => l.situacao },
        { titulo: "Motivo do contato", valor: (l) => l.motivo },
        { titulo: "Oferta sugerida", valor: (l) => l.oferta },
        { titulo: "Compras", valor: (l) => l.total_compras },
        { titulo: "Ritmo (dias)", valor: (l) => l.intervalo_medio_dias ?? "" },
        { titulo: "Parado ha (dias)", valor: (l) => l.dias_sem_comprar ?? "" },
        { titulo: "Atraso na recompra (dias)", valor: (l) => l.atraso_recompra_dias },
        { titulo: "Produto de uso continuo", valor: (l) => l.uso_continuo?.produto_nome ?? "" },
        { titulo: "Ja gastou (R$)", valor: (l) => l.valor_total },
        { titulo: "Ticket medio (R$)", valor: (l) => l.ticket_medio },
        { titulo: "Ultimo contato", valor: (l) => formatarDataHora(l.ultimo_contato_em) },
    ];

    const naSituacao = (valor) => clientes.filter((l) => l.situacao === valor).length;
    const resumoFila = [
      { indicador: "Clientes na lista", valor: clientes.length },
      { indicador: "Com recompra atrasada", valor: naSituacao("recompra_atrasada") },
      { indicador: "Em risco", valor: naSituacao("em_risco") },
      { indicador: "Inativos", valor: naSituacao("inativo") },
      { indicador: "Em dia", valor: naSituacao("ativo") },
      { indicador: "Novos", valor: naSituacao("novo") },
      {
        indicador: "Ja gastaram no total (R$)",
        valor: Number(
          clientes.reduce((total, l) => total + Number(l.valor_total ?? 0), 0).toFixed(2)
        ),
      },
    ];

    if (emXlsx) {
      const arquivo = gerarXlsx([
        { nome: "Fila de contato", colunas: colunasFila, linhas: clientes },
        {
          nome: "Resumo",
          colunas: [
            { titulo: "Indicador", valor: (l) => l.indicador },
            { titulo: "Valor", valor: (l) => l.valor },
          ],
          linhas: resumoFila,
        },
      ]);

      return resposta
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", `attachment; filename="relacionamento_${hojeNoFuso()}.xlsx"`)
        .send(arquivo);
    }

    const csv = gerarCsv(
      colunasFila,
      clientes,
      resumoFila.map((linha) => ({ titulo: linha.indicador, valor: linha.valor }))
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="relacionamento_${hojeNoFuso()}.csv"`)
      .send(csv);
  });

  app.get("/crm/clientes/:id", async (requisicao, resposta) => {
    // A ficha ignora a janela de silêncio de propósito: silêncio é regra da
    // fila ("não ligue de novo hoje"), não pode esconder um cliente que alguém
    // foi abrir na mão — nem no balcão, quando ele está ali na frente.
    const [analise] = await analisarClientes({
      incluirSemCompra: true,
      incluirEmSilencio: true,
    }).then((lista) => lista.filter((cliente) => cliente.id === requisicao.params.id));
    if (!analise) return naoEncontrado(resposta, "Cliente não encontrado.");

    return { cliente: analise, ...(await historicoDoCliente(requisicao.params.id)) };
  });

  app.get("/crm/contatos", async (requisicao) => {
    const { de, ate, resultado, canal, busca } = requisicao.query ?? {};
    return { contatos: await listarContatos({ de, ate, resultado, canal, busca }) };
  });

  app.post("/crm/contatos", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const { cliente_id, canal, motivo, oferta, observacao, resultado, proximo_contato_em, desconto_pct } =
      requisicao.body ?? {};

    const canais = ["telefone", "whatsapp", "email", "presencial"];
    if (!cliente_id) return invalido(resposta, "Informe cliente_id.");
    if (!canais.includes(canal)) {
      return invalido(resposta, `canal inválido. Use: ${canais.join(", ")}.`);
    }
    if (!motivo || !String(motivo).trim()) {
      return invalido(resposta, "motivo do contato é obrigatório.");
    }

    const retorno = validarDataDeRetorno(proximo_contato_em);
    if (retorno === DATA_INVALIDA) {
      return invalido(resposta, "proximo_contato_em precisa ser uma data de hoje em diante.");
    }

    const descontoDaOferta = validarDescontoDaOferta(desconto_pct);
    if (descontoDaOferta === DESCONTO_INVALIDO) {
      return invalido(resposta, "desconto_pct da oferta precisa estar entre 0 e 100.");
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
        proximoContatoEm: retorno,
        descontoPct: descontoDaOferta,
      });
      return resposta.code(201).send({ contato });
    } catch (erro) {
      if (erro.code === "23503") return invalido(resposta, "Cliente não encontrado.");
      if (erro.code === "22P02") return invalido(resposta, "resultado inválido para o contato.");
      throw erro;
    }
  });

  app.patch("/crm/contatos/:id", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const { resultado, observacao, proximo_contato_em } = requisicao.body ?? {};
    const resultados = ["aguardando", "interessado", "sem_interesse", "nao_atendeu", "convertido"];
    if (resultado !== undefined && !resultados.includes(resultado)) {
      return invalido(resposta, `resultado inválido. Use: ${resultados.join(", ")}.`);
    }

    const retorno = validarDataDeRetorno(proximo_contato_em);
    if (retorno === DATA_INVALIDA) {
      return invalido(resposta, "proximo_contato_em precisa ser uma data de hoje em diante.");
    }

    const contato = await atualizarResultadoContato({
      contatoId: requisicao.params.id,
      resultado,
      observacao,
      proximoContatoEm: retorno,
    });
    if (!contato) return naoEncontrado(resposta, "Contato não encontrado.");
    return { contato };
  });

  /** Filtros da tela de clientes — os mesmos que o relatório aceita. */
  function filtrosDeCliente(query = {}) {
    return {
      busca: query.busca,
      convenio: query.convenio,
      min_compras: query.min_compras,
      min_valor: query.min_valor,
      ordenar: query.ordenar,
    };
  }

  app.get("/clientes", async (requisicao) => ({
    clientes: await listarClientes(filtrosDeCliente(requisicao.query)),
  }));

  /**
   * §5 — nome e telefone são obrigatórios: o telefone é o que permite o
   * retorno do relacionamento. CPF é opcional (minimização de dados, LGPD) —
   * quem precisa dele na nota informa na finalização da venda, sem exigir
   * cadastro completo (ver `cpf_nota` em `/:id/finalizar`).
   */
  const OBRIGATORIOS_CLIENTE = [
    ["nome", "Informe o nome do cliente."],
    ["telefone", "Informe o telefone do cliente."],
  ];

  app.post("/clientes", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const corpo = requisicao.body ?? {};
    for (const [campo, mensagem] of OBRIGATORIOS_CLIENTE) {
      if (!corpo[campo] || !String(corpo[campo]).trim()) return invalido(resposta, mensagem);
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
    const corpo = requisicao.body ?? {};
    // Na edição, os obrigatórios só valem se vierem no corpo — quem manda só
    // `observacao` não precisa reenviar CPF e telefone.
    for (const [campo, mensagem] of OBRIGATORIOS_CLIENTE) {
      if (corpo[campo] !== undefined && !String(corpo[campo]).trim()) {
        return invalido(resposta, mensagem);
      }
    }

    try {
      const cliente = await atualizarCliente(requisicao.params.id, corpo);
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

  /**
   * Clientes em planilha, com os filtros que estão valendo na tela. Traz dado
   * pessoal (CPF, telefone, endereço) — quem exporta passa a ser responsável
   * pelo arquivo, então a finalidade tem de justificar a extração (LGPD).
   */
  app.get("/relatorios/clientes", async (requisicao, resposta) => {
    const linhas = await listarClientes(filtrosDeCliente(requisicao.query));

    const csv = gerarCsv(
      [
        { titulo: "Cliente", valor: (l) => l.nome },
        { titulo: "CPF", valor: (l) => l.cpf ?? "" },
        { titulo: "Telefone", valor: (l) => l.telefone ?? "" },
        { titulo: "Email", valor: (l) => l.email ?? "" },
        { titulo: "Convenio", valor: (l) => l.convenio ?? "Particular" },
        { titulo: "Data de nascimento", valor: (l) => formatarData(l.data_nascimento) },
        { titulo: "Endereco", valor: (l) => l.endereco ?? "" },
        { titulo: "Aceita contato", valor: (l) => (l.aceita_contato ? "Sim" : "Nao") },
        { titulo: "Compras", valor: (l) => l.total_compras },
        { titulo: "Total gasto (R$)", valor: (l) => Number(l.total_gasto) },
        {
          titulo: "Ticket medio (R$)",
          valor: (l) => (l.total_compras ? Number(l.total_gasto) / l.total_compras : 0),
        },
        { titulo: "Ultima compra", valor: (l) => formatarDataHora(l.ultima_compra) },
        { titulo: "Cadastrado em", valor: (l) => formatarDataHora(l.criado_em) },
        { titulo: "Observacao", valor: (l) => l.observacao ?? "" },
      ],
      linhas,
      [
        { titulo: "Clientes na lista", valor: linhas.length },
        { titulo: "Com ao menos uma compra", valor: linhas.filter((l) => l.total_compras).length },
        {
          titulo: "Compras somadas",
          valor: linhas.reduce((total, l) => total + l.total_compras, 0),
        },
        {
          titulo: "Valor gasto somado (R$)",
          valor: linhas.reduce((total, l) => total + Number(l.total_gasto), 0),
        },
      ]
    );

    return resposta
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="clientes_${hojeNoFuso()}.csv"`)
      .send(csv);
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
          { titulo: "Vendas", valor: (l) => l.vendas },
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

    const somaFinalizado = finalizadas.reduce((total, venda) => total + Number(venda.valor_total), 0);
    const unidades = vendas.reduce((total, venda) => total + Number(venda.total_unidades ?? 0), 0);

    /**
     * O resumo é o mesmo nos dois formatos. Em planilha ele vira uma aba
     * separada; em CSV, que não tem aba, continua no rodapé do arquivo.
     */
    const resumo = [
      { indicador: "Periodo", valor: `${intervalo.de} a ${intervalo.ate}` },
      { indicador: "Vendas registradas", valor: vendas.length },
      { indicador: "Vendas finalizadas", valor: finalizadas.length },
      {
        indicador: "Vendas canceladas",
        valor: vendas.filter((venda) => venda.status === STATUS_VENDA.CANCELADA).length,
      },
      {
        indicador: "Vendas em aberto",
        valor: vendas.filter((venda) => venda.status === STATUS_VENDA.ABERTA).length,
      },
      // Linha é o item do carrinho; unidade é quanto saiu de cada um.
      {
        indicador: "Itens (linhas do carrinho)",
        valor: vendas.reduce((total, venda) => total + Number(venda.total_itens ?? 0), 0),
      },
      { indicador: "Unidades vendidas", valor: unidades },
      { indicador: "Total finalizado (R$)", valor: Number(somaFinalizado.toFixed(2)) },
      {
        indicador: "Descontos concedidos (R$)",
        valor: Number(
          finalizadas.reduce((total, venda) => total + Number(venda.desconto), 0).toFixed(2)
        ),
      },
      {
        indicador: "Ticket medio (R$)",
        valor: finalizadas.length
          ? Number((somaFinalizado / finalizadas.length).toFixed(2))
          : 0,
      },
      {
        indicador: "Vendas com controlado",
        valor: vendas.filter((venda) => venda.tem_controlado).length,
      },
      {
        indicador: "Vendas com cliente identificado",
        valor: vendas.filter((venda) => venda.cliente_nome).length,
      },
    ];

    const colunasVendas = [
      { titulo: "Data e hora", valor: (v) => formatarDataHora(v.criado_em) },
      { titulo: "Venda", valor: (v) => Number(v.numero) },
      { titulo: "Status", valor: (v) => v.status },
      { titulo: "Cliente", valor: (v) => v.cliente_nome ?? "Balcao" },
      { titulo: "Itens (linhas)", valor: (v) => Number(v.total_itens) },
      { titulo: "Unidades", valor: (v) => Number(v.total_unidades ?? 0) },
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
      { titulo: "Motivo do cancelamento", valor: (v) => v.categoria_cancelamento ?? "" },
      { titulo: "Observacao do cancelamento", valor: (v) => v.motivo_cancelamento ?? "" },
    ];

    // Planilha de verdade quando pedida: aba de vendas e aba de resumo.
    if (requisicao.query?.formato === "xlsx") {
      const arquivo = gerarXlsx([
        { nome: "Vendas", colunas: colunasVendas, linhas: vendas },
        {
          nome: "Resumo",
          colunas: [
            { titulo: "Indicador", valor: (l) => l.indicador },
            { titulo: "Valor", valor: (l) => l.valor },
          ],
          linhas: resumo,
        },
      ]);

      return resposta
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header(
          "Content-Disposition",
          `attachment; filename="${nomeArquivo("vendas", intervalo.de, intervalo.ate).replace(
            ".csv",
            ".xlsx"
          )}"`
        )
        .send(arquivo);
    }

    const csv = gerarCsv(
      colunasVendas,
      vendas,
      resumo.map((linha) => ({ titulo: linha.indicador, valor: linha.valor }))
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
      diasDeUso: produto.dias_de_uso ?? null,
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

  /** Ajusta a quantidade da linha do carrinho, conferindo o saldo disponível. */
  app.patch("/:id/itens/:itemId", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const quantidade = Number(requisicao.body?.quantidade);
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return invalido(resposta, "quantidade precisa ser um inteiro maior que zero.");
    }

    const itens = await listarItens(venda.id);
    const item = itens.find((registro) => registro.id === requisicao.params.itemId);
    if (!item) return naoEncontrado(resposta, "Item não encontrado nesta venda.");

    // Aumentar quantidade tem de caber no estoque, igual a incluir o item.
    if (quantidade > item.quantidade) {
      try {
        const { produto } = await estoque.buscarProduto(
          item.produto_id,
          requisicao.headers.authorization
        );
        const disponivel = (produto.lotes ?? [])
          .filter((lote) => !lote.vencido && lote.quantidade > 0)
          .reduce((soma, lote) => soma + lote.quantidade, 0);

        if (!produto.venda_sob_encomenda && quantidade > disponivel) {
          return bloqueado(
            resposta,
            ERROS.ESTOQUE_INSUFICIENTE,
            `Estoque insuficiente para ${produto.nome}: disponível ${disponivel}.`
          );
        }
      } catch (erro) {
        if (erro instanceof ErroServico) return responderErroServico(resposta, erro);
        throw erro;
      }
    }

    await alterarQuantidadeDoItem({ vendaId: venda.id, itemId: item.id, quantidade });
    return { venda: await buscarVendaCompleta(venda.id) };
  });

  /** Desconto em uma linha só — o teto do perfil considera a venda inteira. */
  app.post("/:id/itens/:itemId/desconto", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const itens = await listarItens(venda.id);
    const item = itens.find((registro) => registro.id === requisicao.params.itemId);
    if (!item) return naoEncontrado(resposta, "Item não encontrado nesta venda.");

    const corpo = requisicao.body ?? {};
    const brutoDoItem = item.quantidade * item.preco_unitario;

    let desconto;
    if (corpo.desconto_pct !== undefined) {
      const percentual = Number(corpo.desconto_pct);
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        return invalido(resposta, "desconto_pct deve estar entre 0 e 100.");
      }
      desconto = Number(((brutoDoItem * percentual) / 100).toFixed(2));
    } else {
      desconto = Number(corpo.desconto);
      if (!Number.isFinite(desconto) || desconto < 0) {
        return invalido(resposta, "desconto inválido.");
      }
    }

    if (desconto > brutoDoItem) {
      return invalido(resposta, "O desconto não pode ser maior que o valor do item.");
    }

    const bruto = itens.reduce((soma, linha) => soma + linha.quantidade * linha.preco_unitario, 0);
    const outrosDescontos = itens
      .filter((linha) => linha.id !== item.id)
      .reduce((soma, linha) => soma + Number(linha.desconto ?? 0), 0);
    const totalDescontado = desconto + outrosDescontos + Number(venda.desconto ?? 0);

    const limitePct = descontoMaximoPct(requisicao.usuario);
    const pctPedido = bruto > 0 ? (totalDescontado / bruto) * 100 : 0;
    if (pctPedido - limitePct > 0.01) {
      return bloqueado(
        resposta,
        ERROS.DESCONTO_ACIMA_DO_LIMITE,
        `Somando os descontos da venda dá ${pctPedido.toFixed(1)}%, e seu perfil vai até ${limitePct}%.`
      );
    }

    await definirDescontoDoItem({ vendaId: venda.id, itemId: item.id, desconto });
    return { venda: await buscarVendaCompleta(venda.id) };
  });

  /** Desconto respeita o limite percentual do perfil (§3). */
  app.post("/:id/desconto", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const itens = await listarItens(venda.id);
    const bruto = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
    const descontoNosItens = itens.reduce((soma, item) => soma + Number(item.desconto ?? 0), 0);

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

    if (desconto + descontoNosItens > bruto) {
      return invalido(resposta, "O desconto não pode ser maior que o valor dos itens.");
    }

    // O limite do perfil vale para tudo que foi descontado na venda, não só
    // para este campo: senão daria para furar o teto dando desconto item a item.
    const limitePct = descontoMaximoPct(requisicao.usuario);
    const pctPedido = bruto > 0 ? ((desconto + descontoNosItens) / bruto) * 100 : 0;
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

  /**
   * Tira a receita da venda. Se ainda houver item controlado, a finalização
   * volta a ser bloqueada — a trava do §3 não depende de quem apagou o quê.
   */
  app.delete("/:id/receita", { preHandler: auth.exigirPermissao("vender") }, async (requisicao, resposta) => {
    const venda = await carregarVendaAberta(requisicao.params.id, resposta);
    if (!venda) return resposta;

    const removida = await removerReceita(venda.id);
    if (!removida) return naoEncontrado(resposta, "Esta venda não tem receita registrada.");

    return { venda: await buscarVendaCompleta(venda.id) };
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

    // CPF na nota: só a pedido do cliente, só para constar na nota fiscal —
    // não exige cliente cadastrado nem é obrigatório para concluir a venda
    // (LGPD, minimização de dados).
    const cpfNota = requisicao.body?.cpf_nota || null;

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
      const emissao = await fiscal.emitirNota({ vendaId: venda.id, cpfNota }, token);
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

    // 5) Recibo térmico do PDV. A venda já está salva e paga — se a impressora
    // estiver offline ou o papel tiver acabado, isso não desfaz a venda, só
    // fica registrado no log para o operador tentar reimprimir depois.
    const impressao = await imprimirRecibo(completa);
    if (!impressao.impresso) {
      requisicao.log.warn(
        { motivo: impressao.motivo, vendaId: venda.id },
        "recibo nao foi impresso"
      );
    }

    // 6) Fecha o ciclo do relacionamento: se havia uma oferta em aberto para
    // este cliente, ela vira convertida com esta venda anexada. Depois da venda
    // já registrada, e sem derrubar a resposta se falhar — a venda aconteceu de
    // qualquer forma, e o vínculo é informação de acompanhamento.
    let contatoConvertido = null;
    if (completa.cliente_id) {
      try {
        contatoConvertido = await ligarVendaAoContato({
          clienteId: completa.cliente_id,
          vendaId: venda.id,
        });
      } catch (erro) {
        requisicao.log.warn({ erro: erro.message, vendaId: venda.id }, "nao liguei a venda ao contato");
      }
    }

    return {
      venda: await buscarVendaCompleta(venda.id),
      nota_fiscal: nota,
      baixa_estoque: baixas.map(({ item, lotes }) => ({
        item_id: item.id,
        produto_nome: item.produto_nome,
        lotes,
      })),
      contato_convertido: contatoConvertido,
      troco: Number((totalPago - completa.valor_total).toFixed(2)),
      recibo: {
        impresso: impressao.impresso,
        motivo: impressao.motivo ?? null,
        texto: impressao.texto,
      },
    };
  });

  /** Cancelamento exige perfil superior e motivo (§3). */
  app.post(
    "/:id/cancelar",
    { preHandler: auth.exigirPermissao("cancelar_venda") },
    async (requisicao, resposta) => {
      const { motivo, categoria } = requisicao.body ?? {};
      if (!categoria || !CATEGORIA_CANCELAMENTO_LISTA.includes(categoria)) {
        return invalido(
          resposta,
          `Escolha o motivo do cancelamento. Use um de: ${CATEGORIA_CANCELAMENTO_LISTA.join(", ")}.`
        );
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
        // O texto livre é opcional: a categoria já diz o essencial.
        motivo: motivo ? String(motivo).trim() : null,
        categoria,
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
