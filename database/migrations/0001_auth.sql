-- auth-service — usuários, perfis e permissões (RBAC)
-- Ref: docs/REGRAS-NEGOCIO.md §7, docs/MODELO-DADOS.md

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.perfis (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         varchar(50) UNIQUE NOT NULL,
  permissoes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.usuarios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id    uuid NOT NULL REFERENCES auth.perfis(id),
  nome         varchar(150) NOT NULL,
  email        varchar(150) UNIQUE NOT NULL,
  senha_hash   text NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_perfil ON auth.usuarios(perfil_id);
CREATE INDEX idx_usuarios_email ON auth.usuarios(email);

-- Seed dos 4 perfis padrão de mercado (§7)
INSERT INTO auth.perfis (nome, permissoes) VALUES
  ('operador_caixa',   '{"vender": true, "consultar_estoque": true, "desconto_max_pct": 5}'::jsonb),
  ('farmaceutico',     '{"vender": true, "consultar_estoque": true, "validar_receita": true, "desconto_max_pct": 5}'::jsonb),
  ('gerente',          '{"vender": true, "consultar_estoque": true, "validar_receita": true, "cancelar_venda": true, "ajustar_estoque": true, "desconto_max_pct": 15, "ver_financeiro": true}'::jsonb),
  ('administrador',    '{"acesso_total": true}'::jsonb)
ON CONFLICT (nome) DO NOTHING;
