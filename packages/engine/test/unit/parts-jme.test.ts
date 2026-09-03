// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit "JME" (part-tests.mjs:356-638), una `it` per
// `assert`.
//
// Restano al Task 9 i due casi che costruiscono una `Question` intera:
// - `question_test('Variables defined by the question aren't used in
//   evaluating student's expression')` (part-tests.mjs:521-559);
// - `question_unit_test('Expression is case-sensitive')` (568-584).

import { describe, it, expect } from "vitest";
import { Scope } from "../../src/jme/scope";
import { builtinScope } from "../../src/jme/builtins";
import { createPart, markPart, equalStates, noteName } from "./parts-helpers";
import type { JMEPart } from "../../src/parts/jme-part";

describe("JME", () => {
  it('la risposta è "x+2"', () => {
    const p = createPart({ type: "jme", answer: "x+2" });
    expect(markPart(p, "x+2").credit).toBe(1);
    expect(markPart(p, "2+x").credit).toBe(1);
    expect(markPart(p, "2").credit).toBe(0);
    expect(markPart(p, "!").valid).toBe(false);
    expect(markPart(p, "").valid).toBe(false);
  });

  it("una risposta che non si può valutare non è valida", () => {
    const data = {
      type: "jme" as const,
      marks: 1,
      answer: "x^2+x",
      musthave: { strings: ["("], showStrings: false, partialCredit: 0, message: "didn't use (" },
      notallowed: { strings: ["^"], showStrings: false, partialCredit: 0, message: "did use ^" },
    };
    const p = createPart(data);

    const res = markPart(p, "x(x+1)");
    expect(res.valid).toBe(false);
    equalStates(
      res.states,
      [
        { op: "warning", note: noteName("agree") },
        { op: "set_credit", credit: 0, reason: "invalid", note: noteName("agree") },
        { op: "end", invalid: true, note: noteName("agree") },
      ],
      { ignoreMessages: true },
    );

    const res2 = markPart(p, "`");
    expect(res2.valid).toBe(false);
    equalStates(
      res2.states,
      [
        { op: "warning", note: noteName("studentexpr") },
        { op: "set_credit", credit: 0, reason: "invalid", note: noteName("studentexpr") },
        { op: "end", invalid: true, note: noteName("studentexpr") },
      ],
      { ignoreMessages: true },
    );
    expect(res2.states[0]!.message).toContain("`");
  });

  it("una differenza di maiuscole in una formula è accettata", () => {
    const data = {
      type: "jme" as const,
      marks: 1,
      answer: "x=(y-B)/A",
      checkingType: "absdiff",
      checkingAccuracy: 0.001,
      failureRate: 1,
      vsetRangePoints: 5,
      vsetRange: [0, 1],
      checkVariableNames: false,
      singleLetterVariables: false,
      allowUnknownFunctions: true,
      implicitFunctionComposition: false,
      valuegenerators: [
        { name: "a", value: "" },
        { name: "b", value: "" },
        { name: "x", value: "" },
        { name: "y", value: "" },
      ],
    };
    const p = createPart(data);
    expect(markPart(p, "x=(y-b)/a").credit).toBe(1);
  });

  it("lo studente non usa tutte le variabili della risposta corretta", () => {
    const data = {
      type: "jme" as const,
      marks: 1,
      answer: "x +  0*y^t",
      answerSimplification: "basic",
      checkingType: "absdiff",
      checkingAccuracy: 0.001,
      failureRate: 1,
      vsetRangePoints: 5,
      vsetRange: [0, 1],
      checkVariableNames: false,
      mustmatchpattern: {
        pattern: "? + ?*?^?",
        partialCredit: "50",
        message: "Pattern",
        nameToCompare: "",
      },
      valuegenerators: [
        { name: "t", value: "" },
        { name: "x", value: "" },
        { name: "y", value: "" },
      ],
    };
    const p = createPart(data);
    const res = markPart(p, "x");
    expect(res.valid).toBe(true);
    equalStates(
      res.states,
      [
        { op: "set_credit", credit: 1, reason: "correct", note: noteName("numericallyCorrect") },
        { op: "multiply_credit", factor: 0.5, note: noteName("failMatchPattern") },
      ],
      { ignoreMessages: true },
    );
    expect(res.credit).toBe(0.5);
  });

  it("i decimali non sono sostituiti in notazione scientifica", () => {
    const p = createPart({ type: "jme", marks: 1, answer: '{dec("1.234567890123456e-1")}' });
    expect(p.correctAnswer()).toBe("0.1234567890123456");
  });

  it("il segno di uguale in una formula diventa uguaglianza approssimata", () => {
    const p = createPart({ type: "jme", marks: 1, answer: "y = (x+1/3)^3", vsetRangePoints: 50 });
    expect(markPart(p, "y = x^3 + x^2 + x/3 + 1/27").credit).toBe(1);
  });

  it("sostituzione di un numero negativo nella risposta corretta", () => {
    const p = createPart({ type: "jme", answer: "{a}^2" });
    const a = builtinScope.evaluate("-2");
    const s = new Scope([builtinScope, { variables: { a: a! } }]);
    p.setScope(s);
    expect(p.getCorrectAnswer(s)).toBe("4");
  });

  it("sostituzione di un decimale nella risposta corretta", () => {
    const p = createPart({ type: "jme", answer: "{dec(-3)}^x" });
    expect(p.correctAnswer()).toBe("(-3)^x");
  });

  it("sostituzione di un decimale grande arrotondato nella risposta corretta", () => {
    const p = createPart({ type: "jme", answer: '{siground(dec("1.62e+6"),3)}' });
    expect(markPart(p, "1620000").credit).toBe(1);
  });

  it("le giustapposizioni sono espanse nella risposta corretta", () => {
    const p = createPart({ type: "jme", answer: "(alpha(x))^2", allowUnknownFunctions: false });
    expect(p.correctAnswer()).toBe("(alpha*x)^2");
  });

  it("reldiff usa il valore assoluto del denominatore", () => {
    const p = createPart({
      type: "jme",
      marks: 1,
      answer: "-t - 1/4",
      checkingType: "reldiff",
      checkingAccuracy: "0.001",
    });
    expect(markPart(p, "-t - 1/4").credit).toBe(1);
  });
});

describe("JME — impostazioni", () => {
  it("answerSimplification prende il default quando non è indicata", () => {
    const p = createPart({ type: "jme", answer: "x+2" }) as JMEPart;
    expect(p.settings.answerSimplificationString).toContain("collectNumbers");
  });

  it("maxLength applica il credito parziale", () => {
    // upstream (jme.js:156-157) NON divide `maxLengthPC`/`minLengthPC` per
    // 100, a differenza di `mustMatchPC` (161): il valore è già una quota.
    const tooLong = createPart({
      type: "jme",
      marks: 1,
      answer: "x+2",
      maxlength: { length: 2, partialCredit: 0.5, message: "troppo lunga" },
    });
    const res = markPart(tooLong, "x+2");
    expect(res.credit).toBe(0.5);
    expect(res.states.some((s) => s.message === "troppo lunga")).toBe(true);
  });

  it("notallowed toglie credito e avvisa", () => {
    const p = createPart({
      type: "jme",
      marks: 1,
      answer: "x^2",
      notallowed: { strings: ["^"], showStrings: false, partialCredit: 0, message: "niente ^" },
    });
    const res = markPart(p, "x^2");
    expect(res.credit).toBe(0);
    expect(res.states.some((s) => s.op === "warning" && s.message === "niente ^")).toBe(true);
  });

  it("checkVariableNames segnala una variabile inattesa", () => {
    const p = createPart({ type: "jme", marks: 1, answer: "x+2", checkVariableNames: true });
    const res = markPart(p, "y+2");
    expect(res.states.some((s) => s.op === "warning")).toBe(true);
  });

  it("vsetRange e vsetRangePoints leggono il generatore dello scope", () => {
    const p = createPart({
      type: "jme",
      marks: 1,
      answer: "x^2",
      vsetRange: [1, 2],
      vsetRangePoints: 10,
    }) as JMEPart;
    expect(p.settings.vsetRangeStart).toBe(1);
    expect(p.settings.vsetRangeEnd).toBe(2);
    expect(p.settings.vsetRangePoints).toBe(10);
    expect(markPart(p, "x*x").credit).toBe(1);
  });
});
