#!/usr/bin/env node
/**
 * Teste de integração dos seis módulos do backend: exercita cada rota da API
 * contra o banco de desenvolvimento e confere as regras de negócio que não
 * podem falhar.
 *
 * Uso: com o backend rodando (`npm run dev:api`), `npm run test:integracao`.
 *
 * Cria e movimenta dados reais no banco de desenvolvimento (produto de teste,
 * vendas, pedido de compra, contato de CRM). Não rodar contra produção.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const aqui = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(aqui, "..", ".env"), quiet: true });

const porta = (nome, padrao) => process.env[nome] ?? padrao;
const BASE = `http://localhost:${porta("PORT", 3000)}`;

// O backend é um processo só agora, mas cada módulo continua no seu prefixo
// (docs/API-CONTRATOS.md) — só muda pra quem já chamava sem prefixo antes.
const S = {
  auth: BASE,
  estoque: `${BASE}/estoque`,
  vendas: BASE,
  financeiro: `${BASE}/financeiro`,
  fiscal: `${BASE}/fiscal`,
  compras: BASE,
};

let falhas = 0;
let total = 0;
let secaoAtual = "";

function secao(nome) {
  secaoAtual = nome;
  console.log(`\n--- ${nome}`);
}

function ok(rotulo, condicao, extra = "") {
  total += 1;
  if (!condicao) falhas += 1;
  const marca = condicao ? "PASS" : "FALHA";
  console.log(`${marca} ${rotulo}${extra ? ` :: ${extra}` : ""}`);
}

async function req(url, { metodo = "GET", corpo, token, cru = false } = {}) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: {
      ...(corpo ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resposta.text();
  if (cru) return { status: resposta.status, texto, cabecalhos: resposta.headers };

  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { status: resposta.status, dados };
}

const hoje = new Date().toLocaleDateString("en-CA", { timeZone: process.env.TZ_NEGOCIO ?? "America/Sao_Paulo" });
const diasAtras = (dias) => {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data.toLocaleDateString("en-CA", { timeZone: process.env.TZ_NEGOCIO ?? "America/Sao_Paulo" });
};
const sufixo = String(Date.now()).slice(-6);

// ------------------------------------------------------------------ execução

secao("Saúde do backend");
const saude = await req(`${BASE}/health`);
ok("backend responde e alcança o banco", saude.status === 200 && saude.dados?.banco === "ok");

secao("auth-service");
const entrar = async (email) => {
  const resposta = await req(`${S.auth}/auth/login`, {
    metodo: "POST",
    corpo: { email, senha: "arkos123" },
  });
  return resposta.dados?.token;
};

const semSenha = await req(`${S.auth}/auth/login`, { metodo: "POST", corpo: { email: "x@y.com" } });
ok("login sem senha recusado", semSenha.status === 400);

const senhaErrada = await req(`${S.auth}/auth/login`, {
  metodo: "POST",
  corpo: { email: "gerente@arkos.com", senha: "errada" },
});
ok("senha errada devolve 401", senhaErrada.status === 401);

const gerente = await entrar("gerente@arkos.com");
const caixa = await entrar("caixa@arkos.com");
const farmaceutico = await entrar("farmaceutico@arkos.com");
const admin = await entrar("admin@arkos.com");
ok("os quatro perfis entram", Boolean(gerente && caixa && farmaceutico && admin));

const eu = await req(`${S.auth}/auth/me`, { token: gerente });
ok("/auth/me devolve perfil e permissões", eu.dados?.usuario?.perfil === "gerente");

const perfis = await req(`${S.auth}/auth/perfis`, { token: gerente });
ok("os 4 perfis padrão existem", perfis.dados?.perfis?.length === 4);

const usuariosComoGerente = await req(`${S.auth}/auth/usuarios`, { token: gerente });
ok("lista de usuários é só do administrador", usuariosComoGerente.status === 403);

const usuarios = await req(`${S.auth}/auth/usuarios`, { token: admin });
ok("administrador lista usuários", usuarios.status === 200 && usuarios.dados.usuarios.length >= 4);

const novoUsuario = await req(`${S.auth}/auth/usuarios`, {
  metodo: "POST",
  token: admin,
  corpo: { nome: `Teste ${sufixo}`, email: `teste.${sufixo}@arkos.com`, senha: "arkos123", perfil: "operador_caixa" },
});
ok("administrador cria usuário", novoUsuario.status === 201);

const desativado = await req(`${S.auth}/auth/usuarios/${novoUsuario.dados.usuario.id}`, {
  metodo: "PATCH",
  token: admin,
  corpo: { ativo: false },
});
ok("administrador desativa usuário", desativado.status === 200 && desativado.dados.usuario.ativo === false);

const inativoTentaEntrar = await req(`${S.auth}/auth/login`, {
  metodo: "POST",
  corpo: { email: `teste.${sufixo}@arkos.com`, senha: "arkos123" },
});
ok("usuário inativo não entra", inativoTentaEntrar.status === 403);

const simulado = await req(`${S.auth}/auth/simular`, {
  metodo: "POST",
  token: admin,
  corpo: { perfil: "operador_caixa" },
});
ok(
  "administrador simula operador de caixa",
  simulado.status === 200 && simulado.dados.usuario.perfil === "operador_caixa" &&
    simulado.dados.usuario.perfil_real === "administrador"
);

const simularComoGerente = await req(`${S.auth}/auth/simular`, {
  metodo: "POST",
  token: gerente,
  corpo: { perfil: "operador_caixa" },
});
ok("gerente não simula perfil", simularComoGerente.status === 403);

secao("estoque-service");
const categorias = await req(`${S.estoque}/categorias`, { token: gerente });
ok("categorias padrão cadastradas", categorias.dados.categorias.length >= 3);
const categoriaId = categorias.dados.categorias.find((c) => c.nome === "Medicamento").id;

const fornecedor = await req(`${S.estoque}/fornecedores`, {
  metodo: "POST",
  token: gerente,
  corpo: { nome: `Fornecedor Teste ${sufixo}`, cnpj: `11.111.111/${sufixo.slice(0, 4)}-1` },
});
ok("cria fornecedor", fornecedor.status === 201);

const cnpjLongo = await req(`${S.estoque}/fornecedores`, {
  metodo: "POST", token: gerente,
  corpo: { nome: "CNPJ longo", cnpj: "00.000.000/00000000-0000" },
});
ok("CNPJ acima do tamanho devolve 400, não 500", cnpjLongo.status === 400);

const fornecedorEditado = await req(`${S.estoque}/fornecedores/${fornecedor.dados.fornecedor.id}`, {
  metodo: "PATCH",
  token: gerente,
  corpo: { telefone: "(11) 5555-0000" },
});
ok("edita fornecedor", fornecedorEditado.status === 200 && fornecedorEditado.dados.fornecedor.telefone === "(11) 5555-0000");

const semFabricante = await req(`${S.estoque}/produtos`, {
  metodo: "POST",
  token: gerente,
  corpo: { nome: "Sem fabricante", categoria_id: categoriaId, codigo_barras: `1${sufixo}`, unidade_venda: "unidade", preco_venda: 10 },
});
ok("cadastro sem fabricante é recusado", semFabricante.status === 400);

const controladoSemClasse = await req(`${S.estoque}/produtos`, {
  metodo: "POST",
  token: gerente,
  corpo: {
    nome: "Controlado incompleto", fabricante: "Lab", categoria_id: categoriaId,
    codigo_barras: `2${sufixo}`, unidade_venda: "caixa", preco_venda: 30,
    tipo_controle: "tarja_preta", principio_ativo: "Teste",
  },
});
ok("controlado exige classe terapêutica", controladoSemClasse.status === 400);

const produtoLivre = await req(`${S.estoque}/produtos`, {
  metodo: "POST",
  token: gerente,
  corpo: {
    nome: `Produto Integracao ${sufixo}`, fabricante: "Lab Teste", categoria_id: categoriaId,
    fornecedor_id: fornecedor.dados.fornecedor.id, codigo_barras: `3${sufixo}`,
    unidade_venda: "caixa", principio_ativo: "Teste", tipo_controle: "livre",
    preco_custo: 5, preco_venda: 12, estoque_minimo: 4, ncm: "30049099", cfop: "5405",
  },
});
ok("cria produto de venda livre", produtoLivre.status === 201);
const produtoId = produtoLivre.dados.produto.id;

const produtoControlado = await req(`${S.estoque}/produtos`, {
  metodo: "POST",
  token: gerente,
  corpo: {
    nome: `Controlado Integracao ${sufixo}`, fabricante: "Lab Teste", categoria_id: categoriaId,
    codigo_barras: `4${sufixo}`, unidade_venda: "caixa", principio_ativo: "Teste controlado",
    classe_terapeutica: "psicotropico", tipo_controle: "tarja_preta",
    preco_custo: 10, preco_venda: 25, estoque_minimo: 2,
  },
});
ok("cria produto controlado", produtoControlado.status === 201);
const controladoId = produtoControlado.dados.produto.id;

const duplicado = await req(`${S.estoque}/produtos`, {
  metodo: "POST",
  token: gerente,
  corpo: {
    nome: "Duplicado", fabricante: "Lab", categoria_id: categoriaId,
    codigo_barras: `3${sufixo}`, unidade_venda: "caixa", preco_venda: 10,
  },
});
ok("código de barras repetido devolve 409", duplicado.status === 409);

const caixaCadastra = await req(`${S.estoque}/produtos`, {
  metodo: "POST",
  token: caixa,
  corpo: { nome: "X", fabricante: "Y", categoria_id: categoriaId, codigo_barras: `9${sufixo}`, unidade_venda: "unidade", preco_venda: 1 },
});
ok("operador de caixa não cadastra produto", caixaCadastra.status === 403);

const precoAlterado = await req(`${S.estoque}/produtos/${produtoId}`, {
  metodo: "PATCH", token: gerente, corpo: { preco_venda: 13.5 },
});
const detalheProduto = await req(`${S.estoque}/produtos/${produtoId}`, { token: gerente });
ok(
  "alteração de preço gera histórico",
  precoAlterado.status === 200 && detalheProduto.dados.historico_precos.some((h) => Number(h.valor_novo) === 13.5)
);

const loteVencido = await req(`${S.estoque}/lotes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: produtoId, numero_lote: "VENCIDO", quantidade: 5, data_validade: "2020-01-01" },
});
ok("lote vencido não entra", loteVencido.status === 422 && loteVencido.dados.erro === "produto_vencido");

const loteCurto = await req(`${S.estoque}/lotes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: produtoId, numero_lote: `CURTO-${sufixo}`, quantidade: 4, data_validade: diasAtras(-40) },
});
const loteLongo = await req(`${S.estoque}/lotes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: produtoId, numero_lote: `LONGO-${sufixo}`, quantidade: 20, data_validade: diasAtras(-400) },
});
await req(`${S.estoque}/lotes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: controladoId, numero_lote: `CTRL-${sufixo}`, quantidade: 6, data_validade: diasAtras(-300) },
});
ok("entrada de lote", loteCurto.status === 201 && loteLongo.status === 201);

const saidaFefo = await req(`${S.estoque}/movimentacoes`, {
  metodo: "POST", token: caixa,
  corpo: { produto_id: produtoId, tipo: "saida", quantidade: 6, motivo: "teste de integracao" },
});
const consumo = saidaFefo.dados?.saida?.lotes ?? [];
ok(
  "saída consome primeiro o lote de validade mais curta e atravessa lotes",
  saidaFefo.status === 201 && consumo.length === 2 && consumo[0].numero_lote === `CURTO-${sufixo}` &&
    consumo[0].quantidade === 4 && consumo[1].quantidade === 2,
  JSON.stringify(consumo.map((l) => `${l.numero_lote}:${l.quantidade}`))
);

const saidaExcessiva = await req(`${S.estoque}/movimentacoes`, {
  metodo: "POST", token: caixa,
  corpo: { produto_id: produtoId, tipo: "saida", quantidade: 9999, motivo: "teste" },
});
ok("saída acima do saldo é recusada", saidaExcessiva.status === 422 && saidaExcessiva.dados.erro === "estoque_insuficiente");

const ajusteSemMotivo = await req(`${S.estoque}/movimentacoes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: produtoId, lote_id: loteLongo.dados.lote.id, tipo: "ajuste", quantidade: 10 },
});
ok("ajuste sem justificativa é recusado", ajusteSemMotivo.status === 400);

const ajuste = await req(`${S.estoque}/movimentacoes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: produtoId, lote_id: loteLongo.dados.lote.id, tipo: "ajuste", quantidade: 15, motivo: "inventario de integracao" },
});
ok("ajuste aplica a contagem física", ajuste.status === 201 && ajuste.dados.lote.quantidade_atual === 15);

const perda = await req(`${S.estoque}/movimentacoes`, {
  metodo: "POST", token: gerente,
  corpo: { produto_id: produtoId, lote_id: loteLongo.dados.lote.id, tipo: "perda", quantidade: 1, motivo: "avaria de integracao" },
});
ok("perda reduz o saldo do lote", perda.status === 201 && perda.dados.lote.quantidade_atual === 14);

const porCodigo = await req(`${S.estoque}/produtos/codigo-barras/3${sufixo}`, { token: caixa });
ok("busca por código de barras", porCodigo.status === 200 && porCodigo.dados.produto.id === produtoId);

const alertaBaixo = await req(`${S.estoque}/alertas/estoque-baixo`, { token: gerente });
ok("alerta de estoque baixo responde", alertaBaixo.status === 200 && Array.isArray(alertaBaixo.dados.produtos));

const alertaValidade = await req(`${S.estoque}/alertas/vencimento?dias=60`, { token: gerente });
ok("alerta de validade aceita janela de 60 dias", alertaValidade.status === 200 && alertaValidade.dados.dias === 60);

const janelaInvalida = await req(`${S.estoque}/alertas/vencimento?dias=45`, { token: gerente });
ok("janela de validade fora do padrão é recusada", janelaInvalida.status === 400);

const relatorioEstoque = await req(`${S.estoque}/relatorios/estoque`, { token: gerente, cru: true });
ok(
  "planilha de posição de estoque sai com totais",
  relatorioEstoque.status === 200 && relatorioEstoque.texto.includes("Valor total em estoque pelo custo (R$)")
);

const relatorioMovimentacoes = await req(`${S.estoque}/relatorios/movimentacoes?de=${diasAtras(7)}&ate=${hoje}`, { token: gerente, cru: true });
ok(
  "planilha de movimentações sai com o saldo dos ajustes",
  relatorioMovimentacoes.status === 200 && relatorioMovimentacoes.texto.includes("Saldo dos ajustes de inventario")
);

secao("financeiro-service — caixa");
const statusInicial = await req(`${S.financeiro}/caixa/status`, { token: farmaceutico });
if (statusInicial.dados.caixa) {
  await req(`${S.financeiro}/caixa/${statusInicial.dados.caixa.id}/fechar`, {
    metodo: "POST", token: farmaceutico, corpo: { valor_fechamento_contado: 0 },
  });
}
const caixaAberto = await req(`${S.financeiro}/caixa/abrir`, {
  metodo: "POST", token: farmaceutico, corpo: { valor_abertura: 100 },
});
ok("abre caixa", caixaAberto.status === 201);

const segundoCaixa = await req(`${S.financeiro}/caixa/abrir`, {
  metodo: "POST", token: farmaceutico, corpo: { valor_abertura: 50 },
});
ok("segundo caixa do mesmo operador é recusado", segundoCaixa.status === 409);

const lancamentoManual = await req(`${S.financeiro}/caixa/movimentacoes`, {
  metodo: "POST", token: farmaceutico,
  corpo: { tipo: "saida", valor: 20, origem: "lancamento_manual", descricao: "sangria de integracao" },
});
ok("lançamento manual exige e aceita descrição", lancamentoManual.status === 201);

const manualSemDescricao = await req(`${S.financeiro}/caixa/movimentacoes`, {
  metodo: "POST", token: farmaceutico,
  corpo: { tipo: "saida", valor: 5, origem: "lancamento_manual" },
});
ok("lançamento manual sem descrição é recusado", manualSemDescricao.status === 400);

secao("vendas-service — PDV");
const clienteNovo = await req(`${S.vendas}/vendas/clientes`, {
  metodo: "POST", token: caixa,
  corpo: { nome: `Cliente Integracao ${sufixo}`, cpf: `999.888.${sufixo.slice(0, 3)}-0`, telefone: "(11) 90000-0000", convenio: "Unimed" },
});
ok("cadastra cliente", clienteNovo.status === 201);
const clienteId = clienteNovo.dados.cliente.id;

// CPF é opcional (minimização de dados, LGPD) — o cadastro não pode exigi-lo.
const clienteSemCpf = await req(`${S.vendas}/vendas/clientes`, {
  metodo: "POST", token: caixa,
  corpo: { nome: `Sem CPF ${sufixo}`, telefone: "(11) 90000-0001" },
});
ok(
  "cliente sem CPF é aceito",
  clienteSemCpf.status === 201 && clienteSemCpf.dados.cliente.cpf === null
);

const clienteSemTelefone = await req(`${S.vendas}/vendas/clientes`, {
  metodo: "POST", token: caixa,
  corpo: { nome: `Sem telefone ${sufixo}`, cpf: `999.777.${sufixo.slice(0, 3)}-0` },
});
ok("cliente sem telefone é recusado", clienteSemTelefone.status === 400);

const clientesPorValor = await req(`${S.vendas}/vendas/clientes?min_valor=999999`, { token: caixa });
ok("filtro de valor gasto reduz a lista", clientesPorValor.status === 200 && clientesPorValor.dados.clientes.length === 0);

const relatorioClientes = await req(`${S.vendas}/vendas/relatorios/clientes?busca=Integracao%20${sufixo}`, {
  token: gerente, cru: true,
});
ok(
  "planilha de clientes respeita o filtro",
  relatorioClientes.status === 200 && relatorioClientes.texto.includes("Clientes na lista;1")
);

const venda = await req(`${S.vendas}/vendas`, { metodo: "POST", token: farmaceutico });
ok("abre venda", venda.status === 201 && venda.dados.venda.status === "aberta");
const vendaId = venda.dados.venda.id;

const vincularCliente = await req(`${S.vendas}/vendas/${vendaId}/cliente`, {
  metodo: "POST", token: farmaceutico, corpo: { cliente_id: clienteId },
});
ok("vincula cliente à venda", vincularCliente.status === 200 && vincularCliente.dados.venda.cliente_id === clienteId);

const itemLivre = await req(`${S.vendas}/vendas/${vendaId}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: produtoId, quantidade: 2 },
});
ok("adiciona item livre", itemLivre.status === 201 && itemLivre.dados.exige_receita === false);

const itemControlado = await req(`${S.vendas}/vendas/${vendaId}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: controladoId, quantidade: 1 },
});
ok("item controlado sinaliza receita obrigatória", itemControlado.status === 201 && itemControlado.dados.exige_receita === true);

const itemDemais = await req(`${S.vendas}/vendas/${vendaId}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: produtoId, quantidade: 999 },
});
ok("carrinho recusa quantidade acima do saldo", itemDemais.status === 422 && itemDemais.dados.erro === "estoque_insuficiente");

const descontoAlto = await req(`${S.vendas}/vendas/${vendaId}/desconto`, {
  metodo: "POST", token: farmaceutico, corpo: { desconto_pct: 20 },
});
ok(
  "desconto acima do limite do perfil é bloqueado",
  descontoAlto.status === 422 && descontoAlto.dados.erro === "desconto_acima_do_limite"
);

// Item repetido soma na linha que ja existe em vez de duplicar o produto.
const itemRepetido = await req(`${S.vendas}/vendas/${vendaId}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: produtoId, quantidade: 1 },
});
const linhasDoProduto = itemRepetido.dados.venda.itens.filter((i) => i.produto_id === produtoId);
ok(
  "item repetido soma na mesma linha do carrinho",
  itemRepetido.status === 201 && linhasDoProduto.length === 1 && linhasDoProduto[0].quantidade === 3,
  `linhas=${linhasDoProduto.length} qtd=${linhasDoProduto[0]?.quantidade}`
);

const linhaDoProduto = linhasDoProduto[0];
const quantidadeAjustada = await req(`${S.vendas}/vendas/${vendaId}/itens/${linhaDoProduto.id}`, {
  metodo: "PATCH", token: farmaceutico, corpo: { quantidade: 2 },
});
ok(
  "quantidade da linha do carrinho pode ser corrigida",
  quantidadeAjustada.status === 200 &&
    quantidadeAjustada.dados.venda.itens.find((i) => i.id === linhaDoProduto.id).quantidade === 2
);

const quantidadeZero = await req(`${S.vendas}/vendas/${vendaId}/itens/${linhaDoProduto.id}`, {
  metodo: "PATCH", token: farmaceutico, corpo: { quantidade: 0 },
});
ok("quantidade zero e recusada", quantidadeZero.status === 400);

const descontoNoItem = await req(`${S.vendas}/vendas/${vendaId}/itens/${linhaDoProduto.id}/desconto`, {
  metodo: "POST", token: farmaceutico, corpo: { desconto: 1.5 },
});
ok(
  "desconto por item entra no total da venda",
  descontoNoItem.status === 200 &&
    Number(descontoNoItem.dados.venda.itens.find((i) => i.id === linhaDoProduto.id).desconto) === 1.5
);

const descontoMaiorQueOItem = await req(`${S.vendas}/vendas/${vendaId}/itens/${linhaDoProduto.id}/desconto`, {
  metodo: "POST", token: farmaceutico, corpo: { desconto: 9999 },
});
ok("desconto maior que o item e recusado", descontoMaiorQueOItem.status === 400);

// Volta o item a zero de desconto para as contas seguintes continuarem redondas.
await req(`${S.vendas}/vendas/${vendaId}/itens/${linhaDoProduto.id}/desconto`, {
  metodo: "POST", token: farmaceutico, corpo: { desconto: 0 },
});

const descontoOk = await req(`${S.vendas}/vendas/${vendaId}/desconto`, {
  metodo: "POST", token: farmaceutico, corpo: { desconto_pct: 5 },
});
const brutoEsperado = 13.5 * 2 + 25; // 2 do livre + 1 controlado
ok(
  "desconto em percentual converte para reais",
  descontoOk.status === 200 && Math.abs(descontoOk.dados.venda.desconto - brutoEsperado * 0.05) < 0.02,
  `desconto=${descontoOk.dados?.venda?.desconto}`
);

const pagamentoParcial = await req(`${S.vendas}/vendas/${vendaId}/pagamentos`, {
  metodo: "POST", token: farmaceutico, corpo: { forma_pagamento: "dinheiro", valor: 10 },
});
ok("registra pagamento", pagamentoParcial.status === 201);

const semReceita = await req(`${S.vendas}/vendas/${vendaId}/finalizar`, { metodo: "POST", token: farmaceutico });
ok(
  "BLOQUEIO DURO: controlado sem receita não finaliza",
  semReceita.status === 422 && semReceita.dados.erro === "receita_obrigatoria"
);

const pagamentoRemovido = await req(`${S.vendas}/vendas/${vendaId}/pagamentos/${pagamentoParcial.dados.pagamento.id}`, {
  metodo: "DELETE", token: farmaceutico,
});
ok(
  "remove forma de pagamento antes de finalizar",
  pagamentoRemovido.status === 200 && pagamentoRemovido.dados.venda.pagamentos.length === 0
);

const receitaIncompleta = await req(`${S.vendas}/vendas/${vendaId}/receita`, {
  metodo: "POST", token: farmaceutico, corpo: { medico_nome: "Dr. Teste" },
});
ok("receita incompleta é recusada", receitaIncompleta.status === 400);

const receita = await req(`${S.vendas}/vendas/${vendaId}/receita`, {
  metodo: "POST", token: farmaceutico,
  corpo: { medico_nome: "Dra. Integracao", medico_crm: "CRM-SP 000000", paciente_nome: `Cliente Integracao ${sufixo}`, data_emissao: diasAtras(3) },
});
ok("registra receita", receita.status === 201);

// Receita trocada ou digitada errada: da para desfazer enquanto a venda esta aberta.
const receitaRemovida = await req(`${S.vendas}/vendas/${vendaId}/receita`, {
  metodo: "DELETE", token: farmaceutico,
});
ok(
  "receita pode ser desvinculada antes de finalizar",
  receitaRemovida.status === 200 && !receitaRemovida.dados.venda.receita
);

const semReceitaDeNovo = await req(`${S.vendas}/vendas/${vendaId}/finalizar`, {
  metodo: "POST", token: farmaceutico,
});
ok(
  "tirar a receita volta a bloquear a venda do controlado",
  semReceitaDeNovo.status === 422 && semReceitaDeNovo.dados.erro === "receita_obrigatoria"
);

await req(`${S.vendas}/vendas/${vendaId}/receita`, {
  metodo: "POST", token: farmaceutico,
  corpo: { medico_nome: "Dra. Integracao", medico_crm: "CRM-SP 000000", paciente_nome: `Cliente Integracao ${sufixo}`, data_emissao: diasAtras(3) },
});

const vendaAtual = await req(`${S.vendas}/vendas/${vendaId}`, { token: farmaceutico });
const totalDaVenda = vendaAtual.dados.venda.valor_total;

const semPagamento = await req(`${S.vendas}/vendas/${vendaId}/finalizar`, { metodo: "POST", token: farmaceutico });
ok(
  "não finaliza sem pagamento suficiente",
  semPagamento.status === 422 && semPagamento.dados.erro === "pagamento_insuficiente"
);

await req(`${S.vendas}/vendas/${vendaId}/pagamentos`, {
  metodo: "POST", token: farmaceutico, corpo: { forma_pagamento: "pix", valor: Number((totalDaVenda - 5).toFixed(2)) },
});
await req(`${S.vendas}/vendas/${vendaId}/pagamentos`, {
  metodo: "POST", token: farmaceutico, corpo: { forma_pagamento: "dinheiro", valor: 10 },
});

const finalizada = await req(`${S.vendas}/vendas/${vendaId}/finalizar`, { metodo: "POST", token: farmaceutico });
ok(
  "venda finaliza com receita, pagamento misto e troco",
  finalizada.status === 200 && finalizada.dados.venda.status === "finalizada" && finalizada.dados.troco === 5,
  `troco=${finalizada.dados?.troco}`
);
// A emissão agora é real (Focus NFe, homologação — ver apps/api/src/modulos/fiscal).
// `produtoControlado` não tem NCM/CFOP cadastrado de propósito (linha acima), então a
// nota fica com status "erro" sem nunca chamar a Focus NFe de verdade — isso mantém o
// teste determinístico (não depende da SEFAZ estar no ar) e cobre exatamente a regra
// do enunciado: falta de dado fiscal é validada antes da emissão, e não bloqueia a venda
// (a asserção anterior já confirma que a venda finalizou normalmente).
ok(
  "nota fiscal tenta emitir de verdade e reporta erro por falta de NCM/CFOP",
  finalizada.dados?.nota_fiscal?.status === "erro" &&
    finalizada.dados.nota_fiscal.mensagem_erro?.includes("NCM/CFOP")
);

const jaFinalizada = await req(`${S.vendas}/vendas/${vendaId}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: produtoId, quantidade: 1 },
});
ok("venda finalizada não aceita item novo", jaFinalizada.status === 422);

const cancelarComoCaixa = await req(`${S.vendas}/vendas/${vendaId}/cancelar`, {
  metodo: "POST", token: caixa, corpo: { categoria: "orcamento", motivo: "teste" },
});
ok("operador de caixa não cancela venda", cancelarComoCaixa.status === 403);

// Cancelamento com motivo em lista fechada: e o que o relatorio consegue agrupar.
// Quem cancela e o gerente — o farmaceutico nao tem essa permissao.
const vendaParaCancelar = await req(`${S.vendas}/vendas`, { metodo: "POST", token: gerente, corpo: {} });
const idParaCancelar = vendaParaCancelar.dados.venda.id;
await req(`${S.vendas}/vendas/${idParaCancelar}/itens`, {
  metodo: "POST", token: gerente, corpo: { produto_id: produtoId, quantidade: 1 },
});

const cancelarSemCategoria = await req(`${S.vendas}/vendas/${idParaCancelar}/cancelar`, {
  metodo: "POST", token: gerente, corpo: { motivo: "cliente desistiu" },
});
ok("cancelamento sem motivo da lista e recusado", cancelarSemCategoria.status === 400);

const cancelado = await req(`${S.vendas}/vendas/${idParaCancelar}/cancelar`, {
  metodo: "POST", token: gerente, corpo: { categoria: "orcamento", motivo: "so queria saber o preco" },
});
ok(
  "cancelamento guarda a categoria escolhida",
  cancelado.status === 200 && cancelado.dados.venda.categoria_cancelamento === "orcamento"
);

ok(
  "venda recebe numero sequencial legivel",
  Number.isInteger(vendaParaCancelar.dados.venda.numero) && vendaParaCancelar.dados.venda.numero > 0,
  `numero=${vendaParaCancelar.dados?.venda?.numero}`
);

secao("vendas-service — histórico, análise e CRM");
const historico = await req(`${S.vendas}/vendas?de=${diasAtras(30)}&ate=${hoje}&controlado=sim`, { token: gerente });
ok(
  "histórico filtra por período e controlado, com totais",
  historico.status === 200 && historico.dados.vendas.every((v) => v.tem_controlado) && historico.dados.totais
);

const historicoBusca = await req(`${S.vendas}/vendas?de=${diasAtras(30)}&ate=${hoje}&busca=Integracao`, { token: gerente });
ok("histórico busca por texto", historicoBusca.status === 200 && historicoBusca.dados.vendas.length >= 1);

const statusInvalido = await req(`${S.vendas}/vendas?status=qualquer`, { token: gerente });
ok("status inválido no histórico é recusado", statusInvalido.status === 400);

const analise = await req(`${S.vendas}/vendas/analise?de=${diasAtras(30)}&ate=${hoje}`, { token: gerente });
ok(
  "análise devolve por produto, por dia e totais",
  analise.status === 200 && analise.dados.por_produto.length > 0 && analise.dados.por_dia.length > 0 &&
    analise.dados.totais.vendas > 0
);

// A duração do tratamento é o que permite prever recompra sem histórico.
const duracaoInvalida = await req(`${S.estoque}/produtos/${produtoId}`, {
  metodo: "PATCH", token: gerente, corpo: { dias_de_uso: 0 },
});
ok("duracao de uso zero e recusada no cadastro", duracaoInvalida.status === 400);

const comDuracao = await req(`${S.estoque}/produtos/${produtoId}`, {
  metodo: "PATCH", token: gerente, corpo: { dias_de_uso: 30 },
});
ok("cadastro aceita a duracao do tratamento", comDuracao.dados?.produto?.dias_de_uso === 30);

const vendaComDuracao = await req(`${S.vendas}/vendas`, { metodo: "POST", token: farmaceutico, corpo: {} });
const itemComDuracao = await req(`${S.vendas}/vendas/${vendaComDuracao.dados.venda.id}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: produtoId, quantidade: 1 },
});
ok(
  "item da venda guarda a duracao valida no dia da compra",
  itemComDuracao.dados.venda.itens[0].dias_de_uso === 30
);

const receitasRetidas = await req(`${S.vendas}/vendas/receitas?de=${diasAtras(30)}&ate=${hoje}`, { token: farmaceutico });
ok("lista receitas retidas", receitasRetidas.status === 200 && receitasRetidas.dados.receitas.length >= 1);

const crmResumo = await req(`${S.vendas}/vendas/crm/resumo`, { token: gerente });
ok(
  "resumo do CRM traz situações e contatos",
  crmResumo.status === 200 && typeof crmResumo.dados.situacoes.ativo === "number"
);

const crmFila = await req(`${S.vendas}/vendas/crm/clientes`, { token: caixa });
ok("fila de contato vem ordenada por prioridade", crmFila.status === 200 && crmFila.dados.clientes.length > 0);
const ordenada = crmFila.dados.clientes.every(
  (cliente, indice, lista) => indice === 0 || lista[indice - 1].prioridade >= cliente.prioridade
);
ok("prioridade em ordem decrescente", ordenada);
ok(
  "cada cliente da fila tem motivo, oferta e mensagem",
  crmFila.dados.clientes.every((cliente) => cliente.motivo && cliente.oferta && cliente.mensagem)
);

const crmAtrasados = await req(`${S.vendas}/vendas/crm/clientes?situacao=recompra_atrasada`, { token: gerente });
ok(
  "filtro por situação funciona",
  crmAtrasados.status === 200 &&
    crmAtrasados.dados.clientes.every((cliente) => cliente.situacao === "recompra_atrasada")
);

const fichaCliente = await req(`${S.vendas}/vendas/crm/clientes/${clienteId}`, { token: caixa });
ok(
  "ficha do cliente traz análise, compras e contatos",
  fichaCliente.status === 200 && fichaCliente.dados.cliente.id === clienteId &&
    Array.isArray(fichaCliente.dados.vendas) && Array.isArray(fichaCliente.dados.contatos)
);
ok(
  "compra da venda de teste aparece no histórico do cliente",
  fichaCliente.dados.vendas.some((v) => v.id === vendaId)
);

const contatoSemMotivo = await req(`${S.vendas}/vendas/crm/contatos`, {
  metodo: "POST", token: caixa, corpo: { cliente_id: clienteId, canal: "telefone" },
});
ok("contato sem motivo é recusado", contatoSemMotivo.status === 400);

const canalInvalido = await req(`${S.vendas}/vendas/crm/contatos`, {
  metodo: "POST", token: caixa, corpo: { cliente_id: clienteId, canal: "pombo", motivo: "teste" },
});
ok("canal inválido é recusado", canalInvalido.status === 400);

const contato = await req(`${S.vendas}/vendas/crm/contatos`, {
  metodo: "POST", token: caixa,
  corpo: {
    cliente_id: clienteId, canal: "whatsapp", motivo: "Recompra prevista",
    oferta: "5% na reposicao", observacao: "teste de integracao",
  },
});
ok("registra contato com o cliente", contato.status === 201 && contato.dados.contato.resultado === "aguardando");

const contatoAtualizado = await req(`${S.vendas}/vendas/crm/contatos/${contato.dados.contato.id}`, {
  metodo: "PATCH", token: caixa, corpo: { resultado: "convertido" },
});
ok("atualiza resultado do contato", contatoAtualizado.status === 200 && contatoAtualizado.dados.contato.resultado === "convertido");

const contatosListados = await req(`${S.vendas}/vendas/crm/contatos`, { token: gerente });
ok(
  "contato aparece na agenda",
  contatosListados.status === 200 && contatosListados.dados.contatos.some((c) => c.id === contato.dados.contato.id)
);

// -------------------------------------------------- ciclo do contato fechado

const emDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

const retornoNoPassado = await req(`${S.vendas}/vendas/crm/contatos`, {
  metodo: "POST", token: caixa,
  corpo: { cliente_id: clienteId, canal: "telefone", motivo: "x", proximo_contato_em: "2020-01-01" },
});
ok("retorno agendado para o passado e recusado", retornoNoPassado.status === 400);

const ofertaImpossivel = await req(`${S.vendas}/vendas/crm/contatos`, {
  metodo: "POST", token: caixa,
  corpo: { cliente_id: clienteId, canal: "telefone", motivo: "x", desconto_pct: 150 },
});
ok("desconto de oferta acima de 100 e recusado", ofertaImpossivel.status === 400);

const contatoComRetorno = await req(`${S.vendas}/vendas/crm/contatos`, {
  metodo: "POST", token: caixa,
  corpo: {
    cliente_id: clienteId, canal: "telefone", motivo: "Reposicao do uso continuo",
    oferta: "10% na reposicao", desconto_pct: 10, proximo_contato_em: emDias(3),
  },
});
ok(
  "contato guarda o retorno combinado e o desconto prometido",
  contatoComRetorno.status === 201 &&
    contatoComRetorno.dados.contato.proximo_contato_em &&
    Number(contatoComRetorno.dados.contato.desconto_pct) === 10
);

const retornosPendentes = await req(`${S.vendas}/vendas/crm/retornos`, { token: caixa });
ok(
  "retorno entra na lista de pendentes com o atraso calculado",
  retornosPendentes.status === 200 &&
    retornosPendentes.dados.retornos.some(
      (r) => r.cliente_id === clienteId && r.dias_de_atraso < 0
    )
);

// A oferta feita no telefone tem de chegar ao balcão, senão a promessa se perde.
const fichaComOferta = await req(`${S.vendas}/vendas/crm/clientes/${clienteId}`, { token: caixa });
ok(
  "ficha do cliente mostra a oferta que ficou de pe",
  Number(fichaComOferta.dados.oferta_aberta?.desconto_pct) === 10
);

// Quem acabou de ser chamado sai da fila — insistir no dia seguinte desgasta.
const filaComSilencio = await req(`${S.vendas}/vendas/crm/clientes`, { token: caixa });
ok(
  "cliente recem-contatado sai da fila",
  !filaComSilencio.dados.clientes.some((c) => c.id === clienteId) &&
    filaComSilencio.dados.em_silencio >= 1,
  `em_silencio=${filaComSilencio.dados.em_silencio}`
);

const filaSemFiltro = await req(`${S.vendas}/vendas/crm/clientes?incluir_silencio=sim`, { token: caixa });
const emSilencio = filaSemFiltro.dados.clientes.find((c) => c.id === clienteId);
ok(
  "da para ver quem esta em silencio e ate quando",
  Boolean(emSilencio?.silencio_motivo) && emSilencio.silencio_dias_restantes > 0
);

// A conversão é medida pelo caixa, não pelo que alguém marcou na lista.
const vendaDoContato = await req(`${S.vendas}/vendas`, { metodo: "POST", token: farmaceutico, corpo: {} });
const idVendaContato = vendaDoContato.dados.venda.id;
await req(`${S.vendas}/vendas/${idVendaContato}/cliente`, {
  metodo: "POST", token: farmaceutico, corpo: { cliente_id: clienteId },
});
await req(`${S.vendas}/vendas/${idVendaContato}/itens`, {
  metodo: "POST", token: farmaceutico, corpo: { produto_id: produtoId, quantidade: 1 },
});
const totalDoContato = (await req(`${S.vendas}/vendas/${idVendaContato}`, { token: farmaceutico }))
  .dados.venda.valor_total;
await req(`${S.vendas}/vendas/${idVendaContato}/pagamentos`, {
  metodo: "POST", token: farmaceutico,
  corpo: { forma_pagamento: "pix", valor: totalDoContato },
});
const vendaFechada = await req(`${S.vendas}/vendas/${idVendaContato}/finalizar`, {
  metodo: "POST", token: farmaceutico,
});
ok(
  "a venda amarra sozinha o contato que a provocou",
  vendaFechada.status === 200 &&
    vendaFechada.dados.contato_convertido?.venda_id === idVendaContato,
  `contato=${vendaFechada.dados?.contato_convertido?.id}`
);

const contatosMedidos = await req(`${S.vendas}/vendas/crm/contatos`, { token: gerente });
const medido = contatosMedidos.dados.contatos.find(
  (c) => c.id === contatoComRetorno.dados.contato.id
);
ok(
  "conversao do contato vem da venda real, com os dias ate a compra",
  medido?.venda_apos_contato_id === idVendaContato && medido.dias_ate_a_compra >= 0,
  `dias=${medido?.dias_ate_a_compra}`
);

const fichaDepoisDaCompra = await req(`${S.vendas}/vendas/crm/clientes/${clienteId}`, { token: caixa });
ok("oferta deixa de ficar em aberto depois da compra", fichaDepoisDaCompra.dados.oferta_aberta === null);

const resumoComCiclo = await req(`${S.vendas}/vendas/crm/resumo`, { token: gerente });
ok(
  "resumo traz conversao medida, retornos e silencio",
  resumoComCiclo.dados.contatos.com_compra_depois >= 1 &&
    typeof resumoComCiclo.dados.contatos.conversao_pct === "number" &&
    typeof resumoComCiclo.dados.retornos.total === "number" &&
    typeof resumoComCiclo.dados.em_silencio === "number",
  `conversao=${resumoComCiclo.dados.contatos.conversao_pct}%`
);

const clienteSemContato = await req(`${S.vendas}/vendas/clientes/${clienteId}`, {
  metodo: "PATCH", token: caixa, corpo: { aceita_contato: false },
});
ok("cliente pode pedir para não receber oferta", clienteSemContato.status === 200);

// Com incluir_silencio=sim o único motivo que pode tirá-lo da lista é a recusa
// de contato — sem isso o teste passaria pelo motivo errado.
const filaSemEle = await req(`${S.vendas}/vendas/crm/clientes?incluir_silencio=sim`, { token: caixa });
ok(
  "quem não aceita contato sai da fila",
  !filaSemEle.dados.clientes.some((cliente) => cliente.id === clienteId)
);

const relatorioVendas = await req(`${S.vendas}/vendas/relatorio?de=${diasAtras(7)}&ate=${hoje}`, { token: gerente, cru: true });
ok("planilha de vendas sai com ticket médio", relatorioVendas.status === 200 && relatorioVendas.texto.includes("Ticket medio (R$)"));

const relatorioProduto = await req(`${S.vendas}/vendas/relatorio?de=${diasAtras(7)}&ate=${hoje}&agrupar=produto`, { token: gerente, cru: true });
ok("planilha por produto sai com receita", relatorioProduto.status === 200 && relatorioProduto.texto.includes("Receita (R$)"));

secao("financeiro-service — contas e visão geral");
const caixaDepois = await req(`${S.financeiro}/caixa/status`, { token: farmaceutico });
ok(
  "venda finalizada entrou no caixa do operador",
  caixaDepois.dados.movimentacoes.some((m) => m.venda_id === vendaId),
);

const contaPagar = await req(`${S.financeiro}/contas-pagar`, {
  metodo: "POST", token: gerente,
  corpo: { descricao: `Conta integracao ${sufixo}`, valor: 250.5, vencimento: diasAtras(-10) },
});
ok("cria conta a pagar", contaPagar.status === 201);

const contaQuitada = await req(`${S.financeiro}/contas-pagar/${contaPagar.dados.conta.id}/pagar`, {
  metodo: "PATCH", token: gerente,
});
ok("quita conta a pagar", contaQuitada.status === 200 && contaQuitada.dados.conta.status === "pago");

const quitarDeNovo = await req(`${S.financeiro}/contas-pagar/${contaPagar.dados.conta.id}/pagar`, {
  metodo: "PATCH", token: gerente,
});
ok("conta já paga não é quitada de novo", quitarDeNovo.status === 422);

const contaReceber = await req(`${S.financeiro}/contas-receber`, {
  metodo: "POST", token: gerente,
  corpo: { origem: "convenio", descricao: `Convenio integracao ${sufixo}`, valor: 400, vencimento: diasAtras(-5) },
});
ok("cria conta a receber", contaReceber.status === 201);

const recebida = await req(`${S.financeiro}/contas-receber/${contaReceber.dados.conta.id}/receber`, {
  metodo: "PATCH", token: gerente,
});
ok("baixa conta a receber", recebida.status === 200 && recebida.dados.conta.status === "recebido");

const contasComoCaixa = await req(`${S.financeiro}/contas-pagar`, {
  metodo: "POST", token: caixa, corpo: { descricao: "x", valor: 1, vencimento: hoje },
});
ok("operador de caixa não lança conta", contasComoCaixa.status === 403);

const visaoGeral = await req(`${S.financeiro}/visao-geral`, { token: gerente });
ok(
  "visão geral cruza pagar e receber por faixa",
  visaoGeral.status === 200 && typeof visaoGeral.dados.saldo_projetado === "number" &&
    visaoGeral.dados.a_pagar.por_faixa && visaoGeral.dados.a_receber.por_faixa
);

const visaoComoCaixa = await req(`${S.financeiro}/visao-geral`, { token: caixa });
ok("visão geral é restrita a quem vê financeiro", visaoComoCaixa.status === 403);

const fluxo = await req(`${S.financeiro}/fluxo-caixa/hoje`, { token: gerente });
ok("fluxo do dia junta caixa e vendas", fluxo.status === 200 && fluxo.dados.vendas);

const relatorioCaixa = await req(`${S.financeiro}/relatorios/caixa?de=${diasAtras(7)}&ate=${hoje}`, { token: gerente, cru: true });
ok("planilha de caixa sai com divergências", relatorioCaixa.status === 200 && relatorioCaixa.texto.includes("divergencias"));

const relatorioContas = await req(`${S.financeiro}/relatorios/contas?tipo=pagar&de=${diasAtras(40)}&ate=${diasAtras(-40)}`, { token: gerente, cru: true });
ok("planilha de contas sai com atrasado", relatorioContas.status === 200 && relatorioContas.texto.includes("Total atrasado (R$)"));

const periodoInvertido = await req(`${S.financeiro}/relatorios/caixa?de=${hoje}&ate=${diasAtras(10)}`, { token: gerente });
ok("período invertido é recusado", periodoInvertido.status === 400);

secao("fiscal-service");
// Mesma venda do bloco de vendas acima: tinha item controlado sem NCM/CFOP
// (produtoControlado, criado sem esses campos de propósito), então a nota
// ficou com status "erro" — nunca chegou a chamar a Focus NFe de verdade.
const notaDaVenda = await req(`${S.fiscal}/notas-fiscais/${vendaId}`, { token: gerente });
ok(
  "nota da venda é consultável",
  notaDaVenda.status === 200 &&
    notaDaVenda.dados.nota.status === "erro" &&
    notaDaVenda.dados.nota.mensagem_erro?.includes("NCM/CFOP")
);

const reemissao = await req(`${S.fiscal}/notas-fiscais`, {
  metodo: "POST", token: gerente, corpo: { venda_id: vendaId },
});
ok(
  "reemitir uma nota com erro tenta de novo — dado incompleto continua incompleto, mesmo diagnóstico",
  reemissao.status === 200 && reemissao.dados.reemitida === true && reemissao.dados.nota.status === "erro"
);

const notas = await req(`${S.fiscal}/notas-fiscais?de=${diasAtras(7)}&ate=${hoje}`, { token: gerente });
ok("lista notas do período", notas.status === 200 && notas.dados.notas.length >= 1);

const sngpc = await req(`${S.fiscal}/controlados-sngpc?venda_id=${vendaId}`, { token: farmaceutico });
ok("controlado da venda entrou no SNGPC", sngpc.status === 200 && sngpc.dados.registros.length >= 1);
ok("registro nasce pendente de envio", sngpc.dados.registros[0].enviado_anvisa === false);

const envioSngpc = await req(`${S.fiscal}/controlados-sngpc/enviar`, {
  metodo: "POST", token: farmaceutico, corpo: { ids: [sngpc.dados.registros[0].id] },
});
ok("marca registro como enviado, avisando que é simulado", envioSngpc.status === 200 && envioSngpc.dados.enviados === 1 && envioSngpc.dados.aviso);

const envioComoCaixa = await req(`${S.fiscal}/controlados-sngpc/enviar`, {
  metodo: "POST", token: caixa, corpo: { ids: [sngpc.dados.registros[0].id] },
});
ok("envio ao SNGPC exige quem valida receita", envioComoCaixa.status === 403);

secao("compras-service");
const sugestao = await req(`${S.compras}/compras/sugestao`, { token: gerente });
ok("sugestão de compra vem do estoque baixo", sugestao.status === 200 && Array.isArray(sugestao.dados.sugestoes));

const pedido = await req(`${S.compras}/compras/pedidos`, {
  metodo: "POST", token: gerente,
  corpo: {
    fornecedor_id: fornecedor.dados.fornecedor.id,
    forma_pagamento: "pix",
    frete: 10,
    desconto: 5,
    itens: [{ produto_id: produtoId, quantidade: 10, preco_unitario: 5 }],
  },
});
// 10 x 5 = 50, mais 10 de frete, menos 5 de desconto.
ok("cria pedido de compra com frete e desconto no total", pedido.status === 201 && Number(pedido.dados.pedido.valor_total) === 55);
ok("pedido nasce pendente de entrega", pedido.dados.pedido.status === "pendente_entrega");
ok("pedido recebe número padronizado", /^PC-\d{4}-\d{5}$/.test(pedido.dados.pedido.numero ?? ""));
const pedidoId = pedido.dados.pedido.id;

const descontoMaior = await req(`${S.compras}/compras/pedidos`, {
  metodo: "POST", token: gerente,
  corpo: {
    fornecedor_id: fornecedor.dados.fornecedor.id,
    desconto: 9999,
    itens: [{ produto_id: produtoId, quantidade: 1, preco_unitario: 5 }],
  },
});
ok("desconto maior que o pedido é recusado", descontoMaior.status === 400);

const ordemPdf = await req(`${S.compras}/compras/pedidos/${pedidoId}/ordem-de-compra.pdf`, { token: gerente, cru: true });
ok(
  "ordem de compra sai em PDF",
  ordemPdf.status === 200 && ordemPdf.texto.startsWith("%PDF-") && ordemPdf.texto.includes(pedido.dados.pedido.numero)
);

const semLote = await req(`${S.compras}/compras/pedidos/${pedidoId}/receber`, {
  metodo: "POST", token: gerente,
  corpo: { itens: [{ item_pedido_id: pedido.dados.pedido.itens[0].id, quantidade_recebida: 10 }] },
});
ok("recebimento exige lote e validade", semLote.status === 400);

const saldoAntes = (await req(`${S.estoque}/produtos/${produtoId}`, { token: gerente })).dados.produto.quantidade_atual;

const recebido = await req(`${S.compras}/compras/pedidos/${pedidoId}/receber`, {
  metodo: "POST", token: gerente,
  corpo: {
    entregue_em: hoje,
    itens: [{
      item_pedido_id: pedido.dados.pedido.itens[0].id,
      quantidade_recebida: 8,
      numero_lote: `REC-${sufixo}`,
      data_validade: diasAtras(-500),
    }],
  },
});
ok(
  "recebimento parcial não bloqueia a entrada",
  recebido.status === 200 && recebido.dados.recebimento.tem_divergencia && recebido.dados.alerta_divergencia.length === 1
);
ok("recebimento grava a data de entrega", recebido.dados.pedido.entregue_em?.slice(0, 10) === hoje);
// 8 x 5 = 40 de itens, mais 80% do saldo de frete e desconto (10 - 5 = 5).
ok("conta a pagar usa o valor recebido com frete e desconto proporcionais", Number(recebido.dados.conta_pagar?.valor) === 44);

const saldoDepois = (await req(`${S.estoque}/produtos/${produtoId}`, { token: gerente })).dados.produto.quantidade_atual;
ok("estoque recebeu as 8 unidades", saldoDepois === saldoAntes + 8, `${saldoAntes} -> ${saldoDepois}`);

const receberDeNovo = await req(`${S.compras}/compras/pedidos/${pedidoId}/receber`, {
  metodo: "POST", token: gerente,
  corpo: { itens: [{ item_pedido_id: pedido.dados.pedido.itens[0].id, quantidade_recebida: 1, numero_lote: "X", data_validade: diasAtras(-100) }] },
});
ok("pedido recebido não é recebido de novo", receberDeNovo.status === 422);

const pedidoCaixa = await req(`${S.compras}/compras/pedidos`, {
  metodo: "POST", token: caixa,
  corpo: { fornecedor_id: fornecedor.dados.fornecedor.id, itens: [{ produto_id: produtoId, quantidade: 1, preco_unitario: 1 }] },
});
ok("operador de caixa não cria pedido de compra", pedidoCaixa.status === 403);

const relatorioPedidos = await req(`${S.compras}/compras/relatorios/pedidos?de=${diasAtras(7)}&ate=${hoje}`, { token: gerente, cru: true });
ok("planilha de pedidos sai com o total pedido", relatorioPedidos.status === 200 && relatorioPedidos.texto.includes("Valor total pedido"));

const relatorioFiltrado = await req(
  `${S.compras}/compras/relatorios/pedidos?de=${diasAtras(7)}&ate=${hoje}&busca=${pedido.dados.pedido.numero}`,
  { token: gerente, cru: true }
);
ok(
  "planilha respeita o filtro da tela",
  relatorioFiltrado.status === 200 && relatorioFiltrado.texto.includes("Pedidos na lista;1")
);

const pedidosBuscados = await req(
  `${S.compras}/compras/pedidos?busca=${pedido.dados.pedido.numero}`,
  { token: gerente }
);
ok("busca de pedido acha pelo número", pedidosBuscados.status === 200 && pedidosBuscados.dados.pedidos.length === 1);

secao("Autenticação exigida em todos os serviços");
for (const [nome, url] of [
  ["estoque", `${S.estoque}/produtos`],
  ["vendas", `${S.vendas}/vendas`],
  ["financeiro", `${S.financeiro}/caixa/status`],
  ["fiscal", `${S.fiscal}/notas-fiscais`],
  ["compras", `${S.compras}/compras/pedidos`],
]) {
  const semToken = await req(url);
  ok(`${nome} recusa requisição sem token`, semToken.status === 401);
}

// -------------------------------------------------------------------- limpeza
secao("Encerramento");
const caixaFinal = await req(`${S.financeiro}/caixa/status`, { token: farmaceutico });
if (caixaFinal.dados.caixa) {
  const fechamento = await req(`${S.financeiro}/caixa/${caixaFinal.dados.caixa.id}/fechar`, {
    metodo: "POST", token: farmaceutico,
    corpo: { valor_fechamento_contado: caixaFinal.dados.totais.valor_esperado },
  });
  ok(
    "fecha o caixa do teste sem divergência",
    fechamento.status === 200 && fechamento.dados.divergencia === 0
  );
}

console.log(
  `\n${falhas === 0 ? `TODAS AS ${total} VERIFICACOES PASSARAM` : `${falhas} de ${total} VERIFICACOES FALHARAM`}`
);
process.exit(falhas === 0 ? 0 : 1);
