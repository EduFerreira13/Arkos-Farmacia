import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PERFIS } from "@arkos/shared-types";
import { api, gravarToken, lerToken } from "./api.js";

const AutenticacaoContexto = createContext(null);

export function ProvedorAutenticacao({ children }) {
  const [usuario, definirUsuario] = useState(null);
  const [carregando, definirCarregando] = useState(Boolean(lerToken()));

  // Token no localStorage sobrevive ao refresh: revalida em /auth/me.
  useEffect(() => {
    if (!lerToken()) {
      definirCarregando(false);
      return;
    }
    let cancelado = false;
    api.auth
      .get("/me")
      .then((dados) => {
        if (!cancelado) definirUsuario(dados.usuario ?? dados);
      })
      .catch(() => {
        gravarToken(null);
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
    const dados = await api.auth.post("/login", { email, senha }, { semAuth: true });
    gravarToken(dados.token);
    definirUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const sair = useCallback(() => {
    gravarToken(null);
    definirUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      carregando,
      entrar,
      sair,
      autenticado: Boolean(usuario),
    }),
    [usuario, carregando, entrar, sair]
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

export function descontoMaximoPct(usuario) {
  if (!usuario) return 0;
  if (usuario.perfil === PERFIS.ADMINISTRADOR) return 100;
  if (usuario.permissoes?.acesso_total === true) return 100;
  return Number(usuario.permissoes?.desconto_max_pct ?? 0);
}
