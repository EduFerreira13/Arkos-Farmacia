-- vendas-service — quando a venda foi de fato finalizada.
--
-- `criado_em` é o momento em que o carrinho foi aberto, não em que a compra
-- aconteceu. Para quase tudo dá no mesmo (a diferença são minutos), mas o
-- relacionamento mede conversão comparando "houve venda depois do contato?" —
-- e aí a data errada inverte o resultado: um carrinho aberto antes do telefonema
-- e fechado depois contava como se a compra tivesse vindo primeiro.

ALTER TABLE vendas.vendas
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;

-- Para o que já existe, o melhor palpite disponível é a abertura do carrinho.
UPDATE vendas.vendas
   SET finalizado_em = criado_em
 WHERE status = 'finalizada' AND finalizado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_finalizado_em
  ON vendas.vendas(cliente_id, finalizado_em)
  WHERE cliente_id IS NOT NULL AND finalizado_em IS NOT NULL;

COMMENT ON COLUMN vendas.vendas.finalizado_em IS
  'Momento da finalização. Nulo enquanto a venda está aberta ou se foi cancelada.';
