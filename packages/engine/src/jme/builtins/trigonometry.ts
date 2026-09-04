/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:216-275 — tema `trigonometry`: 21 nomi, 34 firme.
// Le firme su `decimal` operano sulla sola parte reale, come upstream.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TDecimal, TNum } from "../tokens";
import { add } from "./registry";

/** Registra il tema `trigonometry` (jme-builtins.js:217-274). */
export function registerTrigonometry(scope: Scope): void {
  // number (217-237)
  add(scope, "sin", [TNum], TNum, math.sin);
  add(scope, "cos", [TNum], TNum, math.cos);
  add(scope, "tan", [TNum], TNum, math.tan);
  add(scope, "cosec", [TNum], TNum, math.cosec);
  add(scope, "sec", [TNum], TNum, math.sec);
  add(scope, "cot", [TNum], TNum, math.cot);
  add(scope, "arcsin", [TNum], TNum, math.arcsin);
  add(scope, "arccos", [TNum], TNum, math.arccos);
  add(scope, "arctan", [TNum], TNum, math.arctan);
  add(scope, "sinh", [TNum], TNum, math.sinh);
  add(scope, "cosh", [TNum], TNum, math.cosh);
  add(scope, "tanh", [TNum], TNum, math.tanh);
  add(scope, "cosech", [TNum], TNum, math.cosech);
  add(scope, "sech", [TNum], TNum, math.sech);
  add(scope, "coth", [TNum], TNum, math.coth);
  add(scope, "arcsinh", [TNum], TNum, math.arcsinh);
  add(scope, "arccosh", [TNum], TNum, math.arccosh);
  add(scope, "arctanh", [TNum], TNum, math.arctanh);
  add(scope, "atan2", [TNum, TNum], TNum, math.atan2);
  add(scope, "degrees", [TNum], TNum, math.degrees);
  add(scope, "radians", [TNum], TNum, math.radians);

  // decimal (238-274)
  add(scope, "cos", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.cos());
  add(scope, "cosh", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.cosh());
  add(scope, "sinh", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.sinh());
  add(scope, "tanh", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.tanh());
  add(scope, "arccos", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.acos());
  add(scope, "arccosh", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.acosh());
  add(scope, "arcsinh", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.asinh());
  add(scope, "arctanh", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.atanh());
  add(scope, "arcsin", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.asin());
  add(scope, "arctan", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.atan());
  add(scope, "atan2", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) =>
    math.Decimal.atan2(a.re, b.re),
  );
  add(scope, "sin", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.sin());
  add(scope, "tan", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.tan());
}
