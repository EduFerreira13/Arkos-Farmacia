-- estoque-service — produtos, lotes, movimentações
-- Ref: docs/REGRAS-NEGOCIO.md §1-2, docs/MODELO-DADOS.md

CREATE SCHEMA IF NOT EXISTS estoque;

CREATE TYPE estoque.tipo_controle AS ENUM ('livre', 'tarja_vermelha', 'tarja_preta');
CREATE TYPE estoque.tipo_movimentacao AS ENUM ('entrada', 'saida', 'ajuste', 'perda', 'devolucao');

CREATE TABLE estoque.categorias (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome   varchar(100) UNIQUE NOT NULL
);

CREATE TABLE estoque.fornecedores (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      varchar(150) NOT NULL,
  cnpj      varchar(18) UNIQUE,
  telefone  varchar(20),
  email     varchar(150)
);

CREATE TABLE estoque.produtos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id      uuid REFERENCES estoque.categorias(id),
  fornecedor_id     uuid REFERENCES estoque.fornecedores(id),
  nome              varchar(200) NOT NULL,
  principio_ativo   varchar(200),
  codigo_barras     varchar(20) UNIQUE,
  tipo_controle     estoque.tipo_controle NOT NULL DEFAULT 'livre',
  preco_custo       numeric(10,2) NOT NULL DEFAULT 0,
  preco_venda       numeric(10,2) NOT NULL DEFAULT 0,
  estoque_minimo    int NOT NULL DEFAULT 0,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE estoque.lotes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id     uuid NOT NULL REFERENCES estoque.produtos(id),
  numero_lote    varchar(50) NOT NULL,
  quantidade     int NOT NULL DEFAULT 0,
  data_validade  date NOT NULL,
  data_entrada   date NOT NULL DEFAULT current_date
);

CREATE TABLE estoque.movimentacoes_estoque (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id   uuid NOT NULL REFERENCES estoque.produtos(id),
  lote_id      uuid REFERENCES estoque.lotes(id),
  tipo         estoque.tipo_movimentacao NOT NULL,
  quantidade   int NOT NULL,
  motivo       text,
  usuario_id   uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_produtos_categoria ON estoque.produtos(categoria_id);
CREATE INDEX idx_produtos_codigo_barras ON estoque.produtos(codigo_barras);
-- Suporta a regra FEFO: buscar o lote de menor validade por produto
CREATE INDEX idx_lotes_produto_validade ON estoque.lotes(produto_id, data_validade);
CREATE INDEX idx_movimentacoes_produto_data ON estoque.movimentacoes_estoque(produto_id, criado_em);

-- View: estoque baixo (para o dashboard, §8)
CREATE VIEW estoque.vw_estoque_baixo AS
SELECT
  p.id AS produto_id,
  p.nome,
  p.estoque_minimo,
  COALESCE(SUM(l.quantidade), 0) AS quantidade_atual
FROM estoque.produtos p
LEFT JOIN estoque.lotes l ON l.produto_id = p.id
GROUP BY p.id, p.nome, p.estoque_minimo
HAVING COALESCE(SUM(l.quantidade), 0) <= p.estoque_minimo;

-- View: produtos a vencer em até 90 dias (para o dashboard, §2)
CREATE VIEW estoque.vw_produtos_a_vencer AS
SELECT
  l.id AS lote_id,
  p.id AS produto_id,
  p.nome,
  l.numero_lote,
  l.quantidade,
  l.data_validade,
  (l.data_validade - current_date) AS dias_para_vencer
FROM estoque.lotes l
JOIN estoque.produtos p ON p.id = l.produto_id
WHERE l.data_validade <= current_date + interval '90 days'
  AND l.quantidade > 0
ORDER BY l.data_validade ASC;
