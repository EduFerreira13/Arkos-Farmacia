/** Formatações de exibição — pt-BR em toda a interface. */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");

export function formatarMoeda(valor) {
  return moeda.format(Number(valor ?? 0));
}

export function formatarNumero(valor) {
  return inteiro.format(Number(valor ?? 0));
}

export function formatarPorcentagem(valor) {
  if (valor === null || valor === undefined) return "—";
  const numero = Number(valor);
  const sinal = numero > 0 ? "+" : "";
  return `${sinal}${numero.toFixed(1).replace(".", ",")}%`;
}

/** Data no formato YYYY-MM-DD (ou ISO) para DD/MM/AAAA, sem susto de fuso. */
export function formatarData(valor) {
  if (!valor) return "—";
  const apenasData = String(valor).slice(0, 10);
  const [ano, mes, dia] = apenasData.split("-");
  if (!ano || !mes || !dia) return String(valor);
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHora(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}
