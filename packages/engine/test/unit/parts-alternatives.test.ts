// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit "Alternative answers" (part-tests.mjs:1713-1793).
//
// Upstream i quattro casi passano da `question_test`, ma nessuno usa variabili
// di domanda: qui la parte è costruita direttamente con `createPartFromJSON`,
// come fa `createPartFromJSON` locale dell'harness upstream (riga 23).

import { describe, it, expect } from "vitest";
import { t } from "../../src/i18n";
import { createPart } from "./parts-helpers";

/** I messaggi di `markingFeedback`, uno per riga. */
function collectFeedback(messages: Array<{ message?: string | undefined }>): string {
  return messages.map((m) => m.message ?? "").join("\n");
}

describe("Alternative answers", () => {
  it("una risposta numerica alternativa", () => {
    const p = createPart({
      type: "numberentry",
      marks: 1,
      minValue: "1",
      maxValue: "1",
      alternatives: [
        {
          type: "numberentry",
          useCustomName: true,
          customName: "2",
          marks: 0.5,
          alternativeFeedbackMessage: "<p>You wrote 2.</p>",
          useAlternativeFeedback: false,
          minValue: "2",
          maxValue: "2",
        },
      ],
    });
    p.submit("1");
    expect(p.credit).toBe(1);
    p.submit("2");
    expect(p.credit).toBe(0.5);
    expect(p.markingFeedback[0]!.message).toBe("<p>You wrote 2.</p>");
  });

  it("la parte principale dà credito parziale, l'alternativa lo batte", () => {
    const p = createPart({
      type: "numberentry",
      marks: 1,
      customMarkingAlgorithm: "mark: set_credit(0.25,'partial')",
      extendBaseMarkingAlgorithm: true,
      alternatives: [
        { type: "numberentry", useCustomName: true, customName: "alternative", marks: 1, minValue: "1", maxValue: "1" },
      ],
      minValue: "1",
      maxValue: "1",
    });
    p.submit("1");
    expect(p.credit).toBe(1);
  });

  it("le alternative allargano l'intervallo accettato", () => {
    const p = createPart({
      type: "numberentry",
      useCustomName: true,
      customName: "1",
      marks: "5",
      alternatives: [
        {
          type: "numberentry",
          useCustomName: true,
          customName: "0-2",
          marks: "4",
          alternativeFeedbackMessage: "",
          useAlternativeFeedback: false,
          minValue: "0",
          maxValue: "2",
        },
        {
          type: "numberentry",
          useCustomName: true,
          customName: "0-3",
          marks: "3",
          alternativeFeedbackMessage: "",
          useAlternativeFeedback: false,
          minValue: "0",
          maxValue: "3",
        },
      ],
      minValue: "1",
      maxValue: "1",
    });
    p.submit("1");
    expect(p.credit).toBe(1);
    p.submit("2");
    expect(p.credit).toBe(4 / 5);
    p.submit("3");
    expect(p.credit).toBe(3 / 5);
    p.submit("4");
    expect(p.credit).toBe(0);
  });

  it("useAlternativeFeedback mostra tutto il feedback dell'alternativa", () => {
    const p = createPart({
      type: "jme",
      useCustomName: true,
      customName: "x",
      marks: 1,
      alternatives: [
        {
          type: "jme",
          useCustomName: true,
          customName: "y - not all feedback",
          marks: "0.5",
          alternativeFeedbackMessage: "<p>You wrote y</p>",
          useAlternativeFeedback: false,
          answer: "y",
          checkingType: "absdiff",
          checkingAccuracy: 0.001,
          failureRate: 1,
          vsetRangePoints: 5,
          vsetRange: [0, 1],
          valuegenerators: [{ name: "y", value: "" }],
        },
        {
          type: "jme",
          useCustomName: true,
          customName: "z - all feedback",
          marks: 0.5,
          alternativeFeedbackMessage: "<p>You wrote z</p>",
          useAlternativeFeedback: true,
          answer: "z",
          checkingType: "absdiff",
          checkingAccuracy: 0.001,
          failureRate: 1,
          vsetRangePoints: 5,
          vsetRange: [0, 1],
          valuegenerators: [{ name: "x", value: "" }],
        },
      ],
      answer: "x",
      checkingType: "absdiff",
      checkingAccuracy: 0.001,
      failureRate: 1,
      vsetRangePoints: 5,
      vsetRange: [0, 1],
      valuegenerators: [{ name: "x", value: "" }],
    });
    p.submit("x");
    expect(collectFeedback(p.markingFeedback)).toBe(t("part.jme.marking.correct"));
    p.submit("y");
    expect(collectFeedback(p.markingFeedback)).toBe("<p>You wrote y</p>");
    p.submit("z");
    expect(collectFeedback(p.markingFeedback)).toBe(t("part.jme.marking.correct") + "\n<p>You wrote z</p>");
  });

  it("un'alternativa non valida non viene scelta", () => {
    const p = createPart({
      type: "numberentry",
      marks: 1,
      minValue: "1",
      maxValue: "1",
      alternatives: [
        {
          type: "numberentry",
          marks: 1,
          minValue: "2",
          maxValue: "2",
          alternativeFeedbackMessage: "alternativa",
        },
      ],
    });
    const res = p.submit("!");
    expect(res.valid).toBe(false);
    expect(res.credit).toBe(0);
  });
});
