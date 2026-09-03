// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit "Number entry" (part-tests.mjs:218-355), una
// `it` per `assert`.

import { describe, it, expect } from "vitest";
import { createPart, markPart, containsNote, noteName } from "./parts-helpers";

describe("Number entry", () => {
  it("la risposta è 1", () => {
    const p = createPart({ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" });
    expect(markPart(p, "1").credit).toBe(1);
    expect(markPart(p, "0").credit).toBe(0);
    const res = markPart(p, "!");
    expect(res.credit).toBe(0);
    expect(res.valid).toBe(false);
  });

  it("credito parziale per precisione sbagliata", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "0.1",
      maxValue: "0.1",
      precision: "2",
      precisionType: "dp",
      precisionPartialCredit: 20,
    });
    expect(markPart(p, "0.1000").credit).toBeCloseTo(0.2, 12);
  });

  it("la risposta è 1/3, frazioni non ammesse", () => {
    const p = createPart({ type: "numberentry", minValue: "1/3", maxValue: "1/3" });
    const res = markPart(p, "1/3");
    expect(res.credit).toBe(0);
    expect(res.valid).toBe(false);
  });

  it("la risposta è 1/3, frazioni ammesse", () => {
    const p = createPart({ type: "numberentry", minValue: "1/3", maxValue: "1/3", allowFractions: true });
    expect(markPart(p, "1/3").credit).toBe(1);
  });

  it("la risposta è 1/3, la frazione deve essere ridotta", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "1/3",
      maxValue: "1/3",
      allowFractions: true,
      mustBeReduced: true,
      mustBeReducedPC: 50,
    });
    expect(markPart(p, "1/3").credit).toBe(1);
    const res = markPart(p, "2/6");
    expect(res.credit).toBe(0.5);
    expect(containsNote(res, { note: noteName("cancelled"), factor: 0.5, op: "multiply_credit" })).toBe(true);
  });

  it("la risposta è 1/3, a 2 decimali", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "1/3",
      maxValue: "1/3",
      precision: "2",
      precisionType: "dp",
    });
    expect(markPart(p, "0.33").credit).toBe(1);
    expect(markPart(p, "0.330").credit).toBe(0);
  });

  it("la risposta è 0.1, a 2 decimali", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "0.1",
      maxValue: "0.1",
      precision: "2",
      precisionType: "dp",
    });
    expect(markPart(p, "0.1").credit).toBe(1);
    expect(markPart(p, "0.10").credit).toBe(1);
    expect(markPart(p, "0.100").credit).toBe(0);
  });

  it("la risposta è 0.1, a 2 decimali, stretta", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "0.1",
      maxValue: "0.1",
      precision: "2",
      precisionType: "dp",
      strictPrecision: true,
    });
    expect(markPart(p, "0.1").credit).toBe(0);
  });

  it("la risposta è 1.22, a 1 decimale, stretta", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "1.22",
      maxValue: "1.22",
      precision: "1",
      precisionType: "dp",
      strictPrecision: true,
      precisionPartialCredit: 50,
    });
    expect(markPart(p, "1.20").credit).toBe(0);
    const res = markPart(p, "1.22");
    expect(res.credit).toBe(0.5);
    expect(containsNote(res, { note: noteName("correctPrecision"), factor: 0.5, op: "multiply_credit" })).toBe(true);
    expect(markPart(p, "1.2").credit).toBe(1);
  });

  it("la risposta è 1.27, a 1 decimale, stretta", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "1.27",
      maxValue: "1.27",
      precision: "1",
      precisionType: "dp",
      strictPrecision: true,
      precisionPartialCredit: 50,
    });
    const res = markPart(p, "1.27");
    expect(res.credit).toBe(0.5);
    expect(containsNote(res, { note: noteName("correctPrecision"), factor: 0.5, op: "multiply_credit" })).toBe(true);
    expect(markPart(p, "1.3").credit).toBe(1);
  });

  it("la risposta è 1.27, a 2 cifre significative, stretta", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "1.27",
      maxValue: "1.27",
      precision: "2",
      precisionType: "sigfig",
      strictPrecision: true,
      precisionPartialCredit: 50,
    });
    const res = markPart(p, "1.27");
    expect(res.credit).toBe(0.5);
    expect(containsNote(res, { note: noteName("correctPrecision"), factor: 0.5, op: "multiply_credit" })).toBe(true);
    expect(markPart(p, "1.3").credit).toBe(1);
  });

  it("la risposta è 12700, a 2 cifre significative, stretta", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "12700",
      maxValue: "12700",
      precision: "2",
      precisionType: "sigfig",
      strictPrecision: true,
      precisionPartialCredit: 50,
    });
    const res = markPart(p, "12700");
    expect(res.credit).toBe(0.5);
    expect(containsNote(res, { note: noteName("correctPrecision"), factor: 0.5, op: "multiply_credit" })).toBe(true);
    expect(markPart(p, "13000").credit).toBe(1);
  });

  it("la risposta è 123, solo notazione scientifica", () => {
    const p = createPart({
      type: "numberentry",
      minValue: "123",
      maxValue: "123",
      notationStyles: ["scientific"],
    });
    expect(markPart(p, "1.23e2").credit).toBe(1);
    expect(markPart(p, "1.23e+2").credit).toBe(1);
    expect(markPart(p, "1.23 e 2").credit).toBe(1);
    expect(markPart(p, "123").credit).toBe(0);
  });

  it("infinity non è corretto", () => {
    const p = createPart({
      type: "numberentry",
      useCustomName: false,
      customName: "",
      marks: 1,
      showCorrectAnswer: true,
      showFeedbackIcon: true,
      variableReplacements: [],
      variableReplacementStrategy: "originalfirst",
      adaptiveMarkingPenalty: 0,
      customMarkingAlgorithm: "",
      extendBaseMarkingAlgorithm: true,
      unitTests: [],
      minValue: "1",
      maxValue: "1",
      correctAnswerFraction: false,
      allowFractions: false,
      mustBeReduced: false,
      mustBeReducedPC: 0,
      showFractionHint: true,
      notationStyles: ["plain", "en", "si-en"],
      correctAnswerStyle: "plain",
    });
    expect(markPart(p, "1").credit).toBe(1);
    expect(markPart(p, "infinity").credit).toBe(0);
  });

  it("il margine è alla dodicesima cifra significativa", () => {
    const p = createPart({
      type: "numberentry",
      minvalue: "precround(4^7.9,1)",
      maxvalue: "precround(4^7.9,1)",
      marks: 1,
    });
    expect(markPart(p, "57052.4").credit).toBe(1);
  });

  it("minimo e massimo sono -infinity e +infinity", () => {
    const scientific = (min: string, max: string): string =>
      String(
        createPart({
          type: "numberentry",
          marks: 1,
          minValue: min,
          maxValue: max,
          notationStyles: ["scientific"],
          correctAnswerStyle: "scientific",
        }).correctAnswer(),
      );
    expect(scientific("-infinity", "infinity")).toBe("0e+0");
    expect(scientific("infinity", "infinity")).toBe("infinity");
    expect(scientific("12", "infinity")).toBe("1.2e+1");
    expect(scientific("-infinity", "50")).toBe("5e+1");

    const plain = (min: string, max: string): string =>
      String(
        createPart({
          type: "numberentry",
          marks: 1,
          minValue: min,
          maxValue: max,
          notationStyles: ["plain"],
          correctAnswerStyle: "plain",
        }).correctAnswer(),
      );
    expect(plain("-infinity", "infinity")).toBe("0");
    expect(plain("infinity", "infinity")).toBe("infinity");
    expect(plain("12", "infinity")).toBe("12");
    expect(plain("-infinity", "50")).toBe("50");
  });
});
