import { useMemo, useState } from "react";
import { ArrowLeftRight, PackageMinus, PackagePlus } from "lucide-react";
import { TIPO_MOVIMENTACAO } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarDataHora, formatarNumero, hojeISO } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { ExportarRelatorio } from "../componentes/ExportarRelatorio.jsx";
import { Tabela } from "../componentes/Tabela.jsx";
import {
  Aviso,
  Badge,
  Card,
  CardCabecalho,
  CardCorpo,
  Carregando,
  TituloPagina,
} from "../componentes/Superficies.jsx";

const TOM_TIPO = {
  entrada: "sucesso",
  devolucao: "sucesso",
  saida: "info",
  perda: "erro",
  ajuste: "alerta",
};

/** Motivos de saída que não são venda — a venda dá baixa pelo PDV. */
const MOTIVOS_SAIDA = [
  "Uso interno da farmácia",
  "Amostra / demonstração",
  "Transferência para outra unidade",
  "Descarte por avaria",
];

function SeletorProduto({ produtos, valor, aoMudar, rotulo = "Produto" }) {
  return (
    <CampoSelect
      rotulo={rotulo}
      required
      value={valor}
      onChange={(evento) => aoMudar(evento.target.value)}
      opcoes={[
        { valor: "", rotulo: "Selecione o produto" },
        ...produtos.map((produto) => ({
          valor: produto.id,
          rotulo: `${produto.nome} (saldo ${produto.quantidade_atual})`,
        })),
      ]}
    />
  );
}

/** Entrada de lote, saída avulsa e perda — a auditoria de cada uma fica na lista. */
export function Movimentacoes() {
  const [aba, definirAba] = useState("entrada");

  const produtos = usarBusca(() => api.estoque.get("/produtos"), []);
  const movimentacoes = usarBusca(() => api.estoque.get("/movimentacoes?limite=60"), []);

  const [mensagem, definirMensagem] = useState(null);
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  // Entrada de lote
  const [entrada, definirEntrada] = useState({
    produto_id: "",
    numero_lote: "",
    quantidade: "",
    data_validade: "",
  });

  // Saída avulsa (FEFO automático) e perda (lote explícito)
  const [saida, definirSaida] = useState({ produto_id: "", quantidade: "", motivo: MOTIVOS_SAIDA[0] });
  const [perda, definirPerda] = useState({ produto_id: "", lote_id: "", quantidade: "", motivo: "" });

  const listaProdutos = produtos.dados?.produtos ?? [];

  const detalheProdutoPerda = usarBusca(
    () => (perda.produto_id ? api.estoque.get(`/produtos/${perda.produto_id}`) : Promise.resolve(null)),
    [perda.produto_id]
  );
  const lotesDoProduto = detalheProdutoPerda.dados?.produto.lotes ?? [];

  const produtoDaSaida = useMemo(
    () => listaProdutos.find((produto) => produto.id === saida.produto_id) ?? null,
    [listaProdutos, saida.produto_id]
  );

  async function executar(acao, sucesso) {
    definirErro(null);
    definirMensagem(null);
    definirEnviando(true);
    try {
      const resultado = await acao();
      definirMensagem(sucesso(resultado));
      produtos.recarregar();
      movimentacoes.recarregar();
      detalheProdutoPerda.recarregar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  const registrarEntrada = (evento) => {
    evento.preventDefault();
    return executar(
      () =>
        api.estoque.post("/lotes", {
          produto_id: entrada.produto_id,
          numero_lote: entrada.numero_lote.trim(),
          quantidade: Number(entrada.quantidade),
          data_validade: entrada.data_validade,
        }),
      (resposta) =>
        `Lote ${resposta.lote.numero_lote} registrado. Saldo do lote: ${formatarNumero(
          resposta.lote.quantidade
        )}.`
    ).then(() => definirEntrada({ ...entrada, numero_lote: "", quantidade: "", data_validade: "" }));
  };

  const registrarSaida = (evento) => {
    evento.preventDefault();
    return executar(
      () =>
        api.estoque.post("/movimentacoes", {
          produto_id: saida.produto_id,
          tipo: TIPO_MOVIMENTACAO.SAIDA,
          quantidade: Number(saida.quantidade),
          motivo: saida.motivo,
        }),
      (resposta) => {
        const lotes = resposta.saida.lotes
          .map((lote) => `${lote.numero_lote} (${lote.quantidade})`)
          .join(", ");
        return `Saída registrada por FEFO nos lotes: ${lotes}.`;
      }
    ).then(() => definirSaida({ ...saida, quantidade: "" }));
  };

  const registrarPerda = (evento) => {
    evento.preventDefault();
    return executar(
      () =>
        api.estoque.post("/movimentacoes", {
          produto_id: perda.produto_id,
          lote_id: perda.lote_id,
          tipo: TIPO_MOVIMENTACAO.PERDA,
          quantidade: Number(perda.quantidade),
          motivo: perda.motivo,
        }),
      (resposta) =>
        `Perda registrada. Saldo do lote: ${formatarNumero(resposta.lote.quantidade_atual)}.`
    ).then(() => definirPerda({ ...perda, quantidade: "", motivo: "" }));
  };

  const ABAS = [
    { chave: "entrada", rotulo: "Entrada de lote", icone: PackagePlus },
    { chave: "saida", rotulo: "Saída de produto", icone: PackageMinus },
    { chave: "perda", rotulo: "Perda ou avaria", icone: PackageMinus },
  ];

  return (
    <>
      <TituloPagina
        titulo="Entradas e saídas"
        descricao="Toda movimentação grava usuário, motivo e lote para auditoria."
        acoes={
          <ExportarRelatorio
            servico="estoque"
            caminho="/relatorios/movimentacoes"
            titulo="Exportar movimentações"
            descricao="Entradas, saídas, ajustes, perdas e devoluções do período."
          />
        }
      />

      <div className="grid grid-cols-[440px_1fr] gap-6">
        <Card>
          <div className="flex gap-1 border-b border-borda px-3 py-3">
            {ABAS.map((item) => (
              <button
                key={item.chave}
                type="button"
                onClick={() => {
                  definirAba(item.chave);
                  definirMensagem(null);
                  definirErro(null);
                }}
                className={[
                  "flex items-center gap-2 rounded-botao px-3 py-2 text-rotulo transition-colors",
                  aba === item.chave
                    ? "bg-primario text-white"
                    : "text-secundario hover:bg-borda/60",
                ].join(" ")}
              >
                <item.icone size={16} aria-hidden="true" />
                {item.rotulo}
              </button>
            ))}
          </div>

          <CardCorpo>
            {produtos.carregando ? <Carregando texto="Carregando produtos" /> : null}
            {produtos.erro ? <Aviso tom="erro">{produtos.erro.message}</Aviso> : null}

            {produtos.dados && aba === "entrada" ? (
              <form onSubmit={registrarEntrada} className="space-y-4">
                <SeletorProduto
                  produtos={listaProdutos}
                  valor={entrada.produto_id}
                  aoMudar={(valor) => definirEntrada({ ...entrada, produto_id: valor })}
                />
                <CampoTexto
                  rotulo="Número do lote"
                  required
                  value={entrada.numero_lote}
                  onChange={(evento) =>
                    definirEntrada({ ...entrada, numero_lote: evento.target.value })
                  }
                  placeholder="Ex: L2026-0142"
                />
                <CampoTexto
                  rotulo="Quantidade"
                  type="number"
                  min="1"
                  required
                  value={entrada.quantidade}
                  onChange={(evento) =>
                    definirEntrada({ ...entrada, quantidade: evento.target.value })
                  }
                />
                <CampoTexto
                  rotulo="Data de validade"
                  type="date"
                  required
                  min={hojeISO()}
                  value={entrada.data_validade}
                  onChange={(evento) =>
                    definirEntrada({ ...entrada, data_validade: evento.target.value })
                  }
                  ajuda="Lote já vencido não entra no estoque."
                />
                <Botao type="submit" className="w-full" disabled={enviando}>
                  {enviando ? "Registrando" : "Registrar entrada"}
                </Botao>
              </form>
            ) : null}

            {produtos.dados && aba === "saida" ? (
              <form onSubmit={registrarSaida} className="space-y-4">
                <SeletorProduto
                  produtos={listaProdutos}
                  valor={saida.produto_id}
                  aoMudar={(valor) => definirSaida({ ...saida, produto_id: valor })}
                />
                {produtoDaSaida ? (
                  <p className="text-rotulo text-secundario">
                    Saldo disponível: {formatarNumero(produtoDaSaida.quantidade_atual)}{" "}
                    {produtoDaSaida.unidade_venda}. A baixa segue FEFO — primeiro a vencer, primeiro
                    a sair.
                  </p>
                ) : null}
                <CampoTexto
                  rotulo="Quantidade"
                  type="number"
                  min="1"
                  required
                  value={saida.quantidade}
                  onChange={(evento) => definirSaida({ ...saida, quantidade: evento.target.value })}
                />
                <CampoSelect
                  rotulo="Motivo"
                  value={saida.motivo}
                  onChange={(evento) => definirSaida({ ...saida, motivo: evento.target.value })}
                  opcoes={MOTIVOS_SAIDA.map((motivo) => ({ valor: motivo, rotulo: motivo }))}
                  ajuda="Venda ao cliente sai pelo ponto de venda, não por aqui."
                />
                <Botao type="submit" className="w-full" disabled={enviando}>
                  {enviando ? "Registrando" : "Registrar saída"}
                </Botao>
              </form>
            ) : null}

            {produtos.dados && aba === "perda" ? (
              <form onSubmit={registrarPerda} className="space-y-4">
                <SeletorProduto
                  produtos={listaProdutos}
                  valor={perda.produto_id}
                  aoMudar={(valor) => definirPerda({ ...perda, produto_id: valor, lote_id: "" })}
                />
                <CampoSelect
                  rotulo="Lote"
                  required
                  value={perda.lote_id}
                  onChange={(evento) => definirPerda({ ...perda, lote_id: evento.target.value })}
                  opcoes={[
                    { valor: "", rotulo: perda.produto_id ? "Selecione o lote" : "Escolha o produto" },
                    ...lotesDoProduto.map((lote) => ({
                      valor: lote.id,
                      rotulo: `${lote.numero_lote} — saldo ${lote.quantidade}${
                        lote.vencido ? " (vencido)" : ""
                      }`,
                    })),
                  ]}
                  ajuda="A perda é sempre de um lote específico."
                />
                <CampoTexto
                  rotulo="Quantidade"
                  type="number"
                  min="1"
                  required
                  value={perda.quantidade}
                  onChange={(evento) => definirPerda({ ...perda, quantidade: evento.target.value })}
                />
                <CampoTexto
                  rotulo="Justificativa"
                  required
                  value={perda.motivo}
                  onChange={(evento) => definirPerda({ ...perda, motivo: evento.target.value })}
                  placeholder="Ex: frasco quebrado no transporte"
                  ajuda="Obrigatória: fica no registro de auditoria."
                />
                <Botao type="submit" variante="destrutivo" className="w-full" disabled={enviando}>
                  {enviando ? "Registrando" : "Registrar perda"}
                </Botao>
              </form>
            ) : null}

            {mensagem ? (
              <Aviso tom="sucesso" className="mt-4">
                {mensagem}
              </Aviso>
            ) : null}
            {erro ? (
              <Aviso tom="erro" className="mt-4">
                {erro}
              </Aviso>
            ) : null}
          </CardCorpo>
        </Card>

        <Card>
          <CardCabecalho
            titulo="Auditoria de movimentações"
            descricao="Últimos 60 lançamentos, do mais recente para o mais antigo."
            icone={ArrowLeftRight}
          />
          {movimentacoes.carregando ? <Carregando /> : null}
          {movimentacoes.erro ? (
            <div className="px-5 py-4">
              <Aviso tom="erro">{movimentacoes.erro.message}</Aviso>
            </div>
          ) : null}
          {movimentacoes.dados ? (
            <Tabela
              colunas={[
                {
                  chave: "criado_em",
                  titulo: "Quando",
                  renderizar: (m) => formatarDataHora(m.criado_em),
                },
                { chave: "produto_nome", titulo: "Produto" },
                {
                  chave: "tipo",
                  titulo: "Tipo",
                  renderizar: (m) => <Badge tom={TOM_TIPO[m.tipo] ?? "neutro"}>{m.tipo}</Badge>,
                },
                {
                  chave: "quantidade",
                  titulo: "Qtd.",
                  alinhamento: "direita",
                  renderizar: (m) => formatarNumero(m.quantidade),
                },
                { chave: "motivo", titulo: "Motivo", renderizar: (m) => m.motivo || "—" },
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
