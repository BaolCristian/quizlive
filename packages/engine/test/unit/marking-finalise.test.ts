// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Casi presi da `marking.js:608-693` (`finalise_state`), letti riga per riga.

import { describe, it, expect } from "vitest";
// dettagli interni: non sono nella superficie pubblica di `marking/`.
import { finaliseState } from "../../src/marking/finalise-state";
import { feedback as f } from "../../src/marking/feedback";

describe("finaliseState", () => {
  it("set_credit poi add_credit: 0.5 + 0.25 esatti", () => {
    const r = finaliseState([f.set_credit(0.5, "incorrect", "a"), f.add_credit(0.25, "b")]);
    expect(r.credit).toBe(0.75);
    expect(r.valid).toBe(true);
  });

  it("tre add_credit da 1/3 danno 1 (via Fraction.fromFloat, come upstream)", () => {
    const r = finaliseState([f.add_credit(1 / 3), f.add_credit(1 / 3), f.add_credit(1 / 3)]);
    expect(r.credit).toBeCloseTo(1, 12);
  });

  // Il brief chiedeva `credit === 0` anche qui, ma `end` NON azzera il credito
  // (marking.js:644-656: imposta solo `valid = false` e interrompe). Ad
  // azzerarlo è il `set_credit(0, 'invalid', …)` che `fail()` emette PRIMA di
  // `end(true)` (marking.js:225-233) — il secondo caso qui sotto.
  it("end(true) rende invalido ma non tocca il credito", () => {
    const r = finaliseState([f.set_credit(1), f.end(true)]);
    expect(r.valid).toBe(false);
    expect(r.credit).toBe(1);
  });

  it("la sequenza prodotta da fail() rende invalido e azzera", () => {
    const r = finaliseState([f.set_credit(1), f.set_credit(0, "invalid", "no"), f.end(true)]);
    expect(r.valid).toBe(false);
    expect(r.credit).toBe(0);
  });

  it("end() interrompe: gli stati successivi sono ignorati", () => {
    const r = finaliseState([f.set_credit(0.5), f.end(), f.set_credit(1)]);
    expect(r.credit).toBe(0.5);
  });

  it("concat con scale moltiplica il credito dei sotto-stati", () => {
    const r = finaliseState([f.concat([f.set_credit(1)], 0.5)]);
    expect(r.credit).toBe(0.5);
  });

  it("multiply_credit", () => {
    expect(finaliseState([f.set_credit(1), f.multiply_credit(0.5)]).credit).toBe(0.5);
  });

  // marking.js:640-643
  it("sub_credit sottrae", () => {
    expect(finaliseState([f.set_credit(1), f.sub_credit(0.25, "meno")]).credit).toBe(0.75);
  });

  // marking.js:657-663 — `concat` è espanso INLINE come start_lift/…/end_lift,
  // quindi `out_states` non contiene mai l'item `concat` originale.
  it("concat è espanso in start_lift/…/end_lift e non compare in states", () => {
    const r = finaliseState([f.set_credit(0.5), f.concat([f.set_credit(1)], 0.5)]);
    expect(r.states.map((s) => s.op)).toEqual(["set_credit", "start_lift", "set_credit", "end_lift"]);
    // 0.5 (fuori dal lift) + 1 * 0.5 (dentro) = 1
    expect(r.credit).toBe(1);
  });

  // marking.js:649-652 — dentro un lift, `end` salta al prossimo `end_lift`
  // invece di terminare tutto lo script.
  it("end dentro un lift interrompe solo il lift", () => {
    const r = finaliseState([
      f.concat([f.set_credit(1), f.end(), f.set_credit(0)], 1),
      f.add_credit(0.5, "dopo"),
    ]);
    expect(r.credit).toBe(1.5);
    expect(r.valid).toBe(true);
  });

  // marking.js:646-648 — un `end(true)` dentro un lift rende comunque invalida
  // tutta la risposta.
  it("end(true) dentro un lift rende invalido tutto", () => {
    const r = finaliseState([f.concat([f.set_credit(0), f.end(true)], 1)]);
    expect(r.valid).toBe(false);
  });

  // marking.js:681-682 — warning e feedback finiscono in `states` senza
  // toccare il credito.
  it("warning e feedback non toccano il credito", () => {
    const r = finaliseState([f.warning("attento"), f.set_credit(1), f.feedback("nota")]);
    expect(r.credit).toBe(1);
    expect(r.states.map((s) => s.op)).toEqual(["warning", "set_credit", "feedback"]);
  });
});
