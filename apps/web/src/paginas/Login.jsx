import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, LogIn } from "lucide-react";
import { LogoCompleta } from "../componentes/Logo.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSenha, CampoTexto } from "../componentes/Campos.jsx";
import { Aviso } from "../componentes/Superficies.jsx";
import { api } from "../lib/api.js";
import { usarAutenticacao } from "../lib/autenticacao.jsx";

/** Formulário de entrada. */
function FormularioEntrada({ aoEsquecer }) {
  const { entrar } = usarAutenticacao();
  const navegar = useNavigate();
  const local = useLocation();

  const [email, definirEmail] = useState("");
  const [senha, definirSenha] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

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
    <>
      <h1 className="text-h1 text-texto">Entrar</h1>

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
        <CampoSenha
          rotulo="Senha"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(evento) => definirSenha(evento.target.value)}
          placeholder="Sua senha"
        />

        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

        <Botao type="submit" icone={LogIn} tamanho="grande" className="w-full" disabled={enviando}>
          {enviando ? "Entrando" : "Entrar"}
        </Botao>
      </form>

      <button
        type="button"
        onClick={() => aoEsquecer(email)}
        className="mt-4 rounded-botao px-1 py-1 text-corpo text-primario hover:underline focus-visible:foco-arkos"
      >
        Esqueci minha senha
      </button>
    </>
  );
}

/**
 * Recuperação de senha em dois momentos na mesma tela: pedir o link e usar o
 * código recebido para definir a senha nova.
 */
function FormularioRecuperacao({ emailInicial, aoVoltar }) {
  const [etapa, definirEtapa] = useState("pedir");
  const [email, definirEmail] = useState(emailInicial ?? "");
  const [codigo, definirCodigo] = useState("");
  const [senha, definirSenha] = useState("");
  const [confirmacao, definirConfirmacao] = useState("");
  const [aviso, definirAviso] = useState(null);
  const [tokenDeDesenvolvimento, definirTokenDeDesenvolvimento] = useState(null);
  const [erro, definirErro] = useState(null);
  const [pronto, definirPronto] = useState(false);
  const [enviando, definirEnviando] = useState(false);

  async function pedirLink(evento) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);
    try {
      const resposta = await api.auth.post("/recuperar-senha", { email: email.trim() });
      definirAviso(resposta.mensagem);
      // Em desenvolvimento o serviço devolve o código, porque não há email.
      if (resposta.token_de_desenvolvimento) {
        definirTokenDeDesenvolvimento(resposta.token_de_desenvolvimento);
        definirCodigo(resposta.token_de_desenvolvimento);
      }
      definirEtapa("redefinir");
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  async function redefinir(evento) {
    evento.preventDefault();
    definirErro(null);

    if (senha !== confirmacao) {
      definirErro("As duas senhas precisam ser iguais.");
      return;
    }

    definirEnviando(true);
    try {
      await api.auth.post("/redefinir-senha", { token: codigo.trim(), senha });
      definirPronto(true);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  if (pronto) {
    return (
      <>
        <h1 className="text-h1 text-texto">Senha redefinida</h1>
        <Aviso tom="sucesso" className="mt-4">
          Pronto. Já dá para entrar com a senha nova.
        </Aviso>
        <Botao className="mt-6 w-full" tamanho="grande" onClick={aoVoltar}>
          Voltar para a entrada
        </Botao>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={aoVoltar}
        className="mb-4 inline-flex items-center gap-1 rounded-botao px-1 py-1 text-corpo text-secundario hover:text-texto focus-visible:foco-arkos"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar
      </button>

      <h1 className="text-h1 text-texto">Recuperar senha</h1>

      {etapa === "pedir" ? (
        <>
          <p className="mt-1 text-corpo text-secundario">
            Informe o email da sua conta. Se ela existir, geramos um código de redefinição válido
            por 30 minutos.
          </p>

          <form onSubmit={pedirLink} className="mt-7 space-y-4">
            <CampoTexto
              rotulo="Email da conta"
              type="email"
              required
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              placeholder="seu.email@arkos.com"
            />
            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
            <Botao
              type="submit"
              icone={KeyRound}
              tamanho="grande"
              className="w-full"
              disabled={enviando}
            >
              {enviando ? "Gerando" : "Gerar código de redefinição"}
            </Botao>
          </form>
        </>
      ) : (
        <>
          {aviso ? (
            <Aviso tom="info" className="mt-4">
              {aviso}
            </Aviso>
          ) : null}

          {tokenDeDesenvolvimento ? (
            <Aviso tom="alerta" titulo="Ambiente de desenvolvimento" className="mt-3">
              Não há serviço de email configurado, então o código veio direto na resposta e já está
              preenchido abaixo.
            </Aviso>
          ) : null}

          <form onSubmit={redefinir} className="mt-6 space-y-4">
            <CampoTexto
              rotulo="Código de redefinição"
              required
              value={codigo}
              onChange={(evento) => definirCodigo(evento.target.value)}
              ajuda="Recebido por email quando o envio estiver configurado."
            />
            <CampoSenha
              rotulo="Nova senha"
              autoComplete="new-password"
              required
              minLength={6}
              value={senha}
              onChange={(evento) => definirSenha(evento.target.value)}
              ajuda="Ao menos 6 caracteres."
            />
            <CampoSenha
              rotulo="Repita a nova senha"
              autoComplete="new-password"
              required
              value={confirmacao}
              onChange={(evento) => definirConfirmacao(evento.target.value)}
            />

            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

            <Botao type="submit" tamanho="grande" className="w-full" disabled={enviando}>
              {enviando ? "Redefinindo" : "Redefinir senha"}
            </Botao>
          </form>
        </>
      )}
    </>
  );
}

export function Login() {
  const { autenticado, carregando } = usarAutenticacao();
  const local = useLocation();
  const [recuperando, definirRecuperando] = useState(false);
  const [emailDigitado, definirEmailDigitado] = useState("");

  if (autenticado && !carregando) {
    return <Navigate to={local.state?.de ?? "/"} replace />;
  }

  return (
    <div className="flex h-full">
      {/* Gradiente da marca como destaque da tela de login (§6). A marca fica no
          centro do painel, que é onde o olho cai primeiro, com a frase logo
          abaixo; a assinatura do rodapé sai do fluxo para não puxar o bloco. */}
      <div className="relative hidden w-[42%] flex-col items-center justify-center bg-marca p-10 text-center text-white lg:flex">
        <LogoCompleta altura={140} variante="monocromatico" className="text-white" />
        <p className="mt-10 max-w-md text-h1 font-display leading-tight">
          Gestão farmacêutica em um único lugar!
        </p>
        <p className="absolute inset-x-0 bottom-10 text-rotulo text-white/70">Arkos MVP</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-fundo px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoCompleta altura={48} />
          </div>

          {recuperando ? (
            <FormularioRecuperacao
              emailInicial={emailDigitado}
              aoVoltar={() => definirRecuperando(false)}
            />
          ) : (
            <FormularioEntrada
              aoEsquecer={(email) => {
                definirEmailDigitado(email);
                definirRecuperando(true);
              }}
            />
          )}

          {import.meta.env.DEV && !recuperando ? (
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
