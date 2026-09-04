/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:281-423 — tema `rounding`: arrotondamenti, troncamenti,
// minimo/massimo e le sei registrazioni di `precround`/`siground` generate da
// `function_with_precision_info`.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TDecimal, TInt, TMatrix, TNothing, TNum, TRange, TRational, TVector, type Token, type TokenConstructor } from "../tokens";
import { castToType } from "../evaluate";
import { add, int_options, sig } from "./registry";

/** Alias locale, come upstream (riga 24). */
const Fraction = math.Fraction;

/** Un token che può portare l'informazione di precisione. */
type WithPrecision = Token & { precisionType?: "dp" | "sigfig"; precision?: number };

// jme-builtins.js:391-400
/** Definisce una funzione `(tipo, number) → tipo` che marca il risultato con
 * la precisione richiesta. */
function function_with_precision_info(
  scope: Scope,
  name: string,
  fn: (a: never, precision: number) => unknown,
  type: TokenConstructor,
  precisionType: "dp" | "sigfig",
): void {
  add(
    scope,
    name,
    [type, TNum],
    type,
    (a: never, precision: number) => {
      const r = fn(a, precision);
      const t = new (type as unknown as new (v: unknown) => Token)(r) as WithPrecision;
      t.precisionType = precisionType;
      t.precision = precision;
      return t;
    },
    { unwrapValues: true },
  );
}

/** Registra il tema `rounding` (jme-builtins.js:282-419). */
export function registerRounding(scope: Scope): void {
  // 282-311 — `ceil`/`floor`/`round` hanno un `evaluate` custom (NON sono
  // pigre): serve solo a scegliere fra `TInt` e `TNum` in base al risultato.
  add(scope, "ceil", [TNum], TNum, null, {
    evaluate: (args) => {
      const n = math.ceil((castToType((args as Token[])[0] as Token, "number") as TNum).value);
      return math.isComplex(n) ? new TNum(n) : new TInt(n as number);
    },
  });
  add(scope, "floor", [TNum], TNum, null, {
    evaluate: (args) => {
      const n = math.floor((castToType((args as Token[])[0] as Token, "number") as TNum).value);
      return math.isComplex(n) ? new TNum(n) : new TInt(n as number);
    },
  });
  add(scope, "round", [TNum], TNum, null, {
    evaluate: (args) => {
      const n = math.round((castToType((args as Token[])[0] as Token, "number") as TNum).value);
      return math.isComplex(n) ? new TNum(n) : new TInt(n as number);
    },
  });

  // 312-319
  add(scope, "tonearest", [TNum, TNum], TNum, math.toNearest);
  add(scope, "trunc", [TNum], TNum, math.trunc);
  add(scope, "trunc", [TNum, TNum], TNum, math.trunc);
  add(scope, "fract", [TNum], TNum, math.fract);
  add(scope, "sign", [TNum], TNum, math.sign);
  add(scope, "max", [TNum, TNum], TNum, math.max);
  add(scope, "min", [TNum, TNum], TNum, math.min);
  add(scope, "clamp", [TNum, TNum, TNum], TNum, (x: math.NumbasNumber, min: math.NumbasNumber, max: math.NumbasNumber) =>
    math.max(math.min(x, max), min),
  );

  // 322-347 — min/max su range, liste, interi e razionali
  add(scope, "max", [TRange], TNum, (range: math.Range) => range[1]);
  add(scope, "min", [TRange], TNum, (range: math.Range) => range[0]);
  add(
    scope,
    "max",
    [sig.listof(sig.type("number"))],
    TNum,
    (values: math.NumbasNumber[]) => {
      const x = math.listmax(values);
      return x === undefined ? new TNothing() : x;
    },
    { unwrapValues: true },
  );
  add(
    scope,
    "min",
    [sig.listof(sig.type("number"))],
    TNum,
    (values: math.NumbasNumber[]) => {
      const x = math.listmin(values);
      return x === undefined ? new TNothing() : x;
    },
    { unwrapValues: true },
  );
  add(scope, "max", [TInt, TInt], TInt, math.max, int_options);
  add(scope, "min", [TInt, TInt], TInt, math.min, int_options);
  add(scope, "max", [sig.listof(sig.type("integer"))], TInt, math.listmax, int_options);
  add(scope, "min", [sig.listof(sig.type("integer"))], TInt, math.listmin, int_options);
  add(scope, "max", [TRational, TRational], TRational, (a: math.Fraction, b: math.Fraction) => Fraction.max(a, b));
  add(scope, "min", [TRational, TRational], TRational, (a: math.Fraction, b: math.Fraction) => Fraction.min(a, b));
  add(scope, "max", [sig.listof(sig.type("rational"))], TRational, (l: math.Fraction[]) => Fraction.max(...l), {
    unwrapValues: true,
  });
  add(scope, "min", [sig.listof(sig.type("rational"))], TRational, (l: math.Fraction[]) => Fraction.min(...l), {
    unwrapValues: true,
  });

  // 351-361 — razionali
  add(scope, "trunc", [TRational], TInt, (a: math.Fraction) => a.trunc());
  add(scope, "floor", [TRational], TInt, (a: math.Fraction) => a.floor());
  add(scope, "ceil", [TRational], TInt, (a: math.Fraction) => a.ceil());
  add(scope, "fract", [TRational], TRational, (a: math.Fraction) => a.fract());

  // 364-389 — decimali
  add(scope, "ceil", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.ceil());
  add(scope, "floor", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.floor());
  add(scope, "round", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.round());
  add(scope, "min", [TDecimal, TDecimal], TDecimal, math.ComplexDecimal.min);
  add(scope, "max", [TDecimal, TDecimal], TDecimal, math.ComplexDecimal.max);
  add(
    scope,
    "max",
    [sig.listof(sig.type("decimal"))],
    TDecimal,
    (l: math.ComplexDecimal[]) => math.listmax(l as unknown as math.NumbasNumber[], math.ComplexDecimal.max as never),
    { unwrapValues: true },
  );
  add(
    scope,
    "min",
    [sig.listof(sig.type("decimal"))],
    TDecimal,
    (l: math.ComplexDecimal[]) => math.listmin(l as unknown as math.NumbasNumber[], math.ComplexDecimal.min as never),
    { unwrapValues: true },
  );
  add(scope, "tonearest", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, x: math.ComplexDecimal) =>
    a.toNearest(x.re),
  );
  add(scope, "trunc", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.trunc());
  add(scope, "fract", [TDecimal], TDecimal, (a: math.ComplexDecimal) => a.re.minus(a.re.trunc()));

  // 402-419 — le sei registrazioni di precround/siground
  function_with_precision_info(scope, "precround", math.precround as never, TNum, "dp");
  function_with_precision_info(scope, "precround", math.matrixmath.precround as never, TMatrix, "dp");
  function_with_precision_info(scope, "precround", math.vectormath.precround as never, TVector, "dp");
  function_with_precision_info(scope, "siground", math.siground as never, TNum, "sigfig");
  function_with_precision_info(scope, "siground", math.matrixmath.siground as never, TMatrix, "sigfig");
  function_with_precision_info(scope, "siground", math.vectormath.siground as never, TVector, "sigfig");
  function_with_precision_info(
    scope,
    "precround",
    ((a: math.ComplexDecimal, dp: number) => a.toDecimalPlaces(dp)) as never,
    TDecimal,
    "dp",
  );
  function_with_precision_info(
    scope,
    "siground",
    ((a: math.ComplexDecimal, dp: number) => a.toSignificantDigits(dp)) as never,
    TDecimal,
    "sigfig",
  );
}
