-- Remove qualquer estrutura de uma versão anterior e abandonada do projeto.
-- Autorização do dono do banco: tudo que estiver aqui pode ser deletado com segurança.

DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS estoque CASCADE;
DROP SCHEMA IF EXISTS vendas CASCADE;
DROP SCHEMA IF EXISTS financeiro CASCADE;
DROP SCHEMA IF EXISTS fiscal CASCADE;
DROP SCHEMA IF EXISTS compras CASCADE;

-- Atenção: se a versão antiga tiver deixado tabelas soltas no schema "public"
-- (não previstas nesta modelagem), o Claude Code deve rodar:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- e confirmar visualmente que são todas da versão antiga antes de dropar
-- qualquer coisa em "public" — esse schema não é gerenciado por este projeto
-- e não deve ser limpo às cegas.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- necessário para gen_random_uuid()
