import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet } from "lucide-react";
import { FORMA_PAGAMENTO_LABEL } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarMoeda } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
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
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

function ModalFechamento({ caixa, esperado, aoFechar, aoConcluir }) {
  const [contado, definirContado] = useState("");
  const [erro, definirErro] = useState(null);
  const [resultado, definirResultado] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  async function confirmar() {
    definirErro(null);
    definirEnviando(true);
    try {
      const resposta = await api.financeiro.post(`/caixa/${caixa.id}/fechar`, {
        valor_fechamento_contado: Number(contado),
      });
      definirResultado(resposta);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  const divergencia = resultado?.divergencia ?? null;

  return (
    <Modal
      aberto
      titulo="Fechamento de caixa"
      descricao="Conferência do valor esperado contra o valor contado."
      aoFechar={resultado ? aoConcluir : aoFechar}
      rodape={
        resultado ? (
          <Botao onClick={aoConcluir}>Concluir</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Voltar
            </Botao>
            <Botao onClick={confirmar} disabled={enviando || contado === ""}>
              {enviando ? "Fechando" : "Fechar caixa"}
            </Botao>
          </>
        )
      }
    >
      {resultado ? (
        <div className="space-y-3">
          <Aviso tom={divergencia === 0 ? "sucesso" : "alerta"}>
            {divergencia === 0
              ? "Caixa fechado sem divergência."
              : `Caixa fechado com divergência de ${formatarMoeda(divergencia)}.`}
          </Aviso>
          <dl className="space-y-1 text-corpo">
            <div className="flex justify-between">
              <dt className="text-secundario">Esperado</dt>
              <dd>{formatarMoeda(resultado.caixa.valor_fechamento_esperado)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secundario">Contado</dt>
              <dd>{formatarMoeda(resultado.caixa.valor_fechamento_contado)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secundario">Entradas / Saídas</dt>
              <dd>
                {formatarMoeda(resultado.entradas)} / {formatarMoeda(resultado.saidas)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-card bg-borda/40 px-4 py-3">
            <p className="text-rotulo text-secundario">Valor esperado no caixa</p>
            <p className="text-h2 text-texto">{formatarMoeda(esperado)}</p>
          </div>
          <CampoTexto
            rotulo="Valor contado na gaveta"
            type="number"
            step="0.01"
            min="0"
            required
            value={contado}
            onChange={(evento) => definirContado(evento.target.value)}
          />
          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </div>
      )}
    </Modal>
  );
}

/** Abertura, movimento e fechamento do caixa do turno (§5). */
export function Caixa() {
  const [valorAbertura, definirValorAbertura] = useState("");
  const [erro, definirErro] = useState(null);
  const [ocupado, definirOcupado] = useState(false);
  const [fechando, definirFechando] = useState(false);

  const [tipoLancamento, definirTipoLancamento] = useState("saida");
  const [valorLancamento, definirValorLancamento] = useState("");
  const [descricaoLancamento, definirDescricaoLancamento] = useState("");

  const status = usarBusca(() => api.financeiro.get("/caixa/status"), []);
  const fluxo = usarBusca(() => api.financeiro.get("/fluxo-caixa/hoje"), []);

  const caixa = status.dados?.caixa ?? null;
  const totais = status.dados?.totais ?? null;

  async function executar(acao) {
    definirErro(null);
    definirOcupado(true);
    try {
      await acao();
      status.recarregar();
      fluxo.recarregar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirOcupado(false);
    }
  }

  const abrir = (evento) => {
    evento.preventDefault();
    return executar(() =>
      api.financeiro.post("/caixa/abrir", { valor_abertura: Number(valorAbertura || 0) })
    );
  };

  const lancar = (evento) => {
    evento.preventDefault();
    return executar(async () => {
      await api.financeiro.post("/caixa/movimentacoes", {
        tipo: tipoLancamento,
        valor: Number(valorLancamento),
        origem: "lancamento_manual",
        descricao: descricaoLancamento,
      });
      definirValorLancamento("");
      definirDescricaoLancamento("");
    });
  };

  return (
    <>
      <TituloPagina
        titulo="Caixa"
        descricao="Abertura, lançamentos do turno e fechamento com conferência."
        acoes={
          caixa ? (
            <Botao icone={Lock} onClick={() => definirFechando(true)}>
              Fechar caixa
            </Botao>
          ) : null
        }
      />

      {status.carregando ? <Carregando texto="Consultando caixa" /> : null}

      {status.dados && !caixa ? (
        <Card className="max-w-md">
          <CardCabecalho titulo="Abrir caixa" icone={Unlock} />
          <CardCorpo>
            <form onSubmit={abrir} className="space-y-4">
              <CampoTexto
                rotulo="Valor de abertura (fundo de troco)"
                type="number"
                step="0.01"
                min="0"
                required
                value={valorAbertura}
                onChange={(evento) => definirValorAbertura(evento.target.value)}
              />
              {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
              <Botao type="submit" className="w-full" disabled={ocupado}>
                Abrir caixa do turno
              </Botao>
            </form>
          </CardCorpo>
        </Card>
      ) : null}

      {caixa ? (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              ["Abertura", formatarMoeda(caixa.valor_abertura), Wallet],
              ["Entradas", formatarMoeda(totais?.entradas), ArrowUpCircle],
              ["Saídas", formatarMoeda(totais?.saidas), ArrowDownCircle],
              ["Esperado agora", formatarMoeda(totais?.valor_esperado), Wallet],
            ].map(([rotulo, valor, Icone]) => (
              <Card key={rotulo}>
                <CardCorpo>
                  <div className="flex items-start justify-between">
                    <p className="text-rotulo text-secundario">{rotulo}</p>
                    <Icone size={18} className="text-primario" aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-h2 text-texto">{valor}</p>
                </CardCorpo>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_380px] gap-6">
            <Card>
              <CardCabecalho
                titulo="Movimento do caixa"
                descricao={`Aberto em ${formatarDataHora(caixa.aberto_em)}`}
              />
              <Tabela
                colunas={[
                  {
                    chave: "criado_em",
                    titulo: "Quando",
                    renderizar: (m) => formatarDataHora(m.criado_em),
                  },
                  {
                    chave: "origem",
                    titulo: "Origem",
                    renderizar: (m) => (
                      <Badge tom={m.origem === "venda" ? "sucesso" : "neutro"}>
                        {m.origem === "venda" ? "Venda" : "Manual"}
                      </Badge>
                    ),
                  },
                  { chave: "descricao", titulo: "Descrição", renderizar: (m) => m.descricao || "—" },
                  {
                    chave: "valor",
                    titulo: "Valor",
                    alinhamento: "direita",
                    renderizar: (m) => (
                      <span className={m.tipo === "entrada" ? "text-sucesso" : "text-erro"}>
                        {m.tipo === "entrada" ? "+" : "-"} {formatarMoeda(m.valor)}
                      </span>
                    ),
                  },
                ]}
                linhas={status.dados.movimentacoes}
                chave={(m) => m.id}
                vazio={
                  <EstadoVazio
                    icone={Wallet}
                    titulo="Nenhum lançamento ainda"
                    descricao="As vendas finalizadas entram aqui automaticamente."
                  />
                }
              />
            </Card>

            <div className="space-y-6">
              <Card>
                <CardCabecalho titulo="Lançamento manual" descricao="Sangria, suprimento, despesa." />
                <CardCorpo>
                  <form onSubmit={lancar} className="space-y-3">
                    <CampoSelect
                      rotulo="Tipo"
                      value={tipoLancamento}
                      onChange={(evento) => definirTipoLancamento(evento.target.value)}
                      opcoes={[
                        { valor: "saida", rotulo: "Saída" },
                        { valor: "entrada", rotulo: "Entrada" },
                      ]}
                    />
                    <CampoTexto
                      rotulo="Valor"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={valorLancamento}
                      onChange={(evento) => definirValorLancamento(evento.target.value)}
                    />
                    <CampoTexto
                      rotulo="Descrição"
                      required
                      value={descricaoLancamento}
                      onChange={(evento) => definirDescricaoLancamento(evento.target.value)}
                      placeholder="Ex: sangria para o cofre"
                    />
                    {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
                    <Botao type="submit" variante="secundario" className="w-full" disabled={ocupado}>
                      Lançar
                    </Botao>
                  </form>
                </CardCorpo>
              </Card>

              {fluxo.dados?.vendas ? (
                <Card>
                  <CardCabecalho
                    titulo="Vendas de hoje"
                    descricao="Soma automática do PDV por forma de pagamento."
                  />
                  <CardCorpo>
                    <dl className="space-y-2 text-corpo">
                      <div className="flex justify-between">
                        <dt className="text-secundario">Cupons finalizados</dt>
                        <dd>{fluxo.dados.vendas.total_vendas}</dd>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <dt>Total do dia</dt>
                        <dd>{formatarMoeda(fluxo.dados.vendas.valor_total_dia)}</dd>
                      </div>
                      {fluxo.dados.vendas.por_forma_pagamento.map((linha) => (
                        <div key={linha.forma_pagamento} className="flex justify-between">
                          <dt className="text-secundario">
                            {FORMA_PAGAMENTO_LABEL[linha.forma_pagamento] ?? linha.forma_pagamento}
                          </dt>
                          <dd>{formatarMoeda(linha.valor)}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardCorpo>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {fechando && caixa ? (
        <ModalFechamento
          caixa={caixa}
          esperado={totais?.valor_esperado ?? 0}
          aoFechar={() => definirFechando(false)}
          aoConcluir={() => {
            definirFechando(false);
            status.recarregar();
            fluxo.recarregar();
          }}
        />
      ) : null}
    </>
  );
}
