/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo math/, come da brief del Task 1: la
// maggior parte dei file è esportata "flat" (`export *`), mentre
// `vectormath`/`matrixmath`/`setmath` restano namespace separati (fedeli a
// `Numbas.vectormath`/`Numbas.matrixmath`/`Numbas.setmath` upstream), perché
// operano su una convenzione di forma diversa (array con proprietà extra o
// eq iniettabile) e — per `matrixmath`/`setmath` — perché altrimenti
// collidono con nomi già usati a livello scalare (`add`, `sub`, `mul`, `eq`,
// `neq`, `map`, `precround`, `siground`, ...).
//
// Collisione di nome nota fra number-theory.ts e combinatorics.ts:
// `Numbas.math.combinations`/`permutations` (coefficiente binomiale nCk/nPk,
// number-theory.ts) e `Numbas.util.combinations`/`permutations`
// (combinatoria su liste, combinatorics.ts) hanno lo STESSO nome upstream ma
// vivono in namespace diversi (`math` vs `util`) — se esportati entrambi
// "flat" qui, `export *` li renderebbe ambigui (TS2308) e il binding
// risulterebbe silenziosamente assente. Si mantiene `combinations`/
// `permutations` flat per il significato numerico (nCk/nPk — è quello usato
// dalle funzioni JME `comb`/`perm`, Task 4), e si re-esportano le versioni
// su liste di combinatorics.ts con un prefisso esplicito.
export * from "./types";
export * from "./predicates";
export * from "./complex";
export * from "./compare";
export * from "./integer-rounding";
export * from "./rounding";
export * from "./trig";
export * from "./number-theory";
export * from "./ranges";
export * from "./random";
export * from "./fraction";
export * from "./complex-decimal";
export * from "./format";
export * from "./real-interval";
export * from "./string-format";
export {
  product,
  cartesian_power,
  zip,
  combinations_with_replacement,
  letterOrdinal,
  combinations as list_combinations,
  permutations as list_permutations,
} from "./combinatorics";

export * as vectormath from "./vector";
export * as matrixmath from "./matrix";
export * as setmath from "./set";
// `makeMatrix` non è un membro upstream di `Numbas.matrixmath`: è l'helper
// del Task 1 per costruire `Matrix` con `rows`/`columns` sempre impostati
// (ambiguità 1 del brief) — esposto anche flat, non solo su `matrixmath`,
// perché è usato per COSTRUIRE le matrici da passare a `matrixmath.*`.
export { makeMatrix } from "./matrix";
