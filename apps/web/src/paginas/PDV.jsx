import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShieldAlert,
  ShoppingCart,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  FORMA_PAGAMENTO,
  FORMA_PAGAMENTO_LABEL,
  FORMA_PAGAMENTO_LISTA,
  exigeReceita,
} from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero, hojeISO } from "../lib/formato.js";
import { descontoMaximoPct, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import { CampoCheckbox, CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const RECEITA_VAZIA = {
  medico_nome: "",
  medico_crm: "",
  paciente_nome: "",
  data_emissao: hojeISO(),
};

const numeroDaVenda = (venda) =>
  venda?.numero ? `#${String(venda.numero).padStart(4, "0")}` : venda?.id?.slice(0, 8) ?? "";

/** Só os dígitos, para comparar CPF digitado com e sem pontuação. */
const somenteDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");

// ------------------------------------------------------------------- cliente

/** Cadastro rápido: o mínimo para identificar quem está no balcão agora. */
function ModalNovoCliente({ aoFechar, aoCriar }) {
  const [formulario, definirFormulario] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    data_nascimento: "",
    convenio: "",
    aceita_contato: true,
  });
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const campo = (nome) => ({
    value: formulario[nome],
    onChange: (evento) => definirFormulario({ ...formulario, [nome]: evento.target.value }),
  });

  async function salvar(evento) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);
    try {
      const { cliente } = await api.vendas.post("/clientes", {
        ...formulario,
        cpf: somenteDigitos(formulario.cpf) || null,
        data_nascimento: formulario.data_nascimento || null,
        convenio: formulario.convenio.trim() || null,
        telefone: formulario.telefone.trim() || null,
      });
      aoCriar(cliente);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo="Cadastrar cliente"
      descricao="Só o nome é obrigatório. O resto pode ser completado depois em Cadastros."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao form="form-novo-cliente" type="submit" disabled={enviando}>
            {enviando ? "Salvando" : "Cadastrar e usar na venda"}
          </Botao>
        </>
      }
    >
      <form id="form-novo-cliente" onSubmit={salvar} className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <CampoTexto rotulo="Nome" required autoFocus {...campo("nome")} />
        </div>
        <CampoTexto rotulo="CPF" inputMode="numeric" placeholder="Só números" {...campo("cpf")} />
        <CampoTexto rotulo="Telefone" placeholder="(11) 90000-0000" {...campo("telefone")} />
        <CampoTexto rotulo="Data de nascimento" type="date" max={hojeISO()} {...campo("data_nascimento")} />
        <CampoTexto rotulo="Convênio" placeholder="Particular, se não tiver" {...campo("convenio")} />
        <div className="col-span-2">
          <CampoCheckbox
            rotulo="Aceita receber contato sobre reposição e promoções"
            checked={formulario.aceita_contato}
            onChange={(evento) =>
              definirFormulario({ ...formulario, aceita_contato: evento.target.checked })
            }
          />
        </div>
        {erro ? (
          <div className="col-span-2">
            <Aviso tom="erro">{erro}</Aviso>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

/**
 * Busca de cliente por nome ou CPF. É um campo de texto e não uma lista suspensa
 * porque com algumas centenas de cadastros a lista deixa de ser navegável — e no
 * balcão o que a pessoa tem em mãos costuma ser o CPF.
 */
function BuscaCliente({ clientes, ocupado, aoEscolher, aoCadastrar }) {
  const [termo, definirTermo] = useState("");

  const encontrados = useMemo(() => {
    const lista = clientes ?? [];
    const texto = termo.trim().toLowerCase();
    if (!texto) return [];
    const digitos = somenteDigitos(texto);
    return lista
      .filter(
        (cliente) =>
          cliente.nome.toLowerCase().includes(texto) ||
          (digitos.length >= 3 && somenteDigitos(cliente.cpf).includes(digitos))
      )
      .slice(0, 6);
  }, [clientes, termo]);

  return (
    <div className="space-y-2">
      <CampoTexto
        rotulo="Buscar por nome ou CPF"
        value={termo}
        onChange={(evento) => definirTermo(evento.target.value)}
        placeholder="Ex: Maria ou 12345678900"
        disabled={ocupado}
      />

      {termo.trim() ? (
        <ul className="divide-y divide-borda rounded-botao border border-borda">
          {encontrados.map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  definirTermo("");
                  aoEscolher(cliente.id);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-borda/50 focus-visible:foco-arkos"
              >
                <span className="min-w-0">
                  <span className="block truncate text-corpo text-texto">{cliente.nome}</span>
                  <span className="block text-rotulo text-secundario">
                    {cliente.cpf ? `CPF ${cliente.cpf}` : "sem CPF"}
                    {cliente.convenio ? ` — ${cliente.convenio}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-rotulo text-secundario">
                  {cliente.total_compras ?? 0} compra(s)
                </span>
              </button>
            </li>
          ))}
          {!encontrados.length ? (
            <li className="px-3 py-2 text-corpo text-secundario">
              Nenhum cliente com esse nome ou CPF.
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Botao tamanho="pequeno" variante="secundario" icone={UserPlus} onClick={aoCadastrar}>
          Cadastrar cliente
        </Botao>
        <span className="text-rotulo text-secundario">
          Sem identificar, a venda entra como balcão.
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ carrinho

/**
 * Linha do carrinho: quantidade multiplicada no lugar (não repete o produto) e
 * desconto do próprio item, que às vezes é o que resolve — abater só o genérico
 * em vez de dar percentual na venda inteira.
 */
function LinhaCarrinho({ item, ocupado, aoAlterarQuantidade, aoDescontar, aoRemover }) {
  const [abertoDesconto, definirAbertoDesconto] = useState(false);
  const [valor, definirValor] = useState("");
  const [tipo, definirTipo] = useState("reais");

  const bruto = item.quantidade * item.preco_unitario;
  const descontoDoItem = Number(item.desconto ?? 0);

  return (
    <li className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-corpo text-texto">{item.produto_nome}</p>
          <p className="text-rotulo text-secundario">
            {formatarMoeda(item.preco_unitario)} cada
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-corpo text-texto">{formatarMoeda(bruto - descontoDoItem)}</p>
          {descontoDoItem > 0 ? (
            <p className="text-rotulo text-sucesso">- {formatarMoeda(descontoDoItem)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center rounded-botao border border-borda">
          <BotaoIcone
            icone={Minus}
            rotulo={`Diminuir ${item.produto_nome}`}
            disabled={ocupado || item.quantidade <= 1}
            onClick={() => aoAlterarQuantidade(item, item.quantidade - 1)}
          />
          <span className="w-8 text-center text-corpo tabular-nums text-texto">
            {formatarNumero(item.quantidade)}
          </span>
          <BotaoIcone
            icone={Plus}
            rotulo={`Aumentar ${item.produto_nome}`}
            disabled={ocupado}
            onClick={() => aoAlterarQuantidade(item, item.quantidade + 1)}
          />
        </div>

        <Botao
          tamanho="pequeno"
          variante="secundario"
          icone={Tag}
          disabled={ocupado}
          onClick={() => definirAbertoDesconto((valorAtual) => !valorAtual)}
        >
          Desconto
        </Botao>

        <div className="ml-auto">
          <BotaoIcone
            icone={Trash2}
            rotulo={`Remover ${item.produto_nome}`}
            disabled={ocupado}
            onClick={() => aoRemover(item)}
          />
        </div>
      </div>

      {abertoDesconto ? (
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={async (evento) => {
            evento.preventDefault();
            await aoDescontar(item, Number(valor || 0), tipo);
            definirValor("");
            definirAbertoDesconto(false);
          }}
        >
          <CampoTexto
            rotulo={`Desconto neste item (máx. ${formatarMoeda(bruto)})`}
            type="number"
            step={tipo === "pct" ? "0.1" : "0.01"}
            min="0"
            max={tipo === "pct" ? "100" : String(bruto)}
            className="flex-1"
            value={valor}
            onChange={(evento) => definirValor(evento.target.value)}
          />
          <div className="flex items-center gap-1 rounded-botao border border-borda p-1">
            {[
              ["reais", "R$"],
              ["pct", "%"],
            ].map(([opcao, rotulo]) => (
              <button
                key={opcao}
                type="button"
                onClick={() => definirTipo(opcao)}
                className={[
                  "h-8 w-9 rounded-botao text-rotulo transition-colors",
                  tipo === opcao ? "bg-primario text-white" : "text-secundario hover:bg-borda/60",
                ].join(" ")}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Botao tamanho="pequeno" type="submit" disabled={ocupado}>
            Aplicar
          </Botao>
          {descontoDoItem > 0 ? (
            <Botao
              tamanho="pequeno"
              variante="secundario"
              disabled={ocupado}
              onClick={async () => {
                await aoDescontar(item, 0, "reais");
                definirAbertoDesconto(false);
              }}
            >
              Tirar
            </Botao>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}

// --------------------------------------------------------------- comprovante

function ComprovanteVenda({ resultado, aoFechar }) {
  const venda = resultado.venda;
  return (
    <Modal
      aberto
      titulo="Venda concluída"
      descricao={`Comprovante da venda ${numeroDaVenda(venda)}`}
      aoFechar={aoFechar}
      rodape={<Botao onClick={aoFechar}>Nova venda</Botao>}
    >
      <div className="space-y-4">
        <Aviso tom="sucesso" titulo="Venda finalizada">
          Baixa de estoque por FEFO (primeiro a vencer, primeiro a sair) e valor lançado no
          caixa do dia.
        </Aviso>

        <Tabela
          colunas={[
            { chave: "produto_nome", titulo: "Item" },
            {
              chave: "quantidade",
              titulo: "Qtd.",
              alinhamento: "direita",
              renderizar: (item) => formatarNumero(item.quantidade),
            },
            {
              chave: "preco_unitario",
              titulo: "Unitário",
              alinhamento: "direita",
              renderizar: (item) => formatarMoeda(item.preco_unitario),
            },
            {
              chave: "total",
              titulo: "Total",
              alinhamento: "direita",
              renderizar: (item) =>
                formatarMoeda(item.quantidade * item.preco_unitario - Number(item.desconto ?? 0)),
            },
          ]}
          linhas={venda.itens}
          chave={(item) => item.id}
        />

        <div className="space-y-1 border-t border-borda pt-3 text-corpo">
          {venda.desconto > 0 ? (
            <div className="flex justify-between text-secundario">
              <span>Desconto</span>
              <span>- {formatarMoeda(venda.desconto)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-h3 text-texto">
            <span>Total</span>
            <span>{formatarMoeda(venda.valor_total)}</span>
          </div>
          {venda.pagamentos.map((pagamento) => (
            <div key={pagamento.id} className="flex justify-between text-secundario">
              <span>{FORMA_PAGAMENTO_LABEL[pagamento.forma_pagamento]}</span>
              <span>{formatarMoeda(pagamento.valor)}</span>
            </div>
          ))}
          {resultado.troco > 0 ? (
            <div className="flex justify-between text-corpo font-semibold text-texto">
              <span>Troco</span>
              <span>{formatarMoeda(resultado.troco)}</span>
            </div>
          ) : null}
        </div>

        {venda.cliente_nome ? (
          <p className="text-rotulo text-secundario">
            Cliente: {venda.cliente_nome}
            {venda.cliente_convenio ? ` (convênio ${venda.cliente_convenio})` : ""}
          </p>
        ) : null}

        {venda.receita ? (
          <div className="rounded-card bg-borda/40 px-4 py-3 text-rotulo text-secundario">
            Receita: {venda.receita.paciente_nome} — Dr(a). {venda.receita.medico_nome},
            registro no Conselho Regional de Medicina {venda.receita.medico_crm}, emitida em{" "}
            {formatarData(venda.receita.data_emissao)}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------- tela

export function PDV() {
  const { usuario } = usarAutenticacao();
  const limiteDesconto = descontoMaximoPct(usuario);
  const [parametros, definirParametros] = useSearchParams();

  const [busca, definirBusca] = useState("");
  const [venda, definirVenda] = useState(null);
  const [erro, definirErro] = useState(null);
  const [ocupado, definirOcupado] = useState(false);
  const [receita, definirReceita] = useState(RECEITA_VAZIA);
  const [receitaAberta, definirReceitaAberta] = useState(false);
  const [desconto, definirDesconto] = useState("");
  const [tipoDesconto, definirTipoDesconto] = useState("reais");
  const [formaPagamento, definirFormaPagamento] = useState(FORMA_PAGAMENTO.DINHEIRO);
  const [valorPagamento, definirValorPagamento] = useState("");
  const [resultado, definirResultado] = useState(null);
  const [cadastrandoCliente, definirCadastrandoCliente] = useState(false);

  const produtos = usarBusca(() => api.estoque.get("/produtos"), []);
  const clientes = usarBusca(() => api.vendas.get("/clientes"), []);

  // Venda em aberto retomada pelo histórico (?venda=...). Carrega uma vez e
  // limpa o parâmetro, para um F5 não trazer de volta algo já finalizado.
  const vendaParaRetomar = parametros.get("venda");
  useEffect(() => {
    if (!vendaParaRetomar) return;
    let cancelado = false;
    definirParametros({}, { replace: true });
    api.vendas
      .get(`/${vendaParaRetomar}`)
      .then((resposta) => {
        if (!cancelado) definirVenda(resposta.venda);
      })
      .catch((falha) => {
        if (!cancelado) definirErro(falha.message);
      });
    return () => {
      cancelado = true;
    };
  }, [vendaParaRetomar, definirParametros]);

  // Com o cliente identificado, o balcão passa a saber o que ele costuma levar.
  const clienteId = venda?.cliente_id ?? null;
  const fichaCliente = usarBusca(
    () => (clienteId ? api.vendas.get(`/crm/clientes/${clienteId}`) : Promise.resolve(null)),
    [clienteId]
  );

  const encontrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = produtos.dados?.produtos ?? [];
    if (!termo) return lista.slice(0, 8);
    return lista
      .filter(
        (produto) =>
          produto.nome.toLowerCase().includes(termo) ||
          (produto.principio_ativo ?? "").toLowerCase().includes(termo) ||
          (produto.codigo_barras ?? "").includes(termo)
      )
      .slice(0, 8);
  }, [busca, produtos.dados]);

  const itens = venda?.itens ?? [];
  const pagamentos = venda?.pagamentos ?? [];
  const bruto = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
  const descontoDosItens = itens.reduce((soma, item) => soma + Number(item.desconto ?? 0), 0);
  const descontoTotal = descontoDosItens + Number(venda?.desconto ?? 0);
  const total = venda?.valor_total ?? 0;
  const pago = pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
  const faltante = Math.max(Number((total - pago).toFixed(2)), 0);
  const temControlado = itens.some((item) => exigeReceita(item.tipo_controle));
  const receitaPendente = temControlado && !venda?.receita;

  // O campo de pagamento já vem com o que falta — é o valor certo em quase toda
  // venda. Digitar por cima continua valendo (pagamento dividido, troco).
  const valorSugerido = valorPagamento === "" ? faltante.toFixed(2) : valorPagamento;

  async function executar(acao) {
    definirErro(null);
    definirOcupado(true);
    try {
      return await acao();
    } catch (falha) {
      definirErro(falha.message);
      return null;
    } finally {
      definirOcupado(false);
    }
  }

  /** Garante uma venda aberta antes de qualquer operação que precise de uma. */
  async function garantirVenda() {
    if (venda) return venda;
    const criada = await api.vendas.post("", {});
    definirVenda(criada.venda);
    return criada.venda;
  }

  async function adicionarItem(produto) {
    await executar(async () => {
      const atual = await garantirVenda();
      const resposta = await api.vendas.post(`/${atual.id}/itens`, {
        produto_id: produto.id,
        quantidade: 1,
      });
      definirVenda(resposta.venda);
    });
  }

  async function alterarQuantidade(item, quantidade) {
    if (quantidade < 1) return;
    await executar(async () => {
      const resposta = await api.vendas.patch(`/${venda.id}/itens/${item.id}`, { quantidade });
      definirVenda(resposta.venda);
    });
  }

  async function descontarItem(item, valor, tipo) {
    await executar(async () => {
      const corpo = tipo === "pct" ? { desconto_pct: valor } : { desconto: valor };
      const resposta = await api.vendas.post(`/${venda.id}/itens/${item.id}/desconto`, corpo);
      definirVenda(resposta.venda);
    });
  }

  async function removerItem(item) {
    await executar(async () => {
      const resposta = await api.vendas.del(`/${venda.id}/itens/${item.id}`);
      definirVenda(resposta.venda);
    });
  }

  async function aplicarDesconto(evento) {
    evento.preventDefault();
    await executar(async () => {
      const corpo =
        tipoDesconto === "pct"
          ? { desconto_pct: Number(desconto || 0) }
          : { desconto: Number(desconto || 0) };
      const resposta = await api.vendas.post(`/${venda.id}/desconto`, corpo);
      definirVenda(resposta.venda);
    });
  }

  /**
   * Identificar o cliente é o que alimenta o relacionamento: sem isso a venda
   * entra como balcão e não conta no histórico de recompra de ninguém.
   */
  async function vincularCliente(idDoCliente) {
    await executar(async () => {
      const atual = await garantirVenda();
      const resposta = await api.vendas.post(`/${atual.id}/cliente`, {
        cliente_id: idDoCliente || null,
      });
      definirVenda(resposta.venda);
    });
  }

  async function removerPagamento(pagamento) {
    await executar(async () => {
      const resposta = await api.vendas.del(`/${venda.id}/pagamentos/${pagamento.id}`);
      definirVenda(resposta.venda);
    });
  }

  async function vincularReceita(evento) {
    evento.preventDefault();
    await executar(async () => {
      const atual = await garantirVenda();
      await api.vendas.post(`/${atual.id}/receita`, receita);
      const atualizada = await api.vendas.get(`/${atual.id}`);
      definirVenda(atualizada.venda);
      definirReceitaAberta(false);
    });
  }

  /** Desfaz a receita vinculada — receita trocada, dados digitados errados. */
  async function cancelarReceita() {
    await executar(async () => {
      const resposta = await api.vendas.del(`/${venda.id}/receita`);
      definirVenda(resposta.venda);
      definirReceita(RECEITA_VAZIA);
    });
  }

  async function adicionarPagamento(evento) {
    evento.preventDefault();
    await executar(async () => {
      const resposta = await api.vendas.post(`/${venda.id}/pagamentos`, {
        forma_pagamento: formaPagamento,
        valor: Number(valorSugerido),
      });
      definirVenda(resposta.venda);
      definirValorPagamento("");
    });
  }

  async function finalizar() {
    const resposta = await executar(() => api.vendas.post(`/${venda.id}/finalizar`, {}));
    if (resposta) {
      definirResultado(resposta);
      produtos.recarregar();
      clientes.recarregar();
    }
  }

  function novaVenda() {
    definirVenda(null);
    definirResultado(null);
    definirReceita(RECEITA_VAZIA);
    definirReceitaAberta(false);
    definirDesconto("");
    definirValorPagamento("");
    definirErro(null);
  }

  // O formulário de receita aparece quando é obrigatório, quando já existe uma
  // vinculada, ou quando a pessoa escolhe registrar mesmo sem ser controlado.
  const mostrarReceita = Boolean(receitaPendente || receitaAberta || venda?.receita);

  return (
    <>
      <TituloPagina
        titulo="PDV — ponto de venda"
        descricao={
          venda
            ? `Venda ${numeroDaVenda(venda)} em andamento`
            : "Busque o produto para iniciar uma venda."
        }
        acoes={
          venda ? (
            <Botao variante="secundario" onClick={novaVenda}>
              Descartar e começar outra
            </Botao>
          ) : null
        }
      />

      <div className="grid grid-cols-[1fr_420px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardCabecalho titulo="Buscar produto" icone={Search} />
            <CardCorpo>
              <CampoTexto
                rotulo="Nome, princípio ativo ou código de barras"
                value={busca}
                onChange={(evento) => definirBusca(evento.target.value)}
                placeholder="Ex: dipirona ou 7891234567890"
                autoFocus
              />

              {produtos.carregando ? <Carregando texto="Carregando catálogo" /> : null}
              {produtos.erro ? (
                <Aviso tom="erro" titulo="Não foi possível carregar o catálogo">
                  {produtos.erro.message}
                </Aviso>
              ) : null}

              <ul className="mt-4 divide-y divide-borda">
                {encontrados.map((produto) => {
                  const semEstoque = produto.quantidade_atual <= 0 && !produto.venda_sob_encomenda;
                  return (
                    <li key={produto.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-corpo font-medium text-texto">{produto.nome}</p>
                        <p className="mt-0.5 text-rotulo text-secundario">
                          {formatarMoeda(produto.preco_venda)} — disponível{" "}
                          {formatarNumero(produto.quantidade_atual)} {produto.unidade_venda}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {exigeReceita(produto.tipo_controle) ? (
                          <Badge tom="erro">Exige receita</Badge>
                        ) : null}
                        {semEstoque ? <Badge tom="alerta">Sem estoque</Badge> : null}
                        <Botao
                          tamanho="pequeno"
                          icone={Plus}
                          disabled={ocupado || semEstoque}
                          onClick={() => adicionarItem(produto)}
                        >
                          Adicionar
                        </Botao>
                      </div>
                    </li>
                  );
                })}
                {!produtos.carregando && !encontrados.length ? (
                  <li className="py-6 text-corpo text-secundario">
                    Nenhum produto encontrado para esta busca.
                  </li>
                ) : null}
              </ul>
            </CardCorpo>
          </Card>

          {mostrarReceita ? (
            <Card>
              <CardCabecalho
                titulo={receitaPendente ? "Receita obrigatória" : "Receita"}
                descricao={
                  receitaPendente
                    ? "Há item controlado no carrinho — sem estes dados a venda não é concluída."
                    : "Registro da receita apresentada, mesmo sem item controlado."
                }
                icone={ShieldAlert}
                acoes={
                  !receitaPendente && !venda?.receita ? (
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      icone={X}
                      onClick={() => definirReceitaAberta(false)}
                    >
                      Cancelar inclusão
                    </Botao>
                  ) : null
                }
              />
              <CardCorpo>
                {venda?.receita ? (
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-corpo text-texto">
                      <p>{venda.receita.paciente_nome}</p>
                      <p className="text-rotulo text-secundario">
                        Dr(a). {venda.receita.medico_nome} — registro no Conselho Regional de
                        Medicina {venda.receita.medico_crm}, emitida em{" "}
                        {formatarData(venda.receita.data_emissao)}
                      </p>
                    </div>
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      icone={X}
                      disabled={ocupado}
                      onClick={cancelarReceita}
                    >
                      Cancelar inclusão
                    </Botao>
                  </div>
                ) : (
                  <form onSubmit={vincularReceita} className="grid grid-cols-2 gap-4">
                    <CampoTexto
                      rotulo="Nome do médico"
                      required
                      value={receita.medico_nome}
                      onChange={(evento) =>
                        definirReceita({ ...receita, medico_nome: evento.target.value })
                      }
                    />
                    <CampoTexto
                      rotulo="CRM (Conselho Regional de Medicina)"
                      required
                      value={receita.medico_crm}
                      onChange={(evento) =>
                        definirReceita({ ...receita, medico_crm: evento.target.value })
                      }
                    />
                    <CampoTexto
                      rotulo="Nome do paciente"
                      required
                      value={receita.paciente_nome}
                      onChange={(evento) =>
                        definirReceita({ ...receita, paciente_nome: evento.target.value })
                      }
                    />
                    <CampoTexto
                      rotulo="Data de emissão"
                      type="date"
                      required
                      max={hojeISO()}
                      value={receita.data_emissao}
                      onChange={(evento) =>
                        definirReceita({ ...receita, data_emissao: evento.target.value })
                      }
                    />
                    <div className="col-span-2">
                      <Botao type="submit" disabled={ocupado}>
                        Vincular receita à venda
                      </Botao>
                    </div>
                  </form>
                )}
              </CardCorpo>
            </Card>
          ) : (
            <Botao
              variante="secundario"
              icone={ShieldAlert}
              onClick={() => definirReceitaAberta(true)}
            >
              Registrar receita manualmente
            </Botao>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardCabecalho
              titulo="Cliente"
              descricao="Identificar quem está comprando alimenta o histórico de recompra."
              icone={UserPlus}
            />
            <CardCorpo className="space-y-2">
              {venda?.cliente_id ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-corpo font-medium text-texto">{venda.cliente_nome}</p>
                      <p className="text-rotulo text-secundario">
                        {venda.cliente_convenio
                          ? `Convênio ${venda.cliente_convenio}`
                          : "Cliente particular"}
                        {venda.cliente_telefone ? ` — ${venda.cliente_telefone}` : ""}
                      </p>
                    </div>
                    <BotaoIcone
                      icone={X}
                      rotulo="Tirar cliente da venda"
                      onClick={() => vincularCliente(null)}
                    />
                  </div>

                  {/* O que este cliente costuma levar, para oferecer no balcão. */}
                  {fichaCliente.dados?.cliente?.preferidos?.length ? (
                    <div className="rounded-botao bg-fundo px-3 py-2">
                      <p className="text-rotulo text-secundario">
                        {fichaCliente.dados.cliente.intervalo_medio_dias
                          ? `Costuma comprar a cada ${fichaCliente.dados.cliente.intervalo_medio_dias} dias — última há ${fichaCliente.dados.cliente.dias_sem_comprar}`
                          : "Primeira vez que compra identificado"}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {fichaCliente.dados.cliente.preferidos.slice(0, 3).map((preferido) => {
                          const doCatalogo = (produtos.dados?.produtos ?? []).find(
                            (produto) => produto.id === preferido.produto_id
                          );
                          const semEstoque =
                            doCatalogo && doCatalogo.quantidade_atual <= 0 &&
                            !doCatalogo.venda_sob_encomenda;

                          return (
                            <li
                              key={preferido.produto_id}
                              className="flex items-center justify-between gap-2 text-corpo"
                            >
                              <span className="min-w-0 truncate text-texto">
                                {preferido.produto_nome}
                                <span className="text-secundario"> — {preferido.vezes}x</span>
                              </span>
                              {doCatalogo ? (
                                <Botao
                                  tamanho="pequeno"
                                  variante="secundario"
                                  icone={Plus}
                                  disabled={ocupado || semEstoque}
                                  onClick={() => adicionarItem(doCatalogo)}
                                >
                                  {semEstoque ? "Sem estoque" : "Levar"}
                                </Botao>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      {fichaCliente.dados.cliente.situacao === "recompra_atrasada" ? (
                        <p className="mt-2 text-rotulo text-alerta">
                          Reposição atrasada {fichaCliente.dados.cliente.atraso_recompra_dias}{" "}
                          dia(s) — vale confirmar se ficou sem o medicamento.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <BuscaCliente
                  clientes={clientes.dados?.clientes}
                  ocupado={ocupado || clientes.carregando}
                  aoEscolher={vincularCliente}
                  aoCadastrar={() => definirCadastrandoCliente(true)}
                />
              )}
            </CardCorpo>
          </Card>

          <Card>
            <CardCabecalho titulo="Carrinho" icone={ShoppingCart} />
            {itens.length ? (
              <ul className="divide-y divide-borda">
                {itens.map((item) => (
                  <LinhaCarrinho
                    key={item.id}
                    item={item}
                    ocupado={ocupado}
                    aoAlterarQuantidade={alterarQuantidade}
                    aoDescontar={descontarItem}
                    aoRemover={removerItem}
                  />
                ))}
              </ul>
            ) : (
              <CardCorpo>
                <p className="text-corpo text-secundario">
                  Nenhum item ainda. Adicione produtos pela busca ao lado.
                </p>
              </CardCorpo>
            )}

            {itens.length ? (
              <div className="space-y-3 border-t border-borda px-5 py-4">
                {/* Subtotal, desconto e só então o total: a conta na ordem em que
                    a pessoa explica para o cliente. */}
                <div className="flex justify-between text-corpo text-secundario">
                  <span>Subtotal</span>
                  <span>{formatarMoeda(bruto)}</span>
                </div>

                <div className="space-y-2 rounded-botao bg-fundo px-3 py-2">
                  <div className="flex justify-between text-corpo">
                    <span className="text-secundario">Desconto</span>
                    <span className={descontoTotal > 0 ? "text-sucesso" : "text-secundario"}>
                      {descontoTotal > 0 ? `- ${formatarMoeda(descontoTotal)}` : formatarMoeda(0)}
                    </span>
                  </div>
                  {descontoDosItens > 0 ? (
                    <p className="text-rotulo text-secundario">
                      {formatarMoeda(descontoDosItens)} vindo de desconto por item.
                    </p>
                  ) : null}

                  <form onSubmit={aplicarDesconto} className="flex items-end gap-2">
                    <CampoTexto
                      rotulo={`Na venda toda (seu perfil vai até ${limiteDesconto}%)`}
                      type="number"
                      step={tipoDesconto === "pct" ? "0.1" : "0.01"}
                      min="0"
                      max={tipoDesconto === "pct" ? "100" : undefined}
                      className="flex-1"
                      value={desconto}
                      onChange={(evento) => definirDesconto(evento.target.value)}
                      ajuda={
                        tipoDesconto === "pct"
                          ? `${desconto || 0}% do subtotal dá ${formatarMoeda(
                              (bruto * Number(desconto || 0)) / 100
                            )}`
                          : bruto > 0
                            ? `${formatarMoeda(Number(desconto || 0))} é ${(
                                (Number(desconto || 0) / bruto) *
                                100
                              )
                                .toFixed(1)
                                .replace(".", ",")}% do subtotal`
                            : undefined
                      }
                    />

                    {/* Reais ou percentual: o desconto é combinado das duas formas no balcão. */}
                    <div className="flex items-center gap-1 rounded-botao border border-borda p-1">
                      {[
                        ["reais", "R$"],
                        ["pct", "%"],
                      ].map(([valor, rotulo]) => (
                        <button
                          key={valor}
                          type="button"
                          onClick={() => definirTipoDesconto(valor)}
                          className={[
                            "h-8 w-10 rounded-botao text-rotulo transition-colors",
                            tipoDesconto === valor
                              ? "bg-primario text-white"
                              : "text-secundario hover:bg-borda/60",
                          ].join(" ")}
                        >
                          {rotulo}
                        </button>
                      ))}
                    </div>

                    <Botao variante="secundario" type="submit" disabled={ocupado}>
                      Aplicar
                    </Botao>
                  </form>
                </div>

                <div className="flex justify-between text-h3 text-texto">
                  <span>Total</span>
                  <span>{formatarMoeda(total)}</span>
                </div>
              </div>
            ) : null}
          </Card>

          {itens.length ? (
            <Card>
              <CardCabecalho titulo="Pagamento" icone={CreditCard} />
              <CardCorpo className="space-y-4">
                <form onSubmit={adicionarPagamento} className="space-y-3">
                  <CampoSelect
                    rotulo="Forma de pagamento"
                    value={formaPagamento}
                    onChange={(evento) => definirFormaPagamento(evento.target.value)}
                    opcoes={FORMA_PAGAMENTO_LISTA.map((forma) => ({
                      valor: forma,
                      rotulo: FORMA_PAGAMENTO_LABEL[forma],
                    }))}
                  />
                  <div className="flex items-end gap-2">
                    <CampoTexto
                      rotulo="Valor"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className="flex-1"
                      value={valorSugerido}
                      onChange={(evento) => definirValorPagamento(evento.target.value)}
                      ajuda={
                        faltante > 0
                          ? `Já vem preenchido com o que falta: ${formatarMoeda(faltante)}`
                          : "Valor coberto"
                      }
                    />
                    {faltante > 0 && Number(valorSugerido) !== faltante ? (
                      <Botao
                        variante="secundario"
                        onClick={() => definirValorPagamento("")}
                        disabled={ocupado}
                      >
                        Restante
                      </Botao>
                    ) : null}
                    <Botao variante="secundario" type="submit" disabled={ocupado}>
                      Adicionar
                    </Botao>
                  </div>
                </form>

                {pagamentos.length ? (
                  <ul className="space-y-1">
                    {pagamentos.map((pagamento) => (
                      <li
                        key={pagamento.id}
                        className="flex items-center justify-between gap-2 text-corpo"
                      >
                        <span className="text-secundario">
                          {FORMA_PAGAMENTO_LABEL[pagamento.forma_pagamento]}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-texto">{formatarMoeda(pagamento.valor)}</span>
                          {/* Cliente troca de ideia antes de finalizar: dá para tirar. */}
                          <BotaoIcone
                            icone={X}
                            rotulo={`Remover ${
                              FORMA_PAGAMENTO_LABEL[pagamento.forma_pagamento]
                            } de ${formatarMoeda(pagamento.valor)}`}
                            onClick={() => removerPagamento(pagamento)}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {receitaPendente ? (
                  <Aviso tom="erro" titulo="Receita pendente">
                    Item controlado sem receita vinculada — a finalização fica bloqueada.
                  </Aviso>
                ) : null}

                {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

                <Botao
                  icone={CheckCircle2}
                  tamanho="grande"
                  className="w-full"
                  disabled={ocupado || receitaPendente || faltante > 0}
                  onClick={finalizar}
                >
                  Finalizar venda
                </Botao>
              </CardCorpo>
            </Card>
          ) : erro ? (
            <Aviso tom="erro">{erro}</Aviso>
          ) : null}
        </div>
      </div>

      {cadastrandoCliente ? (
        <ModalNovoCliente
          aoFechar={() => definirCadastrandoCliente(false)}
          aoCriar={(cliente) => {
            definirCadastrandoCliente(false);
            clientes.recarregar();
            vincularCliente(cliente.id);
          }}
        />
      ) : null}

      {resultado ? <ComprovanteVenda resultado={resultado} aoFechar={novaVenda} /> : null}
    </>
  );
}
