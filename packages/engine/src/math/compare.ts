/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:423-666 — confronti e ordinamento.

import type { NumbasNumber } from "./types";
import { isComplex } from "./types";
import { re, sub, abs } from "./complex";

// math.js:423-425
/** `n` è reale e maggiore di 0? */
export function positive(n: NumbasNumber): boolean {
  return !isComplex(n) && gt(n, 0n);
}

// math.js:426-433
/** `n` è reale e minore di 0? */
export function negative(n: NumbasNumber): boolean {
  return lt(re(n), 0n);
}

// math.js:434-441
/** `n` è reale e maggiore o uguale a 0? */
export function nonnegative(n: NumbasNumber): boolean {
  return !negative(n);
}

// math.js:449-454
/** `a` è minore di `b`? */
export function lt(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.order complex numbers");
  }
  return !geq(a, b);
}

// math.js:462-467
/** `a` è maggiore di `b`? */
export function gt(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.order complex numbers");
  }
  return !leq(a, b);
}

// math.js:475-480
/** `a` è minore o uguale a `b`? */
export function leq(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.order complex numbers");
  }
  return (a as number) < (b as number) || eq(a, b);
}

// math.js:488-493
/** `a` è maggiore o uguale a `b`? */
export function geq(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.order complex numbers");
  }
  return (a as number) > (b as number) || eq(a, b);
}

// math.js:500-517
/** `a` è uguale a `b`? `NaN` è uguale a `NaN` qui (comportamento non-IEEE
 * voluto, testato esplicitamente upstream — §6.5 dell'inventario). Fra
 * `bigint` puri l'uguaglianza è esatta; per i reali si usa `==` oppure
 * `isclose` con tolleranza. */
export function eq(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a)) {
    if (isComplex(b)) {
      return eq(a.re, b.re) && eq(a.im, b.im);
    } else {
      return eq(a.re, b) && eq(a.im, 0);
    }
  } else {
    if (isComplex(b)) {
      return eq(a, b.re) && eq(b.im, 0);
    } else {
      // upstream: `isNaN(a)` senza controllo di tipo — se `a` è un bigint,
      // questo lancia (TypeError: Cannot convert a BigInt value to a
      // number), esattamente come farebbe l'originale (§ "non ripulire eq"
      // nelle Global Constraints). Non si aggiunge un `typeof` di guardia.
      if (isNaN(a as number)) {
        return isNaN(b as number);
      }
      // eslint-disable-next-line eqeqeq -- upstream: coercizione debole voluta
      return a == b || (!(typeof a == "bigint" && typeof b == "bigint") && isclose(a, b));
    }
  }
}

// math.js:527-542
/** `a` è vicino a `b`? Tolleranza relativa + assoluta (come `math.isclose` di Python). */
export function isclose(a: NumbasNumber, b: NumbasNumber, rel_tol?: number, abs_tol?: number): boolean {
  rel_tol = rel_tol === undefined ? 1e-15 : rel_tol;
  abs_tol = abs_tol === undefined ? 1e-15 : abs_tol;

  if (isComplex(a) || isComplex(b)) {
    return (abs(sub(a, b)) as number) < abs_tol;
  }

  const an = Number(a);
  const bn = Number(b);
  if (an === Infinity || bn === Infinity || an == -Infinity || bn == -Infinity) {
    return an === bn;
  }

  return Math.abs(an - bn) <= Math.max(rel_tol * Math.max(Math.abs(an), Math.abs(bn)), abs_tol);
}

// math.js:553-589
/** `u` è un multiplo scalare di `v`? */
export function is_scalar_multiple(
  u: readonly number[],
  v: readonly number[],
  rel_tol?: number,
  abs_tol?: number
): boolean {
  // check edge case
  if (!Array.isArray(u) || !u.length || !Array.isArray(v) || !v.length) {
    return false;
  }
  // vector length must be the same
  if (u.length != v.length) {
    return false;
  }
  const n = u.length;
  let i = 0;
  let first_ratio = 0;
  // corner case: denominator cannot be zero to avoid zero-division exception
  for (; i < n; i++) {
    if (v[i] == 0 && u[i] == 0) {
      continue;
    } else if (v[i] == 0 || u[i] == 0) {
      return false;
    } else {
      first_ratio = u[i]! / v[i]!;
      break;
    }
  }
  for (; i < n; i++) {
    if (v[i] == 0 && u[i] == 0) {
      continue;
    } else if (v[i] == 0 || u[i] == 0) {
      return false;
    } else {
      const curr = u[i]! / v[i]!;
      if (!isclose(curr, first_ratio, rel_tol, abs_tol)) {
        return false;
      }
    }
  }
  return true;
}

// math.js:598-606
/** Il più grande fra due numeri. */
export function max(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.order complex numbers");
  }
  if (typeof a == "bigint" && typeof b == "bigint") {
    return a > b ? a : b;
  }
  return Math.max(a as number, b as number);
}

// math.js:614-624
/** Il più grande di una lista di numeri. */
export function listmax(
  numbers: readonly NumbasNumber[],
  maxfn: (a: NumbasNumber, b: NumbasNumber) => NumbasNumber = max
): NumbasNumber | undefined {
  if (numbers.length == 0) {
    return undefined;
  }
  let best = numbers[0]!;
  for (let i = 1; i < numbers.length; i++) {
    best = maxfn(best, numbers[i]!);
  }
  return best;
}

// math.js:632-640
/** Il più piccolo fra due numeri. */
export function min(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.order complex numbers");
  }
  if (typeof a == "bigint" && typeof b == "bigint") {
    return a < b ? a : b;
  }
  return Math.min(a as number, b as number);
}

// math.js:648-658
/** Il più piccolo di una lista di numeri. */
export function listmin(
  numbers: readonly NumbasNumber[],
  minfn: (a: NumbasNumber, b: NumbasNumber) => NumbasNumber = min
): NumbasNumber | undefined {
  if (numbers.length == 0) {
    return undefined;
  }
  let best = numbers[0]!;
  for (let i = 1; i < numbers.length; i++) {
    best = minfn(best, numbers[i]!);
  }
  return best;
}

// math.js:666-668
/** `a` e `b` sono diversi? */
export function neq(a: NumbasNumber, b: NumbasNumber): boolean {
  return !eq(a, b);
}
