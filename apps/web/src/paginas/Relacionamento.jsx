import { useMemo, useState } from "react";
import {
  BellRing,
  CalendarClock,
  Check,
  ClipboardCopy,
  Eye,
  HeartHandshake,
  PhoneCall,
  Repeat,
  UserRoundX,
} from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarNumero,
  hojeISO,
} from "../lib/formato.js";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto, CampoTextoLongo } from "../componentes/Campos.jsx";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const SITUACAO = {
  recompra_atrasada: { rotulo: "Recompra atrasada", tom: "erro" },
  inativo: { rotulo: "Inativo", tom: "erro" },
  em_risco: { rotulo: "Em risco", tom: "alerta" },
  novo: { rotulo: "Novo", tom: "info" },
  ativo: { rotulo: "Em dia", tom: "sucesso" },
};

const CANAIS = [
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "Email" },
  { valor: "presencial", rotulo: "Presencial" },
];

const RESULTADOS = [
  { valor: "aguardando", rotulo: "Aguardando resposta" },
  { valor: "interessado", rotulo: "Interessado" },
  { valor: "convertido", rotulo: "Comprou" },
  { valor: "nao_atendeu", rotulo: "Não atendeu" },
  { valor: "sem_interesse", rotulo: "Sem interesse" },
];

const rotuloResultado = (valor) =>
  RESULTADOS.find((resultado) => resultado.valor === valor)?.rotulo ?? valor;

/**
 * Ficha do cliente: o que ele compra, de quanto em quanto tempo, o que oferecer
 * hoje e o registro do contato. O saldo em estoque de cada produto preferido vem
 * do estoque-service — não faz sentido oferecer o que não tem para entregar.
 */
function FichaCliente({ clienteId, catalogo, aoFechar, aoRegistrar }) {
  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.vendas.get(`/crm/clientes/${clienteId}`),
    [clienteId]
  );

  const [canal, definirCanal] = useState("telefone");
  const [motivo, definirMotivo] = useState("");
  const [oferta, definirOferta] = useState("");
  const [observacao, definirObservacao] = useState("");
  const [resultado, definirResultado] = useState("aguardando");
  const [retorno, definirRetorno] = useState("");
  const [descontoOferta, definirDescontoOferta] = useState("");
  const [mensagemCopiada, definirMensagemCopiada] = useState(false);
  const [erroEnvio, definirErroEnvio] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const cliente = dados?.cliente;

  // Preenche o formulário com a sugestão, deixando o operador ajustar.
  const motivoAtual = motivo || cliente?.motivo || "";
  const ofertaAtual = oferta || cliente?.oferta || "";
  // O percentual sugerido vem junto da oferta e é o que o balcão vai poder
  // aplicar depois com um clique. Zerar o campo cancela a promessa.
  const descontoAtual =
    descontoOferta !== "" ? descontoOferta : cliente?.desconto_pct ? String(cliente.desconto_pct) : "";

  const emDias = (dias) => {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
  };

  const saldoDoProduto = (produtoId) =>
    catalogo?.find((produto) => produto.id === produtoId)?.quantidade_atual ?? null;

  async function copiarMensagem() {
    if (!cliente?.mensagem) return;
    try {
      await navigator.clipboard.writeText(cliente.mensagem);
      definirMensagemCopiada(true);
      setTimeout(() => definirMensagemCopiada(false), 2500);
    } catch {
      definirErroEnvio("O navegador não liberou a área de transferência. Copie o texto à mão.");
    }
  }

  async function registrar() {
    definirErroEnvio(null);
    definirEnviando(true);
    try {
      await api.vendas.post("/crm/contatos", {
        cliente_id: clienteId,
        canal,
        motivo: motivoAtual,
        oferta: ofertaAtual,
        observacao: observacao || null,
        resultado,
        proximo_contato_em: retorno || null,
        desconto_pct: descontoAtual === "" ? null : Number(descontoAtual),
      });
      definirObservacao("");
      definirRetorno("");
      recarregar();
      aoRegistrar?.();
    } catch (falha) {
      definirErroEnvio(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      largura="max-w-4xl"
      titulo={cliente ? cliente.nome : "Ficha do cliente"}
      descricao={
        cliente
          ? [
              cliente.convenio ? `Convênio ${cliente.convenio}` : "Cliente particular",
              cliente.telefone,
              cliente.cpf ? `CPF ${cliente.cpf}` : null,
            ]
              .filter(Boolean)
              .join(" — ")
          : undefined
      }
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao icone={PhoneCall} onClick={registrar} disabled={enviando || !motivoAtual}>
            {enviando ? "Registrando" : "Registrar contato"}
          </Botao>
        </>
      }
    >
      {carregando ? <Carregando texto="Carregando histórico" /> : null}
      {erro ? <Aviso tom="erro">{erro.message}</Aviso> : null}

      {cliente ? (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            {[
              ["Compras", formatarNumero(cliente.total_compras)],
              ["Total gasto", formatarMoeda(cliente.valor_total)],
              ["Ticket médio", formatarMoeda(cliente.ticket_medio)],
              [
                "Ritmo de compra",
                cliente.intervalo_medio_dias
                  ? `a cada ${cliente.intervalo_medio_dias} dias`
                  : "sem padrão ainda",
              ],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-card bg-fundo px-3 py-2">
                <p className="text-rotulo text-secundario">{rotulo}</p>
                <p className="mt-0.5 text-corpo font-semibold text-texto">{valor}</p>
              </div>
            ))}
          </div>

          <div className="rounded-card bg-fundo px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge tom={SITUACAO[cliente.situacao]?.tom}>
                {SITUACAO[cliente.situacao]?.rotulo ?? cliente.situacao}
              </Badge>
              <p className="text-corpo font-medium text-texto">{cliente.motivo}</p>
            </div>
            <p className="mt-2 text-corpo text-secundario">
              Última compra {cliente.ultima_compra ? formatarData(cliente.ultima_compra) : "—"}
              {cliente.dias_sem_comprar !== null
                ? ` (há ${cliente.dias_sem_comprar} dias)`
                : ""}
              {cliente.dias_para_recompra !== null
                ? cliente.dias_para_recompra >= 0
                  ? ` — próxima reposição prevista em ${cliente.dias_para_recompra} dia(s)`
                  : ` — reposição atrasada ${cliente.atraso_recompra_dias} dia(s)`
                : ""}
            </p>
            <p className="mt-2 text-corpo text-texto">
              <span className="text-secundario">Oferta sugerida: </span>
              {cliente.oferta}
            </p>

            <div className="mt-3 rounded-botao border border-borda bg-card px-3 py-2">
              <p className="text-rotulo text-secundario">Mensagem pronta</p>
              <p className="mt-1 text-corpo text-texto">{cliente.mensagem}</p>
              <Botao
                tamanho="pequeno"
                variante="secundario"
                icone={mensagemCopiada ? Check : ClipboardCopy}
                className="mt-2"
                onClick={copiarMensagem}
              >
                {mensagemCopiada ? "Copiado" : "Copiar mensagem"}
              </Botao>
            </div>
          </div>

          {cliente.preferidos.length ? (
            <div>
              <h3 className="mb-2 text-h3 text-texto">O que este cliente leva</h3>
              <ul className="space-y-1">
                {cliente.preferidos.map((item) => {
                  const saldo = saldoDoProduto(item.produto_id);
                  return (
                    <li
                      key={item.produto_id}
                      className="flex items-center justify-between gap-3 rounded-botao bg-fundo px-3 py-2 text-corpo"
                    >
                      <span className="text-texto">
                        {item.produto_nome}
                        {item.tipo_controle !== "livre" ? (
                          <Badge tom="erro" className="ml-2">
                            exige receita
                          </Badge>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-3 text-rotulo">
                        <span className="text-secundario">
                          {item.vezes}x — {formatarNumero(item.unidades)} un.
                        </span>
                        {saldo === null ? null : saldo > 0 ? (
                          <Badge tom="sucesso">{formatarNumero(saldo)} em estoque</Badge>
                        ) : (
                          <Badge tom="erro">sem estoque — não ofertar</Badge>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-h3 text-texto">Registrar este contato</h3>
            <div className="grid grid-cols-2 gap-3">
              <CampoSelect
                rotulo="Canal"
                value={canal}
                onChange={(evento) => definirCanal(evento.target.value)}
                opcoes={CANAIS}
              />
              <CampoSelect
                rotulo="Resultado"
                value={resultado}
                onChange={(evento) => definirResultado(evento.target.value)}
                opcoes={RESULTADOS}
              />
              <CampoTexto
                rotulo="Motivo"
                className="col-span-2"
                value={motivoAtual}
                onChange={(evento) => definirMotivo(evento.target.value)}
              />
              <CampoTexto
                rotulo="Oferta feita"
                className="col-span-2"
                value={ofertaAtual}
                onChange={(evento) => definirOferta(evento.target.value)}
              />
              <CampoTexto
                rotulo="Desconto prometido (%)"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={descontoAtual}
                onChange={(evento) => definirDescontoOferta(evento.target.value)}
                ajuda="Aparece no ponto de venda quando o cliente chegar, com um botão para aplicar."
              />
              <div>
                <CampoTexto
                  rotulo="Voltar a falar em"
                  type="date"
                  min={hojeISO()}
                  value={retorno}
                  onChange={(evento) => definirRetorno(evento.target.value)}
                  ajuda="Deixe vazio se não precisa retorno."
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[
                    ["Amanhã", 1],
                    ["3 dias", 3],
                    ["1 semana", 7],
                    ["15 dias", 15],
                  ].map(([rotulo, dias]) => (
                    <button
                      key={dias}
                      type="button"
                      onClick={() => definirRetorno(emDias(dias))}
                      className="rounded-botao border border-borda px-2 py-1 text-rotulo text-secundario hover:bg-borda/60 focus-visible:foco-arkos"
                    >
                      {rotulo}
                    </button>
                  ))}
                  {retorno ? (
                    <button
                      type="button"
                      onClick={() => definirRetorno("")}
                      className="rounded-botao px-2 py-1 text-rotulo text-primario hover:bg-borda/60 focus-visible:foco-arkos"
                    >
                      Sem retorno
                    </button>
                  ) : null}
                </div>
              </div>
              <CampoTextoLongo
                rotulo="Observação"
                className="col-span-2"
                linhas={2}
                value={observacao}
                onChange={(evento) => definirObservacao(evento.target.value)}
                placeholder="Ex: pediu para ligar depois das 18h"
              />
            </div>
            {erroEnvio ? (
              <Aviso tom="erro" className="mt-3">
                {erroEnvio}
              </Aviso>
            ) : null}
          </div>

          {dados.contatos.length ? (
            <div>
              <h3 className="mb-2 text-h3 text-texto">Contatos anteriores</h3>
              <Tabela
                colunas={[
                  {
                    chave: "criado_em",
                    titulo: "Quando",
                    renderizar: (contato) => formatarDataHora(contato.criado_em),
                  },
                  { chave: "canal", titulo: "Canal" },
                  { chave: "motivo", titulo: "Motivo" },
                  {
                    chave: "resultado",
                    titulo: "Resultado",
                    renderizar: (contato) => (
                      <Badge
                        tom={
                          contato.resultado === "convertido"
                            ? "sucesso"
                            : contato.resultado === "sem_interesse"
                              ? "erro"
                              : "neutro"
                        }
                      >
                        {rotuloResultado(contato.resultado)}
                      </Badge>
                    ),
                  },
                ]}
                linhas={dados.contatos}
                chave={(contato) => contato.id}
              />
            </div>
          ) : null}

          {dados.vendas.length ? (
            <div>
              <h3 className="mb-2 text-h3 text-texto">Últimas compras</h3>
              <Tabela
                colunas={[
                  {
                    chave: "criado_em",
                    titulo: "Quando",
                    renderizar: (venda) => formatarData(venda.criado_em),
                  },
                  { chave: "itens", titulo: "Itens", renderizar: (venda) => venda.itens ?? "—" },
                  {
                    chave: "valor_total",
                    titulo: "Valor",
                    alinhamento: "direita",
                    renderizar: (venda) => formatarMoeda(venda.valor_total),
                  },
                ]}
                linhas={dados.vendas.slice(0, 8)}
                chave={(venda) => venda.id}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * Retornos combinados e ainda não atendidos.
 *
 * Prometer "te ligo quinta" e não ligar é pior do que não ter ligado, e era
 * exatamente o que acontecia: o retorno ficava numa observação em texto livre
 * que ninguém relia. O retorno some da lista quando alguém fala de novo com o
 * cliente — não é preciso marcar "concluído", que é o tipo de tarefa que fica
 * eternamente pendente.
 */
function Retornos({ aoAbrirFicha }) {
  const { dados, carregando, erro } = usarBusca(() => api.vendas.get("/crm/retornos"), []);

  const retornos = dados?.retornos ?? [];
  const vencidos = retornos.filter((retorno) => retorno.dias_de_atraso > 0);
  const paraHoje = retornos.filter((retorno) => retorno.dias_de_atraso === 0);
  const proximos = retornos.filter((retorno) => retorno.dias_de_atraso < 0);

  const quando = (retorno) => {
    if (retorno.dias_de_atraso > 0) {
      return <Badge tom="erro">{retorno.dias_de_atraso} dia(s) atrasado</Badge>;
    }
    if (retorno.dias_de_atraso === 0) return <Badge tom="alerta">Hoje</Badge>;
    return <Badge>em {Math.abs(retorno.dias_de_atraso)} dia(s)</Badge>;
  };

  return (
    <Card>
      <CardCabecalho
        titulo="Retornos combinados"
        descricao="Quem ficou de receber uma resposta e ainda não recebeu."
        icone={BellRing}
      />

      {carregando ? <Carregando /> : null}
      {erro ? (
        <div className="px-5 py-4">
          <Aviso tom="erro">{erro.message}</Aviso>
        </div>
      ) : null}

      {dados ? (
        <>
          {vencidos.length || paraHoje.length ? (
            <div className="px-5 pt-4">
              <Aviso tom={vencidos.length ? "erro" : "alerta"}>
                {vencidos.length
                  ? `${vencidos.length} retorno(s) atrasado(s)`
                  : `${paraHoje.length} retorno(s) para hoje`}
                {vencidos.length && paraHoje.length ? ` e ${paraHoje.length} para hoje` : ""}.
              </Aviso>
            </div>
          ) : null}

          <Tabela
            colunas={[
              {
                chave: "proximo_contato_em",
                titulo: "Combinado para",
                renderizar: (retorno) => (
                  <div>
                    <p className="text-corpo text-texto">
                      {formatarData(retorno.proximo_contato_em)}
                    </p>
                    <p className="mt-0.5">{quando(retorno)}</p>
                  </div>
                ),
              },
              { chave: "cliente_nome", titulo: "Cliente" },
              {
                chave: "telefone",
                titulo: "Telefone",
                renderizar: (retorno) => retorno.telefone ?? "—",
              },
              { chave: "motivo", titulo: "Motivo do contato" },
              {
                chave: "oferta",
                titulo: "O que foi oferecido",
                renderizar: (retorno) => (
                  <div>
                    <p className="text-corpo text-texto">{retorno.oferta ?? "—"}</p>
                    {retorno.desconto_pct ? (
                      <p className="mt-0.5 text-rotulo text-secundario">
                        {Number(retorno.desconto_pct)}% prometidos
                      </p>
                    ) : null}
                  </div>
                ),
              },
              {
                chave: "situacao",
                titulo: "Já comprou?",
                renderizar: (retorno) =>
                  retorno.venda_apos_contato_id ? (
                    <Badge tom="sucesso">Comprou {formatarMoeda(retorno.valor_da_compra)}</Badge>
                  ) : (
                    <Badge tom="neutro">Ainda não</Badge>
                  ),
              },
              {
                chave: "acoes",
                titulo: "",
                renderizar: (retorno) => (
                  <Botao
                    tamanho="pequeno"
                    variante="secundario"
                    onClick={() => aoAbrirFicha(retorno.cliente_id)}
                  >
                    Abrir ficha
                  </Botao>
                ),
              },
            ]}
            linhas={[...vencidos, ...paraHoje, ...proximos]}
            chave={(retorno) => retorno.id}
            vazio={
              <EstadoVazio
                icone={BellRing}
                titulo="Nenhum retorno combinado"
                descricao="Ao registrar um contato, marque quando voltar a falar e ele aparece aqui."
              />
            }
          />
        </>
      ) : null}
    </Card>
  );
}

/** Agenda dos contatos já registrados, com filtro, busca e exportação. */
function AgendaContatos({ aoAtualizar }) {
  const [filtroResultado, definirFiltroResultado] = useState("");
  const [filtroCanal, definirFiltroCanal] = useState("");
  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");

  // Os mesmos parâmetros servem a lista e ao relatório — o que sai na planilha
  // é exatamente o que está na tela.
  const consulta = useMemo(() => {
    const query = new URLSearchParams();
    if (filtroResultado) query.set("resultado", filtroResultado);
    if (filtroCanal) query.set("canal", filtroCanal);
    if (buscaAplicada.trim()) query.set("busca", buscaAplicada.trim());
    return query.toString();
  }, [filtroResultado, filtroCanal, buscaAplicada]);

  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.vendas.get(`/crm/contatos${consulta ? `?${consulta}` : ""}`),
    [consulta]
  );
  const [erroEdicao, definirErroEdicao] = useState(null);

  async function alterar(contato, resultado) {
    definirErroEdicao(null);
    try {
      await api.vendas.patch(`/crm/contatos/${contato.id}`, { resultado });
      recarregar();
      aoAtualizar?.();
    } catch (falha) {
      definirErroEdicao(falha.message);
    }
  }

  return (
    <Card>
      <CardCabecalho
        titulo="Contatos registrados"
        descricao="O que já foi falado com cada cliente e no que deu."
        icone={PhoneCall}
        acoes={
          <ExportarRelatorio
            servico="vendas"
            caminho={`/crm/relatorio?tipo=contatos${consulta ? `&${consulta}` : ""}`}
            titulo="Exportar contatos"
            descricao="Sai com os filtros que estão aplicados aqui na tela."
            comPeriodo={false}
            comXlsx
            rotulo="Extrair relatório"
          />
        }
      />

      <div className="flex flex-wrap items-end gap-3 border-b border-borda px-5 py-4">
        <CampoSelect
          rotulo="Resultado"
          className="w-52"
          value={filtroResultado}
          onChange={(evento) => definirFiltroResultado(evento.target.value)}
          opcoes={[{ valor: "", rotulo: "Todos os resultados" }, ...RESULTADOS]}
        />
        <CampoSelect
          rotulo="Canal"
          className="w-40"
          value={filtroCanal}
          onChange={(evento) => definirFiltroCanal(evento.target.value)}
          opcoes={[{ valor: "", rotulo: "Todos os canais" }, ...CANAIS]}
        />
        <form
          className="flex items-end gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            definirBuscaAplicada(busca);
          }}
        >
          <CampoTexto
            rotulo="Cliente, motivo ou oferta"
            className="w-64"
            value={busca}
            onChange={(evento) => definirBusca(evento.target.value)}
            placeholder="Ex: Maria ou reposição"
          />
          <button
            type="submit"
            className="h-10 rounded-botao border border-primario px-4 text-corpo text-primario hover:bg-primario/10 focus-visible:foco-arkos"
          >
            Buscar
          </button>
        </form>
        {filtroResultado || filtroCanal || buscaAplicada ? (
          <Botao
            variante="secundario"
            onClick={() => {
              definirFiltroResultado("");
              definirFiltroCanal("");
              definirBusca("");
              definirBuscaAplicada("");
            }}
          >
            Limpar filtros
          </Botao>
        ) : null}
      </div>
      {erroEdicao ? (
        <div className="px-5 pt-4">
          <Aviso tom="erro">{erroEdicao}</Aviso>
        </div>
      ) : null}
      {carregando ? <Carregando /> : null}
      {erro ? (
        <div className="px-5 py-4">
          <Aviso tom="erro">{erro.message}</Aviso>
        </div>
      ) : null}
      {dados ? (
        <Tabela
          colunas={[
            {
              chave: "criado_em",
              titulo: "Quando",
              renderizar: (contato) => formatarDataHora(contato.criado_em),
            },
            { chave: "cliente_nome", titulo: "Cliente" },
            { chave: "canal", titulo: "Canal" },
            { chave: "motivo", titulo: "Motivo" },
            { chave: "oferta", titulo: "Oferta", renderizar: (contato) => contato.oferta ?? "—" },
            {
              chave: "resultado",
              titulo: "Resultado",
              renderizar: (contato) => (
                <select
                  value={contato.resultado}
                  onChange={(evento) => alterar(contato, evento.target.value)}
                  aria-label={`Resultado do contato com ${contato.cliente_nome}`}
                  className="h-8 rounded-botao border border-borda bg-card px-2 text-rotulo text-texto focus-visible:foco-arkos"
                >
                  {RESULTADOS.map((resultado) => (
                    <option key={resultado.valor} value={resultado.valor}>
                      {resultado.rotulo}
                    </option>
                  ))}
                </select>
              ),
            },
          ]}
          linhas={dados.contatos}
          totais={
            dados.contatos.length
              ? {
                  __rotulo: `${dados.contatos.length} contato(s) — ${
                    dados.contatos.filter((contato) => contato.resultado === "convertido").length
                  } virou compra`,
                }
              : null
          }
          chave={(contato) => contato.id}
          vazio={
            <EstadoVazio
              icone={PhoneCall}
              titulo={
                consulta ? "Nenhum contato com esses filtros" : "Nenhum contato registrado"
              }
              descricao={
                consulta
                  ? "Limpe os filtros para ver todos os contatos registrados."
                  : "Ao ligar para um cliente da fila, registre aqui o que foi combinado."
              }
            />
          }
        />
      ) : null}
    </Card>
  );
}

/**
 * Relacionamento com clientes: a fila de quem ligar hoje, ordenada por urgência,
 * com o motivo e a oferta tirados do histórico de compra de cada um.
 */
export function Relacionamento() {
  const [situacao, definirSituacao] = useState("");
  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");
  const [fichaAberta, definirFichaAberta] = useState(null);
  const [aba, definirAba] = useState("fila");

  const [verSilenciados, definirVerSilenciados] = useState(false);

  const consulta = useMemo(() => {
    const query = new URLSearchParams();
    if (situacao) query.set("situacao", situacao);
    if (buscaAplicada.trim()) query.set("busca", buscaAplicada.trim());
    if (verSilenciados) query.set("incluir_silencio", "sim");
    const texto = query.toString();
    return texto ? `?${texto}` : "";
  }, [situacao, buscaAplicada, verSilenciados]);

  const fila = usarBusca(() => api.vendas.get(`/crm/clientes${consulta}`), [consulta]);
  const resumo = usarBusca(() => api.vendas.get("/crm/resumo"), []);
  const catalogo = usarBusca(() => api.estoque.get("/produtos"), []);

  const clientes = fila.dados?.clientes ?? [];
  const indicadores = resumo.dados;

  const paraLigarHoje = clientes.filter((cliente) =>
    ["recompra_atrasada", "inativo", "em_risco"].includes(cliente.situacao)
  ).length;

  function recarregarTudo() {
    fila.recarregar();
    resumo.recarregar();
  }

  return (
    <>
      <TituloPagina
        titulo="Relacionamento com clientes"
        descricao="Quem ligar hoje, por que ligar e o que oferecer — tirado do histórico de compra."
        acoes={
          <ExportarRelatorio
            servico="vendas"
            caminho={`/crm/relatorio${situacao ? `?situacao=${situacao}` : ""}`}
            titulo="Exportar fila de contato"
            descricao="Só quem aceita receber contato, com motivo e oferta sugerida."
            comPeriodo={false}
            comXlsx
            rotulo="Extrair relatório"
          />
        }
      />

      {indicadores ? (
        <div className="mb-4 grid grid-cols-4 gap-3">
          <CardIndicador
            compacto
            rotulo="Para ligar hoje"
            valor={formatarNumero(paraLigarHoje + (indicadores.retornos?.para_hoje ?? 0))}
            detalhe={
              indicadores.retornos?.para_hoje
                ? `${indicadores.retornos.para_hoje} retorno(s) combinado(s) e ${paraLigarHoje} da fila`
                : "recompra atrasada, em risco ou inativo"
            }
            icone={PhoneCall}
            tom={paraLigarHoje || indicadores.retornos?.para_hoje ? "erro" : "sucesso"}
          />
          <CardIndicador
            compacto
            rotulo="Recompra prevista"
            valor={formatarNumero(indicadores.recompra_prevista_7_dias)}
            detalhe="clientes voltam nos próximos 7 dias"
            icone={CalendarClock}
            tom="marca"
          />
          <CardIndicador
            compacto
            rotulo="Clientes em dia"
            valor={formatarNumero(indicadores.situacoes.ativo)}
            detalhe={`de ${formatarNumero(indicadores.com_compra)} com compra registrada`}
            icone={Repeat}
            tom="sucesso"
          />
          {/* Conversão medida no caixa: houve venda depois do contato. Antes
              este número era a soma do que alguém marcou numa lista suspensa. */}
          <CardIndicador
            compacto
            rotulo="Contatos que viraram compra"
            valor={`${String(indicadores.contatos.conversao_pct).replace(".", ",")}%`}
            detalhe={`${formatarNumero(
              indicadores.contatos.com_compra_depois
            )} de ${formatarNumero(indicadores.contatos.total)} — ${formatarMoeda(
              indicadores.contatos.valor_apos_contato
            )} em vendas`}
            icone={HeartHandshake}
            tom={indicadores.contatos.conversao_pct >= 20 ? "sucesso" : "marca"}
          />
        </div>
      ) : null}

      <div className="mb-4 flex gap-1">
        {[
          ["fila", "Fila de contato"],
          [
            "retornos",
            indicadores?.retornos?.para_hoje
              ? `Retornos (${indicadores.retornos.para_hoje})`
              : "Retornos",
          ],
          ["agenda", "Contatos registrados"],
        ].map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            onClick={() => definirAba(chave)}
            className={[
              "rounded-botao px-4 py-2 text-corpo transition-colors",
              aba === chave ? "bg-primario text-white" : "text-secundario hover:bg-borda/60",
            ].join(" ")}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "retornos" ? (
        <Retornos aoAbrirFicha={definirFichaAberta} />
      ) : aba === "agenda" ? (
        <AgendaContatos aoAtualizar={recarregarTudo} />
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-borda px-5 py-4">
            <CampoSelect
              rotulo="Situação"
              className="w-56"
              value={situacao}
              onChange={(evento) => definirSituacao(evento.target.value)}
              opcoes={[
                { valor: "", rotulo: "Todos os clientes" },
                { valor: "recompra_atrasada", rotulo: "Recompra atrasada" },
                { valor: "em_risco", rotulo: "Em risco" },
                { valor: "inativo", rotulo: "Inativo" },
                { valor: "ativo", rotulo: "Em dia" },
                { valor: "novo", rotulo: "Novo" },
              ]}
            />
            <form
              className="flex items-end gap-2"
              onSubmit={(evento) => {
                evento.preventDefault();
                definirBuscaAplicada(busca);
              }}
            >
              <CampoTexto
                rotulo="Nome, CPF ou convênio"
                className="w-72"
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

            {/* Lista que encolhe sem explicação assusta: quando alguém sai da
                fila por contato recente, a tela diz quantos e deixa ver quem. */}
            {fila.dados?.em_silencio ? (
              <div className="flex items-center gap-2 pb-2">
                <p className="text-rotulo text-secundario">
                  {fila.dados.em_silencio} cliente(s) fora da fila por contato recente.
                </p>
                <Botao
                  tamanho="pequeno"
                  variante="secundario"
                  icone={Eye}
                  onClick={() => definirVerSilenciados((atual) => !atual)}
                >
                  {verSilenciados ? "Ocultar" : "Ver mesmo assim"}
                </Botao>
              </div>
            ) : null}

            {fila.dados?.sem_contato ? (
              <p className="pb-2 text-rotulo text-secundario">
                {fila.dados.sem_contato} cliente(s) pediram para não receber oferta e ficam fora da
                lista.
              </p>
            ) : null}
          </div>

          {fila.carregando ? <Carregando texto="Analisando recompra" /> : null}
          {fila.erro ? (
            <div className="px-5 py-4">
              <Aviso tom="erro">{fila.erro.message}</Aviso>
            </div>
          ) : null}

          {fila.dados ? (
            <Tabela
              colunas={[
                {
                  chave: "situacao",
                  titulo: "Situação",
                  renderizar: (cliente) => (
                    <div>
                      <Badge tom={SITUACAO[cliente.situacao]?.tom}>
                        {SITUACAO[cliente.situacao]?.rotulo ?? cliente.situacao}
                      </Badge>
                      {cliente.em_silencio ? (
                        <p className="mt-0.5 text-rotulo text-secundario">
                          {cliente.silencio_motivo}
                        </p>
                      ) : null}
                    </div>
                  ),
                },
                { chave: "nome", titulo: "Cliente" },
                {
                  chave: "motivo",
                  titulo: "Por que ligar",
                  renderizar: (cliente) => (
                    <div>
                      <p className="text-texto">{cliente.motivo}</p>
                      <p className="text-rotulo text-secundario">{cliente.oferta}</p>
                    </div>
                  ),
                },
                {
                  chave: "regua_dias",
                  titulo: "Ritmo",
                  alinhamento: "direita",
                  // De onde veio a previsão muda o que se diz ao cliente, então
                  // a tela mostra a origem em vez de só o número.
                  renderizar: (cliente) =>
                    cliente.regua_dias ? (
                      <div>
                        <p className="text-texto">{cliente.regua_dias} dias</p>
                        <p className="text-rotulo text-secundario">
                          {cliente.origem_regua === "produto" ? "pela caixa" : "pelo histórico"}
                        </p>
                      </div>
                    ) : (
                      "—"
                    ),
                },
                {
                  chave: "dias_sem_comprar",
                  titulo: "Parado há",
                  alinhamento: "direita",
                  renderizar: (cliente) =>
                    cliente.dias_sem_comprar === null
                      ? "—"
                      : `${formatarNumero(cliente.dias_sem_comprar)} dias`,
                },
                {
                  chave: "valor_total",
                  titulo: "Já gastou",
                  alinhamento: "direita",
                  renderizar: (cliente) => formatarMoeda(cliente.valor_total),
                },
                {
                  chave: "acoes",
                  titulo: "",
                  renderizar: (cliente) => (
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      icone={PhoneCall}
                      onClick={(evento) => {
                        // A linha inteira também abre a ficha: sem isto o clique
                        // no botão dispararia as duas coisas.
                        evento.stopPropagation();
                        definirFichaAberta(cliente.id);
                      }}
                    >
                      Abrir ficha
                    </Botao>
                  ),
                },
              ]}
              linhas={clientes}
              totais={
                clientes.length
                  ? {
                      __rotulo: `${clientes.length} cliente(s) na lista`,
                      valor_total: formatarMoeda(
                        clientes.reduce((soma, cliente) => soma + cliente.valor_total, 0)
                      ),
                    }
                  : null
              }
              chave={(cliente) => cliente.id}
              aoClicarLinha={(cliente) => definirFichaAberta(cliente.id)}
              vazio={
                <EstadoVazio
                  icone={UserRoundX}
                  titulo="Nenhum cliente nesta situação"
                  descricao="Troque o filtro ou cadastre clientes nas vendas para o histórico crescer."
                />
              }
            />
          ) : null}
        </Card>
      )}

      {fichaAberta ? (
        <FichaCliente
          clienteId={fichaAberta}
          catalogo={catalogo.dados?.produtos}
          aoFechar={() => definirFichaAberta(null)}
          aoRegistrar={recarregarTudo}
        />
      ) : null}
    </>
  );
}
