import bcrypt from "bcryptjs";
import { ERROS, PERFIS, PERFIS_LISTA } from "@arkos/shared-types";
import { assinarToken, criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import {
  atualizarUsuario,
  buscarPerfilPorNome,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  criarUsuario,
  listarPerfis,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

/** Nunca devolver senha_hash para fora do serviço. */
function usuarioPublico(registro) {
  if (!registro) return null;
  return {
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    perfil: registro.perfil,
    permissoes: registro.permissoes ?? {},
    ativo: registro.ativo,
    criado_em: registro.criado_em,
  };
}

/**
 * Rotas de docs/API-CONTRATOS.md — auth-service.
 * @param {import("fastify").FastifyInstance} app
 */
export async function registrarRotas(app) {
  app.post("/login", async (requisicao, resposta) => {
    const { email, senha } = requisicao.body ?? {};

    if (!email || !senha) {
      return resposta.code(400).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Informe email e senha.",
      });
    }

    const usuario = await buscarUsuarioPorEmail(email);

    // Mesma resposta para email inexistente e senha errada — não revela quem existe.
    const senhaConfere = usuario ? await bcrypt.compare(senha, usuario.senha_hash) : false;
    if (!usuario || !senhaConfere) {
      return resposta.code(401).send({
        erro: ERROS.CREDENCIAIS_INVALIDAS,
        mensagem: "Email ou senha incorretos.",
      });
    }

    if (!usuario.ativo) {
      return resposta.code(403).send({
        erro: ERROS.SEM_PERMISSAO,
        mensagem: "Usuário inativo. Procure o administrador.",
      });
    }

    const publico = usuarioPublico(usuario);
    const token = assinarToken(publico, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    });

    return { token, usuario: publico };
  });

  app.get("/me", { preHandler: auth.autenticar }, async (requisicao, resposta) => {
    const usuario = await buscarUsuarioPorId(requisicao.usuario.id);
    if (!usuario) {
      return resposta.code(404).send({
        erro: ERROS.NAO_ENCONTRADO,
        mensagem: "Usuário não encontrado.",
      });
    }
    return { usuario: usuarioPublico(usuario) };
  });

  app.get("/perfis", { preHandler: auth.autenticar }, async () => {
    return { perfis: await listarPerfis() };
  });

  app.post(
    "/usuarios",
    { preHandler: [auth.autenticar, auth.exigirPerfil([PERFIS.ADMINISTRADOR])] },
    async (requisicao, resposta) => {
      const { nome, email, senha, perfil } = requisicao.body ?? {};

      if (!nome || !email || !senha) {
        return resposta.code(400).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "Informe nome, email e senha.",
        });
      }
      if (String(senha).length < 6) {
        return resposta.code(400).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "A senha precisa ter ao menos 6 caracteres.",
        });
      }

      // §8: não existe usuário sem perfil — o mínimo é operador de caixa.
      const nomePerfil = perfil ?? PERFIS.OPERADOR_CAIXA;
      if (!PERFIS_LISTA.includes(nomePerfil)) {
        return resposta.code(400).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: `Perfil inválido. Use um de: ${PERFIS_LISTA.join(", ")}.`,
        });
      }

      const registroPerfil = await buscarPerfilPorNome(nomePerfil);
      if (!registroPerfil) {
        return resposta.code(400).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "Perfil não cadastrado no banco.",
        });
      }

      if (await buscarUsuarioPorEmail(email)) {
        return resposta.code(409).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "Já existe usuário com este email.",
        });
      }

      const senhaHash = await bcrypt.hash(String(senha), 10);
      const criado = await criarUsuario({
        perfilId: registroPerfil.id,
        nome,
        email,
        senhaHash,
      });

      return resposta.code(201).send({
        usuario: { ...criado, perfil: nomePerfil, permissoes: registroPerfil.permissoes },
      });
    }
  );

  app.patch(
    "/usuarios/:id",
    { preHandler: [auth.autenticar, auth.exigirPerfil([PERFIS.ADMINISTRADOR])] },
    async (requisicao, resposta) => {
      const { id } = requisicao.params;
      const { ativo, perfil } = requisicao.body ?? {};

      if (ativo === undefined && perfil === undefined) {
        return resposta.code(400).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "Informe ativo e/ou perfil.",
        });
      }

      const existente = await buscarUsuarioPorId(id);
      if (!existente) {
        return resposta.code(404).send({
          erro: ERROS.NAO_ENCONTRADO,
          mensagem: "Usuário não encontrado.",
        });
      }

      let perfilId;
      if (perfil !== undefined) {
        if (!PERFIS_LISTA.includes(perfil)) {
          return resposta.code(400).send({
            erro: ERROS.DADOS_INVALIDOS,
            mensagem: `Perfil inválido. Use um de: ${PERFIS_LISTA.join(", ")}.`,
          });
        }
        const registroPerfil = await buscarPerfilPorNome(perfil);
        if (!registroPerfil) {
          return resposta.code(400).send({
            erro: ERROS.DADOS_INVALIDOS,
            mensagem: "Perfil não cadastrado no banco.",
          });
        }
        perfilId = registroPerfil.id;
      }

      const atualizado = await atualizarUsuario(id, {
        ativo: ativo === undefined ? undefined : Boolean(ativo),
        perfilId,
      });

      return { usuario: usuarioPublico(atualizado) };
    }
  );
}
