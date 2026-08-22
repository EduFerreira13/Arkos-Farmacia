import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, hojeISO } from "../lib/formato.js";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
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

function estaAtrasada(conta) {
  return conta.status === "pendente" && conta.vencimento < hojeISO();
}

function badgeStatus(conta) {
  if (estaAtrasada(conta)) return <Badge tom="erro">Atrasada</Badge>;
  if (conta.status === "pendente") return <Badge tom="alerta">Pendente</Badge>;
  return <Badge tom="sucesso">{conta.status === "pago" ? "Paga" : "Recebida"}</Badge>;
}

function FormularioConta({ tipo, aoFechar, aoSalvar }) {
  const pagar = tipo === "pagar";
  const [campos, definirCampos] = useState({
    descricao: "",
    valor: "",
    vencimento: hojeISO(),
    origem: "convenio",
  });
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  async function submeter(evento) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);
    try {
      const corpo = {
        descricao: campos.descricao,
        valor: Number(campos.valor),
        vencimento: campos.vencimento,
      };
      if (pagar) await api.financeiro.post("/contas-pagar", corpo);
      else await api.financeiro.post("/contas-receber", { ...corpo, origem: campos.origem });
      aoSalvar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo={pagar ? "Nova conta a pagar" : "Nova conta a receber"}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="formulario-conta" disabled={enviando}>
            {enviando ? "Salvando" : "Salvar"}
          </Botao>
        </>
      }
    >
      <form id="formulario-conta" onSubmit={submeter} className="space-y-4">
        <CampoTexto
          rotulo="Descrição"
          required
          value={campos.descricao}
          onChange={(evento) => definirCampos({ ...campos, descricao: evento.target.value })}
        />
        {!pagar ? (
          <CampoSelect
            rotulo="Origem"
            value={campos.origem}
            onChange={(evento) => definirCampos({ ...campos, origem: evento.target.value })}
            opcoes={[
              { valor: "convenio", rotulo: "Convênio" },
              { valor: "venda_a_prazo", rotulo: "Venda a prazo" },
            ]}
          />
        ) : null}
        <CampoTexto
          rotulo="Valor"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={campos.valor}
          onChange={(evento) => definirCampos({ ...campos, valor: evento.target.value })}
        />
        <CampoTexto
          rotulo="Vencimento"
          type="date"
          required
          value={campos.vencimento}
          onChange={(evento) => definirCampos({ ...campos, vencimento: evento.target.value })}
        />
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      </form>
    </Modal>
  );
}

function ListaContas({ tipo, titulo, descricao, podeLancar }) {
  const pagar = tipo === "pagar";
  const rota = pagar ? "/contas-pagar" : "/contas-receber";
  const [formularioAberto, definirFormularioAberto] = useState(false);
  const [erro, definirErro] = useState(null);

  const { dados, carregando, erro: erroBusca, recarregar } = usarBusca(
    () => api.financeiro.get(rota),
    [rota]
  );

  const contas = dados?.contas ?? [];
  const quitado = pagar ? "pago" : "recebido";
  const somar = (filtro) =>
    contas.filter(filtro).reduce((soma, conta) => soma + Number(conta.valor), 0);

  const totais = contas.length
    ? {
        __rotulo: `${contas.length} conta(s)`,
        status: `${formatarMoeda(somar((conta) => conta.status !== quitado))} em aberto`,
        valor: formatarMoeda(somar(() => true)),
      }
    : null;

  async function quitar(conta) {
    definirErro(null);
    try {
      await api.financeiro.patch(`${rota}/${conta.id}/${pagar ? "pagar" : "receber"}`, {});
      recarregar();
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  return (
    <Card>
      <CardCabecalho
        titulo={titulo}
        descricao={descricao}
        icone={FileText}
        acoes={
          <>
            <ExportarRelatorio
              servico="financeiro"
              caminho={`/relatorios/contas?tipo=${tipo}`}
              titulo={`Exportar contas a ${tipo}`}
              descricao="Contas com vencimento no período escolhido."
            />
            {podeLancar ? (
              <Botao tamanho="pequeno" icone={Plus} onClick={() => definirFormularioAberto(true)}>
                Nova conta
              </Botao>
            ) : null}
          </>
        }
      />
      {erro ? (
        <div className="px-5 pt-4">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      ) : null}
      {carregando ? <Carregando /> : null}
      {erroBusca ? (
        <div className="px-5 py-4">
          <Aviso tom="erro">{erroBusca.message}</Aviso>
        </div>
      ) : null}
      {dados ? (
        <Tabela
          colunas={[
            { chave: "descricao", titulo: "Descrição" },
            {
              chave: "vencimento",
              titulo: "Vencimento",
              renderizar: (conta) => formatarData(conta.vencimento),
            },
            { chave: "status", titulo: "Status", renderizar: badgeStatus },
            {
              chave: "valor",
              titulo: "Valor",
              alinhamento: "direita",
              renderizar: (conta) => formatarMoeda(conta.valor),
            },
            {
              chave: "acoes",
              titulo: "",
              renderizar: (conta) =>
                podeLancar && conta.status === "pendente" ? (
                  <Botao tamanho="pequeno" variante="secundario" onClick={() => quitar(conta)}>
                    {pagar ? "Marcar paga" : "Marcar recebida"}
                  </Botao>
                ) : null,
            },
          ]}
          linhas={dados.contas}
          totais={totais}
          chave={(conta) => conta.id}
          vazio={
            <EstadoVazio
              icone={FileText}
              titulo="Nenhuma conta lançada"
              descricao={
                pagar
                  ? "Contas de fornecedores e compras aparecem aqui."
                  : "Convênios e vendas a prazo aparecem aqui."
              }
            />
          }
        />
      ) : null}

      {formularioAberto ? (
        <FormularioConta
          tipo={tipo}
          aoFechar={() => definirFormularioAberto(false)}
          aoSalvar={() => {
            definirFormularioAberto(false);
            recarregar();
          }}
        />
      ) : null}
    </Card>
  );
}

/** Contas a pagar e a receber (§5). */
export function Contas() {
  const { usuario } = usarAutenticacao();
  const podeLancar = temPermissao(usuario, "ver_financeiro");

  return (
    <>
      <TituloPagina
        titulo="Contas"
        descricao="A pagar por fornecedores e compras; a receber por convênios e vendas a prazo."
      />

      <div className="space-y-6">
        <ListaContas
          tipo="pagar"
          titulo="Contas a pagar"
          descricao="Vencidas em vermelho."
          podeLancar={podeLancar}
        />
        <ListaContas
          tipo="receber"
          titulo="Contas a receber"
          descricao="Convênio e venda a prazo."
          podeLancar={podeLancar}
        />
      </div>
    </>
  );
}
