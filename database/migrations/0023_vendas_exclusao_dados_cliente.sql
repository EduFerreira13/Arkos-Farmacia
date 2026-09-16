-- vendas-service — direito de exclusão de dados pessoais do cliente (LGPD).
--
-- REGRAS-NEGOCIO.md §5/§6: cliente pode pedir para apagar seus dados, e toda
-- ação sensível de gerente fica registrada com o responsável. POST
-- /vendas/clientes/:id/excluir-dados anonimiza o cadastro (nome vira
-- placeholder, cpf/telefone/email/endereço/data_nascimento/observação/convênio
-- viram null, aceita_contato e ativo viram false) mas mantém o id — as vendas
-- e itens já registrados continuam intactos, só o cliente por trás fica
-- anônimo. Guarda quem e quando, mesmo padrão de
-- 0022_vendas_conferencia_estoque_resolvida.sql.
-- Ref: docs/REGRAS-NEGOCIO.md, docs/API-CONTRATOS.md, docs/PENDENCIAS.md.

ALTER TABLE vendas.clientes
  ADD COLUMN IF NOT EXISTS dados_excluidos_por uuid,
  ADD COLUMN IF NOT EXISTS dados_excluidos_em timestamptz;

COMMENT ON COLUMN vendas.clientes.dados_excluidos_por IS
  'usuario_id de quem executou o pedido de exclusão de dados (POST /vendas/clientes/:id/excluir-dados). Null se o cadastro nunca foi anonimizado.';
COMMENT ON COLUMN vendas.clientes.dados_excluidos_em IS
  'Quando os dados pessoais do cliente foram anonimizados. Null se o cadastro nunca foi anonimizado.';
