-- vendas-service — suporte à sincronização de vendas feitas offline no PDV.
--
-- `origem_sincronizacao` distingue uma venda que nasceu com o operador
-- conectado (fluxo incremental de sempre) de uma que foi montada no PDV sem
-- rede e só chegou ao servidor depois, via POST /vendas/sincronizar-offline.
--
-- `estoque_conferencia_pendente` sinaliza, para o gerente, uma venda offline
-- cuja baixa de estoque foi forçada mesmo com saldo insuficiente — outro
-- caixa já tinha vendido o mesmo produto enquanto este estava offline. Segue
-- o mesmo padrão já usado para divergência de recebimento de compra e para
-- falha de emissão de NFC-e (docs/REGRAS-NEGOCIO.md): nunca bloquear nem
-- desfazer uma venda que já aconteceu — só sinalizar para conferência
-- humana depois.
-- Ref: docs/PLANO-DE-CONSTRUCAO.md (PDV offline), docs/API-CONTRATOS.md.

CREATE TYPE vendas.origem_venda AS ENUM ('online', 'offline');

ALTER TABLE vendas.vendas
  ADD COLUMN IF NOT EXISTS origem_sincronizacao vendas.origem_venda NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS estoque_conferencia_pendente boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vendas_conferencia_pendente
  ON vendas.vendas(estoque_conferencia_pendente)
  WHERE estoque_conferencia_pendente = true;

COMMENT ON COLUMN vendas.vendas.origem_sincronizacao IS
  'online: fluxo incremental de sempre. offline: venda montada no PDV sem rede e sincronizada depois via POST /vendas/sincronizar-offline.';
COMMENT ON COLUMN vendas.vendas.estoque_conferencia_pendente IS
  'true quando a baixa de estoque desta venda foi forçada com saldo insuficiente (conflito de sincronização offline) — aguarda conferência do gerente, nunca bloqueia nem desfaz a venda.';
