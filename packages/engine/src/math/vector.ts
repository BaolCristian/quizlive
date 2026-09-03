/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:2874-3181 — `Numbas.vectormath`, esposto qui come namespace
// `vectormath` (re-esportato da index.ts con `export * as vectormath`).
// Le operazioni sono permissive sulle dimensioni: riempiono con zeri quando
// due vettori non hanno la stessa lunghezza, come upstream. I nomi esportati
// replicano quelli upstream (`negate`, `add`, `sub`, `mul`, `div`, `eq`, ...)
// quindi le funzioni scalari equivalenti di `complex.ts`/`compare.ts` sono
// importate con un alias per evitare collisioni di nome in questo file.

import type { NumbasNumber, Vector, Matrix } from "./types";
import {
  negate as scalarNegate,
  add as scalarAdd,
  sub as scalarSub,
  mul as scalarMul,
  div as scalarDiv,
} from "./complex";
import { eq as scalarEq } from "./compare";
import { precround as scalarPrecround, siground as scalarSiground } from "./rounding";
import { arccos } from "./trig";
import { makeMatrix } from "./matrix";
import { MathError } from "../errors";

/** `a` ha proprietà `rows`/`columns` (è una matrice, non un vettore semplice)? */
function isMatrixLike(a: Vector | Matrix): a is Matrix {
  return "rows" in a;
}

/** Riduce un vettore-o-matrice-1xN/Nx1 a un vettore semplice, per `dot`/`cross`. */
function asVector(a: Vector | Matrix, errorKey: string): Vector {
  if (isMatrixLike(a)) {
    if (a.rows == 1) {
      return a[0] as Vector;
    } else if (a.columns == 1) {
      return a.map((row) => row[0] as NumbasNumber) as Vector;
    } else {
      throw new MathError(errorKey);
    }
  }
  return a;
}

// math.js:2880-2884
/** Nega un vettore - nega ciascuna delle sue componenti. */
export function negate(v: Vector): Vector {
  return v.map((x) => scalarNegate(x) as number);
}

// math.js:2891-2900
/** Somma due vettori. */
export function add(a: Vector, b: Vector): Vector {
  if (b.length > a.length) {
    const c = b;
    b = a;
    a = c;
  }
  return a.map((x, i) => scalarAdd(x, b[i] || 0) as number);
}

// math.js:2907-2917
/** Sottrae un vettore da un altro. */
export function sub(a: Vector, b: Vector): Vector {
  if (b.length > a.length) {
    return b.map((x, i) => scalarSub(a[i] || 0, x) as number);
  } else {
    return a.map((x, i) => scalarSub(x, b[i] || 0) as number);
  }
}

// math.js:2924-2928
/** Moltiplica per uno scalare. */
export function mul(k: NumbasNumber, v: Vector): Vector {
  return v.map((x) => scalarMul(k, x) as number);
}

// math.js:2935-2939
/** Divide per uno scalare. */
export function div(v: Vector, k: NumbasNumber): Vector {
  return v.map((x) => scalarDiv(x, k) as number);
}

// math.js:2947-2980
/** Prodotto scalare — ciascun argomento può essere un vettore, o una
 * matrice con una riga o una colonna, convertita a vettore. */
export function dot(a: Vector | Matrix, b: Vector | Matrix): NumbasNumber {
  let av = asVector(a, "vectormath.dot.matrix too big");
  let bv = asVector(b, "vectormath.dot.matrix too big");
  if (bv.length > av.length) {
    const c = bv;
    bv = av;
    av = c;
  }
  return av.reduce((s: NumbasNumber, x, i) => scalarAdd(s, scalarMul(x, bv[i] || 0)), 0);
}

// math.js:2990-3023
/** Prodotto vettoriale 3D — ciascun argomento può essere un vettore, o una
 * matrice con una riga, convertita a vettore. */
export function cross(a: Vector | Matrix, b: Vector | Matrix): Vector {
  const av = asVector(a, "vectormath.cross.matrix too big");
  const bv = asVector(b, "vectormath.cross.matrix too big");
  if (av.length != 3 || bv.length != 3) {
    throw new MathError("vectormath.cross.not 3d");
  }
  return [
    scalarSub(scalarMul(av[1]!, bv[2]!), scalarMul(av[2]!, bv[1]!)) as number,
    scalarSub(scalarMul(av[2]!, bv[0]!), scalarMul(av[0]!, bv[2]!)) as number,
    scalarSub(scalarMul(av[0]!, bv[1]!), scalarMul(av[1]!, bv[0]!)) as number,
  ];
}

// math.js:3029-3033
/** Lunghezza di un vettore, al quadrato. */
export function abs_squared(a: Vector): number {
  return a.reduce((s, x) => s + (scalarMul(x, x) as number), 0);
}

// math.js:3039-3043
/** Lunghezza di un vettore. */
export function abs(a: Vector): number {
  return Math.sqrt(a.reduce((s, x) => s + (scalarMul(x, x) as number), 0));
}

// math.js:3050-3059
/** Angolo fra due vettori, in radianti; `0` se uno dei due ha lunghezza 0. */
export function angle(a: Vector, b: Vector): NumbasNumber {
  const d = dot(a, b);
  const da = abs_squared(a);
  const db = abs_squared(b);
  if (da * db == 0) {
    return 0;
  }
  const denom = Math.sqrt(da * db);
  return arccos((d as number) / denom);
}

// math.js:3066-3075
/** Due vettori sono uguali? Vero se ogni coppia di componenti corrispondenti è uguale. */
export function eq(a: Vector, b: Vector): boolean {
  if (b.length > a.length) {
    const c = b;
    b = a;
    a = c;
  }
  return a.reduce((s: boolean, x, i) => s && scalarEq(x, b[i] || 0), true);
}

// math.js:3083-3085
/** Due vettori sono diversi? */
export function neq(a: Vector, b: Vector): boolean {
  return !eq(a, b);
}

// math.js:3092-3098
/** Moltiplica un vettore a sinistra per una matrice. */
export function matrixmul(m: Matrix, v: Vector): Vector {
  return m.map((row) => row.reduce((s: NumbasNumber, x, i) => scalarAdd(s, scalarMul(x, v[i] || 0)), 0) as number);
}

// math.js:3106-3114
/** Moltiplica un vettore a destra per una matrice (il vettore è considerato colonna). */
export function vectormatrixmul(v: Vector, m: Matrix): Vector {
  const out: number[] = [];
  for (let i = 0; i < m.columns; i++) {
    out.push(
      v.reduce((s: NumbasNumber, x, j) => {
        const c = j < m.rows ? m[j]![i] || 0 : 0;
        return scalarAdd(s, scalarMul(x, c));
      }, 0) as number
    );
  }
  return out;
}

// math.js:3121-3123
/** Applica una funzione a ciascun elemento. */
export function map(v: Vector, fn: (x: NumbasNumber) => NumbasNumber): Vector {
  return v.map(fn) as number[];
}

// math.js:3130-3134
/** Arrotonda ogni elemento al numero dato di cifre decimali. */
export function precround(v: Vector, dp: number): Vector {
  return map(v, (n) => scalarPrecround(n, dp)) as number[];
}

// math.js:3141-3145
/** Arrotonda ogni elemento al numero dato di cifre significative. */
export function siground(v: Vector, sf: number): Vector {
  return map(v, (n) => scalarSiground(n, sf)) as number[];
}

// math.js:3151-3156
/** Trasposta di un vettore: vettore → matrice riga `1×N`. */
export function transpose(v: Vector): Matrix {
  return makeMatrix([v.slice() as NumbasNumber[]]);
}

// math.js:3162-3169
/** Converte un vettore in una matrice colonna `N×1`. */
export function toMatrix(v: Vector): Matrix {
  return makeMatrix(v.map((n) => [n as NumbasNumber]));
}

// math.js:3176-3180
/** Ogni componente di questo vettore è zero? */
export function is_zero(v: Vector): boolean {
  return v.every((c) => c == 0);
}
