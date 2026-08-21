import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Plus,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
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
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
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

function CupomVenda({ resultado, aoFechar }) {
  const venda = resultado.venda;
  return (
    <Modal
      aberto
      titulo="Venda concluída"
      descricao={`Cupom da venda ${venda.id.slice(0, 8)}`}
      aoFechar={aoFechar}
      rodape={<Botao onClick={aoFechar}>Nova venda</Botao>}
    >
      <div className="space-y-4">
        <Aviso tom="sucesso" titulo="Venda finalizada">
          Estoque baixado por FEFO e valor lançado no caixa do dia.
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
              renderizar: (item) => formatarMoeda(item.quantidade * item.preco_unitario),
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

        {venda.receita ? (
          <div className="rounded-card bg-borda/40 px-4 py-3 text-rotulo text-secundario">
            Receita: {venda.receita.paciente_nome} — Dr(a). {venda.receita.medico_nome}, CRM{" "}
            {venda.receita.medico_crm}, emitida em {formatarData(venda.receita.data_emissao)}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function PDV() {
  const { usuario } = usarAutenticacao();
  const limiteDesconto = descontoMaximoPct(usuario);

  const [busca, definirBusca] = useState("");
  const [venda, definirVenda] = useState(null);
  const [erro, definirErro] = useState(null);
  const [ocupado, definirOcupado] = useState(false);
  const [receita, definirReceita] = useState(RECEITA_VAZIA);
  const [desconto, definirDesconto] = useState("");
  const [formaPagamento, definirFormaPagamento] = useState(FORMA_PAGAMENTO.DINHEIRO);
  const [valorPagamento, definirValorPagamento] = useState("");
  const [resultado, definirResultado] = useState(null);

  const produtos = usarBusca(() => api.estoque.get("/produtos"), []);

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
  const total = venda?.valor_total ?? 0;
  const pago = pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
  const faltante = Math.max(total - pago, 0);
  const temControlado = itens.some((item) => exigeReceita(item.tipo_controle));
  const receitaPendente = temControlado && !venda?.receita;

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

  async function adicionarItem(produto) {
    await executar(async () => {
      let atual = venda;
      if (!atual) {
        const criada = await api.vendas.post("", {});
        atual = criada.venda;
      }
      const resposta = await api.vendas.post(`/${atual.id}/itens`, {
        produto_id: produto.id,
        quantidade: 1,
      });
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
      const resposta = await api.vendas.post(`/${venda.id}/desconto`, {
        desconto: Number(desconto || 0),
      });
      definirVenda(resposta.venda);
    });
  }

  async function vincularReceita(evento) {
    evento.preventDefault();
    await executar(async () => {
      await api.vendas.post(`/${venda.id}/receita`, receita);
      const atualizada = await api.vendas.get(`/${venda.id}`);
      definirVenda(atualizada.venda);
    });
  }

  async function adicionarPagamento(evento) {
    evento.preventDefault();
    await executar(async () => {
      const resposta = await api.vendas.post(`/${venda.id}/pagamentos`, {
        forma_pagamento: formaPagamento,
        valor: Number(valorPagamento),
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
    }
  }

  function novaVenda() {
    definirVenda(null);
    definirResultado(null);
    definirReceita(RECEITA_VAZIA);
    definirDesconto("");
    definirValorPagamento("");
    definirErro(null);
  }

  return (
    <>
      <TituloPagina
        titulo="PDV"
        descricao={
          venda
            ? `Venda ${venda.id.slice(0, 8)} em andamento`
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

          {receitaPendente ? (
            <Card>
              <CardCabecalho
                titulo="Receita obrigatória"
                descricao="Há item controlado no carrinho — sem estes dados a venda não é concluída."
                icone={ShieldAlert}
              />
              <CardCorpo>
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
                    rotulo="CRM"
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
              </CardCorpo>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardCabecalho titulo="Carrinho" icone={ShoppingCart} />
            {itens.length ? (
              <Tabela
                colunas={[
                  {
                    chave: "produto_nome",
                    titulo: "Item",
                    renderizar: (item) => (
                      <div>
                        <p className="text-corpo text-texto">{item.produto_nome}</p>
                        <p className="text-rotulo text-secundario">
                          {formatarNumero(item.quantidade)} x {formatarMoeda(item.preco_unitario)}
                        </p>
                      </div>
                    ),
                  },
                  {
                    chave: "total",
                    titulo: "Total",
                    alinhamento: "direita",
                    renderizar: (item) => formatarMoeda(item.quantidade * item.preco_unitario),
                  },
                  {
                    chave: "acoes",
                    titulo: "",
                    largura: "48px",
                    renderizar: (item) => (
                      <BotaoIcone
                        icone={Trash2}
                        rotulo={`Remover ${item.produto_nome}`}
                        onClick={() => removerItem(item)}
                      />
                    ),
                  },
                ]}
                linhas={itens}
                chave={(item) => item.id}
              />
            ) : (
              <CardCorpo>
                <p className="text-corpo text-secundario">
                  Nenhum item ainda. Adicione produtos pela busca ao lado.
                </p>
              </CardCorpo>
            )}

            {itens.length ? (
              <div className="space-y-3 border-t border-borda px-5 py-4">
                <div className="flex justify-between text-corpo text-secundario">
                  <span>Subtotal</span>
                  <span>{formatarMoeda(bruto)}</span>
                </div>
                {venda.desconto > 0 ? (
                  <div className="flex justify-between text-corpo text-secundario">
                    <span>Desconto</span>
                    <span>- {formatarMoeda(venda.desconto)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-h3 text-texto">
                  <span>Total</span>
                  <span>{formatarMoeda(total)}</span>
                </div>

                <form onSubmit={aplicarDesconto} className="flex items-end gap-2">
                  <CampoTexto
                    rotulo={`Desconto em reais (até ${limiteDesconto}% do seu perfil)`}
                    type="number"
                    step="0.01"
                    min="0"
                    className="flex-1"
                    value={desconto}
                    onChange={(evento) => definirDesconto(evento.target.value)}
                  />
                  <Botao variante="secundario" type="submit" disabled={ocupado}>
                    Aplicar
                  </Botao>
                </form>
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
                      value={valorPagamento}
                      onChange={(evento) => definirValorPagamento(evento.target.value)}
                      ajuda={faltante > 0 ? `Falta ${formatarMoeda(faltante)}` : "Valor coberto"}
                    />
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
                        className="flex justify-between text-corpo text-secundario"
                      >
                        <span>{FORMA_PAGAMENTO_LABEL[pagamento.forma_pagamento]}</span>
                        <span>{formatarMoeda(pagamento.valor)}</span>
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

      {resultado ? <CupomVenda resultado={resultado} aoFechar={novaVenda} /> : null}
    </>
  );
}
