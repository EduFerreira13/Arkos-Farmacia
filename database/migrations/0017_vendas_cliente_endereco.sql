-- vendas-service — endereço do cliente.
--
-- O cadastro de cliente passou a pedir CPF e telefone como obrigatórios (é o
-- que identifica a pessoa e o que permite ligar de volta) e ganhou endereço
-- como campo opcional, usado na entrega e no cadastro de convênio.
-- Ref: docs/REGRAS-NEGOCIO.md §5.

ALTER TABLE vendas.clientes
  ADD COLUMN IF NOT EXISTS endereco text;

COMMENT ON COLUMN vendas.clientes.endereco IS
  'Endereço completo, opcional. Dado pessoal — tratar conforme a LGPD (finalidade: entrega e convênio).';
