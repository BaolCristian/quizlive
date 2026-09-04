/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// util.js:1082-1309 — combinatoria su liste (nessuna dipendenza da altri
// file di math/). `combinations`/`permutations` qui hanno nomi upstream
// identici a quelli di `number-theory.ts` (nCk/nPk su interi) ma semantica
// diversa (combinatoria su liste generiche): namespace diversi, nessun
// conflitto di export perché non tutto finisce in un'unica `index.ts` flat
// (vedi il commento in index.ts).

import { MathError } from "../errors";

// util.js:1082-1121
/** Prodotto cartesiano di N liste. */
export function product<T>(lists: readonly (readonly T[])[]): T[][] {
  if (!Array.isArray(lists)) {
    throw new MathError("util.product.non list");
  }
  const indexes = lists.map(() => 0);
  let zero = false;
  let nonArray = false;
  const lengths = lists.map((l) => {
    if (!Array.isArray(l)) {
      nonArray = true;
    }
    if (l.length == 0) {
      zero = true;
    }
    return l.length;
  });
  if (nonArray) {
    throw new MathError("util.product.non list");
  }
  if (zero) {
    return [];
  }
  const end = lists.length - 1;
  const out: T[][] = [];
  while (indexes[0] != lengths[0]) {
    out.push(indexes.map((i, n) => lists[n]![i]!));
    let k = end;
    indexes[k]! += 1;
    while (k > 0 && indexes[k] == lengths[k]) {
      indexes[k] = 0;
      k -= 1;
      indexes[k]! += 1;
    }
  }
  return out;
}

// util.js:1129-1143
/** Prodotto cartesiano di `l` con se stessa `n` volte. */
export function cartesian_power<T>(l: readonly T[], n: number): T[][] {
  let o: T[][] = [[]];
  for (let i = 0; i < n; i++) {
    const no: T[][] = [];
    o.forEach((ol) => {
      l.forEach((x) => {
        const nl = ol.slice();
        nl.push(x);
        no.push(nl);
      });
    });
    o = no;
  }
  return o;
}

// util.js:1150-1168
/** Trasposizione tipo Python `zip`: dalle liste `[a,b,c,...]`, `[x,y,z,...]`
 * ritorna `[[a,x],[b,y],[c,z], ...]`, fermandosi alla lista più corta. */
export function zip<T>(lists: readonly (readonly T[])[]): T[][] {
  const out: T[][] = [];
  if (lists.length == 0) {
    return out;
  }
  let i = 0;
  while (true) {
    const z: T[] = [];
    for (let j = 0; j < lists.length; j++) {
      if (i < lists[j]!.length) {
        z.push(lists[j]![i]!);
      } else {
        return out;
      }
    }
    out.push(z);
    i += 1;
  }
}

// util.js:1176-1203 — limite hardcoded: si ferma dopo 1000 iterazioni, può
// restituire un risultato incompleto per combinatorie grandi (upstream,
// asimmetrico rispetto a `combinations_with_replacement`, che non ha limite).
/** Tutte le combinazioni di `r` elementi dalla lista, senza ripetizione. */
export function combinations<T>(list: readonly T[], r: number): T[][] {
  const indexes: number[] = [];
  for (let i = 0; i < r; i++) {
    indexes.push(i);
  }
  const length = list.length;
  const end = r - 1;
  const out: T[][] = [];
  let steps = 0;
  while (steps < 1000 && indexes[0]! < length + 1 - r) {
    steps += 1;
    out.push(indexes.map((i) => list[i]!));
    indexes[end]! += 1;
    if (indexes[end] == length) {
      let k = end;
      while (k >= 0 && indexes[k] == length + 1 - r + k) {
        k -= 1;
        indexes[k]! += 1;
      }
      for (k = k + 1; k < r; k++) {
        indexes[k] = indexes[k - 1]! + 1;
      }
    }
  }
  return out;
}

// util.js:1210-1235
/** Tutte le combinazioni di `r` elementi dalla lista, con ripetizione. */
export function combinations_with_replacement<T>(list: readonly T[], r: number): T[][] {
  const indexes: number[] = [];
  for (let i = 0; i < r; i++) {
    indexes.push(0);
  }
  const length = list.length;
  const end = r - 1;
  const out: T[][] = [];
  while (indexes[0]! < length) {
    out.push(indexes.map((i) => list[i]!));
    indexes[end]! += 1;
    if (indexes[end] == length) {
      let k = end;
      while (k >= 0 && indexes[k] == length) {
        k -= 1;
        indexes[k]! += 1;
      }
      for (k = k + 1; k < r; k++) {
        indexes[k] = indexes[k - 1]!;
      }
    }
  }
  return out;
}

// util.js:1244-1286
/** Tutte le permutazioni di tutte le scelte di `r` elementi dalla lista
 * (algoritmo ispirato a Python `itertools`). */
export function permutations<T>(list: readonly T[], r?: number): T[][] {
  const n = list.length;
  if (r === undefined) {
    r = n;
  }
  if (r > n) {
    throw new MathError("util.permutations.r bigger than n");
  }
  const indices: number[] = [];
  const cycles: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(i);
  }
  for (let i = n; i >= n - r + 1; i--) {
    cycles.push(i);
  }
  const out: T[][] = [indices.slice(0, r).map((v) => list[v]!)];
  while (n) {
    let i: number;
    for (i = r - 1; i >= 0; i--) {
      cycles[i]! -= 1;
      if (cycles[i] == 0) {
        indices.push(indices.splice(i, 1)[0]!);
        cycles[i] = n - i;
      } else {
        const j = cycles[i]!;
        const t = indices[i]!;
        indices[i] = indices[n - j]!;
        indices[n - j] = t;
        out.push(indices.slice(0, r).map((v) => list[v]!));
        break;
      }
    }
    if (i == -1) {
      break;
    }
  }
  return out;
}

// util.js:1293-1309
/** Formato "lettera" di un ordinale: `0,1,2,...` → `a,b,...,z,aa,ab,...`. */
export function letterOrdinal(n: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const b = alphabet.length;
  if (n == 0) {
    return alphabet[0]!;
  }
  let s = "";
  while (n > 0) {
    if (s) {
      n -= 1;
    }
    const m = n % b;
    s = alphabet[m] + s;
    n = (n - m) / b;
  }
  return s;
}
