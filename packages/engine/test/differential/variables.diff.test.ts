// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
/* Differenziale: generazione delle variabili e sostituzione nell'enunciato.
 *
 * Confronta il port con il runtime Numbas upstream caricato in-process
 * (`oracle.ts`) a parità di seme. Se qualcosa diverge, l'ipotesi predefinita è
 * che il baco sia nel port: una differenza è accettabile solo se elencata in
 * `known-divergences.json` con il motivo e il riferimento a DIVERGENCES.md.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadQuestion, jme } from "../../src/index";
import { loadOracle, type OracleApi } from "./oracle";
import { corpus, type CorpusEntry } from "./corpus";
import { checkDivergences, checkNoStaleDivergences, closeEqualDeep, normalizeHtml, SEEDS } from "./compare";

let oracle: OracleApi;
beforeAll(async () => {
  oracle = await loadOracle();
}, 120_000);

describe("parità del seme", () => {
  // Decisione 1 del brief: senza questa, nulla di quel che segue significa
  // qualcosa. Il bundle vendorizza seedrandom 2.0 (header di
  // `runtime/scripts/seedrandom/seedrandom.js`), il port usa il pacchetto npm
  // `seedrandom` 3.0.5: stesso ARC4, stesso schema di mixkey.
  it.each(["hello", "savint", "x", "0", "seme-italiano-àè"])(
    'le prime 5 estrazioni coincidono per il seme "%s"',
    (seed) => {
      const rng = jme.makeRng(seed);
      const ours = [rng(), rng(), rng(), rng(), rng()];
      expect(ours).toEqual(oracle.draws(seed, 5));
    },
  );
});

describe("variabili e enunciato", () => {
  const cases: Array<[string, CorpusEntry, string]> = [];
  for (const entry of corpus) {
    if (entry.skip !== undefined) continue;
    for (const seed of SEEDS) {
      cases.push([`${entry.id} [seme ${seed}]`, entry, seed]);
    }
  }

  it.each(cases)("%s", async (_name, entry, seed) => {
    // Le domande che l'oracolo stesso rifiuta (script di correzione non
    // compilabile, ecc.) devono essere rifiutate anche dal port.
    let expected;
    try {
      expected = await oracle.oracleQuestion(entry.json, seed, 3);
    } catch (e) {
      // Le fixture `savint` sono nostre: se l'oracolo le rifiuta, sono
      // scritte male e il test non sta confrontando nulla.
      if (entry.source === "savint") throw e;
      expect(() => loadQuestion(entry.json, { seed: seed, locale: "en" })).toThrow();
      return;
    }
    const q = loadQuestion(entry.json, { seed: seed, locale: "en" });

    const diffs: Array<{ path: string; field: string; detail: string }> = [];

    // (a) variabili: stesse chiavi, stessi valori (numeri a 10 decimali).
    const ourNames = Object.keys(q.variables).sort();
    const theirNames = Object.keys(expected.variables).sort();
    if (JSON.stringify(ourNames) !== JSON.stringify(theirNames)) {
      diffs.push({
        path: "-",
        field: "variableNames",
        detail: `nostre ${JSON.stringify(ourNames)} vs oracolo ${JSON.stringify(theirNames)}`,
      });
    }
    for (const name of theirNames) {
      if (!ourNames.includes(name)) continue;
      const mismatch = closeEqualDeep(q.variables[name], expected.variables[name]);
      if (mismatch !== null) {
        diffs.push({
          path: "-",
          field: `variables.${name}`,
          detail: mismatch,
        });
      }
    }

    // (b) enunciato: uguale dopo normalizzazione degli spazi. L'oracolo passa
    // per jsdom (`DOMcontentsubvars` lavora su un elemento), quindi si
    // serializza anche il nostro con jsdom per non confrontare il formato.
    const ourHtml = normalizeHtml(oracle.serializeHtml(q.statementHtml));
    const theirHtml = normalizeHtml(expected.statementHtml);
    if (ourHtml !== theirHtml) {
      diffs.push({ path: "-", field: "statementHtml", detail: `nostro «${ourHtml}» vs oracolo «${theirHtml}»` });
    }

    // (c) nome della domanda: upstream lo sostituisce con `contentsubvars`.
    if (q.name !== expected.name) {
      diffs.push({ path: "-", field: "name", detail: `nostro «${q.name}» vs oracolo «${expected.name}»` });
    }

    // (d) posizione del generatore casuale: le prime estrazioni DOPO il
    // caricamento devono coincidere. È il controllo che accorge di un sorteggio
    // in più o in meno da qualunque parte del caricamento — generazione delle
    // variabili, cicli di `variablesTest`, `deal` delle scelte da mescolare —
    // anche quando il valore che ne esce non finisce in nessuna variabile.
    const ourDraws = [q.scope.rng(), q.scope.rng(), q.scope.rng()];
    if (JSON.stringify(ourDraws) !== JSON.stringify(expected.drawsAfter)) {
      diffs.push({
        path: "-",
        field: "rngPosition",
        detail: `il port ha consumato un numero diverso di sorteggi: nostro ${JSON.stringify(ourDraws)} vs oracolo ${JSON.stringify(expected.drawsAfter)}`,
      });
    }

    checkDivergences(entry.id, diffs);
  });

  it("nessuna voce obsoleta in known-divergences.json", () => {
    checkNoStaleDivergences("variables");
  });
});
