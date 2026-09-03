// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// La lingua viaggia sullo `Scope`, non in una globale del modulo `i18n/`
// (divergenza 19 bis, la stessa forma di `Scope.rng`). I casi qui sotto
// fissano i tre comportamenti che la globale rompeva:
//
//   1. due domande caricate in lingue diverse restano ciascuna nella propria,
//      anche se la correzione arriva molto dopo il caricamento;
//   2. `restoreQuestion` senza `locale` non azzera la predefinita del
//      processo scelta da chi chiama;
//   3. il testo prodotto dagli script di correzione incorporati — cioè dal
//      builtin `translate`, che nei cinque script è chiamato 33 volte — segue
//      la lingua della domanda, non quella dell'ultimo caricamento.

import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale } from "../../src/i18n";
import { builtinScope } from "../../src/jme/builtins";
import { Scope } from "../../src/jme/scope";
import type { TString } from "../../src/jme/tokens";
import { loadQuestion, restoreQuestion } from "../../src/question";
import type { NumbasQuestionJSON } from "../../src/question";
import type { PartBase } from "../../src/parts";

afterEach(() => {
  setLocale("it");
});

/** Una domanda con una sola parte `numberentry` la cui risposta esatta è 1. */
const numberQuestion: NumbasQuestionJSON = {
  name: "numero",
  parts: [{ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }],
};

/** I messaggi di feedback di una parte, uno per riga. */
function feedbackText(p: PartBase | undefined): string {
  return (p?.markingFeedback ?? []).map((f) => f.message ?? "").join("\n");
}

/** Carica la domanda, risponde e la corregge; ritorna il feedback. */
function submitAnswer(q: ReturnType<typeof loadQuestion>, answer: string): string {
  const p = q.getPart("p0") as PartBase;
  p.storeAnswer(answer);
  p.submit();
  return feedbackText(p);
}

describe("La lingua sta sullo Scope", () => {
  it("Scope.locale si eredita dal genitore e sopravvive a clone()", () => {
    const root = new Scope([builtinScope, { locale: "en" }]);
    expect(root.locale).toBe("en");
    expect(new Scope([root]).locale).toBe("en");
    expect(root.clone().locale).toBe("en");
    expect(new Scope([root, { locale: "it" }]).locale).toBe("it");
    // uno scope senza lingua esplicita non ne inventa una: chi legge cade
    // sulla predefinita del processo.
    expect(new Scope([builtinScope]).locale).toBeUndefined();
  });

  it("`translate` traduce nella lingua dello scope in cui è valutato", () => {
    const en = new Scope([builtinScope, { locale: "en" }]);
    const it = new Scope([builtinScope, { locale: "it" }]);
    const str = (scope: Scope, expr: string): string => (scope.evaluate(expr) as TString).value;
    expect(str(en, 'translate("part.marking.correct")')).toBe("Your answer is correct.");
    expect(str(it, 'translate("part.marking.correct")')).toBe("La tua risposta è corretta.");
    // anche nella forma con parametri
    expect(str(en, 'translate("part.marking.maximum scaled down",["count":"2"])')).toContain("2");
  });

  it("due domande in lingue diverse non si sovrascrivono a vicenda", () => {
    // riproduzione 1: si carica in inglese, poi in italiano, poi si corregge
    // la PRIMA. Con la lingua in una globale il feedback tornava italiano.
    const inglese = loadQuestion(numberQuestion, { seed: "en", locale: "en" });
    const italiano = loadQuestion(numberQuestion, { seed: "it", locale: "it" });

    expect(submitAnswer(inglese, "1")).toBe("Your answer is correct.");
    expect(submitAnswer(italiano, "1")).toBe("La tua risposta è corretta.");
    // e nell'ordine inverso, per escludere che conti solo l'ultima
    const inglese2 = loadQuestion(numberQuestion, { seed: "en2", locale: "en" });
    loadQuestion(numberQuestion, { seed: "it2", locale: "it" });
    expect(submitAnswer(inglese2, "1")).toBe("Your answer is correct.");
  });

  it("il testo degli script di correzione segue la lingua della domanda", () => {
    // riproduzione 3: `part.numberentry.answer invalid` esce da
    // `translate(...)` dentro numberentry.jme, non da un `t()` di `parts/`.
    const inglese = loadQuestion(numberQuestion, { seed: "en", locale: "en" });
    loadQuestion(numberQuestion, { seed: "it", locale: "it" });
    expect(submitAnswer(inglese, "boh")).toContain("You did not enter a valid number.");

    const italiano = loadQuestion(numberQuestion, { seed: "it", locale: "it" });
    loadQuestion(numberQuestion, { seed: "en", locale: "en" });
    expect(submitAnswer(italiano, "boh")).toContain("Non hai inserito un numero valido.");
  });

  it("caricare una domanda non cambia la lingua predefinita del processo", () => {
    setLocale("en");
    loadQuestion(numberQuestion, { seed: "x", locale: "it" });
    expect(getLocale()).toBe("en");
  });

  it("restoreQuestion senza `locale` non azzera la lingua scelta da chi chiama", () => {
    // riproduzione 2: il costruttore faceva `setLocale(opts.locale ?? "it")`,
    // quindi un `restoreQuestion` senza opzioni riportava tutto in italiano.
    setLocale("en");
    const q = loadQuestion(numberQuestion, { seed: "restore" });
    const state = q.toState();

    const restored = restoreQuestion(numberQuestion, state);
    expect(getLocale()).toBe("en");
    expect(restored.locale).toBe("en");
    expect(submitAnswer(restored, "1")).toBe("Your answer is correct.");
  });

  it("senza `locale` la domanda prende la predefinita del momento e non la lascia più", () => {
    setLocale("en");
    const q = loadQuestion(numberQuestion, { seed: "default" });
    setLocale("it");
    // la domanda è già stata caricata in inglese: resta inglese.
    expect(submitAnswer(q, "1")).toBe("Your answer is correct.");
    // e `regenerate` conserva la lingua con cui la domanda era stata caricata.
    expect(submitAnswer(q.regenerate("altro"), "1")).toBe("Your answer is correct.");
  });

  it("un messaggio d'errore mostrato allo studente segue la lingua della domanda", () => {
    // `JmeError` traduce al momento del lancio, con la predefinita del
    // processo (contratto documentato, uguale a `Numbas.Error`). Quando quel
    // testo diventa feedback, chi lo mostra lo ricostruisce da `key`/`params`
    // nella lingua della parte: qui la predefinita è l'italiano e la domanda
    // è in inglese.
    setLocale("it");
    const json: NumbasQuestionJSON = {
      variables: { n: { name: "n", definition: "1" } },
      parts: [
        { type: "numberentry", marks: 1, minValue: "n", maxValue: "n" },
        {
          type: "gapfill",
          marks: 0,
          prompt: "<p>[[0]]</p>",
          gaps: [
            {
              type: "numberentry",
              marks: 1,
              variableReplacements: [{ variable: "n", part: "p0", must_go_first: true }],
              variableReplacementStrategy: "alwaysreplace",
              minValue: "n",
              maxValue: "n",
            },
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "err", locale: "en" });
    const p = q.getPart("p1") as PartBase;
    q.getPart("p1g0")?.storeAnswer("1");
    p.submit();
    expect(feedbackText(p)).toBe("You must answer a) first.");
  });

  it("anche il messaggio INCASTONATO in un errore segue la lingua della domanda", () => {
    // `part.jme.answer invalid` è un template tradotto con dentro `{message}`,
    // e quel messaggio viene dall'errore catturato dal builtin JME `try()`
    // (jme.jme:30-38). Se il template segue lo scope e la clausola no, lo
    // studente legge una frase inglese con una subordinata italiana saldata in
    // fondo — che è peggio del monolingue di partenza.
    setLocale("it");
    const json: NumbasQuestionJSON = { parts: [{ type: "jme", marks: 1, answer: "x+1" }] };
    const q = loadQuestion(json, { seed: "jme", locale: "en" });
    const p = q.getPart("p0") as PartBase;
    p.storeAnswer("1+");
    p.submit();

    const text = feedbackText(p) + "\n" + p.warnings.join("\n");
    expect(text).toContain("Your answer is not a valid mathematical expression.");
    expect(text).toContain("Not enough arguments for the operation +.");
    // nessun frammento italiano: è tutta la frase a dover seguire la domanda
    expect(text).not.toContain("Argomenti insufficienti");
  });

  it("la parte espone la lingua del proprio scope", () => {
    const q = loadQuestion(numberQuestion, { seed: "p", locale: "en" });
    expect((q.getPart("p0") as PartBase).locale).toBe("en");
    expect(q.scope.locale).toBe("en");
  });
});
