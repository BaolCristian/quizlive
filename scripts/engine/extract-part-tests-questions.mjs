/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. See packages/engine/NOTICE.
 *
 * Estrae le domande JSON inline passate a `question_test` in
 * `.numbas-upstream/tests/parts/part-tests.mjs` e le scrive in
 * `packages/engine/test/fixtures/upstream/part-tests-questions.json`.
 *
 * Non le legge staticamente (sono literal JavaScript, non JSON): carica il
 * bundle dell'oracolo, stubba QUnit e intercetta
 * `Numbas.createQuestionFromJSON`, che `question_test`
 * (part-tests.mjs:157-181) chiama con il literal come primo argomento, in
 * modo sincrono e prima di qualunque `await`. Il patch va applicato DOPO
 * l'import, perché `question.js` assegna `Numbas.createQuestionFromJSON`
 * quando la coda degli script si risolve, cioè durante l'import.
 *
 * Uso: node scripts/engine/extract-part-tests-questions.mjs
 * Richiede il clone upstream in `.numbas-upstream/` (non è nel repo).
 */
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
const upstream = path.join(root, ".numbas-upstream");
if (!fs.existsSync(path.join(upstream, "tests/parts/part-tests.mjs"))) {
  console.error(`manca ${upstream}/tests/parts/part-tests.mjs: clona il runtime Numbas prima di rigenerare la fixture.`);
  process.exit(1);
}

const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });

const require = createRequire(import.meta.url);
const oracleDir = path.join(root, "packages/engine/oracle");
require(path.join(oracleDir, "numbas-runtime.js"));
require(path.join(oracleDir, "locales.js"));
require(path.join(oracleDir, "marking_scripts.js"));
const Numbas = globalThis.Numbas;
Numbas.queueScript("base", [], function () {});
Numbas.queueScript("qunit", [], function () {});

// QUnit stub: registra i test invece di eseguirli.
const tests = [];
let currentModule = "";
globalThis.QUnit = {
  config: {},
  module: (name) => {
    currentModule = name;
  },
  test: (name, fn) => tests.push({ module: currentModule, name, fn }),
  skip: () => {},
  todo: () => {},
  only: (name, fn) => tests.push({ module: currentModule, name, fn }),
};

await import(url.pathToFileURL(path.join(upstream, "tests/parts/part-tests.mjs")).href);
// `RequireScript.script_loaded` esegue le callback in un `.then`: dopo
// l'import la coda è registrata ma non ancora eseguita.
await Numbas.awaitScripts(["question", "exam", "jme", "jme-display", "marking", "localisation", "marking_scripts"]);
Numbas.locale.set_preferred_locale("en-GB");
Numbas.locale.init();

// Ora la coda è risolta: `Numbas.createQuestionFromJSON` esiste e può essere
// intercettata senza che `question.js` la riassegni dopo.
const captured = [];
let currentName = null;
const realCreate = Numbas.createQuestionFromJSON;
if (typeof realCreate !== "function") {
  console.error("Numbas.createQuestionFromJSON non definita: la coda degli script non si è risolta.");
  process.exit(1);
}
Numbas.createQuestionFromJSON = function (data, ...rest) {
  if (currentName !== null) captured.push({ name: currentName, data });
  return realCreate.call(this, data, ...rest);
};

const noop = () => {};
const makeAssert = () =>
  new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "async") return () => noop;
        return () => undefined;
      },
    },
  );

for (const t of tests) {
  currentName = `${t.module} > ${t.name}`;
  try {
    // La domanda è creata sincronamente all'inizio di `question_test`: non
    // serve attendere la promise (e molti test falliscono senza un QUnit vero).
    const r = t.fn(makeAssert());
    if (r && typeof r.catch === "function") r.catch(noop);
  } catch {
    /* idem */
  }
  currentName = null;
}

// Deduplica per JSON identico, conservando il primo nome.
const seen = new Map();
for (const { name, data } of captured) {
  const key = JSON.stringify(data);
  if (!seen.has(key)) seen.set(key, { name, data });
}
const out = [...seen.values()];
const dest = path.join(root, "packages/engine/test/fixtures/upstream/part-tests-questions.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`${out.length} domande estratte (${captured.length} chiamate) → ${path.relative(root, dest)}`);
process.exit(0);
