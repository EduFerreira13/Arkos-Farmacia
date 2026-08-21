import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Logo } from "../componentes/Logo.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { CampoTexto } from "../componentes/Campos.jsx";
import { Aviso } from "../componentes/Superficies.jsx";
import { usarAutenticacao } from "../lib/autenticacao.jsx";

export function Login() {
  const { entrar, autenticado, carregando } = usarAutenticacao();
  const navegar = useNavigate();
  const local = useLocation();

  const [email, definirEmail] = useState("");
  const [senha, definirSenha] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  if (autenticado && !carregando) {
    return <Navigate to={local.state?.de ?? "/"} replace />;
  }

  async function submeter(evento) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navegar(local.state?.de ?? "/", { replace: true });
    } catch (falha) {
      definirErro(falha.message ?? "Não foi possível entrar.");
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* Gradiente da marca como destaque da tela de login (§6) */}
      <div className="hidden w-[42%] flex-col justify-between bg-marca p-10 text-white lg:flex">
        <Logo tamanho={36} className="[&>span]:text-white" />
        <div>
          <p className="text-h1 leading-tight">Gestão da farmácia em um só lugar</p>
          <p className="mt-3 max-w-md text-corpo-espacoso text-white/85">
            Vendas, estoque com controle de lote e validade, financeiro e controlados — com as
            travas de segurança que a operação exige.
          </p>
        </div>
        <p className="text-rotulo text-white/70">Arkos MVP</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-fundo px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tamanho={32} />
          </div>

          <h1 className="text-h1 text-texto">Entrar</h1>
          <p className="mt-1 text-corpo text-secundario">
            Use as credenciais cadastradas pelo administrador.
          </p>

          <form onSubmit={submeter} className="mt-7 space-y-4">
            <CampoTexto
              rotulo="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              placeholder="seu.email@arkos.com"
            />
            <CampoTexto
              rotulo="Senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(evento) => definirSenha(evento.target.value)}
              placeholder="Sua senha"
            />

            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

            <Botao
              type="submit"
              icone={LogIn}
              tamanho="grande"
              className="w-full"
              disabled={enviando}
            >
              {enviando ? "Entrando" : "Entrar"}
            </Botao>
          </form>

          {import.meta.env.DEV ? (
            <div className="mt-8 rounded-card border border-borda bg-card px-4 py-3">
              <p className="text-rotulo text-secundario">
                Ambiente de desenvolvimento — usuários criados por <code>npm run seed</code>:
                caixa@arkos.com, farmaceutico@arkos.com, gerente@arkos.com, admin@arkos.com
                (senha arkos123).
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
