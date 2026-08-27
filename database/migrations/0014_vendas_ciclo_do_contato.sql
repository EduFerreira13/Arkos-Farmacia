-- vendas-service — fechar o ciclo do contato de relacionamento.
--
-- Antes disso, o contato era um registro morto: anotava-se o que foi falado e
-- acabava ali. Três buracos:
--
--   1. Não havia "voltar a falar em X dias". Quem ficou de pensar ficava órfão.
--   2. "Virou compra" era alguém marcando à mão numa lista. O indicador media a
--      disciplina de quem preenche, não o resultado.
--   3. A oferta feita no telefone não chegava ao balcão. O cliente aparecia e
--      ninguém sabia que tinham ligado para ele oferecendo desconto.

ALTER TABLE vendas.contatos_cliente
  -- Quando voltar a falar. Vazio = não precisa retorno.
  ADD COLUMN IF NOT EXISTS proximo_contato_em date,
  -- Desconto prometido no contato, para o PDV aplicar com um clique. O teto do
  -- perfil continua valendo na hora de aplicar (docs/REGRAS-NEGOCIO.md §3).
  ADD COLUMN IF NOT EXISTS desconto_pct numeric(5,2),
  -- A venda que nasceu deste contato, preenchida na finalização.
  ADD COLUMN IF NOT EXISTS venda_id uuid REFERENCES vendas.vendas(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE vendas.contatos_cliente
    ADD CONSTRAINT chk_contatos_desconto_pct
    CHECK (desconto_pct IS NULL OR (desconto_pct > 0 AND desconto_pct <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contatos_retorno
  ON vendas.contatos_cliente(proximo_contato_em)
  WHERE proximo_contato_em IS NOT NULL;

COMMENT ON COLUMN vendas.contatos_cliente.proximo_contato_em IS
  'Data combinada para retornar. O retorno é considerado resolvido quando '
  'existe um contato mais novo com o mesmo cliente.';

COMMENT ON COLUMN vendas.contatos_cliente.venda_id IS
  'Venda que veio deste contato. Preenchida na finalização, não à mão.';

-- A conversão passa a ser medida procurando a venda do cliente depois do
-- contato; sem este índice a consulta varre a tabela de vendas por linha.
CREATE INDEX IF NOT EXISTS idx_vendas_cliente_data
  ON vendas.vendas(cliente_id, criado_em)
  WHERE cliente_id IS NOT NULL;

-- Quanto tempo o item comprado deve durar, copiado do cadastro no momento da
-- venda. Snapshot pelo mesmo motivo de produto_nome e tipo_controle: mudar o
-- cadastro depois não pode reescrever o que aconteceu (docs/MODELO-DADOS.md).
ALTER TABLE vendas.itens_venda
  ADD COLUMN IF NOT EXISTS dias_de_uso int;

COMMENT ON COLUMN vendas.itens_venda.dias_de_uso IS
  'Duração de uma unidade no dia da venda. Base da previsão de recompra de '
  'quem ainda não tem histórico suficiente.';
