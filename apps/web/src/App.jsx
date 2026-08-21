import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./componentes/Layout.jsx";
import { RotaProtegida } from "./componentes/RotaProtegida.jsx";
import { Login } from "./paginas/Login.jsx";
import { Produtos } from "./paginas/Produtos.jsx";
import { EntradaLote } from "./paginas/EntradaLote.jsx";
import { Alertas } from "./paginas/Alertas.jsx";
import { PDV } from "./paginas/PDV.jsx";
import { Vendas } from "./paginas/Vendas.jsx";
import { Caixa } from "./paginas/Caixa.jsx";
import { Contas } from "./paginas/Contas.jsx";
import { Dashboard } from "./paginas/Dashboard.jsx";

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
        <Route path="/pdv" element={<PDV />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/entrada-lote" element={<EntradaLote />} />
        <Route path="/alertas" element={<Alertas />} />
        <Route path="/caixa" element={<Caixa />} />
        <Route path="/contas" element={<Contas />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
