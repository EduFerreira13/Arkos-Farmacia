import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { PERFIL_LABEL } from "@arkos/shared-types";
import { Botao } from "./Botao.jsx";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";

/**
 * Tour do primeiro acesso.
 *
 * Cada passo aponta para um elemento marcado com `data-tour`. O cartão é medido
 * de verdade antes de ser posicionado e escolhe o lado com espaço, então não
 * cobre o que está explicando nem sai da tela. Só entram os passos que o perfil
 * pode ver — o operador de caixa não é apresentado ao que não pode abrir.
 */

const CHAVE_BASE = "arkos.tour.visto";

export const chaveDoTour = (usuarioId) => `${CHAVE_BASE}.${usuarioId ?? "anonimo"}`;

/**
 * Poucos passos, um por área do menu. O roteiro é sobre onde as coisas ficam,
 * não sobre como cada tela funciona.
 */
const PASSOS = [
  {
    id: "boas-vindas",
    titulo: "Bem-vindo ao Arkos",
    texto:
      "São seis áreas no menu à esquerda e um painel com os números do dia. Em menos de um minuto mostramos onde fica cada coisa. A apresentação pode ser encerrada a qualquer momento.",
  },
  {
    id: "indicadores",
    alvo: "[data-tour='indicadores']",
    titulo: "Os números do dia",
    texto:
      "Vendas de hoje, lotes vencendo, produtos abaixo do mínimo e ticket médio.",
  },
  {
    id: "vendas",
    alvo: "[data-tour='menu-vendas']",
    permissao: "vender",
    titulo: "Vendas",
    texto:
      "O ponto de venda fica aqui dentro, junto do movimento do dia, do histórico e do relacionamento com clientes. Medicamento controlado só fecha com a receita registrada.",
  },
  {
    id: "estoque",
    alvo: "[data-tour='menu-estoque']",
    permissao: "consultar_estoque",
    titulo: "Estoque",
    texto:
      "Produtos, entradas e saídas, inventário e alertas. O controle é por lote e validade: a saída consome primeiro o que vence antes.",
  },
  {
    id: "compras",
    alvo: "[data-tour='menu-compras']",
    permissao: "ajustar_estoque",
    titulo: "Compras",
    texto:
      "Pedido ao fornecedor e conferência do recebimento. O que chega entra no estoque e vira conta a pagar sozinho.",
  },
  {
    id: "financeiro",
    alvo: "[data-tour='menu-financeiro']",
    permissao: "vender",
    titulo: "Financeiro",
    texto:
      "O caixa do turno fica aqui: abra antes de vender, porque sem caixa aberto a venda não finaliza. No fechamento o sistema confere o esperado contra o que você contou.",
  },
  {
    id: "cadastros",
    alvo: "[data-tour='menu-cadastros']",
    permissao: "vender",
    titulo: "Cadastros",
    texto: "Fornecedores, clientes e usuários. Cliente cadastrado alimenta o relacionamento.",
  },
  {
    id: "ajuda",
    alvo: "[data-tour='ajuda']",
    titulo: "Tema e ajuda",
    texto:
      "Modo claro ou escuro fica guardado no seu navegador, e o ponto de interrogação reabre este tour quando quiser.",
  },
];

const LARGURA_CARTAO = 340;
const FOLGA = 16;
const MARGEM_TELA = 16;

export function Tour({ aoEncerrar }) {
  const { usuario } = usarAutenticacao();
  const [indice, definirIndice] = useState(0);
  const [area, definirArea] = useState(null);
  const [posicao, definirPosicao] = useState(null);
  const cartaoRef = useRef(null);

  // Só entram os passos permitidos ao perfil e cujo elemento existe na tela.
  const passos = useMemo(
    () =>
      PASSOS.filter((passo) => !passo.permissao || temPermissao(usuario, passo.permissao)).filter(
        (passo) => !passo.alvo || document.querySelector(passo.alvo)
      ),
    [usuario]
  );

  const passo = passos[indice];

  /** Mede o alvo e escolhe onde o cartão cabe sem cobrir o que explica. */
  const posicionar = useCallback(() => {
    if (!passo?.alvo) {
      definirArea(null);
      definirPosicao(null);
      return;
    }

    const elemento = document.querySelector(passo.alvo);
    if (!elemento) {
      definirArea(null);
      definirPosicao(null);
      return;
    }

    const alvo = elemento.getBoundingClientRect();
    const alturaCartao = cartaoRef.current?.offsetHeight ?? 220;
    const larguraJanela = window.innerWidth;
    const alturaJanela = window.innerHeight;

    const cabeDireita = alvo.right + FOLGA + LARGURA_CARTAO + MARGEM_TELA < larguraJanela;
    const cabeEsquerda = alvo.left - FOLGA - LARGURA_CARTAO - MARGEM_TELA > 0;
    const cabeAbaixo = alvo.bottom + FOLGA + alturaCartao + MARGEM_TELA < alturaJanela;

    const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo);

    let lado;
    let esquerda;
    let topo;

    if (cabeDireita) {
      lado = "esquerda"; // a seta do cartão aponta para a esquerda, onde está o alvo
      esquerda = alvo.right + FOLGA;
      topo = limitar(
        alvo.top + alvo.height / 2 - alturaCartao / 2,
        MARGEM_TELA,
        alturaJanela - alturaCartao - MARGEM_TELA
      );
    } else if (cabeEsquerda) {
      lado = "direita";
      esquerda = alvo.left - FOLGA - LARGURA_CARTAO;
      topo = limitar(
        alvo.top + alvo.height / 2 - alturaCartao / 2,
        MARGEM_TELA,
        alturaJanela - alturaCartao - MARGEM_TELA
      );
    } else if (cabeAbaixo) {
      lado = "cima";
      topo = alvo.bottom + FOLGA;
      esquerda = limitar(
        alvo.left + alvo.width / 2 - LARGURA_CARTAO / 2,
        MARGEM_TELA,
        larguraJanela - LARGURA_CARTAO - MARGEM_TELA
      );
    } else {
      lado = "baixo";
      topo = Math.max(alvo.top - FOLGA - alturaCartao, MARGEM_TELA);
      esquerda = limitar(
        alvo.left + alvo.width / 2 - LARGURA_CARTAO / 2,
        MARGEM_TELA,
        larguraJanela - LARGURA_CARTAO - MARGEM_TELA
      );
    }

    definirArea({ topo: alvo.top, esquerda: alvo.left, largura: alvo.width, altura: alvo.height });
    definirPosicao({ topo, esquerda, lado, centroAlvo: alvo.top + alvo.height / 2 });
  }, [passo]);

  // Traz o alvo para a tela antes de medir — passo em lista longa pode estar fora.
  useLayoutEffect(() => {
    if (passo?.alvo) {
      document.querySelector(passo.alvo)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    posicionar();

    // Mede de novo depois da pintura, já com a altura real do cartão. Em
    // ambiente sem animação de quadro (teste), a primeira medida já serve.
    if (typeof window.requestAnimationFrame !== "function") return undefined;
    const id = window.requestAnimationFrame(posicionar);
    return () => window.cancelAnimationFrame(id);
  }, [posicionar, passo]);

  useEffect(() => {
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [posicionar]);

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

  const avancar = useCallback(
    () => definirIndice((atual) => Math.min(atual + 1, passos.length - 1)),
    [passos.length]
  );
  const voltar = useCallback(() => definirIndice((atual) => Math.max(atual - 1, 0)), []);

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") encerrar();
      if (evento.key === "ArrowRight" || evento.key === "Enter") avancar();
      if (evento.key === "ArrowLeft") voltar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [encerrar, avancar, voltar]);

  if (!passo) return null;

  const ultimo = indice === passos.length - 1;

  /** Seta do cartão apontando para o alvo. */
  const seta = () => {
    if (!posicao) return null;

    const base = "absolute h-3 w-3 rotate-45 border border-borda bg-card";
    if (posicao.lado === "esquerda") {
      const deslocamento = Math.min(
        Math.max(posicao.centroAlvo - posicao.topo - 6, 16),
        (cartaoRef.current?.offsetHeight ?? 220) - 28
      );
      return (
        <span
          className={`${base} border-b-0 border-r-0`}
          style={{ left: -7, top: deslocamento }}
          aria-hidden="true"
        />
      );
    }
    if (posicao.lado === "direita") {
      const deslocamento = Math.min(
        Math.max(posicao.centroAlvo - posicao.topo - 6, 16),
        (cartaoRef.current?.offsetHeight ?? 220) - 28
      );
      return (
        <span
          className={`${base} border-l-0 border-t-0`}
          style={{ right: -7, top: deslocamento }}
          aria-hidden="true"
        />
      );
    }
    if (posicao.lado === "cima") {
      return (
        <span
          className={`${base} border-b-0 border-r-0`}
          style={{ top: -7, left: LARGURA_CARTAO / 2 - 6 }}
          aria-hidden="true"
        />
      );
    }
    return (
      <span
        className={`${base} border-l-0 border-t-0`}
        style={{ bottom: -7, left: LARGURA_CARTAO / 2 - 6 }}
        aria-hidden="true"
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={`Tour do sistema — ${passo.titulo}`}
    >
      {/* Camada que segura o clique: sem ela dava para clicar no menu por baixo
          do tour e acabar em outra tela no meio da explicação. */}
      <div className="absolute inset-0" role="presentation" />

      {/* Destaque: o furo é o próprio elemento, o resto da tela escurece. */}
      {area ? (
        <div
          className="pointer-events-none absolute rounded-botao ring-2 ring-ciano transition-all duration-200"
          style={{
            top: area.topo - 6,
            left: area.esquerda - 6,
            width: area.largura + 12,
            height: area.altura + 12,
            boxShadow: "0 0 0 9999px rgba(9, 14, 22, 0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(9,14,22,0.6)]" />
      )}

      <section
        ref={cartaoRef}
        className="absolute rounded-card border border-borda bg-card p-5 shadow-flutuante"
        style={
          posicao
            ? { top: posicao.topo, left: posicao.esquerda, width: LARGURA_CARTAO }
            : {
                top: "50%",
                left: "50%",
                width: LARGURA_CARTAO,
                transform: "translate(-50%, -50%)",
              }
        }
      >
        {posicao ? seta() : null}

        <div className="flex items-start justify-between gap-3">
          <h2 className="text-h3 text-texto">{passo.titulo}</h2>
          <button
            type="button"
            onClick={encerrar}
            aria-label="Fechar tour"
            className="-mr-1 -mt-1 rounded-botao p-1 text-secundario hover:bg-borda/60 focus-visible:foco-arkos"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-corpo leading-6 text-secundario">{passo.texto}</p>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {passos.map((item, posicaoPasso) => (
            <span
              key={item.id}
              className={`h-1.5 rounded-full transition-all ${
                posicaoPasso === indice
                  ? "w-5 bg-primario"
                  : posicaoPasso < indice
                    ? "w-1.5 bg-primario/50"
                    : "w-1.5 bg-borda"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-rotulo text-secundario">
            {indice + 1} de {passos.length}
            {usuario?.perfil ? ` — ${PERFIL_LABEL[usuario.perfil] ?? usuario.perfil}` : ""}
          </span>

          <div className="flex items-center gap-2">
            {indice > 0 ? (
              <Botao tamanho="pequeno" variante="fantasma" icone={ArrowLeft} onClick={voltar}>
                Voltar
              </Botao>
            ) : (
              <button
                type="button"
                onClick={encerrar}
                className="rounded-botao px-2 py-1 text-rotulo text-secundario hover:bg-borda/60 focus-visible:foco-arkos"
              >
                Pular
              </button>
            )}

            {ultimo ? (
              <Botao tamanho="pequeno" onClick={encerrar}>
                Começar a usar
              </Botao>
            ) : (
              <Botao tamanho="pequeno" icone={ArrowRight} onClick={avancar}>
                Próximo
              </Botao>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
