-- Remove qualquer estrutura de uma versão anterior e abandonada do projeto.
-- Autorização do dono do banco: tudo que estiver aqui pode ser deletado com segurança.
--
-- IMPORTANTE: `npm run migrate` roda todos os arquivos desta pasta a cada vez.
-- Sem a guarda abaixo, rodar o comando de novo (para aplicar uma migration
-- nova, por exemplo) apagaria o banco inteiro junto — inclusive os dados de
-- demonstração e os usuários. Por isso a limpeza só acontece quando o Arkos
-- ainda não está instalado.
--
-- Para zerar o banco de propósito, rode os DROPs à mão antes do migrate.

DO $$
BEGIN
  IF to_regclass('auth.usuarios') IS NULL THEN
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA IF EXISTS estoque CASCADE;
    DROP SCHEMA IF EXISTS vendas CASCADE;
    DROP SCHEMA IF EXISTS financeiro CASCADE;
    DROP SCHEMA IF EXISTS fiscal CASCADE;
    DROP SCHEMA IF EXISTS compras CASCADE;
    RAISE NOTICE 'Schemas anteriores removidos: instalação limpa do Arkos.';
  ELSE
    RAISE NOTICE 'Arkos já instalado: a limpeza de legado foi pulada.';
  END IF;
END
$$;

-- Atenção: se a versão antiga tiver deixado tabelas soltas no schema "public"
-- (não previstas nesta modelagem), o Claude Code deve rodar:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- e confirmar visualmente que são todas da versão antiga antes de dropar
-- qualquer coisa em "public" — esse schema não é gerenciado por este projeto
-- e não deve ser limpo às cegas.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- necessário para gen_random_uuid()
