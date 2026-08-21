import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./componentes/Layout.jsx";
import { RotaProtegida } from "./componentes/RotaProtegida.jsx";
import { EmConstrucao } from "./paginas/EmConstrucao.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<EmConstrucao titulo="Login" />} />

      <Route
        element={
          <RotaProtegida>
            <Layout />
          </RotaProtegida>
        }
      >
        <Route index element={<EmConstrucao titulo="Dashboard" />} />
        <Route path="/pdv" element={<EmConstrucao titulo="PDV" />} />
        <Route path="/vendas" element={<EmConstrucao titulo="Vendas do dia" />} />
        <Route path="/produtos" element={<EmConstrucao titulo="Produtos" />} />
        <Route path="/entrada-lote" element={<EmConstrucao titulo="Entrada de lote" />} />
        <Route path="/alertas" element={<EmConstrucao titulo="Alertas" />} />
        <Route path="/caixa" element={<EmConstrucao titulo="Caixa" />} />
        <Route path="/contas" element={<EmConstrucao titulo="Contas" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
