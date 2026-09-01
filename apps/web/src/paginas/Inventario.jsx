import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { TIPO_CONTROLE_LABEL, TIPO_CONTROLE_LISTA, TIPO_MOVIMENTACAO } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarNumero } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
import { CampoBusca } from "../componentes/CampoBusca.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { BarraDePesquisa, LimparFiltros, LinhaDeFiltros } from "../componentes/Filtros.jsx";
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

const FILTROS_VAZIOS = { busca: "", tipo_controle: "", categoria_id: "" };

/**
 * Inventário: contagem física lote a lote. A divergência entre o que o sistema
 * diz e o que foi contado exige justificativa (§2) e entra como ajuste na
 * auditoria de estoque.
 *
 * A lista traz só produto com saldo — o que entrou por compra e ainda não saiu
 * por venda nem por perda. Contar o que o sistema já sabe estar zerado não é
 * inventário, é rolar a tela.
 */
export function Inventario() {
  const [filtros, definirFiltros] = useState(FILTROS_VAZIOS);
  const [produtoId, definirProdutoId] = useState("");
  const [contagens, definirContagens] = useState({});
  const [justificativa, definirJustificativa] = useState("");
  const [mensagem, definirMensagem] = useState(null);
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const mudar = (nome, valor) => definirFiltros((atual) => ({ ...atual, [nome]: valor }));

  const parametros = useMemo(() => {
    // `com_saldo` acompanha os filtros até o relatório: a planilha do
    // inventário é a folha de contagem, e não o catálogo inteiro.
    const limpos = { com_saldo: "true" };
    if (filtros.busca.trim()) limpos.busca = filtros.busca.trim();
    if (filtros.tipo_controle) limpos.tipo_controle = filtros.tipo_controle;
    if (filtros.categoria_id) limpos.categoria_id = filtros.categoria_id;
    return limpos;
  }, [filtros]);

  const consulta = useMemo(() => `?${new URLSearchParams(parametros).toString()}`, [parametros]);

  const categorias = usarBusca(() => api.estoque.get("/categorias"), []);
  const produtos = usarBusca(() => api.estoque.get(`/produtos${consulta}`), [consulta]);
  const detalhe = usarBusca(
    () => (produtoId ? api.estoque.get(`/produtos/${produtoId}`) : Promise.resolve(null)),
    [produtoId]
  );

  const lista = produtos.dados?.produtos ?? [];
  const lotes = detalhe.dados?.produto.lotes ?? [];

  const resumoDosFiltros = useMemo(() => {
    const itens = ["Só produtos com saldo em estoque"];
    if (filtros.busca.trim()) itens.push(`Pesquisa: ${filtros.busca.trim()}`);
    if (filtros.tipo_controle) {
      itens.push(`Controle: ${TIPO_CONTROLE_LABEL[filtros.tipo_controle]}`);
    }
    if (filtros.categoria_id) {
      const categoria = categorias.dados?.categorias.find(
        (item) => item.id === filtros.categoria_id
      );
      if (categoria) itens.push(`Categoria: ${categoria.nome}`);
    }
    return itens;
  }, [filtros, categorias.dados]);

  const filtrosAtivos =
    filtros.busca !== "" || filtros.tipo_controle !== "" || filtros.categoria_id !== "";

  const divergencias = lotes
    .map((lote) => {
      const contado = contagens[lote.id];
      if (contado === undefined || contado === "") return null;
      const diferenca = Number(contado) - lote.quantidade;
      return diferenca === 0 ? null : { lote, contado: Number(contado), diferenca };
    })
    .filter(Boolean);

  async function aplicar() {
    definirErro(null);
    definirMensagem(null);

    if (!divergencias.length) {
      definirErro("Nenhuma divergência para ajustar — a contagem bateu com o sistema.");
      return;
    }
    if (!justificativa.trim()) {
      definirErro("A justificativa é obrigatória para ajustar o estoque.");
      return;
    }

    definirEnviando(true);
    try {
      for (const item of divergencias) {
        await api.estoque.post("/movimentacoes", {
          produto_id: produtoId,
          lote_id: item.lote.id,
          tipo: TIPO_MOVIMENTACAO.AJUSTE,
          quantidade: item.contado,
          motivo: `Inventário: ${justificativa.trim()}`,
        });
      }
      definirMensagem(
        `${divergencias.length} lote(s) ajustado(s) pela contagem física. O ajuste ficou registrado com o seu usuário.`
      );
      definirContagens({});
      definirJustificativa("");
      detalhe.recarregar();
      produtos.recarregar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Inventário"
        acoes={
          <ExportarRelatorio
            servico="estoque"
            caminho="/relatorios/estoque"
            titulo="Folha de contagem"
            descricao="Os produtos com saldo que estão na tela, com saldo do sistema e próxima validade."
            rotulo="Relatório"
            comPeriodo={false}
            parametros={parametros}
            resumoDosFiltros={resumoDosFiltros}
          />
        }
      />

      <Card className="mb-6">
        <LinhaDeFiltros
          acoes={
            <LimparFiltros
              ativo={filtrosAtivos}
              aoLimpar={() => {
                definirFiltros(FILTROS_VAZIOS);
                definirProdutoId("");
              }}
            />
          }
        >
          <BarraDePesquisa
            rotulo="Pesquisar produto"
            placeholder="Código, nome, princípio ativo ou EAN"
            valor={filtros.busca}
            aoMudar={(valor) => mudar("busca", valor)}
          />
          <CampoSelect
            rotulo="Tipo de controle"
            className="w-56"
            value={filtros.tipo_controle}
            onChange={(evento) => mudar("tipo_controle", evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todos" },
              ...TIPO_CONTROLE_LISTA.map((tipo) => ({
                valor: tipo,
                rotulo: TIPO_CONTROLE_LABEL[tipo],
              })),
            ]}
          />
          <CampoSelect
            rotulo="Categoria"
            className="w-56"
            value={filtros.categoria_id}
            onChange={(evento) => mudar("categoria_id", evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todas" },
              ...(categorias.dados?.categorias ?? []).map((categoria) => ({
                valor: categoria.id,
                rotulo: categoria.nome,
              })),
            ]}
          />
        </LinhaDeFiltros>

        <CardCorpo>
          {produtos.carregando ? <Carregando texto="Carregando produtos" /> : null}
          {produtos.erro ? <Aviso tom="erro">{produtos.erro.message}</Aviso> : null}
          {produtos.dados ? (
            <CampoBusca
              rotulo={`Produto a contar (${lista.length} com saldo)`}
              className="max-w-2xl"
              valor={produtoId}
              placeholder="Escolha o produto para contar lote a lote"
              opcoes={lista.map((produto) => ({
                valor: produto.id,
                rotulo: produto.nome,
                detalhe: `${produto.codigo ?? "sem código"} — saldo em sistema ${
                  produto.quantidade_atual
                }`,
              }))}
              aoEscolher={(valor) => {
                definirProdutoId(valor);
                definirContagens({});
                definirMensagem(null);
                definirErro(null);
              }}
              vazio="Nenhum produto com saldo para esses filtros."
            />
          ) : null}
        </CardCorpo>
      </Card>

      <div className="grid grid-cols-[380px_1fr] gap-6">
        <Card>
          <CardCabecalho titulo="Fechar a contagem" icone={ClipboardList} />
          <CardCorpo className="space-y-4">
            {produtoId ? (
              <>
                <CampoTexto
                  rotulo="Justificativa da contagem"
                  value={justificativa}
                  onChange={(evento) => definirJustificativa(evento.target.value)}
                  placeholder="Ex: inventário mensal do balcão"
                  ajuda="Vai junto no registro de cada ajuste."
                />

                {divergencias.length ? (
                  <Aviso tom="alerta" titulo={`${divergencias.length} divergência(s)`}>
                    <ul className="mt-1 space-y-0.5">
                      {divergencias.map((item) => (
                        <li key={item.lote.id}>
                          {item.lote.numero_lote}: sistema {formatarNumero(item.lote.quantidade)},
                          contado {formatarNumero(item.contado)} ({item.diferenca > 0 ? "+" : ""}
                          {formatarNumero(item.diferenca)})
                        </li>
                      ))}
                    </ul>
                  </Aviso>
                ) : (
                  <p className="text-corpo text-secundario">
                    Informe a contagem de cada lote ao lado. Só os lotes com diferença geram ajuste.
                  </p>
                )}

                {mensagem ? <Aviso tom="sucesso">{mensagem}</Aviso> : null}
                {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

                <Botao className="w-full" onClick={aplicar} disabled={enviando}>
                  {enviando ? "Ajustando" : "Aplicar contagem"}
                </Botao>
              </>
            ) : (
              <p className="text-corpo text-secundario">
                Escolha um produto acima para começar a contagem.
              </p>
            )}
          </CardCorpo>
        </Card>

        <Card>
          <CardCabecalho
            titulo="Lotes do produto"
            descricao={
              detalhe.dados
                ? `${detalhe.dados.produto.nome} — saldo em sistema ${formatarNumero(
                    detalhe.dados.produto.quantidade_atual
                  )}`
                : "Escolha um produto para contar"
            }
          />

          {detalhe.carregando ? <Carregando /> : null}
          {detalhe.erro ? (
            <div className="px-5 py-4">
              <Aviso tom="erro">{detalhe.erro.message}</Aviso>
            </div>
          ) : null}

          {!produtoId ? (
            <EstadoVazio
              icone={ClipboardList}
              titulo="Nenhum produto selecionado"
              descricao="A contagem é feita lote por lote, por causa da validade."
            />
          ) : null}

          {produtoId && detalhe.dados ? (
            lotes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-corpo">
                  <thead>
                    <tr className="border-b border-borda text-left">
                      {["Lote", "Validade", "Saldo no sistema", "Contagem física", "Diferença"].map(
                        (titulo) => (
                          <th
                            key={titulo}
                            className="px-3 py-2 text-rotulo uppercase tracking-wide text-secundario"
                          >
                            {titulo}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map((lote) => {
                      const contado = contagens[lote.id];
                      const diferenca =
                        contado === undefined || contado === ""
                          ? null
                          : Number(contado) - lote.quantidade;
                      return (
                        <tr key={lote.id} className="border-b border-borda/70">
                          <td className="px-3 py-2 text-texto">{lote.numero_lote}</td>
                          <td className="px-3 py-2">
                            <span className={lote.vencido ? "text-erro" : "text-texto"}>
                              {formatarData(lote.data_validade)}
                              {lote.vencido ? " (vencido)" : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-texto">{formatarNumero(lote.quantidade)}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              value={contado ?? ""}
                              onChange={(evento) =>
                                definirContagens({ ...contagens, [lote.id]: evento.target.value })
                              }
                              className="h-9 w-28 rounded-botao border border-borda bg-card px-2 text-corpo text-texto focus-visible:foco-arkos"
                              aria-label={`Contagem do lote ${lote.numero_lote}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {diferenca === null ? (
                              <span className="text-secundario">—</span>
                            ) : diferenca === 0 ? (
                              <Badge tom="sucesso">Bateu</Badge>
                            ) : (
                              <Badge tom={diferenca > 0 ? "alerta" : "erro"}>
                                {diferenca > 0 ? "+" : ""}
                                {formatarNumero(diferenca)}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EstadoVazio
                icone={ClipboardList}
                titulo="Produto sem lote cadastrado"
                descricao="Dê entrada de um lote pelo recebimento de compra antes de inventariar."
              />
            )
          ) : null}
        </Card>
      </div>
    </>
  );
}
