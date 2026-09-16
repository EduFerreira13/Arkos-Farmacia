-- vendas-service — retenção de receita (docs/REGRAS-NEGOCIO.md §3, decisão
-- registrada em docs/PENDENCIAS.md): a RDC 20/2011 da Anvisa exige reter cópia
-- física/digitalizada da receita de antibiótico no estabelecimento, não só
-- anotar os dados. Até aqui `vendas.receitas` só guardava os campos de texto
-- (médico, CRM, paciente, data) — usados igual para tarja preta e antibiótico.
--
-- Isso adiciona um anexo opcional (foto/scan da receita, imagem ou PDF) à
-- mesma linha. Continua sendo o mesmo mecanismo para os dois casos — só que
-- agora com um jeito de reter a cópia física quando for preciso, em vez de só
-- o registro digital dos dados.

ALTER TABLE vendas.receitas
  ADD COLUMN IF NOT EXISTS anexo bytea,
  ADD COLUMN IF NOT EXISTS anexo_tipo varchar(40),
  ADD COLUMN IF NOT EXISTS anexo_nome varchar(200),
  ADD COLUMN IF NOT EXISTS anexo_enviado_em timestamptz;

COMMENT ON COLUMN vendas.receitas.anexo IS
  'Foto ou PDF da receita (retenção física exigida pela RDC 20/2011 para antibiótico). Opcional — null quando só o registro digital foi feito.';
COMMENT ON COLUMN vendas.receitas.anexo_tipo IS
  'Mime type do anexo (image/jpeg, image/png ou application/pdf). Null se não há anexo.';
COMMENT ON COLUMN vendas.receitas.anexo_nome IS
  'Nome original do arquivo enviado, só para exibição — não usado como caminho de arquivo.';
COMMENT ON COLUMN vendas.receitas.anexo_enviado_em IS
  'Quando o anexo foi enviado. Null se não há anexo.';
