/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Replica gli helper di tests/jme/jme-tests.mjs:19-38 (closeEqual, deepCloseEqual).

import { expect } from "vitest";
import * as math from "../../src/math";

// upstream (jme-tests.mjs:24-40): `if(typeof(expect)=='number' || expect.complex)
// { value = precround(value,10); expect = precround(expect,10); }` — arrotonda
// anche i valori COMPLESSI (precround ricorre su re/im), non solo i number
// grezzi. Il brief del Task 1 dà `typeof v === "number"` come unico
// controllo; qui si aggiunge `math.isComplex(v)` per restare fedeli al
// comportamento upstream descritto ("come closeEqual upstream") — senza
// questo, gli oggetti `{complex:true,re,im}` non venivano arrotondati e i
// confronti di `Trigonometry`/`Exponentials` in math-direct.test.ts
// fallivano per rumore di floating point oltre la decima cifra decimale.
const shouldRound = (v: unknown): v is number | math.Complex => typeof v === "number" || math.isComplex(v);

/** Arrotonda a 10 decimali prima del confronto, come closeEqual upstream. */
export function closeEqual(actual: unknown, expected: unknown, message?: string): void {
  const r = (v: unknown) => (shouldRound(v) ? math.precround(v, 10) : v);
  expect(r(actual), message).toEqual(r(expected));
}
export function deepCloseEqual(actual: unknown, expected: unknown, message?: string): void {
  const r = (v: unknown): unknown => (Array.isArray(v) ? v.map(r) : shouldRound(v) ? math.precround(v, 10) : v);
  expect(r(actual), message).toEqual(r(expected));
}
