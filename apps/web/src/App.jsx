import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./componentes/Layout.jsx";
import { RotaComPermissao, RotaProtegida } from "./componentes/RotaProtegida.jsx";
import { Login } from "./paginas/Login.jsx";
import { Produtos } from "./paginas/Produtos.jsx";
import { EntradaLote } from "./paginas/EntradaLote.jsx";
import { Alertas } from "./paginas/Alertas.jsx";
import { PDV } from "./paginas/PDV.jsx";
import { Vendas } from "./paginas/Vendas.jsx";
import { Caixa } from "./paginas/Caixa.jsx";
import { Contas } from "./paginas/Contas.jsx";
import { Dashboard } from "./paginas/Dashboard.jsx";

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
        <Route path="/vendas" element={comPermissao("vender", <Vendas />)} />
        <Route path="/produtos" element={comPermissao("consultar_estoque", <Produtos />)} />
        <Route path="/entrada-lote" element={comPermissao("ajustar_estoque", <EntradaLote />)} />
        <Route path="/alertas" element={comPermissao("consultar_estoque", <Alertas />)} />
        <Route path="/caixa" element={comPermissao("vender", <Caixa />)} />
        <Route path="/contas" element={comPermissao("ver_financeiro", <Contas />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
