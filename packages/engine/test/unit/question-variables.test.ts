// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Il ciclo di generazione delle variabili (question.js:844-889): condizione
// `variablesTest`, `maxRuns`, `variable_generation_run_number`, `flatten`.
//
// Traduce anche il modulo QUnit "Variables" (part-tests.mjs:1794-1827).

import { describe, expect, it } from "vitest";
import { JmeError } from "../../src/jme/errors";
import { compile } from "../../src/jme/parser";
import { findvars } from "../../src/jme/evaluate";
import { loadQuestion } from "../../src/question";
import { engineErrorKeys } from "../../src/errors";
import type { NumbasQuestionJSON } from "../../src/question";
import type { Tree } from "../../src/jme/tokens";

/** Le chiavi d'errore lanciate da `fn`, dalla più esterna alla più interna.
 *
 * Gli errori di caricamento della domanda sono avvolti in `question.error`
 * come upstream (question.js:249-260): la chiave che interessa è quella
 * interna, quindi si confronta la catena. */
function errorKeys(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    return e instanceof JmeError ? engineErrorKeys(e) : [`NON-JmeError: ${String(e)}`];
  }
  return [];
}

describe("generazione delle variabili", () => {
  it("il ciclo rigenera finché `variablesTest.condition` non è soddisfatta", () => {
    const json: NumbasQuestionJSON = {
      variables: { a: { name: "a", definition: "random(1..9)" } },
      variablesTest: { condition: "a > 5", maxRuns: 100 },
    };
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      expect(loadQuestion(json, { seed: seed }).variables["a"] as number).toBeGreaterThan(5);
    }
  });

  it("una condizione impossibile esaurisce `maxRuns`", () => {
    const json: NumbasQuestionJSON = {
      variables: { a: { name: "a", definition: "random(1..9)" } },
      variablesTest: { condition: "a > 100", maxRuns: 1 },
    };
    expect(errorKeys(() => loadQuestion(json, { seed: "s1" }))).toContain(
      "jme.variables.question took too many runs to generate variables",
    );
  });

  it("`variable_generation_run_number` è disponibile nelle definizioni", () => {
    const json: NumbasQuestionJSON = {
      variables: { run: { name: "run", definition: "variable_generation_run_number" } },
    };
    expect(loadQuestion(json, { seed: "s1" }).variables["run"]).toBe(1);
  });

  it("`variable_generation_run_number` cresce a ogni tentativo fallito", () => {
    const json: NumbasQuestionJSON = {
      variables: { run: { name: "run", definition: "variable_generation_run_number" } },
      variablesTest: { condition: "run >= 4", maxRuns: 10 },
    };
    expect(loadQuestion(json, { seed: "s1" }).variables["run"]).toBe(4);
  });

  it("una condizione vuota non viene valutata (un solo giro)", () => {
    const json: NumbasQuestionJSON = {
      variables: { run: { name: "run", definition: "variable_generation_run_number" } },
      variablesTest: { condition: "", maxRuns: 10 },
    };
    expect(errorKeys(() => loadQuestion(json, { seed: "s1" }))).toEqual([]);
    expect(loadQuestion(json, { seed: "s1" }).variables["run"]).toBe(1);
  });

  it("`maxRuns` è limitato a [1, 1000000]", () => {
    const impossible = (maxRuns: number): NumbasQuestionJSON => ({
      variables: { a: { name: "a", definition: "1" } },
      variablesTest: { condition: "false", maxRuns: maxRuns },
    });
    // upstream (question.js:846-851): `NaN` o `< 1` diventano 1, poi il minimo
    // con 1000000. Con `maxRuns: 0` deve fare comunque un giro e fallire, non
    // un ciclo infinito né zero giri.
    expect(errorKeys(() => loadQuestion(impossible(0), { seed: "s1" }))).toContain(
      "jme.variables.question took too many runs to generate variables",
    );
    expect(errorKeys(() => loadQuestion(impossible(NaN), { seed: "s1" }))).toContain(
      "jme.variables.question took too many runs to generate variables",
    );
  });

  it("ogni tentativo consuma altra casualità dallo stesso generatore", () => {
    // Con il seme "s1" la PRIMA estrazione di `random(1..1000000)` è pari.
    // Una condizione che pretende un valore dispari costringe quindi almeno a
    // un secondo tentativo: se il generatore fosse riseminato a ogni giro, il
    // secondo tentativo ripescherebbe lo stesso numero pari e il ciclo
    // finirebbe con `took too many runs`.
    const definition = { name: "a", definition: "random(1..1000000)" };
    const first = loadQuestion({ variables: { a: definition } }, { seed: "s1" }).variables["a"] as number;
    expect(first % 2, "il primo valore con il seme s1 è pari").toBe(0);
    const second = loadQuestion(
      { variables: { a: definition }, variablesTest: { condition: "mod(a,2)=1", maxRuns: 20 } },
      { seed: "s1" },
    ).variables["a"] as number;
    expect(second % 2, "la condizione è soddisfatta").toBe(1);
    expect(second, "il secondo tentativo ha estratto un altro numero").not.toBe(first);
  });

  it("le variabili sono appiattite nello scope della domanda", () => {
    const q = loadQuestion({ variables: { a: { name: "a", definition: "1+1" } } }, { seed: "s1" });
    expect(q.scope.variables["a"], "`flatten` copia le variabili sullo scope della domanda").toBeDefined();
    expect(q.variables["a"]).toBe(2);
  });

  // upstream (question.js:877) fa `Object.keys(q.functionsTodo)` su un array e
  // ottiene gli indici `"0"`, `"1"`, ... invece dei nomi: qui ci sono i nomi
  // veri, così `scope.unset(local_definitions)` cancella davvero le funzioni
  // della domanda (v. DIVERGENCES.md).
  it("`local_definitions` elenca variabili, funzioni e ruleset della domanda", () => {
    const q = loadQuestion(
      {
        variables: { a: { name: "a", definition: "1" } },
        functions: { f: { parameters: [], type: "number", language: "jme", definition: "1" } },
        rulesets: { mine: ["basic"] },
      },
      { seed: "s1" },
    );
    expect(q.local_definitions.variables).toEqual(["a"]);
    expect(q.local_definitions.functions).toEqual(["f"]);
    expect(q.local_definitions.rulesets).toEqual(["mine"]);
  });

  // part-tests.mjs:1795-1827
  it("le funzioni personalizzate conoscono le altre quando si cercano le variabili libere", () => {
    const q = loadQuestion(
      {
        functions: {
          f3: { parameters: [], type: "number", language: "jme", definition: "f1(f2(1))" },
          f1: { parameters: [], type: "number", language: "jme", definition: "f2(3)+y" },
          f2: { parameters: [["x", "number"]], type: "number", language: "jme", definition: "1+x+sin(z)" },
        },
      },
      { seed: "s1" },
    );
    expect(findvars(compile("f1()") as Tree, [], q.scope)).toEqual(["y", "z"]);
    expect(findvars(compile("f3()") as Tree, [], q.scope)).toEqual(["y", "z"]);
  });
});
