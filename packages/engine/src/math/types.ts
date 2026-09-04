/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Tipi condivisi da tutto il modulo math/. Non c'è un file upstream diretto:
// math.js tratta questi valori "a runtime" (duck typing su typeof/`.complex`),
// qui li rendiamo espliciti come previsto dal brief del Task 1.

/** Generatore casuale in [0,1), iniettato ovunque il motore serva un numero
 * casuale. Non si usa mai `Math.random` direttamente nel motore (§ decisione 5). */
export type Rng = () => number;

/** Numero complesso: stessa forma letterale dell'upstream `{re,im,complex:true}`
 * (math.js:35-40, 97-104) — non una classe, niente `instanceof`. */
export type Complex = { complex: true; re: number; im: number };

/** Copre `number`, `bigint` (usato da fattoriali/gcd/Fraction/...) e `Complex`.
 * In molti punti dell'upstream il JSDoc dichiara `{number}` ma il commento in
 * testa a math.js (91-92) avverte che copre in realtà `number | complex`, e in
 * più punti anche `bigint`. */
export type NumbasNumber = number | bigint | Complex;

/** Vettore: array semplice di numeri (math.js:2863-2867). */
export type Vector = number[];

/** Matrice: array di array con proprietà extra `rows`/`columns` attaccate
 * all'array esterno, come upstream (math.js:3182-3188, §6.8 dell'inventario).
 * Si costruisce con l'helper `makeMatrix` in matrix.ts, non con un literal. */
export type Matrix = NumbasNumber[][] & { rows: number; columns: number };

/** Intervallo `[min, max, step]` (math.js:41-49, definito a math.js:2071). */
export type Range = [start: number, end: number, step: number];

/** Uno stile di notazione numerica (util.js:1460-1598). Rispetto al tipo
 * abbreviato del brief del Task 1, `format` è tipizzato come dizionario
 * `{plain,latex}` (non una singola funzione): `formatNumberNotation` sceglie
 * fra le due in base alla sintassi richiesta (util.js:634-647,
 * `style.format[syntax]`), e l'inventario (§2.1, riga `numberNotationStyles`)
 * conferma questa forma. `clean` è opzionale: solo lo stile `scientific` lo
 * usa (§6.12), e riceve la sola stringa combaciata (upstream vi passa `m[0]`
 * dentro `clean(m)`, ma m[0] è l'unica parte del match usata). */
export type NotationStyle = {
  re: RegExp;
  format: {
    plain: (integer: string, decimal: string) => string;
    latex: (integer: string, decimal: string) => string;
  };
  clean?: (s: string) => string;
};

/** `n` è un numero complesso nella forma letterale upstream? */
export function isComplex(n: unknown): n is Complex {
  return typeof n === "object" && n !== null && (n as { complex?: unknown }).complex === true;
}
