import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Truck, UserCog, Users } from "lucide-react";
import { PERFIL_LABEL, PERFIS, PERFIS_LISTA } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import {
  CampoCheckbox,
  CampoSelect,
  CampoTexto,
  CampoTextoLongo,
} from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { BarraDePesquisa, LimparFiltros, LinhaDeFiltros } from "../componentes/Filtros.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

/**
 * Formulário genérico de cadastro: campos declarados, salvar por callback.
 *
 * Cada campo pode ser `texto` (padrão), `longo`, `select` (com `opcoes`) ou
 * `checkbox`, e `largo` faz ele ocupar as duas colunas. `aoMudar` deixa a tela
 * reagir ao que foi digitado — é o que permite a consulta de CNPJ preencher o
 * resto do formulário sozinha.
 */
function FormularioCadastro({
  titulo,
  descricao,
  campos,
  valores,
  aoFechar,
  aoSalvar,
  extras,
  largura = "max-w-2xl",
}) {
  const [estado, definirEstado] = useState(valores);
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const atualizar = (nome, valor) => definirEstado((atual) => ({ ...atual, [nome]: valor }));

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
      largura={largura}
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
      {extras ? extras({ estado, atualizar, definirEstado }) : null}

      <form id="formulario-cadastro" onSubmit={submeter} className="grid grid-cols-2 gap-4">
        {campos.map((campo) => {
          const comum = {
            key: campo.nome,
            rotulo: campo.rotulo,
            required: campo.obrigatorio,
            ajuda: campo.ajuda,
            className: campo.largo ? "col-span-2" : "",
          };

          if (campo.tipo === "checkbox") {
            return (
              <CampoCheckbox
                {...comum}
                required={false}
                checked={Boolean(estado[campo.nome])}
                onChange={(evento) => atualizar(campo.nome, evento.target.checked)}
              />
            );
          }

          if (campo.opcoes) {
            return (
              <CampoSelect
                {...comum}
                opcoes={campo.opcoes}
                value={estado[campo.nome] ?? ""}
                onChange={(evento) => atualizar(campo.nome, evento.target.value)}
              />
            );
          }

          if (campo.tipo === "longo") {
            return (
              <CampoTextoLongo
                {...comum}
                linhas={campo.linhas ?? 2}
                placeholder={campo.exemplo}
                value={estado[campo.nome] ?? ""}
                onChange={(evento) => atualizar(campo.nome, evento.target.value)}
              />
            );
          }

          return (
            <CampoTexto
              {...comum}
              type={campo.tipo ?? "text"}
              placeholder={campo.exemplo}
              value={estado[campo.nome] ?? ""}
              onChange={(evento) => atualizar(campo.nome, evento.target.value)}
            />
          );
        })}

        {erro ? (
          <div className="col-span-2">
            <Aviso tom="erro">{erro}</Aviso>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------- fornecedores

// O CNPJ não entra aqui: ele é o campo de cima, o mesmo que consulta a Receita.
// Repetido em dois lugares do formulário, um deles só confunde.
const CAMPOS_FORNECEDOR = [
  { nome: "nome", rotulo: "Razão social", obrigatorio: true, largo: true },
  { nome: "telefone", rotulo: "Telefone", exemplo: "(11) 4002-8922" },
  { nome: "email", rotulo: "Email", tipo: "email" },
];

/**
 * Puxa razão social, telefone e email da Receita a partir do CNPJ. O serviço é
 * quem fala com a base pública; aqui só se pede e se confere. Nada é gravado
 * sem passar pelo Salvar — o retorno preenche o formulário, não o cadastro.
 */
function BuscaPorCnpj({ estado, atualizar, definirEstado }) {
  const [consultando, definirConsultando] = useState(false);
  const [erro, definirErro] = useState(null);
  const [achado, definirAchado] = useState(null);

  async function consultar() {
    definirErro(null);
    definirAchado(null);
    definirConsultando(true);
    try {
      const { fornecedor } = await api.estoque.get(
        `/fornecedores/consulta-cnpj/${encodeURIComponent(estado.cnpj ?? "")}`
      );
      definirEstado((atual) => ({
        ...atual,
        cnpj: fornecedor.cnpj,
        nome: fornecedor.nome ?? atual.nome,
        // O que já foi digitado à mão vence o que veio da Receita: quem
        // cadastrou o telefone do vendedor não quer o da matriz por cima.
        telefone: atual.telefone || fornecedor.telefone || "",
        email: atual.email || fornecedor.email || "",
      }));
      definirAchado(fornecedor);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirConsultando(false);
    }
  }

  return (
    <div className="mb-4 rounded-card bg-fundo px-4 py-3">
      <div className="flex items-start gap-3">
        <CampoTexto
          rotulo="CNPJ"
          className="flex-1"
          placeholder="00.000.000/0000-00"
          ajuda="Buscar dados preenche razão social, telefone e email pela Receita."
          value={estado.cnpj ?? ""}
          onChange={(evento) => atualizar("cnpj", evento.target.value)}
        />
        <Botao
          variante="secundario"
          icone={Search}
          className="mt-[22px]"
          onClick={consultar}
          disabled={consultando || !String(estado.cnpj ?? "").trim()}
        >
          {consultando ? "Consultando" : "Buscar dados"}
        </Botao>
      </div>

      {achado ? (
        <Aviso tom="sucesso" className="mt-3">
          {achado.razao_social}
          {achado.nome_fantasia ? ` (${achado.nome_fantasia})` : ""}
          {achado.situacao ? ` — ${achado.situacao}` : ""}
          {achado.municipio ? `, ${achado.municipio}/${achado.uf}` : ""}. Confira abaixo antes de
          salvar.
        </Aviso>
      ) : null}
      {erro ? (
        <Aviso tom="alerta" className="mt-3">
          {erro}
        </Aviso>
      ) : null}
    </div>
  );
}

export function CadastroFornecedores() {
  const [aberto, definirAberto] = useState(false);
  const [emEdicao, definirEmEdicao] = useState(null);
  const [busca, definirBusca] = useState("");

  const consulta = useMemo(
    () => (busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : ""),
    [busca]
  );
  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.estoque.get(`/fornecedores${consulta}`),
    [consulta]
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
        acoes={
          <>
            <ExportarRelatorio
              servico="estoque"
              caminho="/relatorios/fornecedores"
              titulo="Relatório de fornecedores"
              rotulo="Relatório"
              comPeriodo={false}
              parametros={{ busca: busca.trim() }}
              resumoDosFiltros={busca.trim() ? [`Pesquisa: ${busca.trim()}`] : []}
            />
            <Botao
              icone={Plus}
              onClick={() => {
                definirEmEdicao(null);
                definirAberto(true);
              }}
            >
              Novo fornecedor
            </Botao>
          </>
        }
      />

      <Card>
        <LinhaDeFiltros
          acoes={<LimparFiltros ativo={Boolean(busca)} aoLimpar={() => definirBusca("")} />}
        >
          <BarraDePesquisa
            rotulo="Pesquisar fornecedor"
            placeholder="Razão social, CNPJ, telefone ou email"
            valor={busca}
            aoMudar={definirBusca}
          />
        </LinhaDeFiltros>

        {carregando ? <Carregando /> : null}
        {erro ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erro.message}</Aviso>
          </div>
        ) : null}
        {dados ? (
          <Tabela
            colunas={[
              { chave: "nome", titulo: "Razão social" },
              { chave: "cnpj", titulo: "CNPJ", renderizar: (f) => f.cnpj || "—" },
              { chave: "telefone", titulo: "Telefone", renderizar: (f) => f.telefone || "—" },
              { chave: "email", titulo: "Email", renderizar: (f) => f.email || "—" },
              {
                chave: "total_produtos",
                titulo: "Produtos",
                alinhamento: "direita",
                renderizar: (f) => formatarNumero(f.total_produtos ?? 0),
              },
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
            chave={(fornecedor) => fornecedor.id}
            vazio={
              <EstadoVazio
                icone={Truck}
                titulo={busca ? "Nenhum fornecedor com esse termo" : "Nenhum fornecedor cadastrado"}
                descricao={
                  busca
                    ? "Ajuste a pesquisa para ver outros fornecedores."
                    : "Cadastre para poder lançar pedido de compra."
                }
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
          extras={(controles) => <BuscaPorCnpj {...controles} />}
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

// ------------------------------------------------------------------ clientes

/**
 * §5 — nome e telefone identificam a pessoa e permitem o retorno do
 * relacionamento, então são obrigatórios. CPF é opcional (minimização de
 * dados, LGPD): quem precisa dele na nota informa na finalização da venda,
 * sem exigir cadastro completo. O resto ajuda, mas não trava o cadastro no
 * balcão.
 */
const CAMPOS_CLIENTE = [
  { nome: "nome", rotulo: "Nome do cliente", obrigatorio: true, largo: true },
  { nome: "cpf", rotulo: "CPF", exemplo: "000.000.000-00" },
  { nome: "telefone", rotulo: "Telefone", obrigatorio: true, exemplo: "(11) 90000-0000" },
  { nome: "email", rotulo: "Email", tipo: "email" },
  { nome: "data_nascimento", rotulo: "Data de nascimento", tipo: "date" },
  {
    nome: "convenio",
    rotulo: "Convênio",
    exemplo: "Unimed",
    ajuda: "Deixe em branco se for cliente particular",
    largo: true,
  },
  {
    nome: "endereco",
    rotulo: "Endereço",
    tipo: "longo",
    largo: true,
    exemplo: "Rua, número, bairro, cidade e CEP",
  },
  { nome: "observacao", rotulo: "Observações", tipo: "longo", largo: true },
];

const CONVENIO_OPCOES = [
  { valor: "", rotulo: "Todos" },
  { valor: "com_convenio", rotulo: "Só com convênio" },
  { valor: "particular", rotulo: "Só particular" },
];

const ORDEM_OPCOES = [
  { valor: "nome", rotulo: "Nome" },
  { valor: "valor", rotulo: "Maior valor gasto" },
  { valor: "compras", rotulo: "Mais compras" },
];

const FILTROS_CLIENTE_VAZIOS = {
  busca: "",
  convenio: "",
  min_compras: "",
  min_valor: "",
  ordenar: "nome",
};

export function CadastroClientes() {
  const [aberto, definirAberto] = useState(false);
  const [emEdicao, definirEmEdicao] = useState(null);
  const [filtros, definirFiltros] = useState(FILTROS_CLIENTE_VAZIOS);

  const mudar = (nome, valor) => definirFiltros((atual) => ({ ...atual, [nome]: valor }));

  // Só o que está preenchido vira parâmetro — assim o mesmo objeto serve para a
  // consulta da tela e para o relatório.
  const parametros = useMemo(() => {
    const limpos = {};
    for (const [nome, valor] of Object.entries(filtros)) {
      const texto = String(valor ?? "").trim();
      if (texto && !(nome === "ordenar" && texto === "nome")) limpos[nome] = texto;
    }
    return limpos;
  }, [filtros]);

  const consulta = useMemo(() => {
    const texto = new URLSearchParams(parametros).toString();
    return texto ? `?${texto}` : "";
  }, [parametros]);

  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.vendas.get(`/clientes${consulta}`),
    [consulta]
  );

  const resumoDosFiltros = useMemo(() => {
    const linhas = [];
    if (filtros.busca.trim()) linhas.push(`Pesquisa: ${filtros.busca.trim()}`);
    if (filtros.convenio) {
      linhas.push(
        CONVENIO_OPCOES.find((opcao) => opcao.valor === filtros.convenio)?.rotulo ?? ""
      );
    }
    if (filtros.min_compras) linhas.push(`A partir de ${filtros.min_compras} compra(s)`);
    if (filtros.min_valor) linhas.push(`A partir de ${formatarMoeda(filtros.min_valor)} gastos`);
    return linhas.filter(Boolean);
  }, [filtros]);

  async function salvar(valores) {
    const corpo = {
      nome: valores.nome,
      cpf: valores.cpf,
      telefone: valores.telefone,
      email: valores.email || null,
      data_nascimento: valores.data_nascimento || null,
      convenio: valores.convenio || null,
      endereco: valores.endereco || null,
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
        acoes={
          <>
            <ExportarRelatorio
              servico="vendas"
              caminho="/relatorios/clientes"
              titulo="Relatório de clientes"
              descricao="A planilha leva dado pessoal (CPF, telefone e endereço) — guarde o arquivo com o mesmo cuidado do cadastro."
              rotulo="Relatório"
              comPeriodo={false}
              parametros={parametros}
              resumoDosFiltros={resumoDosFiltros}
            />
            <Botao
              icone={Plus}
              onClick={() => {
                definirEmEdicao(null);
                definirAberto(true);
              }}
            >
              Novo cliente
            </Botao>
          </>
        }
      />

      <Card>
        <LinhaDeFiltros
          acoes={
            <LimparFiltros
              ativo={Boolean(resumoDosFiltros.length)}
              aoLimpar={() => definirFiltros(FILTROS_CLIENTE_VAZIOS)}
            />
          }
        >
          <BarraDePesquisa
            rotulo="Pesquisar cliente"
            placeholder="Nome, CPF, telefone, email ou convênio"
            valor={filtros.busca}
            aoMudar={(valor) => mudar("busca", valor)}
          />
          <CampoSelect
            rotulo="Convênio"
            className="w-44"
            value={filtros.convenio}
            onChange={(evento) => mudar("convenio", evento.target.value)}
            opcoes={CONVENIO_OPCOES}
          />
          <CampoTexto
            rotulo="Compras a partir de"
            type="number"
            min="0"
            className="w-40"
            placeholder="Ex: 3"
            value={filtros.min_compras}
            onChange={(evento) => mudar("min_compras", evento.target.value)}
          />
          <CampoTexto
            rotulo="Valor gasto a partir de"
            type="number"
            min="0"
            step="0.01"
            className="w-44"
            placeholder="Ex: 500"
            value={filtros.min_valor}
            onChange={(evento) => mudar("min_valor", evento.target.value)}
          />
          <CampoSelect
            rotulo="Ordenar por"
            className="w-48"
            value={filtros.ordenar}
            onChange={(evento) => mudar("ordenar", evento.target.value)}
            opcoes={ORDEM_OPCOES}
          />
        </LinhaDeFiltros>

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
            chave={(cliente) => cliente.id}
            vazio={
              <EstadoVazio
                icone={Users}
                titulo={
                  resumoDosFiltros.length
                    ? "Nenhum cliente com esses filtros"
                    : "Nenhum cliente cadastrado"
                }
                descricao={
                  resumoDosFiltros.length
                    ? "Afrouxe os filtros para ver outros clientes."
                    : "Cadastre para vender a prazo ou por convênio."
                }
              />
            }
          />
        ) : null}
      </Card>

      {aberto ? (
        <FormularioCadastro
          titulo={emEdicao ? "Editar cliente" : "Novo cliente"}
          campos={CAMPOS_CLIENTE}
          valores={
            emEdicao
              ? { ...emEdicao, data_nascimento: emEdicao.data_nascimento?.slice(0, 10) ?? "" }
              : {}
          }
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

// ------------------------------------------------------------------ usuários

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

const FILTROS_USUARIO_VAZIOS = { busca: "", perfil: "", ativo: "" };

/** Usuários e perfis — só o administrador chega nesta tela. */
export function CadastroUsuarios() {
  const [aberto, definirAberto] = useState(false);
  const [erro, definirErro] = useState(null);
  const [filtros, definirFiltros] = useState(FILTROS_USUARIO_VAZIOS);

  const mudar = (nome, valor) => definirFiltros((atual) => ({ ...atual, [nome]: valor }));

  const parametros = useMemo(() => {
    const limpos = {};
    for (const [nome, valor] of Object.entries(filtros)) {
      const texto = String(valor ?? "").trim();
      if (texto) limpos[nome] = texto;
    }
    return limpos;
  }, [filtros]);

  const consulta = useMemo(() => {
    const texto = new URLSearchParams(parametros).toString();
    return texto ? `?${texto}` : "";
  }, [parametros]);

  const { dados, carregando, erro: erroBusca, recarregar } = usarBusca(
    () => api.auth.get(`/usuarios${consulta}`),
    [consulta]
  );

  const resumoDosFiltros = useMemo(() => {
    const linhas = [];
    if (filtros.busca.trim()) linhas.push(`Pesquisa: ${filtros.busca.trim()}`);
    if (filtros.perfil) linhas.push(`Perfil: ${PERFIL_LABEL[filtros.perfil] ?? filtros.perfil}`);
    if (filtros.ativo) linhas.push(filtros.ativo === "true" ? "Só ativos" : "Só inativos");
    return linhas;
  }, [filtros]);

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
        acoes={
          <>
            <ExportarRelatorio
              servico="auth"
              caminho="/relatorios/usuarios"
              titulo="Relatório de usuários"
              descricao="Quem entra no sistema e com qual perfil. Sem senha, sem hash."
              rotulo="Relatório"
              comPeriodo={false}
              parametros={parametros}
              resumoDosFiltros={resumoDosFiltros}
            />
            <Botao icone={Plus} onClick={() => definirAberto(true)}>
              Novo usuário
            </Botao>
          </>
        }
      />

      {erro ? (
        <Aviso tom="erro" className="mb-4">
          {erro}
        </Aviso>
      ) : null}

      <Card>
        <LinhaDeFiltros
          acoes={
            <LimparFiltros
              ativo={Boolean(resumoDosFiltros.length)}
              aoLimpar={() => definirFiltros(FILTROS_USUARIO_VAZIOS)}
            />
          }
        >
          <BarraDePesquisa
            rotulo="Pesquisar usuário"
            placeholder="Nome ou email"
            valor={filtros.busca}
            aoMudar={(valor) => mudar("busca", valor)}
          />
          <CampoSelect
            rotulo="Perfil"
            className="w-56"
            value={filtros.perfil}
            onChange={(evento) => mudar("perfil", evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todos" },
              ...PERFIS_LISTA.map((perfil) => ({ valor: perfil, rotulo: PERFIL_LABEL[perfil] })),
            ]}
          />
          <CampoSelect
            rotulo="Situação"
            className="w-40"
            value={filtros.ativo}
            onChange={(evento) => mudar("ativo", evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todas" },
              { valor: "true", rotulo: "Ativos" },
              { valor: "false", rotulo: "Inativos" },
            ]}
          />
        </LinhaDeFiltros>

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
            chave={(usuario) => usuario.id}
            vazio={
              <EstadoVazio
                icone={UserCog}
                titulo={
                  resumoDosFiltros.length ? "Nenhum usuário com esses filtros" : "Nenhum usuário"
                }
              />
            }
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
