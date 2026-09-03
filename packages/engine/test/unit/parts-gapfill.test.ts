// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit "Gapfill" (part-tests.mjs:782-1247), limitata ai
// casi che usano `createPartFromJSON`.
//
// Restano al Task 9 i casi costruiti con `question_test`, che hanno bisogno di
// una `Question` intera (variabili di domanda, `getPart` su tutte le parti,
// `submit_part` fra parti sorelle):
// - 'One JME gap with string restrictions' (part-tests.mjs:790-800);
// - 'A gap-fill is invalid if any of the gaps are invalid' (802-840);
// - 'Show an error message when a gap relies on an unanswered part' (842-891);
// - 'Sort answers' (893-925) — qui sotto è coperta la stessa logica senza
//   `Question`, con una domanda finta;
// - 'Adaptive marking order' (955-1043) — idem per il rilevamento dei cicli;
// - 'Re-evaluate destructured variables after variable replacement' (1045-1096);
// - 'Adaptive marking error when referenced part doesn't exist' (1098-1128);
// - le due 'Adaptive marking carries through to gaps' (1131-1246).

import { describe, it, expect } from "vitest";
import { unwrapValue } from "../../src/jme/evaluate";
import { partErrorKeys } from "../../src/parts";
import { createPart, createPartWithQuestion, markPart, attachFakeQuestion } from "./parts-helpers";

describe("Gapfill", () => {
  it('un solo gap JME con risposta "x+2"', () => {
    const p = createPartWithQuestion({ type: "gapfill", gaps: [{ type: "jme", answer: "x+2" }] });
    expect(markPart(p, ["x+2"]).credit).toBe(1);
  });

  it("moltiplicare il credito in un gap", () => {
    const gap = (precisionPartialCredit: string) => ({
      type: "numberentry" as const,
      marks: 1,
      minValue: "1.2",
      maxValue: "1.2",
      precisionType: "dp",
      precision: "1",
      precisionPartialCredit: precisionPartialCredit,
      precisionMessage: "You have not given your answer to the correct precision.",
      strictPrecision: true,
      notationStyles: ["plain", "en", "si-en"],
      correctAnswerStyle: "plain",
    });
    const p = createPartWithQuestion({
      type: "gapfill",
      marks: 0,
      gaps: [gap("25"), gap("50")],
      sortAnswers: false,
    });
    expect(markPart(p, ["1.20", "1.20"]).credit).toBe(0.375);
    expect(markPart(p, ["1.2", "1.20"]).credit).toBe(0.75);
    expect(markPart(p, ["1.20", "1.2"]).credit).toBe(0.625);

    const gap10 = { ...gap("50"), marks: "10" };
    const p2 = createPartWithQuestion({
      type: "gapfill",
      marks: 0,
      gaps: [gap10, gap10, gap10],
      sortAnswers: false,
    });
    expect(markPart(p2, ["1.20", "1.20", "1.20"]).credit).toBe(0.5);
    expect(p2.creditFraction.toFloat()).toBe(0.5);
  });

  it("i punti sono la somma di quelli dei gap, e il campo marks del JSON è ignorato", () => {
    const p = createPart({
      type: "gapfill",
      marks: 99,
      gaps: [
        { type: "numberentry", marks: 2, minValue: "1", maxValue: "1" },
        { type: "numberentry", marks: 3, minValue: "2", maxValue: "2" },
      ],
    });
    // upstream somma i punti dei gap a `this.marks` in `addGap` e ricalcola
    // `availableMarks` come somma pura (gapfill.js:87-99, 110).
    expect(p.availableMarks()).toBe(5);
  });

  it("rawStudentAnswerAsJME è la lista delle risposte dei gap", () => {
    const p = createPartWithQuestion({
      type: "gapfill",
      gaps: [
        { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
        { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
      ],
    });
    p.storeAnswer(["1", "2"]);
    p.setStudentAnswer();
    expect(unwrapValue(p.rawStudentAnswerAsJME()!)).toEqual(["1", "2"]);
  });

  it("un array di risposte più corto lascia i gap in eccesso senza risposta", () => {
    // gapfill.js:167-171 inoltra `answer[i]` INVARIATO: il gap che non ha una
    // voce riceve `undefined`, non `null`. Con un `patternmatch` che ammette la
    // risposta vuota la differenza è visibile nel credito, perché
    // `String(null).trim()` sarebbe la stringa letterale "null".
    const p = createPartWithQuestion({
      type: "gapfill",
      gaps: [
        { type: "patternmatch", marks: 1, answer: "hi+", displayAnswer: "hi" },
        { type: "patternmatch", marks: 1, answer: "a*", displayAnswer: "aaaa", allowEmpty: true },
      ],
    });
    expect(p.gaps[1]!.hasStagedAnswer()).toBe(false);
    p.storeAnswer(["hi"]);
    expect(p.gaps[1]!.stagedAnswer).toBeUndefined();
    expect(p.gaps[1]!.hasStagedAnswer()).toBe(false);
    // il secondo gap resta senza risposta: nessuna eccezione, nessun "null"
    const absent = markPart(p, ["hi"]);
    expect(absent.valid).toBe(true);
    expect(absent.credit).toBe(0.5);
    // una risposta VUOTA è un'altra cosa: `a*` la accetta e vale il punto
    expect(markPart(p, ["hi", ""]).credit).toBe(1);
  });

  it("un gap numerico senza risposta non riceve la stringa \"null\"", () => {
    const p = createPartWithQuestion({
      type: "gapfill",
      gaps: [
        { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
        { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
      ],
    });
    p.storeAnswer(["1"]);
    p.setStudentAnswer();
    expect((p.gaps[1] as unknown as { studentAnswer: string }).studentAnswer).toBe("");
    expect(markPart(p, ["1"]).credit).toBe(0.5);
  });

  it("submit(null) su un gapfill non lancia e vale come nessuna risposta", () => {
    const p = createPartWithQuestion({
      type: "gapfill",
      gaps: [{ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }],
    });
    const res = p.submit(null);
    expect(res.valid).toBe(false);
    expect(res.credit).toBe(0);
    expect(p.gaps[0]!.hasStagedAnswer()).toBe(false);
  });

  it("sortAnswers ordina le risposte prima di correggerle", () => {
    const gaps = [
      { type: "numberentry" as const, minValue: "1", maxValue: "1", marks: 1 },
      { type: "numberentry" as const, minValue: "2", maxValue: "2", marks: 1 },
    ];
    const p = createPartWithQuestion({ type: "gapfill", gaps: gaps });
    expect(markPart(p, ["1", "2"]).credit).toBe(1);
    expect(markPart(p, ["2", "1"]).credit).toBe(0);

    const sorted = createPartWithQuestion({ type: "gapfill", sortAnswers: true, gaps: gaps });
    expect(markPart(sorted, ["1", "2"]).credit).toBe(1);
    expect(markPart(sorted, ["2", "1"]).credit).toBe(1);
  });

  it("sortAnswers è disattivato in silenzio se i gap hanno tipi diversi", () => {
    const p = createPart({
      type: "gapfill",
      sortAnswers: true,
      gaps: [
        { type: "numberentry", minValue: "1", maxValue: "1", marks: 1 },
        { type: "jme", answer: "x", marks: 1 },
      ],
    });
    expect(p.settings["sortAnswers"]).toBe(false);
  });

  it("con sortAnswers un gap non valido blocca l'intera parte", () => {
    const p = createPartWithQuestion({
      type: "gapfill",
      sortAnswers: true,
      gaps: [
        { type: "numberentry", minValue: "1", maxValue: "1", marks: 1 },
        { type: "numberentry", minValue: "2", maxValue: "2", marks: 1 },
      ],
    });
    const res = markPart(p, ["1", "!"]);
    expect(res.valid).toBe(false);
    expect(res.credit).toBe(0);
  });

  it("un ciclo nelle sostituzioni adattive fra gap è un errore", () => {
    const p = createPart({
      type: "gapfill",
      gaps: [
        {
          type: "numberentry",
          marks: 1,
          minValue: "1",
          maxValue: "1",
          variableReplacements: [{ variable: "a", part: "p0g1", must_go_first: false }],
        },
        {
          type: "numberentry",
          marks: 1,
          minValue: "1",
          maxValue: "1",
          variableReplacements: [{ variable: "b", part: "p0g0", must_go_first: false }],
        },
      ],
    });
    attachFakeQuestion(p);
    let caught: unknown;
    try {
      markPart(p, ["2", "2"]);
    } catch (e) {
      caught = e;
    }
    expect(partErrorKeys(caught)).toContain("part.gapfill.cyclic adaptive marking");
  });

  it("senza cicli, gap_adaptive_order mette prima il gap da cui dipende l'altro", () => {
    const p = createPart({
      type: "gapfill",
      gaps: [
        {
          type: "numberentry",
          marks: 1,
          minValue: "1",
          maxValue: "1",
          variableReplacements: [{ variable: "a", part: "p0g1", must_go_first: false }],
        },
        { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
      ],
    });
    attachFakeQuestion(p);
    p.storeAnswer(["1", "1"]);
    p.setStudentAnswer();
    const params = p.markingParameters(p.rawStudentAnswerAsJME());
    expect(unwrapValue(params["gap_adaptive_order"]!)).toEqual([1, 0]);
  });
});
