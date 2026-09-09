import { consultar, emTransacao } from "../../db.js";

/**
 * Acesso ao schema `estoque`. Nenhum outro serviço lê estas tabelas — quem
 * precisa de produto/lote pergunta pela API (docs/ARQUITETURA.md).
 *
 * `quantidade_atual` sempre ignora lote vencido: produto vencido está
 * bloqueado para venda (docs/REGRAS-NEGOCIO.md §2).
 */

const SELECT_PRODUTO = `
  SELECT p.id, p.codigo, p.nome, p.principio_ativo, p.fabricante, p.classe_terapeutica,
         p.codigo_barras, p.tipo_controle, p.unidade_venda, p.ncm, p.cfop,
         p.preco_custo, p.preco_venda, p.estoque_minimo, p.venda_sob_encomenda,
         p.dias_de_uso,
         p.categoria_id, c.nome AS categoria_nome,
         p.fornecedor_id, f.nome AS fornecedor_nome,
         p.criado_em,
         COALESCE((
           SELECT SUM(l.quantidade) FROM estoque.lotes l
            WHERE l.produto_id = p.id AND l.data_validade >= current_date
         ), 0)::int AS quantidade_atual
    FROM estoque.produtos p
    LEFT JOIN estoque.categorias c ON c.id = p.categoria_id
    LEFT JOIN estoque.fornecedores f ON f.id = p.fornecedor_id
`;

/**
 * @param {{ nome?: string, codigo_barras?: string, categoria_id?: string, tipo_controle?: string }} filtros
 */
export async function listarProdutos(filtros = {}) {
  const condicoes = [];
  const valores = [];

  if (filtros.nome) {
    valores.push(`%${filtros.nome}%`);
    condicoes.push(
      `(p.nome ILIKE $${valores.length} OR p.principio_ativo ILIKE $${valores.length}
        OR p.codigo ILIKE $${valores.length} OR p.fabricante ILIKE $${valores.length}
        OR p.codigo_barras ILIKE $${valores.length})`
    );
  }
  if (filtros.codigo_barras) {
    valores.push(filtros.codigo_barras);
    condicoes.push(`p.codigo_barras = $${valores.length}`);
  }
  if (filtros.categoria_id) {
    valores.push(filtros.categoria_id);
    condicoes.push(`p.categoria_id = $${valores.length}`);
  }
  if (filtros.tipo_controle) {
    valores.push(filtros.tipo_controle);
    condicoes.push(`p.tipo_controle = $${valores.length}`);
  }

  // Inventário e perda contam o que existe: produto sem lote válido não entra.
  if (filtros.com_saldo) {
    condicoes.push(`EXISTS (
      SELECT 1 FROM estoque.lotes l
       WHERE l.produto_id = p.id AND l.quantidade > 0 AND l.data_validade >= current_date
    )`);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await consultar(`${SELECT_PRODUTO} ${onde} ORDER BY p.codigo`, valores);
  return rows;
}

/**
 * Próximo código sugerido no cadastro (PRD-00001, PRD-00002...). Sai do maior
 * código já usado, não de uma sequência: assim o número que a tela mostra é o
 * que a pessoa vê na lista, sem buracos por cadastro abandonado.
 */
export async function proximoCodigoProduto() {
  const { rows } = await consultar(
    `SELECT COALESCE(MAX(substring(codigo from '[0-9]+$')::int), 0) + 1 AS proximo
       FROM estoque.produtos
      WHERE codigo ~ '^PRD-[0-9]+$'`
  );
  return `PRD-${String(rows[0].proximo).padStart(5, "0")}`;
}

export async function buscarProduto(id) {
  const { rows } = await consultar(`${SELECT_PRODUTO} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function buscarProdutoPorCodigoBarras(codigo) {
  const { rows } = await consultar(`${SELECT_PRODUTO} WHERE p.codigo_barras = $1`, [codigo]);
  return rows[0] ?? null;
}

export async function inserirProduto(dados) {
  const { rows } = await consultar(
    `INSERT INTO estoque.produtos
       (codigo, nome, principio_ativo, fabricante, classe_terapeutica, codigo_barras,
        tipo_controle, unidade_venda, ncm, cfop, preco_custo, preco_venda,
        estoque_minimo, venda_sob_encomenda, categoria_id, fornecedor_id, dias_de_uso)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      dados.codigo,
      dados.nome,
      dados.principio_ativo ?? null,
      dados.fabricante ?? null,
      dados.classe_terapeutica ?? null,
      dados.codigo_barras ?? null,
      dados.tipo_controle,
      dados.unidade_venda,
      dados.ncm ?? null,
      dados.cfop ?? null,
      dados.preco_custo,
      dados.preco_venda,
      dados.estoque_minimo,
      dados.venda_sob_encomenda ?? false,
      dados.categoria_id ?? null,
      dados.fornecedor_id ?? null,
      dados.dias_de_uso ?? null,
    ]
  );
  return buscarProduto(rows[0].id);
}

const CAMPOS_ATUALIZAVEIS = [
  "codigo",
  "nome",
  "principio_ativo",
  "fabricante",
  "classe_terapeutica",
  "codigo_barras",
  "tipo_controle",
  "unidade_venda",
  "ncm",
  "cfop",
  "preco_custo",
  "preco_venda",
  "estoque_minimo",
  "venda_sob_encomenda",
  "categoria_id",
  "fornecedor_id",
  "dias_de_uso",
];

/**
 * Atualiza o produto e registra histórico das mudanças de preço (§8),
 * tudo na mesma transação.
 */
export async function atualizarProduto(id, campos, usuarioId) {
  return emTransacao(async (cliente) => {
    const { rows: atuais } = await cliente.query(
      `SELECT preco_custo, preco_venda FROM estoque.produtos WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!atuais.length) return null;
    const atual = atuais[0];

    const partes = [];
    const valores = [];
    for (const campo of CAMPOS_ATUALIZAVEIS) {
      if (campos[campo] === undefined) continue;
      valores.push(campos[campo]);
      partes.push(`${campo} = $${valores.length}`);
    }

    if (partes.length) {
      valores.push(id);
      await cliente.query(
        `UPDATE estoque.produtos SET ${partes.join(", ")} WHERE id = $${valores.length}`,
        valores
      );
    }

    for (const campo of ["preco_custo", "preco_venda"]) {
      if (campos[campo] === undefined) continue;
      const anterior = Number(atual[campo]);
      const novo = Number(campos[campo]);
      if (anterior === novo) continue;
      await cliente.query(
        `INSERT INTO estoque.historico_precos
           (produto_id, campo, valor_anterior, valor_novo, usuario_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, campo, anterior, novo, usuarioId]
      );
    }

    return id;
  }).then((resultado) => (resultado ? buscarProduto(id) : null));
}

export async function listarHistoricoPrecos(produtoId) {
  const { rows } = await consultar(
    `SELECT id, campo, valor_anterior, valor_novo, usuario_id, criado_em
       FROM estoque.historico_precos
      WHERE produto_id = $1
      ORDER BY criado_em DESC`,
    [produtoId]
  );
  return rows;
}

export async function listarLotes(produtoId) {
  const { rows } = await consultar(
    `SELECT id, produto_id, numero_lote, quantidade, data_validade, data_entrada,
            (data_validade < current_date) AS vencido
       FROM estoque.lotes
      WHERE produto_id = $1
      ORDER BY data_validade`,
    [produtoId]
  );
  return rows;
}

export async function listarCategorias() {
  const { rows } = await consultar(`SELECT id, nome FROM estoque.categorias ORDER BY nome`);
  return rows;
}

export async function inserirCategoria(nome) {
  const { rows } = await consultar(
    `INSERT INTO estoque.categorias (nome) VALUES ($1)
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id, nome`,
    [nome]
  );
  return rows[0];
}

/** @param {{ busca?: string }} filtros nome, CNPJ, telefone ou email */
export async function listarFornecedores({ busca } = {}) {
  const valores = [];
  let onde = "";
  if (busca) {
    valores.push(`%${busca}%`);
    onde = `WHERE f.nome ILIKE $1 OR f.cnpj ILIKE $1 OR f.telefone ILIKE $1 OR f.email ILIKE $1`;
  }

  const { rows } = await consultar(
    `SELECT f.id, f.nome, f.cnpj, f.telefone, f.email,
            (SELECT COUNT(*) FROM estoque.produtos p WHERE p.fornecedor_id = f.id)::int
              AS total_produtos
       FROM estoque.fornecedores f
       ${onde}
      ORDER BY f.nome`,
    valores
  );
  return rows;
}

export async function inserirFornecedor(dados) {
  const { rows } = await consultar(
    `INSERT INTO estoque.fornecedores (nome, cnpj, telefone, email)
          VALUES ($1, $2, $3, $4)
       RETURNING id, nome, cnpj, telefone, email`,
    [dados.nome, dados.cnpj ?? null, dados.telefone ?? null, dados.email ?? null]
  );
  return rows[0];
}

export async function listarEstoqueBaixo() {
  const { rows } = await consultar(
    `SELECT produto_id, nome, estoque_minimo, quantidade_atual::int AS quantidade_atual
       FROM estoque.vw_estoque_baixo
      ORDER BY quantidade_atual, nome`
  );
  return rows;
}

/** @param {number} dias janela do alerta — 90, 60 ou 30 (§2, configurável) */
export async function listarProdutosAVencer(dias) {
  const { rows } = await consultar(
    `SELECT lote_id, produto_id, nome, numero_lote, quantidade,
            data_validade, dias_para_vencer
       FROM estoque.vw_produtos_a_vencer
      WHERE dias_para_vencer <= $1
      ORDER BY data_validade`,
    [dias]
  );
  return rows;
}

/**
 * Histórico de movimentação com os mesmos filtros da tela: tipo, produto,
 * período e busca livre por produto, lote ou motivo.
 */
export async function listarMovimentacoes({ produtoId, tipo, de, ate, busca, limite = 100 }) {
  const condicoes = [];
  const valores = [];

  if (produtoId) {
    valores.push(produtoId);
    condicoes.push(`m.produto_id = $${valores.length}`);
  }
  if (tipo) {
    valores.push(tipo);
    condicoes.push(`m.tipo = $${valores.length}`);
  }
  if (de) {
    valores.push(de);
    condicoes.push(`m.criado_em::date >= $${valores.length}::date`);
  }
  if (ate) {
    valores.push(ate);
    condicoes.push(`m.criado_em::date <= $${valores.length}::date`);
  }
  if (busca) {
    valores.push(`%${busca}%`);
    condicoes.push(
      `(p.nome ILIKE $${valores.length} OR p.codigo ILIKE $${valores.length}
        OR m.motivo ILIKE $${valores.length} OR l.numero_lote ILIKE $${valores.length})`
    );
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  valores.push(limite);

  const { rows } = await consultar(
    `SELECT m.id, m.produto_id, p.codigo AS produto_codigo, p.nome AS produto_nome,
            m.lote_id, l.numero_lote, l.data_validade, m.tipo,
            m.quantidade, m.motivo, m.usuario_id, m.criado_em
       FROM estoque.movimentacoes_estoque m
       JOIN estoque.produtos p ON p.id = m.produto_id
       LEFT JOIN estoque.lotes l ON l.id = m.lote_id
       ${onde}
      ORDER BY m.criado_em DESC
      LIMIT $${valores.length}`,
    valores
  );
  return rows;
}

/**
 * Posição de estoque por produto — base do relatório em planilha. Aceita os
 * mesmos filtros da tela, para o arquivo sair com o que está sendo visto.
 */
export async function listarPosicaoEstoque(filtros = {}) {
  const condicoes = [];
  const valores = [];

  if (filtros.busca) {
    valores.push(`%${filtros.busca}%`);
    condicoes.push(
      `(p.nome ILIKE $${valores.length} OR p.principio_ativo ILIKE $${valores.length}
        OR p.codigo ILIKE $${valores.length} OR p.fabricante ILIKE $${valores.length}
        OR p.codigo_barras ILIKE $${valores.length})`
    );
  }
  if (filtros.tipo_controle) {
    valores.push(filtros.tipo_controle);
    condicoes.push(`p.tipo_controle = $${valores.length}`);
  }
  if (filtros.categoria_id) {
    valores.push(filtros.categoria_id);
    condicoes.push(`p.categoria_id = $${valores.length}`);
  }
  if (filtros.com_saldo) {
    condicoes.push(`EXISTS (
      SELECT 1 FROM estoque.lotes lx
       WHERE lx.produto_id = p.id AND lx.quantidade > 0 AND lx.data_validade >= current_date
    )`);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const { rows } = await consultar(
    `SELECT p.codigo, p.nome, p.principio_ativo, p.fabricante, p.tipo_controle,
            p.classe_terapeutica, p.unidade_venda, p.codigo_barras,
            c.nome AS categoria_nome, f.nome AS fornecedor_nome,
            p.preco_custo, p.preco_venda, p.estoque_minimo,
            COALESCE(SUM(CASE WHEN l.data_validade >= current_date THEN l.quantidade END), 0)::int
              AS saldo_disponivel,
            COALESCE(SUM(CASE WHEN l.data_validade <  current_date THEN l.quantidade END), 0)::int
              AS saldo_vencido,
            MIN(CASE WHEN l.data_validade >= current_date AND l.quantidade > 0
                     THEN l.data_validade END) AS proxima_validade
       FROM estoque.produtos p
       LEFT JOIN estoque.categorias c ON c.id = p.categoria_id
       LEFT JOIN estoque.fornecedores f ON f.id = p.fornecedor_id
       LEFT JOIN estoque.lotes l ON l.produto_id = p.id
       ${onde}
      GROUP BY p.id, p.codigo, p.nome, p.principio_ativo, p.fabricante, p.tipo_controle,
               p.classe_terapeutica, p.unidade_venda, p.codigo_barras,
               c.nome, f.nome, p.preco_custo, p.preco_venda, p.estoque_minimo
      ORDER BY p.codigo`,
    valores
  );
  return rows;
}

/**
 * Movimentações de um período, para auditoria em planilha.
 * @param {{ de: string, ate: string }} intervalo
 */
export async function listarMovimentacoesNoPeriodo({ de, ate, tipo, produto_id, busca }) {
  const valores = [de, ate];
  const condicoes = [`m.criado_em::date BETWEEN $1::date AND $2::date`];

  if (tipo) {
    valores.push(tipo);
    condicoes.push(`m.tipo = $${valores.length}`);
  }
  if (produto_id) {
    valores.push(produto_id);
    condicoes.push(`m.produto_id = $${valores.length}`);
  }
  if (busca) {
    valores.push(`%${busca}%`);
    condicoes.push(
      `(p.nome ILIKE $${valores.length} OR p.codigo ILIKE $${valores.length}
        OR m.motivo ILIKE $${valores.length} OR l.numero_lote ILIKE $${valores.length})`
    );
  }

  const { rows } = await consultar(
    `SELECT m.criado_em, m.tipo, m.quantidade, m.motivo, m.usuario_id,
            p.codigo AS produto_codigo, p.nome AS produto_nome, p.tipo_controle,
            l.numero_lote, l.data_validade
       FROM estoque.movimentacoes_estoque m
       JOIN estoque.produtos p ON p.id = m.produto_id
       LEFT JOIN estoque.lotes l ON l.id = m.lote_id
      WHERE ${condicoes.join(" AND ")}
      ORDER BY m.criado_em`,
    valores
  );
  return rows;
}

const CAMPOS_FORNECEDOR = ["nome", "cnpj", "telefone", "email"];

export async function atualizarFornecedor(id, campos) {
  const partes = [];
  const valores = [];

  for (const campo of CAMPOS_FORNECEDOR) {
    if (campos[campo] === undefined) continue;
    valores.push(campos[campo]);
    partes.push(`${campo} = $${valores.length}`);
  }
  if (!partes.length) return null;

  valores.push(id);
  const { rows } = await consultar(
    `UPDATE estoque.fornecedores SET ${partes.join(", ")}
      WHERE id = $${valores.length}
      RETURNING id, nome, cnpj, telefone, email`,
    valores
  );
  return rows[0] ?? null;
}
