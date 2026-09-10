import { useMemo, useState } from "react";
import { ScrollText, Send, Stethoscope } from "lucide-react";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { formatarData, formatarDataHora, formatarMoeda } from "../lib/formato.js";
import { Botao } from "../componentes/Botao.jsx";
import { CampoTexto } from "../componentes/Campos.jsx";
import { FiltroPeriodo, diasAtras } from "../componentes/FiltroPeriodo.jsx";
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

const PERIODO_INICIAL = { de: diasAtras(29), ate: diasAtras(0) };

/** Notas fiscais emitidas — NFC-e real via Focus NFe, em homologação (§7). */
export function FiscalNotas() {
  const [periodo, definirPeriodo] = useState(PERIODO_INICIAL);
  const consulta = useMemo(() => `?de=${periodo.de}&ate=${periodo.ate}`, [periodo]);
  const { dados, carregando, erro } = usarBusca(
    () => api.fiscal.get(`/notas-fiscais${consulta}`),
    [consulta]
  );

  return (
    <>
      <TituloPagina
        titulo="Notas fiscais"
        descricao="NFC-e (nota fiscal de consumidor eletrônica) emitida a cada venda finalizada."
      />

      <Aviso tom="info" className="mb-4" titulo="Emissão em homologação">
        Cada venda finalizada é transmitida de verdade à Focus NFe, no ambiente de homologação da
        SEFAZ. Uma nota com status &quot;erro&quot; não impede a venda — o motivo aparece na
        coluna Situação, para o operador corrigir o cadastro e pedir a emissão de novo.
      </Aviso>

      <Card>
        <div className="border-b border-borda px-5 py-4">
          <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />
        </div>

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
                chave: "emitida_em",
                titulo: "Emitida em",
                renderizar: (nota) => formatarDataHora(nota.emitida_em),
              },
              {
                chave: "venda_id",
                titulo: "Venda",
                renderizar: (nota) => nota.venda_id.slice(0, 8),
              },
              {
                chave: "chave_acesso",
                titulo: "Chave de acesso",
                renderizar: (nota) => (
                  <span className="font-mono text-rotulo">{nota.chave_acesso || "—"}</span>
                ),
              },
              {
                chave: "numero_serie",
                titulo: "Número/Série",
                renderizar: (nota) => (nota.numero ? `${nota.numero}/${nota.serie}` : "—"),
              },
              {
                chave: "cpf_nota",
                titulo: "CPF na nota",
                renderizar: (nota) => nota.cpf_nota || "—",
              },
              {
                chave: "status",
                titulo: "Situação",
                renderizar: (nota) =>
                  nota.status === "emitida" ? (
                    nota.url_consulta ? (
                      <a
                        href={nota.url_consulta}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex"
                      >
                        <Badge tom="sucesso">Emitida</Badge>
                      </a>
                    ) : (
                      <Badge tom="sucesso">Emitida</Badge>
                    )
                  ) : (
                    <Badge tom="erro">Erro</Badge>
                  ),
              },
              {
                chave: "mensagem_erro",
                titulo: "Detalhe",
                renderizar: (nota) => nota.mensagem_erro || "—",
              },
            ]}
            linhas={dados.notas}
            totais={
              dados.notas.length ? { __rotulo: `${dados.notas.length} nota(s) no período` } : null
            }
            chave={(nota) => nota.id}
            vazio={
              <EstadoVazio
                icone={ScrollText}
                titulo="Nenhuma nota no período"
                descricao="Cada venda finalizada gera uma nota automaticamente."
              />
            }
          />
        ) : null}
      </Card>
    </>
  );
}

/** Controlados para o SNGPC (Sistema Nacional de Gerenciamento de Produtos Controlados). */
export function FiscalControlados() {
  const [periodo, definirPeriodo] = useState(PERIODO_INICIAL);
  const [somentePendentes, definirSomentePendentes] = useState(false);
  const [selecionados, definirSelecionados] = useState({});
  const [mensagem, definirMensagem] = useState(null);
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    if (somentePendentes) query.set("pendentes", "sim");
    return query.toString();
  }, [periodo, somentePendentes]);

  const { dados, carregando, recarregar, erro: erroBusca } = usarBusca(
    () => api.fiscal.get(`/controlados-sngpc?${consulta}`),
    [consulta]
  );

  const registros = dados?.registros ?? [];
  const escolhidos = registros.filter((registro) => selecionados[registro.id]);

  async function enviar() {
    definirErro(null);
    definirMensagem(null);
    definirEnviando(true);
    try {
      const resposta = await api.fiscal.post("/controlados-sngpc/enviar", {
        ids: escolhidos.map((registro) => registro.id),
      });
      definirMensagem(`${resposta.enviados} registro(s) marcado(s) como enviado(s). ${resposta.aviso}`);
      definirSelecionados({});
      recarregar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Controlados (SNGPC)"
        descricao="SNGPC é o Sistema Nacional de Gerenciamento de Produtos Controlados, da Anvisa."
        acoes={
          <Botao
            icone={Send}
            disabled={!escolhidos.length || enviando}
            onClick={enviar}
          >
            Marcar como enviado ({escolhidos.length})
          </Botao>
        }
      />

      <Aviso tom="alerta" className="mb-4" titulo="Transmissão não integrada no MVP">
        Cada venda de controlado já gera o registro com a receita vinculada. Marcar como enviado
        anota a data para o controle interno da farmácia — não transmite nada à Anvisa.
      </Aviso>

      {mensagem ? (
        <Aviso tom="sucesso" className="mb-4">
          {mensagem}
        </Aviso>
      ) : null}
      {erro ? (
        <Aviso tom="erro" className="mb-4">
          {erro}
        </Aviso>
      ) : null}

      {dados?.totais ? (
        <div className="mb-4 grid grid-cols-3 gap-4">
          {[
            ["Registros no total", dados.totais.total],
            ["Já enviados", dados.totais.enviados],
            ["Pendentes de envio", dados.totais.pendentes],
          ].map(([rotulo, valor]) => (
            <Card key={rotulo}>
              <div className="px-5 py-4">
                <p className="text-rotulo text-secundario">{rotulo}</p>
                <p className="mt-1 text-h2 text-texto">{valor}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <div className="flex items-end gap-4 border-b border-borda px-5 py-4">
          <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />
          <label className="flex items-center gap-2 pb-2 text-corpo text-texto">
            <input
              type="checkbox"
              checked={somentePendentes}
              onChange={(evento) => definirSomentePendentes(evento.target.checked)}
              className="h-4 w-4 rounded border-borda text-primario focus-visible:foco-arkos"
            />
            Só os pendentes
          </label>
        </div>

        {carregando ? <Carregando /> : null}
        {erroBusca ? (
          <div className="px-5 py-4">
            <Aviso tom="erro">{erroBusca.message}</Aviso>
          </div>
        ) : null}

        {dados ? (
          <Tabela
            colunas={[
              {
                chave: "selecionado",
                titulo: "",
                largura: "48px",
                renderizar: (registro) =>
                  registro.enviado_anvisa ? null : (
                    <input
                      type="checkbox"
                      checked={Boolean(selecionados[registro.id])}
                      onChange={() =>
                        definirSelecionados((atual) => ({
                          ...atual,
                          [registro.id]: !atual[registro.id],
                        }))
                      }
                      aria-label="Selecionar registro para envio"
                      className="h-4 w-4 rounded border-borda text-primario focus-visible:foco-arkos"
                    />
                  ),
              },
              {
                chave: "criado_em",
                titulo: "Registrado em",
                renderizar: (registro) => formatarDataHora(registro.criado_em),
              },
              {
                chave: "venda_id",
                titulo: "Venda",
                renderizar: (registro) => registro.venda_id.slice(0, 8),
              },
              {
                chave: "receita_id",
                titulo: "Receita",
                renderizar: (registro) => registro.receita_id.slice(0, 8),
              },
              {
                chave: "enviado_anvisa",
                titulo: "Situação",
                renderizar: (registro) =>
                  registro.enviado_anvisa ? (
                    <Badge tom="sucesso">
                      Enviado {registro.enviado_em ? formatarData(registro.enviado_em) : ""}
                    </Badge>
                  ) : (
                    <Badge tom="alerta">Pendente</Badge>
                  ),
              },
            ]}
            linhas={registros}
            chave={(registro) => registro.id}
            vazio={
              <EstadoVazio
                icone={Stethoscope}
                titulo="Nenhum controlado no período"
                descricao="Toda venda de tarja vermelha ou preta entra aqui automaticamente."
              />
            }
          />
        ) : null}
      </Card>
    </>
  );
}

/** Receitas retidas: quem prescreveu, para quem, e o que saiu. */
export function FiscalReceitas() {
  const [periodo, definirPeriodo] = useState(PERIODO_INICIAL);
  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    if (buscaAplicada.trim()) query.set("busca", buscaAplicada.trim());
    return query.toString();
  }, [periodo, buscaAplicada]);

  const { dados, carregando, erro } = usarBusca(
    () => api.vendas.get(`/receitas?${consulta}`),
    [consulta]
  );

  return (
    <>
      <TituloPagina
        titulo="Receitas retidas"
        descricao="Receitas registradas nas vendas de medicamento controlado."
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4 border-b border-borda px-5 py-4">
          <FiltroPeriodo periodo={periodo} aoMudar={definirPeriodo} />
          <form
            className="flex items-end gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              definirBuscaAplicada(busca);
            }}
          >
            <CampoTexto
              rotulo="Paciente, médico ou registro no Conselho Regional de Medicina"
              className="w-80"
              value={busca}
              onChange={(evento) => definirBusca(evento.target.value)}
            />
            <button
              type="submit"
              className="h-10 rounded-botao border border-primario px-4 text-corpo text-primario hover:bg-primario/10 focus-visible:foco-arkos"
            >
              Buscar
            </button>
          </form>
        </div>

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
                chave: "vendido_em",
                titulo: "Venda",
                renderizar: (receita) => formatarDataHora(receita.vendido_em),
              },
              { chave: "paciente_nome", titulo: "Paciente" },
              {
                chave: "medico_nome",
                titulo: "Médico",
                renderizar: (receita) => `${receita.medico_nome} (${receita.medico_crm})`,
              },
              {
                chave: "data_emissao",
                titulo: "Emitida em",
                renderizar: (receita) => formatarData(receita.data_emissao),
              },
              {
                chave: "itens_controlados",
                titulo: "Itens controlados",
                renderizar: (receita) => receita.itens_controlados || "—",
              },
              {
                chave: "tipos_controle",
                titulo: "Tarja",
                renderizar: (receita) => (
                  <Badge tom={String(receita.tipos_controle).includes("preta") ? "erro" : "alerta"}>
                    {receita.tipos_controle}
                  </Badge>
                ),
              },
              {
                chave: "valor_total",
                titulo: "Valor da venda",
                alinhamento: "direita",
                renderizar: (receita) => formatarMoeda(receita.valor_total),
              },
            ]}
            linhas={dados.receitas}
            totais={
              dados.receitas.length
                ? { __rotulo: `${dados.receitas.length} receita(s) no período` }
                : null
            }
            chave={(receita) => receita.id}
            vazio={
              <EstadoVazio
                icone={ScrollText}
                titulo="Nenhuma receita no período"
                descricao="A receita é registrada no ponto de venda, na venda do controlado."
              />
            }
          />
        ) : null}
      </Card>
    </>
  );
}
