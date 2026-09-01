import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

/**
 * Campo de escolha com busca — o `select` nativo não serve onde a lista tem
 * centenas de linhas, como o catálogo de produtos e a base de fornecedores:
 * quem monta um pedido sabe o nome do que quer, não a posição dele na lista.
 *
 * Cada opção é `{ valor, rotulo, detalhe }`: o rótulo é o que se procura, o
 * detalhe é a linha de apoio (saldo do produto, CNPJ do fornecedor) que aparece
 * abaixo dele. A busca também acha pelo detalhe, então dá para achar um
 * fornecedor digitando o CNPJ.
 */
export function CampoBusca({
  rotulo,
  opcoes = [],
  valor,
  aoEscolher,
  placeholder = "Digite para buscar",
  ajuda,
  erro,
  vazio = "Nada encontrado com esse termo.",
  className = "",
  required = false,
  disabled = false,
}) {
  const id = useId();
  const [aberto, definirAberto] = useState(false);
  const [termo, definirTermo] = useState("");
  const [destacado, definirDestacado] = useState(0);
  const envolventeRef = useRef(null);

  const escolhida = useMemo(
    () => opcoes.find((opcao) => opcao.valor === valor) ?? null,
    [opcoes, valor]
  );

  const filtradas = useMemo(() => {
    const busca = termo.trim().toLowerCase();
    if (!busca) return opcoes.slice(0, 50);
    return opcoes
      .filter((opcao) =>
        `${opcao.rotulo} ${opcao.detalhe ?? ""}`.toLowerCase().includes(busca)
      )
      .slice(0, 50);
  }, [opcoes, termo]);

  // Clique fora fecha a lista sem escolher nada.
  useEffect(() => {
    if (!aberto) return undefined;
    const aoClicar = (evento) => {
      if (!envolventeRef.current?.contains(evento.target)) definirAberto(false);
    };
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  useEffect(() => definirDestacado(0), [termo, aberto]);

  function escolher(opcao) {
    aoEscolher(opcao.valor, opcao);
    definirTermo("");
    definirAberto(false);
  }

  function aoTeclar(evento) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      definirAberto(true);
      definirDestacado((atual) => {
        const passo = evento.key === "ArrowDown" ? 1 : -1;
        const proximo = atual + passo;
        if (proximo < 0) return filtradas.length - 1;
        if (proximo >= filtradas.length) return 0;
        return proximo;
      });
      return;
    }
    if (evento.key === "Enter" && aberto) {
      // Dentro de um formulário, Enter escolheria e enviaria junto.
      evento.preventDefault();
      if (filtradas[destacado]) escolher(filtradas[destacado]);
      return;
    }
    if (evento.key === "Escape" && aberto) {
      evento.preventDefault();
      definirAberto(false);
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={envolventeRef}>
      {rotulo ? (
        <label htmlFor={id} className="text-rotulo text-secundario">
          {rotulo}
        </label>
      ) : null}

      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secundario"
        />

        <input
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required && !escolhida}
          // Fora de foco mostra a escolha; em foco, o que está sendo digitado.
          value={aberto ? termo : (escolhida?.rotulo ?? "")}
          placeholder={escolhida ? escolhida.rotulo : placeholder}
          onFocus={() => definirAberto(true)}
          onChange={(evento) => {
            definirTermo(evento.target.value);
            definirAberto(true);
          }}
          onKeyDown={aoTeclar}
          className={[
            "h-10 w-full rounded-botao border bg-card pl-9 pr-9 text-corpo text-texto",
            "placeholder:text-secundario focus-visible:foco-arkos",
            "disabled:bg-borda/40 disabled:text-secundario",
            erro ? "border-erro" : "border-borda",
          ].join(" ")}
        />

        {escolhida && !disabled ? (
          <button
            type="button"
            aria-label={`Limpar ${rotulo ?? "escolha"}`}
            onClick={() => {
              aoEscolher("", null);
              definirTermo("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-botao p-1 text-secundario hover:bg-borda/60 hover:text-texto focus-visible:foco-arkos"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}

        {aberto ? (
          <ul
            id={`${id}-lista`}
            role="listbox"
            className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-card border border-borda bg-card py-1 shadow-flutuante"
          >
            {filtradas.length ? (
              filtradas.map((opcao, posicao) => (
                <li key={opcao.valor}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opcao.valor === valor}
                    onMouseEnter={() => definirDestacado(posicao)}
                    onClick={() => escolher(opcao)}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                      posicao === destacado ? "bg-borda/60" : "",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-corpo text-texto">{opcao.rotulo}</span>
                      {opcao.detalhe ? (
                        <span className="block truncate text-rotulo text-secundario">
                          {opcao.detalhe}
                        </span>
                      ) : null}
                    </span>
                    {opcao.valor === valor ? (
                      <Check size={16} aria-hidden="true" className="shrink-0 text-primario" />
                    ) : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-corpo text-secundario">{vazio}</li>
            )}
          </ul>
        ) : null}
      </div>

      {erro ? (
        <span className="text-rotulo text-erro" role="alert">
          {erro}
        </span>
      ) : ajuda ? (
        <span className="text-rotulo text-secundario">{ajuda}</span>
      ) : null}
    </div>
  );
}
