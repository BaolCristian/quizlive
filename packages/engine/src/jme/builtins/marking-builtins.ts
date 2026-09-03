/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:3768-3782 — tema `marking`: `award` e `resultsequal`.
// `jme.checkingFunctions`/`jme.resultsEqual` sono in `jme/compare.ts`
// (Task 2).

import { checkingFunctions, resultsEqual, type CheckingFunction } from "../compare";
import type { Scope } from "../scope";
import { TBool, TNum, TString, type Token, type Tree } from "../tokens";
import { add } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

/** Registra il tema `marking` (jme-builtins.js:3770-3781). */
export function registerMarking(scope: Scope): void {
  // 3770-3772
  add(scope, "award", [TNum, TBool], TNum, (a: number, b: boolean) => (b ? a : 0));

  // 3774-3781
  add(scope, "resultsequal", ["?", "?", TString, TNum], TBool, null, {
    evaluate: (args, s) => {
      const a = toks(args)[0] as Token;
      const b = toks(args)[1] as Token;
      const accuracy = (toks(args)[3] as TNum).value as number;
      const checkingFunction = checkingFunctions[
        (toks(args)[2] as TString).value.toLowerCase() as keyof typeof checkingFunctions
      ] as CheckingFunction;
      return new TBool(resultsEqual(a, b, checkingFunction, accuracy, s));
    },
  });
}
