-- financeiro-service — descrição e rastreio da origem no lançamento de caixa.
-- Ref: docs/REGRAS-NEGOCIO.md §5 (fluxo de caixa diário e conferência do
-- fechamento) e docs/MODELO-DADOS.md (referência entre serviços é por ID,
-- sem FK cruzando schema).

ALTER TABLE financeiro.movimentacoes_caixa
  ADD COLUMN IF NOT EXISTS descricao  varchar(200),
  ADD COLUMN IF NOT EXISTS venda_id   uuid;

COMMENT ON COLUMN financeiro.movimentacoes_caixa.venda_id IS
  'ID da venda que gerou o lançamento (schema vendas). Sem FK: outro serviço.';

CREATE INDEX IF NOT EXISTS idx_mov_caixa_venda
  ON financeiro.movimentacoes_caixa(venda_id);
