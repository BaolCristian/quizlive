/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:531-566 — tema `comparison`: gli operatori di confronto su
// number e decimal, più `=`/`<>` polimorfici (uguaglianza fra token
// qualunque, jme/equality.ts).

import * as math from "../../math";
import type { Scope } from "../scope";
import { TBool, TDecimal, TNum, type Token } from "../tokens";
import { eq, neq } from "../equality";
import { add, sig } from "./registry";

/** Registra il tema `comparison` (jme-builtins.js:532-562). */
export function registerComparison(scope: Scope): void {
  // 532-535
  add(scope, "<", [TNum, TNum], TBool, math.lt);
  add(scope, ">", [TNum, TNum], TBool, math.gt);
  add(scope, "<=", [TNum, TNum], TBool, math.leq);
  add(scope, ">=", [TNum, TNum], TBool, math.geq);

  // 536-545 — `evaluate` custom (non pigro): serve solo per ricevere lo scope.
  add(scope, "<>", ["?", "?"], TBool, null, {
    evaluate: (args, s) => {
      const a = args as Token[];
      return new TBool(neq(a[0] as Token, a[1] as Token, s));
    },
  });
  add(scope, "=", ["?", "?"], TBool, null, {
    evaluate: (args, s) => {
      const a = args as Token[];
      return new TBool(eq(a[0] as Token, a[1] as Token, s));
    },
  });

  // 546
  add(
    scope,
    "isclose",
    [TNum, TNum, sig.optional(sig.type("number")), sig.optional(sig.type("number"))],
    TBool,
    math.isclose,
  );

  // 547-565 — decimal
  add(scope, ">", [TDecimal, TDecimal], TBool, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.greaterThan(b));
  add(scope, ">=", [TDecimal, TDecimal], TBool, (a: math.ComplexDecimal, b: math.ComplexDecimal) =>
    a.greaterThanOrEqualTo(b),
  );
  add(scope, ">=", [TDecimal, TNum], TBool, (a: math.ComplexDecimal, b: math.NumbasNumber) =>
    math.geq(a.re.toNumber(), b),
  );
  add(scope, "<", [TDecimal, TDecimal], TBool, (a: math.ComplexDecimal, b: math.ComplexDecimal) => a.lessThan(b));
  add(scope, "<=", [TDecimal, TDecimal], TBool, (a: math.ComplexDecimal, b: math.ComplexDecimal) =>
    a.lessThanOrEqualTo(b),
  );
  add(scope, "<=", [TDecimal, TNum], TBool, (a: math.ComplexDecimal, b: math.NumbasNumber) =>
    math.leq(a.re.toNumber(), b),
  );
}
