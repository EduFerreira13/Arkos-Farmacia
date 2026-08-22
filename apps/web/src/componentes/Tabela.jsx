/**
 * Tabela em densidade densa: linha ~36px, padding 8px (§4). A operação roda em
 * tela grande com muita linha por página, então essa é a densidade padrão e
 * única.
 */
export function Tabela({ colunas, linhas, chave, aoClicarLinha, vazio, totais }) {
  const paddingCelula = "px-3 py-2";
  const alturaLinha = "h-9";

  if (!linhas?.length) {
    return vazio ?? null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-corpo">
        <thead>
          <tr className="border-b border-borda text-left">
            {colunas.map((coluna) => (
              <th
                key={coluna.chave}
                scope="col"
                className={`${paddingCelula} text-rotulo uppercase tracking-wide text-secundario ${
                  coluna.alinhamento === "direita" ? "text-right" : ""
                }`}
                style={coluna.largura ? { width: coluna.largura } : undefined}
              >
                {coluna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => (
            <tr
              key={chave ? chave(linha) : indice}
              onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
              className={[
                alturaLinha,
                "border-b border-borda/70 last:border-b-0",
                aoClicarLinha ? "cursor-pointer hover:bg-borda/40" : "",
              ].join(" ")}
            >
              {colunas.map((coluna) => (
                <td
                  key={coluna.chave}
                  className={`${paddingCelula} text-texto ${
                    coluna.alinhamento === "direita" ? "text-right" : ""
                  }`}
                >
                  {coluna.renderizar ? coluna.renderizar(linha) : linha[coluna.chave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        {/* Linha de totais: o rótulo ocupa a primeira coluna e cada valor cai
            na coluna correspondente pela chave. */}
        {totais ? (
          <tfoot>
            <tr className={`${alturaLinha} border-t-2 border-borda bg-borda/30`}>
              {colunas.map((coluna, indice) => {
                const valor = totais[coluna.chave];
                const conteudo = indice === 0 ? (totais.__rotulo ?? "Total") : valor;
                return (
                  <td
                    key={coluna.chave}
                    className={`${paddingCelula} font-semibold text-texto ${
                      coluna.alinhamento === "direita" ? "text-right" : ""
                    }`}
                  >
                    {conteudo ?? ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
