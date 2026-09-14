/**
 * Hooks React que ligam a orquestração pura (`sincronizacaoNucleo.js`) à API
 * e ao banco local (`api.js`, `bancoOffline.js`). Sem JSX — só os efeitos.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ErroApi, api } from "./api.js";
import {
  atualizarVendaPendente,
  listarVendasPendentes,
  obterMetaCatalogo,
  produtoParaCatalogo,
  removerVendaPendente,
  salvarCatalogo,
  salvarSessaoUsuario,
} from "./bancoOffline.js";
import {
  INTERVALO_ATUALIZACAO_CATALOGO_MS,
  buscarCatalogoAtualizado,
  processarFilaPendente,
  sincronizarUmaVendaPendente,
} from "./sincronizacaoNucleo.js";

/**
 * Atualiza o catálogo local e a sessão cacheada do usuário a cada
 * `INTERVALO_ATUALIZACAO_CATALOGO_MS`, só enquanto online — offline não tem
 * como buscar nada de novo, e o PDV online já usa a API direto (não depende
 * deste cache). Expõe `ultimaAtualizacaoEm` para a tela mostrar a idade do
 * catálogo local no aviso de modo offline.
 * @param {boolean} online
 * @param {{ id: string, perfil: string, permissoes: Record<string, unknown> } | null} usuario
 */
export function usarAtualizacaoDeCatalogo(online, usuario) {
  const [ultimaAtualizacaoEm, definirUltimaAtualizacaoEm] = useState(null);

  useEffect(() => {
    let cancelado = false;
    obterMetaCatalogo()
      .then((meta) => {
        if (!cancelado) definirUltimaAtualizacaoEm(meta?.atualizado_em ?? null);
      })
      .catch(() => {
        // IndexedDB indisponível — sem idade de catálogo pra mostrar, o resto da tela segue normal.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    let cancelado = false;

    async function atualizar() {
      try {
        const catalogo = await buscarCatalogoAtualizado({
          listarProdutos: () => api.estoque.get("/produtos"),
          buscarProduto: (id) => api.estoque.get(`/produtos/${id}`),
          paraRegistroCatalogo: produtoParaCatalogo,
        });
        if (cancelado) return;
        await salvarCatalogo(catalogo);
        definirUltimaAtualizacaoEm(new Date().toISOString());
      } catch {
        // Falha ao atualizar o catálogo local não afeta o PDV online (que
        // usa a API direto) — só fica sem cache fresco pra quando cair a rede.
      }

      if (usuario && !cancelado) {
        try {
          await salvarSessaoUsuario(usuario);
        } catch {
          // IndexedDB indisponível — sem sessão cacheada, mas o app segue normal.
        }
      }
    }

    atualizar();
    const intervalo = setInterval(atualizar, INTERVALO_ATUALIZACAO_CATALOGO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [online, usuario]);

  return { ultimaAtualizacaoEm };
}

/** Chama POST /vendas/sincronizar-offline e devolve {status, dados} mesmo em erro de negócio. */
async function sincronizarVendaNaApi(payload) {
  try {
    const dados = await api.vendas.post("/sincronizar-offline", payload);
    return { status: 200, dados };
  } catch (falha) {
    // ErroApi = a chamada completou, só que com status de erro (regra de
    // negócio) — repassa pro processarFilaPendente decidir. Qualquer outra
    // coisa é falha de transporte de verdade (rede caiu) e precisa continuar
    // sendo um throw, pra processarFilaPendente parar a fila nesse ponto.
    if (falha instanceof ErroApi) return { status: falha.status, dados: falha.corpo };
    throw falha;
  }
}

/**
 * Dispara `processarFilaPendente` sempre que `online` vira `true`, e expõe
 * `processarAgora` para um botão manual de "sincronizar agora". Uma trava
 * (`emAndamento`) evita duas passadas da fila ao mesmo tempo (reconexão
 * rápida + clique manual, por exemplo).
 * @param {boolean} online
 */
export function usarSincronizadorAutomatico(online) {
  const emAndamento = useRef(false);
  const [processando, definirProcessando] = useState(false);
  const [ultimoResultado, definirUltimoResultado] = useState(null);

  const processarAgora = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    definirProcessando(true);
    try {
      const resultado = await processarFilaPendente({
        listarVendasPendentes,
        sincronizarVenda: sincronizarVendaNaApi,
        removerVendaPendente,
        atualizarVendaPendente,
      });
      definirUltimoResultado(resultado);
    } catch {
      // IndexedDB indisponível ou outra falha ao ler a própria fila — nada a
      // fazer agora; a próxima detecção de "voltou online" tenta de novo.
    } finally {
      emAndamento.current = false;
      definirProcessando(false);
    }
  }, []);

  useEffect(() => {
    if (online) processarAgora();
  }, [online, processarAgora]);

  return { processando, ultimoResultado, processarAgora };
}

/**
 * Tenta de novo uma única venda da fila que ficou com status `erro` — botão
 * manual da tela de conferência gerencial (Fase 6). Reaproveita o mesmo
 * `sincronizarVendaNaApi` e a mesma lógica de decisão de
 * `sincronizarUmaVendaPendente` do sincronizador automático, só que para uma
 * venda por vez, sob comando explícito do gerente.
 * @param {{ id: string, payload: object, tentativas?: number }} registro
 */
export function tentarNovamenteVendaPendente(registro) {
  return sincronizarUmaVendaPendente({
    registro,
    sincronizarVenda: sincronizarVendaNaApi,
    removerVendaPendente,
    atualizarVendaPendente,
  });
}
