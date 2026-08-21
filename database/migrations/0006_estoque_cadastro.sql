-- estoque-service — campos de cadastro exigidos pelas regras de negócio que
-- não estavam na modelagem inicial, e histórico de preço.
-- Ref: docs/REGRAS-NEGOCIO.md §1 (campos obrigatórios do produto, classe
-- terapêutica de controlados, venda sob encomenda), §7 (NCM/CFOP previstos no
-- cadastro) e §8 (toda alteração de preço fica registrada).

ALTER TABLE estoque.produtos
  ADD COLUMN IF NOT EXISTS fabricante          varchar(150),
  ADD COLUMN IF NOT EXISTS classe_terapeutica  varchar(100),
  ADD COLUMN IF NOT EXISTS unidade_venda       varchar(20) NOT NULL DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS ncm                 varchar(10),
  ADD COLUMN IF NOT EXISTS cfop                varchar(5),
  ADD COLUMN IF NOT EXISTS venda_sob_encomenda boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN estoque.produtos.classe_terapeutica IS
  'Obrigatória para controlados (§1): psicotrópico, antibiótico, tarja preta, etc.';
COMMENT ON COLUMN estoque.produtos.venda_sob_encomenda IS
  'Quando true, o PDV libera a venda mesmo sem estoque disponível (§1).';

-- §8: histórico de preço — quem mudou, de quanto para quanto, quando.
CREATE TABLE IF NOT EXISTS estoque.historico_precos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      uuid NOT NULL REFERENCES estoque.produtos(id),
  campo           varchar(20) NOT NULL, -- preco_custo | preco_venda
  valor_anterior  numeric(10,2) NOT NULL,
  valor_novo      numeric(10,2) NOT NULL,
  usuario_id      uuid NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_precos_produto
  ON estoque.historico_precos(produto_id, criado_em DESC);

-- Categorias padrão do §1 — domínio fixo, já disponível no cadastro.
INSERT INTO estoque.categorias (nome) VALUES
  ('Medicamento'),
  ('Perfumaria e Higiene'),
  ('Correlatos')
ON CONFLICT (nome) DO NOTHING;

-- §2: produto vencido está bloqueado para venda, então lote vencido não conta
-- como estoque disponível no alerta de estoque baixo.
CREATE OR REPLACE VIEW estoque.vw_estoque_baixo AS
SELECT
  p.id AS produto_id,
  p.nome,
  p.estoque_minimo,
  COALESCE(SUM(l.quantidade), 0) AS quantidade_atual
FROM estoque.produtos p
LEFT JOIN estoque.lotes l
       ON l.produto_id = p.id
      AND l.data_validade >= current_date
GROUP BY p.id, p.nome, p.estoque_minimo
HAVING COALESCE(SUM(l.quantidade), 0) <= p.estoque_minimo;
