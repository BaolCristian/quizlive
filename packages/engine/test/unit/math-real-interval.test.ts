// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Porting diretto di jme-tests.mjs: QUnit.module('Real intervals') (1640-1855),
// tutti e 8 i QUnit.test — nessuna dipendenza da jme.js (§5 dell'inventario).
// Nota sulla granularità: i test upstream basati su `forEach` (Pairwise
// intersection/union, Complement, Difference, Union/Intersection/Complement
// of unions) hanno un solo `assert` testuale nel sorgente, eseguito più
// volte su una tabella di casi — qui restano un solo `it` per blocco,
// replicando il loop. 'Constructor' raggruppa le 4 proprietà controllate per
// ciascuno dei 5 casi in un `it` per caso (stessa granularità semantica).

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";

describe("Real intervals > Constructor", () => {
  it("RealInterval(0,0,true,true)", () => {
    const a = new math.RealInterval(0, 0, true, true);
    expect(a.start).toBe(0);
    expect(a.end).toBe(0);
    expect(a.includes_start).toBe(true);
    expect(a.includes_end).toBe(true);
  });
  it("RealInterval(0,0,false,true)", () => {
    const a = new math.RealInterval(0, 0, false, true);
    expect(a.start).toBe(0);
    expect(a.end).toBe(0);
    expect(a.includes_start).toBe(true);
    expect(a.includes_end).toBe(true);
  });
  it("RealInterval(0,0,false,false)", () => {
    const a = new math.RealInterval(0, 0, false, false);
    expect(a.start).toBe(0);
    expect(a.end).toBe(0);
    expect(a.includes_start).toBe(false);
    expect(a.includes_end).toBe(false);
  });
  it("RealInterval(0,1,false,true)", () => {
    const a = new math.RealInterval(0, 1, false, true);
    expect(a.start).toBe(0);
    expect(a.end).toBe(1);
    expect(a.includes_start).toBe(false);
    expect(a.includes_end).toBe(true);
  });
  it("RealInterval(1,0,false,true)", () => {
    const a = new math.RealInterval(1, 0, false, true);
    expect(a.start).toBe(0);
    expect(a.end).toBe(1);
    expect(a.includes_start).toBe(true);
    expect(a.includes_end).toBe(false);
  });
});

describe("Real intervals > Pairwise intersection", () => {
  it("a ∩ b = c per ogni caso della tabella (ed entrambi gli ordini)", () => {
    const intersection_tests = [
      "[0..2] [1..3] [1..2]",
      "[0..2] (1..33] (1..2]",
      "[0..2) [1..33] [1..2)",
      "[0..2) (1..33) (1..2)",

      "[0..1] [1..2] [1..1]",
      "[0..1) [1..2] (1..1)",
      "[0..1] (1..2] (1..1)",
      "[0..1) (1..2) (1..1)",

      "[0..1] [2..3] (0..0)",

      "(0..2) [4..7] (0..0)",

      "(-Infinity..4] (0..3) (0..3)",
    ];

    intersection_tests.forEach((defs) => {
      const [a, b, c] = defs.split(" ").map((def) => math.RealInterval.fromString(def));
      expect(a!.intersection(b!).equals(c!), `${a} ∩ ${b} = ${c}`).toBe(true);
      expect(b!.intersection(a!).equals(c!), `${b} ∩ ${a} = ${c} (${defs})`).toBe(true);
    });
  });
});

describe("Real intervals > Pairwise union", () => {
  it("a ∪ b = c per ogni caso della tabella (ed entrambi gli ordini)", () => {
    const union_tests: [
      [number, number, boolean, boolean],
      [number, number, boolean, boolean],
      [number, number, boolean, boolean][],
    ][] = [
      [
        [0, 1, false, false],
        [2, 3, false, false],
        [
          [0, 1, false, false],
          [2, 3, false, false],
        ],
      ],
      [
        [0, 1, false, false],
        [1, 2, false, false],
        [
          [0, 1, false, false],
          [1, 2, false, false],
        ],
      ],
      [
        [0, 1, false, true],
        [1, 2, false, false],
        [[0, 2, false, false]],
      ],
      [
        [0, 1, false, false],
        [1, 2, true, false],
        [[0, 2, false, false]],
      ],
      [
        [0, 1, false, true],
        [1, 2, true, false],
        [[0, 2, false, false]],
      ],

      [
        [0, 3, false, false],
        [1, 2, false, false],
        [[0, 3, false, false]],
      ],
      [
        [0, 3, false, false],
        [1, 2, true, false],
        [[0, 3, false, false]],
      ],
      [
        [0, 3, false, false],
        [1, 2, false, true],
        [[0, 3, false, false]],
      ],
      [
        [0, 3, true, false],
        [1, 2, false, true],
        [[0, 3, true, false]],
      ],
      [
        [0, 3, false, true],
        [1, 2, false, true],
        [[0, 3, false, true]],
      ],

      [
        [1, 2, false, false],
        [1, 2, false, false],
        [[1, 2, false, false]],
      ],
      [
        [1, 2, true, false],
        [1, 2, false, false],
        [[1, 2, true, false]],
      ],
      [
        [1, 2, false, true],
        [1, 2, false, false],
        [[1, 2, false, true]],
      ],
      [
        [1, 2, false, false],
        [1, 2, true, false],
        [[1, 2, true, false]],
      ],
      [
        [1, 2, false, false],
        [1, 2, false, true],
        [[1, 2, false, true]],
      ],

      [
        [1, 2, false, false],
        [0, 3, false, false],
        [[0, 3, false, false]],
      ],
    ];

    union_tests.forEach(([adef, bdef, cdefs]) => {
      const a = new math.RealInterval(...adef);
      const b = new math.RealInterval(...bdef);
      const c = cdefs.map((def) => new math.RealInterval(...def));
      let union = a.union(b);
      expect(union.length == c.length && union.every((u, i) => u.equals(c[i]!)), `${a} ∪ ${b} = ${c}`).toBe(true);
      union = b.union(a);
      expect(union.length == c.length && union.every((u, i) => u.equals(c[i]!)), `${b} ∪ ${a} = ${c}`).toBe(true);
    });
  });
});

describe("Real intervals > Complement", () => {
  it("¬def = expected per ogni caso della tabella", () => {
    const complement_tests: [string, string][] = [
      ["(0)", "(-Infinity..Infinity)"],
      ["[0]", "(-Infinity..0) (0..Infinity)"],
      ["(1..2)", "(-Infinity..1] [2..Infinity)"],
      ["[1..2)", "(-Infinity..1) [2..Infinity)"],
      ["(1..2]", "(-Infinity..1] (2..Infinity)"],
      ["(-Infinity..2)", "[2..Infinity)"],
      ["(1..Infinity)", "(-Infinity..1]"],
      ["(-Infinity..Infinity)", ""],
    ];

    complement_tests.forEach(([def, expected_str]) => {
      const a = math.RealInterval.fromString(def);
      const expected = expected_str
        .split(" ")
        .filter((x) => x)
        .map((x) => math.RealInterval.fromString(x));
      const complement = a.complement();

      expect(
        complement.length == expected.length && complement.every((c, i) => c.equals(expected[i]!)),
        `¬${def} = ${expected_str}`
      ).toBe(true);
    });
  });
});

describe("Real intervals > Difference", () => {
  it("a - b = expected per ogni caso della tabella", () => {
    const difference_tests: [string, string, string][] = [
      ["(0..3)", "(1..2)", "(0..1] [2..3)"],
      ["(0..3)", "[1..2)", "(0..1) [2..3)"],
      ["(0..3)", "[1]", "(0..1) (1..3)"],
      ["[0..3]", "(1..2)", "[0..1] [2..3]"],
      ["(0..3)", "(4..5)", "(0..3)"],
      ["(0..3)", "(0..5)", ""],
      ["(0..3)", "(0..3)", ""],
      ["(0..3]", "(0..3)", "[3]"],
    ];

    difference_tests.forEach(([a_str, b_str, expected_str]) => {
      const a = math.RealInterval.fromString(a_str);
      const b = math.RealInterval.fromString(b_str);
      const expected = expected_str
        .split(" ")
        .filter((x) => x)
        .map((x) => math.RealInterval.fromString(x));
      const difference = a.difference(b);

      expect(
        difference.length == expected.length && difference.every((d, i) => d.equals(expected[i]!)),
        `${a_str} - ${b_str} = ${expected_str}`
      ).toBe(true);
    });
  });
});

describe("Real intervals > Union of unions", () => {
  it("unione di più RealInterval produce gli intervalli attesi", () => {
    const big_union_tests: [string, string][] = [
      ["(0..1) (1..2) (3..5) (4..6) [6..7]", "(0..1) (1..2) (3..7]"],
      ["(0..1] (1..2) (3..5) (4..6) [6..7]", "(0..2) (3..7]"],
      ["(0..1] (3..5) (4..6) (1..2) [6..7]", "(0..2) (3..7]"],
      ["(0..1] [6..7] (3..5) (4..6) (1..2)", "(0..2) (3..7]"],
    ];

    big_union_tests.forEach(([input, output]) => {
      const in_intervals = input.split(" ").map((x) => math.RealInterval.fromString(x));
      const expected = output.split(" ").map((x) => math.RealInterval.fromString(x));
      const out = new math.RealIntervalUnion(in_intervals);
      expect(
        out.intervals.length == expected.length && out.intervals.every((a, i) => a.equals(expected[i]!)),
        `${input} == ${output}`
      ).toBe(true);
    });
  });
});

describe("Real intervals > Intersection of unions", () => {
  it("intersezione di due RealIntervalUnion produce gli intervalli attesi", () => {
    const big_intersection_tests: [string, string, string][] = [
      ["(0..2) (2..6) [7] [8..12)", "(1..3] [4..7] (9..10)", "(1..2) (2..3] [4..6) [7] (9..10)"],
      ["[1] [2] [3]", "(0..3)", "[1] [2]"],
      ["[1] [2] [3]", "(0..2) (1..4)", "[1] [2] [3]"],
    ];

    big_intersection_tests.forEach(([a_str, b_str, expected_str]) => {
      const a = math.RealIntervalUnion.fromString(a_str);
      const b = math.RealIntervalUnion.fromString(b_str);
      const expected = expected_str.split(" ").map((x) => math.RealInterval.fromString(x));
      const out = a.intersection(b);

      expect(
        out.intervals.length == expected.length && out.intervals.every((c, i) => c.equals(expected[i]!)),
        `${a_str} ∩ ${b_str} = ${expected_str}`
      ).toBe(true);
    });
  });
});

describe("Real intervals > Complement of union", () => {
  it("complemento di un RealIntervalUnion produce gli intervalli attesi", () => {
    const big_complement_tests: [string, string][] = [
      ["(0..2) (2..6) [7] [8..12)", "(-Infinity..0] [2] [6..7) (7..8) [12..Infinity)"],
      ["", "(-Infinity..Infinity)"],
      ["[1]", "(-Infinity..1) (1..Infinity)"],
      ["(0..1) (1..2)", "(-Infinity..0] [1] [2..Infinity)"],
      ["(-Infinity..1) (2..Infinity)", "[1..2]"],
    ];

    big_complement_tests.forEach(([a_str, expected_str]) => {
      const a = math.RealIntervalUnion.fromString(a_str);
      const expected = expected_str.split(" ").map((x) => math.RealInterval.fromString(x));
      const out = a.complement();

      expect(
        out.intervals.length == expected.length && out.intervals.every((c, i) => c.equals(expected[i]!)),
        `complement of ${a_str} = ${expected_str}`
      ).toBe(true);
    });
  });
});
