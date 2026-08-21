/**
 * Validação de JWT compartilhada entre os serviços.
 *
 * Cada serviço valida o token localmente com o mesmo JWT_SECRET, sem chamada
 * de rede ao auth-service a cada requisição (docs/API-CONTRATOS.md).
 */

import jwt from "jsonwebtoken";
import { ERROS, PERFIS } from "@arkos/shared-types";

/**
 * @typedef {Object} UsuarioAutenticado
 * @property {string} id
 * @property {string} nome
 * @property {string} email
 * @property {string} perfil
 * @property {Record<string, unknown>} permissoes
 */

/**
 * Gera o token do login. Só o auth-service usa; os demais apenas verificam.
 * @param {UsuarioAutenticado} usuario
 * @param {{ secret: string, expiresIn?: string }} opcoes
 * @returns {string}
 */
export function assinarToken(usuario, { secret, expiresIn = "8h" }) {
  return jwt.sign(
    {
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      permissoes: usuario.permissoes ?? {},
    },
    secret,
    { expiresIn }
  );
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {UsuarioAutenticado}
 */
export function verificarToken(token, secret) {
  const payload = jwt.verify(token, secret);
  return {
    id: payload.sub,
    nome: payload.nome,
    email: payload.email,
    perfil: payload.perfil,
    permissoes: payload.permissoes ?? {},
  };
}

/**
 * Administrador tem acesso_total; os outros perfis dependem da chave
 * correspondente em `permissoes` (docs/REGRAS-NEGOCIO.md §6).
 * @param {UsuarioAutenticado} usuario
 * @param {string} chave
 * @returns {boolean}
 */
export function temPermissao(usuario, chave) {
  if (!usuario) return false;
  if (usuario.perfil === PERFIS.ADMINISTRADOR) return true;
  if (usuario.permissoes?.acesso_total === true) return true;
  return usuario.permissoes?.[chave] === true;
}

/**
 * Limite de desconto do perfil, em porcentagem (docs/REGRAS-NEGOCIO.md §3).
 * @param {UsuarioAutenticado} usuario
 * @returns {number}
 */
export function descontoMaximoPct(usuario) {
  if (!usuario) return 0;
  if (usuario.perfil === PERFIS.ADMINISTRADOR) return 100;
  if (usuario.permissoes?.acesso_total === true) return 100;
  const limite = Number(usuario.permissoes?.desconto_max_pct ?? 0);
  return Number.isFinite(limite) ? limite : 0;
}

/**
 * Cria os hooks de autenticação/autorização de um serviço Fastify.
 *
 * Uso:
 *   const auth = criarAutenticacao({ secret: env.JWT_SECRET });
 *   app.get("/produtos", { preHandler: auth.autenticar }, handler);
 *   app.post("/movimentacoes", { preHandler: [auth.autenticar, auth.exigirPermissao("ajustar_estoque")] }, handler);
 *
 * @param {{ secret: string }} opcoes
 */
export function criarAutenticacao({ secret }) {
  if (!secret) {
    throw new Error("JWT_SECRET não configurado — impossível validar tokens.");
  }

  /** Preenche request.usuario ou responde 401. */
  async function autenticar(request, reply) {
    const header = request.headers.authorization ?? "";
    const [esquema, token] = header.split(" ");

    if (esquema !== "Bearer" || !token) {
      return reply.code(401).send({
        erro: ERROS.NAO_AUTENTICADO,
        mensagem: "Token ausente ou mal formatado.",
      });
    }

    try {
      request.usuario = verificarToken(token, secret);
    } catch {
      return reply.code(401).send({
        erro: ERROS.NAO_AUTENTICADO,
        mensagem: "Token inválido ou expirado.",
      });
    }
  }

  /**
   * @param {string[]} perfisPermitidos
   */
  function exigirPerfil(perfisPermitidos) {
    return async function verificarPerfil(request, reply) {
      const usuario = request.usuario;
      const liberado =
        usuario?.perfil === PERFIS.ADMINISTRADOR ||
        perfisPermitidos.includes(usuario?.perfil);

      if (!liberado) {
        return reply.code(403).send({
          erro: ERROS.SEM_PERMISSAO,
          mensagem: "Seu perfil não tem permissão para esta ação.",
        });
      }
    };
  }

  /**
   * @param {string} chave
   */
  function exigirPermissao(chave) {
    return async function verificarPermissao(request, reply) {
      if (!temPermissao(request.usuario, chave)) {
        return reply.code(403).send({
          erro: ERROS.SEM_PERMISSAO,
          mensagem: "Seu perfil não tem permissão para esta ação.",
        });
      }
    };
  }

  return { autenticar, exigirPerfil, exigirPermissao };
}
