import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PERFIS } from "@arkos/shared-types";
import { api } from "./api.js";

const AutenticacaoContexto = createContext(null);

export function ProvedorAutenticacao({ children }) {
  const [usuario, definirUsuario] = useState(null);
  const [carregando, definirCarregando] = useState(true);

  // O token vive num cookie httpOnly — o JS não enxerga se ele existe, então
  // a única forma de saber se a sessão sobreviveu ao refresh é perguntar.
  useEffect(() => {
    let cancelado = false;
    api.auth
      .get("/me")
      .then((dados) => {
        if (!cancelado) definirUsuario(dados.usuario ?? dados);
      })
      .catch(() => {
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

export function descontoMaximoPct(usuario) {
  if (!usuario) return 0;
  if (usuario.perfil === PERFIS.ADMINISTRADOR) return 100;
  if (usuario.permissoes?.acesso_total === true) return 100;
  return Number(usuario.permissoes?.desconto_max_pct ?? 0);
}
