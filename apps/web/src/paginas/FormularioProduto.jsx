import { useState } from "react";
import { TIPO_CONTROLE, TIPO_CONTROLE_LABEL, TIPO_CONTROLE_LISTA, exigeReceita } from "@arkos/shared-types";
import { api } from "../lib/api.js";
import { usarBusca } from "../lib/usarBusca.js";
import { Botao } from "../componentes/Botao.jsx";
import { CampoSelect, CampoTexto } from "../componentes/Campos.jsx";
import { Modal } from "../componentes/Modal.jsx";
import { Aviso, Carregando } from "../componentes/Superficies.jsx";

const INICIAL = {
  nome: "",
  principio_ativo: "",
  fabricante: "",
  classe_terapeutica: "",
  categoria_id: "",
  fornecedor_id: "",
  codigo_barras: "",
  unidade_venda: "unidade",
  tipo_controle: TIPO_CONTROLE.LIVRE,
  preco_custo: "",
  preco_venda: "",
  estoque_minimo: "0",
  ncm: "",
  cfop: "",
  venda_sob_encomenda: false,
};

/**
 * Cadastro e edição de produto — campos obrigatórios do §1 das regras de
 * negócio. Com `produto`, o formulário edita (PATCH) em vez de criar; mudança
 * de preço gera histórico no serviço de estoque (§8).
 */
export function FormularioProduto({ produto, aoFechar, aoSalvar }) {
  const edicao = Boolean(produto);
  const [campos, definirCampos] = useState(() =>
    produto
      ? {
          ...INICIAL,
          ...Object.fromEntries(
            Object.keys(INICIAL).map((campo) => [campo, produto[campo] ?? INICIAL[campo]])
          ),
          preco_custo: String(produto.preco_custo ?? ""),
          preco_venda: String(produto.preco_venda ?? ""),
          estoque_minimo: String(produto.estoque_minimo ?? "0"),
          venda_sob_encomenda: Boolean(produto.venda_sob_encomenda),
        }
      : INICIAL
  );
  const [erro, definirErro] = useState(null);
  const [enviando, definirEnviando] = useState(false);

  const auxiliares = usarBusca(
    () =>
      Promise.all([api.estoque.get("/categorias"), api.estoque.get("/fornecedores")]).then(
        ([categorias, fornecedores]) => ({
          categorias: categorias.categorias,
          fornecedores: fornecedores.fornecedores,
        })
      ),
    []
  );

  const controlado = exigeReceita(campos.tipo_controle);

  function atualizar(campo) {
    return (evento) => {
      const valor = evento.target.type === "checkbox" ? evento.target.checked : evento.target.value;
      definirCampos((atual) => ({ ...atual, [campo]: valor }));
    };
  }

  async function submeter(evento) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);
    try {
      const corpo = {
        ...campos,
        principio_ativo: campos.principio_ativo || null,
        classe_terapeutica: campos.classe_terapeutica || null,
        fornecedor_id: campos.fornecedor_id || null,
        ncm: campos.ncm || null,
        cfop: campos.cfop || null,
        preco_custo: Number(campos.preco_custo || 0),
        preco_venda: Number(campos.preco_venda || 0),
        estoque_minimo: Number(campos.estoque_minimo || 0),
      };

      if (edicao) await api.estoque.patch(`/produtos/${produto.id}`, corpo);
      else await api.estoque.post("/produtos", corpo);

      aoSalvar();
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      largura="max-w-3xl"
      titulo={edicao ? "Editar produto" : "Novo produto"}
      descricao={
        edicao
          ? "Alteração de preço fica registrada no histórico do produto."
          : "Campos marcados são obrigatórios pelas regras de negócio da farmácia."
      }
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="formulario-produto" disabled={enviando}>
            {enviando ? "Salvando" : edicao ? "Salvar alterações" : "Salvar produto"}
          </Botao>
        </>
      }
    >
      {auxiliares.carregando ? <Carregando texto="Carregando cadastros" /> : null}

      {auxiliares.dados ? (
        <form id="formulario-produto" onSubmit={submeter} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CampoTexto rotulo="Nome do produto" required value={campos.nome} onChange={atualizar("nome")} />
            <CampoTexto
              rotulo="Fabricante"
              required
              value={campos.fabricante}
              onChange={atualizar("fabricante")}
            />
            <CampoSelect
              rotulo="Categoria"
              required
              value={campos.categoria_id}
              onChange={atualizar("categoria_id")}
              opcoes={[
                { valor: "", rotulo: "Selecione" },
                ...auxiliares.dados.categorias.map((c) => ({ valor: c.id, rotulo: c.nome })),
              ]}
            />
            <CampoSelect
              rotulo="Fornecedor"
              value={campos.fornecedor_id}
              onChange={atualizar("fornecedor_id")}
              opcoes={[
                { valor: "", rotulo: "Sem fornecedor definido" },
                ...auxiliares.dados.fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
              ]}
            />
            <CampoTexto
              rotulo="Código de barras (EAN)"
              ajuda="EAN é o padrão internacional de código de barras"
              required
              value={campos.codigo_barras}
              onChange={atualizar("codigo_barras")}
            />
            <CampoSelect
              rotulo="Unidade de venda"
              value={campos.unidade_venda}
              onChange={atualizar("unidade_venda")}
              opcoes={[
                { valor: "unidade", rotulo: "Unidade" },
                { valor: "caixa", rotulo: "Caixa" },
                { valor: "frasco", rotulo: "Frasco" },
              ]}
            />
            <CampoSelect
              rotulo="Tipo de controle"
              value={campos.tipo_controle}
              onChange={atualizar("tipo_controle")}
              opcoes={TIPO_CONTROLE_LISTA.map((tipo) => ({
                valor: tipo,
                rotulo: TIPO_CONTROLE_LABEL[tipo],
              }))}
            />
            <CampoTexto
              rotulo={controlado ? "Princípio ativo (obrigatório)" : "Princípio ativo"}
              required={controlado}
              value={campos.principio_ativo}
              onChange={atualizar("principio_ativo")}
            />
            {controlado ? (
              <CampoTexto
                rotulo="Classe terapêutica (obrigatório)"
                required
                ajuda="Ex: psicotrópico, antibiótico, tarja preta"
                value={campos.classe_terapeutica}
                onChange={atualizar("classe_terapeutica")}
              />
            ) : null}
            <CampoTexto
              rotulo="Preço de custo"
              type="number"
              step="0.01"
              min="0"
              value={campos.preco_custo}
              onChange={atualizar("preco_custo")}
            />
            <CampoTexto
              rotulo="Preço de venda"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={campos.preco_venda}
              onChange={atualizar("preco_venda")}
            />
            <CampoTexto
              rotulo="Estoque mínimo"
              type="number"
              min="0"
              value={campos.estoque_minimo}
              onChange={atualizar("estoque_minimo")}
            />
            <CampoTexto
              rotulo="NCM"
              ajuda="Nomenclatura Comum do Mercosul"
              value={campos.ncm}
              onChange={atualizar("ncm")}
            />
            <CampoTexto
              rotulo="CFOP"
              ajuda="Código Fiscal de Operações e Prestações"
              value={campos.cfop}
              onChange={atualizar("cfop")}
            />
          </div>

          <label className="flex items-center gap-2 text-corpo text-texto">
            <input
              type="checkbox"
              checked={campos.venda_sob_encomenda}
              onChange={atualizar("venda_sob_encomenda")}
              className="h-4 w-4 rounded border-borda text-primario focus-visible:foco-arkos"
            />
            Permitir venda sob encomenda (libera o ponto de venda mesmo sem estoque)
          </label>

          {controlado ? (
            <Aviso tom="alerta" titulo="Produto controlado">
              A venda deste item no ponto de venda só é concluída com os dados da receita
              registrados.
            </Aviso>
          ) : null}

          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </form>
      ) : null}

      {auxiliares.erro ? <Aviso tom="erro">{auxiliares.erro.message}</Aviso> : null}
    </Modal>
  );
}
