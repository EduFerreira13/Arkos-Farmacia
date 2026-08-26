/**
 * Valores fechados usados pelos serviços e pelo frontend.
 * Espelham os ENUMs das migrations em database/migrations.
 * Ref: docs/MODELO-DADOS.md
 */

/** Perfis de acesso (docs/REGRAS-NEGOCIO.md §6). */
export const PERFIS = {
  OPERADOR_CAIXA: "operador_caixa",
  FARMACEUTICO: "farmaceutico",
  GERENTE: "gerente",
  ADMINISTRADOR: "administrador",
};

export const PERFIS_LISTA = Object.values(PERFIS);

/** Rótulos de exibição na interface (sem emoji — docs/REGRAS-VISUAIS.md §5). */
export const PERFIL_LABEL = {
  [PERFIS.OPERADOR_CAIXA]: "Operador de caixa",
  [PERFIS.FARMACEUTICO]: "Farmacêutico responsável",
  [PERFIS.GERENTE]: "Gerente",
  [PERFIS.ADMINISTRADOR]: "Administrador",
};

/** estoque.tipo_controle — define se o item exige receita na venda. */
export const TIPO_CONTROLE = {
  LIVRE: "livre",
  TARJA_VERMELHA: "tarja_vermelha",
  TARJA_PRETA: "tarja_preta",
};

export const TIPO_CONTROLE_LISTA = Object.values(TIPO_CONTROLE);

export const TIPO_CONTROLE_LABEL = {
  [TIPO_CONTROLE.LIVRE]: "Venda livre",
  [TIPO_CONTROLE.TARJA_VERMELHA]: "Tarja vermelha",
  [TIPO_CONTROLE.TARJA_PRETA]: "Tarja preta",
};

/**
 * Regra dura (docs/REGRAS-NEGOCIO.md §3 e §8): item com tipo_controle
 * diferente de `livre` só pode ser vendido com receita vinculada.
 * @param {string} tipoControle
 * @returns {boolean}
 */
export function exigeReceita(tipoControle) {
  return tipoControle !== TIPO_CONTROLE.LIVRE;
}

/** estoque.tipo_movimentacao. */
export const TIPO_MOVIMENTACAO = {
  ENTRADA: "entrada",
  SAIDA: "saida",
  AJUSTE: "ajuste",
  PERDA: "perda",
  DEVOLUCAO: "devolucao",
};

export const TIPO_MOVIMENTACAO_LISTA = Object.values(TIPO_MOVIMENTACAO);

/** vendas.status_venda. */
export const STATUS_VENDA = {
  ABERTA: "aberta",
  FINALIZADA: "finalizada",
  CANCELADA: "cancelada",
};

/**
 * vendas.vendas.categoria_cancelamento — motivo em lista fechada. O texto livre
 * continua sendo pedido, mas é a categoria que permite agrupar no relatório
 * ("quantas vendas viraram orçamento no mês?").
 */
export const CATEGORIA_CANCELAMENTO = {
  COMPRA_ERRADA: "compra_errada",
  PAGAMENTO_ERRADO: "pagamento_errado",
  ORCAMENTO: "orcamento",
  DESISTENCIA: "desistencia",
  ITEM_ERRADO: "item_errado",
  OUTRO: "outro",
};

export const CATEGORIA_CANCELAMENTO_LISTA = Object.values(CATEGORIA_CANCELAMENTO);

export const CATEGORIA_CANCELAMENTO_LABEL = {
  [CATEGORIA_CANCELAMENTO.COMPRA_ERRADA]: "Compra errada",
  [CATEGORIA_CANCELAMENTO.PAGAMENTO_ERRADO]: "Pagamento errado",
  [CATEGORIA_CANCELAMENTO.ORCAMENTO]: "Era só orçamento",
  [CATEGORIA_CANCELAMENTO.DESISTENCIA]: "Cliente desistiu",
  [CATEGORIA_CANCELAMENTO.ITEM_ERRADO]: "Item errado no carrinho",
  [CATEGORIA_CANCELAMENTO.OUTRO]: "Outro motivo",
};

/** vendas.pagamentos.forma_pagamento. */
export const FORMA_PAGAMENTO = {
  DINHEIRO: "dinheiro",
  CARTAO_DEBITO: "cartao_debito",
  CARTAO_CREDITO: "cartao_credito",
  PIX: "pix",
  CONVENIO: "convenio",
};

export const FORMA_PAGAMENTO_LISTA = Object.values(FORMA_PAGAMENTO);

export const FORMA_PAGAMENTO_LABEL = {
  [FORMA_PAGAMENTO.DINHEIRO]: "Dinheiro",
  [FORMA_PAGAMENTO.CARTAO_DEBITO]: "Cartão de débito",
  [FORMA_PAGAMENTO.CARTAO_CREDITO]: "Cartão de crédito",
  [FORMA_PAGAMENTO.PIX]: "Pix",
  [FORMA_PAGAMENTO.CONVENIO]: "Convênio",
};

/** financeiro.movimentacoes_caixa. */
export const TIPO_MOVIMENTACAO_CAIXA = { ENTRADA: "entrada", SAIDA: "saida" };

export const ORIGEM_MOVIMENTACAO_CAIXA = {
  VENDA: "venda",
  LANCAMENTO_MANUAL: "lancamento_manual",
};

/** financeiro.contas_pagar / contas_receber. */
export const STATUS_CONTA = {
  PENDENTE: "pendente",
  PAGO: "pago",
  RECEBIDO: "recebido",
  ATRASADO: "atrasado",
};

/** fiscal.notas_fiscais.status — no MVP sempre `simulado`. */
export const STATUS_NOTA_FISCAL = {
  SIMULADO: "simulado",
  EMITIDA: "emitida",
  ERRO: "erro",
};

/** Códigos no campo `erro` do corpo das respostas de erro das APIs. */
export const ERROS = {
  CREDENCIAIS_INVALIDAS: "credenciais_invalidas",
  NAO_AUTENTICADO: "nao_autenticado",
  SEM_PERMISSAO: "sem_permissao",
  NAO_ENCONTRADO: "nao_encontrado",
  DADOS_INVALIDOS: "dados_invalidos",
  RECEITA_OBRIGATORIA: "receita_obrigatoria",
  ESTOQUE_INSUFICIENTE: "estoque_insuficiente",
  PRODUTO_VENCIDO: "produto_vencido",
  DESCONTO_ACIMA_DO_LIMITE: "desconto_acima_do_limite",
  VENDA_JA_FINALIZADA: "venda_ja_finalizada",
  PAGAMENTO_INSUFICIENTE: "pagamento_insuficiente",
  CAIXA_JA_ABERTO: "caixa_ja_aberto",
  CAIXA_FECHADO: "caixa_fechado",
  FALHA_INTEGRACAO: "falha_integracao",
};
