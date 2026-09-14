-- vendas-service — auditoria de quem resolveu uma conferência de estoque
-- pendente (Fase 6 do PDV offline: tela de conferência gerencial).
--
-- REGRAS-NEGOCIO.md §6 exige que toda ação sensível fique registrada com o
-- usuário responsável. Marcar uma venda como conferida (POST
-- /vendas/:id/conferir-estoque) é ação de gerente, então guarda quem e quando
-- resolveu — não é só um UPDATE de flag para false.
-- Ref: docs/PLANO-DE-CONSTRUCAO.md (PDV offline), docs/API-CONTRATOS.md,
-- docs/PENDENCIAS.md.

ALTER TABLE vendas.vendas
  ADD COLUMN IF NOT EXISTS conferencia_resolvida_por uuid,
  ADD COLUMN IF NOT EXISTS conferencia_resolvida_em timestamptz;

COMMENT ON COLUMN vendas.vendas.conferencia_resolvida_por IS
  'usuario_id de quem marcou a conferência de estoque como resolvida (POST /vendas/:id/conferir-estoque). Null enquanto pendente ou se a venda nunca teve conferência pendente.';
COMMENT ON COLUMN vendas.vendas.conferencia_resolvida_em IS
  'Quando a conferência de estoque foi resolvida. Null enquanto pendente ou se a venda nunca teve conferência pendente.';
