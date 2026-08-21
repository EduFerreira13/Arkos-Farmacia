import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PackagePlus,
  Receipt,
  Rows3,
  Search,
  ShoppingCart,
  Sun,
  Wallet,
} from "lucide-react";
import { PERFIL_LABEL } from "@arkos/shared-types";
import { Logo, Simbolo } from "./Logo.jsx";
import { BotaoIcone } from "./Botao.jsx";
import { usarPreferencias } from "../lib/preferencias.jsx";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";

const SECOES = [
  {
    titulo: null,
    itens: [{ para: "/", rotulo: "Dashboard", icone: LayoutDashboard, fim: true }],
  },
  {
    titulo: "Vendas",
    itens: [
      { para: "/pdv", rotulo: "PDV", icone: ShoppingCart, permissao: "vender" },
      { para: "/vendas", rotulo: "Vendas do dia", icone: Receipt },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { para: "/produtos", rotulo: "Produtos", icone: Package },
      { para: "/entrada-lote", rotulo: "Entrada de lote", icone: PackagePlus },
      { para: "/alertas", rotulo: "Alertas", icone: AlertTriangle },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { para: "/caixa", rotulo: "Caixa", icone: Wallet },
      { para: "/contas", rotulo: "Contas", icone: FileText, permissao: "ver_financeiro" },
    ],
  },
];

function ItemMenu({ item, recolhida }) {
  const Icone = item.icone;
  return (
    <NavLink
      to={item.para}
      end={item.fim}
      title={recolhida ? item.rotulo : undefined}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-botao px-3 py-2 text-corpo transition-colors",
          recolhida ? "justify-center px-0" : "",
          isActive
            ? "bg-primario text-white"
            : "text-secundario hover:bg-borda/60 hover:text-texto",
        ].join(" ")
      }
    >
      <Icone size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      {recolhida ? null : <span className="truncate">{item.rotulo}</span>}
    </NavLink>
  );
}

function Sidebar({ recolhida, aoAlternar, usuario }) {
  return (
    <aside
      className={[
        "flex shrink-0 flex-col border-r border-borda bg-card transition-all duration-200",
        recolhida ? "w-sidebar-recolhida" : "w-sidebar",
      ].join(" ")}
    >
      <div
        className={`flex h-16 items-center border-b border-borda ${
          recolhida ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        {recolhida ? <Simbolo tamanho={28} /> : <Logo tamanho={28} />}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {SECOES.map((secao, indice) => {
          const itens = secao.itens.filter(
            (item) => !item.permissao || temPermissao(usuario, item.permissao)
          );
          if (!itens.length) return null;
          return (
            <div key={secao.titulo ?? indice} className="space-y-1">
              {secao.titulo && !recolhida ? (
                <p className="px-3 pb-1 text-rotulo uppercase tracking-wide text-secundario">
                  {secao.titulo}
                </p>
              ) : null}
              {itens.map((item) => (
                <ItemMenu key={item.para} item={item} recolhida={recolhida} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className={`border-t border-borda p-2 ${recolhida ? "flex justify-center" : ""}`}>
        <BotaoIcone
          icone={recolhida ? ChevronsRight : ChevronsLeft}
          rotulo={recolhida ? "Expandir menu" : "Recolher menu"}
          onClick={aoAlternar}
        />
      </div>
    </aside>
  );
}

function Topbar({ usuario, aoSair }) {
  const { tema, densidade, alternarTema, alternarDensidade } = usarPreferencias();
  const [busca, definirBusca] = useState("");
  const navegar = useNavigate();

  function submeterBusca(evento) {
    evento.preventDefault();
    const termo = busca.trim();
    if (termo) navegar(`/produtos?busca=${encodeURIComponent(termo)}`);
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-borda bg-card px-5">
      <form onSubmit={submeterBusca} className="relative w-96">
        <Search
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secundario"
        />
        <input
          value={busca}
          onChange={(evento) => definirBusca(evento.target.value)}
          placeholder="Buscar produto, lote ou venda"
          aria-label="Busca global"
          className="h-10 w-full rounded-botao border border-borda bg-fundo pl-9 pr-3 text-corpo text-texto placeholder:text-secundario focus-visible:foco-arkos"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        <BotaoIcone
          icone={Rows3}
          rotulo={`Densidade: ${densidade === "denso" ? "densa" : "confortável"}`}
          onClick={alternarDensidade}
        />
        <BotaoIcone icone={Bell} rotulo="Notificações" />
        <BotaoIcone
          icone={tema === "claro" ? Moon : Sun}
          rotulo={tema === "claro" ? "Ativar modo escuro" : "Ativar modo claro"}
          onClick={alternarTema}
        />

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
  const { usuario, sair } = usarAutenticacao();

  return (
    <div className="flex h-full bg-fundo">
      <Sidebar
        recolhida={recolhida}
        aoAlternar={() => definirRecolhida((atual) => !atual)}
        usuario={usuario}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar usuario={usuario} aoSair={sair} />
        <main className="flex-1 overflow-y-auto px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
