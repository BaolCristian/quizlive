// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// I test generati dagli esempi della documentazione, più il modulo QUnit
// `Documentation` (tests/jme/jme-tests.mjs:2866-2982).
//
// Per ogni funzione documentata con esempi, upstream costruisce un test che
// valuta `example.in` nello scope dei builtin e confronta
// `treeToJME(risultato, {ignorestringattributes: true, wrapexpressions: true})`
// con `example.out` dopo aver tolto tutti gli spazi (2966-2982).
//
// I dati sono la conversione in JSON di `tests/jme/doc-tests.mjs`
// (commit 0f0ea33): 25 sezioni, 280 funzioni, 245 con esempi, 540 esempi.
// Si rigenerano con:
//   node --input-type=module -e 'import d from "./.numbas-upstream/tests/jme/doc-tests.mjs";
//     import {writeFileSync} from "node:fs";
//     writeFileSync("packages/engine/test/fixtures/upstream/doc-tests.json",
//       JSON.stringify(d, null, 2) + "\n")'

import { describe, expect, it } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import { isDeterministicOps } from "../../src/jme/evaluate";
import { funcSynonyms, opSynonyms, postfixForm, prefixForm } from "../../src/jme/tokenizer";
import type { Token } from "../../src/jme/tokens";
import { treeToJME } from "../../src/jme/display-jme";
// riempie tutti i ganci di `displayHooks`: `latex`, `render` e `string` su
// un'espressione ne hanno bisogno.
import "../../src/jme/display";
import docTestsJson from "../fixtures/upstream/doc-tests.json";

/** Una funzione documentata. */
interface DocFn {
  name: string;
  keywords: string[];
  noexamples: boolean;
  calling_patterns: string[];
  examples: Array<{ in: string; out: string }>;
}

/** Una sezione della documentazione. */
interface DocSection {
  name: string;
  fns: DocFn[];
}

const docTests = docTestsJson as DocSection[];

/** Le funzioni documentate che il motore non porta, col motivo.
 *
 * Le prime cinque toccano il DOM (tema `html`, jme-builtins.js:2769-2924) e
 * upstream non hanno esempi, quindi non generano un test: restano elencate
 * perché servono al controllo di copertura, come `fetch_text`/`fetch_json`
 * (tema `http`) e `then` (tema `promises`). `make_variables` ha un esempio ed
 * è rimandata al Task 6. Vedi DIVERGENCES.md. */
const SKIP = new Map<string, string>([
  ["html", "costruisce nodi del DOM (jme-builtins.js:2770-2784)"],
  ["image", "costruisce un elemento <img> (jme-builtins.js:2788-2809)"],
  ["table", "costruisce un elemento <table> (jme-builtins.js:2829-2911)"],
  ["max_width", "attributo di stile su un nodo del DOM (jme-builtins.js:2913-2916)"],
  ["max_height", "attributo di stile su un nodo del DOM (jme-builtins.js:2917-2921)"],
  ["make_variables", "generatore di variabili di domanda, Task 6 (jme-builtins.js:2374-2408)"],
  ["fetch_text", "tema http, richiede la rete (jme-builtins.js:3801-3806)"],
  ["fetch_json", "tema http, richiede la rete (jme-builtins.js:3807-3815)"],
  ["then", "tema promises, funzioni JME asincrone (jme-builtins.js:3816-3824)"],
]);

/** I singoli esempi che non possono valere qui, col motivo: dipendono
 * dall'ambiente (locale, generatore casuale, notazioni) e non dal
 * display. Tutti registrati in DIVERGENCES.md. */
const SKIP_EXAMPLES = new Map<string, string>([
  [
    'string(expression("set([1,2])"),"","set_theory")',
    "le notazioni alternative di jme-notations.js non sono portate (decisione 1 del brief del Task 5)",
  ],
  [
    'translate("question.header",["number": 2])',
    "il dizionario i18n del motore contiene solo i messaggi d'errore JME; le stringhe del player sono del Task 9",
  ],
  ["seedrandom(0, random(1..1000))", "il generatore seminato non è quello di Math.seedrandom upstream"],
  ['seedrandom("Numbas", random(1..1000))', "il generatore seminato non è quello di Math.seedrandom upstream"],
  [
    'try(eval(expression("x+")),err, "Error: "+err)',
    "il testo dei messaggi d'errore è quello del dizionario i18n del motore, non quello upstream",
  ],
]);

/** `clean` upstream (jme-tests.mjs:2974-2976). */
function clean(expr: string): string {
  return expr.replace(/\s/g, "");
}

// jme-tests.mjs:2966-2982
for (const section of docTests) {
  const fns = section.fns.filter((fn) => fn.examples.length > 0);
  if (fns.length === 0) {
    continue;
  }
  describe(`Docs: ${section.name}`, () => {
    for (const fn of fns) {
      const skip = SKIP.get(fn.name);
      const runner = skip ? it.skip : it;
      runner(`${fn.name}${skip ? ` — non portata: ${skip}` : ""}`, () => {
        for (const example of fn.examples) {
          if (SKIP_EXAMPLES.has(example.in)) {
            continue;
          }
          const res = builtinScope.evaluate(example.in);
          const out = treeToJME({ tok: res as Token }, { ignorestringattributes: true, wrapexpressions: true });
          expect(clean(out), example.in).toBe(clean(example.out));
        }
      });
    }
  });
}

describe("Documentation", () => {
  // jme-tests.mjs:2867-2939
  it("Coverage", () => {
    const fn_names: string[] = [];
    docTests.forEach((d) => {
      d.fns.forEach((f) => {
        fn_names.push(f.name);
        f.calling_patterns.forEach((c) => {
          const m = /(.*? )?(.*?)( .*?)?\(/.exec(c);
          if (m && m[2] !== f.name) {
            fn_names.push(m[2] as string);
          }
        });
      });
    });

    const documented: Record<string, boolean> = {};
    documented["+u"] = true;
    documented["-u"] = true;
    fn_names.forEach((n) => {
      documented[n.toLowerCase()] = true;
    });

    const defined: Record<string, unknown> = { ...builtinScope.allFunctions() };

    for (const x in opSynonyms) {
      defined[x] = true;
    }
    for (const x in funcSynonyms) {
      defined[x] = true;
    }
    for (const x in prefixForm) {
      defined[x] = true;
    }
    for (const x in postfixForm) {
      defined[x] = true;
    }
    defined["->"] = true;

    const defined_undocumented = Object.keys(defined).filter((n) => {
      n = opSynonyms[n] || funcSynonyms[n] || n;
      return !documented[n.toLowerCase()];
    });
    expect(defined_undocumented, "nessuna funzione definita e non documentata").toEqual([]);

    // upstream non toglie niente: qui si tolgono le funzioni non portate
    // (`SKIP`), che nel motore non esistono.
    const documented_undefined = fn_names.filter((n) => {
      n = opSynonyms[n] || funcSynonyms[n] || n;
      return defined[n.toLowerCase()] === undefined && !SKIP.has(n);
    });
    expect(documented_undefined, "nessuna funzione documentata e non definita").toEqual([]);
  });

  // jme-tests.mjs:2894-2905 — nell'upstream sta dentro `Coverage`.
  it("il flag random è coerente fra gli overload", () => {
    const defined = builtinScope.allFunctions();
    const unsure_random: string[] = [];
    Object.entries(defined).forEach(([name, fns]) => {
      if (name in isDeterministicOps) {
        return;
      }
      if (
        fns.some((fn) => !Object.hasOwn(fn, "random")) ||
        new Set(fns.map((fn) => fn.random)).size !== 1
      ) {
        unsure_random.push(name);
      }
    });
    expect(unsure_random, "nessun builtin con flag random ambiguo").toEqual([]);
  });

  // jme-tests.mjs:2950-2964
  it("Random flag set properly", () => {
    const no_examples: string[] = [];
    docTests.forEach((section) => {
      section.fns.forEach((fn) => {
        if (SKIP.has(fn.name)) {
          return;
        }
        if (fn.examples.length === 0 && !fn.noexamples) {
          const defs = builtinScope.getFunction(fn.name);
          if (!defs.some((def) => def.random)) {
            no_examples.push(fn.name);
          }
        }
      });
    });
    expect(
      no_examples,
      "ogni funzione senza random:true ha esempi, o dichiara di non averne",
    ).toEqual([]);
  });
});
