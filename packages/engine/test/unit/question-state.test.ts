// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// `toState`/`restoreQuestion`: il sostituto di `Question#resume`
// (question.js:935-1070) e di `storage.js:405-530`. Lo stato non salva i
// valori delle variabili: si rigenerano dal seme.

import { describe, expect, it } from "vitest";
import { loadQuestion, restoreQuestion } from "../../src/question";
import type { NumbasQuestionJSON, QuestionState } from "../../src/question";
import type { MarkingResult } from "../../src/parts";

/** Una domanda con due parti indipendenti e variabili casuali. */
const twoParts: NumbasQuestionJSON = {
  name: "Due parti",
  statement: "<p>{a} e {b}</p>",
  variables: {
    a: { name: "a", definition: "random(1..9)" },
    b: { name: "b", definition: "random(10..99)" },
  },
  parts: [
    { type: "numberentry", marks: 1, minValue: "a", maxValue: "a" },
    { type: "numberentry", marks: 2, minValue: "b", maxValue: "b" },
  ],
};

/** I campi confrontabili di un `MarkingResult`. */
function resultShape(r: MarkingResult | undefined): unknown {
  return r === undefined ? undefined : { ...r, feedback: r.feedback.map((f) => `${f.type}:${f.message}`) };
}

describe("toState / restoreQuestion", () => {
  it("ripristina punteggio, risultati e variabili dopo due invii", () => {
    const q = loadQuestion(twoParts, { seed: "state-1" });
    const a = q.variables["a"] as number;
    q.getPart("p0")?.submit(String(a));
    q.getPart("p1")?.submit("0");
    const state = q.toState();

    const q2 = restoreQuestion(twoParts, state);
    expect(q2.variables, "le variabili si rigenerano dal seme").toEqual(q.variables);
    expect(q2.score(), "stesso punteggio").toEqual(q.score());
    expect(q2.statementHtml).toBe(q.statementHtml);
    for (const path of ["p0", "p1"]) {
      expect(resultShape(q2.getPart(path)?.result), `stesso risultato per ${path}`).toEqual(
        resultShape(q.getPart(path)?.result),
      );
    }
  });

  it("lo stato è JSON-serializzabile senza perdita", () => {
    const q = loadQuestion(twoParts, { seed: "state-2" });
    q.getPart("p0")?.submit(String(q.variables["a"]));
    const state = q.toState();
    const roundTripped = JSON.parse(JSON.stringify(state)) as QuestionState;
    expect(roundTripped).toEqual(state);
    expect(restoreQuestion(twoParts, roundTripped).score()).toEqual(q.score());
  });

  it("lo stato registra i flag di livello domanda", () => {
    const q = loadQuestion(twoParts, { seed: "state-3" });
    q.getPart("p0")?.storeAnswer(String(q.variables["a"]));
    q.getPart("p1")?.storeAnswer(String(q.variables["b"]));
    q.submit();
    const state = q.toState();
    expect(state.seed).toBe("state-3");
    expect(state.answered).toBe(true);
    expect(state.submitted).toBe(1);
    expect(state.revealed).toBe(false);
    expect(state.marks).toBe(3);
    expect(state.score).toBe(3);
    expect(state.parts.map((p) => p.path)).toEqual(["p0", "p1"]);

    const q2 = restoreQuestion(twoParts, state);
    expect(q2.submitted).toBe(1);
    expect(q2.answered).toBe(true);
  });

  it("`revealed` fa rivelare le risposte al ripristino", () => {
    const q = loadQuestion(twoParts, { seed: "state-4" });
    q.getPart("p0")?.submit(String(q.variables["a"]));
    q.revealAnswer();
    expect(q.revealed).toBe(true);
    expect(q.adviceDisplayed, "rivelare mostra anche l'aiuto").toBe(true);
    const q2 = restoreQuestion(twoParts, q.toState());
    expect(q2.revealed).toBe(true);
    expect(q2.getPart("p0")?.revealed).toBe(true);
    expect(q2.getPart("p0")?.locked).toBe(true);
    expect(q2.score()).toEqual(q.score());
  });

  it("`adviceDisplayed` da solo è ripristinato senza rivelare", () => {
    const q = loadQuestion(twoParts, { seed: "state-5" });
    q.getAdvice();
    const q2 = restoreQuestion(twoParts, q.toState());
    expect(q2.adviceDisplayed).toBe(true);
    expect(q2.revealed).toBe(false);
  });

  it("una parte senza risposta non viene rinviata", () => {
    const q = loadQuestion(twoParts, { seed: "state-6" });
    const state = q.toState();
    expect(state.parts[0]?.answered).toBe(false);
    expect(state.parts[0]?.answer).toBeUndefined();
    const q2 = restoreQuestion(twoParts, state);
    expect(q2.getPart("p0")?.result, "nessun invio, nessun risultato").toBeUndefined();
    expect(q2.score()).toEqual({ score: 0, marks: 3 });
  });

  it("i gap di un `gapfill` sono ripristinati uno per uno", () => {
    const json: NumbasQuestionJSON = {
      parts: [
        {
          type: "gapfill",
          prompt: "<p>[[0]] [[1]]</p>",
          gaps: [
            { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
            { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "gap-1" });
    q.getPart("p0g0")?.storeAnswer("1");
    q.getPart("p0g1")?.storeAnswer("2");
    q.getPart("p0")?.submit();
    expect(q.score()).toEqual({ score: 2, marks: 2 });

    const state = q.toState();
    expect(state.parts[0]?.gaps?.map((g) => g.answer)).toEqual(["1", "2"]);
    const q2 = restoreQuestion(json, state);
    expect(q2.score()).toEqual({ score: 2, marks: 2 });
    expect(q2.getPart("p0")?.credit).toBe(1);
  });

  it("una scelta multipla si ripristina nella stessa forma in cui è stata salvata", () => {
    // `storeAnswer` normalizza sempre alla matrice `ticks` upstream
    // (`[risposta][scelta]`): è quella che finisce nello stato, ed è quella
    // che `restoreQuestion` rilegge — il giro è chiuso anche per una griglia
    // quadrata, dove le due forme pubbliche sono indistinguibili.
    const json: NumbasQuestionJSON = {
      parts: [
        {
          type: "m_n_x",
          marks: 0,
          minMarks: 0,
          maxMarks: 0,
          shuffleChoices: false,
          shuffleAnswers: false,
          displayType: "radiogroup",
          choices: ["c1", "c2"],
          answers: ["a1", "a2"],
          matrix: [
            ["1", "0"],
            ["0", "1"],
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "mcq-1" });
    // forma `ticks`: [risposta][scelta]
    q.getPart("p0")?.submit([
      [true, false],
      [false, true],
    ]);
    const state = q.toState();
    expect(state.parts[0]?.answer).toEqual([
      [true, false],
      [false, true],
    ]);
    const q2 = restoreQuestion(json, state);
    expect(q2.getPart("p0")?.credit).toBe(q.getPart("p0")?.credit);
    expect(q2.toState()).toEqual(state);
  });

  it("l'ordine di rinvio mette le parti sorgente prima di chi le usa", () => {
    const json: NumbasQuestionJSON = {
      variables: { n: { name: "n", definition: "1" } },
      parts: [
        {
          type: "numberentry",
          marks: 1,
          minValue: "2n",
          maxValue: "2n",
          variableReplacements: [{ variable: "n", part: "p1", must_go_first: true }],
          variableReplacementStrategy: "alwaysreplace",
        },
        { type: "numberentry", marks: 1, minValue: "n", maxValue: "n" },
      ],
    };
    const q = loadQuestion(json, { seed: "order-1" });
    // p1 (la sorgente) è la SECONDA parte: senza riordino, p0 verrebbe
    // rinviata per prima e fallirebbe con "devi rispondere prima a b)".
    q.getPart("p1")?.submit("3");
    q.getPart("p0")?.submit("6");
    expect(q.getPart("p0")?.credit, "6 = 2*3 con la sostituzione").toBe(1);
    const q2 = restoreQuestion(json, q.toState());
    expect(q2.getPart("p0")?.credit).toBe(1);
    expect(q2.score()).toEqual(q.score());
  });
});
