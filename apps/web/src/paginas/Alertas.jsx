import { AlertTriangle, PackageX } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarNumero } from "../lib/formato.js";
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

/**
 * Alertas de estoque (§2).
 *
 * O bloco de produtos a vencer saiu da tela temporariamente, a pedido da
 * operação. A regra continua valendo no serviço — lote vencido segue fora do
 * saldo disponível e bloqueado para venda —, e a rota
 * `GET /alertas/vencimento` continua no ar para quando o bloco voltar.
 */
export function Alertas() {
  const estoqueBaixo = usarBusca(() => api.estoque.get("/alertas/estoque-baixo"), []);

  return (
    <>
      <TituloPagina
        titulo="Alertas de estoque"
        descricao="Produtos abaixo do estoque mínimo."
      />

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
    </>
  );
}
