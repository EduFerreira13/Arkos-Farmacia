import { consultar } from "./db.js";

/**
 * Consultas de leitura do schema `vendas`: histórico com filtros, cadastro de
 * clientes, receitas retidas e a análise que alimenta os relatórios.
 *
 * Fica separado de `repositorio.js`, que cuida do ciclo de vida da venda.
 */

/**
 * Histórico de vendas com filtros (período, status, controlado e texto livre em
 * produto, paciente ou cliente). Sem período informado, traz o dia de hoje.
 */
export async function listarVendas({ de, ate, status, controlado, busca, limite = 300 } = {}) {
  const condicoes = [];
  const valores = [];

  if (de) {
    valores.push(de);
    condicoes.push(`v.criado_em::date >= $${valores.length}::date`);
  }
  if (ate) {
    valores.push(ate);
    condicoes.push(`v.criado_em::date <= $${valores.length}::date`);
  }
  if (!de && !ate) condicoes.push(`v.criado_em::date = current_date`);

  if (status) {
    valores.push(status);
    condicoes.push(`v.status = $${valores.length}::vendas.status_venda`);
  }

  if (controlado === "sim" || controlado === "nao") {
    const existe = `EXISTS (SELECT 1 FROM vendas.itens_venda i
                             WHERE i.venda_id = v.id AND i.tipo_controle <> 'livre')`;
    condicoes.push(controlado === "sim" ? existe : `NOT ${existe}`);
  }

  if (busca) {
    valores.push(`%${busca}%`);
    const parametro = `$${valores.length}`;
    condicoes.push(`(
      EXISTS (SELECT 1 FROM vendas.itens_venda i
               WHERE i.venda_id = v.id AND i.produto_nome ILIKE ${parametro})
      OR EXISTS (SELECT 1 FROM vendas.receitas r
                  WHERE r.venda_id = v.id AND r.paciente_nome ILIKE ${parametro})
      OR c.nome ILIKE ${parametro}
    )`);
  }

  valores.push(Math.min(Number(limite) || 300, 1000));

  const { rows } = await consultar(
    `SELECT v.id, v.numero, v.usuario_id, v.status, v.valor_total, v.desconto, v.criado_em,
            v.motivo_cancelamento, v.categoria_cancelamento, v.cliente_id, c.nome AS cliente_nome,
            (SELECT COUNT(*) FROM vendas.itens_venda i WHERE i.venda_id = v.id)::int AS total_itens,
            (SELECT SUM(i.quantidade) FROM vendas.itens_venda i WHERE i.venda_id = v.id)::int
              AS total_unidades,
            (SELECT string_agg(DISTINCT p.forma_pagamento, ' + ')
               FROM vendas.pagamentos p WHERE p.venda_id = v.id) AS formas_pagamento,
            EXISTS (SELECT 1 FROM vendas.itens_venda i
                     WHERE i.venda_id = v.id AND i.tipo_controle <> 'livre') AS tem_controlado,
            (SELECT r.paciente_nome FROM vendas.receitas r WHERE r.venda_id = v.id) AS paciente_nome
       FROM vendas.vendas v
       LEFT JOIN vendas.clientes c ON c.id = v.cliente_id
      WHERE ${condicoes.join(" AND ")}
      ORDER BY v.criado_em DESC
      LIMIT $${valores.length}`,
    valores
  );
  return rows;
}

// -------------------------------------------------------------------- clientes

/**
 * Clientes com o resumo de compra de cada um. Os filtros são os mesmos da tela
 * (e do relatório): busca livre, convênio, e piso de compras e de valor gasto —
 * é assim que se separa quem sustenta a farmácia de quem passou uma vez.
 *
 * @param {{ busca?: string, convenio?: string, min_compras?: number,
 *   min_valor?: number, ordenar?: "nome"|"compras"|"valor" }} filtros
 */
export async function listarClientes({ busca, convenio, min_compras, min_valor, ordenar } = {}) {
  const condicoes = [];
  const valores = [];

  if (busca) {
    valores.push(`%${busca}%`);
    condicoes.push(
      `(cl.nome ILIKE $${valores.length} OR cl.cpf ILIKE $${valores.length}
        OR cl.convenio ILIKE $${valores.length} OR cl.telefone ILIKE $${valores.length}
        OR cl.email ILIKE $${valores.length})`
    );
  }

  // "particular" é a ausência de convênio, não um convênio chamado assim.
  if (convenio === "particular") condicoes.push(`cl.convenio IS NULL`);
  else if (convenio === "com_convenio") condicoes.push(`cl.convenio IS NOT NULL`);
  else if (convenio) {
    valores.push(convenio);
    condicoes.push(`cl.convenio = $${valores.length}`);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  // Compras e valor gasto são agregados: filtram no HAVING, não no WHERE.
  const tendo = [];
  if (Number.isFinite(Number(min_compras)) && Number(min_compras) > 0) {
    valores.push(Number(min_compras));
    tendo.push(`compras.total_compras >= $${valores.length}`);
  }
  if (Number.isFinite(Number(min_valor)) && Number(min_valor) > 0) {
    valores.push(Number(min_valor));
    tendo.push(`compras.total_gasto >= $${valores.length}`);
  }

  const ORDENS = {
    nome: "cl.nome",
    compras: "compras.total_compras DESC, cl.nome",
    valor: "compras.total_gasto DESC, cl.nome",
  };

  const { rows } = await consultar(
    `SELECT cl.id, cl.nome, cl.cpf, cl.telefone, cl.email, cl.convenio, cl.observacao,
            cl.endereco, cl.ativo, cl.aceita_contato, cl.data_nascimento, cl.criado_em,
            compras.total_compras, compras.total_gasto, compras.ultima_compra
       FROM vendas.clientes cl
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS total_compras,
                COALESCE(SUM(v.valor_total), 0) AS total_gasto,
                MAX(v.criado_em) AS ultima_compra
           FROM vendas.vendas v
          WHERE v.cliente_id = cl.id AND v.status = 'finalizada'
       ) compras
       ${onde}
       ${tendo.length ? `${onde ? "AND" : "WHERE"} ${tendo.join(" AND ")}` : ""}
      ORDER BY ${ORDENS[ordenar] ?? ORDENS.nome}
      LIMIT 300`,
    valores
  );
  return rows;
}

export async function inserirCliente(dados) {
  const { rows } = await consultar(
    `INSERT INTO vendas.clientes
       (nome, cpf, telefone, email, convenio, observacao, endereco, data_nascimento,
        aceita_contato)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, true))
     RETURNING id, nome, cpf, telefone, email, convenio, observacao, endereco, ativo,
               aceita_contato, data_nascimento, criado_em`,
    [
      dados.nome,
      dados.cpf ?? null,
      dados.telefone ?? null,
      dados.email ?? null,
      dados.convenio ?? null,
      dados.observacao ?? null,
      dados.endereco ?? null,
      dados.data_nascimento ?? null,
      dados.aceita_contato ?? null,
    ]
  );
  return rows[0];
}

const CAMPOS_CLIENTE = [
  "nome",
  "cpf",
  "telefone",
  "email",
  "convenio",
  "observacao",
  "endereco",
  "ativo",
  "aceita_contato",
  "data_nascimento",
];

export async function atualizarCliente(id, campos) {
  const partes = [];
  const valores = [];

  for (const campo of CAMPOS_CLIENTE) {
    if (campos[campo] === undefined) continue;
    valores.push(campos[campo]);
    partes.push(`${campo} = $${valores.length}`);
  }
  if (!partes.length) return null;

  valores.push(id);
  const { rows } = await consultar(
    `UPDATE vendas.clientes SET ${partes.join(", ")}
      WHERE id = $${valores.length}
      RETURNING id, nome, cpf, telefone, email, convenio, observacao, endereco, ativo,
                aceita_contato, data_nascimento, criado_em`,
    valores
  );
  return rows[0] ?? null;
}

export async function vincularCliente({ vendaId, clienteId }) {
  const { rows } = await consultar(
    `UPDATE vendas.vendas SET cliente_id = $2 WHERE id = $1 RETURNING id, cliente_id`,
    [vendaId, clienteId]
  );
  return rows[0] ?? null;
}

export async function removerPagamento({ vendaId, pagamentoId }) {
  const { rowCount } = await consultar(
    `DELETE FROM vendas.pagamentos WHERE id = $1 AND venda_id = $2`,
    [pagamentoId, vendaId]
  );
  return rowCount > 0;
}

// ---------------------------------------------------------- receitas retidas

/** Receitas vinculadas a venda — base da tela fiscal/regulatória (§3 e §7). */
export async function listarReceitas({ de, ate, busca } = {}) {
  const condicoes = [];
  const valores = [];

  if (de) {
    valores.push(de);
    condicoes.push(`v.criado_em::date >= $${valores.length}::date`);
  }
  if (ate) {
    valores.push(ate);
    condicoes.push(`v.criado_em::date <= $${valores.length}::date`);
  }
  if (busca) {
    valores.push(`%${busca}%`);
    const parametro = `$${valores.length}`;
    condicoes.push(
      `(r.paciente_nome ILIKE ${parametro} OR r.medico_nome ILIKE ${parametro}
        OR r.medico_crm ILIKE ${parametro})`
    );
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await consultar(
    `SELECT r.id, r.venda_id, r.medico_nome, r.medico_crm, r.paciente_nome, r.data_emissao,
            v.status AS status_venda, v.criado_em AS vendido_em, v.valor_total,
            (SELECT string_agg(i.produto_nome, ' | ' ORDER BY i.produto_nome)
               FROM vendas.itens_venda i
              WHERE i.venda_id = v.id AND i.tipo_controle <> 'livre') AS itens_controlados,
            (SELECT string_agg(DISTINCT i.tipo_controle, ', ')
               FROM vendas.itens_venda i
              WHERE i.venda_id = v.id AND i.tipo_controle <> 'livre') AS tipos_controle
       FROM vendas.receitas r
       JOIN vendas.vendas v ON v.id = r.venda_id
       ${onde}
      ORDER BY v.criado_em DESC
      LIMIT 300`,
    valores
  );
  return rows;
}

// ------------------------------------------------------------------- análise

/**
 * Vendas do período agrupadas por produto e por dia. O custo do produto vive no
 * estoque-service, então margem e curva ABC são calculadas por quem monta a
 * tela, cruzando estes números com o catálogo.
 */
export async function analisarVendas({ de, ate }) {
  // Quatro leituras independentes: em paralelo, o relatório abre bem mais rápido.
  const [{ rows: porProduto }, { rows: porDia }, { rows: porForma }, { rows: totais }] =
    await Promise.all([
      consultar(
    `SELECT i.produto_id, i.produto_nome, i.tipo_controle,
            SUM(i.quantidade)::int AS unidades,
            COUNT(DISTINCT i.venda_id)::int AS vendas,
            SUM(i.quantidade * i.preco_unitario) AS receita,
            AVG(i.preco_unitario) AS preco_medio
       FROM vendas.itens_venda i
       JOIN vendas.vendas v ON v.id = i.venda_id
      WHERE v.status = 'finalizada'
        AND v.criado_em::date BETWEEN $1::date AND $2::date
        GROUP BY i.produto_id, i.produto_nome, i.tipo_controle
        ORDER BY receita DESC`,
        [de, ate]
      ),
      consultar(
    `SELECT v.criado_em::date AS dia,
            COUNT(*)::int AS vendas,
            COALESCE(SUM(v.valor_total), 0) AS valor,
            COALESCE(AVG(v.valor_total), 0) AS ticket_medio
       FROM vendas.vendas v
      WHERE v.status = 'finalizada'
        AND v.criado_em::date BETWEEN $1::date AND $2::date
        GROUP BY 1
        ORDER BY 1`,
        [de, ate]
      ),
      consultar(
    `SELECT p.forma_pagamento, SUM(p.valor) AS valor, COUNT(*)::int AS quantidade
       FROM vendas.pagamentos p
       JOIN vendas.vendas v ON v.id = p.venda_id
      WHERE v.status = 'finalizada'
        AND v.criado_em::date BETWEEN $1::date AND $2::date
        GROUP BY p.forma_pagamento
        ORDER BY valor DESC`,
        [de, ate]
      ),
      consultar(
    `SELECT COUNT(*)::int AS vendas,
            COALESCE(SUM(valor_total), 0) AS valor,
            COALESCE(SUM(desconto), 0) AS descontos,
            COALESCE(AVG(valor_total), 0) AS ticket_medio
       FROM vendas.vendas
        WHERE status = 'finalizada' AND criado_em::date BETWEEN $1::date AND $2::date`,
        [de, ate]
      ),
    ]);

  return {
    por_produto: porProduto,
    por_dia: porDia,
    por_forma_pagamento: porForma,
    totais: totais[0],
  };
}
