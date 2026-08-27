import { consultar } from "./db.js";

/**
 * Relacionamento com o cliente (CRM).
 *
 * A farmácia já tem o dado mais valioso: o que cada pessoa compra e de quanto em
 * quanto tempo. Estas consultas transformam isso em uma lista de quem ligar hoje
 * e por quê — recompra de uso contínuo atrasada, cliente sumindo, cliente novo
 * para acolher — com a oferta sugerida a partir do que ele já leva.
 */

/** Situação do cliente em relação à recompra. */
export const SITUACOES = {
  NOVO: "novo",
  ATIVO: "ativo",
  RECOMPRA_ATRASADA: "recompra_atrasada",
  EM_RISCO: "em_risco",
  INATIVO: "inativo",
};

/**
 * Quem só comprou uma vez não tem intervalo para comparar, então vale o prazo
 * fixo. Quem tem histórico é medido pelo próprio ritmo: atrasar 25% do intervalo
 * já é sinal, e passar de três intervalos é cliente perdido.
 */
const DIAS_INATIVO_SEM_HISTORICO = 60;
const DIAS_EM_RISCO_SEM_HISTORICO = 30;

/**
 * Janela de silêncio: por quantos dias o cliente sai da fila depois de um
 * contato, conforme o que aconteceu nele.
 *
 * Sem isso, quem disse "não quero" voltava para a lista no dia seguinte e era
 * incomodado de novo — o oposto do que esta tela existe para fazer. Não atender
 * não é recusa, então a espera é curta; qualquer contato dá uma folga mínima
 * para ninguém ligar duas vezes na mesma semana.
 */
const SILENCIO_DIAS = {
  sem_interesse: 90,
  nao_atendeu: 3,
  qualquer_contato: 5,
};

/**
 * A venda é contada como resultado do contato se acontecer até 30 dias depois
 * dele. Passou disso, foi o cliente voltando por conta própria — creditar ao
 * telefonema seria inflar o número.
 */
const JANELA_CONVERSAO = "30 days";

/**
 * A venda que veio depois do contato. É assim que a conversão é medida: pelo
 * que aconteceu no caixa, não pelo que alguém marcou numa lista suspensa.
 */
const COMPRA_APOS_CONTATO = `
  LEFT JOIN LATERAL (
    SELECT v.id, COALESCE(v.finalizado_em, v.criado_em) AS em, v.valor_total
      FROM vendas.vendas v
     WHERE v.status = 'finalizada'
       AND (
         -- A venda amarrada na finalização manda: é o vínculo explícito.
         v.id = ct.venda_id
         -- Sem vínculo, vale a venda do cliente dentro da janela.
         OR (
           v.cliente_id = ct.cliente_id
           AND COALESCE(v.finalizado_em, v.criado_em) > ct.criado_em
           AND COALESCE(v.finalizado_em, v.criado_em) <= ct.criado_em + interval '${JANELA_CONVERSAO}'
         )
       )
     ORDER BY (v.id = ct.venda_id) DESC, COALESCE(v.finalizado_em, v.criado_em)
     LIMIT 1
  ) compra ON true
`;

/**
 * Contato que ainda não virou nada e cuja oferta continua de pé.
 *
 * `exceto` existe por causa da ordem das coisas na finalização: quando a venda
 * vai ser amarrada ao contato, ela já está finalizada — e sem excluí-la da
 * conta, ela própria faria a oferta parecer usada, e o vínculo nunca
 * aconteceria.
 */
const ofertaEmAberto = (exceto = "NULL") => `
  ct.oferta IS NOT NULL
  AND ct.venda_id IS NULL
  AND ct.resultado <> 'sem_interesse'
  AND ct.criado_em >= now() - interval '${JANELA_CONVERSAO}'
  AND NOT EXISTS (
    SELECT 1 FROM vendas.vendas v
     WHERE v.cliente_id = ct.cliente_id
       AND v.status = 'finalizada'
       AND v.id IS DISTINCT FROM ${exceto}
       AND COALESCE(v.finalizado_em, v.criado_em) > ct.criado_em
  )
`;

const OFERTA_EM_ABERTO = ofertaEmAberto();

/**
 * Métricas por cliente. Tudo sai de `vendas` — nenhum outro schema é tocado.
 * O cruzamento com preço e saldo atual do produto é feito por quem monta a tela,
 * consultando o estoque-service.
 */
export async function analisarClientes({
  situacao,
  busca,
  incluirSemCompra = true,
  incluirEmSilencio = false,
} = {}) {
  const { rows } = await consultar(
    `WITH compras AS (
       SELECT v.cliente_id,
              COUNT(*)::int                       AS total_compras,
              COALESCE(SUM(v.valor_total), 0)     AS valor_total,
              COALESCE(AVG(v.valor_total), 0)     AS ticket_medio,
              MIN(v.criado_em)                    AS primeira_compra,
              MAX(v.criado_em)                    AS ultima_compra,
              (current_date - MAX(v.criado_em)::date)::int AS dias_sem_comprar,
              (MAX(v.criado_em)::date - MIN(v.criado_em)::date)::int AS janela_dias
         FROM vendas.vendas v
        WHERE v.cliente_id IS NOT NULL AND v.status = 'finalizada'
        GROUP BY v.cliente_id
     ),
     preferidos AS (
       SELECT cliente_id, produto_id, produto_nome, tipo_controle, unidades, vezes,
              ultima_compra_em, dias_desde_ultima, ultima_quantidade, dias_de_uso,
              ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY vezes DESC, unidades DESC) AS posicao
         FROM (
           SELECT v.cliente_id, i.produto_id, i.produto_nome, i.tipo_controle,
                  SUM(i.quantidade)::int          AS unidades,
                  COUNT(DISTINCT v.id)::int       AS vezes,
                  MAX(v.criado_em)                AS ultima_compra_em,
                  (current_date - MAX(v.criado_em)::date)::int AS dias_desde_ultima,
                  -- Quanto levou e quanto durava na última vez que comprou este
                  -- item: é o que permite prever a reposição sem histórico.
                  (ARRAY_AGG(i.quantidade ORDER BY v.criado_em DESC))[1]::int
                    AS ultima_quantidade,
                  (ARRAY_AGG(i.dias_de_uso ORDER BY v.criado_em DESC)
                     FILTER (WHERE i.dias_de_uso IS NOT NULL))[1]::int AS dias_de_uso
             FROM vendas.itens_venda i
             JOIN vendas.vendas v ON v.id = i.venda_id
            WHERE v.cliente_id IS NOT NULL AND v.status = 'finalizada'
            GROUP BY v.cliente_id, i.produto_id, i.produto_nome, i.tipo_controle
         ) agregado
     ),
     ultimo_contato AS (
       SELECT cliente_id,
              MAX(criado_em) AS em,
              COUNT(*)::int  AS total,
              MAX(criado_em) FILTER (WHERE resultado = 'sem_interesse') AS sem_interesse_em,
              MAX(criado_em) FILTER (WHERE resultado = 'nao_atendeu')   AS nao_atendeu_em,
              (current_date - MAX(criado_em)::date)::int AS dias_desde_contato,
              (current_date - MAX(criado_em) FILTER (WHERE resultado = 'sem_interesse')::date)::int
                AS dias_desde_recusa,
              (current_date - MAX(criado_em) FILTER (WHERE resultado = 'nao_atendeu')::date)::int
                AS dias_desde_nao_atendeu
         FROM vendas.contatos_cliente
        GROUP BY cliente_id
     )
     SELECT cl.id, cl.nome, cl.cpf, cl.telefone, cl.email, cl.convenio,
            cl.aceita_contato, cl.ativo, cl.criado_em,
            COALESCE(c.total_compras, 0)  AS total_compras,
            COALESCE(c.valor_total, 0)    AS valor_total,
            COALESCE(c.ticket_medio, 0)   AS ticket_medio,
            c.primeira_compra, c.ultima_compra,
            c.dias_sem_comprar, c.janela_dias,
            uc.em    AS ultimo_contato_em,
            COALESCE(uc.total, 0) AS total_contatos,
            uc.dias_desde_contato, uc.dias_desde_recusa, uc.dias_desde_nao_atendeu,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'produto_id', p.produto_id,
                        'produto_nome', p.produto_nome,
                        'tipo_controle', p.tipo_controle,
                        'unidades', p.unidades,
                        'vezes', p.vezes,
                        'ultima_compra_em', p.ultima_compra_em,
                        'dias_desde_ultima', p.dias_desde_ultima,
                        'ultima_quantidade', p.ultima_quantidade,
                        'dias_de_uso', p.dias_de_uso
                      ) ORDER BY p.posicao)
                 FROM preferidos p
                WHERE p.cliente_id = cl.id AND p.posicao <= 3), '[]'
            ) AS preferidos
       FROM vendas.clientes cl
       LEFT JOIN compras c        ON c.cliente_id = cl.id
       LEFT JOIN ultimo_contato uc ON uc.cliente_id = cl.id
      WHERE cl.ativo
      ORDER BY cl.nome`
  );

  const analisados = rows
    .map((linha) => montarAnalise(linha))
    .filter((cliente) => (incluirSemCompra ? true : cliente.total_compras > 0))
    // Quem acabou de ser contatado sai da fila por um tempo. Não é um filtro
    // escondido: a tela mostra quantos ficaram de fora e permite ver quem são.
    .filter((cliente) => (incluirEmSilencio ? true : !cliente.em_silencio))
    .filter((cliente) => (situacao ? cliente.situacao === situacao : true))
    .filter((cliente) => {
      if (!busca) return true;
      const termo = String(busca).toLowerCase();
      return (
        cliente.nome.toLowerCase().includes(termo) ||
        (cliente.cpf ?? "").includes(termo) ||
        (cliente.convenio ?? "").toLowerCase().includes(termo)
      );
    });

  // Quem está mais atrasado na recompra aparece primeiro: é a ligação mais urgente.
  return analisados.sort((a, b) => b.prioridade - a.prioridade);
}

/**
 * Traduz os números em situação, previsão de recompra e sugestão de contato.
 * @param {Record<string, any>} linha
 */
function montarAnalise(linha) {
  const totalCompras = Number(linha.total_compras);
  const preferidos = linha.preferidos ?? [];
  const diasSemComprar = linha.dias_sem_comprar === null ? null : Number(linha.dias_sem_comprar);
  const janela = Number(linha.janela_dias ?? 0);

  // Intervalo médio entre compras: só faz sentido com duas ou mais compras.
  const intervaloMedio = totalCompras > 1 ? Math.max(Math.round(janela / (totalCompras - 1)), 1) : null;

  // Uso contínuo: mesmo produto levado três vezes ou mais (tratamento crônico).
  const usoContinuo = preferidos.find((item) => item.vezes >= 3) ?? null;

  const principal = usoContinuo ?? preferidos[0] ?? null;

  /**
   * Duração do que ele levou da última vez, pelo cadastro do produto: uma caixa
   * que dura 30 dias, levando duas, dá 60. Só existe se alguém preencheu a
   * duração no cadastro — em curativo ou item de conveniência fica em branco.
   */
  const duracaoDoProduto =
    principal?.dias_de_uso > 0
      ? principal.dias_de_uso * Math.max(Number(principal.ultima_quantidade ?? 1), 1)
      : null;

  const previsaoPeloProduto =
    duracaoDoProduto !== null && principal?.dias_desde_ultima !== null &&
    principal?.dias_desde_ultima !== undefined
      ? duracaoDoProduto - Number(principal.dias_desde_ultima)
      : null;

  /**
   * Qual régua usar. Com três compras ou mais, o ritmo observado ganha: é o
   * comportamento real da pessoa, e ele já embute se ela estica a caixa ou
   * repõe adiantado. Abaixo disso o histórico é coincidência, e a duração da
   * caixa diz mais — inclusive já na primeira compra, que é justamente onde o
   * histórico não tinha nada a dizer.
   */
  let regua = null;
  let origemRegua = null;
  let previsaoDias = null;

  const previsaoPeloHistorico =
    intervaloMedio !== null && diasSemComprar !== null ? intervaloMedio - diasSemComprar : null;

  if (totalCompras >= 3 && intervaloMedio !== null) {
    regua = intervaloMedio;
    origemRegua = "historico";
    previsaoDias = previsaoPeloHistorico;
  } else if (duracaoDoProduto !== null) {
    regua = duracaoDoProduto;
    origemRegua = "produto";
    previsaoDias = previsaoPeloProduto;
  } else if (intervaloMedio !== null) {
    regua = intervaloMedio;
    origemRegua = "historico";
    previsaoDias = previsaoPeloHistorico;
  }

  let situacao;
  if (totalCompras === 0) {
    situacao = SITUACOES.NOVO;
  } else if (regua === null) {
    // Sem ritmo observado e sem duração no cadastro: só o prazo fixo resta.
    if (diasSemComprar > DIAS_INATIVO_SEM_HISTORICO) situacao = SITUACOES.INATIVO;
    else if (diasSemComprar > DIAS_EM_RISCO_SEM_HISTORICO) situacao = SITUACOES.EM_RISCO;
    else situacao = SITUACOES.NOVO;
  } else {
    const toleranciaAtraso = Math.max(Math.round(regua * 0.25), 3);
    // Três intervalos sem aparecer é cliente perdido, seja qual for o ritmo.
    const limiteInativo = Math.max(regua * 3, 45);
    const limiteRisco = Math.max(Math.round(regua * 1.5), 45);

    if (diasSemComprar > limiteInativo) situacao = SITUACOES.INATIVO;
    else if (previsaoDias <= -toleranciaAtraso) situacao = SITUACOES.RECOMPRA_ATRASADA;
    else if (diasSemComprar > limiteRisco) situacao = SITUACOES.EM_RISCO;
    else situacao = SITUACOES.ATIVO;
  }

  const atrasoRecompra = previsaoDias !== null && previsaoDias < 0 ? Math.abs(previsaoDias) : 0;

  const silencio = calcularSilencio(linha);

  const sugestao = montarSugestao({
    situacao,
    diasSemComprar,
    regua,
    origemRegua,
    atrasoRecompra,
    usoContinuo,
    preferidos,
    ticketMedio: Number(linha.ticket_medio),
    totalCompras,
    convenio: linha.convenio,
  });

  return {
    id: linha.id,
    nome: linha.nome,
    cpf: linha.cpf,
    telefone: linha.telefone,
    email: linha.email,
    convenio: linha.convenio,
    aceita_contato: linha.aceita_contato,
    total_compras: totalCompras,
    valor_total: Number(linha.valor_total),
    ticket_medio: Number(linha.ticket_medio),
    primeira_compra: linha.primeira_compra,
    ultima_compra: linha.ultima_compra,
    dias_sem_comprar: diasSemComprar,
    intervalo_medio_dias: intervaloMedio,
    // A régua efetivamente usada e de onde ela veio. A tela mostra os dois:
    // "a cada 30 dias (pela caixa)" convence diferente de "(pelo histórico)".
    regua_dias: regua,
    origem_regua: origemRegua,
    duracao_do_produto_dias: duracaoDoProduto,
    dias_para_recompra: previsaoDias,
    atraso_recompra_dias: atrasoRecompra,
    uso_continuo: usoContinuo,
    preferidos,
    ultimo_contato_em: linha.ultimo_contato_em,
    total_contatos: Number(linha.total_contatos),
    ...silencio,
    situacao,
    ...sugestao,
  };
}

/**
 * Por quanto tempo este cliente fica fora da fila e por quê.
 *
 * A regra vale mesmo para quem está com a recompra atrasada: se acabaram de
 * ligar e ele disse que não queria, insistir no dia seguinte não recupera a
 * venda — só desgasta.
 */
function calcularSilencio(linha) {
  const candidatos = [
    ["sem_interesse", linha.dias_desde_recusa, SILENCIO_DIAS.sem_interesse, "disse que não tem interesse"],
    ["nao_atendeu", linha.dias_desde_nao_atendeu, SILENCIO_DIAS.nao_atendeu, "não atendeu"],
    ["contato_recente", linha.dias_desde_contato, SILENCIO_DIAS.qualquer_contato, "foi contatado"],
  ];

  let maiorEspera = null;
  for (const [tipo, desde, espera, texto] of candidatos) {
    if (desde === null || desde === undefined) continue;
    const restante = espera - Number(desde);
    if (restante <= 0) continue;
    if (!maiorEspera || restante > maiorEspera.restante) {
      maiorEspera = {
        tipo,
        restante,
        motivo: `${texto} há ${Number(desde)} dia(s) — voltar a chamar em ${restante} dia(s)`,
      };
    }
  }

  return {
    em_silencio: Boolean(maiorEspera),
    silencio_motivo: maiorEspera?.motivo ?? null,
    silencio_dias_restantes: maiorEspera?.restante ?? 0,
  };
}

/**
 * Sugestão de contato: o motivo (por que ligar hoje) e a oferta (o que dizer),
 * ambos tirados do próprio histórico do cliente. Também devolve a `prioridade`,
 * que ordena a fila de ligações.
 */
function montarSugestao({
  situacao,
  diasSemComprar,
  regua,
  origemRegua,
  atrasoRecompra,
  usoContinuo,
  preferidos,
  ticketMedio,
  totalCompras,
  convenio,
}) {
  const principal = usoContinuo ?? preferidos[0] ?? null;
  const nomeProduto = principal?.produto_nome ?? null;

  // A mesma previsão soa diferente conforme de onde veio, e a diferença importa
  // para quem vai falar com o cliente: "você costuma levar a cada 30 dias" é
  // uma observação sobre ele; "a caixa dura 30 dias" é sobre o remédio.
  const peloProduto = origemRegua === "produto";
  const ritmo = peloProduto
    ? `a caixa costuma durar ${regua} dias`
    : `costuma comprar a cada ${regua} dias`;

  if (situacao === SITUACOES.RECOMPRA_ATRASADA && usoContinuo) {
    return {
      motivo: `Recompra de uso contínuo atrasada ${atrasoRecompra} dia(s)`,
      oferta: `Reservar ${nomeProduto} (${ritmo}) e oferecer 5% de desconto na retirada`,
      desconto_pct: 5,
      mensagem:
        `Olá! Vi que seu ${nomeProduto} costuma durar cerca de ${regua} dias e a última ` +
        `retirada foi há ${diasSemComprar} dias. Posso separar uma caixa para você com 5% de desconto?`,
      prioridade: 100 + atrasoRecompra,
    };
  }

  if (situacao === SITUACOES.RECOMPRA_ATRASADA) {
    return {
      motivo: peloProduto
        ? `A ${nomeProduto} que levou devia durar ${regua} dias e já passaram ${diasSemComprar}`
        : `Comprava a cada ${regua} dias e está ${atrasoRecompra} dia(s) atrasado`,
      oferta: nomeProduto ? `Oferecer ${nomeProduto} com 5% de desconto` : "Convidar para uma nova compra",
      desconto_pct: nomeProduto ? 5 : null,
      mensagem:
        `Olá! Faz ${diasSemComprar} dias da sua última compra aqui. Separei uma condição especial ` +
        `${nomeProduto ? `no ${nomeProduto}` : "para você"} — quer que eu reserve?`,
      prioridade: 80 + atrasoRecompra,
    };
  }

  if (situacao === SITUACOES.INATIVO) {
    return {
      motivo: `Sem comprar há ${diasSemComprar} dias`,
      oferta: nomeProduto
        ? `Reativação: desconto de 10% em ${nomeProduto}`
        : "Reativação: desconto de 10% na próxima compra",
      desconto_pct: 10,
      mensagem:
        `Olá! Sentimos sua falta por aqui. Preparei 10% de desconto ` +
        `${nomeProduto ? `no ${nomeProduto}, que você costumava levar` : "na sua próxima compra"}. ` +
        `Vale pelos próximos 15 dias.`,
      prioridade: 60,
    };
  }

  if (situacao === SITUACOES.EM_RISCO) {
    return {
      motivo: `${diasSemComprar} dias sem comprar — começando a sumir`,
      oferta: nomeProduto ? `Lembrete de reposição de ${nomeProduto}` : "Lembrete de reposição",
      desconto_pct: null,
      mensagem:
        `Olá! Passando para lembrar da reposição ` +
        `${nomeProduto ? `do ${nomeProduto}` : "dos seus itens de uso"}. Tenho em estoque hoje, quer que eu separe?`,
      prioridade: 50,
    };
  }

  if (situacao === SITUACOES.NOVO) {
    // Quem só se cadastrou e quem já levou algo merecem conversas diferentes.
    if (totalCompras === 0) {
      return {
        motivo: "Cadastrado, ainda sem compra",
        oferta: convenio
          ? `Convidar para a primeira compra usando o convênio ${convenio}`
          : "Convidar para a primeira compra e apresentar os convênios aceitos",
        desconto_pct: null,
        mensagem:
          `Olá! Vi que você deixou seu cadastro com a gente. Se precisar de algum medicamento, ` +
          `me chama que eu confiro o estoque e separo${convenio ? ` — aceitamos ${convenio}` : ""}.`,
        prioridade: 25,
      };
    }

    return {
      motivo: "Primeira compra recente",
      oferta: convenio
        ? `Explicar como usar o convênio ${convenio} e os descontos dele`
        : "Apresentar os convênios e o desconto de recompra",
      desconto_pct: null,
      mensagem:
        `Olá! Obrigado por comprar com a gente. Qualquer dúvida sobre o uso do medicamento ` +
        `pode falar comigo — e temos condição melhor para quem repõe aqui todo mês.`,
      prioridade: 30,
    };
  }

  // Cliente ativo e em dia: só vale contato se o ticket dele for relevante.
  const campeao = ticketMedio >= 80 && totalCompras >= 4;
  return {
    motivo: campeao ? "Cliente frequente e de ticket alto" : "Em dia com a recompra",
    oferta: campeao
      ? "Oferecer programa de fidelidade e reserva mensal automática"
      : nomeProduto
        ? `Nada urgente — próxima reposição de ${nomeProduto}`
        : "Nada urgente",
    desconto_pct: null,
    mensagem: campeao
      ? `Olá! Como você repõe aqui com frequência, posso deixar sua reserva mensal separada e ` +
        `garantir desconto fixo. Quer que eu configure?`
      : `Olá! Quando precisar da reposição, me chama que eu já separo.`,
    prioridade: campeao ? 40 : 10,
  };
}

/** Contadores para o topo da tela de relacionamento. */
export async function resumoCrm() {
  const clientes = await analisarClientes({ incluirSemCompra: true, incluirEmSilencio: true });

  const contar = (situacao) => clientes.filter((cliente) => cliente.situacao === situacao).length;
  const recompraProxima = clientes.filter(
    (cliente) => cliente.dias_para_recompra !== null && cliente.dias_para_recompra >= 0 && cliente.dias_para_recompra <= 7
  ).length;

  const { rows: contatos } = await consultar(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ct.criado_em::date = current_date)::int AS hoje,
            COUNT(*) FILTER (WHERE ct.resultado = 'convertido')::int AS convertidos,
            -- O que o caixa confirma: houve venda do cliente depois do contato.
            COUNT(*) FILTER (WHERE compra.id IS NOT NULL)::int AS com_compra_depois,
            COALESCE(SUM(compra.valor_total) FILTER (WHERE compra.id IS NOT NULL), 0)
              AS valor_apos_contato
       FROM vendas.contatos_cliente ct
       ${COMPRA_APOS_CONTATO}`
  );

  const { rows: retornos } = await consultar(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ct.proximo_contato_em <= current_date)::int AS para_hoje
       FROM vendas.contatos_cliente ct
      WHERE ct.proximo_contato_em IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM vendas.contatos_cliente mais_novo
           WHERE mais_novo.cliente_id = ct.cliente_id
             AND mais_novo.criado_em > ct.criado_em
        )`
  );

  const comCompra = clientes.filter((cliente) => cliente.total_compras > 0);
  const valorTotal = comCompra.reduce((soma, cliente) => soma + cliente.valor_total, 0);
  const comprasTotais = comCompra.reduce((soma, cliente) => soma + cliente.total_compras, 0);

  return {
    clientes: clientes.length,
    com_compra: comCompra.length,
    situacoes: {
      novo: contar(SITUACOES.NOVO),
      ativo: contar(SITUACOES.ATIVO),
      recompra_atrasada: contar(SITUACOES.RECOMPRA_ATRASADA),
      em_risco: contar(SITUACOES.EM_RISCO),
      inativo: contar(SITUACOES.INATIVO),
    },
    recompra_prevista_7_dias: recompraProxima,
    // Ticket médio é por compra; o valor por cliente é o quanto cada um já
    // gastou na loja — misturar os dois dava número sem sentido.
    ticket_medio: comprasTotais ? Number((valorTotal / comprasTotais).toFixed(2)) : 0,
    valor_medio_por_cliente: comCompra.length
      ? Number((valorTotal / comCompra.length).toFixed(2))
      : 0,
    faturamento_de_clientes_identificados: Number(valorTotal.toFixed(2)),
    contatos: {
      ...contatos[0],
      valor_apos_contato: Number(Number(contatos[0].valor_apos_contato).toFixed(2)),
      conversao_pct: contatos[0].total
        ? Number(((contatos[0].com_compra_depois / contatos[0].total) * 100).toFixed(1))
        : 0,
    },
    retornos: retornos[0],
    em_silencio: clientes.filter((cliente) => cliente.em_silencio).length,
  };
}

/** Histórico de compras do cliente, para a ficha dele na tela de contato. */
export async function historicoDoCliente(clienteId) {
  const { rows: vendas } = await consultar(
    `SELECT v.id, v.criado_em, v.valor_total, v.desconto,
            (SELECT string_agg(i.produto_nome || ' x' || i.quantidade, ' | ' ORDER BY i.produto_nome)
               FROM vendas.itens_venda i WHERE i.venda_id = v.id) AS itens,
            (SELECT string_agg(DISTINCT p.forma_pagamento, ' + ')
               FROM vendas.pagamentos p WHERE p.venda_id = v.id) AS formas_pagamento
       FROM vendas.vendas v
      WHERE v.cliente_id = $1 AND v.status = 'finalizada'
      ORDER BY v.criado_em DESC
      LIMIT 30`,
    [clienteId]
  );

  const { rows: contatos } = await consultar(
    `SELECT ct.id, ct.canal, ct.motivo, ct.oferta, ct.desconto_pct, ct.observacao,
            ct.resultado, ct.proximo_contato_em, ct.venda_id, ct.usuario_id, ct.criado_em,
            compra.id AS venda_apos_contato_id
       FROM vendas.contatos_cliente ct
       ${COMPRA_APOS_CONTATO}
      WHERE ct.cliente_id = $1
      ORDER BY ct.criado_em DESC
      LIMIT 30`,
    [clienteId]
  );

  return { vendas, contatos, oferta_aberta: await ofertaAbertaDoCliente(clienteId) };
}

export async function registrarContato({
  clienteId,
  usuarioId,
  canal,
  motivo,
  oferta,
  observacao,
  resultado,
  proximoContatoEm,
  descontoPct,
}) {
  const { rows } = await consultar(
    `INSERT INTO vendas.contatos_cliente
       (cliente_id, usuario_id, canal, motivo, oferta, observacao, resultado,
        proximo_contato_em, desconto_pct)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::vendas.resultado_contato, 'aguardando'),
             $8::date, $9)
     RETURNING id, cliente_id, canal, motivo, oferta, observacao, resultado,
               proximo_contato_em, desconto_pct, criado_em`,
    [
      clienteId,
      usuarioId,
      canal,
      motivo,
      oferta ?? null,
      observacao ?? null,
      resultado ?? null,
      proximoContatoEm ?? null,
      descontoPct ?? null,
    ]
  );
  return rows[0];
}

export async function atualizarResultadoContato({
  contatoId,
  resultado,
  observacao,
  proximoContatoEm,
}) {
  const { rows } = await consultar(
    `UPDATE vendas.contatos_cliente
        SET resultado = COALESCE($2::vendas.resultado_contato, resultado),
            observacao = COALESCE($3, observacao),
            proximo_contato_em = COALESCE($4::date, proximo_contato_em)
      WHERE id = $1
      RETURNING id, cliente_id, canal, motivo, oferta, observacao, resultado,
                proximo_contato_em, desconto_pct, criado_em`,
    [contatoId, resultado ?? null, observacao ?? null, proximoContatoEm ?? null]
  );
  return rows[0] ?? null;
}

/**
 * Retornos combinados que ainda não foram atendidos.
 *
 * Um retorno é considerado resolvido quando existe um contato mais novo com o
 * mesmo cliente — falar de novo É atender o retorno. Assim não é preciso ficar
 * marcando "concluído" à mão, que é justamente o tipo de tarefa que ninguém faz.
 *
 * `dias_de_atraso` negativo significa que a data ainda vai chegar.
 */
export async function listarRetornosPendentes() {
  const { rows } = await consultar(
    `SELECT ct.id, ct.cliente_id, cl.nome AS cliente_nome, cl.telefone,
            cl.aceita_contato,
            ct.canal, ct.motivo, ct.oferta, ct.desconto_pct, ct.observacao,
            ct.resultado, ct.proximo_contato_em, ct.criado_em,
            (current_date - ct.proximo_contato_em)::int AS dias_de_atraso,
            compra.id         AS venda_apos_contato_id,
            compra.em         AS comprou_em,
            compra.valor_total AS valor_da_compra
       FROM vendas.contatos_cliente ct
       JOIN vendas.clientes cl ON cl.id = ct.cliente_id
       ${COMPRA_APOS_CONTATO}
      WHERE ct.proximo_contato_em IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM vendas.contatos_cliente mais_novo
           WHERE mais_novo.cliente_id = ct.cliente_id
             AND mais_novo.criado_em > ct.criado_em
        )
      ORDER BY ct.proximo_contato_em`
  );
  return rows;
}

/**
 * A oferta que ficou de pé para este cliente, para o balcão ver quando ele
 * aparecer. Sem isto, o cliente chega no caixa e ninguém sabe que ligaram para
 * ele oferecendo desconto — a promessa some no caminho.
 */
export async function ofertaAbertaDoCliente(clienteId) {
  const { rows } = await consultar(
    `SELECT ct.id, ct.canal, ct.motivo, ct.oferta, ct.desconto_pct,
            ct.resultado, ct.proximo_contato_em, ct.criado_em,
            (current_date - ct.criado_em::date)::int AS dias_desde_contato
       FROM vendas.contatos_cliente ct
      WHERE ct.cliente_id = $1
        AND ${OFERTA_EM_ABERTO}
      ORDER BY ct.criado_em DESC
      LIMIT 1`,
    [clienteId]
  );
  return rows[0] ?? null;
}

/**
 * Amarra a venda ao contato que a provocou, na finalização.
 *
 * É o que fecha o ciclo sem depender de alguém lembrar de marcar: se havia uma
 * oferta em aberto para este cliente e ele comprou, o contato vira convertido
 * com a venda anexada. Contato onde a pessoa disse que não queria fica de fora
 * — creditar a ele uma compra que veio por outro motivo seria mentir no número.
 */
export async function ligarVendaAoContato({ clienteId, vendaId }) {
  if (!clienteId || !vendaId) return null;

  const { rows } = await consultar(
    `UPDATE vendas.contatos_cliente
        SET venda_id = $2, resultado = 'convertido'
      WHERE id = (
        SELECT ct.id
          FROM vendas.contatos_cliente ct
         WHERE ct.cliente_id = $1
           AND ${ofertaEmAberto("$2::uuid")}
         ORDER BY ct.criado_em DESC
         LIMIT 1
      )
      RETURNING id, cliente_id, oferta, desconto_pct, venda_id`,
    [clienteId, vendaId]
  );
  return rows[0] ?? null;
}

/** Contatos recentes de todos os clientes — agenda do balcão. */
export async function listarContatos({ de, ate, resultado, canal, busca } = {}) {
  const condicoes = [];
  const valores = [];

  if (de) {
    valores.push(de);
    condicoes.push(`ct.criado_em::date >= $${valores.length}::date`);
  }
  if (ate) {
    valores.push(ate);
    condicoes.push(`ct.criado_em::date <= $${valores.length}::date`);
  }
  if (resultado) {
    valores.push(resultado);
    condicoes.push(`ct.resultado = $${valores.length}::vendas.resultado_contato`);
  }
  if (canal) {
    valores.push(canal);
    condicoes.push(`ct.canal = $${valores.length}::vendas.canal_contato`);
  }
  if (busca) {
    valores.push(`%${busca}%`);
    const parametro = `$${valores.length}`;
    condicoes.push(
      `(cl.nome ILIKE ${parametro} OR ct.motivo ILIKE ${parametro} OR ct.oferta ILIKE ${parametro})`
    );
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await consultar(
    `SELECT ct.id, ct.cliente_id, cl.nome AS cliente_nome, cl.telefone,
            ct.canal, ct.motivo, ct.oferta, ct.desconto_pct, ct.observacao,
            ct.resultado, ct.proximo_contato_em, ct.venda_id,
            ct.usuario_id, ct.criado_em,
            -- Conversão medida pelo caixa, não pelo que alguém marcou na lista.
            compra.id          AS venda_apos_contato_id,
            compra.em          AS comprou_em,
            compra.valor_total AS valor_da_compra,
            (compra.em::date - ct.criado_em::date)::int AS dias_ate_a_compra
       FROM vendas.contatos_cliente ct
       JOIN vendas.clientes cl ON cl.id = ct.cliente_id
       ${COMPRA_APOS_CONTATO}
       ${onde}
      ORDER BY ct.criado_em DESC
      LIMIT 200`,
    valores
  );
  return rows;
}
