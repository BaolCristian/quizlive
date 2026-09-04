/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:3759-3834 — `Numbas.setmath`, esposto qui come namespace
// `setmath` (re-esportato da index.ts con `export * as setmath`).
//
// DIVERGENZA rispetto all'upstream (vedi DIVERGENCES.md): `setmath.contains`
// upstream dipende da `Numbas.util.eq` (uguaglianza di TOKEN JME, con
// `scope` per normalizzare i nomi) — un ciclo di dipendenza `math.js ⇄
// util.js` risolto solo dall'ordine di caricamento a runtime (§6.13/§13
// dell'inventario). Qui `setmath` opera su VALORI GREZZI: l'uguaglianza è
// iniettabile (parametro `eq`, default `objects_equal` da predicates.ts) e
// non c'è alcuna dipendenza da un tipo "token"/scope — il ciclo sparisce
// (decisione 6 del brief).

import { objects_equal } from "./predicates";

// math.js:3767-3774
/** L'insieme contiene l'elemento dato? */
export function contains<T>(set: readonly T[], element: T, eq: (a: T, b: T) => boolean = objects_equal): boolean {
  for (let i = 0, l = set.length; i < l; i++) {
    if (eq(set[i]!, element)) {
      return true;
    }
  }
  return false;
}

// math.js:3782-3790
/** Unione di due insiemi. */
export function union<T>(a: readonly T[], b: readonly T[], eq: (a: T, b: T) => boolean = objects_equal): T[] {
  const out = a.slice();
  for (let i = 0, l = b.length; i < l; i++) {
    if (!contains(a, b[i]!, eq)) {
      out.push(b[i]!);
    }
  }
  return out;
}

// math.js:3798-3802
/** Intersezione di due insiemi. */
export function intersection<T>(a: readonly T[], b: readonly T[], eq: (a: T, b: T) => boolean = objects_equal): T[] {
  return a.filter((v) => contains(b, v, eq));
}

// math.js:3810-3812
/** Due insiemi sono uguali? Sì se `a`, `b` e (a intersecato b) hanno tutti la stessa lunghezza. */
export function eq<T>(a: readonly T[], b: readonly T[], eqFn: (a: T, b: T) => boolean = objects_equal): boolean {
  return a.length == b.length && intersection(a, b, eqFn).length == a.length;
}

// math.js:3820-3824
/** Differenza insiemistica: toglie gli elementi di `b` da `a`. */
export function minus<T>(a: readonly T[], b: readonly T[], eq: (a: T, b: T) => boolean = objects_equal): T[] {
  return a.filter((v) => !contains(b, v, eq));
}

// math.js:3830-3832
/** Dimensione di un insieme. */
export function size<T>(set: readonly T[]): number {
  return set.length;
}
