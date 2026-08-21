import { useCallback, useEffect, useState } from "react";

/**
 * Busca de dados com estados de carregando/erro e recarga manual.
 * @template T
 * @param {() => Promise<T>} buscar
 * @param {unknown[]} dependencias
 */
export function usarBusca(buscar, dependencias = []) {
  const [dados, definirDados] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [erro, definirErro] = useState(null);
  const [gatilho, definirGatilho] = useState(0);

  const recarregar = useCallback(() => definirGatilho((n) => n + 1), []);

  useEffect(() => {
    let cancelado = false;
    definirCarregando(true);
    definirErro(null);

    buscar()
      .then((resultado) => {
        if (!cancelado) definirDados(resultado);
      })
      .catch((falha) => {
        if (!cancelado) definirErro(falha);
      })
      .finally(() => {
        if (!cancelado) definirCarregando(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, gatilho]);

  return { dados, carregando, erro, recarregar };
}
