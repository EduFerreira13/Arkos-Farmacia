-- Criptografia em repouso de CPF e dados de receita (docs/PENDENCIAS.md —
-- "CPF e dados de receita ficam em texto puro no banco"). Protege contra
-- vazamento de backup/dump do banco; não protege contra quem já tem acesso à
-- sessão ativa da aplicação (mesmo modelo de ameaça do resto do sistema).
--
-- pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt) em vez de uma extensão externa —
-- já vem com o PostgreSQL, sem serviço a mais para manter no ar.
--
-- A CHAVE NUNCA aparece neste arquivo: current_setting('app.crypto_key') lê
-- a variável de sessão setada na conexão (apps/api/src/db.js e
-- database/scripts/run-migrations.js, a partir de DB_CRYPTO_KEY no .env —
-- ver .env.example). Sem a variável setada, esta migration falha ao rodar —
-- de propósito, para nunca gravar dado "criptografado" com chave vazia.
--
-- Campos afetados: vendas.clientes.cpf, vendas.receitas (medico_nome,
-- medico_crm, paciente_nome), fiscal.notas_fiscais.cpf_nota. NÃO afeta
-- telefone/email/endereço (a minimização de dados já os torna opcionais, mas
-- não fazem parte desta pendência) nem CNPJ (pessoa jurídica, fora do escopo
-- de dado pessoal sensível que motivou este pedido).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE vendas.clientes
  ALTER COLUMN cpf TYPE bytea USING (
    CASE WHEN cpf IS NULL THEN NULL ELSE pgp_sym_encrypt(cpf, current_setting('app.crypto_key')) END
  );

ALTER TABLE vendas.receitas
  ALTER COLUMN medico_nome TYPE bytea USING (
    CASE WHEN medico_nome IS NULL THEN NULL ELSE pgp_sym_encrypt(medico_nome, current_setting('app.crypto_key')) END
  ),
  ALTER COLUMN medico_crm TYPE bytea USING (
    CASE WHEN medico_crm IS NULL THEN NULL ELSE pgp_sym_encrypt(medico_crm, current_setting('app.crypto_key')) END
  ),
  ALTER COLUMN paciente_nome TYPE bytea USING (
    CASE WHEN paciente_nome IS NULL THEN NULL ELSE pgp_sym_encrypt(paciente_nome, current_setting('app.crypto_key')) END
  );

ALTER TABLE fiscal.notas_fiscais
  ALTER COLUMN cpf_nota TYPE bytea USING (
    CASE WHEN cpf_nota IS NULL THEN NULL ELSE pgp_sym_encrypt(cpf_nota, current_setting('app.crypto_key')) END
  );

COMMENT ON COLUMN vendas.clientes.cpf IS
  'Criptografado (pgp_sym_encrypt, chave em app.crypto_key/DB_CRYPTO_KEY). Ler com pgp_sym_decrypt(cpf, current_setting(''app.crypto_key''))::text — nunca ILIKE direto, decriptar antes de comparar.';
COMMENT ON COLUMN vendas.receitas.medico_nome IS 'Criptografado — ver comentário em vendas.clientes.cpf.';
COMMENT ON COLUMN vendas.receitas.medico_crm IS 'Criptografado — ver comentário em vendas.clientes.cpf.';
COMMENT ON COLUMN vendas.receitas.paciente_nome IS 'Criptografado — ver comentário em vendas.clientes.cpf.';
COMMENT ON COLUMN fiscal.notas_fiscais.cpf_nota IS 'Criptografado — ver comentário em vendas.clientes.cpf.';
