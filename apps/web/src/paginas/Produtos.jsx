import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Plus } from "lucide-react";
import { TIPO_CONTROLE, TIPO_CONTROLE_LABEL, TIPO_CONTROLE_LISTA } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarMoeda, formatarNumero } from "../lib/formato.js";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
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

function badgeEstoque(produto) {
  const quantidade = produto.quantidade_atual ?? 0;
  if (quantidade === 0) return <Badge tom="erro">Sem estoque</Badge>;
  if (quantidade <= produto.estoque_minimo) return <Badge tom="alerta">Abaixo do mínimo</Badge>;
  return <Badge tom="sucesso">{formatarNumero(quantidade)}</Badge>;
}

function DetalheProduto({ produtoId, aoFechar }) {
  const { dados, carregando, erro } = usarBusca(
    () => api.estoque.get(`/produtos/${produtoId}`),
    [produtoId]
  );

  return (
    <Modal aberto largura="max-w-3xl" titulo="Detalhe do produto" aoFechar={aoFechar}>
      {carregando ? <Carregando /> : null}
      {erro ? <Aviso tom="erro">{erro.message}</Aviso> : null}
      {dados ? (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              ["Nome", dados.produto.nome],
              ["Princípio ativo", dados.produto.principio_ativo || "—"],
              ["Fabricante", dados.produto.fabricante || "—"],
              ["Categoria", dados.produto.categoria_nome || "—"],
              ["Fornecedor", dados.produto.fornecedor_nome || "—"],
              ["Código de barras", dados.produto.codigo_barras || "—"],
              ["Unidade de venda", dados.produto.unidade_venda],
              ["Preço de custo", formatarMoeda(dados.produto.preco_custo)],
              ["Preço de venda", formatarMoeda(dados.produto.preco_venda)],
              ["Estoque mínimo", formatarNumero(dados.produto.estoque_minimo)],
              ["Classe terapêutica", dados.produto.classe_terapeutica || "—"],
              ["NCM / CFOP", `${dados.produto.ncm || "—"} / ${dados.produto.cfop || "—"}`],
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
  const [formularioAberto, definirFormularioAberto] = useState(false);
  const [produtoSelecionado, definirProdutoSelecionado] = useState(null);

  const consulta = useMemo(() => {
    const query = new URLSearchParams();
    if (busca.trim()) query.set("nome", busca.trim());
    if (tipoControle) query.set("tipo_controle", tipoControle);
    const texto = query.toString();
    return texto ? `?${texto}` : "";
  }, [busca, tipoControle]);

  const { dados, carregando, erro, recarregar } = usarBusca(
    () => api.estoque.get(`/produtos${consulta}`),
    [consulta]
  );

  const podeCadastrar = temPermissao(usuario, "ajustar_estoque");

  function aoBuscar(evento) {
    definirBusca(evento.target.value);
    definirParametros(evento.target.value ? { busca: evento.target.value } : {}, { replace: true });
  }

  return (
    <>
      <TituloPagina
        titulo="Produtos"
        descricao="Cadastro, preços e estoque disponível por produto."
        acoes={
          podeCadastrar ? (
            <Botao icone={Plus} onClick={() => definirFormularioAberto(true)}>
              Novo produto
            </Botao>
          ) : null
        }
      />

      <Card>
        <div className="flex items-end gap-3 border-b border-borda px-5 py-4">
          <CampoTexto
            rotulo="Buscar por nome ou princípio ativo"
            className="w-80"
            value={busca}
            onChange={aoBuscar}
            placeholder="Ex: dipirona"
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
        </div>

        {carregando ? <Carregando texto="Carregando produtos" /> : null}
        {erro ? (
          <CardCorpo>
            <Aviso tom="erro">{erro.message}</Aviso>
          </CardCorpo>
        ) : null}

        {dados ? (
          <Tabela
            colunas={[
              { chave: "nome", titulo: "Produto" },
              {
                chave: "principio_ativo",
                titulo: "Princípio ativo",
                renderizar: (p) => p.principio_ativo || "—",
              },
              { chave: "categoria_nome", titulo: "Categoria", renderizar: (p) => p.categoria_nome || "—" },
              {
                chave: "tipo_controle",
                titulo: "Controle",
                renderizar: (p) => badgeControle(p.tipo_controle),
              },
              {
                chave: "preco_venda",
                titulo: "Preço",
                alinhamento: "direita",
                renderizar: (p) => formatarMoeda(p.preco_venda),
              },
              {
                chave: "quantidade_atual",
                titulo: "Estoque",
                alinhamento: "direita",
                renderizar: (p) => badgeEstoque(p),
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
                  busca || tipoControle
                    ? "Ajuste os filtros para ver outros produtos."
                    : "Cadastre o primeiro produto para começar a operar."
                }
                acao={
                  podeCadastrar ? (
                    <Botao icone={Plus} onClick={() => definirFormularioAberto(true)}>
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
          aoFechar={() => definirFormularioAberto(false)}
          aoSalvar={() => {
            definirFormularioAberto(false);
            recarregar();
          }}
        />
      ) : null}

      {produtoSelecionado ? (
        <DetalheProduto
          produtoId={produtoSelecionado}
          aoFechar={() => definirProdutoSelecionado(null)}
        />
      ) : null}
    </>
  );
}
