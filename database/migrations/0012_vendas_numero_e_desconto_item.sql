-- vendas-service — número sequencial da venda, desconto por item e motivo
-- padronizado de cancelamento.

-- Número da venda: sequencial e cronológico, para o balcão falar "venda 1264"
-- em vez de ler oito caracteres de um identificador aleatório.
CREATE SEQUENCE IF NOT EXISTS vendas.numero_venda_seq;

ALTER TABLE vendas.vendas
  ADD COLUMN IF NOT EXISTS numero bigint;

-- Numera o que já existe na ordem em que aconteceu.
UPDATE vendas.vendas v
   SET numero = ordenada.posicao
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY criado_em, id) AS posicao
      FROM vendas.vendas
     WHERE numero IS NULL
  ) ordenada
 WHERE v.id = ordenada.id AND v.numero IS NULL;

SELECT setval(
  'vendas.numero_venda_seq',
  GREATEST((SELECT COALESCE(MAX(numero), 0) FROM vendas.vendas), 1)
);

ALTER TABLE vendas.vendas
  ALTER COLUMN numero SET DEFAULT nextval('vendas.numero_venda_seq');

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_numero ON vendas.vendas(numero);

-- Desconto negociado em um item específico (§3: o limite do perfil vale para a
-- soma de tudo que foi descontado na venda).
ALTER TABLE vendas.itens_venda
  ADD COLUMN IF NOT EXISTS desconto numeric(10,2) NOT NULL DEFAULT 0;

-- Motivo de cancelamento em lista fechada, para o relatório agrupar. O texto
-- livre continua em motivo_cancelamento.
ALTER TABLE vendas.vendas
  ADD COLUMN IF NOT EXISTS categoria_cancelamento varchar(30);

COMMENT ON COLUMN vendas.vendas.categoria_cancelamento IS
  'compra_errada | pagamento_errado | orcamento | desistencia | item_errado | outro';
