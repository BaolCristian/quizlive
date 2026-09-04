/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:1001-1895 — generazione di numeri casuali. Nei tre punti
// primitivi (`randomint`, `randomrange`, `weighted_random`) `Math.random()`
// è sostituito da `rng()`, iniettato come ULTIMO parametro; tutte le altre
// funzioni "casuali" lo sono solo transitivamente (chiamano queste tre) e
// ricevono lo stesso `rng` da propagare (decisione 5 dello spec, vedi
// inventario §7 "Come si inietta il generatore casuale").
//
// `integer_partitions` ed `except` non sono elencate esplicitamente
// nell'Interfaces del brief ma cadono fisicamente in questo intervallo
// upstream (§7 dell'inventario): la prima è deterministica (nessun `rng`),
// la seconda opera su liste di numeri con `math.eq` (da non confondere con
// `util.except`, che opera su token JME — Task 2).

import type { Range, Rng } from "./types";
import { eq } from "./compare";
import { rangeSize } from "./ranges";
import { MathError } from "../errors";

// math.js:1001-1003
/** Numero intero casuale uniforme in `[0,n-1]`. */
export function randomint(n: number, rng: Rng): number {
  return Math.floor(n * (rng() % 1));
}

// math.js:1009-1016
/** Una permutazione casuale dei numeri `[0..N-1]` (Fisher-Yates via `randomint`). */
export function deal(N: number, rng: Rng): number[] {
  const Q = new Array<number>(N);
  for (let J = 0; J < N; J++) {
    const K = randomint(J + 1, rng);
    Q[J] = Q[K]!;
    Q[K] = J;
  }
  return Q;
}

// math.js:1022-1030
/** Mescola una lista, restituendone una copia (l'originale non è mutato). */
export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const l = list.length;
  const permutation = deal(l, rng);
  const list2 = new Array<T>(l);
  for (let i = 0; i < l; i++) {
    list2[i] = list[permutation[i]!]!;
  }
  return list2;
}

// math.js:1037-1043
/** Calcola l'inversa di una permutazione. */
export function inverse(l: readonly number[]): number[] {
  const arr = new Array<number>(l.length);
  for (let i = 0; i < l.length; i++) {
    arr[l[i]!] = i;
  }
  return arr;
}

// math.js:1052-1056
/** Riordina `list` secondo `order`: l'elemento `i` del risultato è `list[order[i]]`. */
export function reorder<T>(list: readonly T[], order: readonly number[]): T[] {
  return order.map((i) => list[i]!);
}

// math.js:1064-1078
/** Mescola più liste della stessa lunghezza applicando a tutte la stessa permutazione. */
export function shuffle_together<T extends unknown[][]>(lists: T, rng: Rng): T {
  if (lists.length == 0) {
    return [] as unknown as T;
  }
  const len = lists[0]!.length;
  for (let i = 1; i < lists.length; i++) {
    if (lists[i]!.length != len) {
      throw new MathError("math.shuffle_together.lists not all the same length");
    }
  }
  const order = deal(len, rng);
  return lists.map((list) => reorder(list, order)) as T;
}

// math.js:1086-1115
/** Una partizione casuale dell'intero `n` in `k` parti non nulle. */
export function random_integer_partition(n: number, k: number, rng: Rng): number[] {
  if (k > n || k < 1) {
    throw new MathError("math.random_integer_partition.invalid k", { n: n, k: k });
  }
  const shuffled: number[] = [];
  for (let i = 0; i < k - 1; i++) {
    if (shuffled[i] === undefined) {
      shuffled[i] = i;
    }
    const j = randomint(n - 1, rng);
    if (shuffled[j] === undefined) {
      shuffled[j] = j;
    }
    const a = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = a;
  }
  const cut = shuffled.slice(0, k - 1);
  cut.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const partition: number[] = [];
  let last = 0;
  for (let i = 0; i < k - 1; i++) {
    partition.push(cut[i]! + 1 - last);
    last = cut[i]! + 1;
  }
  partition.push(n - last);
  return partition;
}

// math.js:1123-1140
/** Tutte le partizioni ordinate dell'intero `n` in `k` parti (deterministico, non casuale). */
export function integer_partitions(n: number, k: number): number[][] {
  if (n < 0 || k <= 0) {
    if (k == 0 && n == 0) {
      return [[]];
    } else {
      return [];
    }
  }

  const out: number[][] = [];
  for (let i = 0; i <= n; i++) {
    for (const p of integer_partitions(n - i, k - 1)) {
      out.push([i].concat(p));
    }
  }

  return out;
}

// math.js:1817-1819
/** Numero reale casuale uniforme in `[min,max]`. */
export function randomrange(min: number, max: number, rng: Rng): number {
  return rng() * (max - min) + min;
}

// math.js:1830-1838
/** Valore casuale nell'intervallo `[min,max,step]`; se `step==0` delega a `randomrange`. */
export function random(r: Range, rng: Rng): number {
  if (r[2] == 0) {
    return randomrange(r[0], r[1], rng);
  } else {
    const num_steps = rangeSize(r);
    const n = Math.floor(randomrange(0, num_steps, rng));
    return r[0] + n * r[2];
  }
}

// math.js:1845-1855
/** Toglie da `range` i valori presenti in `exclude` (per `math.eq`). */
export function except(r: readonly number[], exclude: readonly number[]): number[] {
  return r.filter((v) => {
    for (let i = 0; i < exclude.length; i++) {
      if (eq(v, exclude[i]!)) {
        return false;
      }
    }
    return true;
  });
}

// math.js:1863-1869
/** Sceglie un elemento a caso dalla lista. */
export function choose<T>(list: readonly T[], rng: Rng): T {
  if (list.length == 0) {
    throw new MathError("math.choose.empty selection");
  }
  const n = Math.floor(randomrange(0, list.length, rng));
  return list[n]!;
}

// math.js:1876-1895
/** Sceglie a caso da una lista pesata di elementi (coppie `[valore, peso]`). */
export function weighted_random<T>(list: readonly (readonly [T, number])[], rng: Rng): T | undefined {
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]![1];
    total += p > 0 ? p : 0;
  }
  if (total == 0) {
    throw new MathError("math.choose.empty selection");
  }
  const target = rng() * total;
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]![1];
    acc += p > 0 ? p : 0;
    if (acc >= target) {
      return list[i]![0];
    }
  }
  return undefined;
}
