-- vendas-service — relacionamento com o cliente (CRM da farmácia).
-- Ref: docs/REGRAS-NEGOCIO.md §3 (a venda é o registro do que o cliente levou)
-- e §5 (convênio e venda a prazo dependem de cliente identificado).
--
-- A ideia é simples: a farmácia já sabe o que cada cliente compra e de quanto em
-- quanto tempo. Guardar o contato feito fecha o ciclo — quem foi chamado, por
-- que, com que oferta e no que deu.

DO $$ BEGIN
  CREATE TYPE vendas.canal_contato AS ENUM ('telefone', 'whatsapp', 'email', 'presencial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vendas.resultado_contato AS ENUM (
    'aguardando',    -- contato feito, cliente vai pensar
    'interessado',
    'sem_interesse',
    'nao_atendeu',
    'convertido'     -- comprou depois do contato
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vendas.contatos_cliente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES vendas.clientes(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL,
  canal         vendas.canal_contato NOT NULL,
  motivo        varchar(80) NOT NULL,   -- o gancho: recompra atrasada, reativação...
  oferta        varchar(200),           -- o que foi oferecido
  observacao    text,
  resultado     vendas.resultado_contato NOT NULL DEFAULT 'aguardando',
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contatos_cliente ON vendas.contatos_cliente(cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_contatos_data ON vendas.contatos_cliente(criado_em DESC);

COMMENT ON COLUMN vendas.contatos_cliente.motivo IS
  'Por que o cliente entrou na lista de contato — vem da análise de recompra.';

-- Quem pede para não ser incomodado sai das listas de contato.
ALTER TABLE vendas.clientes
  ADD COLUMN IF NOT EXISTS aceita_contato boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_nascimento date;

COMMENT ON COLUMN vendas.clientes.aceita_contato IS
  'Falso quando o cliente pede para não receber oferta: o CRM respeita e não lista.';

-- Índice que sustenta a análise de recompra por cliente.
CREATE INDEX IF NOT EXISTS idx_vendas_cliente_data
  ON vendas.vendas(cliente_id, criado_em DESC)
  WHERE cliente_id IS NOT NULL;
