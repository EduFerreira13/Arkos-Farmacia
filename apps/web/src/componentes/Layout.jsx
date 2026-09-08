import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
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
  PackageMinus,
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
import { Logo } from "./Logo.jsx";
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
      {
        para: "/perdas",
        rotulo: "Perdas e avarias",
        icone: PackageMinus,
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
  // Com a sugestão de compra fora do ar, Compras ficou com uma tela só — e
  // grupo de um item é uma gaveta que a pessoa abre para achar o que já estava
  // à vista. Volta a ser grupo quando a sugestão entrar.
  {
    id: "compras",
    rotulo: "Compras",
    icone: Truck,
    para: "/compras",
    permissao: "ajustar_estoque",
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
      // Produto é cadastro, não movimento de estoque: fica junto de cliente,
      // fornecedor e usuário, que é onde se procura por "cadastrar alguma coisa".
      { para: "/produtos", rotulo: "Produtos", icone: Package, permissao: "consultar_estoque" },
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

function Sidebar({
  recolhida,
  aoAlternar,
  usuario,
  aoExpandir,
  perfilReal,
  simulando,
  aoSair,
  aoSimular,
  aoVerTour,
  ocupado,
}) {
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
      {/* O símbolo é o mesmo elemento nos dois estados, e a posição é que muda:
          centrado na barra recolhida, encostado à esquerda quando ela abre. Como
          quem desliza é a margem, e não um componente que some e volta, o
          movimento acompanha a animação da barra em vez de piscar no meio dela.
          Sem header, a marca (símbolo + nome) mora só aqui. */}
      <div className="flex h-16 items-center border-b border-borda">
        <Link
          to="/"
          aria-label="Arkos — ir para o início"
          className={`flex items-center overflow-hidden rounded-botao text-azul-marca focus-visible:foco-arkos dark:text-white transition-all duration-200 ease-out ${
            recolhida ? "ml-3" : "ml-4"
          }`}
        >
          <Logo tamanho={28} mostrarNome={!recolhida} />
        </Link>

        {/* O controle de recolher fica junto da marca, no alto: é onde a pessoa
            procura, e não some no rodapé de uma lista longa. */}
        <div
          className={`ml-auto overflow-hidden transition-all duration-200 ease-out ${
            recolhida ? "w-0 opacity-0" : "w-12 pr-3 opacity-100"
          }`}
        >
          <BotaoIcone
            icone={ChevronsLeft}
            rotulo="Recolher menu"
            tabIndex={recolhida ? -1 : undefined}
            onClick={aoAlternar}
          />
        </div>
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

      <MenuConta
        recolhida={recolhida}
        usuario={usuario}
        perfilReal={perfilReal}
        simulando={simulando}
        aoSair={aoSair}
        aoSimular={aoSimular}
        aoVerTour={aoVerTour}
        ocupado={ocupado}
      />
    </aside>
  );
}

/** Duas iniciais do nome, para o círculo de avatar do rodapé da sidebar. */
function iniciais(nome) {
  if (!nome) return "";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${primeira}${ultima}`.toUpperCase();
}

function Avatar({ nome }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primario text-rotulo font-medium text-white"
    >
      {iniciais(nome)}
    </span>
  );
}

const estiloItemMenu =
  "flex w-full items-center gap-2.5 rounded-botao px-2.5 py-2 text-left text-corpo text-texto transition-colors hover:bg-borda/60 disabled:cursor-not-allowed disabled:text-secundario disabled:hover:bg-transparent";

/**
 * Rodapé da sidebar: só o usuário e o perfil — tema, notificações, ajuda,
 * simulação de perfil e logout ficam atrás de um clique, num menu flutuante.
 * Sem isso, o rodapé virava uma fileira de ícones soltos competindo com o
 * cartão do usuário pela atenção.
 */
function MenuConta({
  recolhida,
  usuario,
  perfilReal,
  simulando,
  aoSair,
  aoSimular,
  aoVerTour,
  ocupado,
}) {
  const [aberto, definirAberto] = useState(false);
  const containerRef = useRef(null);
  const navegar = useNavigate();
  const { tema, alternarTema } = usarPreferencias();

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (evento) => {
      if (!containerRef.current?.contains(evento.target)) definirAberto(false);
    };
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") definirAberto(false);
    };
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  // Sidebar recolhendo no meio do caminho não deve deixar o menu pendurado.
  useEffect(() => {
    if (recolhida) definirAberto(false);
  }, [recolhida]);

  async function selecionarVisao(perfil) {
    definirAberto(false);
    await aoSimular(perfil);
    navegar("/");
  }

  const ehAdmin = perfilReal === PERFIS.ADMINISTRADOR;
  const valorAtual = simulando ? usuario?.perfil : PERFIS.ADMINISTRADOR;

  return (
    <div ref={containerRef} className="relative border-t border-borda p-2">
      <button
        type="button"
        data-tour="ajuda"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={recolhida ? usuario?.nome : undefined}
        onClick={() => definirAberto((atual) => !atual)}
        className={`flex w-full items-center gap-2.5 rounded-botao py-1.5 transition-colors hover:bg-borda/60 ${
          recolhida ? "justify-center px-0" : "px-1.5"
        }`}
      >
        <Avatar nome={usuario?.nome} />
        {recolhida ? null : (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-corpo font-medium text-texto">{usuario?.nome}</p>
              <p className="truncate text-rotulo text-secundario">
                {PERFIL_LABEL[usuario?.perfil] ?? usuario?.perfil}
              </p>
            </div>
            <ChevronsUpDown size={16} aria-hidden="true" className="shrink-0 text-secundario" />
          </>
        )}
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Menu da conta"
          className={`absolute bottom-full z-20 mb-2 overflow-hidden rounded-card border border-borda bg-card shadow-flutuante ${
            recolhida ? "left-full ml-2 w-64" : "left-2 right-2"
          }`}
        >
          {recolhida ? (
            <div className="border-b border-borda px-3 py-2.5">
              <p className="truncate text-corpo font-medium text-texto">{usuario?.nome}</p>
              <p className="truncate text-rotulo text-secundario">
                {PERFIL_LABEL[usuario?.perfil] ?? usuario?.perfil}
              </p>
            </div>
          ) : null}

          {ehAdmin ? (
            <div className="border-b border-borda p-1.5">
              <p className="px-2.5 pb-1 pt-1.5 text-rotulo text-secundario">Ver sistema como</p>
              <button
                type="button"
                role="menuitem"
                disabled={ocupado}
                onClick={() => selecionarVisao(PERFIS.ADMINISTRADOR)}
                className={estiloItemMenu}
              >
                <Eye size={16} aria-hidden="true" className="shrink-0 text-secundario" />
                <span className="flex-1 truncate">Administrador</span>
                {valorAtual === PERFIS.ADMINISTRADOR ? (
                  <Check size={16} aria-hidden="true" className="shrink-0 text-primario" />
                ) : null}
              </button>
              {PERFIS_LISTA.filter((perfil) => perfil !== PERFIS.ADMINISTRADOR).map((perfil) => (
                <button
                  key={perfil}
                  type="button"
                  role="menuitem"
                  disabled={ocupado}
                  onClick={() => selecionarVisao(perfil)}
                  className={estiloItemMenu}
                >
                  <Eye size={16} aria-hidden="true" className="shrink-0 text-secundario" />
                  <span className="flex-1 truncate">{PERFIL_LABEL[perfil]}</span>
                  {valorAtual === perfil ? (
                    <Check size={16} aria-hidden="true" className="shrink-0 text-primario" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="border-b border-borda p-1.5">
            <button type="button" role="menuitem" onClick={alternarTema} className={estiloItemMenu}>
              {tema === "claro" ? (
                <Moon size={16} aria-hidden="true" className="shrink-0 text-secundario" />
              ) : (
                <Sun size={16} aria-hidden="true" className="shrink-0 text-secundario" />
              )}
              <span className="flex-1 truncate">
                {tema === "claro" ? "Modo escuro" : "Modo claro"}
              </span>
            </button>
            <button type="button" role="menuitem" className={estiloItemMenu}>
              <Bell size={16} aria-hidden="true" className="shrink-0 text-secundario" />
              <span className="flex-1 truncate">Notificações</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                definirAberto(false);
                aoVerTour();
              }}
              className={estiloItemMenu}
            >
              <CircleHelp size={16} aria-hidden="true" className="shrink-0 text-secundario" />
              <span className="flex-1 truncate">Rever o tour do sistema</span>
            </button>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                definirAberto(false);
                aoSair();
              }}
              className={`${estiloItemMenu} text-erro hover:bg-erro/10`}
            >
              <LogOut size={16} aria-hidden="true" className="shrink-0" />
              <span className="flex-1 truncate">Sair</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
        perfilReal={perfilReal}
        simulando={simulando}
        aoSair={sair}
        aoSimular={trocarVisao}
        aoVerTour={abrirTour}
        ocupado={ocupado}
      />
      <div className="flex min-w-0 flex-1 flex-col">
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
