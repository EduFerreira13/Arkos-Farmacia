import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Megaphone, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { FORMA_PAGAMENTO_LABEL } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarMoeda, formatarNumero } from "../lib/formato.js";
import { usarAutenticacao } from "../lib/autenticacao.jsx";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { Aviso, Card, CardCabecalho, CardCorpo, Carregando } from "../componentes/Superficies.jsx";

/** Comunicados internos do sistema — conteúdo fixo no MVP. */
const COMUNICADOS = [
  {
    id: "controlados",
    titulo: "Controlado só sai com receita registrada",
    texto:
      "Tarja vermelha ou preta exige receita com nome do médico, registro no Conselho Regional de Medicina e paciente. O ponto de venda não finaliza sem isso.",
  },
  {
    id: "fefo",
    titulo: "Baixa de estoque por FEFO",
    texto:
      "FEFO significa primeiro a vencer, primeiro a sair: a venda consome sempre o lote de validade mais curta, e lote vencido fica fora do saldo disponível.",
  },
];

const dataDeHoje = new Date().toLocaleDateString("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

export function Dashboard() {
  const { usuario } = usarAutenticacao();

  const vendas = usarBusca(() => api.vendas.get("/resumo/hoje"), []);
  const relacionamento = usarBusca(() => api.vendas.get("/crm/resumo"), []);
  const vencimento = usarBusca(() => api.estoque.get("/alertas/vencimento?dias=30"), []);
  const estoqueBaixo = usarBusca(() => api.estoque.get("/alertas/estoque-baixo"), []);

  const carregando = vendas.carregando || vencimento.carregando || estoqueBaixo.carregando;
  const falha = vendas.erro || vencimento.erro || estoqueBaixo.erro;

  const resumo = vendas.dados;
  const lotesAVencer = vencimento.dados?.lotes ?? [];
  const produtosBaixos = estoqueBaixo.dados?.produtos ?? [];

  return (
    <>
      {/* Faixa de boas-vindas com o gradiente da marca (REGRAS-VISUAIS §2) */}
      <section className="mb-4 flex items-center justify-between gap-6 rounded-card bg-marca px-6 py-4 text-white">
        <div>
          <h1 className="text-h2">Bom trabalho, {usuario?.nome?.split(" ")[0]}</h1>
          <p className="mt-0.5 text-rotulo text-white/80">
            Indicadores do dia com dados reais do banco
          </p>
        </div>
        <p className="text-rotulo capitalize text-white/80">{dataDeHoje}</p>
      </section>

      {falha ? (
        <Aviso tom="erro" className="mb-4">
          {falha.message}
        </Aviso>
      ) : null}

      {carregando ? (
        <Carregando texto="Carregando indicadores" />
      ) : (
        <>
          <div data-tour="indicadores" className="grid grid-cols-4 gap-4">
            <CardIndicador
              rotulo="Vendas do dia"
              valor={formatarMoeda(resumo?.valor_total_dia)}
              detalhe={`${formatarNumero(resumo?.total_vendas ?? 0)} cupons na loja`}
              icone={ShoppingCart}
              variacao={resumo?.variacao_pct?.valor_total_dia ?? null}
            />
            <CardIndicador
              rotulo="Produtos a vencer"
              valor={formatarNumero(lotesAVencer.length)}
              detalhe="lotes em até 30 dias"
              icone={CalendarClock}
              tom={lotesAVencer.length ? "alerta" : "sucesso"}
            />
            <CardIndicador
              rotulo="Estoque baixo"
              valor={formatarNumero(produtosBaixos.length)}
              detalhe="produtos no mínimo ou abaixo"
              icone={AlertTriangle}
              tom={produtosBaixos.length ? "erro" : "sucesso"}
            />
            <CardIndicador
              rotulo="Ticket médio"
              valor={formatarMoeda(resumo?.ticket_medio)}
              detalhe="por cupom de hoje"
              icone={Receipt}
              variacao={resumo?.variacao_pct?.ticket_medio ?? null}
            />
          </div>

          <div className="mt-4 grid grid-cols-[1.5fr_1fr] gap-4">
            <Card>
              <CardCabecalho titulo="Comunicados do sistema" icone={Megaphone} />
              <CardCorpo className="space-y-3">
                {COMUNICADOS.map((comunicado) => (
                  <article key={comunicado.id}>
                    <h3 className="text-corpo font-semibold text-texto">{comunicado.titulo}</h3>
                    <p className="mt-0.5 text-rotulo leading-5 text-secundario">
                      {comunicado.texto}
                    </p>
                  </article>
                ))}
              </CardCorpo>
            </Card>

            <Card>
              <CardCabecalho
                titulo="Recebido hoje"
                icone={Wallet}
                acoes={
                  <Link
                    to="/caixa"
                    className="rounded-botao px-2 py-1 text-rotulo text-primario hover:bg-borda/60"
                  >
                    Ver caixa
                  </Link>
                }
              />
              <CardCorpo>
                {/* Puxa a fila do relacionamento para o dia começar sabendo
                    quem precisa de uma ligação. */}
                {relacionamento.dados ? (
                  <Link
                    to="/relacionamento"
                    className="mb-3 flex items-center justify-between gap-2 rounded-botao bg-fundo px-3 py-2 text-corpo transition-colors hover:bg-borda/60"
                  >
                    <span className="text-secundario">Clientes para ligar hoje</span>
                    <span className="font-semibold text-texto">
                      {relacionamento.dados.situacoes.recompra_atrasada +
                        relacionamento.dados.situacoes.em_risco +
                        relacionamento.dados.situacoes.inativo}
                    </span>
                  </Link>
                ) : null}

                {resumo?.por_forma_pagamento?.length ? (
                  <dl className="space-y-1.5 text-corpo">
                    {resumo.por_forma_pagamento.map((linha) => (
                      <div key={linha.forma_pagamento} className="flex justify-between">
                        <dt className="text-secundario">
                          {FORMA_PAGAMENTO_LABEL[linha.forma_pagamento] ?? linha.forma_pagamento}
                        </dt>
                        <dd className="text-texto">{formatarMoeda(linha.valor)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-corpo text-secundario">
                    Nenhuma venda finalizada hoje ainda.
                  </p>
                )}
              </CardCorpo>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
