import { useState } from "react";
import { Ban, Receipt } from "lucide-react";
import { FORMA_PAGAMENTO_LABEL, STATUS_VENDA } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { CampoTextoLongo } from "../componentes/Campos.jsx";
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

const TOM_STATUS = {
  [STATUS_VENDA.ABERTA]: "alerta",
  [STATUS_VENDA.FINALIZADA]: "sucesso",
  [STATUS_VENDA.CANCELADA]: "erro",
};

function ModalCancelamento({ venda, aoFechar, aoCancelar }) {
  const [motivo, definirMotivo] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  async function confirmar() {
    definirErro(null);
    definirEnviando(true);
    try {
      await api.vendas.post(`/${venda.id}/cancelar`, { motivo });
      aoCancelar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo="Cancelar venda"
      descricao={`Venda ${venda.id.slice(0, 8)} — ${formatarMoeda(venda.valor_total)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="destrutivo" onClick={confirmar} disabled={enviando || !motivo.trim()}>
            {enviando ? "Cancelando" : "Confirmar cancelamento"}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <CampoTextoLongo
          rotulo="Motivo do cancelamento"
          required
          value={motivo}
          onChange={(evento) => definirMotivo(evento.target.value)}
          ajuda="O motivo fica registrado com o seu usuário."
        />
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      </div>
    </Modal>
  );
}

/** Vendas do dia com status, formas de pagamento e cancelamento autorizado. */
export function Vendas() {
  const { usuario } = usarAutenticacao();
  const podeCancelar = temPermissao(usuario, "cancelar_venda");
  const [vendaParaCancelar, definirVendaParaCancelar] = useState(null);

  const { dados, carregando, erro, recarregar } = usarBusca(() => api.vendas.get(""), []);

  return (
    <>
      <TituloPagina
        titulo="Vendas do dia"
        descricao="Cupons abertos, finalizados e cancelados de hoje."
      />

      <Card>
        <CardCabecalho titulo="Movimento de hoje" icone={Receipt} />
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
                chave: "id",
                titulo: "Venda",
                renderizar: (venda) => venda.id.slice(0, 8),
              },
              {
                chave: "criado_em",
                titulo: "Quando",
                renderizar: (venda) => formatarDataHora(venda.criado_em),
              },
              {
                chave: "total_itens",
                titulo: "Itens",
                alinhamento: "direita",
                renderizar: (venda) => formatarNumero(venda.total_itens),
              },
              {
                chave: "formas_pagamento",
                titulo: "Pagamento",
                renderizar: (venda) =>
                  venda.formas_pagamento
                    ? venda.formas_pagamento
                        .split(", ")
                        .map((forma) => FORMA_PAGAMENTO_LABEL[forma] ?? forma)
                        .join(" + ")
                    : "—",
              },
              {
                chave: "status",
                titulo: "Status",
                renderizar: (venda) => (
                  <Badge tom={TOM_STATUS[venda.status]}>{venda.status}</Badge>
                ),
              },
              {
                chave: "valor_total",
                titulo: "Total",
                alinhamento: "direita",
                renderizar: (venda) => formatarMoeda(venda.valor_total),
              },
              {
                chave: "acoes",
                titulo: "",
                renderizar: (venda) =>
                  podeCancelar && venda.status === STATUS_VENDA.ABERTA ? (
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      icone={Ban}
                      onClick={() => definirVendaParaCancelar(venda)}
                    >
                      Cancelar
                    </Botao>
                  ) : null,
              },
            ]}
            linhas={dados.vendas}
            chave={(venda) => venda.id}
            vazio={
              <EstadoVazio
                icone={Receipt}
                titulo="Nenhuma venda hoje"
                descricao="As vendas registradas no ponto de venda aparecem aqui."
              />
            }
          />
        ) : null}
      </Card>

      {vendaParaCancelar ? (
        <ModalCancelamento
          venda={vendaParaCancelar}
          aoFechar={() => definirVendaParaCancelar(null)}
          aoCancelar={() => {
            definirVendaParaCancelar(null);
            recarregar();
          }}
        />
      ) : null}
    </>
  );
}
