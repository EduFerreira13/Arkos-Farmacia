import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Preferências do usuário guardadas no navegador: tema claro/escuro (§6).
 * A densidade de tabela é sempre densa — a operação é em tela grande e com
 * muita linha, e o modo confortável só tirava informação de vista.
 */

const CHAVE_TEMA = "arkos.tema";

const PreferenciasContexto = createContext(null);

function lerInicial(chave, padrao) {
  return localStorage.getItem(chave) ?? padrao;
}

export function ProvedorPreferencias({ children }) {
  const [tema, definirTema] = useState(() => lerInicial(CHAVE_TEMA, "claro"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "escuro");
    localStorage.setItem(CHAVE_TEMA, tema);
  }, [tema]);

  const alternarTema = useCallback(() => {
    definirTema((atual) => (atual === "claro" ? "escuro" : "claro"));
  }, []);

  const valor = useMemo(() => ({ tema, alternarTema }), [tema, alternarTema]);

  return <PreferenciasContexto.Provider value={valor}>{children}</PreferenciasContexto.Provider>;
}

export function usarPreferencias() {
  const contexto = useContext(PreferenciasContexto);
  if (!contexto) throw new Error("usarPreferencias precisa estar dentro de ProvedorPreferencias.");
  return contexto;
}
