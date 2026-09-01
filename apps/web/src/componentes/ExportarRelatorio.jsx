import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { baixarArquivo } from "../lib/api.js";
import { hojeISO } from "../lib/formato.js";
import { Botao } from "./Botao.jsx";
import { CampoSelect, CampoTexto } from "./Campos.jsx";
import { Modal } from "./Modal.jsx";
import { Aviso } from "./Superficies.jsx";

/** Primeiro dia do mês corrente, usado como início padrão do período. */
function inicioDoMes() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Botão de exportação de relatório em planilha (CSV que o Excel abre direto).
 *
 * O arquivo sai com o que está na tela: `parametros` são os filtros que a
 * página já aplicou, e vão junto na consulta. Sem isso, a pessoa filtra a
 * lista, exporta, e recebe de volta o catálogo inteiro.
 *
 * @param {Object} props
 * @param {"vendas"|"estoque"|"financeiro"|"compras"|"auth"} props.servico
 * @param {string} props.caminho rota do relatório no serviço
 * @param {string} props.titulo texto do modal
 * @param {string} [props.descricao]
 * @param {Record<string, unknown>} [props.parametros] filtros aplicados na tela
 * @param {string[]} [props.resumoDosFiltros] o que está filtrado, em texto
 * @param {boolean} [props.comPeriodo] quando falso, exporta a posição atual
 * @param {{ nome: string, rotulo: string, opcoes: {valor: string, rotulo: string}[] }} [props.modelo]
 *   seletor extra virado em parâmetro de query (ex: agrupar, tipo)
 * @param {boolean} [props.comXlsx] oferece Excel além do CSV (só onde a rota gera)
 * @param {{de: string, ate: string}} [props.periodoInicial] datas já escolhidas na tela
 * @param {string} [props.rotulo] texto do botão
 */
export function ExportarRelatorio({
  servico,
  caminho,
  titulo,
  descricao,
  parametros,
  resumoDosFiltros = [],
  comPeriodo = true,
  comXlsx = false,
  periodoInicial,
  modelo,
  rotulo = "Exportar",
}) {
  const [aberto, definirAberto] = useState(false);
  const [de, definirDe] = useState(periodoInicial?.de ?? inicioDoMes());
  const [ate, definirAte] = useState(periodoInicial?.ate ?? hojeISO());
  // O Excel é o padrão onde existe: é o único que separa os dados do resumo em
  // abas diferentes. O CSV fica para quem vai importar em outro sistema.
  const [formato, definirFormato] = useState(comXlsx ? "xlsx" : "csv");
  const [escolhaModelo, definirEscolhaModelo] = useState(modelo?.opcoes[0]?.valor ?? "");
  const [erro, definirErro] = useState(null);
  const [baixando, definirBaixando] = useState(false);
  const [pronto, definirPronto] = useState(null);

  async function exportar() {
    definirErro(null);
    definirPronto(null);
    definirBaixando(true);
    try {
      const consulta = new URLSearchParams();

      // Filtros da tela primeiro: é o que define o recorte do arquivo.
      for (const [nome, valor] of Object.entries(parametros ?? {})) {
        if (valor === undefined || valor === null || valor === "") continue;
        consulta.set(nome, String(valor));
      }

      if (comPeriodo) {
        consulta.set("de", de);
        consulta.set("ate", ate);
      }
      if (modelo && escolhaModelo) consulta.set(modelo.nome, escolhaModelo);
      if (comXlsx && formato === "xlsx") consulta.set("formato", "xlsx");

      // O caminho pode já trazer query (ex: ?tipo=pagar), então o separador varia.
      const texto = consulta.toString();
      const separador = caminho.includes("?") ? "&" : "?";
      const nome = await baixarArquivo(
        servico,
        texto ? `${caminho}${separador}${texto}` : caminho,
        "relatorio.csv"
      );
      definirPronto(nome);
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirBaixando(false);
    }
  }

  return (
    <>
      <Botao variante="secundario" icone={FileSpreadsheet} onClick={() => definirAberto(true)}>
        {rotulo}
      </Botao>

      {aberto ? (
        <Modal
          aberto
          titulo={titulo}
          descricao={descricao ?? "Gera uma planilha que o Excel abre direto."}
          aoFechar={() => definirAberto(false)}
          rodape={
            <>
              <Botao variante="secundario" onClick={() => definirAberto(false)}>
                Fechar
              </Botao>
              <Botao icone={Download} onClick={exportar} disabled={baixando}>
                {baixando ? "Gerando" : "Baixar planilha"}
              </Botao>
            </>
          }
        >
          <div className="space-y-4">
            {/* Deixa explícito que o arquivo herda o recorte da tela — evita a
                surpresa de filtrar por um fornecedor e receber todos. */}
            {resumoDosFiltros.length ? (
              <Aviso tom="info" titulo="A planilha sai com os filtros da tela">
                <ul className="mt-0.5 space-y-0.5">
                  {resumoDosFiltros.map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              </Aviso>
            ) : null}

            {comPeriodo ? (
              <div className="grid grid-cols-2 gap-4">
                <CampoTexto
                  rotulo="Do dia"
                  type="date"
                  value={de}
                  max={ate}
                  onChange={(evento) => definirDe(evento.target.value)}
                />
                <CampoTexto
                  rotulo="Até o dia"
                  type="date"
                  value={ate}
                  min={de}
                  max={hojeISO()}
                  onChange={(evento) => definirAte(evento.target.value)}
                />
              </div>
            ) : (
              <p className="text-corpo text-secundario">
                A planilha traz a posição de agora, sem recorte de período.
              </p>
            )}

            {comXlsx ? (
              <CampoSelect
                rotulo="Tipo de arquivo"
                value={formato}
                onChange={(evento) => definirFormato(evento.target.value)}
                opcoes={[
                  { valor: "xlsx", rotulo: "Excel (.xlsx) — com aba de resumo" },
                  { valor: "csv", rotulo: "CSV — texto separado por ponto e vírgula" },
                ]}
              />
            ) : null}

            {modelo ? (
              <CampoSelect
                rotulo={modelo.rotulo}
                value={escolhaModelo}
                onChange={(evento) => definirEscolhaModelo(evento.target.value)}
                opcoes={modelo.opcoes}
              />
            ) : null}

            {pronto ? <Aviso tom="sucesso">Planilha gerada: {pronto}</Aviso> : null}
            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
