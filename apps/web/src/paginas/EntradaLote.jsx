import { useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarNumero, hojeISO } from "../lib/formato.js";
import { temPermissao, usarAutenticacao } from "../lib/autenticacao.jsx";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  TituloPagina,
} from "../componentes/Superficies.jsx";

/** Entrada de lote — controle por lote e validade é obrigatório (§2). */
export function EntradaLote() {
  const { usuario } = usarAutenticacao();
  const podeDarEntrada = temPermissao(usuario, "ajustar_estoque");

  const [produtoId, definirProdutoId] = useState("");
  const [numeroLote, definirNumeroLote] = useState("");
  const [quantidade, definirQuantidade] = useState("");
  const [dataValidade, definirDataValidade] = useState("");
  const [mensagem, definirMensagem] = useState(null);
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const produtos = usarBusca(() => api.estoque.get("/produtos"), []);
  const movimentacoes = usarBusca(() => api.estoque.get("/movimentacoes?limite=20"), []);

  const produtoEscolhido = useMemo(
    () => produtos.dados?.produtos.find((produto) => produto.id === produtoId) ?? null,
    [produtos.dados, produtoId]
  );

  async function submeter(evento) {
    evento.preventDefault();
    definirErro(null);
    definirMensagem(null);
    definirEnviando(true);
    try {
      const resposta = await api.estoque.post("/lotes", {
        produto_id: produtoId,
        numero_lote: numeroLote.trim(),
        quantidade: Number(quantidade),
        data_validade: dataValidade,
      });
      definirMensagem(
        `Lote ${resposta.lote.numero_lote} registrado. Saldo do lote: ${formatarNumero(
          resposta.lote.quantidade
        )}.`
      );
      definirNumeroLote("");
      definirQuantidade("");
      definirDataValidade("");
      produtos.recarregar();
      movimentacoes.recarregar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  if (!podeDarEntrada) {
    return (
      <>
        <TituloPagina titulo="Entrada de lote" />
        <Aviso tom="alerta" titulo="Sem permissão">
          Entrada de estoque é restrita a gerente e administrador.
        </Aviso>
      </>
    );
  }

  return (
    <>
      <TituloPagina
        titulo="Entrada de lote"
        descricao="Toda entrada registra lote, validade e movimentação de auditoria."
      />

      <div className="grid grid-cols-[420px_1fr] gap-6">
        <Card>
          <CardCabecalho titulo="Nova entrada" icone={PackagePlus} />
          <CardCorpo>
            {produtos.carregando ? <Carregando texto="Carregando produtos" /> : null}
            {produtos.dados ? (
              <form onSubmit={submeter} className="space-y-4">
                <CampoSelect
                  rotulo="Produto"
                  required
                  value={produtoId}
                  onChange={(evento) => definirProdutoId(evento.target.value)}
                  opcoes={[
                    { valor: "", rotulo: "Selecione o produto" },
                    ...produtos.dados.produtos.map((produto) => ({
                      valor: produto.id,
                      rotulo: produto.nome,
                    })),
                  ]}
                />

                {produtoEscolhido ? (
                  <p className="text-rotulo text-secundario">
                    Estoque disponível hoje: {formatarNumero(produtoEscolhido.quantidade_atual)}{" "}
                    {produtoEscolhido.unidade_venda} — mínimo{" "}
                    {formatarNumero(produtoEscolhido.estoque_minimo)}
                  </p>
                ) : null}

                <CampoTexto
                  rotulo="Número do lote"
                  required
                  value={numeroLote}
                  onChange={(evento) => definirNumeroLote(evento.target.value)}
                  placeholder="Ex: L2026-0142"
                />
                <CampoTexto
                  rotulo="Quantidade"
                  type="number"
                  min="1"
                  required
                  value={quantidade}
                  onChange={(evento) => definirQuantidade(evento.target.value)}
                />
                <CampoTexto
                  rotulo="Data de validade"
                  type="date"
                  required
                  min={hojeISO()}
                  value={dataValidade}
                  onChange={(evento) => definirDataValidade(evento.target.value)}
                  ajuda="Lote já vencido não entra no estoque."
                />

                {mensagem ? <Aviso tom="sucesso">{mensagem}</Aviso> : null}
                {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

                <Botao type="submit" className="w-full" disabled={enviando}>
                  {enviando ? "Registrando" : "Registrar entrada"}
                </Botao>
              </form>
            ) : null}
          </CardCorpo>
        </Card>

        <Card>
          <CardCabecalho
            titulo="Últimas movimentações"
            descricao="Auditoria de entrada, saída, ajuste, perda e devolução."
          />
          {movimentacoes.carregando ? <Carregando /> : null}
          {movimentacoes.dados ? (
            <Tabela
              colunas={[
                { chave: "produto_nome", titulo: "Produto" },
                { chave: "tipo", titulo: "Tipo" },
                {
                  chave: "quantidade",
                  titulo: "Qtd.",
                  alinhamento: "direita",
                  renderizar: (m) => formatarNumero(m.quantidade),
                },
                { chave: "motivo", titulo: "Motivo", renderizar: (m) => m.motivo || "—" },
                {
                  chave: "criado_em",
                  titulo: "Data",
                  renderizar: (m) => formatarData(m.criado_em),
                },
              ]}
              linhas={movimentacoes.dados.movimentacoes}
              chave={(m) => m.id}
              vazio={
                <p className="px-5 py-6 text-corpo text-secundario">
                  Nenhuma movimentação registrada ainda.
                </p>
              }
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}
