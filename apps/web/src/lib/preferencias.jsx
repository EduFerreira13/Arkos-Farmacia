import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Preferências do usuário guardadas no navegador: tema claro/escuro (§6) e
 * densidade de tabela — denso (padrão) ou confortável (§4).
 */

const CHAVE_TEMA = "arkos.tema";
const CHAVE_DENSIDADE = "arkos.densidade";

const PreferenciasContexto = createContext(null);

function lerInicial(chave, padrao) {
  return localStorage.getItem(chave) ?? padrao;
}

export function ProvedorPreferencias({ children }) {
  const [tema, definirTema] = useState(() => lerInicial(CHAVE_TEMA, "claro"));
  const [densidade, definirDensidade] = useState(() => lerInicial(CHAVE_DENSIDADE, "denso"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "escuro");
    localStorage.setItem(CHAVE_TEMA, tema);
  }, [tema]);

  useEffect(() => {
    localStorage.setItem(CHAVE_DENSIDADE, densidade);
  }, [densidade]);

  const alternarTema = useCallback(() => {
    definirTema((atual) => (atual === "claro" ? "escuro" : "claro"));
  }, []);

  const alternarDensidade = useCallback(() => {
    definirDensidade((atual) => (atual === "denso" ? "confortavel" : "denso"));
  }, []);

  const valor = useMemo(
    () => ({ tema, densidade, alternarTema, alternarDensidade, definirDensidade }),
    [tema, densidade, alternarTema, alternarDensidade]
  );

  return <PreferenciasContexto.Provider value={valor}>{children}</PreferenciasContexto.Provider>;
}

export function usarPreferencias() {
  const contexto = useContext(PreferenciasContexto);
  if (!contexto) throw new Error("usarPreferencias precisa estar dentro de ProvedorPreferencias.");
  return contexto;
}
