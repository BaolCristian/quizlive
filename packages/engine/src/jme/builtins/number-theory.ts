/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:425-528 — tema `number_theory`: divisori, fattoriali,
// combinatoria, MCD/mcm.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TBool, TDecimal, TInt, TList, TNum } from "../tokens";
import { add, int_options, sig } from "./registry";

/** Registra il tema `number_theory` (jme-builtins.js:426-520). */
export function registerNumberTheory(scope: Scope): void {
  // 426-435
  add(scope, "rational_approximation", [TNum], TList, (n: number) =>
    math.rationalApproximation(n).map((x) => new TInt(x)),
  );
  add(scope, "rational_approximation", [TNum, TNum], TList, (n: number, accuracy: number) =>
    math.rationalApproximation(n, accuracy).map((x) => new TInt(x)),
  );

  // 436-462
  add(scope, "factorise", [TNum], TList, (n: math.NumbasNumber) =>
    math.factorise(n).map((x) => new TNum(x as unknown as number)),
  );
  add(scope, "largest_square_factor", [TNum], TInt, math.largest_square_factor);
  add(scope, "divisors", [TNum], TList, (n: math.NumbasNumber) =>
    math.divisors(n).map((x) => new TNum(x as unknown as number)),
  );
  add(scope, "proper_divisors", [TNum], TList, (n: math.NumbasNumber) =>
    math.proper_divisors(n).map((x) => new TNum(x as unknown as number)),
  );
  add(scope, "largest_square_factor", [TInt], TInt, math.largest_square_factor, int_options);
  add(scope, "divisors", [TInt], TList, (n: math.NumbasNumber) => math.divisors(n).map((x) => new TInt(x)), int_options);
  add(
    scope,
    "proper_divisors",
    [TInt],
    TList,
    (n: math.NumbasNumber) => math.proper_divisors(n).map((x) => new TInt(x)),
    int_options,
  );

  // 465-473
  add(scope, "fact", [TNum], TNum, math.factorial);
  add(scope, "mod", [TNum, TNum], TNum, math.mod);
  add(scope, "perm", [TNum, TNum], TNum, math.permutations);
  add(scope, "comb", [TNum, TNum], TNum, math.combinations);

  add(scope, "fact", [TInt], TInt, math.factorial, int_options);
  add(scope, "|", [TInt, TInt], TBool, math.divides, int_options);
  add(scope, "perm", [TInt, TInt], TInt, math.permutations, int_options);
  add(scope, "comb", [TInt, TInt], TInt, math.combinations, int_options);

  // 475-479
  add(scope, "root", [TNum, TNum], TNum, math.root);
  add(scope, "gcd", [TNum, TNum], TNum, math.gcd);
  add(scope, "gcd", [TInt, TInt], TInt, (a: number, b: number) => new TInt(math.gcd(a, b) as number), {
    unwrapValues: true,
  });

  // 480-489 — toglie i fattori di pi o di i prima del MCD: la usano le regole
  // di semplificazione delle frazioni.
  add(scope, "gcd_without_pi_or_i", [TNum, TNum], TNum, (a: math.NumbasNumber, b: math.NumbasNumber) => {
    if (math.isComplex(a) && a.re == 0) {
      a = a.im;
    }
    if (math.isComplex(b) && b.re == 0) {
      b = b.im;
    }
    a = (a as number) / (math.pow(Math.PI, math.piDegree(a)) as number);
    b = (b as number) / (math.pow(Math.PI, math.piDegree(b)) as number);
    return math.gcf(a, b);
  });

  // 491-517
  add(scope, "coprime", [TNum, TNum], TBool, math.coprime);
  add(scope, "lcm", [sig.multiple(sig.type("number"))], TNum, math.lcm);
  add(
    scope,
    "lcm",
    [sig.multiple(sig.type("integer"))],
    TInt,
    (...args: math.NumbasNumber[]) => new TInt(math.lcm(...args) as number),
    { unwrapValues: true },
  );
  add(
    scope,
    "lcm",
    [sig.listof(sig.type("integer"))],
    TInt,
    (l: math.NumbasNumber[]) => {
      if (l.length == 0) {
        return new TInt(1);
      } else if (l.length == 1) {
        return new TInt(l[0] as number);
      } else {
        return new TInt(math.lcm(...l) as number);
      }
    },
    { unwrapValues: true },
  );
  add(
    scope,
    "lcm",
    [sig.listof(sig.type("number"))],
    TNum,
    (l: math.NumbasNumber[]) => {
      if (l.length == 0) {
        return 1;
      } else if (l.length == 1) {
        return l[0];
      } else {
        return math.lcm(...l);
      }
    },
    { unwrapValues: true },
  );

  // 518-526
  add(scope, "|", [TNum, TNum], TBool, math.divides);
  add(scope, "mod", [TInt, TInt], TInt, math.mod, int_options);
  add(scope, "mod", [TDecimal, TDecimal], TDecimal, (a: math.ComplexDecimal, b: math.ComplexDecimal) => {
    let m = a.re.mod(b.re);
    if (m.isNegative()) {
      m = m.plus(b.re);
    }
    return m;
  });
}
