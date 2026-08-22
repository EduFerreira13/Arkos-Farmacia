import { Navigate, useLocation } from "react-router-dom";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
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

/**
 * Barra o acesso direto pela URL a uma tela que o perfil não tem permissão de
 * ver — o menu já esconde o item, isto fecha a porta de trás.
 */
export function RotaComPermissao({ permissao, children }) {
  const { usuario } = usarAutenticacao();

  if (!temPermissao(usuario, permissao)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
