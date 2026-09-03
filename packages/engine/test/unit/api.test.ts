// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// L'API pubblica del pacchetto: quel che `src/index.ts` esporta e che
// l'applicazione SAVINT consuma. Non ha una controparte upstream (upstream
// l'API è il namespace globale `Numbas`).

import { afterEach, describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  evaluate,
  loadQuestion,
  renderLatex,
  restoreQuestion,
  Question,
  setLocale,
} from "../../src/index";
import type { NumbasQuestionJSON, QuestionState } from "../../src/index";

afterEach(() => {
  setLocale("it");
});

describe("renderLatex", () => {
  it("rende una frazione", () => {
    expect(renderLatex("x^2/2")).toContain("\\frac");
  });

  it("il ruleset predefinito è `all`", () => {
    // con `all` la moltiplicazione per 1 sparisce; senza semplificazione no.
    expect(renderLatex("1*x")).toBe(renderLatex("1*x", { ruleset: "all" }));
    expect(renderLatex("1*x", { ruleset: [] })).toContain("1");
  });

  it("accetta una lista di regole", () => {
    expect(renderLatex("x+0", { ruleset: ["basic", "zeroTerm"] })).toBe("x");
  });

  it("un'espressione vuota rende una stringa vuota", () => {
    expect(renderLatex("")).toBe("");
  });
});

describe("evaluate", () => {
  it("valuta un'espressione con variabili", () => {
    expect(evaluate("a+1", { a: 2 })).toBe(3);
  });

  it("restituisce le liste come array", () => {
    expect(evaluate("[1,2]")).toEqual([1, 2]);
  });

  it("valuta senza variabili", () => {
    expect(evaluate("2^10")).toBe(1024);
  });

  it("accetta stringhe, booleani e liste come variabili", () => {
    expect(evaluate("s+'!'", { s: "ciao" })).toBe("ciao!");
    expect(evaluate("not b", { b: true })).toBe(false);
    expect(evaluate("sum(l)", { l: [1, 2, 3] })).toBe(6);
  });

  it("le variabili non sporcano le chiamate successive", () => {
    expect(evaluate("a", { a: 1 })).toBe(1);
    // un nome non legato resta un nome (upstream: `evaluate` di un `name`
    // solitario ritorna il token stesso), quindi il valore precedente non è
    // rimasto in giro.
    expect(evaluate("a")).toBe("a");
    expect(() => evaluate("a+1")).toThrow();
  });
});

describe("localizzazione dei messaggi di correzione", () => {
  const json: NumbasQuestionJSON = {
    parts: [{ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }],
  };

  it('in inglese la risposta "abc" dà il messaggio inglese', () => {
    const q = loadQuestion(json, { seed: "loc", locale: "en" });
    const res = q.getPart("p0")?.submit("abc");
    expect(res?.feedback.map((f) => f.message).join("\n")).toContain("You did not enter a valid number.");
  });

  it('in italiano la risposta "abc" dà il messaggio italiano', () => {
    const q = loadQuestion(json, { seed: "loc", locale: "it" });
    const res = q.getPart("p0")?.submit("abc");
    expect(res?.feedback.map((f) => f.message).join("\n")).toContain("Non hai inserito un numero valido.");
  });

  it("la lingua predefinita è l'italiano", () => {
    const q = loadQuestion(json, { seed: "loc" });
    const res = q.getPart("p0")?.submit("abc");
    expect(res?.feedback.map((f) => f.message).join("\n")).toContain("Non hai inserito un numero valido.");
  });
});

describe("superficie esportata", () => {
  it("esporta la versione del motore e il commit upstream", () => {
    expect(typeof ENGINE_VERSION).toBe("string");
  });

  it("`loadQuestion` restituisce una `Question`", () => {
    const q = loadQuestion({ name: "x" }, { seed: "s" });
    expect(q).toBeInstanceOf(Question);
  });

  it("`restoreQuestion` accetta uno stato JSON", () => {
    const json: NumbasQuestionJSON = { parts: [{ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }] };
    const q = loadQuestion(json, { seed: "s" });
    q.getPart("p0")?.submit("1");
    const state: QuestionState = JSON.parse(JSON.stringify(q.toState())) as QuestionState;
    expect(restoreQuestion(json, state).score()).toEqual({ score: 1, marks: 1 });
  });
});
