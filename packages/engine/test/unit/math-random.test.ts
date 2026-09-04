// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

import { describe, it, expect } from "vitest";
import seedrandom from "seedrandom";
import * as math from "../../src/math";

const rngFrom = (seed: string): math.Rng => {
  const r = seedrandom(seed);
  return () => r();
};

describe("random con rng iniettato", () => {
  it("è deterministico a parità di seed", () => {
    const a = Array.from({ length: 20 }, () => math.randomint(1000, rngFrom("s")));
    const b = Array.from({ length: 20 }, () => math.randomint(1000, rngFrom("s")));
    expect(a).toEqual(b);
  });
  it("shuffle è una permutazione e non muta l'input", () => {
    const rng = rngFrom("x");
    const input = [1, 2, 3, 4, 5, 6];
    const out = math.shuffle(input, rng);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("random(range) resta nel passo e nei limiti", () => {
    const rng = rngFrom("r");
    for (let i = 0; i < 200; i++) {
      const v = math.random([1, 9, 2], rng);
      expect([1, 3, 5, 7, 9]).toContain(v);
    }
  });
  it("deal(n) è una permutazione di 0..n-1", () => {
    expect([...math.deal(7, rngFrom("d"))].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
