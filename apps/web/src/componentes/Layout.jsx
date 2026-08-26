import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  ClipboardList,
  Eye,
  FileText,
  HeartHandshake,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PieChart,
  ScrollText,
  ShoppingCart,
  Stethoscope,
  Sun,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { PERFIL_LABEL, PERFIS, PERFIS_LISTA } from "@arkos/shared-types";
import { Logo, Simbolo } from "./Logo.jsx";
import { Botao, BotaoIcone } from "./Botao.jsx";
import { Tour, chaveDoTour } from "./Tour.jsx";
import { usarPreferencias } from "../lib/preferencias.jsx";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";

/**
 * Menu em grupos: o primeiro nível são as áreas da farmácia, as telas ficam
 * dentro delas. Com quase vinte telas, a lista corrida virava uma parede de
 * links — assim a pessoa vê seis entradas e abre só a que interessa.
 *
 * Cada item declara a permissão necessária. Sem ela, o item não aparece; se
 * nenhum item de um grupo aparecer, o grupo some junto (as rotas em App.jsx
 * barram o acesso direto pela URL).
 */
export const SECOES = [
  { id: "dashboard", rotulo: "Dashboard", icone: LayoutDashboard, para: "/", fim: true },
  {
    id: "vendas",
    rotulo: "Vendas",
    icone: ShoppingCart,
    itens: [
      { para: "/pdv", rotulo: "Ponto de venda", icone: ShoppingCart, permissao: "vender" },
      { para: "/vendas/historico", rotulo: "Histórico", icone: History, permissao: "vender" },
      {
        para: "/relacionamento",
        rotulo: "Relacionamento",
        icone: HeartHandshake,
        permissao: "vender",
      },
    ],
  },
  {
    id: "estoque",
    rotulo: "Estoque",
    icone: Package,
    itens: [
      { para: "/produtos", rotulo: "Produtos", icone: Package, permissao: "consultar_estoque" },
      {
        para: "/movimentacoes",
        rotulo: "Entradas e saídas",
        icone: ArrowLeftRight,
        permissao: "ajustar_estoque",
      },
      {
        para: "/inventario",
        rotulo: "Inventário",
        icone: ClipboardList,
        permissao: "ajustar_estoque",
      },
      { para: "/alertas", rotulo: "Alertas", icone: AlertTriangle, permissao: "consultar_estoque" },
    ],
  },
  {
    id: "compras",
    rotulo: "Compras",
    icone: Truck,
    itens: [
      { para: "/compras", rotulo: "Pedidos", icone: Truck, permissao: "ajustar_estoque" },
      {
        para: "/compras/sugestao",
        rotulo: "Sugestão de compra",
        icone: ClipboardList,
        permissao: "ajustar_estoque",
      },
    ],
  },
  {
    id: "financeiro",
    rotulo: "Financeiro",
    icone: Wallet,
    itens: [
      { para: "/financeiro", rotulo: "Visão geral", icone: PieChart, permissao: "ver_financeiro" },
      { para: "/caixa", rotulo: "Caixa", icone: Wallet, permissao: "vender" },
      { para: "/contas", rotulo: "Contas", icone: FileText, permissao: "ver_financeiro" },
    ],
  },
  {
    id: "fiscal",
    rotulo: "Fiscal",
    icone: ScrollText,
    itens: [
      { para: "/fiscal/notas", rotulo: "Notas fiscais", icone: ScrollText, permissao: "vender" },
      {
        para: "/fiscal/controlados",
        rotulo: "Controlados (SNGPC)",
        icone: Stethoscope,
        permissao: "validar_receita",
      },
      {
        para: "/fiscal/receitas",
        rotulo: "Receitas retidas",
        icone: ScrollText,
        permissao: "validar_receita",
      },
    ],
  },
  {
    id: "relatorios",
    rotulo: "Relatórios",
    icone: BarChart3,
    para: "/relatorios",
    permissao: "ver_financeiro",
  },
  {
    id: "cadastros",
    rotulo: "Cadastros",
    icone: Users,
    itens: [
      {
        para: "/cadastros/fornecedores",
        rotulo: "Fornecedores",
        icone: Truck,
        permissao: "ajustar_estoque",
      },
      { para: "/cadastros/clientes", rotulo: "Clientes", icone: Users, permissao: "vender" },
      {
        para: "/cadastros/usuarios",
        rotulo: "Usuários",
        icone: Users,
        permissao: "gerenciar_usuarios",
      },
    ],
  },
];

const emOrdem = (lista) =>
  [...lista].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

/**
 * Grupos e itens que o perfil pode ver, em ordem alfabética. O Dashboard fica
 * fora da ordenação: é a tela inicial e por isso vem sempre em primeiro.
 */
function filtrarMenu(usuario) {
  const visiveis = SECOES.map((secao) => {
    if (!secao.itens) {
      return !secao.permissao || temPermissao(usuario, secao.permissao) ? secao : null;
    }
    const itens = secao.itens.filter(
      (item) => !item.permissao || temPermissao(usuario, item.permissao)
    );
    return itens.length ? { ...secao, itens: emOrdem(itens) } : null;
  }).filter(Boolean);

  const dashboard = visiveis.filter((secao) => secao.id === "dashboard");
  const demais = visiveis.filter((secao) => secao.id !== "dashboard");
  return [...dashboard, ...emOrdem(demais)];
}

const estiloLink = ({ isActive }) =>
  [
    "flex items-center gap-3 rounded-botao px-3 py-2 text-corpo transition-colors",
    isActive ? "bg-primario text-white" : "text-secundario hover:bg-borda/60 hover:text-texto",
  ].join(" ");

function Sidebar({ recolhida, aoAlternar, usuario, aoExpandir }) {
  const local = useLocation();
  const menu = useMemo(() => filtrarMenu(usuario), [usuario]);

  // Abre sozinho o grupo da tela em que a pessoa está.
  const grupoDaRota = useMemo(() => {
    const encontrado = menu.find((secao) =>
      secao.itens?.some((item) => local.pathname.startsWith(item.para))
    );
    return encontrado?.id ?? null;
  }, [menu, local.pathname]);

  const [aberto, definirAberto] = useState(grupoDaRota);

  useEffect(() => {
    if (grupoDaRota) definirAberto(grupoDaRota);
  }, [grupoDaRota]);

  return (
    <aside
      data-tour="menu"
      className={[
        "flex shrink-0 flex-col border-r border-borda bg-card transition-all duration-200",
        recolhida ? "w-sidebar-recolhida" : "w-sidebar",
      ].join(" ")}
    >
      <div
        className={`flex h-16 items-center border-b border-borda ${
          recolhida ? "justify-center px-2" : "justify-between px-3 pl-4"
        }`}
      >
        {recolhida ? <Simbolo tamanho={28} /> : <Logo tamanho={28} />}
        {/* O controle de recolher fica junto da marca, no alto: é onde a pessoa
            procura, e não some no rodapé de uma lista longa. */}
        {recolhida ? null : (
          <BotaoIcone icone={ChevronsLeft} rotulo="Recolher menu" onClick={aoAlternar} />
        )}
      </div>

      {recolhida ? (
        <div className="flex justify-center border-b border-borda py-2">
          <BotaoIcone icone={ChevronsRight} rotulo="Expandir menu" onClick={aoAlternar} />
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {menu.map((secao) => {
          const Icone = secao.icone;

          // Grupo com uma tela só vira link direto: não faz sentido abrir nada.
          if (!secao.itens) {
            return (
              <NavLink
                key={secao.id}
                to={secao.para}
                end={secao.fim}
                data-tour={`menu-${secao.id}`}
                title={recolhida ? secao.rotulo : undefined}
                className={({ isActive }) =>
                  `${estiloLink({ isActive })} ${recolhida ? "justify-center px-0" : ""}`
                }
              >
                <Icone size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                {recolhida ? null : <span className="truncate">{secao.rotulo}</span>}
              </NavLink>
            );
          }

          const expandido = aberto === secao.id;
          const temTelaAtiva = secao.itens.some((item) => local.pathname.startsWith(item.para));

          return (
            <div key={secao.id}>
              <button
                type="button"
                data-tour={`menu-${secao.id}`}
                title={recolhida ? secao.rotulo : undefined}
                aria-expanded={recolhida ? undefined : expandido}
                onClick={() => {
                  // Recolhida, o clique abre a barra e o grupo junto: sem isso a
                  // pessoa clicaria no ícone e nada apareceria.
                  if (recolhida) aoExpandir();
                  definirAberto(expandido && !recolhida ? null : secao.id);
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-botao px-3 py-2 text-corpo transition-colors",
                  recolhida ? "justify-center px-0" : "",
                  temTelaAtiva
                    ? "text-texto"
                    : "text-secundario hover:bg-borda/60 hover:text-texto",
                ].join(" ")}
              >
                <Icone size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                {recolhida ? null : (
                  <>
                    <span className="flex-1 truncate text-left">{secao.rotulo}</span>
                    {temTelaAtiva && !expandido ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-primario" aria-hidden="true" />
                    ) : null}
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>

              {expandido && !recolhida ? (
                <div className="mt-0.5 space-y-0.5 border-l border-borda pb-1 pl-3 ml-4">
                  {secao.itens.map((item) => (
                    <NavLink
                      key={item.para}
                      to={item.para}
                      end={item.fim}
                      data-tour={`menu-${item.para}`}
                      className={({ isActive }) => `${estiloLink({ isActive })} py-1.5`}
                    >
                      <item.icone
                        size={16}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="shrink-0"
                      />
                      <span className="truncate">{item.rotulo}</span>
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}

/** Seletor de simulação de perfil — aparece só para o administrador. */
function SeletorDeVisao({ usuario, perfilReal, simulando, aoSimular, ocupado }) {
  const navegar = useNavigate();
  if (perfilReal !== PERFIS.ADMINISTRADOR) return null;

  const valorAtual = simulando ? usuario.perfil : PERFIS.ADMINISTRADOR;

  return (
    <label className="flex items-center gap-2">
      <Eye size={16} aria-hidden="true" className="text-secundario" />
      <span className="sr-only">Ver o sistema como outro perfil</span>
      <select
        value={valorAtual}
        disabled={ocupado}
        onChange={async (evento) => {
          await aoSimular(evento.target.value);
          navegar("/");
        }}
        className="h-9 rounded-botao border border-borda bg-fundo px-2 text-rotulo text-texto focus-visible:foco-arkos"
      >
        <option value={PERFIS.ADMINISTRADOR}>Ver como: Administrador</option>
        {PERFIS_LISTA.filter((perfil) => perfil !== PERFIS.ADMINISTRADOR).map((perfil) => (
          <option key={perfil} value={perfil}>
            Ver como: {PERFIL_LABEL[perfil]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Topbar({ usuario, perfilReal, simulando, aoSair, aoSimular, aoVerTour, ocupado }) {
  const { tema, alternarTema } = usarPreferencias();

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-borda bg-card px-5">
      <div className="ml-auto flex items-center gap-1">
        <SeletorDeVisao
          usuario={usuario}
          perfilReal={perfilReal}
          simulando={simulando}
          aoSimular={aoSimular}
          ocupado={ocupado}
        />

        <div className="mx-2 h-8 w-px bg-borda" aria-hidden="true" />

        <BotaoIcone icone={Bell} rotulo="Notificações" />
        <span data-tour="ajuda" className="flex items-center gap-1">
          <BotaoIcone
            icone={tema === "claro" ? Moon : Sun}
            rotulo={tema === "claro" ? "Ativar modo escuro" : "Ativar modo claro"}
            onClick={alternarTema}
          />
          <BotaoIcone icone={CircleHelp} rotulo="Rever o tour do sistema" onClick={aoVerTour} />
        </span>

        <div className="mx-2 h-8 w-px bg-borda" aria-hidden="true" />

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-corpo font-medium text-texto">{usuario?.nome}</p>
            <p className="text-rotulo text-secundario">
              {PERFIL_LABEL[usuario?.perfil] ?? usuario?.perfil}
            </p>
          </div>
          <BotaoIcone icone={LogOut} rotulo="Sair" onClick={aoSair} />
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  const [recolhida, definirRecolhida] = useState(false);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState(null);
  const [tourAberto, definirTourAberto] = useState(false);
  const { usuario, sair, simular, encerrarSimulacao, simulando, perfilReal } = usarAutenticacao();
  const navegar = useNavigate();

  /**
   * Primeiro acesso de cada usuário abre o tour. Ao simular outro perfil ele
   * também aparece, porque o roteiro muda conforme o que o perfil enxerga.
   */
  useEffect(() => {
    if (!usuario?.id) return;
    let visto = null;
    try {
      visto = localStorage.getItem(
        chaveDoTour(simulando ? `${usuario.id}.${usuario.perfil}` : usuario.id)
      );
    } catch {
      visto = "sim"; // Sem armazenamento, não insiste.
    }
    if (!visto) definirTourAberto(true);
  }, [usuario?.id, usuario?.perfil, simulando]);

  async function trocarVisao(perfil) {
    definirErro(null);
    definirOcupado(true);
    try {
      if (perfil === PERFIS.ADMINISTRADOR) await encerrarSimulacao();
      else if (simulando) {
        await encerrarSimulacao();
        await simular(perfil);
      } else {
        await simular(perfil);
      }
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirOcupado(false);
    }
  }

  function abrirTour() {
    // O roteiro fala dos números do dia: começa no dashboard, com a barra aberta.
    definirRecolhida(false);
    navegar("/");
    definirTourAberto(true);
  }

  return (
    <div className="flex h-full bg-fundo">
      <Sidebar
        recolhida={recolhida}
        aoAlternar={() => definirRecolhida((atual) => !atual)}
        aoExpandir={() => definirRecolhida(false)}
        usuario={usuario}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          usuario={usuario}
          perfilReal={perfilReal}
          simulando={simulando}
          aoSair={sair}
          aoSimular={trocarVisao}
          aoVerTour={abrirTour}
          ocupado={ocupado}
        />

        {/* Enquanto o administrador simula outro perfil, fica claro na tela. */}
        {simulando ? (
          <div className="flex shrink-0 items-center justify-between gap-4 bg-alerta/20 px-5 py-2">
            <p className="text-corpo text-texto">
              Você está vendo o sistema como{" "}
              <strong>{PERFIL_LABEL[usuario.perfil] ?? usuario.perfil}</strong>. As permissões
              limitadas desse perfil valem também para as ações.
            </p>
            <Botao
              tamanho="pequeno"
              variante="secundario"
              disabled={ocupado}
              onClick={async () => {
                await trocarVisao(PERFIS.ADMINISTRADOR);
                navegar("/");
              }}
            >
              Voltar a ser administrador
            </Botao>
          </div>
        ) : null}

        {erro ? (
          <div className="shrink-0 bg-erro/15 px-5 py-2 text-corpo text-erro" role="alert">
            {erro}
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto px-8 py-7">
          <Outlet />
        </main>
      </div>

      {tourAberto ? <Tour aoEncerrar={() => definirTourAberto(false)} /> : null}
    </div>
  );
}
