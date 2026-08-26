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
 * @param {Object} props
 * @param {"vendas"|"estoque"|"financeiro"} props.servico
 * @param {string} props.caminho rota do relatório no serviço
 * @param {string} props.titulo texto do modal
 * @param {string} [props.descricao]
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
      const parametros = new URLSearchParams();
      if (comPeriodo) {
        parametros.set("de", de);
        parametros.set("ate", ate);
      }
      if (modelo && escolhaModelo) parametros.set(modelo.nome, escolhaModelo);
      if (comXlsx && formato === "xlsx") parametros.set("formato", "xlsx");

      // O caminho pode já trazer query (ex: ?tipo=pagar), então o separador varia.
      const consulta = parametros.toString();
      const separador = caminho.includes("?") ? "&" : "?";
      const nome = await baixarArquivo(
        servico,
        consulta ? `${caminho}${separador}${consulta}` : caminho,
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
                A planilha traz a posição de agora, com saldo, situação contra o estoque mínimo e
                valor em estoque.
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
