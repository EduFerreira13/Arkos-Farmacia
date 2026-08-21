-- financeiro-service — contas a pagar/receber, caixa
-- Ref: docs/REGRAS-NEGOCIO.md §5, docs/MODELO-DADOS.md

CREATE SCHEMA IF NOT EXISTS financeiro;

CREATE TABLE financeiro.contas_pagar (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id  uuid,
  descricao      varchar(200) NOT NULL,
  valor          numeric(10,2) NOT NULL,
  vencimento     date NOT NULL,
  status         varchar(20) NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado
  pago_em        timestamptz
);

CREATE TABLE financeiro.contas_receber (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem        varchar(50) NOT NULL, -- venda_a_prazo | convenio
  descricao     varchar(200) NOT NULL,
  valor         numeric(10,2) NOT NULL,
  vencimento    date NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'pendente',
  recebido_em   timestamptz
);

CREATE TABLE financeiro.caixa (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id                  uuid NOT NULL,
  valor_abertura              numeric(10,2) NOT NULL,
  valor_fechamento_esperado   numeric(10,2),
  valor_fechamento_contado    numeric(10,2),
  aberto_em                   timestamptz NOT NULL DEFAULT now(),
  fechado_em                  timestamptz
);

CREATE TABLE financeiro.movimentacoes_caixa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id    uuid NOT NULL REFERENCES financeiro.caixa(id),
  tipo        varchar(20) NOT NULL, -- entrada | saida
  valor       numeric(10,2) NOT NULL,
  origem      varchar(50) NOT NULL, -- venda | lancamento_manual
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contas_pagar_status_venc ON financeiro.contas_pagar(status, vencimento);
CREATE INDEX idx_contas_receber_status_venc ON financeiro.contas_receber(status, vencimento);
CREATE INDEX idx_mov_caixa_caixa ON financeiro.movimentacoes_caixa(caixa_id);

-- Regra §5: só pode existir um caixa aberto por vez por usuário
CREATE UNIQUE INDEX idx_caixa_aberto_por_usuario
  ON financeiro.caixa(usuario_id)
  WHERE fechado_em IS NULL;
