import { usarPreferencias } from "../lib/preferencias.jsx";

/**
 * Tabela que respeita a densidade escolhida pelo usuário (§4):
 * denso = linha ~36px / padding 8px; confortável = linha ~48px / padding 14px.
 */
export function Tabela({ colunas, linhas, chave, aoClicarLinha, vazio }) {
  const { densidade } = usarPreferencias();
  const denso = densidade === "denso";
  const paddingCelula = denso ? "px-3 py-2" : "px-4 py-3.5";
  const alturaLinha = denso ? "h-9" : "h-12";

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
      </table>
    </div>
  );
}
