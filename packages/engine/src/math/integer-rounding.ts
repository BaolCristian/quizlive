/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:1698-1808 — arrotondamento a interi/troncamento.

import type { NumbasNumber } from "./types";
import { isComplex } from "./types";
import { complex } from "./complex";
import { MathError } from "../errors";

// math.js:1705-1711
/** Arrotonda per eccesso all'intero più vicino (parti reale/immaginaria indipendenti). */
export function ceil(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(ceil(x.re) as number, ceil(x.im) as number);
  } else {
    return Math.ceil(x as number);
  }
}

// math.js:1719-1725
/** Arrotonda per difetto all'intero più vicino (parti reale/immaginaria indipendenti). */
export function floor(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(floor(x.re) as number, floor(x.im) as number);
  } else {
    return Math.floor(x as number);
  }
}

// math.js:1733-1739
/** Arrotonda all'intero più vicino; `.5` arrotonda verso `+∞` (parti reale/immaginaria indipendenti). */
export function round(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(Math.round(x.re), Math.round(x.im));
  } else {
    return Math.round(x as number);
  }
}

// math.js:1747-1759
/** Arrotonda al multiplo più vicino di `a` (parti reale/immaginaria indipendenti). */
export function toNearest(x: NumbasNumber, a: NumbasNumber): NumbasNumber {
  if (isComplex(a)) {
    throw new MathError("math.toNearest.complex");
  }
  if ((a as number) == 0) {
    return NaN;
  }
  if (isComplex(x)) {
    return complex(toNearest(x.re, a) as number, toNearest(x.im, a) as number);
  } else {
    return Math.round((x as number) / (a as number)) * (a as number);
  }
}

// math.js:1769-1779
/** Parte intera (verso lo zero); con `p` tronca a quel numero di cifre decimali. */
export function trunc(x: NumbasNumber, p?: number): NumbasNumber {
  if (isComplex(x)) {
    return complex(trunc(x.re, p) as number, trunc(x.im, p) as number);
  }
  const pw = Math.pow(10, p || 0);
  const xn = x as number;
  if (xn > 0) {
    return Math.floor(xn * pw) / pw;
  } else {
    return Math.ceil(xn * pw) / pw;
  }
}

// math.js:1786-1791
/** Parte frazionaria di un numero (parti reale/immaginaria indipendenti). */
export function fract(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(fract(x.re) as number, fract(x.im) as number);
  }
  return (x as number) - (trunc(x) as number);
}

// math.js:1797-1808
/** Segno di un numero: -1, 0 o 1 (parti reale/immaginaria indipendenti sul complesso). */
export function sign(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(sign(x.re) as number, sign(x.im) as number);
  }
  if (x == 0) {
    return 0;
  } else if ((x as number) > 0) {
    return 1;
  } else {
    return -1;
  }
}
