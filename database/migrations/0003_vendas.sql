-- vendas-service — PDV, itens, pagamentos, receitas
-- Ref: docs/REGRAS-NEGOCIO.md §3, docs/MODELO-DADOS.md

CREATE SCHEMA IF NOT EXISTS vendas;

CREATE TYPE vendas.status_venda AS ENUM ('aberta', 'finalizada', 'cancelada');

CREATE TABLE vendas.vendas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL,
  status        vendas.status_venda NOT NULL DEFAULT 'aberta',
  valor_total   numeric(10,2) NOT NULL DEFAULT 0,
  desconto      numeric(10,2) NOT NULL DEFAULT 0,
  motivo_cancelamento text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vendas.itens_venda (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id         uuid NOT NULL REFERENCES vendas.vendas(id),
  produto_id       uuid NOT NULL,
  lote_id          uuid NOT NULL,
  quantidade       int NOT NULL,
  preco_unitario   numeric(10,2) NOT NULL
);

CREATE TABLE vendas.pagamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id         uuid NOT NULL REFERENCES vendas.vendas(id),
  forma_pagamento  varchar(20) NOT NULL, -- dinheiro | cartao_debito | cartao_credito | pix | convenio
  valor            numeric(10,2) NOT NULL
);

CREATE TABLE vendas.receitas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id       uuid NOT NULL UNIQUE REFERENCES vendas.vendas(id),
  medico_nome    varchar(150) NOT NULL,
  medico_crm     varchar(20) NOT NULL,
  paciente_nome  varchar(150) NOT NULL,
  data_emissao   date NOT NULL
);

CREATE INDEX idx_vendas_status_data ON vendas.vendas(status, criado_em);
CREATE INDEX idx_itens_venda_venda ON vendas.itens_venda(venda_id);
CREATE INDEX idx_pagamentos_venda ON vendas.pagamentos(venda_id);

-- View: vendas do dia + ticket médio (para o dashboard, §8)
CREATE VIEW vendas.vw_vendas_hoje AS
SELECT
  COUNT(*) AS total_vendas,
  COALESCE(SUM(valor_total), 0) AS valor_total_dia,
  COALESCE(AVG(valor_total), 0) AS ticket_medio
FROM vendas.vendas
WHERE status = 'finalizada'
  AND criado_em::date = current_date;
