#!/usr/bin/env node
/**
 * Popula o banco de desenvolvimento com uma farmácia em operação: 120 dias de
 * movimento, clientes com padrão de recompra, compras, caixa fechado por dia,
 * fiscal e contatos de relacionamento.
 *
 * Uso: npm run seed:demo
 *
 * Atenção: LIMPA as tabelas de negócio antes de inserir (produtos, lotes,
 * vendas, clientes, compras, caixa, contas, fiscal). Os usuários de `auth` são
 * preservados. É um seed de demonstração — nunca rodar contra produção.
 *
 * Como a coerência é garantida:
 * - a quantidade de cada lote é o saldo de hoje; a movimentação de entrada é
 *   calculada como saldo + tudo que saiu dele (venda, perda, ajuste);
 * - cada venda finalizada tem itens, pagamentos que cobrem o total, saída de
 *   estoque no lote correspondente, nota fiscal e lançamento no caixa do dia;
 * - venda com item controlado sempre tem receita e registro de SNGPC;
 * - clientes crônicos recompram no intervalo do tratamento, o que dá sentido à
 *   análise de recompra do CRM;
 * - os números saem sempre iguais: o sorteio usa semente fixa.
 */

const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const DIAS_DE_HISTORICO = 120;
const FUSO = process.env.TZ_NEGOCIO ?? "America/Sao_Paulo";

// --------------------------------------------------------------- utilitários

/** Sorteio com semente fixa: rodar de novo dá exatamente o mesmo cenário. */
function criarSorteio(semente) {
  let estado = semente;
  const proximo = () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return estado / 2147483648;
  };
  return {
    fracao: proximo,
    inteiro: (min, max) => min + Math.floor(proximo() * (max - min + 1)),
    escolher: (lista) => lista[Math.floor(proximo() * lista.length)],
    chance: (probabilidade) => proximo() < probabilidade,
  };
}

const sorteio = criarSorteio(20260821);

/** Hoje no fuso do negócio, à meia-noite. */
function hojeLocal() {
  const texto = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
  const [ano, mes, dia] = texto.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const HOJE = hojeLocal();

function dataDeDiasAtras(dias) {
  const data = new Date(HOJE);
  data.setUTCDate(data.getUTCDate() - dias);
  return data;
}

const paraISO = (data) => data.toISOString().slice(0, 10);

/** Timestamp local no formato que o Postgres lê com o fuso da sessão. */
function instante(dias, hora, minuto) {
  const hh = String(Math.min(hora, 23)).padStart(2, "0");
  const mm = String(Math.min(minuto, 59)).padStart(2, "0");
  return `${paraISO(dataDeDiasAtras(dias))} ${hh}:${mm}:00`;
}

/**
 * Data corrida a partir de hoje: negativo é passado, positivo é futuro.
 * Usada nos retornos combinados — alguns já venceram, outros ainda vão chegar.
 */
function diaCorrido(deslocamento) {
  return paraISO(dataDeDiasAtras(-deslocamento));
}

const dinheiro = (valor) => Number(Number(valor).toFixed(2));

/** Mesma chave de acesso simulada que o fiscal-service gera. */
function chaveAcessoSimulada(vendaId) {
  const digest = createHash("sha256").update(String(vendaId)).digest("hex");
  return digest.replace(/\D/g, "").padEnd(44, "0").slice(0, 44);
}

/** Insere em blocos: 90 dias de movimento são milhares de linhas. */
async function inserirEmLote(client, tabela, colunas, linhas, tamanhoBloco = 150) {
  for (let inicio = 0; inicio < linhas.length; inicio += tamanhoBloco) {
    const bloco = linhas.slice(inicio, inicio + tamanhoBloco);
    const parametros = [];
    const marcadores = bloco.map((linha) => {
      const posicoes = linha.map((valor) => {
        parametros.push(valor);
        return `$${parametros.length}`;
      });
      return `(${posicoes.join(", ")})`;
    });

    await client.query(
      `INSERT INTO ${tabela} (${colunas.join(", ")}) VALUES ${marcadores.join(", ")}`,
      parametros
    );
  }
}

// ---------------------------------------------------------------- cadastros

const FORNECEDORES = [
  { chave: "panvel", nome: "Distribuidora Panvel Norte", cnpj: "12.345.678/0001-90", telefone: "(51) 3220-4400", email: "comercial@panvelnorte.com.br" },
  { chave: "farmalog", nome: "Farmalog Distribuicao de Medicamentos", cnpj: "98.765.432/0001-21", telefone: "(11) 4002-8922", email: "pedidos@farmalog.com.br" },
  { chave: "dermacenter", nome: "Dermacenter Cosmeticos", cnpj: "45.678.912/0001-33", telefone: "(11) 3773-1200", email: "vendas@dermacenter.com.br" },
  { chave: "medsupply", nome: "MedSupply Correlatos Hospitalares", cnpj: "33.222.111/0001-44", telefone: "(41) 3355-7800", email: "atendimento@medsupply.com.br" },
];

const MEDICAMENTO = "Medicamento";
const PERFUMARIA = "Perfumaria e Higiene";
const CORRELATOS = "Correlatos";

/**
 * `saldo` é a quantidade que deve estar em estoque hoje; `giro` é o peso do
 * produto no sorteio das vendas (produto de giro alto aparece mais).
 */
const PRODUTOS = [
  { chave: "dipirona", nome: "Dipirona Monoidratada 500mg 20 comprimidos", categoria: MEDICAMENTO, fornecedor: "panvel", principio_ativo: "Dipirona monoidratada", fabricante: "Neo Quimica", tipo_controle: "livre", codigo_barras: "7891058001234", unidade_venda: "caixa", preco_custo: 4.2, preco_venda: 9.9, estoque_minimo: 15, ncm: "30049099", cfop: "5405", dias_de_uso: null, giro: 10, saldo: 48 },
  { chave: "paracetamol", nome: "Paracetamol 750mg 20 comprimidos", categoria: MEDICAMENTO, fornecedor: "panvel", principio_ativo: "Paracetamol", fabricante: "Medley", tipo_controle: "livre", codigo_barras: "7891058002941", unidade_venda: "caixa", preco_custo: 5.1, preco_venda: 11.5, estoque_minimo: 15, ncm: "30049069", cfop: "5405", dias_de_uso: null, giro: 9, saldo: 36 },
  { chave: "ibuprofeno", nome: "Ibuprofeno 400mg 20 capsulas", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Ibuprofeno", fabricante: "EMS", tipo_controle: "livre", codigo_barras: "7896004703121", unidade_venda: "caixa", preco_custo: 8.4, preco_venda: 17.9, estoque_minimo: 10, ncm: "30049099", cfop: "5405", dias_de_uso: null, giro: 7, saldo: 22 },
  { chave: "omeprazol", nome: "Omeprazol 20mg 28 capsulas", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Omeprazol", fabricante: "Medley", tipo_controle: "livre", codigo_barras: "7896422505598", unidade_venda: "caixa", preco_custo: 6.8, preco_venda: 14.9, estoque_minimo: 12, ncm: "30049069", cfop: "5405", dias_de_uso: 28, giro: 8, saldo: 30 },
  { chave: "losartana", nome: "Losartana Potassica 50mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Losartana potassica", fabricante: "EMS", tipo_controle: "livre", codigo_barras: "7896004712345", unidade_venda: "caixa", preco_custo: 7.5, preco_venda: 16.4, estoque_minimo: 20, ncm: "30049069", cfop: "5405", dias_de_uso: 30, giro: 9, saldo: 54 },
  { chave: "metformina", nome: "Metformina 850mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Cloridrato de metformina", fabricante: "Merck", tipo_controle: "livre", codigo_barras: "7896004718001", unidade_venda: "caixa", preco_custo: 8.9, preco_venda: 18.9, estoque_minimo: 18, ncm: "30049069", cfop: "5405", dias_de_uso: 30, giro: 8, saldo: 41 },
  { chave: "sinvastatina", nome: "Sinvastatina 20mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Sinvastatina", fabricante: "EMS", tipo_controle: "livre", codigo_barras: "7896004719114", unidade_venda: "caixa", preco_custo: 11.2, preco_venda: 23.5, estoque_minimo: 15, ncm: "30049069", cfop: "5405", dias_de_uso: 30, giro: 6, saldo: 27 },
  { chave: "soro", nome: "Soro Fisiologico 0,9% 500ml", categoria: MEDICAMENTO, fornecedor: "medsupply", principio_ativo: "Cloreto de sodio", fabricante: "Fresenius Kabi", tipo_controle: "livre", codigo_barras: "7898040370015", unidade_venda: "frasco", preco_custo: 5.0, preco_venda: 9.5, estoque_minimo: 8, ncm: "30049099", cfop: "5405", dias_de_uso: null, giro: 6, saldo: 26 },
  { chave: "dorflex", nome: "Relaxante Muscular 300mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "panvel", principio_ativo: "Dipirona e orfenadrina", fabricante: "Sanofi", tipo_controle: "livre", codigo_barras: "7891058003115", unidade_venda: "caixa", preco_custo: 12.4, preco_venda: 24.9, estoque_minimo: 12, ncm: "30049099", cfop: "5405", dias_de_uso: null, giro: 7, saldo: 19 },
  { chave: "vitaminac", nome: "Vitamina C 1g 10 comprimidos efervescentes", categoria: MEDICAMENTO, fornecedor: "panvel", principio_ativo: "Acido ascorbico", fabricante: "Bayer", tipo_controle: "livre", codigo_barras: "7891058004112", unidade_venda: "tubo", preco_custo: 9.8, preco_venda: 21.9, estoque_minimo: 10, ncm: "30045090", cfop: "5405", dias_de_uso: 10, giro: 6, saldo: 24 },

  { chave: "amoxicilina", nome: "Amoxicilina 500mg 21 capsulas", categoria: MEDICAMENTO, fornecedor: "panvel", principio_ativo: "Amoxicilina tri-hidratada", fabricante: "Prati-Donaduzzi", tipo_controle: "tarja_vermelha", classe_terapeutica: "Antibiotico", codigo_barras: "7896658201458", unidade_venda: "caixa", preco_custo: 18.0, preco_venda: 34.9, estoque_minimo: 8, ncm: "30041019", cfop: "5405", dias_de_uso: 7, giro: 4, saldo: 17 },
  { chave: "azitromicina", nome: "Azitromicina 500mg 5 comprimidos", categoria: MEDICAMENTO, fornecedor: "panvel", principio_ativo: "Azitromicina di-hidratada", fabricante: "EMS", tipo_controle: "tarja_vermelha", classe_terapeutica: "Antibiotico", codigo_barras: "7896004709871", unidade_venda: "caixa", preco_custo: 22.0, preco_venda: 42.5, estoque_minimo: 6, ncm: "30042029", cfop: "5405", dias_de_uso: 5, giro: 3, saldo: 4 },
  { chave: "sertralina", nome: "Cloridrato de Sertralina 50mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Cloridrato de sertralina", fabricante: "Eurofarma", tipo_controle: "tarja_vermelha", classe_terapeutica: "Antidepressivo (lista C1)", codigo_barras: "7896016807765", unidade_venda: "caixa", preco_custo: 19.9, preco_venda: 38.4, estoque_minimo: 6, ncm: "30049069", cfop: "5405", dias_de_uso: 30, giro: 4, saldo: 15 },
  { chave: "clonazepam", nome: "Clonazepam 2mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Clonazepam", fabricante: "Prati-Donaduzzi", tipo_controle: "tarja_preta", classe_terapeutica: "Psicotropico (lista B1)", codigo_barras: "7896658203001", unidade_venda: "caixa", preco_custo: 12.0, preco_venda: 26.9, estoque_minimo: 5, ncm: "30049099", cfop: "5405", dias_de_uso: 30, giro: 4, saldo: 13 },
  { chave: "alprazolam", nome: "Alprazolam 1mg 30 comprimidos", categoria: MEDICAMENTO, fornecedor: "farmalog", principio_ativo: "Alprazolam", fabricante: "Eurofarma", tipo_controle: "tarja_preta", classe_terapeutica: "Ansiolitico (lista B1)", codigo_barras: "7896016801122", unidade_venda: "caixa", preco_custo: 15.5, preco_venda: 32.0, estoque_minimo: 5, ncm: "30049099", cfop: "5405", dias_de_uso: 30, giro: 3, saldo: 11 },

  { chave: "protetor", nome: "Protetor Solar Fator 50 200ml", categoria: PERFUMARIA, fornecedor: "dermacenter", fabricante: "Dermacenter", tipo_controle: "livre", codigo_barras: "7899876500441", unidade_venda: "frasco", preco_custo: 32.0, preco_venda: 64.9, estoque_minimo: 6, ncm: "33049910", cfop: "5102", dias_de_uso: 60, giro: 5, saldo: 14 },
  { chave: "creme_dental", nome: "Creme Dental Protecao Total 90g", categoria: PERFUMARIA, fornecedor: "dermacenter", fabricante: "Colgate", tipo_controle: "livre", codigo_barras: "7891024132074", unidade_venda: "unidade", preco_custo: 4.9, preco_venda: 10.9, estoque_minimo: 12, ncm: "33061000", cfop: "5102", giro: 9, saldo: 44 },
  { chave: "shampoo", nome: "Shampoo Anticaspa 200ml", categoria: PERFUMARIA, fornecedor: "dermacenter", fabricante: "Dermacenter", tipo_controle: "livre", codigo_barras: "7899876502018", unidade_venda: "frasco", preco_custo: 12.4, preco_venda: 27.5, estoque_minimo: 8, ncm: "33051000", cfop: "5102", dias_de_uso: 45, giro: 5, saldo: 7 },
  { chave: "alcool_gel", nome: "Alcool em Gel 70% 500ml", categoria: PERFUMARIA, fornecedor: "dermacenter", fabricante: "Asseptgel", tipo_controle: "livre", codigo_barras: "7899876503510", unidade_venda: "frasco", preco_custo: 7.4, preco_venda: 15.9, estoque_minimo: 10, ncm: "38089490", cfop: "5102", giro: 7, saldo: 31 },
  { chave: "sabonete", nome: "Sabonete Antibacteriano 90g", categoria: PERFUMARIA, fornecedor: "dermacenter", fabricante: "Protex", tipo_controle: "livre", codigo_barras: "7891024140017", unidade_venda: "unidade", preco_custo: 3.2, preco_venda: 7.5, estoque_minimo: 15, ncm: "34011190", cfop: "5102", giro: 8, saldo: 52 },

  { chave: "termometro", nome: "Termometro Digital Axilar", categoria: CORRELATOS, fornecedor: "medsupply", fabricante: "G-Tech", tipo_controle: "livre", codigo_barras: "7898675400128", unidade_venda: "unidade", preco_custo: 18.9, preco_venda: 39.9, estoque_minimo: 4, ncm: "90251110", cfop: "5102", dias_de_uso: null, giro: 3, saldo: 3 },
  { chave: "pressao", nome: "Aparelho de Pressao Digital de Braco", categoria: CORRELATOS, fornecedor: "medsupply", fabricante: "Omron", tipo_controle: "livre", codigo_barras: "7898675401231", unidade_venda: "unidade", preco_custo: 149.0, preco_venda: 289.9, estoque_minimo: 2, ncm: "90181910", cfop: "5102", giro: 1, saldo: 5 },
  { chave: "mascara", nome: "Mascara Cirurgica Tripla caixa 50 unidades", categoria: CORRELATOS, fornecedor: "medsupply", fabricante: "Descarpack", tipo_controle: "livre", codigo_barras: "7898675403457", unidade_venda: "caixa", preco_custo: 14.0, preco_venda: 29.9, estoque_minimo: 5, ncm: "63079000", cfop: "5102", giro: 4, saldo: 23 },
  { chave: "fralda", nome: "Fralda Geriatrica Tamanho G pacote 8 unidades", categoria: CORRELATOS, fornecedor: "medsupply", fabricante: "Bigfral", tipo_controle: "livre", codigo_barras: "7898675405116", unidade_venda: "pacote", preco_custo: 21.5, preco_venda: 42.9, estoque_minimo: 6, ncm: "96190000", cfop: "5102", dias_de_uso: 20, giro: 4, saldo: 5 },
  { chave: "glicosimetro", nome: "Tiras para Glicosimetro caixa 50 unidades", categoria: CORRELATOS, fornecedor: "medsupply", fabricante: "Accu-Chek", tipo_controle: "livre", codigo_barras: "7898675407011", unidade_venda: "caixa", preco_custo: 62.0, preco_venda: 109.9, estoque_minimo: 4, ncm: "38221000", cfop: "5102", giro: 3, saldo: 9 },
];

/** Validades (em dias a partir de hoje) dos lotes de cada produto. */
const VALIDADES_POR_PRODUTO = {
  dipirona: [22, 430],
  paracetamol: [260],
  ibuprofeno: [55, 520],
  omeprazol: [300, 610],
  losartana: [75, 610],
  metformina: [280, 640],
  sinvastatina: [350],
  soro: [-12, 380],
  dorflex: [190],
  vitaminac: [140, 520],
  amoxicilina: [190],
  azitromicina: [140],
  sertralina: [480],
  clonazepam: [28, 560],
  alprazolam: [450],
  protetor: [26, 700],
  creme_dental: [640],
  shampoo: [590],
  alcool_gel: [410],
  sabonete: [720],
  termometro: [900],
  pressao: [1000],
  mascara: [800],
  fralda: [750],
  glicosimetro: [300, 690],
};

/**
 * Clientes com padrão de compra. `perfil`:
 * - `cronico`: leva o mesmo medicamento a cada `intervalo` dias
 * - `recorrente`: aparece a cada `intervalo` dias, cesta variada
 * - `esporadico`: poucas compras no período
 * - `inativo`: comprava e parou (última compra bem antes de hoje)
 * - `novo`: uma compra recente
 * - `avulso`: sem ciclo próprio, aparece no movimento de balcão
 */
const CLIENTES = [
  { nome: "Marta Ribeiro Alves", cpf: "312.456.789-01", telefone: "(11) 98877-1200", email: "marta.alves@exemplo.com", convenio: "Unimed", perfil: "cronico", produto: "losartana", intervalo: 30, atraso: 9 },
  { nome: "Joao Batista Nunes", cpf: "455.221.980-33", telefone: "(11) 99120-4477", email: "joao.nunes@exemplo.com", convenio: null, perfil: "cronico", produto: "metformina", intervalo: 30, atraso: 14 },
  { nome: "Luciana Prado Martins", cpf: "128.905.334-77", telefone: "(11) 97733-8890", email: "luciana.martins@exemplo.com", convenio: "Bradesco Saude", perfil: "cronico", produto: "sertralina", intervalo: 30, atraso: 2 },
  { nome: "Sergio Almeida Lima", cpf: "890.112.445-09", telefone: "(11) 96655-2211", email: null, convenio: null, perfil: "cronico", produto: "clonazepam", intervalo: 30, atraso: 6 },
  { nome: "Dona Cecilia Barbosa", cpf: "222.334.556-10", telefone: "(11) 98110-3322", email: null, convenio: null, perfil: "cronico", produto: "fralda", intervalo: 21, atraso: 12 },
  { nome: "Antonio Carlos Reis", cpf: "667.889.221-45", telefone: "(11) 97001-8834", email: "antonio.reis@exemplo.com", convenio: "Unimed", perfil: "cronico", produto: "glicosimetro", intervalo: 45, atraso: 3 },
  { nome: "Helena Souza Prado", cpf: "334.112.667-88", telefone: "(11) 99887-1103", email: null, convenio: null, perfil: "cronico", produto: "sinvastatina", intervalo: 30, atraso: 22 },
  { nome: "Rita de Cassia Moura", cpf: "445.667.889-12", telefone: "(11) 98220-7744", email: "rita.moura@exemplo.com", convenio: null, perfil: "cronico", produto: "omeprazol", intervalo: 35, atraso: 1 },
  { nome: "Paulo Henrique Dias", cpf: "556.778.990-23", telefone: "(11) 97110-2299", email: null, convenio: "Amil", perfil: "cronico", produto: "alprazolam", intervalo: 30, atraso: 18 },

  { nome: "Fernanda Lopes Cruz", cpf: "778.990.112-34", telefone: "(11) 98445-6677", email: "fernanda.cruz@exemplo.com", convenio: null, perfil: "recorrente", intervalo: 18 },
  { nome: "Bruno Tavares Melo", cpf: "889.001.223-45", telefone: "(11) 97556-3388", email: null, convenio: null, perfil: "recorrente", intervalo: 22 },
  { nome: "Camila Ferreira Nunes", cpf: "990.112.334-56", telefone: "(11) 98667-4499", email: "camila.nunes@exemplo.com", convenio: "Unimed", perfil: "recorrente", intervalo: 15 },
  { nome: "Eduardo Ramos Pinto", cpf: "101.223.445-67", telefone: "(11) 97778-5500", email: null, convenio: null, perfil: "recorrente", intervalo: 25 },
  { nome: "Patricia Gomes Leal", cpf: "212.334.556-78", telefone: "(11) 98889-6611", email: "patricia.leal@exemplo.com", convenio: "Bradesco Saude", perfil: "recorrente", intervalo: 20 },
  { nome: "Rodrigo Alves Costa", cpf: "323.445.667-89", telefone: "(11) 97990-7722", email: null, convenio: null, perfil: "recorrente", intervalo: 28 },
  { nome: "Juliana Castro Braga", cpf: "434.556.778-90", telefone: "(11) 98001-8833", email: "juliana.braga@exemplo.com", convenio: null, perfil: "recorrente", intervalo: 16 },

  { nome: "Marcelo Vieira Rocha", cpf: "545.667.889-01", telefone: "(11) 97112-9944", email: null, convenio: null, perfil: "esporadico" },
  { nome: "Tatiane Duarte Mendes", cpf: "656.778.990-12", telefone: "(11) 98223-1055", email: "tatiane.mendes@exemplo.com", convenio: null, perfil: "esporadico" },
  { nome: "Vinicius Barros Pires", cpf: "767.889.001-23", telefone: "(11) 97334-2166", email: null, convenio: null, perfil: "esporadico" },
  { nome: "Sandra Regina Peixoto", cpf: "878.990.112-34", telefone: "(11) 98445-3277", email: null, convenio: "Amil", perfil: "esporadico" },
  { nome: "Gustavo Nunes Ferraz", cpf: "989.001.223-45", telefone: "(11) 97556-4388", email: null, convenio: null, perfil: "esporadico" },

  { nome: "Isabela Martins Rosa", cpf: "190.112.334-56", telefone: "(11) 98667-5499", email: "isabela.rosa@exemplo.com", convenio: null, perfil: "inativo", diasSemComprar: 76 },
  { nome: "Carlos Eduardo Pinho", cpf: "201.223.445-67", telefone: "(11) 97778-6500", email: null, convenio: null, perfil: "inativo", diasSemComprar: 84 },
  { nome: "Vera Lucia Antunes", cpf: "312.334.556-78", telefone: "(11) 98889-7611", email: null, convenio: null, perfil: "inativo", diasSemComprar: 68 },
  { nome: "Ricardo Salles Moreira", cpf: "423.445.667-89", telefone: "(11) 97990-8722", email: null, convenio: null, perfil: "esporadico", aceita_contato: false, observacao: "Pediu para nao receber ligacao de oferta" },
  { nome: "Beatriz Camargo Silva", cpf: "534.556.778-90", telefone: "(11) 98001-9833", email: "beatriz.silva@exemplo.com", convenio: null, perfil: "novo" },

  // Clientes de balcão: aparecem no movimento do dia e às vezes se identificam.
  // Não têm ciclo próprio — a frequência deles sai do movimento da loja.
  { nome: "Aline Souto Maior", cpf: "645.667.889-01", telefone: "(11) 98112-4455", email: null, convenio: null, perfil: "avulso" },
  { nome: "Diego Fontes Ribeiro", cpf: "756.778.990-12", telefone: "(11) 97223-5566", email: null, convenio: null, perfil: "avulso" },
  { nome: "Elaine Cristina Motta", cpf: "867.889.001-23", telefone: "(11) 98334-6677", email: "elaine.motta@exemplo.com", convenio: "Unimed", perfil: "avulso" },
  { nome: "Fabio Junqueira Neves", cpf: "978.990.112-34", telefone: "(11) 97445-7788", email: null, convenio: null, perfil: "avulso" },
  { nome: "Gabriela Pontes Aguiar", cpf: "189.001.223-45", telefone: "(11) 98556-8899", email: null, convenio: null, perfil: "avulso" },
  { nome: "Henrique Bastos Lemos", cpf: "290.112.334-56", telefone: "(11) 97667-9900", email: null, convenio: "Amil", perfil: "avulso" },
  { nome: "Ivone Machado Teixeira", cpf: "301.223.445-67", telefone: "(11) 98778-1011", email: null, convenio: null, perfil: "avulso" },
  { nome: "Jonas Amaral Figueira", cpf: "412.334.556-78", telefone: "(11) 97889-2122", email: null, convenio: null, perfil: "avulso" },
  { nome: "Katia Nogueira Bastos", cpf: "523.445.667-89", telefone: "(11) 98990-3233", email: "katia.bastos@exemplo.com", convenio: null, perfil: "avulso" },
  { nome: "Leandro Prado Villela", cpf: "634.556.778-90", telefone: "(11) 97001-4344", email: null, convenio: null, perfil: "avulso" },
];

const MEDICOS = [
  { nome: "Dr. Rafael Toledo", crm: "CRM-SP 84512" },
  { nome: "Dra. Helena Prado", crm: "CRM-SP 122870" },
  { nome: "Dra. Camila Ferraz", crm: "CRM-SP 97340" },
  { nome: "Dr. Anselmo Bueno", crm: "CRM-SP 65401" },
  { nome: "Dra. Marina Coelho", crm: "CRM-SP 143902" },
];

const FORMAS_PAGAMENTO = [
  { forma: "pix", peso: 30 },
  { forma: "cartao_debito", peso: 26 },
  { forma: "dinheiro", peso: 24 },
  { forma: "cartao_credito", peso: 20 },
];

function sortearFormaPagamento() {
  const total = FORMAS_PAGAMENTO.reduce((soma, item) => soma + item.peso, 0);
  let ponto = sorteio.fracao() * total;
  for (const item of FORMAS_PAGAMENTO) {
    ponto -= item.peso;
    if (ponto <= 0) return item.forma;
  }
  return "dinheiro";
}

const CONTAS_PAGAR = [
  { descricao: "Nota fiscal 4521 - Distribuidora Panvel Norte", valor: 4820.75, vencimento: 12, fornecedor: "panvel", status: "pendente" },
  { descricao: "Nota fiscal 4487 - Farmalog Distribuicao", valor: 2310.4, vencimento: -5, fornecedor: "farmalog", status: "pendente" },
  { descricao: "Energia eletrica da loja - competencia do mes", valor: 1180.9, vencimento: 3, status: "pendente" },
  { descricao: "Aluguel da loja - mes corrente", valor: 6500.0, vencimento: 5, status: "pendente" },
  { descricao: "Aluguel da loja - mes anterior", valor: 6500.0, vencimento: -25, status: "pago", pago_dias: 24 },
  { descricao: "Energia eletrica da loja - mes anterior", valor: 1094.3, vencimento: -22, status: "pago", pago_dias: 21 },
  { descricao: "Mensalidade do sistema de gestao", valor: 349.9, vencimento: 8, status: "pendente" },
  { descricao: "Nota fiscal 1180 - MedSupply Correlatos", valor: 1745.3, vencimento: 19, fornecedor: "medsupply", status: "pendente" },
  { descricao: "Nota fiscal 2044 - Dermacenter Cosmeticos", valor: 2130.6, vencimento: -3, fornecedor: "dermacenter", status: "pendente" },
  { descricao: "Salarios e encargos - mes anterior", valor: 18400.0, vencimento: -20, status: "pago", pago_dias: 20 },
];

const CONTAS_RECEBER = [
  { origem: "convenio", descricao: "Convenio Unimed - competencia do mes anterior", valor: 3240.6, vencimento: 10, status: "pendente" },
  { origem: "convenio", descricao: "Convenio Bradesco Saude - competencia do mes anterior", valor: 1875.2, vencimento: -3, status: "pendente" },
  { origem: "convenio", descricao: "Convenio Amil - competencia do mes anterior", valor: 940.5, vencimento: 14, status: "pendente" },
  { origem: "venda_a_prazo", descricao: "Venda a prazo - Dona Cecilia Barbosa", valor: 189.9, vencimento: 5, status: "pendente" },
  { origem: "venda_a_prazo", descricao: "Venda a prazo - Antonio Carlos Reis", valor: 219.8, vencimento: -2, status: "pendente" },
  { origem: "convenio", descricao: "Convenio Unimed - dois meses atras", valor: 2980.0, vencimento: -25, status: "recebido", recebido_dias: 24 },
  { origem: "convenio", descricao: "Convenio Bradesco Saude - dois meses atras", valor: 1640.0, vencimento: -28, status: "recebido", recebido_dias: 27 },
];

const PEDIDOS_COMPRA = [
  { fornecedor: "panvel", status: "rascunho", dias: 0, hora: 8, minuto: 40, observacao: "Reposicao sugerida pelo estoque baixo", itens: [["azitromicina", 12, 21.5], ["amoxicilina", 20, 17.4]] },
  { fornecedor: "medsupply", status: "enviado", dias: 2, hora: 14, minuto: 20, observacao: "Confirmado por telefone com o vendedor", itens: [["termometro", 10, 18.4], ["fralda", 15, 21.0]] },
  { fornecedor: "dermacenter", status: "enviado", dias: 1, hora: 11, minuto: 15, observacao: "Campanha de verao", itens: [["protetor", 12, 31.0], ["shampoo", 10, 12.0]] },
  { fornecedor: "farmalog", status: "recebido", dias: 8, hora: 9, minuto: 10, observacao: "Entrega semanal", recebimento: { dias: 7, hora: 10, minuto: 35, observacao: "Faltaram duas caixas de omeprazol", itens: [["omeprazol", 18, 300], ["losartana", 24, 420]] }, itens: [["omeprazol", 20, 6.6], ["losartana", 24, 7.2]] },
  { fornecedor: "panvel", status: "recebido", dias: 22, hora: 8, minuto: 55, observacao: "Reposicao de analgesicos", recebimento: { dias: 21, hora: 9, minuto: 40, observacao: "Conferido sem divergencia", itens: [["dipirona", 60, 430], ["paracetamol", 40, 260]] }, itens: [["dipirona", 60, 4.1], ["paracetamol", 40, 5.0]] },
  { fornecedor: "medsupply", status: "cancelado", dias: 30, hora: 15, minuto: 5, observacao: "Fornecedor sem previsao de entrega", motivo_cancelamento: "Fornecedor sem estoque do item principal", itens: [["glicosimetro", 10, 60.0]] },
];

/**
 * Contatos de exemplo. `retorno` é quando ficou de voltar a falar (negativo já
 * venceu, positivo ainda vai chegar) e `desconto` é o que foi prometido — é o
 * que o balcão vê quando o cliente aparece.
 */
const CONTATOS_CRM = [
  { cliente: "Helena Souza Prado", dias: 6, canal: "telefone", motivo: "Recompra de uso continuo atrasada", oferta: "Reservar Sinvastatina com 5% de desconto", desconto: 5, retorno: -1, resultado: "interessado", observacao: "Pediu para separar e retirar no sabado" },
  { cliente: "Paulo Henrique Dias", dias: 4, canal: "whatsapp", motivo: "Recompra de uso continuo atrasada", oferta: "Reservar Alprazolam mediante receita", retorno: 0, resultado: "aguardando", observacao: "Vai passar no medico esta semana" },
  { cliente: "Isabela Martins Rosa", dias: 12, canal: "whatsapp", motivo: "Sem comprar ha mais de 60 dias", oferta: "10% de desconto na proxima compra", desconto: 10, retorno: -3, resultado: "nao_atendeu" },
  { cliente: "Carlos Eduardo Pinho", dias: 10, canal: "telefone", motivo: "Sem comprar ha mais de 60 dias", oferta: "10% de desconto na proxima compra", desconto: 10, resultado: "sem_interesse", observacao: "Mudou de bairro" },
  { cliente: "Dona Cecilia Barbosa", dias: 9, canal: "telefone", motivo: "Reposicao de fralda geriatrica", oferta: "Entrega em casa sem custo", resultado: "convertido", observacao: "Comprou dois pacotes no dia seguinte" },
  { cliente: "Marta Ribeiro Alves", dias: 20, canal: "presencial", motivo: "Cliente frequente", oferta: "Reserva mensal automatica de Losartana", desconto: 5, retorno: 2, resultado: "interessado" },
  { cliente: "Vera Lucia Antunes", dias: 15, canal: "email", motivo: "Sem comprar ha mais de 60 dias", oferta: "Desconto de 10% valido por 15 dias", desconto: 10, retorno: 5, resultado: "aguardando" },
  { cliente: "Antonio Carlos Reis", dias: 3, canal: "whatsapp", motivo: "Reposicao de tiras de glicosimetro", oferta: "Caixa reservada com desconto de convenio", desconto: 8, resultado: "convertido" },
];

/** Divide o saldo do produto entre os lotes, deixando mais no de validade longa. */
function distribuirSaldo(saldo, quantidadeLotes) {
  if (quantidadeLotes === 1) return [saldo];
  const primeiro = Math.max(Math.floor(saldo * 0.3), 1);
  return [primeiro, saldo - primeiro];
}

// ------------------------------------------------------------------ execução

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida. Configure o .env antes de rodar.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    options: `-c timezone=${FUSO}`,
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    // ------------------------------------------------ usuários e categorias
    const { rows: usuarios } = await client.query(
      `SELECT u.id, p.nome AS perfil
         FROM auth.usuarios u JOIN auth.perfis p ON p.id = u.perfil_id`
    );
    const porPerfil = {};
    for (const usuario of usuarios) porPerfil[usuario.perfil] = usuario.id;

    if (!porPerfil.gerente || !porPerfil.operador_caixa) {
      console.error('Usuários de desenvolvimento não encontrados. Rode "npm run seed" primeiro.');
      await client.query("ROLLBACK");
      process.exit(1);
    }

    const usuarioId = {
      gerente: porPerfil.gerente,
      caixa: porPerfil.operador_caixa,
      farmaceutico: porPerfil.farmaceutico ?? porPerfil.gerente,
    };
    const operadores = ["caixa", "gerente", "farmaceutico"];

    const { rows: categorias } = await client.query(`SELECT id, nome FROM estoque.categorias`);
    const categoriaId = {};
    for (const categoria of categorias) categoriaId[categoria.nome] = categoria.id;

    // ------------------------------------------------------------- limpeza
    await client.query(`
      TRUNCATE estoque.movimentacoes_estoque, estoque.historico_precos,
               estoque.lotes, estoque.produtos, estoque.fornecedores,
               vendas.contatos_cliente, vendas.receitas, vendas.pagamentos,
               vendas.itens_venda, vendas.vendas, vendas.clientes,
               financeiro.movimentacoes_caixa, financeiro.caixa,
               financeiro.contas_pagar, financeiro.contas_receber,
               fiscal.notas_fiscais, fiscal.controlados_sngpc,
               compras.itens_recebimento, compras.recebimentos,
               compras.itens_pedido, compras.pedidos
      CASCADE
    `);

    // --------------------------------------------------------- fornecedores
    const fornecedorId = {};
    await inserirEmLote(
      client,
      "estoque.fornecedores",
      ["id", "nome", "cnpj", "telefone", "email"],
      FORNECEDORES.map((fornecedor) => {
        const id = randomUUID();
        fornecedorId[fornecedor.chave] = id;
        return [id, fornecedor.nome, fornecedor.cnpj, fornecedor.telefone, fornecedor.email];
      })
    );

    // -------------------------------------------------------------- produtos
    const produtoPorChave = {};
    await inserirEmLote(
      client,
      "estoque.produtos",
      ["id", "nome", "principio_ativo", "fabricante", "classe_terapeutica", "codigo_barras", "tipo_controle", "unidade_venda", "ncm", "cfop", "preco_custo", "preco_venda", "estoque_minimo", "dias_de_uso", "categoria_id", "fornecedor_id", "criado_em"],
      PRODUTOS.map((produto) => {
        const id = randomUUID();
        produtoPorChave[produto.chave] = { ...produto, id };
        return [
          id,
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
          produto.dias_de_uso ?? null,
          categoriaId[produto.categoria] ?? null,
          fornecedorId[produto.fornecedor] ?? null,
          instante(DIAS_DE_HISTORICO + 30, 9, 0),
        ];
      })
    );

    // ----------------------------------------------------------------- lotes
    const lotes = [];
    for (const produto of Object.values(produtoPorChave)) {
      const validades = VALIDADES_POR_PRODUTO[produto.chave] ?? [365];
      const saldos = distribuirSaldo(produto.saldo, validades.length);

      validades.forEach((validade, indice) => {
        lotes.push({
          id: randomUUID(),
          produto,
          numero: `${produto.chave.slice(0, 3).toUpperCase()}-${2600 + indice * 7 + (produto.saldo % 13)}`,
          saldo: saldos[indice],
          validade,
          // O lote de validade mais curta chegou primeiro.
          entradaDiasAtras: Math.min(DIAS_DE_HISTORICO - 2, 25 + indice * 20),
          consumo: 0,
        });
      });
    }

    const lotePorProduto = {};
    for (const lote of lotes) {
      lotePorProduto[lote.produto.chave] = lotePorProduto[lote.produto.chave] ?? [];
      lotePorProduto[lote.produto.chave].push(lote);
    }
    for (const lista of Object.values(lotePorProduto)) lista.sort((a, b) => a.validade - b.validade);

    await inserirEmLote(
      client,
      "estoque.lotes",
      ["id", "produto_id", "numero_lote", "quantidade", "data_validade", "data_entrada"],
      lotes.map((lote) => [
        lote.id,
        lote.produto.id,
        lote.numero,
        lote.saldo,
        paraISO(dataDeDiasAtras(-lote.validade)),
        paraISO(dataDeDiasAtras(lote.entradaDiasAtras)),
      ])
    );

    // ------------------------------------------------------------- clientes
    const clientePorNome = {};
    await inserirEmLote(
      client,
      "vendas.clientes",
      ["id", "nome", "cpf", "telefone", "email", "convenio", "observacao", "aceita_contato", "criado_em"],
      CLIENTES.map((cliente) => {
        const id = randomUUID();
        clientePorNome[cliente.nome] = { ...cliente, id };
        return [
          id,
          cliente.nome,
          cliente.cpf,
          cliente.telefone,
          cliente.email,
          cliente.convenio,
          cliente.observacao ?? null,
          cliente.aceita_contato ?? true,
          instante(DIAS_DE_HISTORICO, 10, 0),
        ];
      })
    );

    // --------------------------------------------------- geração das vendas
    const catalogo = Object.values(produtoPorChave);
    const catalogoPorGiro = catalogo.flatMap((produto) => Array(produto.giro).fill(produto));
    const vendas = [];

    /** Lote que a regra FEFO usaria naquele dia (já recebido e não vencido). */
    function escolherLote(produto, diasAtras) {
      const lista = lotePorProduto[produto.chave];
      const disponiveis = lista.filter(
        (lote) => lote.entradaDiasAtras >= diasAtras && lote.validade > -diasAtras
      );
      return disponiveis[0] ?? lista[lista.length - 1];
    }

    function novaVenda({ diasAtras, hora, minuto, cliente, itens, operador, status = "finalizada" }) {
      const itensCompletos = itens
        .filter(Boolean)
        .map(([produto, quantidade]) => {
          const lote = escolherLote(produto, diasAtras);
          if (status === "finalizada") lote.consumo += quantidade;
          return { produto, quantidade, lote, preco: produto.preco_venda };
        });

      if (!itensCompletos.length) return;

      const bruto = itensCompletos.reduce((soma, item) => soma + item.quantidade * item.preco, 0);
      const desconto = sorteio.chance(0.1) ? dinheiro(Math.min(bruto * 0.05, 12)) : 0;
      const total = dinheiro(Math.max(bruto - desconto, 0));

      const controlados = itensCompletos.filter((item) => item.produto.tipo_controle !== "livre");
      const medico = controlados.length ? sorteio.escolher(MEDICOS) : null;

      const pagamentos = [];
      if (status === "finalizada") {
        if (sorteio.chance(0.12) && total > 40) {
          const parte = dinheiro(total * 0.4);
          pagamentos.push({ forma: "dinheiro", valor: parte });
          pagamentos.push({ forma: sortearFormaPagamento(), valor: dinheiro(total - parte) });
        } else {
          pagamentos.push({ forma: sortearFormaPagamento(), valor: total });
        }
      }

      vendas.push({
        id: randomUUID(),
        diasAtras,
        hora,
        minuto,
        cliente,
        operador,
        status,
        itens: itensCompletos,
        desconto,
        total,
        pagamentos,
        controlados,
        receita: medico
          ? {
              id: randomUUID(),
              medico,
              paciente: cliente?.nome ?? sorteio.escolher(CLIENTES).nome,
              emissaoDiasAtras: diasAtras + sorteio.inteiro(1, 20),
            }
          : null,
      });
    }

    /** Cesta de compra de quem não é crônico. */
    function cestaAleatoria() {
      const quantidadeItens = sorteio.chance(0.45) ? 1 : sorteio.chance(0.7) ? 2 : 3;
      const escolhidos = new Map();
      let tentativas = 0;

      while (escolhidos.size < quantidadeItens && tentativas < 20) {
        tentativas += 1;
        const produto = sorteio.escolher(catalogoPorGiro);
        // Controlado só sai com receita: fica raro na cesta de balcão.
        if (produto.tipo_controle !== "livre" && !sorteio.chance(0.25)) continue;
        escolhidos.set(produto.chave, [produto, produto.preco_venda > 60 ? 1 : sorteio.inteiro(1, 2)]);
      }

      if (!escolhidos.size) escolhidos.set("dipirona", [produtoPorChave.dipirona, 1]);
      return [...escolhidos.values()];
    }

    // 1) Compras dos clientes com padrão — é o que dá sentido ao CRM.
    for (const cliente of Object.values(clientePorNome)) {
      // Avulso só compra no movimento de balcão, mais abaixo.
      if (cliente.perfil === "avulso") continue;

      if (cliente.perfil === "novo") {
        novaVenda({
          diasAtras: sorteio.inteiro(2, 12),
          hora: sorteio.inteiro(9, 18),
          minuto: sorteio.inteiro(0, 59),
          cliente,
          operador: sorteio.escolher(operadores),
          itens: cestaAleatoria(),
        });
        continue;
      }

      if (cliente.perfil === "inativo") {
        // Comprava a cada ~20 dias e parou: o histórico existe, o hábito não.
        for (let compra = 0; compra < 4; compra += 1) {
          const diasAtras = cliente.diasSemComprar + compra * 20;
          if (diasAtras > DIAS_DE_HISTORICO) continue;
          novaVenda({
            diasAtras,
            hora: sorteio.inteiro(9, 18),
            minuto: sorteio.inteiro(0, 59),
            cliente,
            operador: sorteio.escolher(operadores),
            itens: cestaAleatoria(),
          });
        }
        continue;
      }

      if (cliente.perfil === "esporadico") {
        const compras = sorteio.inteiro(1, 3);
        for (let compra = 0; compra < compras; compra += 1) {
          novaVenda({
            diasAtras: sorteio.inteiro(5, DIAS_DE_HISTORICO - 5),
            hora: sorteio.inteiro(9, 19),
            minuto: sorteio.inteiro(0, 59),
            cliente,
            operador: sorteio.escolher(operadores),
            itens: cestaAleatoria(),
          });
        }
        continue;
      }

      // Crônico e recorrente: recompra no intervalo, última compra deslocada
      // pelo atraso — é esse atraso que o CRM aponta.
      const intervalo = cliente.intervalo;
      const atraso = cliente.atraso ?? sorteio.inteiro(0, Math.round(intervalo * 0.4));
      const produtoFixo = cliente.produto ? produtoPorChave[cliente.produto] : null;

      for (let ciclo = 0; ; ciclo += 1) {
        const diasAtras = atraso + ciclo * intervalo;
        if (diasAtras > DIAS_DE_HISTORICO - 2) break;

        const itens = produtoFixo
          ? [[produtoFixo, 1], ...(sorteio.chance(0.4) ? [cestaAleatoria()[0]] : [])]
          : cestaAleatoria();

        novaVenda({
          diasAtras,
          hora: sorteio.inteiro(9, 19),
          minuto: sorteio.inteiro(0, 59),
          cliente,
          operador: sorteio.escolher(operadores),
          itens,
        });
      }
    }

    // 2) Movimento de balcão, todos os dias menos domingo.
    //
    // O cliente identificado aqui é sempre esporádico ou recorrente. Crônico,
    // inativo e novo têm o próprio ciclo acima: colar compra avulsa neles
    // arruinaria o intervalo de recompra, que é justamente o que o CRM lê.
    const clientesDeBalcao = Object.values(clientePorNome).filter(
      (cliente) => cliente.perfil === "avulso"
    );

    for (let diasAtras = DIAS_DE_HISTORICO; diasAtras >= 0; diasAtras -= 1) {
      const diaDaSemana = dataDeDiasAtras(diasAtras).getUTCDay();
      if (diaDaSemana === 0) continue;

      const base = diaDaSemana === 6 ? 12 : 8;
      const quantidade = sorteio.inteiro(base, base + 5);

      for (let venda = 0; venda < quantidade; venda += 1) {
        novaVenda({
          diasAtras,
          hora: sorteio.inteiro(8, 19),
          minuto: sorteio.inteiro(0, 59),
          cliente: sorteio.chance(0.07) ? sorteio.escolher(clientesDeBalcao) : null,
          operador: sorteio.escolher(operadores),
          itens: cestaAleatoria(),
        });
      }
    }

    // 3) Uma venda aberta e uma cancelada hoje: a tela do dia mostra os três estados.
    novaVenda({
      diasAtras: 0,
      hora: 17,
      minuto: 5,
      cliente: null,
      operador: "caixa",
      itens: [[produtoPorChave.omeprazol, 1]],
      status: "aberta",
    });
    novaVenda({
      diasAtras: 0,
      hora: 16,
      minuto: 44,
      cliente: null,
      operador: "caixa",
      itens: [[produtoPorChave.azitromicina, 1]],
      status: "cancelada",
    });

    vendas.sort((a, b) => b.diasAtras - a.diasAtras || a.hora - b.hora);

    // -------------------------------------------------- gravação das vendas
    await inserirEmLote(
      client,
      "vendas.vendas",
      ["id", "usuario_id", "cliente_id", "status", "valor_total", "desconto", "motivo_cancelamento", "categoria_cancelamento", "criado_em", "finalizado_em"],
      vendas.map((venda) => {
        const abertura = instante(venda.diasAtras, venda.hora, venda.minuto);
        return [
          venda.id,
          usuarioId[venda.operador],
          venda.cliente?.id ?? null,
          venda.status,
          venda.status === "cancelada" ? 0 : venda.total,
          venda.desconto,
          venda.status === "cancelada" ? "Cliente desistiu da compra no caixa" : null,
          venda.status === "cancelada" ? "desistencia" : null,
          abertura,
          // O carrinho fecha alguns minutos depois de abrir; só a venda
          // finalizada tem data de finalização.
          venda.status === "finalizada"
            ? instante(venda.diasAtras, venda.hora, Math.min(venda.minuto + 4, 59))
            : null,
        ];
      })
    );

    await inserirEmLote(
      client,
      "vendas.itens_venda",
      ["venda_id", "produto_id", "lote_id", "quantidade", "preco_unitario", "produto_nome", "tipo_controle", "dias_de_uso"],
      vendas.flatMap((venda) =>
        venda.itens.map((item) => [
          venda.id,
          item.produto.id,
          item.lote.id,
          item.quantidade,
          item.preco,
          item.produto.nome,
          item.produto.tipo_controle,
          // Mesmo snapshot que a venda real grava: a duração valendo no dia.
          item.produto.dias_de_uso ?? null,
        ])
      )
    );

    await inserirEmLote(
      client,
      "vendas.pagamentos",
      ["venda_id", "forma_pagamento", "valor"],
      vendas.flatMap((venda) =>
        venda.pagamentos.map((pagamento) => [venda.id, pagamento.forma, pagamento.valor])
      )
    );

    const comReceita = vendas.filter((venda) => venda.receita && venda.status !== "cancelada");
    await inserirEmLote(
      client,
      "vendas.receitas",
      ["id", "venda_id", "medico_nome", "medico_crm", "paciente_nome", "data_emissao"],
      comReceita.map((venda) => [
        venda.receita.id,
        venda.id,
        venda.receita.medico.nome,
        venda.receita.medico.crm,
        venda.receita.paciente,
        paraISO(dataDeDiasAtras(venda.receita.emissaoDiasAtras)),
      ])
    );

    // --------------------------------------------------------------- fiscal
    const finalizadas = vendas.filter((venda) => venda.status === "finalizada");

    await inserirEmLote(
      client,
      "fiscal.notas_fiscais",
      ["venda_id", "chave_acesso", "status", "xml_url", "emitida_em"],
      finalizadas.map((venda) => {
        const chave = chaveAcessoSimulada(venda.id);
        return [
          venda.id,
          chave,
          "simulado",
          `/xml-simulado/${chave}.xml`,
          instante(venda.diasAtras, venda.hora, venda.minuto),
        ];
      })
    );

    await inserirEmLote(
      client,
      "fiscal.controlados_sngpc",
      ["venda_id", "produto_id", "receita_id", "enviado_anvisa", "enviado_em", "criado_em"],
      finalizadas.flatMap((venda) =>
        venda.receita
          ? venda.controlados.map((item) => [
              venda.id,
              item.produto.id,
              venda.receita.id,
              // Envio ao SNGPC em dia até uma semana atrás; o recente fica pendente.
              venda.diasAtras > 7,
              venda.diasAtras > 7 ? instante(venda.diasAtras - 1, 18, 0) : null,
              instante(venda.diasAtras, venda.hora, venda.minuto),
            ])
          : []
      )
    );

    // ---------------------------------------- perdas, ajustes e devoluções
    const AJUSTES = [
      { loteDe: "protetor", tipo: "perda", quantidade: 2, motivo: "Dois frascos danificados no transporte", dias: 9, usuario: "gerente" },
      { loteDe: "creme_dental", tipo: "ajuste", quantidade: 1, motivo: "Inventario mensal: contagem fisica uma unidade abaixo", dias: 4, usuario: "gerente" },
      { loteDe: "mascara", tipo: "devolucao", quantidade: 1, motivo: "Cliente devolveu caixa lacrada dentro do prazo", dias: 6, usuario: "caixa", entrada: true },
      { loteDe: "soro", tipo: "perda", quantidade: 3, motivo: "Frascos vencidos separados para descarte", dias: 2, usuario: "farmaceutico" },
      { loteDe: "alcool_gel", tipo: "ajuste", quantidade: 2, motivo: "Inventario: duas unidades a mais na contagem", dias: 13, usuario: "gerente", entrada: true },
    ];

    const movimentacoes = [];

    for (const ajuste of AJUSTES) {
      const lote = lotePorProduto[ajuste.loteDe][0];
      if (ajuste.entrada) lote.consumo -= ajuste.quantidade;
      else lote.consumo += ajuste.quantidade;

      // No ajuste a quantidade é o delta com sinal (sobra positiva, falta
      // negativa); nos outros tipos o sentido vem do tipo.
      const quantidade =
        ajuste.tipo === "ajuste"
          ? (ajuste.entrada ? ajuste.quantidade : -ajuste.quantidade)
          : ajuste.quantidade;

      movimentacoes.push([
        lote.produto.id,
        lote.id,
        ajuste.tipo,
        quantidade,
        ajuste.motivo,
        usuarioId[ajuste.usuario],
        instante(ajuste.dias, 10, 30),
      ]);
    }

    for (const venda of finalizadas) {
      for (const item of venda.itens) {
        movimentacoes.push([
          item.produto.id,
          item.lote.id,
          "saida",
          item.quantidade,
          `venda ${venda.id}`,
          usuarioId[venda.operador],
          instante(venda.diasAtras, venda.hora, venda.minuto),
        ]);
      }
    }

    // Entrada de cada lote = saldo de hoje + tudo que saiu dele.
    for (const lote of lotes) {
      movimentacoes.push([
        lote.produto.id,
        lote.id,
        "entrada",
        lote.saldo + lote.consumo,
        `Entrada do lote ${lote.numero}`,
        usuarioId.gerente,
        instante(lote.entradaDiasAtras, 8, 15),
      ]);
    }

    await inserirEmLote(
      client,
      "estoque.movimentacoes_estoque",
      ["produto_id", "lote_id", "tipo", "quantidade", "motivo", "usuario_id", "criado_em"],
      movimentacoes
    );

    // ---------------------------------------------------- histórico de preço
    await inserirEmLote(
      client,
      "estoque.historico_precos",
      ["produto_id", "campo", "valor_anterior", "valor_novo", "usuario_id", "criado_em"],
      [
        [produtoPorChave.dipirona.id, "preco_venda", 8.9, 9.9, usuarioId.gerente, instante(38, 9, 0)],
        [produtoPorChave.protetor.id, "preco_venda", 59.9, 64.9, usuarioId.gerente, instante(17, 9, 30)],
        [produtoPorChave.protetor.id, "preco_custo", 29.5, 32.0, usuarioId.gerente, instante(17, 9, 30)],
        [produtoPorChave.glicosimetro.id, "preco_venda", 99.9, 109.9, usuarioId.gerente, instante(11, 14, 0)],
        [produtoPorChave.mascara.id, "preco_venda", 34.9, 29.9, usuarioId.gerente, instante(52, 11, 0)],
      ]
    );

    // ---------------------------------------------------------------- caixa
    const caixasFechados = [];
    const movimentacoesCaixa = [];

    for (let diasAtras = DIAS_DE_HISTORICO; diasAtras >= 1; diasAtras -= 1) {
      const vendasDoDia = finalizadas.filter((venda) => venda.diasAtras === diasAtras);
      if (!vendasDoDia.length) continue;

      const abertura = 150;
      const entradas = vendasDoDia.reduce((soma, venda) => soma + venda.total, 0);
      const sangria = entradas > 400 ? 200 : 0;
      const esperado = dinheiro(abertura + entradas - sangria);
      // Divergência pequena de vez em quando, como na vida real.
      const divergencia = sorteio.chance(0.25) ? dinheiro((sorteio.fracao() - 0.5) * 8) : 0;
      const caixaId = randomUUID();

      caixasFechados.push([
        caixaId,
        usuarioId.caixa,
        abertura,
        esperado,
        dinheiro(esperado + divergencia),
        instante(diasAtras, 8, 50),
        instante(diasAtras, 19, 20),
      ]);

      for (const venda of vendasDoDia) {
        movimentacoesCaixa.push([
          caixaId,
          "entrada",
          venda.total,
          "venda",
          `Venda ${venda.id.slice(0, 8)}`,
          venda.id,
          instante(venda.diasAtras, venda.hora, venda.minuto),
        ]);
      }
      if (sangria) {
        movimentacoesCaixa.push([
          caixaId,
          "saida",
          sangria,
          "lancamento_manual",
          "Sangria: retirada de dinheiro da gaveta para o cofre",
          null,
          instante(diasAtras, 16, 0),
        ]);
      }
    }

    await inserirEmLote(
      client,
      "financeiro.caixa",
      ["id", "usuario_id", "valor_abertura", "valor_fechamento_esperado", "valor_fechamento_contado", "aberto_em", "fechado_em"],
      caixasFechados
    );

    // Hoje: um caixa aberto por operador que vendeu.
    const caixaHojeId = {};
    const vendasDeHoje = finalizadas.filter((venda) => venda.diasAtras === 0);
    const operadoresDeHoje = [...new Set(vendasDeHoje.map((venda) => venda.operador))];

    await inserirEmLote(
      client,
      "financeiro.caixa",
      ["id", "usuario_id", "valor_abertura", "aberto_em"],
      operadoresDeHoje.map((operador, indice) => {
        const id = randomUUID();
        caixaHojeId[operador] = id;
        return [id, usuarioId[operador], indice === 0 ? 200 : 150, instante(0, 8, 50 + indice * 6)];
      })
    );

    for (const venda of vendasDeHoje) {
      movimentacoesCaixa.push([
        caixaHojeId[venda.operador],
        "entrada",
        venda.total,
        "venda",
        `Venda ${venda.id.slice(0, 8)}`,
        venda.id,
        instante(0, venda.hora, venda.minuto),
      ]);
    }
    if (caixaHojeId.gerente) {
      movimentacoesCaixa.push([
        caixaHojeId.gerente,
        "saida",
        150,
        "lancamento_manual",
        "Sangria: retirada de dinheiro da gaveta para o cofre",
        null,
        instante(0, 16, 0),
      ]);
    }

    await inserirEmLote(
      client,
      "financeiro.movimentacoes_caixa",
      ["caixa_id", "tipo", "valor", "origem", "descricao", "venda_id", "criado_em"],
      movimentacoesCaixa
    );

    // --------------------------------------------------------------- contas
    await inserirEmLote(
      client,
      "financeiro.contas_pagar",
      ["fornecedor_id", "descricao", "valor", "vencimento", "status", "pago_em"],
      CONTAS_PAGAR.map((conta) => [
        conta.fornecedor ? fornecedorId[conta.fornecedor] : null,
        conta.descricao,
        conta.valor,
        paraISO(dataDeDiasAtras(-conta.vencimento)),
        conta.status,
        conta.pago_dias ? instante(conta.pago_dias, 11, 0) : null,
      ])
    );

    await inserirEmLote(
      client,
      "financeiro.contas_receber",
      ["origem", "descricao", "valor", "vencimento", "status", "recebido_em"],
      CONTAS_RECEBER.map((conta) => [
        conta.origem,
        conta.descricao,
        conta.valor,
        paraISO(dataDeDiasAtras(-conta.vencimento)),
        conta.status,
        conta.recebido_dias ? instante(conta.recebido_dias, 11, 0) : null,
      ])
    );

    // -------------------------------------------------------------- compras
    for (const pedido of PEDIDOS_COMPRA) {
      const itens = pedido.itens.map(([chave, quantidade, preco]) => ({
        produto: produtoPorChave[chave],
        quantidade,
        preco,
        itemId: randomUUID(),
      }));
      const total = itens.reduce((soma, item) => soma + item.quantidade * item.preco, 0);
      const pedidoId = randomUUID();

      await client.query(
        `INSERT INTO compras.pedidos
           (id, fornecedor_id, fornecedor_nome, status, observacao, motivo_cancelamento,
            valor_total, usuario_id, criado_em, enviado_em, recebido_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          pedidoId,
          fornecedorId[pedido.fornecedor],
          FORNECEDORES.find((registro) => registro.chave === pedido.fornecedor).nome,
          pedido.status,
          pedido.observacao,
          pedido.motivo_cancelamento ?? null,
          dinheiro(total),
          usuarioId.gerente,
          instante(pedido.dias, pedido.hora, pedido.minuto),
          pedido.status === "rascunho" ? null : instante(pedido.dias, pedido.hora, pedido.minuto + 20),
          pedido.recebimento
            ? instante(pedido.recebimento.dias, pedido.recebimento.hora, pedido.recebimento.minuto)
            : null,
        ]
      );

      await inserirEmLote(
        client,
        "compras.itens_pedido",
        ["id", "pedido_id", "produto_id", "produto_nome", "quantidade", "preco_unitario"],
        itens.map((item) => [
          item.itemId,
          pedidoId,
          item.produto.id,
          item.produto.nome,
          item.quantidade,
          item.preco,
        ])
      );

      if (!pedido.recebimento) continue;

      const conferidos = pedido.recebimento.itens.map(([chave, recebida, validade]) => {
        const original = itens.find((item) => item.produto.chave === chave);
        return { original, recebida, validade, divergencia: recebida - original.quantidade };
      });
      const recebimentoId = randomUUID();

      await client.query(
        `INSERT INTO compras.recebimentos
           (id, pedido_id, usuario_id, observacao, tem_divergencia, recebido_em)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          recebimentoId,
          pedidoId,
          usuarioId.gerente,
          pedido.recebimento.observacao,
          conferidos.some((item) => item.divergencia !== 0),
          instante(pedido.recebimento.dias, pedido.recebimento.hora, pedido.recebimento.minuto),
        ]
      );

      await inserirEmLote(
        client,
        "compras.itens_recebimento",
        ["recebimento_id", "item_pedido_id", "produto_id", "produto_nome", "quantidade_pedida", "quantidade_recebida", "numero_lote", "data_validade", "divergencia"],
        conferidos.map((item) => [
          recebimentoId,
          item.original.itemId,
          item.original.produto.id,
          item.original.produto.nome,
          item.original.quantidade,
          item.recebida,
          `${item.original.produto.chave.slice(0, 3).toUpperCase()}-REC${pedido.dias}`,
          paraISO(dataDeDiasAtras(-item.validade)),
          item.divergencia,
        ])
      );
    }

    // ------------------------------------------------------------ contatos
    await inserirEmLote(
      client,
      "vendas.contatos_cliente",
      ["cliente_id", "usuario_id", "canal", "motivo", "oferta", "observacao", "resultado", "proximo_contato_em", "desconto_pct", "criado_em"],
      CONTATOS_CRM.filter((contato) => clientePorNome[contato.cliente]).map((contato) => [
        clientePorNome[contato.cliente].id,
        usuarioId[sorteio.escolher(operadores)],
        contato.canal,
        contato.motivo,
        contato.oferta,
        contato.observacao ?? null,
        contato.resultado,
        contato.retorno === undefined ? null : diaCorrido(contato.retorno),
        contato.desconto ?? null,
        instante(contato.dias, sorteio.inteiro(9, 17), sorteio.inteiro(0, 59)),
      ])
    );

    await client.query("COMMIT");

    // ---------------------------------------------------------------- resumo
    const resumo = async (rotulo, sql) => {
      const { rows } = await client.query(sql);
      console.log(`${rotulo}: ${JSON.stringify(rows[0] ?? rows)}`);
    };

    console.log(`\nCenário de ${DIAS_DE_HISTORICO} dias criado.\n`);
    await resumo(
      "Produtos e lotes",
      `SELECT (SELECT COUNT(*)::int FROM estoque.produtos) AS produtos,
              (SELECT COUNT(*)::int FROM estoque.lotes) AS lotes,
              (SELECT SUM(quantidade)::int FROM estoque.lotes) AS unidades`
    );
    await resumo("Movimentacoes de estoque", `SELECT COUNT(*)::int AS total FROM estoque.movimentacoes_estoque`);
    await resumo(
      "Lotes com saldo divergente (deve ser 0)",
      `SELECT COUNT(*)::int AS problemas FROM (
         SELECT l.id
           FROM estoque.lotes l
           LEFT JOIN estoque.movimentacoes_estoque m ON m.lote_id = l.id
          GROUP BY l.id, l.quantidade
         HAVING l.quantidade <> COALESCE(SUM(CASE
                  WHEN m.tipo IN ('entrada','devolucao') THEN m.quantidade
                  WHEN m.tipo IN ('saida','perda') THEN -m.quantidade
                  WHEN m.tipo = 'ajuste' THEN m.quantidade END), 0)
       ) t`
    );
    await resumo(
      "Vendas",
      `SELECT COUNT(*)::int AS total, MIN(criado_em)::date AS primeira, MAX(criado_em)::date AS ultima
         FROM vendas.vendas`
    );
    await resumo("Vendas de hoje", `SELECT * FROM vendas.vw_vendas_hoje`);
    await resumo("Itens vendidos", `SELECT COUNT(*)::int AS linhas, SUM(quantidade)::int AS unidades FROM vendas.itens_venda`);
    await resumo(
      "Clientes",
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE aceita_contato)::int AS aceitam_contato
         FROM vendas.clientes`
    );
    await resumo(
      "Vendas com cliente identificado",
      `SELECT COUNT(*)::int AS total,
              ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM vendas.vendas), 0), 1) AS percentual
         FROM vendas.vendas WHERE cliente_id IS NOT NULL`
    );
    await resumo("Contatos de relacionamento", `SELECT COUNT(*)::int AS total FROM vendas.contatos_cliente`);
    await resumo(
      "Caixas",
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE fechado_em IS NULL)::int AS abertos
         FROM financeiro.caixa`
    );
    await resumo(
      "Alertas",
      `SELECT (SELECT COUNT(*)::int FROM estoque.vw_estoque_baixo) AS estoque_baixo,
              (SELECT COUNT(*)::int FROM estoque.vw_produtos_a_vencer WHERE dias_para_vencer <= 30)
                AS vencendo_30_dias`
    );
    await resumo(
      "Fiscal",
      `SELECT (SELECT COUNT(*)::int FROM fiscal.notas_fiscais) AS notas,
              (SELECT COUNT(*)::int FROM fiscal.controlados_sngpc) AS sngpc,
              (SELECT COUNT(*)::int FROM fiscal.controlados_sngpc WHERE NOT enviado_anvisa)
                AS sngpc_pendente`
    );
    await resumo(
      "Compras",
      `SELECT jsonb_object_agg(status, quantidade) AS por_status
         FROM (SELECT status, COUNT(*)::int AS quantidade FROM compras.pedidos GROUP BY status) t`
    );
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
