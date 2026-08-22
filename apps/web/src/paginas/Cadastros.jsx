import { useMemo, useState } from "react";
import { Pencil, Plus, Truck, UserCog, Users } from "lucide-react";
import { PERFIL_LABEL, PERFIS, PERFIS_LISTA } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

/** Formulário genérico de cadastro: campos declarados, salvar por callback. */
function FormularioCadastro({ titulo, descricao, campos, valores, aoFechar, aoSalvar }) {
  const [estado, definirEstado] = useState(valores);
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  async function submeter(evento) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);
    try {
      await aoSalvar(estado);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo={titulo}
      descricao={descricao}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="formulario-cadastro" disabled={enviando}>
            {enviando ? "Salvando" : "Salvar"}
          </Botao>
        </>
      }
    >
      <form id="formulario-cadastro" onSubmit={submeter} className="grid grid-cols-2 gap-4">
        {campos.map((campo) =>
          campo.opcoes ? (
            <CampoSelect
              key={campo.nome}
              rotulo={campo.rotulo}
              required={campo.obrigatorio}
              opcoes={campo.opcoes}
              value={estado[campo.nome] ?? ""}
              onChange={(evento) =>
                definirEstado({ ...estado, [campo.nome]: evento.target.value })
              }
              className={campo.largo ? "col-span-2" : ""}
            />
          ) : (
            <CampoTexto
              key={campo.nome}
              rotulo={campo.rotulo}
              type={campo.tipo ?? "text"}
              required={campo.obrigatorio}
              ajuda={campo.ajuda}
              placeholder={campo.exemplo}
              value={estado[campo.nome] ?? ""}
              onChange={(evento) =>
                definirEstado({ ...estado, [campo.nome]: evento.target.value })
              }
              className={campo.largo ? "col-span-2" : ""}
            />
          )
        )}
        {erro ? (
          <div className="col-span-2">
            <Aviso tom="erro">{erro}</Aviso>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

const CAMPOS_FORNECEDOR = [
  { nome: "nome", rotulo: "Nome ou razão social", obrigatorio: true, largo: true },
  {
    nome: "cnpj",
    rotulo: "CNPJ",
    ajuda: "Cadastro Nacional da Pessoa Jurídica",
    exemplo: "00.000.000/0000-00",
  },
  { nome: "telefone", rotulo: "Telefone", exemplo: "(11) 4002-8922" },
  { nome: "email", rotulo: "Email", tipo: "email", largo: true },
];

export function CadastroFornecedores() {
  const [aberto, definirAberto] = useState(false);
  const [emEdicao, definirEmEdicao] = useState(null);
  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.estoque.get("/fornecedores"),
    []
  );

  async function salvar(valores) {
    const corpo = {
      nome: valores.nome,
      cnpj: valores.cnpj || null,
      telefone: valores.telefone || null,
      email: valores.email || null,
    };
    if (emEdicao) await api.estoque.patch(`/fornecedores/${emEdicao.id}`, corpo);
    else await api.estoque.post("/fornecedores", corpo);

    definirAberto(false);
    definirEmEdicao(null);
    recarregar();
  }

  return (
    <>
      <TituloPagina
        titulo="Fornecedores"
        descricao="Quem abastece a farmácia — usado no produto, no pedido de compra e na conta a pagar."
        acoes={
          <Botao
            icone={Plus}
            onClick={() => {
              definirEmEdicao(null);
              definirAberto(true);
            }}
          >
            Novo fornecedor
          </Botao>
        }
      />

      <Card>
        <CardCabecalho titulo="Cadastrados" icone={Truck} />
        {carregando ? <Carregando /> : null}
        {erro ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erro.message}</Aviso>
          </div>
        ) : null}
        {dados ? (
          <Tabela
            colunas={[
              { chave: "nome", titulo: "Fornecedor" },
              { chave: "cnpj", titulo: "CNPJ", renderizar: (f) => f.cnpj || "—" },
              { chave: "telefone", titulo: "Telefone", renderizar: (f) => f.telefone || "—" },
              { chave: "email", titulo: "Email", renderizar: (f) => f.email || "—" },
              {
                chave: "acoes",
                titulo: "",
                largura: "56px",
                renderizar: (fornecedor) => (
                  <BotaoIcone
                    icone={Pencil}
                    rotulo={`Editar ${fornecedor.nome}`}
                    onClick={() => {
                      definirEmEdicao(fornecedor);
                      definirAberto(true);
                    }}
                  />
                ),
              },
            ]}
            linhas={dados.fornecedores}
            totais={
              dados.fornecedores.length
                ? { __rotulo: `${dados.fornecedores.length} fornecedor(es)` }
                : null
            }
            chave={(fornecedor) => fornecedor.id}
            vazio={
              <EstadoVazio
                icone={Truck}
                titulo="Nenhum fornecedor cadastrado"
                descricao="Cadastre para poder lançar pedido de compra."
              />
            }
          />
        ) : null}
      </Card>

      {aberto ? (
        <FormularioCadastro
          titulo={emEdicao ? "Editar fornecedor" : "Novo fornecedor"}
          campos={CAMPOS_FORNECEDOR}
          valores={emEdicao ?? {}}
          aoFechar={() => {
            definirAberto(false);
            definirEmEdicao(null);
          }}
          aoSalvar={salvar}
        />
      ) : null}
    </>
  );
}

const CAMPOS_CLIENTE = [
  { nome: "nome", rotulo: "Nome do cliente", obrigatorio: true, largo: true },
  { nome: "cpf", rotulo: "CPF", ajuda: "Cadastro de Pessoa Física", exemplo: "000.000.000-00" },
  { nome: "telefone", rotulo: "Telefone" },
  { nome: "email", rotulo: "Email", tipo: "email" },
  {
    nome: "convenio",
    rotulo: "Convênio",
    exemplo: "Unimed",
    ajuda: "Deixe em branco se for cliente particular",
  },
  { nome: "observacao", rotulo: "Observação", largo: true },
];

export function CadastroClientes() {
  const [aberto, definirAberto] = useState(false);
  const [emEdicao, definirEmEdicao] = useState(null);
  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");

  const consulta = useMemo(
    () => (buscaAplicada.trim() ? `?busca=${encodeURIComponent(buscaAplicada.trim())}` : ""),
    [buscaAplicada]
  );
  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.vendas.get(`/clientes${consulta}`),
    [consulta]
  );

  async function salvar(valores) {
    const corpo = {
      nome: valores.nome,
      cpf: valores.cpf || null,
      telefone: valores.telefone || null,
      email: valores.email || null,
      convenio: valores.convenio || null,
      observacao: valores.observacao || null,
    };
    if (emEdicao) await api.vendas.patch(`/clientes/${emEdicao.id}`, corpo);
    else await api.vendas.post("/clientes", corpo);

    definirAberto(false);
    definirEmEdicao(null);
    recarregar();
  }

  return (
    <>
      <TituloPagina
        titulo="Clientes"
        descricao="Base para venda a prazo, convênio e histórico de compra por pessoa."
        acoes={
          <Botao
            icone={Plus}
            onClick={() => {
              definirEmEdicao(null);
              definirAberto(true);
            }}
          >
            Novo cliente
          </Botao>
        }
      />

      <Card>
        <div className="border-b border-borda px-5 py-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              definirBuscaAplicada(busca);
            }}
          >
            <CampoTexto
              rotulo="Buscar por nome, CPF ou convênio"
              className="w-80"
              value={busca}
              onChange={(evento) => definirBusca(evento.target.value)}
            />
            <button
              type="submit"
              className="h-10 rounded-botao border border-primario px-4 text-corpo text-primario hover:bg-primario/10 focus-visible:foco-arkos"
            >
              Buscar
            </button>
          </form>
        </div>

        {carregando ? <Carregando /> : null}
        {erro ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erro.message}</Aviso>
          </div>
        ) : null}
        {dados ? (
          <Tabela
            colunas={[
              { chave: "nome", titulo: "Cliente" },
              { chave: "cpf", titulo: "CPF", renderizar: (c) => c.cpf || "—" },
              { chave: "telefone", titulo: "Telefone", renderizar: (c) => c.telefone || "—" },
              {
                chave: "convenio",
                titulo: "Convênio",
                renderizar: (cliente) =>
                  cliente.convenio ? <Badge tom="info">{cliente.convenio}</Badge> : "Particular",
              },
              {
                chave: "total_compras",
                titulo: "Compras",
                alinhamento: "direita",
                renderizar: (cliente) => formatarNumero(cliente.total_compras),
              },
              {
                chave: "total_gasto",
                titulo: "Total gasto",
                alinhamento: "direita",
                renderizar: (cliente) => formatarMoeda(cliente.total_gasto),
              },
              {
                chave: "acoes",
                titulo: "",
                largura: "56px",
                renderizar: (cliente) => (
                  <BotaoIcone
                    icone={Pencil}
                    rotulo={`Editar ${cliente.nome}`}
                    onClick={() => {
                      definirEmEdicao(cliente);
                      definirAberto(true);
                    }}
                  />
                ),
              },
            ]}
            linhas={dados.clientes}
            totais={
              dados.clientes.length
                ? {
                    __rotulo: `${dados.clientes.length} cliente(s)`,
                    total_gasto: formatarMoeda(
                      dados.clientes.reduce((soma, cliente) => soma + Number(cliente.total_gasto), 0)
                    ),
                  }
                : null
            }
            chave={(cliente) => cliente.id}
            vazio={
              <EstadoVazio
                icone={Users}
                titulo="Nenhum cliente cadastrado"
                descricao="Cadastre para vender a prazo ou por convênio."
              />
            }
          />
        ) : null}
      </Card>

      {aberto ? (
        <FormularioCadastro
          titulo={emEdicao ? "Editar cliente" : "Novo cliente"}
          campos={CAMPOS_CLIENTE}
          valores={emEdicao ?? {}}
          aoFechar={() => {
            definirAberto(false);
            definirEmEdicao(null);
          }}
          aoSalvar={salvar}
        />
      ) : null}
    </>
  );
}

const CAMPOS_USUARIO = [
  { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
  { nome: "email", rotulo: "Email", tipo: "email", obrigatorio: true },
  {
    nome: "senha",
    rotulo: "Senha",
    tipo: "password",
    obrigatorio: true,
    ajuda: "Ao menos 6 caracteres",
  },
  {
    nome: "perfil",
    rotulo: "Perfil de acesso",
    obrigatorio: true,
    largo: true,
    opcoes: PERFIS_LISTA.map((perfil) => ({ valor: perfil, rotulo: PERFIL_LABEL[perfil] })),
  },
];

/** Usuários e perfis — só o administrador chega nesta tela. */
export function CadastroUsuarios() {
  const [aberto, definirAberto] = useState(false);
  const [erro, definirErro] = useState(null);
  const { dados, carregando, erro: erroBusca, recarregar } = usarBusca(
    () => api.auth.get("/usuarios"),
    []
  );

  async function criar(valores) {
    await api.auth.post("/usuarios", {
      nome: valores.nome,
      email: valores.email,
      senha: valores.senha,
      perfil: valores.perfil || PERFIS.OPERADOR_CAIXA,
    });
    definirAberto(false);
    recarregar();
  }

  async function alterar(usuario, campos) {
    definirErro(null);
    try {
      await api.auth.patch(`/usuarios/${usuario.id}`, campos);
      recarregar();
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Usuários"
        descricao="Quem entra no sistema e com qual perfil. Todo usuário tem um perfil definido."
        acoes={
          <Botao icone={Plus} onClick={() => definirAberto(true)}>
            Novo usuário
          </Botao>
        }
      />

      {erro ? (
        <Aviso tom="erro" className="mb-4">
          {erro}
        </Aviso>
      ) : null}

      <Card>
        <CardCabecalho titulo="Usuários do sistema" icone={UserCog} />
        {carregando ? <Carregando /> : null}
        {erroBusca ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erroBusca.message}</Aviso>
          </div>
        ) : null}
        {dados ? (
          <Tabela
            colunas={[
              { chave: "nome", titulo: "Nome" },
              { chave: "email", titulo: "Email" },
              {
                chave: "perfil",
                titulo: "Perfil",
                renderizar: (usuario) => (
                  <select
                    value={usuario.perfil}
                    onChange={(evento) => alterar(usuario, { perfil: evento.target.value })}
                    aria-label={`Perfil de ${usuario.nome}`}
                    className="h-8 rounded-botao border border-borda bg-card px-2 text-rotulo text-texto focus-visible:foco-arkos"
                  >
                    {PERFIS_LISTA.map((perfil) => (
                      <option key={perfil} value={perfil}>
                        {PERFIL_LABEL[perfil]}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                chave: "criado_em",
                titulo: "Criado em",
                renderizar: (usuario) => formatarData(usuario.criado_em),
              },
              {
                chave: "ativo",
                titulo: "Situação",
                renderizar: (usuario) =>
                  usuario.ativo ? (
                    <Badge tom="sucesso">Ativo</Badge>
                  ) : (
                    <Badge tom="erro">Inativo</Badge>
                  ),
              },
              {
                chave: "acoes",
                titulo: "",
                renderizar: (usuario) => (
                  <Botao
                    tamanho="pequeno"
                    variante={usuario.ativo ? "secundario" : "primario"}
                    onClick={() => alterar(usuario, { ativo: !usuario.ativo })}
                  >
                    {usuario.ativo ? "Desativar" : "Reativar"}
                  </Botao>
                ),
              },
            ]}
            linhas={dados.usuarios}
            totais={
              dados.usuarios.length
                ? {
                    __rotulo: `${dados.usuarios.length} usuário(s), ${
                      dados.usuarios.filter((usuario) => usuario.ativo).length
                    } ativo(s)`,
                  }
                : null
            }
            chave={(usuario) => usuario.id}
            vazio={<EstadoVazio icone={UserCog} titulo="Nenhum usuário" />}
          />
        ) : null}
      </Card>

      {aberto ? (
        <FormularioCadastro
          titulo="Novo usuário"
          descricao="A senha pode ser trocada depois pelo próprio usuário."
          campos={CAMPOS_USUARIO}
          valores={{ perfil: PERFIS.OPERADOR_CAIXA }}
          aoFechar={() => definirAberto(false)}
          aoSalvar={criar}
        />
      ) : null}
    </>
  );
}
