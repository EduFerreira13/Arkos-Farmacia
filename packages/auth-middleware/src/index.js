/**
 * Validação de JWT compartilhada entre os serviços.
 *
 * Cada serviço valida o token localmente com o mesmo JWT_SECRET, sem chamada
 * de rede ao auth-service a cada requisição (docs/API-CONTRATOS.md).
 */

import jwt from "jsonwebtoken";
import { ERROS, PERFIS } from "@arkos/shared-types";
import { descontoMaximoPct } from "@arkos/vendas-core";

export { descontoMaximoPct };

/**
 * Nome do cookie httpOnly que carrega o token (LGPD/segurança: fora do
 * alcance do JavaScript do front, ao contrário do antigo localStorage).
 * `apps/api/src/app.js` registra `@fastify/cookie`; sem ele, `request.cookies`
 * simplesmente não existe e o fallback abaixo cobre o header.
 */
export const NOME_COOKIE_TOKEN = "arkos_token";

/**
 * Token da requisição: cookie primeiro, header `Authorization: Bearer` como
 * fallback (clientes que não usam cookie, ex.: chamada de servidor a servidor
 * ou uma ferramenta de teste).
 * @param {import("fastify").FastifyRequest} request
 * @returns {string | null}
 */
export function extrairToken(request) {
  const doCookie = request.cookies?.[NOME_COOKIE_TOKEN];
  if (doCookie) return doCookie;

  const header = request.headers.authorization ?? "";
  const [esquema, doHeader] = header.split(" ");
  return esquema === "Bearer" && doHeader ? doHeader : null;
}

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
 *
 * `extras` carrega a simulação de perfil: quando o administrador assume outro
 * perfil para conferir o que aquele perfil vê, o token vai com `perfil` e
 * `permissoes` do perfil simulado, mas guarda em `perfil_real` quem de fato
 * está operando — nenhuma ação deixa de ser rastreável ao usuário verdadeiro.
 *
 * @param {UsuarioAutenticado} usuario
 * @param {{ secret: string, expiresIn?: string, extras?: Record<string, unknown> }} opcoes
 * @returns {string}
 */
export function assinarToken(usuario, { secret, expiresIn = "8h", extras = {} }) {
  return jwt.sign(
    {
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      permissoes: usuario.permissoes ?? {},
      ...extras,
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
    // Presentes só em token de simulação de perfil.
    simulando: payload.simulando === true,
    perfil_real: payload.perfil_real ?? null,
    // Token de curta duração assinado pelo próprio backend para uma chamada
    // interna entre módulos (ex.: vendas autorizando estoque a ir negativo na
    // sincronização offline) — nunca aceito vindo de fora, porque só quem tem
    // o JWT_SECRET consegue assinar um com este claim.
    interno: payload.interno === true,
  };
}

/**
 * Token de vida curta para uma chamada de um módulo a outro (vendas ->
 * estoque, financeiro -> vendas, fiscal -> vendas/estoque, compras ->
 * estoque/financeiro — docs/ARQUITETURA.md). Carrega a mesma identidade do
 * usuário autenticado (perfil, permissões), mais o claim `interno: true` —
 * nunca presente num token emitido no login.
 *
 * Existe porque `requisicao.headers.authorization` só existe quando o
 * cliente manda um header `Authorization` — o que o navegador real nunca
 * faz (o token vive num cookie httpOnly, inacessível a JS). Usar sempre este
 * token pronto pra chamada interna, nunca o header cru da requisição
 * original, é o que garante que a identidade se propaga não importa como o
 * pedido original chegou (cookie ou header).
 *
 * @param {UsuarioAutenticado} usuario
 * @param {{ secret: string, expiresIn?: string }} opcoes
 * @returns {string} já pronto como valor de header `Authorization` (`Bearer <token>`)
 */
export function tokenInterno(usuario, { secret, expiresIn = "2m" }) {
  return `Bearer ${assinarToken(usuario, { secret, expiresIn, extras: { interno: true } })}`;
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
    const token = extrairToken(request);

    if (!token) {
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
