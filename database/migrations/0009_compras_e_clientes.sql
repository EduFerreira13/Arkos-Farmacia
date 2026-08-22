-- compras-service — pedido de compra e recebimento de mercadoria.
-- vendas — cadastro de clientes (convênio e venda a prazo).
-- Ref: docs/REGRAS-NEGOCIO.md §4 (pedido manual ou por sugestão automática,
-- conferência obrigatória no recebimento, divergência registrada sem bloquear)
-- e §5 (conta a pagar vinculada a fornecedor e compra).

CREATE SCHEMA IF NOT EXISTS compras;

DO $$ BEGIN
  CREATE TYPE compras.status_pedido AS ENUM ('rascunho', 'enviado', 'recebido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS compras.pedidos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id     uuid NOT NULL,              -- schema estoque, sem FK entre serviços
  fornecedor_nome   varchar(150) NOT NULL,      -- cópia para o pedido não depender do estoque
  status            compras.status_pedido NOT NULL DEFAULT 'rascunho',
  observacao        text,
  motivo_cancelamento text,
  valor_total       numeric(10,2) NOT NULL DEFAULT 0,
  usuario_id        uuid NOT NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  enviado_em        timestamptz,
  recebido_em       timestamptz
);

CREATE TABLE IF NOT EXISTS compras.itens_pedido (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       uuid NOT NULL REFERENCES compras.pedidos(id) ON DELETE CASCADE,
  produto_id      uuid NOT NULL,                -- schema estoque, sem FK
  produto_nome    varchar(200) NOT NULL,
  quantidade      int NOT NULL,
  preco_unitario  numeric(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS compras.recebimentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id     uuid NOT NULL REFERENCES compras.pedidos(id),
  usuario_id    uuid NOT NULL,
  observacao    text,
  tem_divergencia boolean NOT NULL DEFAULT false,
  recebido_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compras.itens_recebimento (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id       uuid NOT NULL REFERENCES compras.recebimentos(id) ON DELETE CASCADE,
  item_pedido_id       uuid NOT NULL REFERENCES compras.itens_pedido(id),
  produto_id           uuid NOT NULL,
  produto_nome         varchar(200) NOT NULL,
  quantidade_pedida    int NOT NULL,
  quantidade_recebida  int NOT NULL,
  numero_lote          varchar(50) NOT NULL,
  data_validade        date NOT NULL,
  divergencia          int NOT NULL DEFAULT 0   -- recebida - pedida
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status_data ON compras.pedidos(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON compras.itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_pedido ON compras.recebimentos(pedido_id);

COMMENT ON COLUMN compras.itens_recebimento.divergencia IS
  'Diferença entre recebido e pedido (§4): registra e alerta, mas não bloqueia a entrada.';

-- Clientes: base da venda a prazo e do convênio (§5).
CREATE TABLE IF NOT EXISTS vendas.clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        varchar(150) NOT NULL,
  cpf         varchar(14) UNIQUE,
  telefone    varchar(20),
  email       varchar(150),
  convenio    varchar(100),
  observacao  text,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendas.vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES vendas.clientes(id);

CREATE INDEX IF NOT EXISTS idx_clientes_nome ON vendas.clientes(nome);
CREATE INDEX IF NOT EXISTS idx_vendas_cliente ON vendas.vendas(cliente_id);

-- Data do envio ao SNGPC: o MVP registra a intenção, a integração real vem depois.
ALTER TABLE fiscal.controlados_sngpc
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz;
