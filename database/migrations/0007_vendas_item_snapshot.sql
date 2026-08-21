-- vendas-service — o item da venda guarda o nome e o tipo de controle do
-- produto no momento da venda.
-- Ref: docs/REGRAS-NEGOCIO.md §3 (a venda é o registro do que foi vendido) e
-- docs/ARQUITETURA.md (vendas não lê o schema de estoque para imprimir cupom).

ALTER TABLE vendas.itens_venda
  ADD COLUMN IF NOT EXISTS produto_nome   varchar(200),
  ADD COLUMN IF NOT EXISTS tipo_controle  varchar(20);

COMMENT ON COLUMN vendas.itens_venda.tipo_controle IS
  'Cópia do tipo_controle do produto na hora da venda — base da trava de receita (§3).';

-- O lote definitivo só é conhecido na baixa FEFO, que acontece ao finalizar;
-- e produto com venda sob encomenda pode não ter lote nenhum.
ALTER TABLE vendas.itens_venda
  ALTER COLUMN lote_id DROP NOT NULL;
