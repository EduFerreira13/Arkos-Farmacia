-- estoque-service — quanto tempo uma unidade do produto costuma durar.
--
-- Por que isso existe: o relacionamento só conseguia prever recompra olhando o
-- intervalo entre as compras do cliente, e isso exige duas ou três compras para
-- significar alguma coisa. Quem comprou uma vez não gerava sinal nenhum até
-- sumir. Com a duração no cadastro, uma caixa de 30 comprimidos já diz quando a
-- pessoa vai precisar repor — desde a primeira compra.
--
-- Fica em branco quando não se aplica (curativo, item de conveniência). Nesse
-- caso o CRM volta a usar só o histórico, como antes.

ALTER TABLE estoque.produtos
  ADD COLUMN IF NOT EXISTS dias_de_uso int;

DO $$ BEGIN
  ALTER TABLE estoque.produtos
    ADD CONSTRAINT chk_produtos_dias_de_uso CHECK (dias_de_uso IS NULL OR dias_de_uso > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN estoque.produtos.dias_de_uso IS
  'Dias que UMA unidade de venda costuma durar no tratamento. Caixa de 30 '
  'comprimidos de uso diário: 30. Em branco quando não se aplica.';
