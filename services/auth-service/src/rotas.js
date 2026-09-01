import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ERROS, PERFIL_LABEL, PERFIS, PERFIS_LISTA } from "@arkos/shared-types";
import { assinarToken, criarAutenticacao } from "@arkos/auth-middleware";
import { env } from "./env.js";
import { formatarDataHora, gerarCsv, hojeNoFuso } from "./relatorios.js";
import {
  atualizarUsuario,
  buscarPerfilPorNome,
  buscarTokenValido,
  criarTokenRecuperacao,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  criarUsuario,
  listarPerfis,
  listarUsuarios,
  trocarSenha,
} from "./repositorio.js";

const auth = criarAutenticacao({ secret: env.JWT_SECRET });

/** Minutos que o link de redefinição continua valendo. */
const VALIDADE_RECUPERACAO_MIN = 30;

/** O token viaja em claro para o usuário; no banco fica só o hash. */
const hashDoToken = (token) => createHash("sha256").update(token).digest("hex");

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

  /**
   * Esqueci minha senha. Responde igual existindo ou não o email — senão a tela
   * viraria um jeito de descobrir quem tem conta.
   *
   * No MVP não há serviço de email configurado: em desenvolvimento o link volta
   * na resposta para dar para testar; em produção ele só sai pelo canal de envio
   * (ver docs/PENDENCIAS.md).
   */
  app.post("/recuperar-senha", async (requisicao, resposta) => {
    const email = requisicao.body?.email;
    if (!email) {
      return resposta
        .code(400)
        .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Informe o email da conta." });
    }

    const usuario = await buscarUsuarioPorEmail(email);
    const respostaNeutra = {
      mensagem:
        "Se existir uma conta com esse email, o link de redefinição foi gerado e vale por " +
        `${VALIDADE_RECUPERACAO_MIN} minutos.`,
    };

    if (!usuario || !usuario.ativo) return respostaNeutra;

    const token = randomBytes(32).toString("hex");
    await criarTokenRecuperacao({
      usuarioId: usuario.id,
      tokenHash: hashDoToken(token),
      minutosDeValidade: VALIDADE_RECUPERACAO_MIN,
    });

    requisicao.log.info({ usuario: usuario.email }, "link de redefinicao de senha gerado");

    if (env.NODE_ENV === "development") {
      return {
        ...respostaNeutra,
        // Só em desenvolvimento: sem serviço de email, é assim que se testa.
        token_de_desenvolvimento: token,
        aviso: "Sem serviço de email no MVP: use este token para redefinir.",
      };
    }

    return respostaNeutra;
  });

  app.post("/redefinir-senha", async (requisicao, resposta) => {
    const { token, senha } = requisicao.body ?? {};

    if (!token || !senha) {
      return resposta
        .code(400)
        .send({ erro: ERROS.DADOS_INVALIDOS, mensagem: "Informe o token e a nova senha." });
    }
    if (String(senha).length < 6) {
      return resposta.code(400).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "A senha precisa ter ao menos 6 caracteres.",
      });
    }

    const registro = await buscarTokenValido(hashDoToken(String(token)));
    if (!registro || !registro.ativo) {
      return resposta.code(422).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Link inválido ou expirado. Peça um novo na tela de entrada.",
      });
    }

    await trocarSenha({
      usuarioId: registro.usuario_id,
      senhaHash: await bcrypt.hash(String(senha), 10),
      tokenId: registro.id,
    });

    return { mensagem: "Senha redefinida. Já dá para entrar com ela." };
  });

  /**
   * Simulação de perfil: o administrador assume outro perfil para conferir
   * exatamente o que aquele perfil vê e pode fazer. O token devolvido vale com
   * as permissões do perfil simulado (inclusive os limites, como desconto
   * máximo) e registra o perfil real de quem está operando.
   */
  app.post("/simular", { preHandler: auth.autenticar }, async (requisicao, resposta) => {
    const { perfil } = requisicao.body ?? {};

    // Em simulação o perfil do token já é o simulado, então a checagem de
    // administrador tem de ser feita aqui, e não por exigirPerfil.
    if (requisicao.usuario.simulando) {
      return resposta.code(422).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Encerre a simulação atual antes de assumir outro perfil.",
      });
    }
    if (requisicao.usuario.perfil !== PERFIS.ADMINISTRADOR) {
      return resposta.code(403).send({
        erro: ERROS.SEM_PERMISSAO,
        mensagem: "Só o administrador pode simular outro perfil.",
      });
    }
    if (!PERFIS_LISTA.includes(perfil)) {
      return resposta.code(400).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: `Perfil inválido. Use um de: ${PERFIS_LISTA.join(", ")}.`,
      });
    }

    const alvo = await buscarPerfilPorNome(perfil);
    if (!alvo) {
      return resposta.code(400).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Perfil não cadastrado no banco.",
      });
    }

    const real = await buscarUsuarioPorId(requisicao.usuario.id);
    const simulado = {
      id: real.id,
      nome: real.nome,
      email: real.email,
      perfil: alvo.nome,
      permissoes: alvo.permissoes ?? {},
    };

    // Simulação é curta de propósito: é para conferir tela, não para operar o dia.
    const token = assinarToken(simulado, {
      secret: env.JWT_SECRET,
      expiresIn: "1h",
      extras: { simulando: true, perfil_real: real.perfil },
    });

    return {
      token,
      usuario: { ...simulado, simulando: true, perfil_real: real.perfil, ativo: real.ativo },
    };
  });

  app.get("/me", { preHandler: auth.autenticar }, async (requisicao, resposta) => {
    const usuario = await buscarUsuarioPorId(requisicao.usuario.id);
    if (!usuario) {
      return resposta.code(404).send({
        erro: ERROS.NAO_ENCONTRADO,
        mensagem: "Usuário não encontrado.",
      });
    }

    // Em simulação, quem vale é o perfil do token, não o do cadastro.
    if (requisicao.usuario.simulando) {
      return {
        usuario: {
          ...usuarioPublico(usuario),
          perfil: requisicao.usuario.perfil,
          permissoes: requisicao.usuario.permissoes,
          simulando: true,
          perfil_real: requisicao.usuario.perfil_real,
        },
      };
    }

    return { usuario: usuarioPublico(usuario) };
  });

  app.get("/perfis", { preHandler: auth.autenticar }, async () => {
    return { perfis: await listarPerfis() };
  });

  /** Filtros da tela de usuários — os mesmos que o relatório aceita. */
  const filtrosDeUsuario = (query = {}) => ({
    busca: query.busca,
    perfil: query.perfil,
    ativo: query.ativo,
  });

  app.get(
    "/usuarios",
    { preHandler: [auth.autenticar, auth.exigirPerfil([PERFIS.ADMINISTRADOR])] },
    async (requisicao) => ({ usuarios: await listarUsuarios(filtrosDeUsuario(requisicao.query)) })
  );

  /**
   * Usuários em planilha, com os filtros que estão valendo na tela. Só o
   * administrador chega aqui, e o arquivo não leva senha nem hash — quem entra
   * no sistema e com qual perfil é o que interessa numa auditoria de acesso.
   */
  app.get(
    "/relatorios/usuarios",
    { preHandler: [auth.autenticar, auth.exigirPerfil([PERFIS.ADMINISTRADOR])] },
    async (requisicao, resposta) => {
      const linhas = await listarUsuarios(filtrosDeUsuario(requisicao.query));

      const csv = gerarCsv(
        [
          { titulo: "Nome", valor: (l) => l.nome },
          { titulo: "Email", valor: (l) => l.email },
          { titulo: "Perfil", valor: (l) => PERFIL_LABEL[l.perfil] ?? l.perfil },
          { titulo: "Situacao", valor: (l) => (l.ativo ? "Ativo" : "Inativo") },
          { titulo: "Criado em", valor: (l) => formatarDataHora(l.criado_em) },
        ],
        linhas,
        [
          { titulo: "Usuarios na lista", valor: linhas.length },
          { titulo: "Ativos", valor: linhas.filter((l) => l.ativo).length },
          { titulo: "Inativos", valor: linhas.filter((l) => !l.ativo).length },
          ...PERFIS_LISTA.map((perfil) => ({
            titulo: PERFIL_LABEL[perfil],
            valor: linhas.filter((l) => l.perfil === perfil).length,
          })),
        ]
      );

      return resposta
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="usuarios_${hojeNoFuso()}.csv"`)
        .send(csv);
    }
  );

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
