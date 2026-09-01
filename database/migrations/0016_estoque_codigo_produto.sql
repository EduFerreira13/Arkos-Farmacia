-- estoque-service — código do produto e mais categorias de farmácia.
--
-- O produto passa a ter um código curto e sequencial (PRD-00001), que é o que
-- a farmácia usa para conferir nota, etiqueta e contagem. Antes só existia o
-- UUID, que ninguém digita nem lê em voz alta.
-- Ref: docs/REGRAS-NEGOCIO.md §1 (cadastro de produto).

ALTER TABLE estoque.produtos
  ADD COLUMN IF NOT EXISTS codigo varchar(20);

-- Backfill em ordem de cadastro: o produto mais antigo fica com o menor código.
WITH numerados AS (
  SELECT id, row_number() OVER (ORDER BY criado_em, id) AS posicao
    FROM estoque.produtos
   WHERE codigo IS NULL
)
UPDATE estoque.produtos p
   SET codigo = 'PRD-' || lpad(n.posicao::text, 5, '0')
  FROM numerados n
 WHERE p.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo ON estoque.produtos(codigo);

COMMENT ON COLUMN estoque.produtos.codigo IS
  'Código sequencial legível (PRD-00001). Sugerido pelo serviço no cadastro e editável.';

-- §1: a categoria organiza o catálogo e a busca. Três opções eram poucas para
-- uma farmácia — estas cobrem o que costuma existir na gôndola.
INSERT INTO estoque.categorias (nome) VALUES
  ('Medicamento genérico'),
  ('Medicamento similar'),
  ('Medicamento de referência'),
  ('Medicamento manipulado'),
  ('Fitoterápico'),
  ('Homeopatia'),
  ('Dermocosmético'),
  ('Vitaminas e suplementos'),
  ('Materiais e curativos'),
  ('Ortopédicos'),
  ('Higiene bucal'),
  ('Infantil e maternidade'),
  ('Nutrição'),
  ('Veterinário'),
  ('Conveniência')
ON CONFLICT (nome) DO NOTHING;
