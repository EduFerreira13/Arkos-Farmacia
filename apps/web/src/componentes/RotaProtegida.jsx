import { Navigate, useLocation } from "react-router-dom";
import { usarAutenticacao } from "../lib/autenticacao.jsx";
import { Carregando } from "./Superficies.jsx";

/** Bloqueia rotas internas para quem não está autenticado. */
export function RotaProtegida({ children }) {
  const { autenticado, carregando } = usarAutenticacao();
  const local = useLocation();

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center bg-fundo">
        <Carregando texto="Verificando sessão" />
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  }

  return children;
}
