/**
 * Testa a detecção de conectividade sem navegador: a máquina de estado da
 * histerese é pura, e o ping usa o `fetch` global — mockado aqui, sem
 * precisar de servidor nenhum no ar.
 *
 * Uso: npm run test:offline --workspace=apps/web
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { avaliarConectividade, pingSaudavel } from "../src/lib/conectividadeNucleo.js";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

test("avaliarConectividade: online continua online até 2 falhas seguidas", () => {
  let estado = { online: true, falhasSeguidas: 0 };

  estado = avaliarConectividade(estado, false);
  assert.equal(estado.online, true); // 1ª falha ainda não derruba
  assert.equal(estado.falhasSeguidas, 1);

  estado = avaliarConectividade(estado, false);
  assert.equal(estado.online, false); // 2ª falha seguida derruba
  assert.equal(estado.falhasSeguidas, 2);
});

test("avaliarConectividade: 1 sucesso já basta para voltar a ficar online", () => {
  const offline = { online: false, falhasSeguidas: 5 };
  const depois = avaliarConectividade(offline, true);
  assert.equal(depois.online, true);
  assert.equal(depois.falhasSeguidas, 0);
});

test("avaliarConectividade: uma falha isolada não derruba quem já estava online", () => {
  let estado = { online: true, falhasSeguidas: 0 };
  estado = avaliarConectividade(estado, false);
  assert.equal(estado.online, true);

  // Sucesso no meio: reseta o contador, não deixa acumular falha antiga com nova.
  estado = avaliarConectividade(estado, true);
  assert.equal(estado.falhasSeguidas, 0);
  estado = avaliarConectividade(estado, false);
  assert.equal(estado.online, true); // só 1 falha desde o último sucesso
});

test("pingSaudavel: true só com 200 e banco ok", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ status: "ok", banco: "ok" }),
  });
  assert.equal(await pingSaudavel(), true);
});

test("pingSaudavel: false quando o banco não está ok, mesmo com 200", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ status: "ok", banco: "erro: conexao recusada" }),
  });
  assert.equal(await pingSaudavel(), false);
});

test("pingSaudavel: false com HTTP de erro", async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await pingSaudavel(), false);
});

test("pingSaudavel: false quando o fetch falha ou estoura o tempo (nunca lança)", async () => {
  globalThis.fetch = async () => {
    throw new Error("network error");
  };
  assert.equal(await pingSaudavel(), false);
});
