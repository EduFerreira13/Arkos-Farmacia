import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PERFIS } from "@arkos/shared-types";
import { api, ErroApi } from "./api.js";
import { obterSessaoUsuario, salvarSessaoUsuario } from "./bancoOffline.js";

const AutenticacaoContexto = createContext(null);

/** A sessão cacheada (bancoOffline.js) não guarda email — o resto do usuário online tem. */
function paraUsuarioDeSessaoCacheada(sessao) {
  return {
    id: sessao.usuario_id,
    nome: sessao.nome,
    perfil: sessao.perfil,
    permissoes: sessao.permissoes,
    perfil_real: sessao.perfil_real,
    simulando: sessao.simulando,
  };
}

export function ProvedorAutenticacao({ children }) {
  const [usuario, definirUsuario] = useState(null);
  const [carregando, definirCarregando] = useState(true);

  // O token vive num cookie httpOnly — o JS não enxerga se ele existe, então
  // a única forma de saber se a sessão sobreviveu ao refresh é perguntar.
  useEffect(() => {
    let cancelado = false;
    api.auth
      .get("/me")
      .then(async (dados) => {
        const usuarioLogado = dados.usuario ?? dados;
        if (!cancelado) definirUsuario(usuarioLogado);
        // Mantém a sessão cacheada — é o que permite o PDV offline sobreviver
        // a um reload sem rede (apps/web/src/lib/bancoOffline.js, Fase 5 do
        // PDV offline): sem isso, um reload offline perderia o perfil/
        // permissões e o teto de desconto pararia de funcionar.
        try {
          await salvarSessaoUsuario(usuarioLogado);
        } catch {
          // IndexedDB indisponível — sessão offline não fica cacheada, mas o
          // login online segue normal.
        }
      })
      .catch(async (falha) => {
        // `ErroApi` é uma resposta HTTP de verdade (ex.: 401, token
        // realmente expirado) — aí não há sessão cacheada que valha, é pra
        // deslogar mesmo. Qualquer outra falha (a chamada nem completou) é
        // sinal de rede fora do ar: tenta a sessão cacheada antes de
        // desistir, para o PDV continuar funcionando depois de um reload
        // offline.
        if (!(falha instanceof ErroApi)) {
          try {
            const cacheada = await obterSessaoUsuario();
            if (cacheada) {
              if (!cancelado) definirUsuario(paraUsuarioDeSessaoCacheada(cacheada));
              return;
            }
          } catch {
            // IndexedDB indisponível também — segue pro deslogado abaixo.
          }
        }
        if (!cancelado) definirUsuario(null);
      })
      .finally(() => {
        if (!cancelado) definirCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    const aoExpirar = () => definirUsuario(null);
    window.addEventListener("arkos:sessao-expirada", aoExpirar);
    return () => window.removeEventListener("arkos:sessao-expirada", aoExpirar);
  }, []);

  const entrar = useCallback(async (email, senha) => {
    // O cookie httpOnly quem seta é o backend, na resposta deste POST — nada
    // para o front guardar aqui.
    const dados = await api.auth.post("/login", { email, senha });
    definirUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const sair = useCallback(async () => {
    // Cookie httpOnly não some por conta própria — só o backend limpa.
    try {
      await api.auth.post("/logout", {});
    } finally {
      definirUsuario(null);
    }
  }, []);

  /**
   * Simulação de perfil (só administrador): o backend troca o cookie ativo
   * pelo do perfil simulado e guarda o token real num segundo cookie
   * (`arkos_token_original`), para `encerrarSimulacao` devolver depois.
   */
  const simular = useCallback(async (perfil) => {
    const dados = await api.auth.post("/simular", { perfil });
    definirUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const encerrarSimulacao = useCallback(async () => {
    const dados = await api.auth.post("/encerrar-simulacao", {});
    definirUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      carregando,
      entrar,
      sair,
      simular,
      encerrarSimulacao,
      autenticado: Boolean(usuario),
      simulando: usuario?.simulando === true,
      // Perfil de verdade de quem está logado, mesmo durante uma simulação.
      perfilReal: usuario?.perfil_real ?? usuario?.perfil ?? null,
    }),
    [usuario, carregando, entrar, sair, simular, encerrarSimulacao]
  );

  return <AutenticacaoContexto.Provider value={valor}>{children}</AutenticacaoContexto.Provider>;
}

export function usarAutenticacao() {
  const contexto = useContext(AutenticacaoContexto);
  if (!contexto) throw new Error("usarAutenticacao precisa estar dentro de ProvedorAutenticacao.");
  return contexto;
}

/**
 * Mesma regra do backend (packages/auth-middleware): administrador tem tudo,
 * os outros dependem da chave em `permissoes`.
 */
export function temPermissao(usuario, chave) {
  if (!usuario) return false;
  if (usuario.perfil === PERFIS.ADMINISTRADOR) return true;
  if (usuario.permissoes?.acesso_total === true) return true;
  return usuario.permissoes?.[chave] === true;
}

export { descontoMaximoPct } from "@arkos/vendas-core";
