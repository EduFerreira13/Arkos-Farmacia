import { FORMA_PAGAMENTO } from "@arkos/shared-types";
import { env } from "../../env.js";

/**
 * Monta o payload de `POST /v2/nfce` (Focus NFe) a partir dos dados reais da
 * venda. Ver docs/API-CONTRATOS.md (módulo fiscal) e a documentação oficial
 * (https://doc.focusnfe.com.br/reference/emitir_nfce).
 */

// Venda de balcão, sem frete, dentro do próprio estado, comprador presencial —
// é sempre esse o cenário no PDV da farmácia (não há venda por entrega no MVP).
const MODALIDADE_FRETE_SEM_FRETE = "9";
const LOCAL_DESTINO_INTERNA = "1";
const PRESENCA_COMPRADOR_PRESENCIAL = "1";
const INDICADOR_IE_NAO_CONTRIBUINTE = "9";
const NATUREZA_OPERACAO_PADRAO = "VENDA AO CONSUMIDOR";

// A farmácia opera pelo Simples Nacional e o cadastro de produto não tem um
// regime tributário próprio. Vira campo de configuração por produto se a
// farmácia sair do Simples.
const ICMS_ORIGEM_PADRAO = "0";

// CSOSN 102 (tributada pelo Simples Nacional, sem permissão de crédito) é o
// default do exemplo oficial da Focus NFe, mas não serve para todo CFOP: a
// SEFAZ rejeita ("CFOP não permitido para o CSOSN") quando o CFOP é de venda
// com ICMS já retido por substituição tributária (o fabricante recolhe antes
// — comum em farmácia) — aí o CSOSN correto é 500, não 102.
const CSOSN_ICMS_ST_RETIDO = "500";
const CSOSN_PADRAO = "102";

// 5405/6404: venda de mercadoria sujeita a ICMS-ST, na condição de
// contribuinte substituído (interna/interestadual).
const CFOPS_ICMS_ST_RETIDO = new Set(["5405", "6404"]);

/**
 * CSOSN do item a partir do CFOP — não é fixo: CFOP de venda com ICMS-ST já
 * retido exige um CSOSN diferente do restante do catálogo (ver comentário
 * acima). Demais CFOPs de venda comuns (5101, 5102, ...) usam o default.
 */
export function determinarCsosn(cfop) {
  return CFOPS_ICMS_ST_RETIDO.has(cfop) ? CSOSN_ICMS_ST_RETIDO : CSOSN_PADRAO;
}

/** vendas.pagamentos.forma_pagamento → tabela de formas de pagamento da NFC-e. */
const FORMA_PAGAMENTO_FOCUS = {
  [FORMA_PAGAMENTO.DINHEIRO]: "01",
  [FORMA_PAGAMENTO.CARTAO_CREDITO]: "03",
  [FORMA_PAGAMENTO.CARTAO_DEBITO]: "04",
  [FORMA_PAGAMENTO.PIX]: "17",
};
// Convênio (plano/farmácia popular) não tem código próprio na tabela da
// NFC-e — "99 Outros" é o mapeamento correto para o que não é dinheiro,
// cartão ou Pix.
const FORMA_PAGAMENTO_FOCUS_PADRAO = "99";

const valorMonetario = (valor) => Number(valor ?? 0).toFixed(2);

export function mapearFormaPagamento(formaPagamento) {
  return FORMA_PAGAMENTO_FOCUS[formaPagamento] ?? FORMA_PAGAMENTO_FOCUS_PADRAO;
}

/**
 * Data de emissão no fuso do negócio (`TZ_NEGOCIO`), com offset numérico
 * (`-03:00`) — a Focus NFe recusa a nota se a diferença para o horário atual
 * passar de 5 minutos, então isto tem que refletir a hora local de verdade,
 * não a do relógio do servidor (que pode estar em UTC).
 */
export function dataEmissaoAgora(agora = new Date(), timeZone = env.TZ_NEGOCIO) {
  const partesData = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(agora)
    .reduce((acumulado, parte) => ({ ...acumulado, [parte.type]: parte.value }), {});

  // Offset = diferença entre a hora local (nesse fuso) e a mesma marca em UTC.
  const comoUtc = Date.UTC(
    Number(partesData.year),
    Number(partesData.month) - 1,
    Number(partesData.day),
    Number(partesData.hour),
    Number(partesData.minute),
    Number(partesData.second)
  );
  const offsetMinutos = Math.round((comoUtc - agora.getTime()) / 60000);
  const sinal = offsetMinutos >= 0 ? "+" : "-";
  const offsetAbs = Math.abs(offsetMinutos);
  const horasOffset = String(Math.floor(offsetAbs / 60)).padStart(2, "0");
  const minutosOffset = String(offsetAbs % 60).padStart(2, "0");

  return (
    `${partesData.year}-${partesData.month}-${partesData.day}` +
    `T${partesData.hour}:${partesData.minute}:${partesData.second}` +
    `${sinal}${horasOffset}:${minutosOffset}`
  );
}

/**
 * @param {object} item Item da venda enriquecido com o dado fiscal do produto
 *   (ncm, cfop, codigo, unidade_venda — ver servicos.js) — quem chama já
 *   validou que ncm e cfop existem.
 */
export function montarItemNfce(item, numeroItem) {
  const unidade = item.unidade_venda || "un";
  return {
    numero_item: String(numeroItem),
    codigo_produto: item.codigo || item.produto_id,
    descricao: item.produto_nome,
    codigo_ncm: item.ncm,
    cfop: item.cfop,
    quantidade_comercial: valorMonetario(item.quantidade),
    quantidade_tributavel: valorMonetario(item.quantidade),
    unidade_comercial: unidade,
    unidade_tributavel: unidade,
    valor_unitario_comercial: valorMonetario(item.preco_unitario),
    valor_unitario_tributavel: valorMonetario(item.preco_unitario),
    valor_desconto: valorMonetario(item.desconto),
    icms_origem: ICMS_ORIGEM_PADRAO,
    icms_situacao_tributaria: determinarCsosn(item.cfop),
    valor_total_tributos: "0.00",
  };
}

/**
 * @param {object} dados
 * @param {object[]} dados.itens Itens da venda já enriquecidos (ver montarItemNfce)
 * @param {object[]} dados.pagamentos `vendas.pagamentos` da venda (forma_pagamento, valor)
 * @param {string|null} [dados.cpfNota] CPF opcional, só a pedido do cliente (LGPD)
 */
export function montarPayloadNfce({ itens, pagamentos, cpfNota }) {
  const cpfSomenteDigitos = (cpfNota ?? "").replace(/\D/g, "");

  return {
    cnpj_emitente: (env.FARMACIA.cnpj || "").replace(/\D/g, ""),
    data_emissao: dataEmissaoAgora(),
    natureza_operacao: NATUREZA_OPERACAO_PADRAO,
    presenca_comprador: PRESENCA_COMPRADOR_PRESENCIAL,
    modalidade_frete: MODALIDADE_FRETE_SEM_FRETE,
    local_destino: LOCAL_DESTINO_INTERNA,
    indicador_inscricao_estadual_destinatario: INDICADOR_IE_NAO_CONTRIBUINTE,
    // Cliente sem CPF na nota é o padrão (LGPD, minimização de dados) — a NFC-e
    // aceita consumidor não identificado.
    ...(cpfSomenteDigitos.length === 11 ? { cpf_destinatario: cpfSomenteDigitos } : {}),
    items: itens.map((item, indice) => montarItemNfce(item, indice + 1)),
    formas_pagamento: pagamentos.map((pagamento) => ({
      forma_pagamento: mapearFormaPagamento(pagamento.forma_pagamento),
      valor_pagamento: valorMonetario(pagamento.valor),
    })),
  };
}
