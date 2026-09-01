import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Pencil, Plus } from "lucide-react";
import { TIPO_CONTROLE, TIPO_CONTROLE_LABEL, TIPO_CONTROLE_LISTA } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao, BotaoIcone } from "../componentes/Botao.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { BarraDePesquisa, LimparFiltros, LinhaDeFiltros } from "../componentes/Filtros.jsx";
import { CampoSelect } from "../componentes/Campos.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCorpo,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";
import { FormularioProduto } from "./FormularioProduto.jsx";

function badgeControle(tipo) {
  if (tipo === TIPO_CONTROLE.TARJA_PRETA) return <Badge tom="erro">Tarja preta</Badge>;
  if (tipo === TIPO_CONTROLE.TARJA_VERMELHA) return <Badge tom="alerta">Tarja vermelha</Badge>;
  return <Badge>Venda livre</Badge>;
}

function DetalheProduto({ produtoId, aoFechar, aoEditar, podeEditar }) {
  const { dados, carregando, erro } = usarBusca(
    () => api.estoque.get(`/produtos/${produtoId}`),
    [produtoId]
  );

  return (
    <Modal
      aberto
      largura="max-w-3xl"
      titulo="Detalhe do produto"
      aoFechar={aoFechar}
      rodape={
        podeEditar && dados ? (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Fechar
            </Botao>
            <Botao icone={Pencil} onClick={() => aoEditar(dados.produto)}>
              Editar produto
            </Botao>
          </>
        ) : null
      }
    >
      {carregando ? <Carregando /> : null}
      {erro ? <Aviso tom="erro">{erro.message}</Aviso> : null}
      {dados ? (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              ["Código", dados.produto.codigo || "—"],
              ["Nome", dados.produto.nome],
              ["Princípio ativo", dados.produto.principio_ativo || "—"],
              ["Fabricante", dados.produto.fabricante || "—"],
              ["Categoria", dados.produto.categoria_nome || "—"],
              ["Código de barras", dados.produto.codigo_barras || "—"],
              ["Unidade de venda", dados.produto.unidade_venda],
              ["Preço de custo", formatarMoeda(dados.produto.preco_custo)],
              ["Preço de venda", formatarMoeda(dados.produto.preco_venda)],
              ["Estoque mínimo", formatarNumero(dados.produto.estoque_minimo)],
              ["Classe terapêutica", dados.produto.classe_terapeutica || "—"],
              [
                "NCM (Nomenclatura Comum do Mercosul)",
                dados.produto.ncm || "—",
              ],
              [
                "CFOP (Código Fiscal de Operações e Prestações)",
                dados.produto.cfop || "—",
              ],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <p className="text-rotulo text-secundario">{rotulo}</p>
                <p className="mt-0.5 text-corpo text-texto">{valor}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-2 text-h3 text-texto">Lotes</h3>
            <Tabela
              colunas={[
                { chave: "numero_lote", titulo: "Lote" },
                {
                  chave: "data_validade",
                  titulo: "Validade",
                  renderizar: (lote) => (
                    <span className={lote.vencido ? "text-erro" : ""}>
                      {formatarData(lote.data_validade)}
                      {lote.vencido ? " (vencido)" : ""}
                    </span>
                  ),
                },
                { chave: "data_entrada", titulo: "Entrada", renderizar: (l) => formatarData(l.data_entrada) },
                {
                  chave: "quantidade",
                  titulo: "Quantidade",
                  alinhamento: "direita",
                  renderizar: (lote) => formatarNumero(lote.quantidade),
                },
              ]}
              linhas={dados.produto.lotes}
              chave={(lote) => lote.id}
              vazio={
                <p className="py-4 text-corpo text-secundario">
                  Nenhum lote cadastrado para este produto.
                </p>
              }
            />
          </div>

          {dados.historico_precos.length ? (
            <div>
              <h3 className="mb-2 text-h3 text-texto">Histórico de preço</h3>
              <Tabela
                colunas={[
                  { chave: "campo", titulo: "Campo" },
                  {
                    chave: "valor_anterior",
                    titulo: "De",
                    renderizar: (linha) => formatarMoeda(linha.valor_anterior),
                  },
                  {
                    chave: "valor_novo",
                    titulo: "Para",
                    renderizar: (linha) => formatarMoeda(linha.valor_novo),
                  },
                  {
                    chave: "criado_em",
                    titulo: "Quando",
                    renderizar: (linha) => formatarData(linha.criado_em),
                  },
                ]}
                linhas={dados.historico_precos}
                chave={(linha) => linha.id}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function Produtos() {
  const { usuario } = usarAutenticacao();
  const [parametros, definirParametros] = useSearchParams();
  const [busca, definirBusca] = useState(parametros.get("busca") ?? "");
  const [tipoControle, definirTipoControle] = useState("");
  const [categoriaId, definirCategoriaId] = useState("");
  const [formularioAberto, definirFormularioAberto] = useState(false);
  const [produtoEmEdicao, definirProdutoEmEdicao] = useState(null);
  const [produtoSelecionado, definirProdutoSelecionado] = useState(null);

  const categorias = usarBusca(() => api.estoque.get("/categorias"), []);

  // Um objeto só de filtros serve a tela e o relatório — o arquivo sai com o
  // mesmo recorte da lista que está sendo olhada.
  const filtros = useMemo(() => {
    const limpos = {};
    if (busca.trim()) limpos.busca = busca.trim();
    if (tipoControle) limpos.tipo_controle = tipoControle;
    if (categoriaId) limpos.categoria_id = categoriaId;
    return limpos;
  }, [busca, tipoControle, categoriaId]);

  const consulta = useMemo(() => {
    const texto = new URLSearchParams(filtros).toString();
    return texto ? `?${texto}` : "";
  }, [filtros]);

  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.estoque.get(`/produtos${consulta}`),
    [consulta]
  );

  const podeCadastrar = temPermissao(usuario, "ajustar_estoque");

  const resumoDosFiltros = useMemo(() => {
    const linhas = [];
    if (busca.trim()) linhas.push(`Pesquisa: ${busca.trim()}`);
    if (tipoControle) linhas.push(`Controle: ${TIPO_CONTROLE_LABEL[tipoControle]}`);
    if (categoriaId) {
      const categoria = categorias.dados?.categorias.find((item) => item.id === categoriaId);
      if (categoria) linhas.push(`Categoria: ${categoria.nome}`);
    }
    return linhas;
  }, [busca, tipoControle, categoriaId, categorias.dados]);

  function aoBuscar(valor) {
    definirBusca(valor);
    definirParametros(valor ? { busca: valor } : {}, { replace: true });
  }

  function limpar() {
    aoBuscar("");
    definirTipoControle("");
    definirCategoriaId("");
  }

  return (
    <>
      <TituloPagina
        titulo="Produtos"
        acoes={
          <>
            <ExportarRelatorio
              servico="estoque"
              caminho="/relatorios/estoque"
              titulo="Relatório de produtos"
              descricao="Cadastro completo, saldo por produto e valor em estoque."
              rotulo="Relatório"
              comPeriodo={false}
              parametros={filtros}
              resumoDosFiltros={resumoDosFiltros}
            />
            {podeCadastrar ? (
              <Botao
                icone={Plus}
                onClick={() => {
                  definirProdutoEmEdicao(null);
                  definirFormularioAberto(true);
                }}
              >
                Novo produto
              </Botao>
            ) : null}
          </>
        }
      />

      <Card>
        <LinhaDeFiltros
          acoes={<LimparFiltros ativo={Boolean(resumoDosFiltros.length)} aoLimpar={limpar} />}
        >
          <BarraDePesquisa
            rotulo="Pesquisar produto"
            placeholder="Código, nome, princípio ativo, fabricante ou EAN"
            valor={busca}
            aoMudar={aoBuscar}
          />
          <CampoSelect
            rotulo="Tipo de controle"
            className="w-56"
            value={tipoControle}
            onChange={(evento) => definirTipoControle(evento.target.value)}
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
            value={categoriaId}
            onChange={(evento) => definirCategoriaId(evento.target.value)}
            opcoes={[
              { valor: "", rotulo: "Todas" },
              ...(categorias.dados?.categorias ?? []).map((categoria) => ({
                valor: categoria.id,
                rotulo: categoria.nome,
              })),
            ]}
          />
        </LinhaDeFiltros>

        {carregando ? <Carregando texto="Carregando produtos" /> : null}
        {erro ? (
          <CardCorpo>
            <Aviso tom="erro">{erro.message}</Aviso>
          </CardCorpo>
        ) : null}

        {dados ? (
          <Tabela
            colunas={[
              // Preço e saldo saíram: preço é assunto do PDV, saldo é do
              // estoque. Aqui a lista serve para achar e conferir o cadastro,
              // então o espaço vai para os campos que antes ficavam escondidos
              // atrás de um clique.
              { chave: "codigo", titulo: "Código", largura: "104px", renderizar: (p) => p.codigo || "—" },
              { chave: "nome", titulo: "Produto" },
              {
                chave: "principio_ativo",
                titulo: "Princípio ativo",
                renderizar: (p) => p.principio_ativo || "—",
              },
              { chave: "fabricante", titulo: "Fabricante", renderizar: (p) => p.fabricante || "—" },
              { chave: "categoria_nome", titulo: "Categoria", renderizar: (p) => p.categoria_nome || "—" },
              {
                chave: "tipo_controle",
                titulo: "Controle",
                renderizar: (p) => badgeControle(p.tipo_controle),
              },
              {
                chave: "codigo_barras",
                titulo: "Código de barras",
                renderizar: (p) => p.codigo_barras || "—",
              },
              {
                chave: "unidade_venda",
                titulo: "Unidade",
                renderizar: (p) => (
                  <span className="capitalize">{p.unidade_venda}</span>
                ),
              },
              {
                chave: "acoes",
                titulo: "",
                largura: "56px",
                renderizar: (produto) =>
                  podeCadastrar ? (
                    <BotaoIcone
                      icone={Pencil}
                      rotulo={`Editar ${produto.nome}`}
                      onClick={(evento) => {
                        evento.stopPropagation();
                        definirProdutoEmEdicao(produto);
                        definirFormularioAberto(true);
                      }}
                    />
                  ) : null,
              },
            ]}
            linhas={dados.produtos}
            chave={(produto) => produto.id}
            aoClicarLinha={(produto) => definirProdutoSelecionado(produto.id)}
            vazio={
              <EstadoVazio
                icone={Package}
                titulo="Nenhum produto encontrado"
                descricao={
                  resumoDosFiltros.length
                    ? "Ajuste os filtros para ver outros produtos."
                    : "Cadastre o primeiro produto para começar a operar."
                }
                acao={
                  podeCadastrar ? (
                    <Botao
                      icone={Plus}
                      onClick={() => {
                        definirProdutoEmEdicao(null);
                        definirFormularioAberto(true);
                      }}
                    >
                      Novo produto
                    </Botao>
                  ) : null
                }
              />
            }
          />
        ) : null}
      </Card>

      {formularioAberto ? (
        <FormularioProduto
          produto={produtoEmEdicao}
          aoFechar={() => definirFormularioAberto(false)}
          aoSalvar={() => {
            definirFormularioAberto(false);
            definirProdutoEmEdicao(null);
            recarregar();
          }}
        />
      ) : null}

      {produtoSelecionado ? (
        <DetalheProduto
          produtoId={produtoSelecionado}
          podeEditar={podeCadastrar}
          aoEditar={(produto) => {
            definirProdutoSelecionado(null);
            definirProdutoEmEdicao(produto);
            definirFormularioAberto(true);
          }}
          aoFechar={() => definirProdutoSelecionado(null)}
        />
      ) : null}
    </>
  );
}
