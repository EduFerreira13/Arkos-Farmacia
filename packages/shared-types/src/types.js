/**
 * Contratos de dados trafegados entre frontend e serviços.
 * Ref: docs/MODELO-DADOS.md e docs/API-CONTRATOS.md
 *
 * São typedefs JSDoc (sem runtime): documentação viva e autocomplete no
 * editor, sem obrigar build de TypeScript dentro de cada serviço.
 */

/**
 * @typedef {Object} Perfil
 * @property {string} id
 * @property {string} nome
 * @property {Record<string, unknown>} permissoes
 */

/**
 * @typedef {Object} Usuario
 * @property {string} id
 * @property {string} nome
 * @property {string} email
 * @property {string} perfil Nome do perfil (ver PERFIS)
 * @property {Record<string, unknown>} [permissoes]
 * @property {boolean} [ativo]
 * @property {string} [criado_em]
 */

/**
 * @typedef {Object} RespostaLogin
 * @property {string} token
 * @property {Usuario} usuario
 */

/**
 * @typedef {Object} Categoria
 * @property {string} id
 * @property {string} nome
 */

/**
 * @typedef {Object} Fornecedor
 * @property {string} id
 * @property {string} nome
 * @property {string} [cnpj]
 * @property {string} [telefone]
 * @property {string} [email]
 */

/**
 * @typedef {Object} Produto
 * @property {string} id
 * @property {string} nome
 * @property {string} [principio_ativo]
 * @property {string} [codigo_barras]
 * @property {string} tipo_controle Ver TIPO_CONTROLE
 * @property {number} preco_custo
 * @property {number} preco_venda
 * @property {number} estoque_minimo
 * @property {string} [categoria_id]
 * @property {string} [categoria_nome]
 * @property {string} [fornecedor_id]
 * @property {string} [fornecedor_nome]
 * @property {number} [quantidade_atual] Soma dos lotes válidos (calculado)
 * @property {Lote[]} [lotes]
 */

/**
 * @typedef {Object} Lote
 * @property {string} id
 * @property {string} produto_id
 * @property {string} numero_lote
 * @property {number} quantidade
 * @property {string} data_validade ISO date (YYYY-MM-DD)
 * @property {string} data_entrada
 */

/**
 * @typedef {Object} MovimentacaoEstoque
 * @property {string} id
 * @property {string} produto_id
 * @property {string} [lote_id]
 * @property {string} tipo Ver TIPO_MOVIMENTACAO
 * @property {number} quantidade
 * @property {string} [motivo]
 * @property {string} usuario_id
 * @property {string} criado_em
 */

/**
 * @typedef {Object} ItemVenda
 * @property {string} id
 * @property {string} venda_id
 * @property {string} produto_id
 * @property {string} lote_id
 * @property {number} quantidade
 * @property {number} preco_unitario
 * @property {string} [produto_nome]
 * @property {string} [tipo_controle]
 */

/**
 * @typedef {Object} Pagamento
 * @property {string} id
 * @property {string} venda_id
 * @property {string} forma_pagamento Ver FORMA_PAGAMENTO
 * @property {number} valor
 */

/**
 * @typedef {Object} Receita
 * @property {string} id
 * @property {string} venda_id
 * @property {string} medico_nome
 * @property {string} medico_crm
 * @property {string} paciente_nome
 * @property {string} data_emissao
 */

/**
 * @typedef {Object} Venda
 * @property {string} id
 * @property {string} usuario_id
 * @property {string} status Ver STATUS_VENDA
 * @property {number} valor_total
 * @property {number} desconto
 * @property {string} [motivo_cancelamento]
 * @property {string} criado_em
 * @property {ItemVenda[]} [itens]
 * @property {Pagamento[]} [pagamentos]
 * @property {Receita|null} [receita]
 */

/**
 * @typedef {Object} Caixa
 * @property {string} id
 * @property {string} usuario_id
 * @property {number} valor_abertura
 * @property {number} [valor_fechamento_esperado]
 * @property {number} [valor_fechamento_contado]
 * @property {string} aberto_em
 * @property {string} [fechado_em]
 */

/**
 * @typedef {Object} MovimentacaoCaixa
 * @property {string} id
 * @property {string} caixa_id
 * @property {string} tipo entrada | saida
 * @property {number} valor
 * @property {string} origem venda | lancamento_manual
 * @property {string} criado_em
 */

/**
 * @typedef {Object} ContaPagar
 * @property {string} id
 * @property {string} [fornecedor_id]
 * @property {string} descricao
 * @property {number} valor
 * @property {string} vencimento
 * @property {string} status
 * @property {string} [pago_em]
 */

/**
 * @typedef {Object} ContaReceber
 * @property {string} id
 * @property {string} origem
 * @property {string} descricao
 * @property {number} valor
 * @property {string} vencimento
 * @property {string} status
 * @property {string} [recebido_em]
 */

/**
 * @typedef {Object} NotaFiscal
 * @property {string} id
 * @property {string} venda_id
 * @property {string} [chave_acesso]
 * @property {string} status
 * @property {string} [xml_url]
 * @property {string} emitida_em
 */

/**
 * @typedef {Object} IndicadorDashboard
 * @property {number} valor
 * @property {number} [quantidade]
 * @property {number|null} [variacao_pct] Variação vs. período anterior
 */

/**
 * @typedef {Object} IndicadoresDashboard
 * @property {IndicadorDashboard} vendas_hoje
 * @property {IndicadorDashboard} produtos_a_vencer
 * @property {IndicadorDashboard} estoque_baixo
 * @property {IndicadorDashboard} ticket_medio
 */

export {};
