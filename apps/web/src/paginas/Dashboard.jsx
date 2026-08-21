import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Megaphone,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarMoeda, formatarNumero } from "../lib/formato.js";
import { usarAutenticacao } from "../lib/autenticacao.jsx";
import { CardIndicador } from "../componentes/CardIndicador.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  EstadoVazio,
} from "../componentes/Superficies.jsx";

/** Comunicados internos do sistema — conteúdo fixo no MVP. */
const COMUNICADOS = [
  {
    id: "controlados",
    titulo: "Venda de controlado exige receita registrada",
    texto:
      "O PDV não conclui venda com item de tarja vermelha ou preta sem número de receita, CRM e nome do paciente. O bloqueio é do sistema, não depende de conferência manual.",
  },
  {
    id: "fefo",
    titulo: "Saída de estoque agora é FEFO",
    texto:
      "A baixa sempre consome primeiro o lote que vence antes, atravessando lotes quando a quantidade exige. Lote vencido fica fora da conta de disponível.",
  },
  {
    id: "caixa",
    titulo: "Fechamento de caixa com conferência",
    texto:
      "Ao fechar o turno o sistema calcula o valor esperado (abertura mais entradas menos saídas) e registra a divergência contra o valor contado na gaveta.",
  },
];

export function Dashboard() {
  const { usuario } = usarAutenticacao();

  const vendas = usarBusca(() => api.vendas.get("/resumo/hoje"), []);
  const vencimento = usarBusca(() => api.estoque.get("/alertas/vencimento?dias=30"), []);
  const estoqueBaixo = usarBusca(() => api.estoque.get("/alertas/estoque-baixo"), []);

  const carregando = vendas.carregando || vencimento.carregando || estoqueBaixo.carregando;
  const falha = vendas.erro || vencimento.erro || estoqueBaixo.erro;

  const resumo = vendas.dados;
  const lotesAVencer = vencimento.dados?.lotes ?? [];
  const produtosBaixos = estoqueBaixo.dados?.produtos ?? [];

  return (
    <>
      {/* Boas-vindas com o gradiente da marca (REGRAS-VISUAIS §2) */}
      <section className="mb-6 rounded-card bg-marca px-6 py-5 text-white">
        <p className="text-rotulo uppercase tracking-wide text-white/75">Arkos</p>
        <h1 className="mt-1 text-h1">Bom trabalho, {usuario?.nome?.split(" ")[0]}</h1>
        <p className="mt-1 text-corpo-espacoso text-white/85">
          Indicadores do dia com dados direto do banco — vendas, validade, estoque e ticket médio.
        </p>
      </section>

      {falha ? (
        <Aviso tom="erro" className="mb-6">
          {falha.message}
        </Aviso>
      ) : null}

      {carregando ? (
        <Carregando texto="Carregando indicadores" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <CardIndicador
              rotulo="Vendas do dia"
              valor={formatarMoeda(resumo?.valor_total_dia)}
              detalhe={`${formatarNumero(resumo?.total_vendas ?? 0)} cupons finalizados`}
              icone={ShoppingCart}
              variacao={resumo?.variacao_pct?.valor_total_dia ?? null}
            />
            <CardIndicador
              rotulo="Produtos a vencer"
              valor={formatarNumero(lotesAVencer.length)}
              detalhe="lotes vencendo em até 30 dias"
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
              detalhe="por cupom finalizado hoje"
              icone={Receipt}
              variacao={resumo?.variacao_pct?.ticket_medio ?? null}
            />
          </div>

          <div className="mt-6 grid grid-cols-[1.4fr_1fr] gap-6">
            <Card>
              <CardCabecalho
                titulo="Comunicados e atualizações"
                descricao="Novidades e avisos internos do sistema."
                icone={Megaphone}
              />
              <CardCorpo className="space-y-3">
                {COMUNICADOS.map((comunicado) => (
                  <article
                    key={comunicado.id}
                    className="rounded-card bg-fundo px-4 py-3"
                  >
                    <h3 className="text-h3 text-texto">{comunicado.titulo}</h3>
                    <p className="mt-1 text-corpo text-secundario">{comunicado.texto}</p>
                  </article>
                ))}
              </CardCorpo>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardCabecalho
                  titulo="Vendas por forma de pagamento"
                  descricao="Base do fluxo de caixa do dia."
                  icone={Wallet}
                />
                {resumo?.por_forma_pagamento?.length ? (
                  <CardCorpo>
                    <dl className="space-y-2 text-corpo">
                      {resumo.por_forma_pagamento.map((linha) => (
                        <div key={linha.forma_pagamento} className="flex justify-between">
                          <dt className="text-secundario">{linha.forma_pagamento}</dt>
                          <dd className="text-texto">{formatarMoeda(linha.valor)}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardCorpo>
                ) : (
                  <EstadoVazio
                    icone={Wallet}
                    titulo="Nenhuma venda finalizada hoje"
                    descricao="Os valores aparecem aqui conforme o PDV registra as vendas."
                  />
                )}
              </Card>

              <Card>
                <CardCabecalho
                  titulo="Precisa de atenção"
                  descricao="Lotes mais próximos do vencimento."
                  icone={CalendarClock}
                  acoes={
                    <Link
                      to="/alertas"
                      className="rounded-botao px-2 py-1 text-rotulo text-primario hover:bg-borda/60"
                    >
                      Ver alertas
                    </Link>
                  }
                />
                <Tabela
                  colunas={[
                    { chave: "nome", titulo: "Produto" },
                    {
                      chave: "dias_para_vencer",
                      titulo: "Vence em",
                      alinhamento: "direita",
                      renderizar: (linha) => `${formatarNumero(linha.dias_para_vencer)} dias`,
                    },
                  ]}
                  linhas={lotesAVencer.slice(0, 5)}
                  chave={(linha) => linha.lote_id}
                  vazio={
                    <EstadoVazio
                      icone={CalendarClock}
                      titulo="Nada vencendo em 30 dias"
                      descricao="O estoque está com validade folgada."
                    />
                  }
                />
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
