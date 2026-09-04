// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

import { describe, it, expect } from "vitest";
import { builtinScope } from "../../src/jme";
import { wrapValue } from "../../src/jme/evaluate";
import { THTML, TString, type Token } from "../../src/jme/tokens";
import { MarkingScript } from "../../src/marking";
// dettagli interni: non sono nella superficie pubblica di `marking/`.
import { finaliseState } from "../../src/marking/finalise-state";
import { makeMarkingScope } from "../../src/marking/note-functions";
import { markingScripts } from "../../src/marking/scripts";

/** I parametri della lista in inventario §3.1 per `numberentry.jme`. */
function numberEntrySettings(over?: Record<string, unknown>): Token {
  return wrapValue({
    allowFractions: false,
    notationStyles: ["plain"],
    mustBeReduced: false,
    mustBeReducedPC: 0,
    precisionType: "none",
    precision: 0,
    minvalue: 2,
    maxvalue: 2,
    strictPrecision: true,
    precisionPC: 0,
    precisionMessage: "",
    ...(over ?? {}),
  });
}

describe("MarkingScript", () => {
  it("uno script minimo produce lo stato della nota `mark`", () => {
    const script = new MarkingScript('mark: correct("Ok")');
    const result = script.evaluate(builtinScope, {});
    expect(result.states.mark?.[0]).toMatchObject({
      op: "set_credit",
      credit: 1,
      reason: "correct",
      message: "Ok",
    });
    expect(result.stateValid.mark).toBe(true);
    expect(finaliseState(result.states.mark ?? []).credit).toBe(1);
  });

  it("le note sono valutate una sola volta e `apply` ne riproduce lo stato", () => {
    const script = new MarkingScript(["a: correct()", "mark: apply(a); apply(a)"].join("\n\n"));
    const result = script.evaluate(builtinScope, {});
    // `apply` concatena lo stato GIÀ calcolato della nota `a`, due volte
    expect(result.states.mark?.map((s) => s.op)).toEqual(["set_credit", "set_credit"]);
    expect(result.states.a?.length).toBe(1);
  });

  it("un errore in una nota la rende non valida senza far fallire le altre", () => {
    const script = new MarkingScript(["bad: nonexistent_function(1)", "mark: correct()"].join("\n\n"));
    const result = script.evaluate(builtinScope, {});
    expect(result.stateValid.bad).toBe(false);
    expect(result.stateErrors.bad).toBeInstanceOf(Error);
    expect(result.stateValid.mark).toBe(true);
  });

  it("`fail` rende la risposta non valida, `warn` no", () => {
    const failed = finaliseState(
      new MarkingScript('mark: fail("no")').evaluate(builtinScope, {}).states.mark ?? [],
    );
    expect(failed.valid).toBe(false);
    const warned = finaliseState(
      new MarkingScript('mark: warn("attento"); correct()').evaluate(builtinScope, {}).states.mark ?? [],
    );
    expect(warned.valid).toBe(true);
    expect(warned.credit).toBe(1);
  });

  it("evaluate_note ritorna il valore e lo StatefulScope", () => {
    const script = new MarkingScript(["a: 1+1", "mark: correct()"].join("\n\n"));
    const res = script.evaluate_note("a", builtinScope, {});
    expect((res.value as { value?: unknown } | undefined)?.value).toBe(2);
    expect(res.scope.stateErrors).toEqual({});
  });

  it("makeMarkingScope registra le funzioni di stato", () => {
    const scope = makeMarkingScope(builtinScope);
    expect(scope.getFunction("correct").length).toBeGreaterThan(0);
    expect(scope.getFunction("concat_feedback").length).toBeGreaterThan(0);
    expect(scope.state).toEqual([]);
  });
});

describe("le funzioni del linguaggio delle note", () => {
  // marking.js:119-121, 561-563 — ogni item porta lo scope in cui è stato
  // prodotto e il nome della nota che lo ha prodotto: il Task 8 ne ha bisogno
  // per la sostituzione delle variabili nei messaggi.
  it("ogni item porta lo scope e il nome della nota", () => {
    const result = new MarkingScript('mark: correct("Ok")').evaluate(builtinScope, {});
    const item = result.states.mark?.[0];
    expect(item?.note).toBe("mark");
    expect(item?.scope?.type).toBe("scope");
  });

  // marking.js:444-454 + 657-663
  it("concat_feedback produce un blocco lift con il fattore di scala", () => {
    const result = new MarkingScript(
      'mark: concat_feedback([["op": "set_credit", "credit": 1]], 0.5)',
    ).evaluate(builtinScope, {});
    expect(result.states.mark?.[0]?.op).toBe("concat");
    expect(finaliseState(result.states.mark ?? []).credit).toBe(0.5);
  });

  // marking.js:444-449 — con `strip_messages` i messaggi sono azzerati.
  it("concat_feedback con strip_messages azzera i messaggi", () => {
    const result = new MarkingScript(
      'mark: concat_feedback([["op": "feedback", "message": "ciao"]], 1, true)',
    ).evaluate(builtinScope, {});
    expect(result.states.mark?.[0]?.messages?.[0]?.message).toBe("");
  });

  // marking.js:201-206 — il ramo falso di `add_credit_if` usa la ragione
  // `neutral` per una penalità (n < 0), `incorrect` altrimenti.
  it("add_credit_if usa la ragione neutral per un credito negativo", () => {
    const neg = new MarkingScript('mark: add_credit_if(false, -0.5, "si", "no")').evaluate(
      builtinScope,
      {},
    );
    expect(neg.states.mark?.[0]).toMatchObject({ op: "feedback", reason: "neutral", message: "no" });
    const pos = new MarkingScript('mark: add_credit_if(false, 0.5, "si", "no")').evaluate(builtinScope, {});
    expect(pos.states.mark?.[0]).toMatchObject({ op: "feedback", reason: "incorrect" });
  });

  // marking.js:258-275 — le versioni HTML marcano `format: "html"`. Il motore
  // non ha un costruttore JME `html(...)` (fa parte dei builtin legati al DOM,
  // fuori ambito), quindi il token HTML arriva come parametro dello script.
  it("il feedback HTML è marcato con format html", () => {
    const result = new MarkingScript("mark: negative_feedback(h)").evaluate(builtinScope, {
      h: new THTML("<b>no</b>"),
    });
    expect(result.stateErrors.mark).toBeUndefined();
    expect(result.states.mark?.[0]).toMatchObject({
      op: "feedback",
      reason: "incorrect",
      format: "html",
      message: "<b>no</b>",
    });
  });

  // marking.js:276-280 — `;` ritorna il secondo argomento, ma lo stato di
  // entrambi è già stato accumulato.
  it("`;` incatena gli effetti e ritorna il secondo valore", () => {
    const result = new MarkingScript('mark: warn("a"); set_credit(0.5, "b")').evaluate(builtinScope, {});
    expect(result.states.mark?.map((s) => s.op)).toEqual(["warning", "set_credit"]);
    expect((result.values.mark as { value?: unknown } | undefined)?.value).toBe(0.5);
  });
});

describe("lo script numberentry incorporato", () => {
  it('accetta "2" quando minvalue = maxvalue = 2', () => {
    const script = new MarkingScript(markingScripts.numberentry);
    const result = script.evaluate(builtinScope, {
      studentAnswer: new TString("2"),
      settings: numberEntrySettings(),
    });
    expect(result.stateErrors.mark).toBeUndefined();
    const finalised = finaliseState(result.states.mark ?? []);
    expect(finalised.credit).toBe(1);
    expect(finalised.valid).toBe(true);
  });

  it('rifiuta "3" fuori intervallo', () => {
    const script = new MarkingScript(markingScripts.numberentry);
    const result = script.evaluate(builtinScope, {
      studentAnswer: new TString("3"),
      settings: numberEntrySettings(),
    });
    const finalised = finaliseState(result.states.mark ?? []);
    expect(finalised.credit).toBe(0);
    expect(finalised.valid).toBe(true);
  });

  it('rifiuta "abc" come risposta non valida, con un avviso', () => {
    const script = new MarkingScript(markingScripts.numberentry);
    const result = script.evaluate(builtinScope, {
      studentAnswer: new TString("abc"),
      settings: numberEntrySettings(),
    });
    const finalised = finaliseState(result.states.mark ?? []);
    expect(finalised.valid).toBe(false);
    expect(finalised.credit).toBe(0);
    expect(finalised.states.some((s) => s.op === "warning")).toBe(true);
  });
});

describe("gli altri script incorporati", () => {
  it("si compilano tutti e definiscono le note `mark` e `interpreted_answer`", () => {
    for (const [name, source] of Object.entries(markingScripts)) {
      const script = new MarkingScript(source);
      expect(Object.keys(script.notes), name).toContain("mark");
      expect(Object.keys(script.notes), name).toContain("interpreted_answer");
    }
  });
});
