// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Porting diretto (una `it` per `assert` upstream, salvo dove upstream stesso
// itera su una tabella con `forEach` — in quel caso resta un solo `it` per
// blocco `forEach`, replicando il loop) di jme-tests.mjs:
// - QUnit.module('Evaluating') > 'Numbas.math' (459-472), 'Is scalar
//   multiple' (960-1003), 'Vector and Matrix operations' limitatamente alle
//   3 assert dirette 1309-1318 (non mutazione dell'input), 'Gauss-jordan
//   elimination' (1321-1334, interamente diretta).
// - QUnit.module('Display') > 'niceNumber' (2236-2251), 'niceDecimal'
//   (2253-2265), 'niceComplexDecimal' (2267-2282), 'Number notation styles'
//   (2315-2431).

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
// Non `decimal.js` direttamente: il modulo `math/` usa un `Decimal` clonato
// con `precision:40`/`toExpPos:1000`/`toExpNeg:-1000` (math.js:23-28, portato
// in complex-decimal.ts per non mutare la classe globale — vedi il file). I
// test devono costruire i `Decimal` con la stessa classe configurata,
// altrimenti vedono la precisione di default (20) di decimal.js.
const { Decimal } = math;

describe("Evaluating > Numbas.math", () => {
  it("math.countSigFigs('1.10')==3", () => {
    expect(math.countSigFigs("1.10")).toBe(3);
  });
  it("math.countSigFigs('-1.10')==3", () => {
    expect(math.countSigFigs("-1.10")).toBe(3);
  });
  it("math.countSigFigs('1.23e6')==3", () => {
    expect(math.countSigFigs("1.23e6")).toBe(3);
  });
  it("math.countSigFigs('1.23e-6')==3", () => {
    expect(math.countSigFigs("1.23e-6")).toBe(3);
  });
  it("math.countSigFigs('1.23E6')==3", () => {
    expect(math.countSigFigs("1.23E6")).toBe(3);
  });
  it("math.countSigFigs('1.23E-6')==3", () => {
    expect(math.countSigFigs("1.23E-6")).toBe(3);
  });
  it("math.countSigFigs('1.20e6',5)==3 (the max setting doesn't have any meaning for E notation)", () => {
    expect(math.countSigFigs("1.20e6", true)).toBe(3);
  });
  it("math.countSigFigs('1,20',5)==0 (only plain notation is expected)", () => {
    expect(math.countSigFigs("1,20", true)).toBe(0);
  });
  it("NaN = NaN", () => {
    expect(math.eq(NaN, NaN)).toBe(true);
  });
  it("eq({complex,re:1,im:1},{complex,re:1,im:2}) is false", () => {
    expect(math.eq({ complex: true, re: 1, im: 1 }, { complex: true, re: 1, im: 2 })).toBe(false);
  });
  it("eq(Infinity,1) is false", () => {
    expect(math.eq(Infinity, 1)).toBe(false);
  });
  it("eq(1,-Infinity) is false", () => {
    expect(math.eq(1, -Infinity)).toBe(false);
  });
});

describe("Evaluating > Is scalar multiple", () => {
  it("normal case", () => {
    expect(math.is_scalar_multiple([1, 2, 3], [2, 4, 6])).toBe(true);
  });
  it("float case to test rel (false)", () => {
    expect(math.is_scalar_multiple([1.01, 2.01, 3.01], [2, 4, 6])).toBe(false);
  });
  it("float case to test rel (true, tolleranza stretta)", () => {
    expect(math.is_scalar_multiple([1.00001, 2.00001, 3.00001], [2, 4, 6], 0.001, 0.001)).toBe(true);
  });
  it("float case to test rel (true, tolleranza larga)", () => {
    expect(math.is_scalar_multiple([1.01, 2.01, 3.01], [2, 4, 6], 0.1, 0.1)).toBe(true);
  });
  it("corner case: empty scalar", () => {
    expect(math.is_scalar_multiple([], [])).toBe(false);
  });
  it("corner case: zero value", () => {
    expect(math.is_scalar_multiple([1, 0, 2], [2, 0, 4])).toBe(true);
  });
  it("corner case: head zero value", () => {
    expect(math.is_scalar_multiple([0, 0, 2], [0, 0, 4])).toBe(true);
  });
});

// `matrixmath.*` ritorna `Matrix` (array con proprietà extra `rows`/
// `columns`, §6.8 dell'inventario): `toEqual` di vitest confronta anche le
// proprietà extra sugli array (a differenza di `assert.deepEqual` di QUnit,
// che upstream usa e che le ignora), quindi si confronta il solo contenuto
// numerico, spacchettando prima in array semplici.
const plainMatrix = (m: readonly (readonly number[])[]): number[][] => m.map((row) => [...row]);

describe("Evaluating > Vector and Matrix operations (assert dirette, non mutazione dell'input)", () => {
  it("combine_vertically: input not mutated", () => {
    const m1 = math.makeMatrix([[1]]);
    const mv = math.matrixmath.combine_vertically(m1, m1);
    m1[0]![0] = 2;
    expect(plainMatrix(mv as number[][])).toEqual([[1], [1]]);
  });
  it("combine_horizontally: input not mutated", () => {
    const m1 = math.makeMatrix([[1]]);
    const mh = math.matrixmath.combine_horizontally(m1, m1);
    m1[0]![0] = 2;
    expect(plainMatrix(mh as number[][])).toEqual([[1, 1]]);
  });
  it("combine_diagonally: input not mutated", () => {
    const m1 = math.makeMatrix([[1]]);
    const md = math.matrixmath.combine_diagonally(m1, m1);
    m1[0]![0] = 2;
    expect(plainMatrix(md as number[][])).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });
});

describe("Evaluating > Gauss-jordan elimination", () => {
  it("riduce ogni matrice della tabella alla forma attesa", () => {
    const tests: { input: number[][]; out: number[][] }[] = [
      {
        input: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 0, 1],
        ],
        out: [
          [1, 0, 0],
          [0, 0, 1],
          [0, 0, 0],
        ],
      },
      {
        input: [
          [1, 0],
          [0, 1],
          [2, 3],
        ],
        out: [
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      },
      {
        input: [
          [2, 0, 4, 6, 12, 15, 24],
          [1, 0, 2, 3, 8, 10, 18],
          [-2, 0, -4, -6, -16, -20, -18],
        ],
        out: [
          [1, 0, 2, 3, 0, 0, 0],
          [0, 0, 0, 0, 1, 1.25, 0],
          [0, 0, 0, 0, 0, 0, 1],
        ],
      },
    ];

    tests.forEach(({ input, out }) => {
      const m = math.makeMatrix(input);
      const result = plainMatrix(math.matrixmath.gauss_jordan_elimination(m) as number[][]);
      expect(result, JSON.stringify(input)).toEqual(out);
    });
  });
});

describe("Display > niceNumber", () => {
  it("niceNumber with sigfig precision calculates number of zeroes to add correctly (1000)", () => {
    expect(math.niceNumber(1000, { precisionType: "sigfig", precision: 2 })).toBe("1000");
  });
  it("niceNumber with sigfig precision calculates number of zeroes to add correctly (1010)", () => {
    expect(math.niceNumber(1010, { precisionType: "sigfig", precision: 6 })).toBe("1010.00");
  });
  it("niceNumber recognises infinity", () => {
    expect(math.niceNumber(Infinity)).toBe("infinity");
  });
  it("niceNumber recognises -infinity", () => {
    expect(math.niceNumber(-Infinity)).toBe("-infinity");
  });
  it("niceNumber on -pi doesn't say -1pi", () => {
    expect(math.niceNumber(-Math.PI)).toBe("-pi");
  });
  it("niceNumber doesn't show pi when given a precisionType", () => {
    expect(math.niceNumber(Math.PI, { precisionType: "dp", precision: 2 })).toBe("3.14");
  });
  it("niceNumber adds digits to exponential-form numbers correctly (6e-10)", () => {
    expect(math.niceNumber(6e-10, { precisionType: "sigfig", precision: 3 })).toBe("0.000000000600");
  });
  it("niceNumber adds digits to exponential-form numbers correctly (2.2e-10, sigfig)", () => {
    expect(math.niceNumber(2.2e-10, { precisionType: "sigfig", precision: 3 })).toBe("0.000000000220");
  });
  it("niceNumber adds digits to exponential-form numbers correctly (2e-10, dp)", () => {
    expect(math.niceNumber(2e-10, { precisionType: "dp", precision: 12 })).toBe("0.000000000200");
  });
  it("niceNumber adds digits to exponential-form numbers correctly (2.2e-10, dp)", () => {
    expect(math.niceNumber(2.2e-10, { precisionType: "dp", precision: 12 })).toBe("0.000000000220");
  });
  it("precision formatting on a scientific form number", () => {
    expect(math.niceNumber(1.234e5, { style: "scientific", precisionType: "dp", precision: 1 })).toBe("1.2e+5");
  });
  it("sigfig precision doesn't add unwanted floating point error digits", () => {
    expect(math.niceNumber(0.0002663, { precisionType: "sigfig", precision: 1 })).toBe("0.0003");
  });
  it("scientific notation doesn't put spaces between groups of digits", () => {
    expect(math.niceNumber(1.234567e5, { style: "scientific" })).toBe("1.234567e+5");
  });
  it("sig figs on ComplexDecimal values", () => {
    // upstream: `niceNumber`/`siground` fanno duck-typing su `.toPrecision`/
    // `.toString()`; un `ComplexDecimal` reale ci passa attraverso per
    // coercizione implicita (§8.2 dell'inventario) — non è nel tipo
    // `NumbasNumber`, quindi il cast è voluto e riflette esattamente il
    // comportamento upstream (non un "fix" del tipo).
    expect(
      math.niceNumber(math.ensure_decimal(123) as unknown as math.NumbasNumber, {
        precisionType: "sigfig",
        precision: 1,
      })
    ).toBe("100");
  });
});

describe("Display > niceDecimal", () => {
  it("0", () => {
    expect(math.niceDecimal(new Decimal(0))).toBe("0");
  });
  it("1", () => {
    expect(math.niceDecimal(new Decimal(1))).toBe("1");
  });
  it("-1", () => {
    expect(math.niceDecimal(new Decimal(-1))).toBe("-1");
  });
  it("sqrt(2)", () => {
    expect(math.niceDecimal(new Decimal(2).squareRoot())).toBe("1.41421356237309504880168872420969807857");
  });
  it("sqrt(2) to 3 dp", () => {
    expect(math.niceDecimal(new Decimal(2).squareRoot(), { precisionType: "dp", precision: 3 })).toBe("1.414");
  });
  it("sqrt(2) to 3 sig figs", () => {
    expect(math.niceDecimal(new Decimal(2).squareRoot(), { precisionType: "sigfig", precision: 3 })).toBe("1.41");
  });
  it("123456789.12345 in eu style", () => {
    expect(math.niceDecimal(new Decimal("123456789.12345"), { style: "eu" })).toBe("123.456.789,12345");
  });
  it("123456789123456789123456789123456789.12345 in eu style", () => {
    expect(math.niceDecimal(new Decimal("123456789123456789123456789123456789.12345"), { style: "eu" })).toBe(
      "123.456.789.123.456.789.123.456.789.123.456.789,12345"
    );
  });
  it("2^100.5 (scientific)", () => {
    expect(math.niceDecimal(new Decimal(2).pow(100.5), { style: "scientific" })).toBe(
      "1.792728671193156477399422023278661496394e+30"
    );
  });
  it("2^100.5 (scientific, precision 4)", () => {
    expect(math.niceDecimal(new Decimal(2).pow(100.5), { style: "scientific", precision: 4 })).toBe("1.7927e+30");
  });
});

describe("Display > niceComplexDecimal", () => {
  function c(a: number, b: number) {
    return new math.ComplexDecimal(new Decimal(a), new Decimal(b));
  }
  it("1", () => {
    expect(math.niceComplexDecimal(c(1, 0))).toBe("1");
  });
  it("0", () => {
    expect(math.niceComplexDecimal(c(0, 0))).toBe("0");
  });
  it("-1", () => {
    expect(math.niceComplexDecimal(c(-1, 0))).toBe("-1");
  });
  it("i", () => {
    expect(math.niceComplexDecimal(c(0, 1))).toBe("i");
  });
  it("-i", () => {
    expect(math.niceComplexDecimal(c(0, -1))).toBe("-i");
  });
  it("1 + i", () => {
    expect(math.niceComplexDecimal(c(1, 1))).toBe("1 + i");
  });
  it("1 - i", () => {
    expect(math.niceComplexDecimal(c(1, -1))).toBe("1 - i");
  });
  it("2 + 2*i", () => {
    expect(math.niceComplexDecimal(c(2, 2))).toBe("2 + 2*i");
  });
  it("2 - 2*i", () => {
    expect(math.niceComplexDecimal(c(2, -2))).toBe("2 - 2*i");
  });
  it("4 + 5i in scientific style", () => {
    expect(math.niceComplexDecimal(c(4, 5), { style: "scientific" })).toBe("4e+0 + (5e+0)*i");
  });
});

describe("Display > Number notation styles", () => {
  type StyleCase = [string, string, number, string?];
  const tests: Record<string, StyleCase[]> = {
    en: [
      ["0", "0", 0],
      ["-0", "-0", 0, "0"],
      [" - 0", "-0", 0, "0"],
      ["1", "1", 1],
      ["0.1", "0.1", 0.1],
      ["123", "123", 123],
      ["1,234", "1234", 1234],
      ["1,234,567.89", "1234567.89", 1234567.89],
      ["-1,234.0", "-1234.0", -1234, "-1,234"],
      ["1,2,3", "1,2,3", NaN],
    ],
    "si-en": [
      ["0", "0", 0],
      ["-0", "-0", 0, "0"],
      ["1", "1", 1],
      ["0.1", "0.1", 0.1],
      ["123", "123", 123],
      ["1 234", "1234", 1234],
      ["1 234 567.89", "1234567.89", 1234567.89],
      ["-1 234.0", "-1234.0", -1234, "-1 234"],
      ["1 2 3", "1 2 3", NaN],
    ],
    eu: [
      ["0", "0", 0],
      ["-0", "-0", 0, "0"],
      ["1", "1", 1],
      ["0,1", "0.1", 0.1],
      ["123", "123", 123],
      ["1.234", "1234", 1234],
      ["1.234.567,89", "1234567.89", 1234567.89],
      ["-1.234,0", "-1234.0", -1234, "-1.234"],
      ["1.2.3", "1.2.3", NaN],
    ],
    "si-fr": [
      ["0", "0", 0],
      ["-0", "-0", 0, "0"],
      ["1", "1", 1],
      ["0,1", "0.1", 0.1],
      ["123", "123", 123],
      ["1 234", "1234", 1234],
      ["1 234 567,89", "1234567.89", 1234567.89],
      ["-1 234,0", "-1234.0", -1234, "-1 234"],
      ["1 2 3", "1 2 3", NaN],
    ],
    ch: [
      ["0", "0", 0],
      ["-0", "-0", 0, "0"],
      ["1", "1", 1],
      ["0.1", "0.1", 0.1],
      ["123", "123", 123],
      ["1'234", "1234", 1234],
      ["1'234'567.89", "1234567.89", 1234567.89],
      ["-1'234.0", "-1234.0", -1234, "-1'234"],
      ["1'2'3", "1'2'3", NaN],
    ],
    in: [
      ["0", "0", 0],
      ["-0", "-0", 0, "0"],
      ["1", "1", 1],
      ["0.1", "0.1", 0.1],
      ["123", "123", 123],
      ["1,234", "1234", 1234],
      ["12,34,567.89", "1234567.89", 1234567.89],
      ["1,23,456.78", "123456.78", 123456.78],
      ["-1,234.0", "-1234.0", -1234, "-1,234"],
      ["1,2,3", "1,2,3", NaN],
    ],
    scientific: [
      ["0e+0", "0", 0],
      ["1e+2", "100", 100],
      ["1.23e+2", "123", 123],
      ["1.23e-2", "0.0123", 0.0123],
      ["-9.1e+2", "-910", -910],
      ["1.234 567e+6", "1234567", 1.234567e6, "1.234567e+6"],
      ["315e6", "315000000", 315e6, "3.15e+8"],
      ["3.15e6", "3150000", 3.15e6, "3.15e+6"],
      ["315e-6", "0.000315", 315e-6, "3.15e-4"],
      ["3.15e-6", "0.00000315", 3.15e-6],
      ["3101e-2", "31.01", 3101e-2, "3.101e+1"],
      ["3101.2e-2", "31.012", 3101.2e-2, "3.1012e+1"],
      ["0.01e4", "100", 0.01e4, "1e+2"],
      ["0.00102e4", "10.2", 0.00102e4, "1.02e+1"],
      ["-2.222 222 2e+0", "-2.2222222", -2.2222222, "-2.2222222e+0"],
      ["1e-1", "0.1", 0.1, "1e-1"],
    ],
  };

  it("clean/parse/format sono coerenti per ogni stile e caso della tabella", () => {
    for (const style in tests) {
      tests[style]!.forEach((t) => {
        const [input, cleaned, value, formatted3] = t;
        expect(math.cleanNumber(input, style), `clean ${style} ${input}`).toBe(cleaned);
        const v = math.parseNumber(input, false, style);
        if (isNaN(value)) {
          expect(isNaN(v), `parse ${style} ${input}`).toBe(true);
        } else {
          // upstream: `assert.equal` usa `==` (non `Object.is`), quindi
          // `-0 == 0` è vero lì — `toBe` di vitest distinguerebbe -0 da 0.
          // eslint-disable-next-line eqeqeq -- replica `assert.equal` upstream
          expect(v == value, `parse ${style} ${input}`).toBe(true);
          const formatted = formatted3 === undefined ? input : formatted3;
          expect(math.niceNumber(value, { style }), `format ${style} ${value}`).toBe(formatted);
        }
      });
    }
  });

  it("123456 with strictStyle=false", () => {
    expect(math.parseNumber("123456", false, ["si-fr"], false)).toEqual(123456);
  });
  it("123 456 with strictStyle=true", () => {
    expect(math.parseNumber("123456", false, ["si-fr"], true)).toEqual(NaN);
  });
  it("1/2 with allowFractions and strictStyle=true", () => {
    expect(math.parseNumber("1/2", true, ["si-fr"], true)).toEqual(0.5);
  });
  it("-1/-2 with allowFractions", () => {
    expect(math.parseNumber("-1/-2", true)).toEqual(0.5);
  });
  it("infinity with strictStyle=true", () => {
    expect(math.parseNumber("infinity", false, ["si-fr"], true)).toEqual(Infinity);
  });
  it("-infinity with strictStyle=true", () => {
    expect(math.parseNumber("-infinity", false, ["si-fr"], true)).toEqual(-Infinity);
  });

  it("isNumber on fraction with strictStyle", () => {
    expect(math.isNumber("3/4", true, ["en"], true)).toBe(true);
  });
  it("isNumber on 3,000", () => {
    expect(math.isNumber("3,000", false, ["en", "en-si"], true)).toBe(true);
  });
  it("isNumber on 3,000 with only en-si", () => {
    expect(math.isNumber("3,000", false, ["en-si"], true)).toBe(false);
  });
});

// math.js:2214-2215 — primi 1000, corretti (§6.1 dell'inventario: il baco
// upstream concatenava 7207 e 7211 in un unico elemento 72077211).
it("primes: 1000 primi ordinati e corretti (divergenza dal baco 72077211)", () => {
  expect(math.primes).toHaveLength(1000);
  expect(math.primes.indexOf(7207)).toBeGreaterThan(-1);
  expect(math.primes.indexOf(7211)).toBe(math.primes.indexOf(7207) + 1);
  for (let i = 1; i < math.primes.length; i++) expect(math.primes[i]! > math.primes[i - 1]!).toBe(true);
  expect(math.primes_bigints.map(Number)).toEqual(math.primes);
});
