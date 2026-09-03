/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:65-417 — aritmetica unificata su number/bigint/complex.
//
// Nota generale sui cast: l'upstream fa duck-typing puro a runtime
// (`n.complex`, `typeof n=='bigint'`) su parametri dichiarati genericamente
// `{number}`. Qui si preferisce la fedeltà di comportamento (decisione presa
// nell'inventario §6.2/§8.2: mantenere la stessa forma a runtime con type
// guard) rispetto alla purezza dei tipi: dove l'upstream mescola
// implicitamente number/bigint/complex ci sono cast espliciti (`as number`
// ecc.) invece di riscritture "più sicure" che cambierebbero il
// comportamento sui casi limite (es. mescolare bigint e complex, che anche
// upstream lascerebbe fallire a runtime).

import type { Complex, NumbasNumber } from "./types";
import { isComplex } from "./types";
import { isInt } from "./predicates";
import { fract } from "./integer-rounding";

// math.js:65-78
/** Se `num` non è già un BigInt, lo converte. */
export function ensure_bigint(num: number | string | bigint): bigint {
  try {
    return BigInt(num as bigint);
  } catch {
    return BigInt(Math.round(num as number));
  }
}

// math.js:88
/** Riconosce numeri in notazione scientifica. */
export const re_scientificNumber = /(-?(?:0|[1-9]\d*)(?:\.\d+)?)[eE]([+-]?\d+)/;

// math.js:97-104
/** Costruisce un numero complesso da parte reale e immaginaria; collassa a
 * `re` (un `number` grezzo) quando `im` è falsy (0, NaN, undefined) — un
 * "complesso" con parte immaginaria 0 è quindi indistinguibile da un reale,
 * come upstream (§6.3). A differenza dell'upstream, l'oggetto risultante non
 * porta un `toString` personalizzato: il tipo `Complex` del brief non lo
 * prevede (`{complex:true,re,im}` soltanto) — si usi `niceNumber` per la
 * rappresentazione testuale. */
export function complex(re: number, im?: number): NumbasNumber {
  if (!im) {
    return re;
  }
  return { complex: true, re, im };
}

// math.js:119-125
/** Nega un numero. */
export function negate(n: NumbasNumber): NumbasNumber {
  if (isComplex(n)) {
    return complex(-n.re, -n.im);
  }
  // i due rami sono identici a occhio ma non a tipi: `-n` su un
  // `number | bigint` non compila (TS2365), perché l'unario meno vuole un
  // operando di un solo tipo numerico. Il `typeof` è il restringimento che
  // serve a TypeScript per applicarlo due volte, una per tipo. Non è un ramo
  // morto: toglierlo rompe la compilazione.
  if (typeof n === "bigint") {
    return -n;
  }
  return -n;
}

// math.js:131-137
/** Coniugato complesso (`n` se reale). */
export function conjugate(n: NumbasNumber): NumbasNumber {
  if (isComplex(n)) {
    return complex(n.re, -n.im);
  }
  return n;
}

// math.js:144-158
/** Somma due numeri. */
export function add(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a)) {
    if (isComplex(b)) {
      return complex(a.re + b.re, a.im + b.im);
    }
    return complex(a.re + (b as number), a.im);
  } else {
    if (isComplex(b)) {
      return complex((a as number) + b.re, b.im);
    }
    if (typeof a === "bigint" && typeof b === "bigint") {
      return a + b;
    }
    return (a as number) + (b as number);
  }
}

// math.js:165-179
/** Sottrae un numero da un altro. */
export function sub(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a)) {
    if (isComplex(b)) {
      return complex(a.re - b.re, a.im - b.im);
    }
    return complex(a.re - (b as number), a.im);
  } else {
    if (isComplex(b)) {
      return complex((a as number) - b.re, -b.im);
    }
    if (typeof a === "bigint" && typeof b === "bigint") {
      return a - b;
    }
    return (a as number) - (b as number);
  }
}

// math.js:186-200
/** Moltiplica due numeri. */
export function mul(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a)) {
    if (isComplex(b)) {
      return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    }
    return complex(a.re * (b as number), a.im * (b as number));
  } else {
    if (isComplex(b)) {
      return complex((a as number) * b.re, (a as number) * b.im);
    }
    if (typeof a === "bigint" && typeof b === "bigint") {
      return a * b;
    }
    return (a as number) * (b as number);
  }
}

// math.js:207-223
/** Divide un numero per un altro. */
export function div(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a)) {
    if (isComplex(b)) {
      const q = b.re * b.re + b.im * b.im;
      return complex((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q);
    }
    return complex(a.re / (b as number), a.im / (b as number));
  } else {
    if (isComplex(b)) {
      const q = b.re * b.re + b.im * b.im;
      return complex(((a as number) * b.re) / q, (-(a as number) * b.im) / q);
    }
    if (typeof a === "bigint" && typeof b === "bigint") {
      return a / b;
    }
    return (a as number) / (b as number);
  }
}

// math.js:278-290
/** Calcola l'n-esima riga del triangolo di Pascal. */
export function binomialCoefficients(n: number): number[] {
  const b = [1];
  let f = 1;
  for (let i = 1; i <= n; i++) {
    b.push((f *= (n + 1 - i) / i));
  }
  return b;
}

// math.js:230-277
/** Eleva un numero a potenza. */
export function pow(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (typeof a === "bigint" && typeof b === "bigint") {
    if (b < 0n) {
      a = Number(a);
      b = Number(b);
    } else {
      return a ** b;
    }
  }
  if (isComplex(a) && isInt(b) && Math.abs(Number(b)) < 100) {
    const bn = Number(b);
    if (bn < 0) {
      return div(1, pow(a, -bn));
    }
    if (bn == 0) {
      return 1;
    }
    const coeffs = binomialCoefficients(bn);
    let re = 0;
    let im = 0;
    let sign = 1;
    for (let i = 0; i < bn; i += 2) {
      re += coeffs[i]! * Math.pow(a.re, bn - i) * Math.pow(a.im, i) * sign;
      im += coeffs[i + 1]! * Math.pow(a.re, bn - i - 1) * Math.pow(a.im, i + 1) * sign;
      sign = -sign;
    }
    if (bn % 2 == 0) {
      re += Math.pow(a.im, bn) * sign;
    }
    return complex(re, im);
  }
  if (isComplex(a) || isComplex(b) || ((a as number) < 0 && fract(b as number) != 0)) {
    const ac: Complex = isComplex(a) ? a : { re: a as number, im: 0, complex: true };
    const bc: Complex = isComplex(b) ? b : { re: b as number, im: 0, complex: true };
    const ss = ac.re * ac.re + ac.im * ac.im;
    const arg1 = arg(ac);
    const mag = Math.pow(ss, bc.re / 2) * Math.exp(-bc.im * arg1);
    const argv = bc.re * arg1 + (bc.im * Math.log(ss)) / 2;
    return complex(mag * Math.cos(argv), mag * Math.sin(argv));
  } else if ((a as number) == Math.E) {
    return Math.exp(b as number);
  } else {
    return Math.pow(a as number, b as number);
  }
}

// math.js:297-306
/** `a mod b`. Ritorna sempre un numero positivo. */
export function mod(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  const bAbs = abs(b);
  if (bAbs == Infinity) {
    return a;
  }
  // upstream: il controllo è `=== 0n`, quindi copre solo il ramo bigint;
  // per `b` numerico 0 si cade comunque nel calcolo sotto, che produce NaN
  // per altra via (divisione/modulo per zero) — non "correggere" in `=== 0`,
  // cambierebbe il ramo preso anche se non il risultato finale (§6.6).
  if (bAbs === 0n) {
    return NaN;
  }
  if (typeof a === "bigint" && typeof bAbs === "bigint") {
    return ((a % bAbs) + bAbs) % bAbs;
  }
  const an = a as number;
  const bn = bAbs as number;
  return ((an % bn) + bn) % bn;
}

// math.js:313-318
/** Calcola la radice b-esima di `a`. */
export function root(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (!isComplex(a) && (a as number) < 0 && (b as number) % 2 == 1) {
    return negate(root(negate(a), b));
  }
  return pow(a, div(1, b));
}

// math.js:324-333
/** Radice quadrata. */
export function sqrt(n: NumbasNumber): NumbasNumber {
  if (isComplex(n)) {
    const r = abs(n) as number;
    return complex(Math.sqrt((r + n.re) / 2), (n.im < 0 ? -1 : 1) * Math.sqrt((r - n.re) / 2));
  } else if ((n as number) < 0) {
    return complex(0, Math.sqrt(-(n as number)));
  } else {
    return Math.sqrt(n as number);
  }
}

// math.js:339-348
/** Logaritmo naturale (base `e`). */
export function log(n: NumbasNumber): NumbasNumber {
  if (isComplex(n)) {
    const mag = abs(n) as number;
    const a = arg(n);
    return complex(Math.log(mag), a);
  } else if ((n as number) < 0) {
    return complex(Math.log(-(n as number)), Math.PI);
  } else {
    return Math.log(n as number);
  }
}

// math.js:355-360
/** Calcola `e^n`. */
export function exp(n: NumbasNumber): NumbasNumber {
  if (isComplex(n)) {
    return complex(Math.exp(n.re) * Math.cos(n.im), Math.exp(n.re) * Math.sin(n.im));
  } else {
    return Math.exp(n as number);
  }
}

// math.js:367-380
/** Modulo/valore assoluto: valore assoluto per i reali, modulo per i complessi. */
export function abs(n: NumbasNumber): NumbasNumber {
  if (isComplex(n)) {
    if (n.re == 0) {
      return Math.abs(n.im);
    } else if (n.im == 0) {
      return Math.abs(n.re);
    } else {
      return Math.sqrt(n.re * n.re + n.im * n.im);
    }
  } else if (typeof n === "bigint") {
    return n >= 0n ? n : -n;
  } else {
    return Math.abs(n);
  }
}

// math.js:387-392
/** Argomento (fase) di un numero. */
export function arg(n: NumbasNumber): number {
  if (isComplex(n)) {
    return Math.atan2(n.im, n.re);
  } else {
    return Math.atan2(0, n as number);
  }
}

// math.js:399-404
/** Parte reale di un numero. */
export function re(n: NumbasNumber): number {
  if (isComplex(n)) {
    return n.re;
  } else {
    return n as number;
  }
}

// math.js:411-416
/** Parte immaginaria di un numero (0 se reale). */
export function im(n: NumbasNumber): number {
  if (isComplex(n)) {
    return n.im;
  } else {
    return 0;
  }
}
