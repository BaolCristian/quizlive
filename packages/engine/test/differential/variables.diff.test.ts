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
import { loadQuestion, questionErrorKeys, jme } from "../../src/index";
import { loadOracle, type OracleApi } from "./oracle";
import { corpus, liveCorpus, type CorpusEntry } from "./corpus";
import { checkDivergences, checkNoStaleDivergences, closeEqual, closeEqualDeep, normalizeHtml, SEEDS } from "./compare";

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

describe("tolleranza numerica", () => {
  // Il criterio è quello di `closeEqual` upstream (jme-tests.mjs:23-30):
  // `precround(x,10)` sui due valori. È ASSOLUTO — dieci decimali sono dieci
  // decimali a qualunque ordine di grandezza — e questi casi lo fissano, perché
  // una tolleranza relativa qui sarebbe puro margine regalato al port.
  it("accetta una differenza sotto il decimo decimale", () => {
    expect(closeEqual(1, 1 + 1e-12)).toBe(true);
    expect(closeEqual(0.1 + 0.2, 0.3)).toBe(true);
  });
  it("rifiuta una differenza sopra il decimo decimale", () => {
    expect(closeEqual(1, 1 + 1e-8)).toBe(false);
    expect(closeEqual(0, 1e-9)).toBe(false);
  });
  it("non concede margine ai valori grandi", () => {
    // con una tolleranza relativa questi due passerebbero entrambi.
    expect(closeEqual(1e6, 1e6 + 1e-4)).toBe(false);
    expect(closeEqual(1e25, 1e25 + 1e14)).toBe(false);
  });
  it("tratta NaN e infiniti come upstream", () => {
    expect(closeEqual(NaN, NaN)).toBe(true);
    expect(closeEqual(Infinity, Infinity)).toBe(true);
    expect(closeEqual(Infinity, -Infinity)).toBe(false);
    expect(closeEqual(NaN, 0)).toBe(false);
  });
});

describe("variabili e enunciato", () => {
  it("il corpus in ambito non è degenere", () => {
    expect(liveCorpus.length).toBeGreaterThanOrEqual(42);
    expect(liveCorpus.filter((e) => e.source === "savint").length).toBeGreaterThanOrEqual(12);
  });

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
      // Una domanda che upstream rifiuta deve essere rifiutata anche qui, e
      // per lo STESSO motivo: due errori non sono equivalenti solo perché
      // sono entrambi errori. I testi vengono da cataloghi diversi, le chiavi
      // no (`Numbas.Error#originalMessages` contro `questionErrorKeys`).
      let ourError: unknown;
      try {
        loadQuestion(entry.json, { seed: seed, locale: "en" });
      } catch (e2) {
        ourError = e2;
      }
      expect(ourError, `${entry.id}: l'oracolo rifiuta la domanda, il port la carica`).toBeDefined();
      const theirKeys = (e as { originalMessages?: unknown }).originalMessages;
      const ourKeys = questionErrorKeys(ourError);
      const loadDiffs =
        JSON.stringify(ourKeys) === JSON.stringify(theirKeys ?? [])
          ? []
          : [
              {
                path: "-",
                field: "caricamento.chiaviErrore",
                detail: `nostro ${JSON.stringify(ourKeys)} vs oracolo ${JSON.stringify(theirKeys ?? [])}`,
              },
            ];
      checkDivergences(entry.id, loadDiffs);
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

    // (c2) testo di aiuto: stessa sostituzione dell'enunciato. Nessuna delle
    // 42 domande upstream ha un `advice`, quindi senza le fixture `savint`
    // questo confronto non direbbe nulla — motivo in più per tenerlo.
    const ourAdvice = normalizeHtml(oracle.serializeHtml(q.adviceHtml));
    const theirAdvice = normalizeHtml(expected.adviceHtml);
    if (ourAdvice !== theirAdvice) {
      diffs.push({ path: "-", field: "adviceHtml", detail: `nostro «${ourAdvice}» vs oracolo «${theirAdvice}»` });
    }

    // (c3) elenco delle parti: i percorsi devono coincidere. Le parti MANCANTI
    // le coglie già il confronto della correzione; questo coglie quelle in
    // PIÙ, che nessun altro controllo vedrebbe.
    const ourPaths = Object.keys(q.partDictionary).sort();
    const theirPaths = [...expected.partPaths].sort();
    if (JSON.stringify(ourPaths) !== JSON.stringify(theirPaths)) {
      diffs.push({
        path: "-",
        field: "partPaths",
        detail: `nostro ${JSON.stringify(ourPaths)} vs oracolo ${JSON.stringify(theirPaths)}`,
      });
    }

    // (c4) consegna di ogni parte: la sostituisce `substitutePartPrompts` con
    // la stessa `substituteHtml` dell'enunciato, ma nello scope della parte.
    for (const partPath of theirPaths) {
      const part = q.partDictionary[partPath];
      if (!part) continue;
      const ourPrompt = normalizeHtml(oracle.serializeHtml(part.promptHtml));
      const theirPrompt = normalizeHtml(expected.promptHtml[partPath] ?? "");
      if (ourPrompt !== theirPrompt) {
        diffs.push({
          path: partPath,
          field: "promptHtml",
          detail: `nostro «${ourPrompt}» vs oracolo «${theirPrompt}»`,
        });
      }
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
