import { useState } from "react";
import { ClipboardList, Truck } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarMoeda, formatarNumero } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSelect } from "../componentes/Campos.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Card,
  CardCabecalho,
  Carregando,
  EstadoVazio,
  TituloPagina,
} from "../componentes/Superficies.jsx";

/**
 * Sugestão automática de compra (§4): parte dos produtos abaixo do estoque
 * mínimo e propõe repor até o dobro do mínimo. O usuário ajusta e gera o pedido.
 */
export function SugestaoCompra() {
  const [selecionados, definirSelecionados] = useState({});
  const [confirmando, definirConfirmando] = useState(false);
  const [fornecedorId, definirFornecedorId] = useState("");
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);
  const [pronto, definirPronto] = useState(null);

  const sugestao = usarBusca(() => api.compras.get("/sugestao"), []);
  const fornecedores = usarBusca(() => api.estoque.get("/fornecedores"), []);

  const sugestoes = sugestao.dados?.sugestoes ?? [];
  const escolhidos = sugestoes.filter((item) => selecionados[item.produto_id]);
  const totalEstimado = escolhidos.reduce(
    (soma, item) => soma + item.quantidade_sugerida * Number(item.preco_custo ?? 0),
    0
  );

  function alternar(produtoId) {
    definirSelecionados((atual) => ({ ...atual, [produtoId]: !atual[produtoId] }));
  }

  function abrirConfirmacao() {
    definirErro(null);
    definirPronto(null);
    // Fornecedor mais comum entre os itens escolhidos já vem pré-selecionado.
    const contagem = {};
    for (const item of escolhidos) {
      if (!item.fornecedor_id) continue;
      contagem[item.fornecedor_id] = (contagem[item.fornecedor_id] ?? 0) + 1;
    }
    const maisComum = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
    definirFornecedorId(maisComum?.[0] ?? "");
    definirConfirmando(true);
  }

  async function gerarPedido() {
    definirErro(null);
    definirEnviando(true);
    try {
      await api.compras.post("/pedidos", {
        fornecedor_id: fornecedorId,
        observacao: "Gerado pela sugestão automática de compra",
        itens: escolhidos.map((item) => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade_sugerida,
          preco_unitario: Number(item.preco_custo ?? 0),
        })),
      });
      definirPronto(`Pedido criado em rascunho com ${escolhidos.length} item(ns).`);
      definirConfirmando(false);
      definirSelecionados({});
      sugestao.recarregar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Sugestão de compra"
        descricao="Montada a partir dos produtos que estão no mínimo ou abaixo dele."
        acoes={
          <Botao icone={Truck} disabled={!escolhidos.length} onClick={abrirConfirmacao}>
            Gerar pedido ({escolhidos.length})
          </Botao>
        }
      />

      {pronto ? (
        <Aviso tom="sucesso" className="mb-4">
          {pronto} Confira em Pedidos de compra antes de enviar ao fornecedor.
        </Aviso>
      ) : null}
      {erro ? (
        <Aviso tom="erro" className="mb-4">
          {erro}
        </Aviso>
      ) : null}

      <Card>
        <CardCabecalho
          titulo="Produtos a repor"
          descricao="Marque o que entra no pedido. A quantidade sugerida repõe até o dobro do mínimo."
          icone={ClipboardList}
        />

        {sugestao.carregando ? <Carregando texto="Consultando estoque" /> : null}
        {sugestao.erro ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{sugestao.erro.message}</Aviso>
          </div>
        ) : null}

        {sugestao.dados ? (
          <Tabela
            colunas={[
              {
                chave: "selecionado",
                titulo: "",
                largura: "48px",
                renderizar: (item) => (
                  <input
                    type="checkbox"
                    checked={Boolean(selecionados[item.produto_id])}
                    onChange={() => alternar(item.produto_id)}
                    aria-label={`Incluir ${item.produto_nome} no pedido`}
                    className="h-4 w-4 rounded border-borda text-primario focus-visible:foco-arkos"
                  />
                ),
              },
              { chave: "produto_nome", titulo: "Produto" },
              {
                chave: "fornecedor_nome",
                titulo: "Fornecedor habitual",
                renderizar: (item) => item.fornecedor_nome || "—",
              },
              {
                chave: "saldo_atual",
                titulo: "Saldo",
                alinhamento: "direita",
                renderizar: (item) => formatarNumero(item.saldo_atual),
              },
              {
                chave: "estoque_minimo",
                titulo: "Mínimo",
                alinhamento: "direita",
                renderizar: (item) => formatarNumero(item.estoque_minimo),
              },
              {
                chave: "quantidade_sugerida",
                titulo: "Sugerido",
                alinhamento: "direita",
                renderizar: (item) => formatarNumero(item.quantidade_sugerida),
              },
              {
                chave: "custo",
                titulo: "Custo estimado",
                alinhamento: "direita",
                renderizar: (item) =>
                  formatarMoeda(item.quantidade_sugerida * Number(item.preco_custo ?? 0)),
              },
            ]}
            linhas={sugestoes}
            chave={(item) => item.produto_id}
            totais={
              escolhidos.length
                ? {
                    __rotulo: `${escolhidos.length} item(ns) selecionado(s)`,
                    custo: formatarMoeda(totalEstimado),
                  }
                : null
            }
            vazio={
              <EstadoVazio
                icone={ClipboardList}
                titulo="Nenhum produto abaixo do mínimo"
                descricao="Quando o estoque cair, a sugestão aparece aqui."
              />
            }
          />
        ) : null}
      </Card>

      {confirmando ? (
        <Modal
          aberto
          titulo="Gerar pedido de compra"
          descricao={`${escolhidos.length} item(ns), custo estimado de ${formatarMoeda(totalEstimado)}`}
          aoFechar={() => definirConfirmando(false)}
          rodape={
            <>
              <Botao variante="secundario" onClick={() => definirConfirmando(false)}>
                Voltar
              </Botao>
              <Botao onClick={gerarPedido} disabled={enviando || !fornecedorId}>
                {enviando ? "Gerando" : "Criar pedido em rascunho"}
              </Botao>
            </>
          }
        >
          <div className="space-y-4">
            {fornecedores.dados ? (
              <CampoSelect
                rotulo="Fornecedor do pedido"
                value={fornecedorId}
                onChange={(evento) => definirFornecedorId(evento.target.value)}
                opcoes={[
                  { valor: "", rotulo: "Selecione" },
                  ...fornecedores.dados.fornecedores.map((fornecedor) => ({
                    valor: fornecedor.id,
                    rotulo: fornecedor.nome,
                  })),
                ]}
                ajuda="Um pedido é de um fornecedor só — separe em dois se precisar."
              />
            ) : (
              <Carregando />
            )}

            <ul className="space-y-1 text-corpo text-secundario">
              {escolhidos.map((item) => (
                <li key={item.produto_id}>
                  {item.produto_nome} — {formatarNumero(item.quantidade_sugerida)} un.
                </li>
              ))}
            </ul>

            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
