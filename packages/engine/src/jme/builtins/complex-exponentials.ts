/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:181-215 — temi `complex_numbers` (182-191) ed `exponentials`
// (192-215), uniti in un solo modulo (16 firme).

import * as math from "../../math";
import type { Scope } from "../scope";
import { TDecimal, TNum } from "../tokens";
import { add } from "./registry";

/** Registra i temi `complex_numbers` ed `exponentials`. */
export function registerComplexExponentials(scope: Scope): void {
  registerComplexNumbers(scope);
  registerExponentials(scope);
}

// jme-builtins.js:182-191
/** Tema `complex_numbers`. */
export function registerComplexNumbers(scope: Scope): void {
  // 183-187
  add(scope, "arg", [TNum], TNum, math.arg);
  add(scope, "re", [TNum], TNum, math.re);
  add(scope, "im", [TNum], TNum, math.im);
  add(scope, "conj", [TNum], TNum, math.conjugate);
  add(scope, "arg", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.argument());

}

// jme-builtins.js:192-215
/** Tema `exponentials`. */
export function registerExponentials(scope: Scope): void {
  // 193-211
  add(scope, "sqrt", [TNum], TNum, math.sqrt);
  add(scope, "ln", [TNum], TNum, math.log);
  add(scope, "log", [TNum], TNum, math.log10);
  add(scope, "log", [TNum, TNum], TNum, math.log_base);
  add(scope, "log", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.log());
  add(scope, "log", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) =>
    a.re.log().div(b.re.log()),
  );
  add(scope, "exp", [TNum], TNum, math.exp);
  add(scope, "gamma", [TNum], TNum, math.gamma);
  add(scope, "exp", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.exp());
  add(scope, "ln", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.ln());
  add(scope, "sqrt", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.squareRoot());
}
