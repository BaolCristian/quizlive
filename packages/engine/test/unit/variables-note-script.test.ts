// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Test nostri per `note_script_constructor` (jme-variables.js:846-938): nessun
// test upstream puro esiste per questo (usato da `marking.js`, Task 7, fuori
// scope qui). Costruisce una classe con `constructScope = (s) => new
// Scope(s)` e `processResult = (r) => r`, come da brief del Task 6.

import { describe, it, expect } from "vitest";
import { Scope, TNum } from "../../src/jme";
import { builtinScope } from "../../src/jme/builtins";
import type { MakeVariablesResult } from "../../src/variables";
// dettaglio interno: non è nella superficie pubblica di `variables/`.
import { noteScriptConstructor } from "../../src/variables/note-script";
import { JmeError } from "../../src/jme/errors";

const Script = noteScriptConstructor<MakeVariablesResult>(
  (s) => new Scope(s),
  (r) => r,
);

describe("noteScriptConstructor", () => {
  it("analizza le note (nome, descrizione opzionale, espressione) e calcola i valori", () => {
    // le note si separano su una riga vuota (jme-variables.js:868,
    // `source.split(/\n(?:\s*\n)+(?!\s)/)`): un solo `\n` NON separa due
    // note, resterebbero un'unica definizione con un'espressione non valida.
    const script = new Script("a: 1\n\nb (la somma): a+1", undefined, builtinScope);
    expect(script.notes.b!.description).toBe("la somma");
    const result = script.evaluate(builtinScope);
    expect((result.variables.b as TNum).value).toBe(2);
  });

  it("riferimento circolare fra note → chiave upstream", () => {
    const script = new Script("a: b\n\nb: a", undefined, builtinScope);
    expect(() => script.evaluate(builtinScope)).toThrow(JmeError);
    try {
      script.evaluate(builtinScope);
    } catch (e) {
      expect((e as JmeError).key).toBe("jme.variables.circular reference");
    }
  });
});
