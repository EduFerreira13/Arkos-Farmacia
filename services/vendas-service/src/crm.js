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
 * Métricas por cliente. Tudo sai de `vendas` — nenhum outro schema é tocado.
 * O cruzamento com preço e saldo atual do produto é feito por quem monta a tela,
 * consultando o estoque-service.
 */
export async function analisarClientes({ situacao, busca, incluirSemCompra = true } = {}) {
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
              ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY vezes DESC, unidades DESC) AS posicao
         FROM (
           SELECT v.cliente_id, i.produto_id, i.produto_nome, i.tipo_controle,
                  SUM(i.quantidade)::int          AS unidades,
                  COUNT(DISTINCT v.id)::int       AS vezes
             FROM vendas.itens_venda i
             JOIN vendas.vendas v ON v.id = i.venda_id
            WHERE v.cliente_id IS NOT NULL AND v.status = 'finalizada'
            GROUP BY v.cliente_id, i.produto_id, i.produto_nome, i.tipo_controle
         ) agregado
     ),
     ultimo_contato AS (
       SELECT cliente_id, MAX(criado_em) AS em, COUNT(*)::int AS total
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
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'produto_id', p.produto_id,
                        'produto_nome', p.produto_nome,
                        'tipo_controle', p.tipo_controle,
                        'unidades', p.unidades,
                        'vezes', p.vezes
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

  const previsaoDias =
    intervaloMedio !== null && diasSemComprar !== null ? intervaloMedio - diasSemComprar : null;

  let situacao;
  if (totalCompras === 0) {
    situacao = SITUACOES.NOVO;
  } else if (intervaloMedio === null) {
    // Uma compra só: não há ritmo para comparar, vale o prazo fixo.
    if (diasSemComprar > DIAS_INATIVO_SEM_HISTORICO) situacao = SITUACOES.INATIVO;
    else if (diasSemComprar > DIAS_EM_RISCO_SEM_HISTORICO) situacao = SITUACOES.EM_RISCO;
    else situacao = SITUACOES.NOVO;
  } else {
    const toleranciaAtraso = Math.max(Math.round(intervaloMedio * 0.25), 3);
    // Três intervalos sem aparecer é cliente perdido, seja qual for o ritmo.
    const limiteInativo = Math.max(intervaloMedio * 3, 45);
    const limiteRisco = Math.max(Math.round(intervaloMedio * 1.5), 45);

    if (diasSemComprar > limiteInativo) situacao = SITUACOES.INATIVO;
    else if (previsaoDias <= -toleranciaAtraso) situacao = SITUACOES.RECOMPRA_ATRASADA;
    else if (diasSemComprar > limiteRisco) situacao = SITUACOES.EM_RISCO;
    else situacao = SITUACOES.ATIVO;
  }

  const atrasoRecompra = previsaoDias !== null && previsaoDias < 0 ? Math.abs(previsaoDias) : 0;

  const sugestao = montarSugestao({
    situacao,
    diasSemComprar,
    intervaloMedio,
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
    dias_para_recompra: previsaoDias,
    atraso_recompra_dias: atrasoRecompra,
    uso_continuo: usoContinuo,
    preferidos,
    ultimo_contato_em: linha.ultimo_contato_em,
    total_contatos: Number(linha.total_contatos),
    situacao,
    ...sugestao,
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
  intervaloMedio,
  atrasoRecompra,
  usoContinuo,
  preferidos,
  ticketMedio,
  totalCompras,
  convenio,
}) {
  const principal = usoContinuo ?? preferidos[0] ?? null;
  const nomeProduto = principal?.produto_nome ?? null;

  if (situacao === SITUACOES.RECOMPRA_ATRASADA && usoContinuo) {
    return {
      motivo: `Recompra de uso contínuo atrasada ${atrasoRecompra} dia(s)`,
      oferta: `Reservar ${nomeProduto} (leva a cada ${intervaloMedio} dias) e oferecer 5% de desconto na retirada`,
      mensagem:
        `Olá! Vi que seu ${nomeProduto} costuma durar cerca de ${intervaloMedio} dias e a última ` +
        `retirada foi há ${diasSemComprar} dias. Posso separar uma caixa para você com 5% de desconto?`,
      prioridade: 100 + atrasoRecompra,
    };
  }

  if (situacao === SITUACOES.RECOMPRA_ATRASADA) {
    return {
      motivo: `Comprava a cada ${intervaloMedio} dias e está ${atrasoRecompra} dia(s) atrasado`,
      oferta: nomeProduto ? `Oferecer ${nomeProduto} com condição especial` : "Convidar para uma nova compra",
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
      mensagem:
        `Olá! Passando para lembrar da reposição ` +
        `${nomeProduto ? `do ${nomeProduto}` : "dos seus itens de uso"}. Tenho em estoque hoje, quer que eu separe?`,
      prioridade: 50,
    };
  }

  if (situacao === SITUACOES.NOVO) {
    return {
      motivo: totalCompras === 0 ? "Cadastrado, ainda sem compra" : "Primeira compra recente",
      oferta: convenio
        ? `Explicar como usar o convênio ${convenio} e os descontos dele`
        : "Apresentar os convênios e o desconto de recompra",
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
    mensagem: campeao
      ? `Olá! Como você repõe aqui com frequência, posso deixar sua reserva mensal separada e ` +
        `garantir desconto fixo. Quer que eu configure?`
      : `Olá! Quando precisar da reposição, me chama que eu já separo.`,
    prioridade: campeao ? 40 : 10,
  };
}

/** Contadores para o topo da tela de relacionamento. */
export async function resumoCrm() {
  const clientes = await analisarClientes({ incluirSemCompra: true });

  const contar = (situacao) => clientes.filter((cliente) => cliente.situacao === situacao).length;
  const recompraProxima = clientes.filter(
    (cliente) => cliente.dias_para_recompra !== null && cliente.dias_para_recompra >= 0 && cliente.dias_para_recompra <= 7
  ).length;

  const { rows: contatos } = await consultar(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE criado_em::date = current_date)::int AS hoje,
            COUNT(*) FILTER (WHERE resultado = 'convertido')::int AS convertidos
       FROM vendas.contatos_cliente`
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
    contatos: contatos[0],
  };
}

/** Histórico de compras do cliente, para a ficha dele na tela de contato. */
export async function historicoDoCliente(clienteId) {
  const { rows: vendas } = await consultar(
    `SELECT v.id, v.criado_em, v.valor_total, v.desconto,
            (SELECT string_agg(i.produto_nome || ' x' || i.quantidade, ' | ' ORDER BY i.produto_nome)
               FROM vendas.itens_venda i WHERE i.venda_id = v.id) AS itens,
            (SELECT string_agg(DISTINCT p.forma_pagamento, ', ')
               FROM vendas.pagamentos p WHERE p.venda_id = v.id) AS formas_pagamento
       FROM vendas.vendas v
      WHERE v.cliente_id = $1 AND v.status = 'finalizada'
      ORDER BY v.criado_em DESC
      LIMIT 30`,
    [clienteId]
  );

  const { rows: contatos } = await consultar(
    `SELECT id, canal, motivo, oferta, observacao, resultado, usuario_id, criado_em
       FROM vendas.contatos_cliente
      WHERE cliente_id = $1
      ORDER BY criado_em DESC
      LIMIT 30`,
    [clienteId]
  );

  return { vendas, contatos };
}

export async function registrarContato({
  clienteId,
  usuarioId,
  canal,
  motivo,
  oferta,
  observacao,
  resultado,
}) {
  const { rows } = await consultar(
    `INSERT INTO vendas.contatos_cliente
       (cliente_id, usuario_id, canal, motivo, oferta, observacao, resultado)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::vendas.resultado_contato, 'aguardando'))
     RETURNING id, cliente_id, canal, motivo, oferta, observacao, resultado, criado_em`,
    [clienteId, usuarioId, canal, motivo, oferta ?? null, observacao ?? null, resultado ?? null]
  );
  return rows[0];
}

export async function atualizarResultadoContato({ contatoId, resultado, observacao }) {
  const { rows } = await consultar(
    `UPDATE vendas.contatos_cliente
        SET resultado = $2::vendas.resultado_contato,
            observacao = COALESCE($3, observacao)
      WHERE id = $1
      RETURNING id, cliente_id, canal, motivo, oferta, observacao, resultado, criado_em`,
    [contatoId, resultado, observacao ?? null]
  );
  return rows[0] ?? null;
}

/** Contatos recentes de todos os clientes — agenda do balcão. */
export async function listarContatos({ de, ate, resultado } = {}) {
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

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await consultar(
    `SELECT ct.id, ct.cliente_id, cl.nome AS cliente_nome, cl.telefone,
            ct.canal, ct.motivo, ct.oferta, ct.observacao, ct.resultado,
            ct.usuario_id, ct.criado_em
       FROM vendas.contatos_cliente ct
       JOIN vendas.clientes cl ON cl.id = ct.cliente_id
       ${onde}
      ORDER BY ct.criado_em DESC
      LIMIT 200`,
    valores
  );
  return rows;
}
