/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:1146-1152, 2071-2210 — intervalli numerici `[min,max,step]`.

import { Decimal } from "./complex-decimal";
import type { NumbasNumber, Range } from "./types";
import { isComplex } from "./types";
import { isclose } from "./compare";

// math.js:1146-1152
/** I numeri da 0 a `n-1` (inclusi), come array. */
export function range(n: number): number[] {
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    arr[i] = i;
  }
  return arr;
}

// math.js:2071-2079
/** Scrive l'intervallo di interi `[a..b]` come `[min,max,step]`, per
 * `Numbas.math.random`. Se un estremo è complesso se ne usa solo la parte reale. */
export function defineRange(a: NumbasNumber, b: NumbasNumber): Range {
  const an = isComplex(a) ? a.re : (a as number);
  const bn = isComplex(b) ? b.re : (b as number);
  return [an, bn, 1];
}

// math.js:2086-2091
/** Cambia il passo di un range creato con `defineRange`. */
export function rangeSteps(r: Range, step: NumbasNumber): Range {
  const stepn = isComplex(step) ? step.re : (step as number);
  return [r[0], r[1], stepn];
}

// math.js:2098-2120
/** Converte un range in una lista di `Decimal` — enumera tutti gli elementi
 * del range evitando errori di accumulo in floating point. */
export function rangeToDecimalList(r: Range): Decimal[] {
  const start = new Decimal(r[0]);
  const end = new Decimal(r[1]);
  const step_size = new Decimal(r[2]);
  const out: Decimal[] = [];
  if (step_size.isZero()) {
    throw new Error("math.rangeToList.zero step size");
  }
  if (end.minus(start).times(step_size).isNegative()) {
    return [];
  }
  if (start.equals(end)) {
    return [start];
  }
  let n = 0;
  let t = start;
  while (start.lessThan(end) ? t.lessThanOrEqualTo(end) : t.greaterThanOrEqualTo(end)) {
    out.push(t);
    n += 1;
    t = start.plus(step_size.times(n));
  }
  return out;
}

// math.js:2127-2129
/** Converte un range in una lista di `number` — enumera tutti gli elementi del range. */
export function rangeToList(r: Range): number[] {
  return rangeToDecimalList(r).map((x) => x.toNumber());
}

// math.js:2135-2139
/** Calcola il numero di elementi del range. */
export function rangeSize(r: Range): number {
  const diff = r[1] - r[0];
  let num_steps = Math.floor(diff / r[2]) + 1;
  num_steps += isclose(r[0] + num_steps * r[2], r[1]) ? 1 : 0;
  return num_steps;
}

// math.js:2151-2211
/** Approssimazione razionale di un numero reale via frazioni continue
 * (porting di frap.c di David Eppstein, pubblico dominio). Se `accuracy` è
 * dato, il risultato è entro `Math.exp(-accuracy)` dal numero originale. */
export function rationalApproximation(n: number, accuracy?: number): [number, number] {
  /** Trova un'approssimazione razionale di `t` con denominatore massimo `limit`. */
  function rat_to_limit(limitIn: number, t: number): [number, number, number] {
    const limit = Math.max(limitIn, 1);
    if (t == 0) {
      return [0, 0, 1];
    }
    let m00 = 1;
    let m01 = 0;
    let m10 = 0;
    let m11 = 1;

    let x = t;
    let ai = Math.floor(x);
    while (m10 * ai + m11 <= limit) {
      let tmp = m00 * ai + m01;
      m01 = m00;
      m00 = tmp;
      tmp = m10 * ai + m11;
      m11 = m10;
      m10 = tmp;
      if (x == ai) {
        break;
      }
      x = 1 / (x - ai);
      ai = Math.floor(x);
    }

    const n1 = m00;
    const d1 = m10;
    const err1 = t - n1 / d1;

    ai = Math.floor((limit - m11) / m10);
    const n2 = m00 * ai + m01;
    const d2 = m10 * ai + m11;
    const err2 = t - n2 / d2;
    if (Math.abs(err1) <= Math.abs(err2)) {
      return [err1, n1, d1];
    } else {
      return [err2, n2, d2];
    }
  }

  if (accuracy == undefined) {
    accuracy = 15;
  }
  const err_in = Math.exp(-accuracy);
  const limit = 100000000000;
  let l_curr = 1;
  let res = rat_to_limit(l_curr, n);
  while (Math.abs(res[0]) > err_in && l_curr < limit) {
    l_curr *= 10;
    res = rat_to_limit(l_curr, n);
  }
  return [res[1], res[2]];
}
