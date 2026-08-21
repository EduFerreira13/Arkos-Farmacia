import { consultar } from "./db.js";

/** Acesso ao schema `auth` — nenhum outro serviço toca nessas tabelas. */

export async function buscarUsuarioPorEmail(email) {
  const { rows } = await consultar(
    `SELECT u.id, u.nome, u.email, u.senha_hash, u.ativo, u.criado_em,
            p.nome AS perfil, p.permissoes
       FROM auth.usuarios u
       JOIN auth.perfis p ON p.id = u.perfil_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );
  return rows[0] ?? null;
}

export async function buscarUsuarioPorId(id) {
  const { rows } = await consultar(
    `SELECT u.id, u.nome, u.email, u.ativo, u.criado_em,
            p.nome AS perfil, p.permissoes
       FROM auth.usuarios u
       JOIN auth.perfis p ON p.id = u.perfil_id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarPerfis() {
  const { rows } = await consultar(
    `SELECT id, nome, permissoes FROM auth.perfis ORDER BY nome`
  );
  return rows;
}

export async function buscarPerfilPorNome(nome) {
  const { rows } = await consultar(
    `SELECT id, nome, permissoes FROM auth.perfis WHERE nome = $1`,
    [nome]
  );
  return rows[0] ?? null;
}

export async function criarUsuario({ perfilId, nome, email, senhaHash }) {
  const { rows } = await consultar(
    `INSERT INTO auth.usuarios (perfil_id, nome, email, senha_hash)
          VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, ativo, criado_em`,
    [perfilId, nome, email, senhaHash]
  );
  return rows[0];
}

/**
 * Atualiza só o que veio no corpo (ativo e/ou perfil).
 * @param {string} id
 * @param {{ ativo?: boolean, perfilId?: string }} campos
 */
export async function atualizarUsuario(id, campos) {
  const partes = [];
  const valores = [];

  if (campos.ativo !== undefined) {
    valores.push(campos.ativo);
    partes.push(`ativo = $${valores.length}`);
  }
  if (campos.perfilId !== undefined) {
    valores.push(campos.perfilId);
    partes.push(`perfil_id = $${valores.length}`);
  }
  if (!partes.length) return buscarUsuarioPorId(id);

  valores.push(id);
  await consultar(
    `UPDATE auth.usuarios SET ${partes.join(", ")} WHERE id = $${valores.length}`,
    valores
  );
  return buscarUsuarioPorId(id);
}
