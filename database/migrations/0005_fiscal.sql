-- fiscal-service — NF-e (mock no MVP) e controlados/SNGPC (placeholder)
-- Ref: docs/REGRAS-NEGOCIO.md §6, docs/MODELO-DADOS.md

CREATE SCHEMA IF NOT EXISTS fiscal;

CREATE TABLE fiscal.notas_fiscais (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id       uuid NOT NULL,
  chave_acesso   varchar(50),
  status         varchar(20) NOT NULL DEFAULT 'simulado', -- simulado | emitida | erro
  xml_url        text,
  emitida_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fiscal.controlados_sngpc (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id         uuid NOT NULL,
  produto_id       uuid NOT NULL,
  receita_id       uuid NOT NULL,
  enviado_anvisa   boolean NOT NULL DEFAULT false,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notas_fiscais_venda ON fiscal.notas_fiscais(venda_id);
CREATE INDEX idx_controlados_venda ON fiscal.controlados_sngpc(venda_id);
