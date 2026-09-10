import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import ms from "ms";
import { ERROS, PERFIL_LABEL, PERFIS, PERFIS_LISTA } from "@arkos/shared-types";
import {
  assinarToken,
  criarAutenticacao,
  extrairToken,
  NOME_COOKIE_TOKEN,
  verificarToken,
} from "@arkos/auth-middleware";
import { env } from "../../env.js";
import { textoObrigatorio, validarCorpo, z } from "../../lib/validacao.js";
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

/**
 * Segundo cookie, só durante uma simulação de perfil: guarda o token real de
 * quem está simulando, para `/encerrar-simulacao` devolver a sessão original
 * sem exigir login de novo. Fora de uma simulação, este cookie não existe.
 */
const NOME_COOKIE_TOKEN_ORIGINAL = "arkos_token_original";

/** Mesma validade do token em segundos, para o cookie expirar junto. */
const MAX_IDADE_TOKEN_SEG = Math.round(ms(env.JWT_EXPIRES_IN) / 1000);
const MAX_IDADE_SIMULACAO_SEG = Math.round(ms("1h") / 1000);

/**
 * httpOnly: o JavaScript do front não enxerga o cookie (mitiga XSS, ao
 * contrário do antigo localStorage). secure só em produção porque o dev roda
 * em HTTP puro. sameSite=lax basta: front e API sempre passam pelo mesmo
 * proxy (Vite em dev, nginx em produção), então a navegação é same-site.
 */
function opcoesCookie(maxAgeSeg) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeg,
  };
}

/** Minutos que o link de redefinição continua valendo. */
const VALIDADE_RECUPERACAO_MIN = 30;

// Login fica de fora do preHandler de validação de propósito: o
// @fastify/rate-limit já injeta o próprio hook no mesmo array de preHandler
// da rota (para ler requisicao.body.email na chave), e ordem entre os dois
// não vale a pena arriscar. A checagem manual abaixo é só 2 campos — baixo
// risco de deixar como está.

const SchemaRecuperarSenha = z.object({
  email: textoObrigatorio("Informe o email da conta."),
});

const SchemaRedefinirSenha = z.object({
  token: textoObrigatorio("Informe o token e a nova senha."),
  senha: z
    .string({ error: "Informe o token e a nova senha." })
    .min(6, "A senha precisa ter ao menos 6 caracteres."),
});

const SchemaSimular = z.object({
  perfil: z.enum(PERFIS_LISTA, {
    error: `Perfil inválido. Use um de: ${PERFIS_LISTA.join(", ")}.`,
  }),
});

const SchemaCriarUsuario = z.object({
  nome: textoObrigatorio("Informe nome, email e senha."),
  email: textoObrigatorio("Informe nome, email e senha."),
  senha: z
    .string({ error: "Informe nome, email e senha." })
    .min(6, "A senha precisa ter ao menos 6 caracteres."),
  // §8: não existe usuário sem perfil — o mínimo é operador de caixa.
  perfil: z
    .enum(PERFIS_LISTA, { error: `Perfil inválido. Use um de: ${PERFIS_LISTA.join(", ")}.` })
    .optional()
    .default(PERFIS.OPERADOR_CAIXA),
});

const SchemaAtualizarUsuario = z
  .object({
    ativo: z.boolean().optional(),
    perfil: z
      .enum(PERFIS_LISTA, { error: `Perfil inválido. Use um de: ${PERFIS_LISTA.join(", ")}.` })
      .optional(),
  })
  .refine((dados) => dados.ativo !== undefined || dados.perfil !== undefined, {
    message: "Informe ativo e/ou perfil.",
  });

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
  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          // O hook padrão (onRequest) roda antes do corpo ser interpretado —
          // preHandler garante que requisicao.body.email já existe aqui.
          hook: "preHandler",
          // Chave por email+IP, não só IP: várias contas legítimas atrás do
          // mesmo IP (farmácia com vários caixas na mesma rede) não se
          // bloqueiam entre si — o limite é por tentativa contra UMA conta.
          keyGenerator: (requisicao) => `${requisicao.ip}:${requisicao.body?.email ?? ""}`,
          // @fastify/rate-limit dá `throw` no retorno desta função (não faz
          // `reply.send`), então precisa ser um Error com `statusCode` — senão
          // cai no tratamento genérico de erro do app.js e vira 500.
          errorResponseBuilder: (_requisicao, contexto) => {
            const erro = new Error(
              "Muitas tentativas de login. Aguarde um minuto antes de tentar de novo."
            );
            erro.statusCode = contexto.statusCode;
            erro.codigoArkos = "limite_excedido";
            return erro;
          },
        },
      },
    },
    async (requisicao, resposta) => {
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

      // Cookie httpOnly é o que o front usa de fato; o token no corpo continua
      // por compatibilidade (chamada servidor-a-servidor, script de teste).
      resposta.setCookie(NOME_COOKIE_TOKEN, token, opcoesCookie(MAX_IDADE_TOKEN_SEG));
      // Login novo não herda simulação de uma sessão anterior no mesmo navegador.
      resposta.clearCookie(NOME_COOKIE_TOKEN_ORIGINAL, { path: "/" });

      return { token, usuario: publico };
    }
  );

  /**
   * Esqueci minha senha. Responde igual existindo ou não o email — senão a tela
   * viraria um jeito de descobrir quem tem conta.
   *
   * No MVP não há serviço de email configurado: em desenvolvimento o link volta
   * na resposta para dar para testar; em produção ele só sai pelo canal de envio
   * (ver docs/PENDENCIAS.md).
   */
  app.post(
    "/recuperar-senha",
    { preHandler: validarCorpo(SchemaRecuperarSenha) },
    async (requisicao, resposta) => {
      const { email } = requisicao.body;

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
    }
  );

  app.post(
    "/redefinir-senha",
    { preHandler: validarCorpo(SchemaRedefinirSenha) },
    async (requisicao, resposta) => {
      const { token, senha } = requisicao.body;

      const registro = await buscarTokenValido(hashDoToken(token));
      if (!registro || !registro.ativo) {
        return resposta.code(422).send({
          erro: ERROS.DADOS_INVALIDOS,
          mensagem: "Link inválido ou expirado. Peça um novo na tela de entrada.",
        });
      }

      await trocarSenha({
        usuarioId: registro.usuario_id,
        senhaHash: await bcrypt.hash(senha, 10),
        tokenId: registro.id,
      });

      return { mensagem: "Senha redefinida. Já dá para entrar com ela." };
    }
  );

  /**
   * Simulação de perfil: o administrador assume outro perfil para conferir
   * exatamente o que aquele perfil vê e pode fazer. O token devolvido vale com
   * as permissões do perfil simulado (inclusive os limites, como desconto
   * máximo) e registra o perfil real de quem está operando.
   */
  app.post(
    "/simular",
    { preHandler: [auth.autenticar, validarCorpo(SchemaSimular)] },
    async (requisicao, resposta) => {
      const { perfil } = requisicao.body;
      // Guardado antes de qualquer cookie novo ser setado — é o que
      // `/encerrar-simulacao` devolve depois.
      const tokenReal = extrairToken(requisicao);

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

      resposta.setCookie(NOME_COOKIE_TOKEN, token, opcoesCookie(MAX_IDADE_SIMULACAO_SEG));
      // Sem o token real aqui não há como '/encerrar-simulacao' devolver a sessão
      // original depois — só acontece se a simulação já veio sem cookie (cliente
      // usando o header Authorization em vez de cookie).
      if (tokenReal) {
        resposta.setCookie(
          NOME_COOKIE_TOKEN_ORIGINAL,
          tokenReal,
          opcoesCookie(MAX_IDADE_SIMULACAO_SEG)
        );
      }

      return {
        token,
        usuario: { ...simulado, simulando: true, perfil_real: real.perfil, ativo: real.ativo },
      };
    }
  );

  /**
   * Fim da simulação: volta a usar o token real guardado em
   * `arkos_token_original` (setado por `/simular`). Sem simulação em
   * andamento — ou com a sessão original expirada — não tem o que restaurar.
   */
  app.post("/encerrar-simulacao", async (requisicao, resposta) => {
    const tokenReal = requisicao.cookies?.[NOME_COOKIE_TOKEN_ORIGINAL];
    if (!tokenReal) {
      return resposta.code(422).send({
        erro: ERROS.DADOS_INVALIDOS,
        mensagem: "Não há simulação em andamento.",
      });
    }

    let usuarioReal;
    try {
      usuarioReal = verificarToken(tokenReal, env.JWT_SECRET);
    } catch {
      resposta.clearCookie(NOME_COOKIE_TOKEN_ORIGINAL, { path: "/" });
      return resposta.code(401).send({
        erro: ERROS.NAO_AUTENTICADO,
        mensagem: "Sessão original expirada. Faça login novamente.",
      });
    }

    resposta.setCookie(NOME_COOKIE_TOKEN, tokenReal, opcoesCookie(MAX_IDADE_TOKEN_SEG));
    resposta.clearCookie(NOME_COOKIE_TOKEN_ORIGINAL, { path: "/" });

    const usuario = await buscarUsuarioPorId(usuarioReal.id);
    return { usuario: usuarioPublico(usuario) };
  });

  /** Limpa os cookies de sessão no servidor — o cookie httpOnly não some sozinho. */
  app.post("/logout", async (_requisicao, resposta) => {
    resposta.clearCookie(NOME_COOKIE_TOKEN, { path: "/" });
    resposta.clearCookie(NOME_COOKIE_TOKEN_ORIGINAL, { path: "/" });
    return { mensagem: "Sessão encerrada." };
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
    {
      preHandler: [
        auth.autenticar,
        auth.exigirPerfil([PERFIS.ADMINISTRADOR]),
        validarCorpo(SchemaCriarUsuario),
      ],
    },
    async (requisicao, resposta) => {
      const { nome, email, senha, perfil: nomePerfil } = requisicao.body;

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

      const senhaHash = await bcrypt.hash(senha, 10);
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
    {
      preHandler: [
        auth.autenticar,
        auth.exigirPerfil([PERFIS.ADMINISTRADOR]),
        validarCorpo(SchemaAtualizarUsuario),
      ],
    },
    async (requisicao, resposta) => {
      const { id } = requisicao.params;
      const { ativo, perfil } = requisicao.body;

      const existente = await buscarUsuarioPorId(id);
      if (!existente) {
        return resposta.code(404).send({
          erro: ERROS.NAO_ENCONTRADO,
          mensagem: "Usuário não encontrado.",
        });
      }

      let perfilId;
      if (perfil !== undefined) {
        const registroPerfil = await buscarPerfilPorNome(perfil);
        if (!registroPerfil) {
          return resposta.code(400).send({
            erro: ERROS.DADOS_INVALIDOS,
            mensagem: "Perfil não cadastrado no banco.",
          });
        }
        perfilId = registroPerfil.id;
      }

      const atualizado = await atualizarUsuario(id, { ativo, perfilId });

      return { usuario: usuarioPublico(atualizado) };
    }
  );
}
