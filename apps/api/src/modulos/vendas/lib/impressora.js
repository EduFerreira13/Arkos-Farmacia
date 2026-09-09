import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from "node-thermal-printer";
import { FORMA_PAGAMENTO_LABEL } from "@arkos/shared-types";
import { env } from "../../../env.js";

/**
 * Recibo térmico do PDV (ESC/POS). A impressora fica fora do fluxo crítico da
 * venda de propósito (§7 do pedido): a venda já está salva quando isto roda,
 * então qualquer falha aqui — impressora desligada, endereço errado, papel
 * acabou — vira aviso no log, nunca uma exceção que sobe para quem chamou.
 *
 * `env.PRINTER_URL` aponta para o emulador local em desenvolvimento
 * (`npm run dev:impressora` na raiz) e para a impressora física em produção —
 * é só trocar a variável, este módulo não muda.
 *
 * O conteúdo do recibo é montado uma vez em `prepararRecibo` e depois só
 * renderizado de dois jeitos — via comandos ESC/POS (`escreverNaImpressora`)
 * ou como texto puro pra tela (`formatarTexto`) — pra não ter duas fontes de
 * verdade sobre o que sai no recibo.
 */

const LARGURA = 42; // Font A, 80mm — mesma largura do emulador (escpos-emulator)

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Intl separa "R$" do valor com um espaço não separável (U+00A0) — invisível
// no navegador, mas fora da tabela de caracteres da impressora térmica, que
// imprime lixo no lugar. Troca por espaço comum (U+0020) sempre.
const ESPACO_NAO_SEPARAVEL = new RegExp(String.fromCharCode(0xa0), "g");
const formatarMoeda = (valor) =>
  moeda.format(Number(valor ?? 0)).replace(ESPACO_NAO_SEPARAVEL, " ");

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: env.TZ_NEGOCIO,
  dateStyle: "short",
  timeStyle: "short",
});

/** Conteúdo do recibo, já formatado — sem nenhum comando de impressora ainda. */
function prepararRecibo(venda) {
  return {
    farmacia: env.FARMACIA.nome,
    endereco: env.FARMACIA.endereco || null,
    telefone: env.FARMACIA.telefone || null,
    numero: venda.numero ?? venda.id.slice(0, 8),
    dataHora: dataHora.format(new Date(venda.criado_em)),
    cliente: venda.cliente_nome ?? null,
    itens: venda.itens.map((item) => ({
      nome: item.produto_nome,
      linhaQtd: `${item.quantidade} x ${formatarMoeda(item.preco_unitario)}`,
      subtotal: formatarMoeda(
        item.quantidade * item.preco_unitario - Number(item.desconto ?? 0)
      ),
    })),
    desconto: Number(venda.desconto ?? 0) > 0 ? formatarMoeda(venda.desconto) : null,
    total: formatarMoeda(venda.valor_total),
    pagamentos: venda.pagamentos.map((pagamento) => ({
      rotulo: FORMA_PAGAMENTO_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento,
      valor: formatarMoeda(pagamento.valor),
    })),
    troco: calcularTroco(venda),
  };
}

/** Mesma conta que o vendas-service faz ao finalizar (rotas.js) — refeita aqui
 * porque quem chama `imprimirRecibo` já descartou o valor exato pago. */
function calcularTroco(venda) {
  const totalPago = venda.pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
  const troco = Number((totalPago - venda.valor_total).toFixed(2));
  return troco > 0 ? formatarMoeda(troco) : null;
}

function novaImpressora() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: env.PRINTER_URL,
    width: LARGURA,
    // WPC1252 é a única tabela, entre as testadas contra o emulador local, que
    // não corrompe acento do português (ã, ç, ê...) — PC860_PORTUGUESE, que
    // seria a escolha óbvia pelo nome, embaralha esses caracteres nesse
    // emulador. Reconferir se a impressora física real vier a mostrar lixo.
    characterSet: CharacterSet.WPC1252,
    removeSpecialCharacters: false,
    breakLine: BreakLine.WORD,
    options: { timeout: 3000 },
  });
}

/** Manda o recibo pros comandos ESC/POS da impressora — não executa ainda. */
function escreverNaImpressora(printer, recibo) {
  printer.alignCenter();
  printer.bold(true);
  printer.println(recibo.farmacia);
  printer.bold(false);
  if (recibo.endereco) printer.println(recibo.endereco);
  if (recibo.telefone) printer.println(recibo.telefone);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Venda ${recibo.numero}`);
  printer.println(recibo.dataHora);
  if (recibo.cliente) printer.println(`Cliente: ${recibo.cliente}`);
  printer.drawLine();

  for (const item of recibo.itens) {
    printer.println(item.nome);
    printer.leftRight(item.linhaQtd, item.subtotal);
  }
  printer.drawLine();

  if (recibo.desconto) printer.leftRight("Desconto", `-${recibo.desconto}`);
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.leftRight("Total", recibo.total);
  printer.setTextNormal();
  printer.bold(false);
  printer.newLine();

  for (const pagamento of recibo.pagamentos) {
    printer.leftRight(pagamento.rotulo, pagamento.valor);
  }
  if (recibo.troco) printer.leftRight("Troco", recibo.troco);

  printer.newLine();
  printer.alignCenter();
  printer.println("Obrigado pela preferência!");
  printer.newLine();
  printer.cut();
}

const centralizar = (texto) => {
  const espacos = Math.max(0, Math.floor((LARGURA - texto.length) / 2));
  return " ".repeat(espacos) + texto;
};

const duasColunas = (esquerda, direita) => {
  const espacos = Math.max(1, LARGURA - esquerda.length - direita.length);
  return esquerda + " ".repeat(espacos) + direita;
};

/**
 * O mesmo recibo, como texto puro — pra mostrar na tela do PDV depois da
 * venda. Sem bytes de comando (align, negrito): isso é só pra impressora,
 * uma tela não sabe interpretar.
 */
function formatarTexto(recibo) {
  const LINHA = "-".repeat(LARGURA);
  const linhas = [centralizar(recibo.farmacia)];
  if (recibo.endereco) linhas.push(centralizar(recibo.endereco));
  if (recibo.telefone) linhas.push(centralizar(recibo.telefone));
  linhas.push(LINHA);

  linhas.push(`Venda ${recibo.numero}`);
  linhas.push(recibo.dataHora);
  if (recibo.cliente) linhas.push(`Cliente: ${recibo.cliente}`);
  linhas.push(LINHA);

  for (const item of recibo.itens) {
    linhas.push(item.nome);
    linhas.push(duasColunas(item.linhaQtd, item.subtotal));
  }
  linhas.push(LINHA);

  if (recibo.desconto) linhas.push(duasColunas("Desconto", `-${recibo.desconto}`));
  linhas.push(duasColunas("Total", recibo.total));
  linhas.push("");

  for (const pagamento of recibo.pagamentos) {
    linhas.push(duasColunas(pagamento.rotulo, pagamento.valor));
  }
  if (recibo.troco) linhas.push(duasColunas("Troco", recibo.troco));

  linhas.push("");
  linhas.push(centralizar("Obrigado pela preferência!"));
  return linhas.join("\n");
}

/**
 * Imprime o recibo de uma venda já finalizada. Nunca lança: quem chama recebe
 * `{ impresso, motivo?, texto }` e decide o que fazer — logar a falha, mostrar
 * o texto na tela, os dois. `texto` vem preenchido mesmo se a impressora
 * estiver offline, porque a pessoa no balcão quer ver o recibo de qualquer
 * jeito, impressora tendo respondido ou não.
 *
 * @param {object} venda Venda completa (mesmo formato de `buscarVendaCompleta`):
 *   numero, id, criado_em, cliente_nome?, itens[], pagamentos[], valor_total, desconto.
 */
export async function imprimirRecibo(venda) {
  const recibo = prepararRecibo(venda);
  const texto = formatarTexto(recibo);
  const printer = novaImpressora();

  try {
    const conectada = await printer.isPrinterConnected();
    if (!conectada) {
      return { impresso: false, motivo: `impressora não respondeu em ${env.PRINTER_URL}`, texto };
    }

    escreverNaImpressora(printer, recibo);
    await printer.execute();
    return { impresso: true, texto };
  } catch (erro) {
    return { impresso: false, motivo: erro.message, texto };
  }
}
