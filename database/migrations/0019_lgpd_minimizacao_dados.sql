-- vendas-service / fiscal-service — minimização de dados (LGPD).
--
-- O CPF do cliente já era uma coluna própria (`vendas.clientes.cpf`, nullable,
-- separada do identificador interno `id`), mas a API exigia o valor no
-- cadastro. Passou a ser opcional: nem toda finalidade (fidelização, contato)
-- precisa do CPF, só a nota fiscal quando o cliente pede.
--
-- Para cobrir esse caso sem forçar um cadastro completo de cliente, a nota
-- fiscal simulada ganha um CPF próprio, informado (ou não) só no momento da
-- finalização da venda — independente de haver cliente vinculado.
-- Ref: docs/REGRAS-NEGOCIO.md §5, docs/PENDENCIAS.md.

ALTER TABLE fiscal.notas_fiscais
  ADD COLUMN IF NOT EXISTS cpf_nota varchar(14);

COMMENT ON COLUMN fiscal.notas_fiscais.cpf_nota IS
  'CPF informado só para constar na nota, a pedido do cliente. Opcional e independente de haver cliente vinculado à venda — não usar para identificar ou buscar cliente.';

COMMENT ON COLUMN vendas.clientes.cpf IS
  'Opcional. Minimização de dados (LGPD): o identificador do cliente no sistema é o `id` (uuid), nunca o CPF.';
