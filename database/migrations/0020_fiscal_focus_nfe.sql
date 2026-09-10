-- fiscal-service — emissão real de NFC-e via Focus NFe (substitui o mock).
--
-- O MVP só gravava `status: 'simulado'` e uma chave de acesso derivada do
-- `venda_id` (§7 das regras de negócio, docs/PENDENCIAS.md). Agora a emissão
-- chama a Focus NFe de verdade (apps/api/src/modulos/fiscal/focusnfe.js) e
-- grava o retorno real: número/série da nota, link de consulta na SEFAZ, e —
-- quando a SEFAZ rejeita ou o payload está incompleto — a mensagem de erro
-- para o operador tentar reemitir depois (reemitir = chamar de novo
-- POST /notas-fiscais com o mesmo venda_id; ver rotas.js).
--
-- `retorno_focus` guarda o corpo bruto da resposta da Focus NFe: o mapeamento
-- de campos (status_sefaz, mensagem_sefaz, qrcode_url etc.) muda entre casos e
-- ter o bruto ajuda a investigar rejeição sem esperar uma coluna nova.
-- Ref: docs/API-CONTRATOS.md (módulo fiscal), docs/PENDENCIAS.md.

ALTER TABLE fiscal.notas_fiscais
  ADD COLUMN IF NOT EXISTS numero varchar(20),
  ADD COLUMN IF NOT EXISTS serie varchar(10),
  ADD COLUMN IF NOT EXISTS url_consulta text,
  ADD COLUMN IF NOT EXISTS mensagem_erro text,
  ADD COLUMN IF NOT EXISTS retorno_focus jsonb;

COMMENT ON COLUMN fiscal.notas_fiscais.numero IS
  'Número da NFC-e atribuído pela Focus NFe/SEFAZ. Nulo enquanto status não é emitida.';
COMMENT ON COLUMN fiscal.notas_fiscais.serie IS
  'Série da NFC-e atribuída pela Focus NFe/SEFAZ.';
COMMENT ON COLUMN fiscal.notas_fiscais.url_consulta IS
  'Link para o consumidor consultar a nota na SEFAZ (DANFE/QR Code).';
COMMENT ON COLUMN fiscal.notas_fiscais.mensagem_erro IS
  'Motivo da rejeição/erro (SEFAZ ou validação de payload) quando status = erro.';
COMMENT ON COLUMN fiscal.notas_fiscais.retorno_focus IS
  'Corpo bruto da resposta da Focus NFe, para auditoria e depuração de rejeição.';
