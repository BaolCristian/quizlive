// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione dei moduli QUnit "Part" (part-tests.mjs:189-198) e "Stateful
// scope" (211-217), più la copertura della superficie che il Task 7 non poteva
// esercitare senza una `Part`: `submit_part`, `mark_part` e `getPart` di
// `marking/note-functions.ts`.
//
// Il modulo "Custom marking algorithms" (part-tests.mjs:1248-1262) è coperto
// qui con `createPartFromJSON` invece che con `question_test`; il suo unico
// caso upstream ('Error in mark note', che verifica `p.marking_result.answered`
// dopo un errore nella nota `mark`) resta al Task 9, che costruisce una
// `Question`.

import { describe, it, expect, vi } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import { JmeError } from "../../src/jme/errors";
import { unwrapValue } from "../../src/jme/evaluate";
import { StatefulScope, makeMarkingScope } from "../../src/marking";
import { createPartFromJSON, partErrorKeys, nicePartName, resetStepsWarnings } from "../../src/parts";
import type { PartBase } from "../../src/parts/part-base";
import type { PartQuestion } from "../../src/parts/types";
import { createPart, freshScope, attachFakeQuestion } from "./parts-helpers";
import { t } from "../../src/i18n";
import type { MarkingResult, PartJSON } from "../../src/parts/types";

describe("Part", () => {
  it("legge i punti dal JSON", () => {
    const p = createPart({ type: "numberentry", marks: 3, minValue: "1", maxValue: "2" });
    expect(p.marks).toBe(3);
  });

  it("un campo marks vuoto vale 0 punti", () => {
    const p = createPart({ type: "numberentry", marks: "", minValue: "1", maxValue: "2" });
    expect(p.marks).toBe(0);
  });

  it("un tipo sconosciuto lancia part.unknown type", () => {
    expect(() =>
      createPartFromJSON(0, { type: "sconosciuto" } as never, "p0", { scope: freshScope() }),
    ).toThrowError(expect.objectContaining({ key: "part.unknown type" }));
  });

  it("un JSON senza tipo lancia part.missing type attribute", () => {
    expect(() => createPartFromJSON(0, {} as never, "p0", { scope: freshScope() })).toThrowError(
      expect.objectContaining({ key: "part.missing type attribute" }),
    );
  });

  it("un errore di caricamento è riavvolto in part.error con la chiave originale", () => {
    let caught: unknown;
    try {
      createPart({ type: "numberentry", precisionType: "sigfig", precision: "0", minValue: "1", maxValue: "1" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(JmeError);
    expect(partErrorKeys(caught)).toContain("part.error");
    expect(partErrorKeys(caught)).toContain("part.numberentry.zero sig fig");
  });

  it("nicePartName legge percorso, gap e alternativa", () => {
    expect(nicePartName("p0")).toBe("parte a");
    expect(nicePartName("p1g2")).toBe("parte b spazio 2");
    expect(nicePartName("p0a1")).toBe("parte a alternativa 1");
  });

  const stepsData = {
    type: "numberentry" as const,
    marks: 1,
    minValue: "1",
    maxValue: "1",
    steps: [{ type: "information" as const }],
  };

  it("il campo steps è riconosciuto e ignorato", () => {
    resetStepsWarnings();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const p = createPart(stepsData);
    expect(p.steps).toHaveLength(0);
    warn.mockRestore();
  });

  it("l'avviso sugli step è dato una volta per domanda", () => {
    resetStepsWarnings();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const q1: PartQuestion = { getPart: () => undefined };
    const q2: PartQuestion = { getPart: () => undefined };
    createPartFromJSON(0, stepsData, "p0", { scope: freshScope(), questionRef: q1 });
    createPartFromJSON(1, stepsData, "p1", { scope: freshScope(), questionRef: q1 });
    expect(warn).toHaveBeenCalledTimes(1);
    // una seconda domanda avvisa di nuovo, anche con lo stesso percorso
    createPartFromJSON(0, stepsData, "p0", { scope: freshScope(), questionRef: q2 });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("senza domanda l'avviso sugli step è dato una volta per percorso", () => {
    resetStepsWarnings();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createPart(stepsData);
    createPart(stepsData);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("submit produce un MarkingResult e memorizza l'ultimo risultato", () => {
    const p = createPart({ type: "numberentry", marks: 2, minValue: "1", maxValue: "1" });
    expect(p.result).toBeUndefined();
    const res = p.submit("1");
    expect(res.credit).toBe(1);
    expect(res.marks).toBe(2);
    expect(res.score).toBe(2);
    expect(res.correct).toBe(true);
    expect(res.valid).toBe(true);
    expect(res.feedback.map((f) => f.type)).toContain("correct");
    expect(p.result).toBe(res);
  });

  it("submit è idempotente sulla stessa risposta", () => {
    const p = createPart({ type: "numberentry", marks: 2, minValue: "1", maxValue: "1" });
    const a = p.submit("1");
    const b = p.submit("1");
    expect(b).toEqual(a);
    const c = p.submit();
    expect(c).toEqual(a);
  });

  it("una risposta sbagliata dà credito 0 e feedback incorrect", () => {
    const p = createPart({ type: "numberentry", marks: 2, minValue: "1", maxValue: "1" });
    const res = p.submit("2");
    expect(res.credit).toBe(0);
    expect(res.correct).toBe(false);
    expect(res.valid).toBe(true);
    expect(res.feedback.map((f) => f.type)).toContain("incorrect");
  });

  it("una risposta non valida produce warning e valid=false", () => {
    const p = createPart({ type: "numberentry", marks: 2, minValue: "1", maxValue: "1" });
    const res = p.submit("!");
    expect(res.valid).toBe(false);
    expect(res.feedback.some((f) => f.type === "warning")).toBe(true);
  });

  it("showFeedbackIcon=false toglie le voci legate al credito", () => {
    const p = createPart({
      type: "numberentry",
      marks: 1,
      minValue: "1",
      maxValue: "1",
      showFeedbackIcon: false,
    });
    const res = p.submit("1");
    expect(res.credit).toBe(1);
    expect(res.feedback.filter((f) => f.type !== "warning")).toHaveLength(0);
  });

  it("submit(null) è trattato come nessuna risposta, non come una risposta", () => {
    // part.js:1368-1370 — il confronto lasco `stagedAnswer == undefined` fa sì
    // che `null` conti come "nessuna risposta".
    const cases: Array<[string, PartJSON]> = [
      ["numberentry", { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }],
      ["patternmatch", { type: "patternmatch", marks: 1, answer: "hi+", displayAnswer: "hi" }],
      ["jme", { type: "jme", marks: 1, answer: "x+2" }],
      ["1_n_2", { type: "1_n_2", choices: ["a", "b"], matrix: [[1], [0]] }],
      ["m_n_2", { type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]] }],
      ["m_n_x", { type: "m_n_x", choices: ["a", "b"], answers: ["A", "B"], matrix: [[1, 0], [0, 1]] }],
      [
        "gapfill",
        { type: "gapfill", gaps: [{ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }] },
      ],
    ];
    for (const [name, data] of cases) {
      const p = createPart(data);
      let res: MarkingResult | undefined;
      expect(() => {
        res = p.submit(null);
      }, name).not.toThrow();
      expect(p.hasStagedAnswer(), name).toBe(false);
      expect(res!.valid, name).toBe(false);
      expect(res!.credit, name).toBe(0);
      expect(res!.feedback.map((f) => f.message), name).toContain(t("part.marking.not submitted"));
    }
  });

  it("una parte information non corregge nulla", () => {
    const p = createPart({ type: "information" });
    expect(p.doesMarking).toBe(false);
    expect(p.answered).toBe(true);
    const res = p.submit();
    expect(res.credit).toBe(0);
    expect(res.marks).toBe(0);
    expect(res.valid).toBe(true);
  });

  it("customMarkingAlgorithm sostituisce lo script di base", () => {
    const p = createPart({
      type: "numberentry",
      marks: 1,
      minValue: "1",
      maxValue: "1",
      customMarkingAlgorithm: "mark: set_credit(0.25,'parziale')\n\ninterpreted_answer: studentAnswer",
      extendBaseMarkingAlgorithm: false,
    });
    expect(p.submit("999").credit).toBe(0.25);
  });

  it("customMarkingAlgorithm con extendBaseMarkingAlgorithm estende lo script di base", () => {
    const p = createPart({
      type: "numberentry",
      marks: 1,
      minValue: "1",
      maxValue: "1",
      customMarkingAlgorithm: "mark: apply(base_mark); multiply_credit(0.5,'metà')",
      extendBaseMarkingAlgorithm: true,
    });
    expect(p.submit("1").credit).toBe(0.5);
  });

  it("il prompt è conservato grezzo in promptHtml", () => {
    const p = createPart({ type: "numberentry", marks: 1, minValue: "1", maxValue: "1", prompt: "<p>Quanto fa {a}?</p>" });
    expect(p.promptHtml).toBe("<p>Quanto fa {a}?</p>");
  });

  it("un errore in una nota dipendente è registrato in stateErrors senza fermare mark", () => {
    // part-tests.mjs:1250-1261 ("Error in mark note"): `apply(z)` si riferisce
    // a una nota che non esiste. Upstream `compute_note` inghiotte l'errore
    // (`ignore_note_errors`), quindi la nota `mark` viene comunque calcolata e
    // produce uno stato vuoto: qui si verifica proprio quello. L'asserzione
    // upstream su `marking_result.answered` passa da `question_test` e resta
    // al Task 9.
    const p = createPart({
      type: "jme",
      marks: 1,
      answer: "x",
      customMarkingAlgorithm: "q:\n  a\n\nmark:\n  apply(z)",
      extendBaseMarkingAlgorithm: true,
      valuegenerators: [{ name: "x", value: "" }],
    });
    p.storeAnswer("x");
    p.setStudentAnswer();
    const res = p.mark_answer(p.rawStudentAnswerAsJME(), p.getScope());
    expect(Object.keys(res.stateErrors)).toEqual(expect.arrayContaining(["a", "z"]));
    expect(res.stateValid["mark"]).toBe(true);
    expect(res.states["mark"]).toEqual([]);
    expect(p.submit("x").credit).toBe(0);
  });

  it("uno script di correzione senza la nota mark è un errore di caricamento", () => {
    let caught: unknown;
    try {
      createPart({
        type: "numberentry",
        marks: 1,
        minValue: "1",
        maxValue: "1",
        customMarkingAlgorithm: "qualcosa: 1",
        extendBaseMarkingAlgorithm: false,
      });
    } catch (e) {
      caught = e;
    }
    expect(partErrorKeys(caught)).toContain("part.marking.missing required note");
  });
});

describe("Stateful scope", () => {
  it("le chiamate annidate non perdono lo stato", () => {
    const scope = makeMarkingScope(builtinScope);
    scope.evaluate('feedback("Hi");try(correctif(x),y,1);2');
    expect(scope.state).toHaveLength(1);
  });

  it("StatefulScope è la classe dello scope costruito da makeMarkingScope", () => {
    expect(makeMarkingScope(builtinScope)).toBeInstanceOf(StatefulScope);
  });
});

// La superficie che il Task 7 ha lasciato senza test perché non aveva una
// `Part` con cui esercitarla.
describe("marking/note-functions con una Part vera", () => {
  /** Una parte gapfill con due gap numerici e una domanda finta. */
  function gapfillWithQuestion(): PartBase {
    const p = createPart({
      type: "gapfill",
      gaps: [
        { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
        { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
      ],
    });
    attachFakeQuestion(p);
    return p;
  }

  it("submit_part invia la parte all'indirizzo dato e ne ritorna il risultato", () => {
    const p = gapfillWithQuestion();
    const scope = makeMarkingScope(p.getScope());
    const res = scope.evaluate('submit_part("p0g0","1")');
    const value = unwrapValue(res!) as Record<string, unknown>;
    expect(value["credit"]).toBe(1);
    expect(value["marks"]).toBe(1);
    expect(value["answered"]).toBe(true);
    // `submit_part` ripristina la risposta in attesa della parte (marking.js:322-326)
    expect(p.gaps[0]!.stagedAnswer).toBe("");
  });

  it("mark_part corregge senza inviare", () => {
    const p = gapfillWithQuestion();
    const scope = makeMarkingScope(p.getScope());
    const gap = p.gaps[1]!;
    const before = gap.credit;
    const res = scope.evaluate('mark_part("p0g1","2")');
    const value = unwrapValue(res!) as Record<string, unknown>;
    expect(value["credit"]).toBe(1);
    expect(value["valid"]).toBe(true);
    expect(value["marks"]).toBe(1);
    expect(gap.credit).toBe(before);
  });

  it("mark_part con `nothing` assegna credito 0 e il messaggio 'nulla inserito'", () => {
    const p = gapfillWithQuestion();
    const scope = makeMarkingScope(p.getScope());
    const gap = p.gaps[0]!;
    const res = scope.evaluate('mark_part("p0g0",nothing)');
    const value = unwrapValue(res!) as Record<string, unknown>;
    expect(value["credit"]).toBe(0);
    expect(gap.credit).toBe(0);
    expect(gap.markingFeedback.map((f) => f.message)).toContain("Non hai inserito una risposta.");
  });

  it("una parte non trovata fa fallire submit_part", () => {
    const p = gapfillWithQuestion();
    const scope = makeMarkingScope(p.getScope());
    expect(() => scope.evaluate('submit_part("p9")')).toThrowError();
  });

  it("senza domanda nello scope, submit_part lancia marking.no question in scope", () => {
    const p = createPart({ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" });
    const scope = makeMarkingScope(p.getScope());
    expect(() => scope.evaluate('submit_part("p0")')).toThrowError(
      expect.objectContaining({ key: "marking.no question in scope" }),
    );
  });
});
