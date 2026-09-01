import { useMemo, useState } from "react";
import { PackageMinus, Plus } from "lucide-react";
import { TIPO_MOVIMENTACAO } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarDataHora, formatarNumero, hojeISO } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
import { CampoBusca } from "../componentes/CampoBusca.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { BarraDePesquisa, LimparFiltros, LinhaDeFiltros } from "../componentes/Filtros.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import { diasAtras } from "../componentes/FiltroPeriodo.jsx";
import {
  Aviso,
  Badge,
  Card,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

/**
 * Motivos comuns de baixa por perda ou avaria. A lista evita que o mesmo
 * problema entre escrito de cinco jeitos diferentes e não some no relatório;
 * "Outro" mantém a porta aberta para o caso que a lista não previu.
 */
const MOTIVOS = [
  "Avaria no transporte",
  "Embalagem danificada na loja",
  "Produto vencido",
  "Quebra ou derramamento",
  "Furto ou extravio",
  "Recolhimento do fabricante",
  "Outro",
];

/** Registro de uma perda: sempre de um lote específico, sempre com motivo. */
function ModalNovaPerda({ aoFechar, aoRegistrar }) {
  const [produtoId, definirProdutoId] = useState("");
  const [loteId, definirLoteId] = useState("");
  const [quantidade, definirQuantidade] = useState("");
  const [motivo, definirMotivo] = useState(MOTIVOS[0]);
  const [detalhe, definirDetalhe] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  // Só produtos com saldo: não se dá baixa de perda no que não existe.
  const produtos = usarBusca(() => api.estoque.get("/produtos?com_saldo=true"), []);
  const detalheProduto = usarBusca(
    () => (produtoId ? api.estoque.get(`/produtos/${produtoId}`) : Promise.resolve(null)),
    [produtoId]
  );

  const lotes = detalheProduto.dados?.produto.lotes ?? [];
  const loteEscolhido = lotes.find((lote) => lote.id === loteId) ?? null;

  async function registrar(evento) {
    evento.preventDefault();
    definirErro(null);

    const justificativa = motivo === "Outro" ? detalhe.trim() : [motivo, detalhe.trim()].filter(Boolean).join(" — ");
    if (!justificativa) {
      definirErro("Descreva o que aconteceu — a justificativa fica no registro de auditoria.");
      return;
    }

    definirEnviando(true);
    try {
      const resposta = await api.estoque.post("/movimentacoes", {
        produto_id: produtoId,
        lote_id: loteId,
        tipo: TIPO_MOVIMENTACAO.PERDA,
        quantidade: Number(quantidade),
        motivo: justificativa,
      });
      aoRegistrar(
        `Perda registrada. Saldo do lote: ${formatarNumero(resposta.lote.quantidade_atual)}.`
      );
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      largura="max-w-2xl"
      titulo="Registrar perda ou avaria"
      descricao="A baixa é sempre de um lote específico e fica registrada com o seu usuário."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="formulario-perda"
            variante="destrutivo"
            disabled={enviando || !produtoId || !loteId || !quantidade}
          >
            {enviando ? "Registrando" : "Registrar perda"}
          </Botao>
        </>
      }
    >
      {produtos.carregando ? <Carregando texto="Carregando produtos" /> : null}
      {produtos.erro ? <Aviso tom="erro">{produtos.erro.message}</Aviso> : null}

      {produtos.dados ? (
        <form id="formulario-perda" onSubmit={registrar} className="space-y-4">
          <CampoBusca
            rotulo="Produto"
            required
            valor={produtoId}
            placeholder="Busque por código, nome ou princípio ativo"
            opcoes={produtos.dados.produtos.map((produto) => ({
              valor: produto.id,
              rotulo: produto.nome,
              detalhe: `${produto.codigo ?? "sem código"} — saldo ${produto.quantidade_atual}`,
            }))}
            aoEscolher={(valor) => {
              definirProdutoId(valor);
              definirLoteId("");
            }}
            vazio="Nenhum produto com saldo em estoque."
          />

          <div className="grid grid-cols-2 gap-4">
            <CampoSelect
              rotulo="Lote"
              required
              value={loteId}
              onChange={(evento) => definirLoteId(evento.target.value)}
              opcoes={[
                { valor: "", rotulo: produtoId ? "Selecione o lote" : "Escolha o produto" },
                ...lotes.map((lote) => ({
                  valor: lote.id,
                  rotulo: `${lote.numero_lote} — saldo ${lote.quantidade}, vence ${formatarData(
                    lote.data_validade
                  )}${lote.vencido ? " (vencido)" : ""}`,
                })),
              ]}
            />
            <CampoTexto
              rotulo="Quantidade perdida"
              type="number"
              min="1"
              max={loteEscolhido?.quantidade}
              required
              value={quantidade}
              onChange={(evento) => definirQuantidade(evento.target.value)}
              ajuda={
                loteEscolhido
                  ? `Saldo do lote: ${formatarNumero(loteEscolhido.quantidade)}.`
                  : undefined
              }
            />
          </div>

          <CampoSelect
            rotulo="Motivo"
            value={motivo}
            onChange={(evento) => definirMotivo(evento.target.value)}
            opcoes={MOTIVOS.map((item) => ({ valor: item, rotulo: item }))}
          />

          <CampoTexto
            rotulo={motivo === "Outro" ? "O que aconteceu (obrigatório)" : "Detalhe (opcional)"}
            required={motivo === "Outro"}
            value={detalhe}
            onChange={(evento) => definirDetalhe(evento.target.value)}
            placeholder="Ex: caixa amassada na descarga do dia 12"
          />

          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </form>
      ) : null}
    </Modal>
  );
}

const FILTROS_VAZIOS = { busca: "", de: diasAtras(29), ate: hojeISO() };

/**
 * Perdas e avarias: registro da baixa e o histórico do que já foi baixado, com
 * filtros e relatório — mesmo desenho da tela de clientes (título, faixa de
 * filtros, tabela).
 *
 * Entrada de lote e saída avulsa saíram daqui: a entrada acontece no
 * recebimento do pedido de compra, que é onde chegam lote e validade.
 */
export function Perdas() {
  const [filtros, definirFiltros] = useState(FILTROS_VAZIOS);
  const [modalAberto, definirModalAberto] = useState(false);
  const [mensagem, definirMensagem] = useState(null);

  const mudar = (nome, valor) => definirFiltros((atual) => ({ ...atual, [nome]: valor }));

  const parametros = useMemo(
    () => ({
      tipo: TIPO_MOVIMENTACAO.PERDA,
      busca: filtros.busca.trim() || undefined,
    }),
    [filtros.busca]
  );

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ tipo: TIPO_MOVIMENTACAO.PERDA, limite: "200" });
    if (filtros.busca.trim()) query.set("busca", filtros.busca.trim());
    if (filtros.de) query.set("de", filtros.de);
    if (filtros.ate) query.set("ate", filtros.ate);
    return `?${query.toString()}`;
  }, [filtros]);

  const historico = usarBusca(() => api.estoque.get(`/movimentacoes${consulta}`), [consulta]);

  const linhas = historico.dados?.movimentacoes ?? [];

  const resumoDosFiltros = useMemo(() => {
    const itens = [`Período: ${formatarData(filtros.de)} a ${formatarData(filtros.ate)}`];
    if (filtros.busca.trim()) itens.push(`Pesquisa: ${filtros.busca.trim()}`);
    return itens;
  }, [filtros]);

  return (
    <>
      <TituloPagina
        titulo="Perdas e avarias"
        acoes={
          <>
            <ExportarRelatorio
              servico="estoque"
              caminho="/relatorios/movimentacoes"
              titulo="Relatório de perdas e avarias"
              descricao="O que foi baixado por perda no período, com lote, motivo e responsável."
              rotulo="Relatório"
              parametros={parametros}
              periodoInicial={{ de: filtros.de, ate: filtros.ate }}
              resumoDosFiltros={resumoDosFiltros}
            />
            <Botao icone={Plus} onClick={() => definirModalAberto(true)}>
              Registrar perda
            </Botao>
          </>
        }
      />

      {mensagem ? (
        <Aviso tom="sucesso" className="mb-4">
          {mensagem}
        </Aviso>
      ) : null}

      <Card>
        <LinhaDeFiltros
          acoes={
            <LimparFiltros
              ativo={
                filtros.busca !== "" || filtros.de !== FILTROS_VAZIOS.de || filtros.ate !== FILTROS_VAZIOS.ate
              }
              aoLimpar={() => definirFiltros(FILTROS_VAZIOS)}
            />
          }
        >
          <BarraDePesquisa
            rotulo="Pesquisar"
            placeholder="Produto, código, lote ou motivo"
            valor={filtros.busca}
            aoMudar={(valor) => mudar("busca", valor)}
          />
          <CampoTexto
            rotulo="Do dia"
            type="date"
            className="w-40"
            value={filtros.de}
            max={filtros.ate}
            onChange={(evento) => mudar("de", evento.target.value)}
          />
          <CampoTexto
            rotulo="Até o dia"
            type="date"
            className="w-40"
            value={filtros.ate}
            min={filtros.de}
            max={hojeISO()}
            onChange={(evento) => mudar("ate", evento.target.value)}
          />
        </LinhaDeFiltros>

        {historico.carregando ? <Carregando texto="Carregando histórico" /> : null}
        {historico.erro ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{historico.erro.message}</Aviso>
          </div>
        ) : null}

        {historico.dados ? (
          <Tabela
            colunas={[
              {
                chave: "criado_em",
                titulo: "Quando",
                renderizar: (linha) => formatarDataHora(linha.criado_em),
              },
              {
                chave: "produto_codigo",
                titulo: "Código",
                largura: "104px",
                renderizar: (linha) => linha.produto_codigo || "—",
              },
              { chave: "produto_nome", titulo: "Produto" },
              {
                chave: "numero_lote",
                titulo: "Lote",
                renderizar: (linha) => linha.numero_lote || "—",
              },
              {
                chave: "data_validade",
                titulo: "Validade",
                renderizar: (linha) => formatarData(linha.data_validade),
              },
              {
                chave: "quantidade",
                titulo: "Unidades",
                alinhamento: "direita",
                renderizar: (linha) => (
                  <Badge tom="erro">{formatarNumero(linha.quantidade)}</Badge>
                ),
              },
              { chave: "motivo", titulo: "Motivo", renderizar: (linha) => linha.motivo || "—" },
            ]}
            linhas={linhas}
            chave={(linha) => linha.id}
            vazio={
              <EstadoVazio
                icone={PackageMinus}
                titulo="Nenhuma perda no período"
                descricao="Nada foi baixado por perda ou avaria com esses filtros."
              />
            }
          />
        ) : null}
      </Card>

      {modalAberto ? (
        <ModalNovaPerda
          aoFechar={() => definirModalAberto(false)}
          aoRegistrar={(texto) => {
            definirModalAberto(false);
            definirMensagem(texto);
            historico.recarregar();
          }}
        />
      ) : null}
    </>
  );
}
