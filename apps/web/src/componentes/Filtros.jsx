import { useEffect, useId, useState } from "react";
import { Search, X } from "lucide-react";
import { Botao } from "./Botao.jsx";

/**
 * Faixa de filtros no topo de uma lista: sempre logo abaixo do título e acima
 * da tabela, com a busca à esquerda. Como o desenho é o mesmo em clientes,
 * fornecedores, produtos, usuários, pedidos, perdas e inventário, ele mora aqui
 * em vez de ser recopiado sete vezes com espaçamentos ligeiramente diferentes.
 */
export function LinhaDeFiltros({ children, acoes }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-borda px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      {acoes ? <div className="flex items-end gap-2">{acoes}</div> : null}
    </div>
  );
}

/**
 * Barra de pesquisa. Filtra enquanto a pessoa digita, com uma pausa curta antes
 * de consultar o serviço — sem a pausa, uma busca de dez letras vira dez
 * requisições e a lista pisca a cada tecla.
 */
export function BarraDePesquisa({
  rotulo = "Pesquisar",
  valor,
  aoMudar,
  placeholder,
  className = "w-80",
  atraso = 300,
}) {
  const id = useId();
  const [texto, definirTexto] = useState(valor ?? "");

  // Mudança vinda de fora (limpar filtros) reflete no campo.
  useEffect(() => definirTexto(valor ?? ""), [valor]);

  useEffect(() => {
    if (texto === (valor ?? "")) return undefined;
    const relogio = setTimeout(() => aoMudar(texto), atraso);
    return () => clearTimeout(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, atraso]);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-rotulo text-secundario">
        {rotulo}
      </label>
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secundario"
        />
        <input
          id={id}
          type="search"
          value={texto}
          placeholder={placeholder}
          onChange={(evento) => definirTexto(evento.target.value)}
          className="h-10 w-full rounded-botao border border-borda bg-card pl-9 pr-3 text-corpo text-texto placeholder:text-secundario focus-visible:foco-arkos"
        />
      </div>
    </div>
  );
}

/** Botão de limpar, visível só quando há algo filtrado. */
export function LimparFiltros({ ativo, aoLimpar }) {
  if (!ativo) return null;
  return (
    <Botao variante="fantasma" icone={X} onClick={aoLimpar}>
      Limpar filtros
    </Botao>
  );
}
