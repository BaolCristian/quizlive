/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Replica gli helper di tests/jme/jme-tests.mjs:19-38 (closeEqual, deepCloseEqual).

import { expect } from "vitest";
import * as math from "../../src/math";

/** Arrotonda a 10 decimali prima del confronto, come closeEqual upstream. */
export function closeEqual(actual: unknown, expected: unknown, message?: string): void {
  const r = (v: unknown) => (typeof v === "number" ? math.precround(v, 10) : v);
  expect(r(actual), message).toEqual(r(expected));
}
export function deepCloseEqual(actual: unknown, expected: unknown, message?: string): void {
  const r = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(r) : typeof v === "number" ? math.precround(v, 10) : v;
  expect(r(actual), message).toEqual(r(expected));
}
