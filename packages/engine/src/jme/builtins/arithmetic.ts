/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:86-180 — tema `arithmetic`: gli operatori aritmetici sui
// quattro tipi numerici (number, integer, rational, decimal).

import * as math from "../../math";
import type { Scope } from "../scope";
import { TDecimal, TInt, TNum, TRational } from "../tokens";
import { add, int_options } from "./registry";

/** Alias locale, come `var Fraction = math.Fraction` upstream (riga 24). */
const Fraction = math.Fraction;

/** Registra il tema `arithmetic` (jme-builtins.js:87-179). */
export function registerArithmetic(scope: Scope): void {
  // Numeri reali (89-98)
  add(scope, "+u", [TNum], TNum, (a: math.NumbasNumber) => a);
  add(scope, "-u", [TNum], TNum, math.negate);
  add(scope, "+", [TNum, TNum], TNum, math.add);
  add(scope, "-", [TNum, TNum], TNum, math.sub);
  add(scope, "*", [TNum, TNum], TNum, math.mul);
  add(scope, "/", [TNum, TNum], TNum, math.div);
  add(scope, "^", [TNum, TNum], TNum, math.pow);
  add(scope, "abs", [TNum], TNum, math.abs);

  // Interi (101-113). `+u` NON usa `int_options` upstream: riceve il `value`
  // numerico del token, non il bigint.
  add(scope, "+u", [TInt], TInt, (a: number) => a);
  add(scope, "-u", [TInt], TInt, math.negate, int_options);
  add(scope, "+", [TInt, TInt], TInt, math.add, int_options);
  add(scope, "-", [TInt, TInt], TInt, math.sub, int_options);
  add(scope, "*", [TInt, TInt], TInt, math.mul, int_options);
  add(scope, "/", [TInt, TInt], TRational, (a: bigint, b: bigint) => new Fraction(a, b), int_options);
  add(scope, "^", [TInt, TInt], TInt, (a: bigint, b: bigint) => math.pow(a, b), int_options);

  // Razionali (116-140)
  add(scope, "+u", [TRational], TRational, (a: math.Fraction) => a);
  add(scope, "-u", [TRational], TRational, (r: math.Fraction) => r.negate());
  add(scope, "+", [TRational, TRational], TRational, (a: math.Fraction, b: math.Fraction) => a.add(b));
  add(scope, "-", [TRational, TRational], TRational, (a: math.Fraction, b: math.Fraction) => a.subtract(b));
  add(scope, "*", [TRational, TRational], TRational, (a: math.Fraction, b: math.Fraction) => a.multiply(b));
  add(scope, "*", [TRational, TNum], TNum, (a: math.Fraction, b: math.NumbasNumber) => math.mul(a.toFloat(), b));
  add(scope, "/", [TRational, TRational], TRational, (a: math.Fraction, b: math.Fraction) => a.divide(b));
  add(scope, "^", [TRational, TInt], TRational, (a: math.Fraction, b: number) => a.pow(b));

  // Decimali (142-176)
  add(scope, "+u", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a);
  add(scope, "-u", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.negated());
  add(scope, "+", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.plus(b));
  add(scope, "+", [TNum, TDecimal], TDecimal, (a: math.NumbasNumber, b: math.ComplexDecimal) =>
    math.ensure_decimal(a).plus(b),
  );
  add(scope, "-", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.minus(b));
  add(scope, "-", [TNum, TDecimal], TDecimal, (a: math.NumbasNumber, b: math.ComplexDecimal) =>
    math.ensure_decimal(a).minus(b),
  );
  add(scope, "*", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.times(b));
  add(scope, "/", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.dividedBy(b));
  add(scope, "/", [TNum, TDecimal], TDecimal, (a: math.NumbasNumber, b: math.ComplexDecimal) =>
    math.ensure_decimal(a).dividedBy(b),
  );
  add(scope, "abs", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.absoluteValue());
  add(scope, "^", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.pow(b));
  add(scope, "^", [TInt, TDecimal], TDecimal, (a: number, b: math.ComplexDecimal) => math.ensure_decimal(a).pow(b));
}
