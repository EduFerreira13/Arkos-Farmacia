import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { PERFIL_LABEL } from "@arkos/shared-types";
import { Botao } from "./Botao.jsx";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";

/**
 * Tour do primeiro acesso.
 *
 * Cada passo aponta para um elemento marcado com `data-tour` e só entra na
 * sequência se o perfil tiver a permissão correspondente — o operador de caixa
 * não é apresentado a telas que ele não pode abrir. Fica guardado por usuário no
 * navegador; a topbar tem um botão para rever quando quiser.
 */

const CHAVE_BASE = "arkos.tour.visto";

export const chaveDoTour = (usuarioId) => `${CHAVE_BASE}.${usuarioId ?? "anonimo"}`;

/** Um passo por lugar que a pessoa precisa saber que existe. */
const PASSOS = [
  {
    id: "boas-vindas",
    alvo: null,
    titulo: "Bem-vindo ao Arkos",
    texto:
      "Vou mostrar em menos de um minuto onde fica cada coisa. Você pode sair a qualquer momento e rever depois pelo botão de ajuda na barra de cima.",
  },
  {
    id: "indicadores",
    alvo: "[data-tour='indicadores']",
    titulo: "Os números do dia",
    texto:
      "Vendas, produtos a vencer, estoque abaixo do mínimo e ticket médio, sempre do dia de hoje e com a variação contra ontem.",
  },
  {
    id: "pdv",
    alvo: "[data-tour='menu-/pdv']",
    permissao: "vender",
    titulo: "Ponto de venda",
    texto:
      "É aqui que a venda acontece: busca o produto, monta o carrinho, aplica desconto em reais ou porcentagem e recebe. Item controlado só fecha com a receita registrada.",
  },
  {
    id: "caixa",
    alvo: "[data-tour='menu-/caixa']",
    permissao: "vender",
    titulo: "Caixa do turno",
    texto:
      "Abra o caixa antes de vender: sem caixa aberto a venda não finaliza. No fim do turno o sistema compara o valor esperado com o que você contou na gaveta.",
  },
  {
    id: "estoque",
    alvo: "[data-tour='menu-/produtos']",
    permissao: "consultar_estoque",
    titulo: "Estoque por lote e validade",
    texto:
      "Cada produto tem lotes com validade. A saída sempre consome primeiro o que vence antes, e lote vencido fica fora do saldo disponível.",
  },
  {
    id: "movimentacoes",
    alvo: "[data-tour='menu-/movimentacoes']",
    permissao: "ajustar_estoque",
    titulo: "Entradas, saídas e inventário",
    texto:
      "Entrada de lote, saída avulsa e perda com justificativa. O inventário compara a contagem física lote a lote e registra a diferença com o seu nome.",
  },
  {
    id: "compras",
    alvo: "[data-tour='menu-/compras']",
    permissao: "ajustar_estoque",
    titulo: "Compras com conferência",
    texto:
      "O pedido nasce em rascunho, vai ao fornecedor e volta na conferência item a item. O que chegou entra no estoque e vira conta a pagar automaticamente.",
  },
  {
    id: "relacionamento",
    alvo: "[data-tour='menu-/relacionamento']",
    permissao: "vender",
    titulo: "Relacionamento com clientes",
    texto:
      "A lista de quem ligar hoje: quem está atrasado na reposição do remédio de uso contínuo, quem sumiu, e o que oferecer a cada um com base no que já compra.",
  },
  {
    id: "financeiro",
    alvo: "[data-tour='menu-/financeiro']",
    permissao: "ver_financeiro",
    titulo: "Financeiro",
    texto:
      "A visão geral cruza o que há para pagar com o que há para receber, por faixa de vencimento. Contas e caixa ficam logo abaixo.",
  },
  {
    id: "relatorios",
    alvo: "[data-tour='menu-/relatorios']",
    permissao: "ver_financeiro",
    titulo: "Relatórios e margem",
    texto:
      "Mais vendidos, margem por produto e curva ABC. Toda tela com lista tem também o botão de exportar planilha com filtro de período.",
  },
  {
    id: "tema",
    alvo: "[data-tour='tema']",
    titulo: "Modo claro ou escuro",
    texto: "A preferência fica guardada no seu navegador. O ícone de ajuda ao lado reabre este tour.",
  },
];

/** Distância entre o recorte e o cartão de texto. */
const FOLGA = 14;

export function Tour({ aoEncerrar }) {
  const { usuario } = usarAutenticacao();
  const [indice, definirIndice] = useState(0);
  const [area, definirArea] = useState(null);

  // Só entram os passos que o perfil pode ver e cujo elemento existe na tela.
  const passos = useMemo(
    () =>
      PASSOS.filter((passo) => !passo.permissao || temPermissao(usuario, passo.permissao)).filter(
        (passo) => !passo.alvo || document.querySelector(passo.alvo)
      ),
    [usuario]
  );

  const passo = passos[indice];

  const medir = useCallback(() => {
    if (!passo?.alvo) {
      definirArea(null);
      return;
    }
    const elemento = document.querySelector(passo.alvo);
    if (!elemento) {
      definirArea(null);
      return;
    }
    const caixa = elemento.getBoundingClientRect();
    definirArea({ topo: caixa.top, esquerda: caixa.left, largura: caixa.width, altura: caixa.height });
  }, [passo]);

  useLayoutEffect(medir, [medir]);

  useEffect(() => {
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [medir]);

  const encerrar = useCallback(() => {
    try {
      // Em simulação, marca por perfil: o roteiro do gerente não vale pelo caixa.
      const chave = usuario?.simulando
        ? chaveDoTour(`${usuario.id}.${usuario.perfil}`)
        : chaveDoTour(usuario?.id);
      localStorage.setItem(chave, "sim");
    } catch {
      // Navegador sem armazenamento: o tour volta na próxima entrada, sem quebrar.
    }
    aoEncerrar();
  }, [aoEncerrar, usuario]);

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") encerrar();
      if (evento.key === "ArrowRight") definirIndice((atual) => Math.min(atual + 1, passos.length - 1));
      if (evento.key === "ArrowLeft") definirIndice((atual) => Math.max(atual - 1, 0));
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [encerrar, passos.length]);

  if (!passo) return null;

  const ultimo = indice === passos.length - 1;

  // Cartão ao lado do elemento destacado; centralizado quando não há alvo.
  const posicaoCartao = area
    ? {
        top: Math.min(Math.max(area.topo, 80), window.innerHeight - 260),
        left:
          area.esquerda + area.largura + FOLGA + 360 < window.innerWidth
            ? area.esquerda + area.largura + FOLGA
            : Math.max(area.esquerda - 360 - FOLGA, 24),
      }
    : null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Tour do sistema">
      {/* Recorte: o furo é o próprio elemento, o resto escurece. */}
      {area ? (
        <div
          className="pointer-events-none absolute rounded-botao ring-2 ring-ciano transition-all duration-200"
          style={{
            top: area.topo - 6,
            left: area.esquerda - 6,
            width: area.largura + 12,
            height: area.altura + 12,
            boxShadow: "0 0 0 9999px rgba(9, 14, 22, 0.62)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(9,14,22,0.62)]" />
      )}

      <section
        className="absolute w-[360px] rounded-card border border-borda bg-card p-5 shadow-flutuante"
        style={
          posicaoCartao ?? {
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-rotulo text-secundario">
              Passo {indice + 1} de {passos.length}
              {usuario?.perfil ? ` — visão de ${PERFIL_LABEL[usuario.perfil] ?? usuario.perfil}` : ""}
            </p>
            <h2 className="mt-1 text-h3 text-texto">{passo.titulo}</h2>
          </div>
          <button
            type="button"
            onClick={encerrar}
            aria-label="Fechar tour"
            className="rounded-botao p-1 text-secundario hover:bg-borda/60 focus-visible:foco-arkos"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-corpo leading-6 text-secundario">{passo.texto}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={encerrar}
            className="rounded-botao px-2 py-1 text-rotulo text-secundario hover:bg-borda/60 focus-visible:foco-arkos"
          >
            Pular tour
          </button>

          <div className="flex items-center gap-2">
            {indice > 0 ? (
              <Botao
                tamanho="pequeno"
                variante="secundario"
                icone={ArrowLeft}
                onClick={() => definirIndice(indice - 1)}
              >
                Voltar
              </Botao>
            ) : null}
            {ultimo ? (
              <Botao tamanho="pequeno" onClick={encerrar}>
                Começar a usar
              </Botao>
            ) : (
              <Botao tamanho="pequeno" icone={ArrowRight} onClick={() => definirIndice(indice + 1)}>
                Próximo
              </Botao>
            )}
          </div>
        </div>

        {/* Trilha de progresso: dá a dimensão do que falta. */}
        <div className="mt-4 flex gap-1">
          {passos.map((item, posicao) => (
            <span
              key={item.id}
              className={`h-1 flex-1 rounded-full ${
                posicao <= indice ? "bg-primario" : "bg-borda"
              }`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
