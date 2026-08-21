#!/usr/bin/env node
/**
 * Popula o banco de desenvolvimento com dados fictícios coerentes para navegar
 * pelo sistema: fornecedores, produtos (livres, tarja vermelha e tarja preta),
 * lotes com validades variadas, histórico de movimentação, vendas de hoje e de
 * ontem (com receita nos controlados), notas fiscais simuladas, caixa aberto,
 * caixa fechado de ontem e contas a pagar/receber.
 *
 * Uso: npm run seed:demo
 *
 * Atenção: LIMPA as tabelas de negócio antes de inserir (produtos, lotes,
 * vendas, caixa, contas, fiscal). Os usuários de `auth` são preservados.
 * É um seed de demonstração — nunca rodar contra produção.
 *
 * Consistência garantida pelo script:
 * - a quantidade de cada lote é o saldo atual; a movimentação de entrada é
 *   calculada como saldo + tudo que saiu dele (venda, perda, ajuste);
 * - cada venda finalizada tem itens, pagamentos que cobrem o total, saída de
 *   estoque no lote correspondente, nota fiscal e lançamento no caixa do turno;
 * - venda com item controlado sempre tem receita vinculada e registro de SNGPC.
 */

const path = require("path");
const { createHash } = require("crypto");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

// ---------------------------------------------------------------- fornecedores

const FORNECEDORES = [
  {
    chave: "panvel",
    nome: "Distribuidora Panvel Norte",
    cnpj: "12.345.678/0001-90",
    telefone: "(51) 3220-4400",
    email: "comercial@panvelnorte.com.br",
  },
  {
    chave: "farmalog",
    nome: "Farmalog Distribuicao de Medicamentos",
    cnpj: "98.765.432/0001-21",
    telefone: "(11) 4002-8922",
    email: "pedidos@farmalog.com.br",
  },
  {
    chave: "dermacenter",
    nome: "Dermacenter Cosmeticos",
    cnpj: "45.678.912/0001-33",
    telefone: "(11) 3773-1200",
    email: "vendas@dermacenter.com.br",
  },
  {
    chave: "medsupply",
    nome: "MedSupply Correlatos Hospitalares",
    cnpj: "33.222.111/0001-44",
    telefone: "(41) 3355-7800",
    email: "atendimento@medsupply.com.br",
  },
];

// -------------------------------------------------------------------- produtos

const MEDICAMENTO = "Medicamento";
const PERFUMARIA = "Perfumaria e Higiene";
const CORRELATOS = "Correlatos";

const PRODUTOS = [
  // Medicamentos de venda livre
  {
    chave: "dipirona",
    nome: "Dipirona Monoidratada 500mg 20 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "panvel",
    principio_ativo: "Dipirona monoidratada",
    fabricante: "Neo Quimica",
    tipo_controle: "livre",
    codigo_barras: "7891058001234",
    unidade_venda: "caixa",
    preco_custo: 4.2,
    preco_venda: 9.9,
    estoque_minimo: 15,
    ncm: "30049099",
    cfop: "5405",
  },
  {
    chave: "paracetamol",
    nome: "Paracetamol 750mg 20 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "panvel",
    principio_ativo: "Paracetamol",
    fabricante: "Medley",
    tipo_controle: "livre",
    codigo_barras: "7891058002941",
    unidade_venda: "caixa",
    preco_custo: 5.1,
    preco_venda: 11.5,
    estoque_minimo: 15,
    ncm: "30049069",
    cfop: "5405",
  },
  {
    chave: "ibuprofeno",
    nome: "Ibuprofeno 400mg 20 capsulas",
    categoria: MEDICAMENTO,
    fornecedor: "farmalog",
    principio_ativo: "Ibuprofeno",
    fabricante: "EMS",
    tipo_controle: "livre",
    codigo_barras: "7896004703121",
    unidade_venda: "caixa",
    preco_custo: 8.4,
    preco_venda: 17.9,
    estoque_minimo: 10,
    ncm: "30049099",
    cfop: "5405",
  },
  {
    chave: "omeprazol",
    nome: "Omeprazol 20mg 28 capsulas",
    categoria: MEDICAMENTO,
    fornecedor: "farmalog",
    principio_ativo: "Omeprazol",
    fabricante: "Medley",
    tipo_controle: "livre",
    codigo_barras: "7896422505598",
    unidade_venda: "caixa",
    preco_custo: 6.8,
    preco_venda: 14.9,
    estoque_minimo: 12,
    ncm: "30049069",
    cfop: "5405",
  },
  {
    chave: "losartana",
    nome: "Losartana Potassica 50mg 30 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "farmalog",
    principio_ativo: "Losartana potassica",
    fabricante: "EMS",
    tipo_controle: "livre",
    codigo_barras: "7896004712345",
    unidade_venda: "caixa",
    preco_custo: 7.5,
    preco_venda: 16.4,
    estoque_minimo: 20,
    ncm: "30049069",
    cfop: "5405",
  },
  {
    chave: "soro",
    nome: "Soro Fisiologico 0,9% 500ml",
    categoria: MEDICAMENTO,
    fornecedor: "medsupply",
    principio_ativo: "Cloreto de sodio",
    fabricante: "Fresenius Kabi",
    tipo_controle: "livre",
    codigo_barras: "7898040370015",
    unidade_venda: "frasco",
    preco_custo: 5.0,
    preco_venda: 9.5,
    estoque_minimo: 8,
    ncm: "30049099",
    cfop: "5405",
  },

  // Tarja vermelha — antibiotico e antidepressivo, receita retida
  {
    chave: "amoxicilina",
    nome: "Amoxicilina 500mg 21 capsulas",
    categoria: MEDICAMENTO,
    fornecedor: "panvel",
    principio_ativo: "Amoxicilina tri-hidratada",
    fabricante: "Prati-Donaduzzi",
    tipo_controle: "tarja_vermelha",
    classe_terapeutica: "Antibiotico",
    codigo_barras: "7896658201458",
    unidade_venda: "caixa",
    preco_custo: 18.0,
    preco_venda: 34.9,
    estoque_minimo: 8,
    ncm: "30041019",
    cfop: "5405",
  },
  {
    chave: "azitromicina",
    nome: "Azitromicina 500mg 5 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "panvel",
    principio_ativo: "Azitromicina di-hidratada",
    fabricante: "EMS",
    tipo_controle: "tarja_vermelha",
    classe_terapeutica: "Antibiotico",
    codigo_barras: "7896004709871",
    unidade_venda: "caixa",
    preco_custo: 22.0,
    preco_venda: 42.5,
    estoque_minimo: 6,
    ncm: "30042029",
    cfop: "5405",
  },
  {
    chave: "sertralina",
    nome: "Cloridrato de Sertralina 50mg 30 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "farmalog",
    principio_ativo: "Cloridrato de sertralina",
    fabricante: "Eurofarma",
    tipo_controle: "tarja_vermelha",
    classe_terapeutica: "Antidepressivo (lista C1)",
    codigo_barras: "7896016807765",
    unidade_venda: "caixa",
    preco_custo: 19.9,
    preco_venda: 38.4,
    estoque_minimo: 6,
    ncm: "30049069",
    cfop: "5405",
  },

  // Tarja preta — psicotropicos
  {
    chave: "clonazepam",
    nome: "Clonazepam 2mg 30 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "farmalog",
    principio_ativo: "Clonazepam",
    fabricante: "Prati-Donaduzzi",
    tipo_controle: "tarja_preta",
    classe_terapeutica: "Psicotropico (lista B1)",
    codigo_barras: "7896658203001",
    unidade_venda: "caixa",
    preco_custo: 12.0,
    preco_venda: 26.9,
    estoque_minimo: 5,
    ncm: "30049099",
    cfop: "5405",
  },
  {
    chave: "alprazolam",
    nome: "Alprazolam 1mg 30 comprimidos",
    categoria: MEDICAMENTO,
    fornecedor: "farmalog",
    principio_ativo: "Alprazolam",
    fabricante: "Eurofarma",
    tipo_controle: "tarja_preta",
    classe_terapeutica: "Ansiolitico (lista B1)",
    codigo_barras: "7896016801122",
    unidade_venda: "caixa",
    preco_custo: 15.5,
    preco_venda: 32.0,
    estoque_minimo: 5,
    ncm: "30049099",
    cfop: "5405",
  },

  // Perfumaria e higiene
  {
    chave: "protetor",
    nome: "Protetor Solar Fator 50 200ml",
    categoria: PERFUMARIA,
    fornecedor: "dermacenter",
    fabricante: "Dermacenter",
    tipo_controle: "livre",
    codigo_barras: "7899876500441",
    unidade_venda: "frasco",
    preco_custo: 32.0,
    preco_venda: 64.9,
    estoque_minimo: 6,
    ncm: "33049910",
    cfop: "5102",
  },
  {
    chave: "creme_dental",
    nome: "Creme Dental Protecao Total 90g",
    categoria: PERFUMARIA,
    fornecedor: "dermacenter",
    fabricante: "Colgate",
    tipo_controle: "livre",
    codigo_barras: "7891024132074",
    unidade_venda: "unidade",
    preco_custo: 4.9,
    preco_venda: 10.9,
    estoque_minimo: 12,
    ncm: "33061000",
    cfop: "5102",
  },
  {
    chave: "shampoo",
    nome: "Shampoo Anticaspa 200ml",
    categoria: PERFUMARIA,
    fornecedor: "dermacenter",
    fabricante: "Dermacenter",
    tipo_controle: "livre",
    codigo_barras: "7899876502018",
    unidade_venda: "frasco",
    preco_custo: 12.4,
    preco_venda: 27.5,
    estoque_minimo: 8,
    ncm: "33051000",
    cfop: "5102",
  },

  // Correlatos
  {
    chave: "termometro",
    nome: "Termometro Digital Axilar",
    categoria: CORRELATOS,
    fornecedor: "medsupply",
    fabricante: "G-Tech",
    tipo_controle: "livre",
    codigo_barras: "7898675400128",
    unidade_venda: "unidade",
    preco_custo: 18.9,
    preco_venda: 39.9,
    estoque_minimo: 4,
    ncm: "90251110",
    cfop: "5102",
  },
  {
    chave: "pressao",
    nome: "Aparelho de Pressao Digital de Braco",
    categoria: CORRELATOS,
    fornecedor: "medsupply",
    fabricante: "Omron",
    tipo_controle: "livre",
    codigo_barras: "7898675401231",
    unidade_venda: "unidade",
    preco_custo: 149.0,
    preco_venda: 289.9,
    estoque_minimo: 2,
    ncm: "90181910",
    cfop: "5102",
  },
  {
    chave: "mascara",
    nome: "Mascara Cirurgica Tripla caixa 50 unidades",
    categoria: CORRELATOS,
    fornecedor: "medsupply",
    fabricante: "Descarpack",
    tipo_controle: "livre",
    codigo_barras: "7898675403457",
    unidade_venda: "caixa",
    preco_custo: 14.0,
    preco_venda: 29.9,
    estoque_minimo: 5,
    ncm: "63079000",
    cfop: "5102",
  },
  {
    chave: "fralda",
    nome: "Fralda Geriatrica Tamanho G pacote 8 unidades",
    categoria: CORRELATOS,
    fornecedor: "medsupply",
    fabricante: "Bigfral",
    tipo_controle: "livre",
    codigo_barras: "7898675405116",
    unidade_venda: "pacote",
    preco_custo: 21.5,
    preco_venda: 42.9,
    estoque_minimo: 6,
    ncm: "96190000",
    cfop: "5102",
  },
];

/**
 * Lotes com o saldo ATUAL. `validade` e `entrada` são dias relativos a hoje.
 * Alguns saldos ficam de propósito abaixo do estoque mínimo e algumas validades
 * caem dentro da janela de 30 dias, para os alertas terem conteúdo real.
 */
const LOTES = [
  { chave: "dipirona_a", produto: "dipirona", numero: "DIP-2504", quantidade: 12, validade: 22, entrada: -95 },
  { chave: "dipirona_b", produto: "dipirona", numero: "DIP-2611", quantidade: 60, validade: 430, entrada: -20 },
  { chave: "paracetamol_a", produto: "paracetamol", numero: "PAR-2508", quantidade: 34, validade: 260, entrada: -60 },
  { chave: "ibuprofeno_a", produto: "ibuprofeno", numero: "IBU-2412", quantidade: 8, validade: 55, entrada: -120 },
  { chave: "ibuprofeno_b", produto: "ibuprofeno", numero: "IBU-2606", quantidade: 26, validade: 520, entrada: -15 },
  { chave: "omeprazol_a", produto: "omeprazol", numero: "OME-2509", quantidade: 41, validade: 300, entrada: -45 },
  { chave: "losartana_a", produto: "losartana", numero: "LOS-2505", quantidade: 18, validade: 75, entrada: -80 },
  { chave: "losartana_b", produto: "losartana", numero: "LOS-2610", quantidade: 48, validade: 610, entrada: -10 },
  { chave: "soro_vencido", produto: "soro", numero: "SOR-2401", quantidade: 6, validade: -12, entrada: -400 },
  { chave: "soro_a", produto: "soro", numero: "SOR-2603", quantidade: 22, validade: 380, entrada: -30 },
  { chave: "amoxicilina_a", produto: "amoxicilina", numero: "AMO-2507", quantidade: 14, validade: 190, entrada: -55 },
  { chave: "azitromicina_a", produto: "azitromicina", numero: "AZI-2506", quantidade: 3, validade: 140, entrada: -70 },
  { chave: "sertralina_a", produto: "sertralina", numero: "SER-2602", quantidade: 11, validade: 480, entrada: -25 },
  { chave: "clonazepam_a", produto: "clonazepam", numero: "CLO-2504", quantidade: 4, validade: 28, entrada: -110 },
  { chave: "clonazepam_b", produto: "clonazepam", numero: "CLO-2609", quantidade: 16, validade: 560, entrada: -12 },
  { chave: "alprazolam_a", produto: "alprazolam", numero: "ALP-2601", quantidade: 9, validade: 450, entrada: -35 },
  { chave: "protetor_a", produto: "protetor", numero: "PRO-2505", quantidade: 5, validade: 26, entrada: -150 },
  { chave: "protetor_b", produto: "protetor", numero: "PRO-2607", quantidade: 14, validade: 700, entrada: -18 },
  { chave: "creme_dental_a", produto: "creme_dental", numero: "CRD-2604", quantidade: 37, validade: 640, entrada: -22 },
  { chave: "shampoo_a", produto: "shampoo", numero: "SHA-2603", quantidade: 6, validade: 590, entrada: -28 },
  { chave: "termometro_a", produto: "termometro", numero: "TER-2602", quantidade: 2, validade: 900, entrada: -40 },
  { chave: "pressao_a", produto: "pressao", numero: "PRE-2601", quantidade: 3, validade: 1000, entrada: -50 },
  { chave: "mascara_a", produto: "mascara", numero: "MAS-2605", quantidade: 19, validade: 800, entrada: -26 },
  { chave: "fralda_a", produto: "fralda", numero: "FRA-2606", quantidade: 4, validade: 750, entrada: -14 },
];

/** Perdas e ajustes de inventário — entram no cálculo da entrada do lote. */
const AJUSTES = [
  {
    lote: "protetor_a",
    tipo: "perda",
    quantidade: 2,
    motivo: "Dois frascos danificados no transporte",
    dias: -9,
    usuario: "gerente",
  },
  {
    lote: "creme_dental_a",
    tipo: "ajuste",
    quantidade: 1,
    motivo: "Inventario mensal: contagem fisica uma unidade abaixo do sistema",
    dias: -4,
    usuario: "gerente",
  },
  {
    lote: "mascara_a",
    tipo: "devolucao",
    quantidade: 1,
    motivo: "Cliente devolveu caixa lacrada dentro do prazo",
    dias: -6,
    usuario: "caixa",
    entrada: true,
  },
];

/**
 * Vendas. `dias` 0 = hoje, 1 = ontem, 2 = anteontem. Toda venda finalizada com
 * item controlado tem receita — é o que a regra do §3 exige.
 */
const VENDAS = [
  // ----- anteontem
  {
    dias: 2,
    hora: "10:12",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "dipirona_b", quantidade: 2 }, { lote: "creme_dental_a", quantidade: 1 }],
    pagamentos: [{ forma: "dinheiro", valor: 30.7 }],
  },
  {
    dias: 2,
    hora: "15:47",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "mascara_a", quantidade: 1 }, { lote: "termometro_a", quantidade: 1 }],
    pagamentos: [{ forma: "cartao_credito", valor: 69.8 }],
  },

  // ----- ontem
  {
    dias: 1,
    hora: "09:24",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "paracetamol_a", quantidade: 1 }, { lote: "soro_a", quantidade: 2 }],
    pagamentos: [{ forma: "pix", valor: 30.5 }],
  },
  {
    dias: 1,
    hora: "11:05",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "amoxicilina_a", quantidade: 1 }],
    receita: {
      medico_nome: "Dr. Rafael Toledo",
      medico_crm: "CRM-SP 84512",
      paciente_nome: "Marta Ribeiro Alves",
      dias_emissao: 3,
    },
    pagamentos: [{ forma: "cartao_debito", valor: 34.9 }],
  },
  {
    dias: 1,
    hora: "14:38",
    usuario: "caixa",
    status: "finalizada",
    desconto: 5.0,
    itens: [{ lote: "protetor_b", quantidade: 1 }, { lote: "shampoo_a", quantidade: 1 }],
    pagamentos: [{ forma: "cartao_credito", valor: 87.4 }],
  },
  {
    dias: 1,
    hora: "16:52",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "clonazepam_b", quantidade: 1 }, { lote: "omeprazol_a", quantidade: 1 }],
    receita: {
      medico_nome: "Dra. Helena Prado",
      medico_crm: "CRM-SP 122870",
      paciente_nome: "Joao Batista Nunes",
      dias_emissao: 8,
    },
    pagamentos: [{ forma: "dinheiro", valor: 20.0 }, { forma: "pix", valor: 21.8 }],
  },
  {
    dias: 1,
    hora: "12:30",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "mascara_a", quantidade: 2 }, { lote: "fralda_a", quantidade: 1 }],
    pagamentos: [{ forma: "pix", valor: 102.7 }],
  },
  {
    dias: 1,
    hora: "17:40",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "protetor_b", quantidade: 1 }, { lote: "creme_dental_a", quantidade: 2 }],
    pagamentos: [{ forma: "cartao_credito", valor: 86.7 }],
  },
  {
    dias: 1,
    hora: "18:20",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "losartana_b", quantidade: 3 }],
    pagamentos: [{ forma: "cartao_debito", valor: 49.2 }],
  },

  // ----- hoje
  {
    dias: 0,
    hora: "09:18",
    usuario: "gerente",
    status: "finalizada",
    itens: [{ lote: "dipirona_b", quantidade: 1 }, { lote: "paracetamol_a", quantidade: 1 }],
    pagamentos: [{ forma: "dinheiro", valor: 25.0 }],
  },
  {
    dias: 0,
    hora: "10:41",
    usuario: "gerente",
    status: "finalizada",
    itens: [{ lote: "sertralina_a", quantidade: 1 }],
    receita: {
      medico_nome: "Dra. Camila Ferraz",
      medico_crm: "CRM-SP 97340",
      paciente_nome: "Luciana Prado Martins",
      dias_emissao: 12,
    },
    pagamentos: [{ forma: "pix", valor: 38.4 }],
  },
  {
    dias: 0,
    hora: "11:36",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "ibuprofeno_b", quantidade: 2 }, { lote: "creme_dental_a", quantidade: 2 }],
    pagamentos: [{ forma: "cartao_debito", valor: 57.6 }],
  },
  {
    dias: 0,
    hora: "13:02",
    usuario: "gerente",
    status: "finalizada",
    desconto: 8.0,
    itens: [{ lote: "pressao_a", quantidade: 1 }],
    pagamentos: [{ forma: "cartao_credito", valor: 281.9 }],
  },
  {
    dias: 0,
    hora: "14:15",
    usuario: "caixa",
    status: "finalizada",
    itens: [{ lote: "alprazolam_a", quantidade: 1 }, { lote: "dipirona_b", quantidade: 1 }],
    receita: {
      medico_nome: "Dr. Rafael Toledo",
      medico_crm: "CRM-SP 84512",
      paciente_nome: "Sergio Almeida Lima",
      dias_emissao: 5,
    },
    pagamentos: [{ forma: "dinheiro", valor: 42.0 }],
  },
  {
    dias: 0,
    hora: "15:28",
    usuario: "gerente",
    status: "finalizada",
    itens: [{ lote: "fralda_a", quantidade: 1 }, { lote: "soro_a", quantidade: 1 }],
    pagamentos: [{ forma: "pix", valor: 52.4 }],
  },
  {
    dias: 0,
    hora: "16:44",
    usuario: "caixa",
    status: "cancelada",
    motivo_cancelamento: "Cliente desistiu da compra no caixa",
    itens: [{ lote: "azitromicina_a", quantidade: 1 }],
    pagamentos: [],
  },
  {
    dias: 0,
    hora: "17:05",
    usuario: "caixa",
    status: "aberta",
    itens: [{ lote: "omeprazol_a", quantidade: 1 }],
    pagamentos: [],
  },
];

const CONTAS_PAGAR = [
  { descricao: "Nota fiscal 4521 - Distribuidora Panvel Norte", valor: 4820.75, vencimento: 12, fornecedor: "panvel", status: "pendente" },
  { descricao: "Nota fiscal 4487 - Farmalog Distribuicao", valor: 2310.4, vencimento: -5, fornecedor: "farmalog", status: "pendente" },
  { descricao: "Energia eletrica da loja - competencia do mes anterior", valor: 1180.9, vencimento: 3, status: "pendente" },
  { descricao: "Aluguel da loja - mes anterior", valor: 6500.0, vencimento: -22, status: "pago", pago_dias: -21 },
  { descricao: "Mensalidade do sistema de gestao", valor: 349.9, vencimento: 8, status: "pendente" },
  { descricao: "Nota fiscal 1180 - MedSupply Correlatos", valor: 1745.3, vencimento: 19, fornecedor: "medsupply", status: "pendente" },
];

const CONTAS_RECEBER = [
  { origem: "convenio", descricao: "Convenio Unimed - competencia do mes anterior", valor: 3240.6, vencimento: 10, status: "pendente" },
  { origem: "convenio", descricao: "Convenio Bradesco Saude - competencia do mes anterior", valor: 1875.2, vencimento: -3, status: "pendente" },
  { origem: "venda_a_prazo", descricao: "Venda a prazo - Marta Ribeiro Alves", valor: 189.9, vencimento: 5, status: "pendente" },
  { origem: "convenio", descricao: "Convenio Unimed - dois meses atras", valor: 2980.0, vencimento: -25, status: "recebido", recebido_dias: -24 },
];

// ------------------------------------------------------------------- utilitarios

/** Expressão SQL de um instante: dia relativo a hoje + hora do dia. */
const instante = (dias, hora) =>
  `(date_trunc('day', now()) - interval '${dias} days' + interval '${hora}')`;

const dataRelativa = (dias) => `(current_date + ${dias})`;

const dinheiro = (valor) => Number(valor.toFixed(2));

/** Mesma chave de acesso simulada que o fiscal-service gera. */
function chaveAcessoSimulada(vendaId) {
  const digest = createHash("sha256").update(String(vendaId)).digest("hex");
  return digest.replace(/\D/g, "").padEnd(44, "0").slice(0, 44);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL nao definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    // ---------------------------------------------------- usuarios e categorias
    const { rows: usuarios } = await client.query(
      `SELECT u.id, u.email, p.nome AS perfil
         FROM auth.usuarios u JOIN auth.perfis p ON p.id = u.perfil_id`
    );
    const porPerfil = {};
    for (const usuario of usuarios) porPerfil[usuario.perfil] = usuario.id;

    if (!porPerfil.gerente || !porPerfil.operador_caixa) {
      console.error('Usuarios de desenvolvimento nao encontrados. Rode "npm run seed" primeiro.');
      await client.query("ROLLBACK");
      process.exit(1);
    }
    const usuarioId = { gerente: porPerfil.gerente, caixa: porPerfil.operador_caixa };

    const { rows: categorias } = await client.query(`SELECT id, nome FROM estoque.categorias`);
    const categoriaId = {};
    for (const categoria of categorias) categoriaId[categoria.nome] = categoria.id;

    // -------------------------------------------------------------- limpeza
    await client.query(`
      TRUNCATE estoque.movimentacoes_estoque, estoque.historico_precos,
               estoque.lotes, estoque.produtos, estoque.fornecedores,
               vendas.receitas, vendas.pagamentos, vendas.itens_venda, vendas.vendas,
               financeiro.movimentacoes_caixa, financeiro.caixa,
               financeiro.contas_pagar, financeiro.contas_receber,
               fiscal.notas_fiscais, fiscal.controlados_sngpc
      CASCADE
    `);

    // ---------------------------------------------------------- fornecedores
    const fornecedorId = {};
    for (const fornecedor of FORNECEDORES) {
      const { rows } = await client.query(
        `INSERT INTO estoque.fornecedores (nome, cnpj, telefone, email)
              VALUES ($1, $2, $3, $4) RETURNING id`,
        [fornecedor.nome, fornecedor.cnpj, fornecedor.telefone, fornecedor.email]
      );
      fornecedorId[fornecedor.chave] = rows[0].id;
    }

    // -------------------------------------------------------------- produtos
    const produtoPorChave = {};
    for (const produto of PRODUTOS) {
      const { rows } = await client.query(
        `INSERT INTO estoque.produtos
           (nome, principio_ativo, fabricante, classe_terapeutica, codigo_barras,
            tipo_controle, unidade_venda, ncm, cfop, preco_custo, preco_venda,
            estoque_minimo, categoria_id, fornecedor_id, criado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now() - interval '120 days')
         RETURNING id`,
        [
          produto.nome,
          produto.principio_ativo ?? null,
          produto.fabricante,
          produto.classe_terapeutica ?? null,
          produto.codigo_barras,
          produto.tipo_controle,
          produto.unidade_venda,
          produto.ncm ?? null,
          produto.cfop ?? null,
          produto.preco_custo,
          produto.preco_venda,
          produto.estoque_minimo,
          categoriaId[produto.categoria] ?? null,
          fornecedorId[produto.fornecedor] ?? null,
        ]
      );
      produtoPorChave[produto.chave] = { ...produto, id: rows[0].id };
    }

    // ----------------------------------------------------------------- lotes
    const lotePorChave = {};
    for (const lote of LOTES) {
      const produto = produtoPorChave[lote.produto];
      const { rows } = await client.query(
        `INSERT INTO estoque.lotes
           (produto_id, numero_lote, quantidade, data_validade, data_entrada)
         VALUES ($1, $2, $3, ${dataRelativa(lote.validade)}, ${dataRelativa(lote.entrada)})
         RETURNING id`,
        [produto.id, lote.numero, lote.quantidade]
      );
      lotePorChave[lote.chave] = { ...lote, id: rows[0].id, produto, saidas: 0 };
    }

    // ---------------------------------------------- vendas, receitas, fiscal
    const movimentacoes = []; // saidas geradas pelas vendas
    const lancamentosCaixa = []; // entradas de caixa por venda

    for (const venda of VENDAS) {
      const desconto = dinheiro(venda.desconto ?? 0);
      const itens = venda.itens.map((item) => {
        const lote = lotePorChave[item.lote];
        return {
          lote,
          quantidade: item.quantidade,
          preco_unitario: lote.produto.preco_venda,
        };
      });
      const bruto = dinheiro(
        itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0)
      );
      const total = dinheiro(Math.max(bruto - desconto, 0));

      const { rows: criada } = await client.query(
        `INSERT INTO vendas.vendas
           (usuario_id, status, valor_total, desconto, motivo_cancelamento, criado_em)
         VALUES ($1, $2, $3, $4, $5, ${instante(venda.dias, venda.hora)})
         RETURNING id`,
        [
          usuarioId[venda.usuario],
          venda.status,
          venda.status === "finalizada" ? total : venda.status === "aberta" ? total : 0,
          desconto,
          venda.motivo_cancelamento ?? null,
        ]
      );
      const vendaId = criada[0].id;

      for (const item of itens) {
        await client.query(
          `INSERT INTO vendas.itens_venda
             (venda_id, produto_id, lote_id, quantidade, preco_unitario, produto_nome, tipo_controle)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            vendaId,
            item.lote.produto.id,
            item.lote.id,
            item.quantidade,
            item.preco_unitario,
            item.lote.produto.nome,
            item.lote.produto.tipo_controle,
          ]
        );
      }

      for (const pagamento of venda.pagamentos) {
        await client.query(
          `INSERT INTO vendas.pagamentos (venda_id, forma_pagamento, valor)
                VALUES ($1, $2, $3)`,
          [vendaId, pagamento.forma, pagamento.valor]
        );
      }

      let receitaId = null;
      if (venda.receita) {
        const { rows } = await client.query(
          `INSERT INTO vendas.receitas
             (venda_id, medico_nome, medico_crm, paciente_nome, data_emissao)
           VALUES ($1, $2, $3, $4, ${dataRelativa(-venda.receita.dias_emissao)})
           RETURNING id`,
          [vendaId, venda.receita.medico_nome, venda.receita.medico_crm, venda.receita.paciente_nome]
        );
        receitaId = rows[0].id;
      }

      if (venda.status !== "finalizada") continue;

      // Saída de estoque de cada item, na data da venda.
      for (const item of itens) {
        item.lote.saidas += item.quantidade;
        movimentacoes.push({
          produtoId: item.lote.produto.id,
          loteId: item.lote.id,
          tipo: "saida",
          quantidade: item.quantidade,
          motivo: `venda ${vendaId}`,
          usuarioId: usuarioId[venda.usuario],
          quando: instante(venda.dias, venda.hora),
        });
      }

      // Nota fiscal simulada e registro de controlado no SNGPC.
      await client.query(
        `INSERT INTO fiscal.notas_fiscais (venda_id, chave_acesso, status, xml_url, emitida_em)
              VALUES ($1, $2, 'simulado', $3, ${instante(venda.dias, venda.hora)})`,
        [vendaId, chaveAcessoSimulada(vendaId), `/xml-simulado/${chaveAcessoSimulada(vendaId)}.xml`]
      );

      if (receitaId) {
        for (const item of itens) {
          if (item.lote.produto.tipo_controle === "livre") continue;
          await client.query(
            `INSERT INTO fiscal.controlados_sngpc
               (venda_id, produto_id, receita_id, enviado_anvisa, criado_em)
             VALUES ($1, $2, $3, false, ${instante(venda.dias, venda.hora)})`,
            [vendaId, item.lote.produto.id, receitaId]
          );
        }
      }

      lancamentosCaixa.push({
        vendaId,
        usuario: venda.usuario,
        dias: venda.dias,
        hora: venda.hora,
        valor: total,
      });
    }

    // --------------------------------------- perdas, ajustes e devolucoes
    for (const ajuste of AJUSTES) {
      const lote = lotePorChave[ajuste.lote];
      if (!ajuste.entrada) lote.saidas += ajuste.quantidade;
      else lote.saidas -= ajuste.quantidade; // devolução aumentou o saldo atual
      movimentacoes.push({
        produtoId: lote.produto.id,
        loteId: lote.id,
        tipo: ajuste.tipo,
        quantidade: ajuste.quantidade,
        motivo: ajuste.motivo,
        usuarioId: usuarioId[ajuste.usuario],
        quando: instante(-ajuste.dias, "10:00"),
      });
    }

    // ----------------------------------- entradas de lote (saldo + tudo que saiu)
    for (const lote of Object.values(lotePorChave)) {
      const quantidadeEntrada = lote.quantidade + lote.saidas;
      await client.query(
        `INSERT INTO estoque.movimentacoes_estoque
           (produto_id, lote_id, tipo, quantidade, motivo, usuario_id, criado_em)
         VALUES ($1, $2, 'entrada', $3, $4, $5, ${dataRelativa(lote.entrada)})`,
        [
          lote.produto.id,
          lote.id,
          quantidadeEntrada,
          `Entrada do lote ${lote.numero}`,
          usuarioId.gerente,
        ]
      );
    }

    for (const movimentacao of movimentacoes) {
      await client.query(
        `INSERT INTO estoque.movimentacoes_estoque
           (produto_id, lote_id, tipo, quantidade, motivo, usuario_id, criado_em)
         VALUES ($1, $2, $3, $4, $5, $6, ${movimentacao.quando})`,
        [
          movimentacao.produtoId,
          movimentacao.loteId,
          movimentacao.tipo,
          movimentacao.quantidade,
          movimentacao.motivo,
          movimentacao.usuarioId,
        ]
      );
    }

    // ------------------------------------------------- historico de preco
    await client.query(
      `INSERT INTO estoque.historico_precos
         (produto_id, campo, valor_anterior, valor_novo, usuario_id, criado_em)
       VALUES
         ($1, 'preco_venda', 8.90, 9.90, $3, now() - interval '38 days'),
         ($2, 'preco_venda', 59.90, 64.90, $3, now() - interval '17 days'),
         ($2, 'preco_custo', 29.50, 32.00, $3, now() - interval '17 days')`,
      [produtoPorChave.dipirona.id, produtoPorChave.protetor.id, usuarioId.gerente]
    );

    // ---------------------------------------------------------------- caixa
    // Ontem: caixa do operador, já fechado com pequena divergência.
    const vendasOntem = lancamentosCaixa.filter((l) => l.dias === 1);
    const totalOntem = dinheiro(vendasOntem.reduce((soma, l) => soma + l.valor, 0));
    const aberturaOntem = 150;
    const esperadoOntem = dinheiro(aberturaOntem + totalOntem);

    const { rows: caixaOntem } = await client.query(
      `INSERT INTO financeiro.caixa
         (usuario_id, valor_abertura, valor_fechamento_esperado, valor_fechamento_contado,
          aberto_em, fechado_em)
       VALUES ($1, $2, $3, $4, ${instante(1, "08:50")}, ${instante(1, "19:10")})
       RETURNING id`,
      [usuarioId.caixa, aberturaOntem, esperadoOntem, dinheiro(esperadoOntem - 2.5)]
    );

    for (const lancamento of vendasOntem) {
      await client.query(
        `INSERT INTO financeiro.movimentacoes_caixa
           (caixa_id, tipo, valor, origem, descricao, venda_id, criado_em)
         VALUES ($1, 'entrada', $2, 'venda', $3, $4, ${instante(lancamento.dias, lancamento.hora)})`,
        [caixaOntem[0].id, lancamento.valor, `Venda ${lancamento.vendaId.slice(0, 8)}`, lancamento.vendaId]
      );
    }

    // Hoje: um caixa aberto por operador que vendeu.
    const caixaHojeId = {};
    for (const [usuario, abertura, hora] of [
      ["gerente", 200, "08:55"],
      ["caixa", 150, "09:02"],
    ]) {
      const { rows } = await client.query(
        `INSERT INTO financeiro.caixa (usuario_id, valor_abertura, aberto_em)
              VALUES ($1, $2, ${instante(0, hora)}) RETURNING id`,
        [usuarioId[usuario], abertura]
      );
      caixaHojeId[usuario] = rows[0].id;
    }

    for (const lancamento of lancamentosCaixa.filter((l) => l.dias === 0)) {
      await client.query(
        `INSERT INTO financeiro.movimentacoes_caixa
           (caixa_id, tipo, valor, origem, descricao, venda_id, criado_em)
         VALUES ($1, 'entrada', $2, 'venda', $3, $4, ${instante(0, lancamento.hora)})`,
        [
          caixaHojeId[lancamento.usuario],
          lancamento.valor,
          `Venda ${lancamento.vendaId.slice(0, 8)}`,
          lancamento.vendaId,
        ]
      );
    }

    // Sangria: dinheiro retirado da gaveta e levado ao cofre.
    await client.query(
      `INSERT INTO financeiro.movimentacoes_caixa
         (caixa_id, tipo, valor, origem, descricao, criado_em)
       VALUES ($1, 'saida', 150.00, 'lancamento_manual',
               'Sangria: retirada de dinheiro da gaveta para o cofre', ${instante(0, "16:00")})`,
      [caixaHojeId.gerente]
    );

    // -------------------------------------------------------------- contas
    for (const conta of CONTAS_PAGAR) {
      await client.query(
        `INSERT INTO financeiro.contas_pagar
           (fornecedor_id, descricao, valor, vencimento, status, pago_em)
         VALUES ($1, $2, $3, ${dataRelativa(conta.vencimento)}, $4,
                 ${conta.pago_dias ? instante(-conta.pago_dias, "11:00") : "NULL"})`,
        [
          conta.fornecedor ? fornecedorId[conta.fornecedor] : null,
          conta.descricao,
          conta.valor,
          conta.status,
        ]
      );
    }

    for (const conta of CONTAS_RECEBER) {
      await client.query(
        `INSERT INTO financeiro.contas_receber
           (origem, descricao, valor, vencimento, status, recebido_em)
         VALUES ($1, $2, $3, ${dataRelativa(conta.vencimento)}, $4,
                 ${conta.recebido_dias ? instante(-conta.recebido_dias, "11:00") : "NULL"})`,
        [conta.origem, conta.descricao, conta.valor, conta.status]
      );
    }

    await client.query("COMMIT");

    // ------------------------------------------------------------- resumo
    const resumo = async (rotulo, sql) => {
      const { rows } = await client.query(sql);
      console.log(`${rotulo}: ${JSON.stringify(rows[0] ?? rows)}`);
    };

    console.log("\nDados de demonstracao criados.\n");
    await resumo("Produtos", `SELECT COUNT(*)::int AS total FROM estoque.produtos`);
    await resumo("Lotes", `SELECT COUNT(*)::int AS total, SUM(quantidade)::int AS unidades FROM estoque.lotes`);
    await resumo("Movimentacoes", `SELECT COUNT(*)::int AS total FROM estoque.movimentacoes_estoque`);
    await resumo(
      "Vendas por status",
      `SELECT jsonb_object_agg(status, quantidade) AS por_status
         FROM (SELECT status, COUNT(*)::int AS quantidade FROM vendas.vendas GROUP BY status) t`
    );
    await resumo("Vendas de hoje", `SELECT * FROM vendas.vw_vendas_hoje`);
    await resumo("Alerta de estoque baixo", `SELECT COUNT(*)::int AS produtos FROM estoque.vw_estoque_baixo`);
    await resumo(
      "Alerta de validade (30 dias)",
      `SELECT COUNT(*)::int AS lotes FROM estoque.vw_produtos_a_vencer WHERE dias_para_vencer <= 30`
    );
    await resumo("Notas fiscais", `SELECT COUNT(*)::int AS total FROM fiscal.notas_fiscais`);
    await resumo("Registros SNGPC", `SELECT COUNT(*)::int AS total FROM fiscal.controlados_sngpc`);
    await resumo(
      "Contas",
      `SELECT (SELECT COUNT(*)::int FROM financeiro.contas_pagar) AS a_pagar,
              (SELECT COUNT(*)::int FROM financeiro.contas_receber) AS a_receber`
    );
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Erro ao criar dados de demonstracao:", erro.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
