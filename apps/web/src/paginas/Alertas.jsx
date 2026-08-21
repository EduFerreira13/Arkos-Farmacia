import { useState } from "react";
import { AlertTriangle, CalendarClock, PackageX } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarNumero } from "../lib/formato.js";
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

const JANELAS = [30, 60, 90];

function tomPorDias(dias) {
  if (dias < 0) return "erro";
  if (dias <= 30) return "erro";
  if (dias <= 60) return "alerta";
  return "info";
}

/** Alertas de estoque baixo e validade (§2 — janelas de 90/60/30 dias). */
export function Alertas() {
  const [janela, definirJanela] = useState(90);

  const vencimento = usarBusca(
    () => api.estoque.get(`/alertas/vencimento?dias=${janela}`),
    [janela]
  );
  const estoqueBaixo = usarBusca(() => api.estoque.get("/alertas/estoque-baixo"), []);

  return (
    <>
      <TituloPagina
        titulo="Alertas de estoque"
        descricao="Validade próxima e produtos abaixo do estoque mínimo."
      />

      <div className="space-y-6">
        <Card>
          <CardCabecalho
            titulo="Produtos a vencer"
            descricao="Lote vencido fica bloqueado para venda automaticamente."
            icone={CalendarClock}
            acoes={
              <div className="flex items-center gap-1 rounded-botao border border-borda p-1">
                {JANELAS.map((dias) => (
                  <button
                    key={dias}
                    type="button"
                    onClick={() => definirJanela(dias)}
                    className={[
                      "rounded-botao px-3 py-1 text-rotulo transition-colors",
                      janela === dias
                        ? "bg-primario text-white"
                        : "text-secundario hover:bg-borda/60",
                    ].join(" ")}
                  >
                    {dias} dias
                  </button>
                ))}
              </div>
            }
          />
          {vencimento.carregando ? <Carregando /> : null}
          {vencimento.erro ? (
            <div className="px-5 py-4">
              <Aviso tom="erro">{vencimento.erro.message}</Aviso>
            </div>
          ) : null}
          {vencimento.dados ? (
            <Tabela
              colunas={[
                { chave: "nome", titulo: "Produto" },
                { chave: "numero_lote", titulo: "Lote" },
                {
                  chave: "data_validade",
                  titulo: "Validade",
                  renderizar: (linha) => formatarData(linha.data_validade),
                },
                {
                  chave: "dias_para_vencer",
                  titulo: "Prazo",
                  renderizar: (linha) => (
                    <Badge tom={tomPorDias(linha.dias_para_vencer)}>
                      {linha.dias_para_vencer < 0
                        ? "Vencido"
                        : `${formatarNumero(linha.dias_para_vencer)} dias`}
                    </Badge>
                  ),
                },
                {
                  chave: "quantidade",
                  titulo: "Quantidade",
                  alinhamento: "direita",
                  renderizar: (linha) => formatarNumero(linha.quantidade),
                },
              ]}
              linhas={vencimento.dados.lotes}
              chave={(linha) => linha.lote_id}
              vazio={
                <EstadoVazio
                  icone={CalendarClock}
                  titulo="Nada vencendo nesta janela"
                  descricao={`Nenhum lote vence nos próximos ${janela} dias.`}
                />
              }
            />
          ) : null}
        </Card>

        <Card>
          <CardCabecalho
            titulo="Estoque abaixo do mínimo"
            descricao="Base para o pedido de compra sugerido."
            icone={AlertTriangle}
          />
          {estoqueBaixo.carregando ? <Carregando /> : null}
          {estoqueBaixo.erro ? (
            <div className="px-5 py-4">
              <Aviso tom="erro">{estoqueBaixo.erro.message}</Aviso>
            </div>
          ) : null}
          {estoqueBaixo.dados ? (
            <Tabela
              colunas={[
                { chave: "nome", titulo: "Produto" },
                {
                  chave: "quantidade_atual",
                  titulo: "Disponível",
                  alinhamento: "direita",
                  renderizar: (linha) => (
                    <Badge tom={linha.quantidade_atual === 0 ? "erro" : "alerta"}>
                      {formatarNumero(linha.quantidade_atual)}
                    </Badge>
                  ),
                },
                {
                  chave: "estoque_minimo",
                  titulo: "Mínimo",
                  alinhamento: "direita",
                  renderizar: (linha) => formatarNumero(linha.estoque_minimo),
                },
              ]}
              linhas={estoqueBaixo.dados.produtos}
              chave={(linha) => linha.produto_id}
              vazio={
                <EstadoVazio
                  icone={PackageX}
                  titulo="Nenhum produto abaixo do mínimo"
                  descricao="O estoque está dentro dos parâmetros configurados."
                />
              }
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}
