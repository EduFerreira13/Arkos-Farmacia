-- auth-service — recuperação de senha.

-- Token de uso único para redefinir a senha. Guarda só o hash: quem tem acesso
-- ao banco não consegue usar o link de ninguém.
CREATE TABLE IF NOT EXISTS auth.tokens_recuperacao (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES auth.usuarios(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  expira_em    timestamptz NOT NULL,
  usado_em     timestamptz,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao_usuario
  ON auth.tokens_recuperacao(usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_recuperacao_hash
  ON auth.tokens_recuperacao(token_hash);

COMMENT ON TABLE auth.tokens_recuperacao IS
  'Pedido de redefinição de senha: token de uso único, com validade curta.';
