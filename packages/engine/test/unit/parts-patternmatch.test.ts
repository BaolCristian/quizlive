// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit "Pattern match" (part-tests.mjs:639-662).

import { describe, it, expect } from "vitest";
import { createPart, markPart } from "./parts-helpers";

describe("Pattern match", () => {
  it('la risposta è "hi+"', () => {
    const p = createPart({ type: "patternmatch", answer: "hi+", displayAnswer: "hi" });
    expect(markPart(p, "hi").credit).toBe(1);
    expect(markPart(p, "hiiiiii").credit).toBe(1);
    expect(markPart(p, "h").credit).toBe(0);
    const res = markPart(p, "???");
    expect(res.credit).toBe(0);
    expect(res.valid).toBe(true);
  });

  it("ammette la risposta vuota", () => {
    const p = createPart({ type: "patternmatch", answer: "a*", displayAnswer: "aaaa", allowEmpty: true });
    expect(markPart(p, "").credit).toBe(1);
    expect(markPart(p, "aaaa").credit).toBe(1);
    expect(markPart(p, "h").credit).toBe(0);
  });

  it("senza allowEmpty la risposta vuota non è valida", () => {
    const p = createPart({ type: "patternmatch", answer: "a*", displayAnswer: "aaaa" });
    const res = markPart(p, "");
    expect(res.valid).toBe(false);
  });

  it("matchMode esatto confronta letteralmente", () => {
    const p = createPart({ type: "patternmatch", answer: "hi+", displayAnswer: "hi+", matchMode: "exact" });
    expect(markPart(p, "hi+").credit).toBe(1);
    expect(markPart(p, "hiiii").credit).toBe(0);
  });

  it("caseSensitive dà credito parziale a chi sbaglia solo le maiuscole", () => {
    const p = createPart({
      type: "patternmatch",
      answer: "Hi",
      displayAnswer: "Hi",
      caseSensitive: true,
      partialCredit: 50,
    });
    expect(markPart(p, "Hi").credit).toBe(1);
    expect(markPart(p, "hi").credit).toBe(0.5);
    expect(markPart(p, "ho").credit).toBe(0);
  });

  it("la risposta mostrata al reveal è displayAnswer", () => {
    const p = createPart({ type: "patternmatch", answer: "hi+", displayAnswer: "hi" });
    expect(p.correctAnswer()).toBe("hi");
  });
});
