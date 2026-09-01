-- compras-service — número padronizado, condição de pagamento e entrega.
--
-- Três mudanças no pedido de compra:
--   1) numero legível e sequencial (PC-2026-00001) no lugar do UUID cortado;
--   2) o rascunho deixou de existir — o pedido nasce pendente de entrega, que
--      é o estado real de um pedido que acabou de ser passado ao fornecedor;
--   3) forma de pagamento, frete e desconto, que é o que fecha o valor da nota,
--      mais a data em que a mercadoria efetivamente chegou.
-- Ref: docs/REGRAS-NEGOCIO.md §4.

-- 1) Número do pedido -------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS compras.pedido_numero_seq;

ALTER TABLE compras.pedidos
  ADD COLUMN IF NOT EXISTS numero varchar(20);

UPDATE compras.pedidos
   SET numero = 'PC-' || to_char(criado_em, 'YYYY') || '-'
                || lpad(nextval('compras.pedido_numero_seq')::text, 5, '0')
 WHERE numero IS NULL;

ALTER TABLE compras.pedidos
  ALTER COLUMN numero SET DEFAULT ('PC-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('compras.pedido_numero_seq')::text, 5, '0'));

ALTER TABLE compras.pedidos ALTER COLUMN numero SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_numero ON compras.pedidos(numero);

-- 2) Status sem rascunho ----------------------------------------------------
-- Vira varchar com CHECK em vez de ENUM: acrescentar valor a um ENUM não pode
-- ser usado na mesma transação que o cria, e o CHECK dá a mesma garantia.
ALTER TABLE compras.pedidos ALTER COLUMN status DROP DEFAULT;
ALTER TABLE compras.pedidos ALTER COLUMN status TYPE varchar(20) USING status::text;

UPDATE compras.pedidos
   SET status = 'pendente_entrega'
 WHERE status IN ('rascunho', 'enviado');

ALTER TABLE compras.pedidos ALTER COLUMN status SET DEFAULT 'pendente_entrega';

ALTER TABLE compras.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE compras.pedidos
  ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('pendente_entrega', 'recebido', 'cancelado'));

DROP TYPE IF EXISTS compras.status_pedido;

-- 3) Condição comercial e entrega -------------------------------------------
ALTER TABLE compras.pedidos
  ADD COLUMN IF NOT EXISTS forma_pagamento varchar(20) NOT NULL DEFAULT 'boleto',
  ADD COLUMN IF NOT EXISTS frete   numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entregue_em date;

ALTER TABLE compras.pedidos DROP CONSTRAINT IF EXISTS pedidos_forma_pagamento_check;
ALTER TABLE compras.pedidos
  ADD CONSTRAINT pedidos_forma_pagamento_check
  CHECK (forma_pagamento IN ('boleto', 'pix', 'transferencia', 'dinheiro', 'cartao', 'prazo'));

COMMENT ON COLUMN compras.pedidos.valor_total IS
  'Itens + frete - desconto: é o valor que vira conta a pagar no recebimento.';
COMMENT ON COLUMN compras.pedidos.entregue_em IS
  'Data em que a mercadoria chegou, informada na conferência do recebimento.';

-- A observação do pedido e a do recebimento saíram da tela: o campo fica na
-- tabela para não perder o que já foi escrito, mas nada novo grava nele.
COMMENT ON COLUMN compras.pedidos.observacao IS 'Histórico — não é mais preenchido pela interface.';
COMMENT ON COLUMN compras.recebimentos.observacao IS 'Histórico — não é mais preenchido pela interface.';
