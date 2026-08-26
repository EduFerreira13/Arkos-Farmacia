import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./componentes/Layout.jsx";
import { RotaComPermissao, RotaProtegida } from "./componentes/RotaProtegida.jsx";
import { Login } from "./paginas/Login.jsx";
import { Dashboard } from "./paginas/Dashboard.jsx";
import { PDV } from "./paginas/PDV.jsx";
import { HistoricoVendas } from "./paginas/HistoricoVendas.jsx";
import { Relacionamento } from "./paginas/Relacionamento.jsx";
import { Produtos } from "./paginas/Produtos.jsx";
import { Movimentacoes } from "./paginas/Movimentacoes.jsx";
import { Inventario } from "./paginas/Inventario.jsx";
import { Alertas } from "./paginas/Alertas.jsx";
import { Compras } from "./paginas/Compras.jsx";
import { SugestaoCompra } from "./paginas/SugestaoCompra.jsx";
import { FinanceiroVisaoGeral } from "./paginas/FinanceiroVisaoGeral.jsx";
import { Caixa } from "./paginas/Caixa.jsx";
import { Contas } from "./paginas/Contas.jsx";
import { FiscalControlados, FiscalNotas, FiscalReceitas } from "./paginas/Fiscal.jsx";
import { Relatorios } from "./paginas/Relatorios.jsx";
import {
  CadastroClientes,
  CadastroFornecedores,
  CadastroUsuarios,
} from "./paginas/Cadastros.jsx";

/** Mesmas permissoes que filtram o menu em Layout.jsx. */
const comPermissao = (permissao, elemento) => (
  <RotaComPermissao permissao={permissao}>{elemento}</RotaComPermissao>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RotaProtegida>
            <Layout />
          </RotaProtegida>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="/pdv" element={comPermissao("vender", <PDV />)} />
        {/* A tela "Vendas do dia" saiu: o histórico já abre no dia de hoje e faz
            tudo que ela fazia. O redirecionamento evita link salvo quebrado. */}
        <Route path="/vendas" element={<Navigate to="/vendas/historico" replace />} />
        <Route path="/vendas/historico" element={comPermissao("vender", <HistoricoVendas />)} />
        <Route path="/relacionamento" element={comPermissao("vender", <Relacionamento />)} />

        <Route path="/produtos" element={comPermissao("consultar_estoque", <Produtos />)} />
        <Route path="/movimentacoes" element={comPermissao("ajustar_estoque", <Movimentacoes />)} />
        <Route path="/inventario" element={comPermissao("ajustar_estoque", <Inventario />)} />
        <Route path="/alertas" element={comPermissao("consultar_estoque", <Alertas />)} />

        <Route path="/compras" element={comPermissao("ajustar_estoque", <Compras />)} />
        <Route path="/compras/sugestao" element={comPermissao("ajustar_estoque", <SugestaoCompra />)} />

        <Route path="/financeiro" element={comPermissao("ver_financeiro", <FinanceiroVisaoGeral />)} />
        <Route path="/caixa" element={comPermissao("vender", <Caixa />)} />
        <Route path="/contas" element={comPermissao("ver_financeiro", <Contas />)} />

        <Route path="/fiscal/notas" element={comPermissao("vender", <FiscalNotas />)} />
        <Route
          path="/fiscal/controlados"
          element={comPermissao("validar_receita", <FiscalControlados />)}
        />
        <Route path="/fiscal/receitas" element={comPermissao("validar_receita", <FiscalReceitas />)} />

        <Route path="/relatorios" element={comPermissao("ver_financeiro", <Relatorios />)} />

        <Route
          path="/cadastros/fornecedores"
          element={comPermissao("ajustar_estoque", <CadastroFornecedores />)}
        />
        <Route path="/cadastros/clientes" element={comPermissao("vender", <CadastroClientes />)} />
        <Route
          path="/cadastros/usuarios"
          element={comPermissao("gerenciar_usuarios", <CadastroUsuarios />)}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
