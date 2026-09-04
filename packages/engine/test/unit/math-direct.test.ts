// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Riscrittura a chiamata diretta (senza JME) delle assert di jme-tests.mjs
// che esercitano `Numbas.math`/`Numbas.util` attraverso `evaluate('f(a,b)')`:
// tradotto in `math.f(a, b)` con l'helper `closeEqual`/`deepCloseEqual`
// quando l'originale li usa, altrimenti un confronto diretto (`assert.equal`
// upstream → `expect(...).toBe/toEqual(...)`).
//
// Blocchi sorgente (righe di jme-tests.mjs): 'Number functions' (845-892,
// solo le righe con abs/sign — le altre righe di quel blocco usano
// vettori/liste/range/dec(), tipi JME fuori ambito qui, coperti dal Task 4
// via evaluate()), 'Rounding' (1036-1123, ceil/floor/round/trunc/fract/
// precround/siground), 'Currency' (1125-1132, esclusa l'assert su `.latex`,
// proprietà di un token JME), 'Number theory/combinatorics' (899-958) +
// 'Exponentials' (1174-1204, fact/root/sqrt/ln/log/exp, esclusi i due casi
// con dec() a 1189-1190), 'Trigonometry' (1206-1248, intera — nessun tipo
// JME), 'Range operations' (1335-1370, solo rangeToList — le assert con
// `except`/liste JME sono coperte dal Task 4 via evaluate()).
//
// 'Converting numbers to strings' (1134-1138) testa `tobinary`/`tooctal`/
// `tohexadecimal`, funzioni JME che non stanno in math.js (probabilmente
// jme-builtins.js, Task 4) — non portata qui. Il comportamento dp/sigfig di
// `niceNumber` richiesto dal brief per questa categoria è già coperto per
// intero da 'Display > niceNumber' in math-pure.test.ts (blocco QUnit
// 'niceNumber', 2236-2251) — nessuna assert aggiuntiva da portare.
//
// `divisors`/`factorise` non hanno un QUnit.test dedicato in jme-tests.mjs
// (verificato: nessuna occorrenza di `evaluate('divisors`/`evaluate('factorise`
// nel file) — i due test sotto usano l'esempio documentato nel JSDoc di
// math.js (n=210), non un'assert upstream portata 1:1.

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { closeEqual, deepCloseEqual } from "./math-helpers";
import { engineErrorKeys, errorMessageIn, MathError } from "../../src/errors";
import { it as itDict } from "../../src/i18n/it";
import { en as enDict } from "../../src/i18n/en";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Le chiavi d'errore che `src/math/` può lanciare, LETTE DAL SORGENTE.
 *
 * Si cercano i letterali che hanno la forma di una chiave upstream ovunque
 * compaiano, non solo dentro un `throw new MathError("...")`: `vectormath.ts`
 * passa la chiave ad `asVector` come parametro, e una lista scritta a mano
 * l'aveva mancata. */
function mathErrorKeysInSource(): string[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "math");
  const re = /"((?:math|matrixmath|vectormath|setmath|util)\.[^"\n]+)"/g;
  const keys = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts")) continue;
    const source = readFileSync(join(dir, name), "utf8");
    for (const m of source.matchAll(re)) {
      keys.add(m[1] as string);
    }
  }
  return [...keys].sort();
}

/** La prima chiave d'errore lanciata da `fn` (gli errori di `math/` portano la
 * chiave upstream in `err.key`, il messaggio è tradotto). */
function errorKey(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return engineErrorKeys(e)[0] ?? (e instanceof Error ? e.message : String(e));
  }
  return undefined;
}


describe("Number functions (abs, sign)", () => {
  it("abs(-5.4)", () => {
    closeEqual(math.abs(-5.4), 5.4, "abs(-5.4)");
  });
  it("abs(1+i)", () => {
    closeEqual(math.abs(math.complex(1, 1)), Math.sqrt(2), "abs(1+i)");
  });
  it("sign(54)", () => {
    closeEqual(math.sign(54), 1, "sign(54)");
  });
  it("sign(0.5)", () => {
    closeEqual(math.sign(0.5), 1, "sign(0.5)");
  });
  it("sign(0)", () => {
    closeEqual(math.sign(0), 0, "sign(0)");
  });
  it("sign(-43)", () => {
    closeEqual(math.sign(-43), -1, "sign(-43)");
  });
  it("sign(4-i)", () => {
    deepCloseEqual(math.sign(math.complex(4, -1)), math.complex(1, -1), "sign(4-i)");
  });
});

describe("Rounding > radians/ceil/floor/trunc/fract/round", () => {
  it("radians(0)", () => {
    closeEqual(math.radians(0), 0, "radians(0)");
  });
  it("radians(180)", () => {
    closeEqual(math.radians(180), Math.PI, "radians(180)");
  });
  it("radians(1080)", () => {
    closeEqual(math.radians(1080), 6 * Math.PI, "radians(1080)");
  });
  it("radians(90+360i)", () => {
    deepCloseEqual(math.radians(math.complex(90, 360)), math.complex(Math.PI / 2, 2 * Math.PI), "radians(90+360i)");
  });

  it("ceil(0.1)", () => {
    closeEqual(math.ceil(0.1), 1, "ceil(0.1)");
  });
  it("ceil(532.9)", () => {
    closeEqual(math.ceil(532.9), 533, "ceil(532.9)");
  });
  it("ceil(0)", () => {
    closeEqual(math.ceil(0), 0, "ceil(0)");
  });
  it("ceil(-14.6)", () => {
    closeEqual(math.ceil(-14.6), -14, "ceil(-14.6)");
  });
  it("ceil(1.7-2.3i)", () => {
    deepCloseEqual(math.ceil(math.complex(1.7, -2.3)), math.complex(2, -2), "ceil(1.7-2.3i)");
  });

  it("floor(0.1)", () => {
    closeEqual(math.floor(0.1), 0, "floor(0.1)");
  });
  it("floor(532.9)", () => {
    closeEqual(math.floor(532.9), 532, "floor(532.9)");
  });
  it("floor(0)", () => {
    closeEqual(math.floor(0), 0, "floor(0)");
  });
  it("floor(-14.6)", () => {
    closeEqual(math.floor(-14.6), -15, "floor(-14.6)");
  });
  it("floor(1.2i)", () => {
    deepCloseEqual(math.floor(math.complex(0, 1.2)), math.complex(0, 1), "floor(1.2i)");
  });

  it("trunc(0)", () => {
    closeEqual(math.trunc(0), 0, "trunc(0)");
  });
  it("trunc(5)", () => {
    closeEqual(math.trunc(5), 5, "trunc(5)");
  });
  it("trunc(14.3)", () => {
    closeEqual(math.trunc(14.3), 14, "trunc(14.3)");
  });
  it("trunc(-4.76)", () => {
    closeEqual(math.trunc(-4.76), -4, "trunc(-4.76)");
  });
  it("trunc(0.5+4.75i)", () => {
    deepCloseEqual(math.trunc(math.complex(0.5, 4.75)), math.complex(0, 4), "trunc(0.5+4.75i)");
  });
  it("trunc(5.1264,2)", () => {
    closeEqual(math.trunc(5.1264, 2), 5.12, "trunc(5.1264,2)");
  });
  it("trunc(-5.1264,2)", () => {
    closeEqual(math.trunc(-5.1264, 2), -5.12, "trunc(-5.1264,2)");
  });

  it("fract(0)", () => {
    closeEqual(math.fract(0), 0, "fract(0)");
  });
  it("fract(5)", () => {
    closeEqual(math.fract(5), 0, "fract(5)");
  });
  it("fract(14.3)", () => {
    closeEqual(math.fract(14.3), 0.3, "fract(14.3)");
  });
  it("fract(-4.76)", () => {
    closeEqual(math.fract(-4.76), -0.76, "fract(-4.76)");
  });
  it("fract(0.5+4.75i)", () => {
    deepCloseEqual(math.fract(math.complex(0.5, 4.75)), math.complex(0.5, 0.75), "fract(0.5+4.75i)");
  });

  it("round(0)", () => {
    closeEqual(math.round(0), 0, "round(0)");
  });
  it("round(12321)", () => {
    closeEqual(math.round(12321), 12321, "round(12321)");
  });
  it("round(1.4)", () => {
    closeEqual(math.round(1.4), 1, "round(1.4)");
  });
  it("round(4.9)", () => {
    closeEqual(math.round(4.9), 5, "round(4.9)");
  });
  it("round(11.5)", () => {
    closeEqual(math.round(11.5), 12, "round(11.5)");
  });
  it("round(-3.2)", () => {
    closeEqual(math.round(-3.2), -3, "round(-3.2)");
  });
  it("round(-3.5)", () => {
    closeEqual(math.round(-3.5), -3, "round(-3.5)");
  });
  it("round(-50)", () => {
    closeEqual(math.round(-50), -50, "round(-50)");
  });
  it("round(1.4-6.7i)", () => {
    deepCloseEqual(math.round(math.complex(1.4, -6.7)), math.complex(1, -7), "round(1.4-6.7i)");
  });

  it("trunc/floor/ceil/fract su una tabella di frazioni", () => {
    // upstream valuta 'trunc(1/3)' ecc. via JME (divisione fra numeri
    // reali): equivalente a una divisione JS diretta, portata come tale.
    const fractions: [number, number, number, number, number][] = [
      [0 / 1, 0, 0, 0, 0 / 1],
      [1 / 3, 0, 0, 1, 1 / 3],
      [-1 / 3, 0, -1, 0, -1 / 3],
      [3 / 3, 1, 1, 1, 0 / 3],
      [-3 / 3, -1, -1, -1, -0 / 3],
      [4 / 3, 1, 1, 2, 1 / 3],
      [-4 / 3, -1, -2, -1, -1 / 3],
    ];
    fractions.forEach(([expr, t, f, c, fr]) => {
      // eslint-disable-next-line eqeqeq -- replica assert.equal upstream (-0 == 0)
      expect(math.trunc(expr) == t, `trunc(${expr})`).toBe(true);
      // eslint-disable-next-line eqeqeq
      expect(math.floor(expr) == f, `floor(${expr})`).toBe(true);
      // eslint-disable-next-line eqeqeq
      expect(math.ceil(expr) == c, `ceil(${expr})`).toBe(true);
      deepCloseEqual(math.fract(expr), fr, `fract(${expr})`);
    });
  });

  it("precround: casi limite (math.js:1160-1198)", () => {
    expect(
      math.precround(1.1234567891011121314151617181920, 0),
      "precround(1.1234567891011121314151617181920,0) - round to integer"
    ).toBe(1);
    expect(
      math.precround(1.1234567891011121314151617181920, 1),
      "precround(1.1234567891011121314151617181920,1) - round to 1 d.p."
    ).toBe(1.1);
    expect(
      math.precround(1.1234567891011121314151617181920, 5),
      "precround(...,5) - round to 5 d.p. - should round up"
    ).toBe(1.12346);
    expect(math.precround(1.1234567891011121314151617181920, 20), "precround(...,20)").toBe(1.12345678910111213142);
    expect(math.precround(1.9999, 3), "precround(1.9999,3) - round to 3 dp results in integer").toBe(2);
    expect(
      math.precround(-132.6545, 3),
      "precround(-132.6545,3) - round on 5 in negative number rounds up"
    ).toBe(-132.654);
    expect(
      math.precround(123456789012, 8),
      "precround(123456789012,8) - only multiply fractional part, to get better precision"
    ).toBe(123456789012);
    expect(
      math.precround(4 + 488 / 1000, 3),
      "precround(4+488/1000,3) - try not to add floating point error in the middle of precround"
    ).toBe(4.488);
    expect(math.precround(0.05, 2), "precround(0.05,2)").toBe(0.05);
    expect(math.precround(-0.05, 2), "precround(-0.05,2)").toBe(-0.05);
    expect(math.precround(-2.51, 0), "precround(-2.51,0)").toBe(-3);

    // I due casi limite citati esplicitamente dal brief del Task 1.
    expect(math.precround(237.55749999999998, 3), "precround(237.55749999999998,3)==237.558").toBe(237.558);
    expect(math.precround(237.55748999999998, 3), "precround(237.55748999999998,3)==237.557").toBe(237.557);
    expect(math.precround(-237.55750000000001, 3), "precround(-237.55750000000001,3)==-237.557").toBe(-237.557);
    expect(math.precround(-237.55751000000001, 3), "precround(-237.55751000000001,3)==-237.558").toBe(-237.558);
  });

  it("siground: casi limite (math.js:1263-1282)", () => {
    expect(math.siground(0.123, 2), "siground(0.123,2)").toBe(0.12);
    expect(math.siground(123456.123456, 3), "siground(123456.123456,3)").toBe(123000);
    expect(math.siground(-32.45, 3), "siground(-32.45,3)").toBe(-32.5);
    expect(math.siground(-32452, 2), "siground(-32452,2)").toBe(-32000);
    expect(math.siground(-2.51, 1), "siground(-2.51,1)").toBe(-3);
    expect(math.siground(14515200, 3), "siground(14515200,3)").toBe(14500000);
    expect(math.siground(Math.cos(Math.PI / 2), 3), "siground(cos(pi/2))").toBe(0);
  });
});

describe("Currency", () => {
  it('currency(2.01,"£","p")', () => {
    expect(math.currency(2.01, "£", "p")).toBe("£2.01");
  });
  it('currency(2.00001,"£","p")', () => {
    expect(math.currency(2.00001, "£", "p")).toBe("£2");
  });
  it('currency(2.999,"£","p")', () => {
    expect(math.currency(2.999, "£", "p")).toBe("£3");
  });
  it('currency(0.999,"£","p")', () => {
    expect(math.currency(0.999, "£", "p")).toBe("£1");
  });
  it('currency(0.99,"£","p")', () => {
    expect(math.currency(0.99, "£", "p")).toBe("99p");
  });
});

describe("Number theory/combinatorics", () => {
  it("mod(0,0)", () => {
    deepCloseEqual(math.mod(0, 0), NaN, "mod(0,0)");
  });
  it("mod(5,0)", () => {
    deepCloseEqual(math.mod(5, 0), NaN, "mod(5,0)");
  });
  it("mod(13,2)", () => {
    closeEqual(math.mod(13, 2), 1, "mod(13,2)");
  });
  it("mod(4.765,3)", () => {
    closeEqual(math.mod(4.765, 3), 1.765, "mod(4.765,3)");
  });
  it("mod(-13,6)", () => {
    closeEqual(math.mod(-13, 6), 5, "mod(-13,6)");
  });
  it("mod(2.4,1.1)", () => {
    closeEqual(math.mod(2.4, 1.1), 0.2, "mod(2.4,1.1)");
  });

  it("perm(5,4)", () => {
    closeEqual(math.permutations(5, 4), 120n, "perm(5,4)");
  });
  it("perm(6,1)", () => {
    closeEqual(math.permutations(6, 1), 6n, "perm(6,1)");
  });
  it("perm(2,3) - n less than k", () => {
    expect(errorKey(() => math.permutations(2, 3))).toBe("math.permutations.n less than k");
  });
  it("perm(-2,3) - n less than zero", () => {
    expect(errorKey(() => math.permutations(-2, 3))).toBe("math.permutations.n less than zero");
  });
  it("perm(2,-3) - k less than zero", () => {
    expect(errorKey(() => math.permutations(2, -3))).toBe("math.permutations.k less than zero");
  });
  it("perm(i,1) - complex", () => {
    expect(errorKey(() => math.permutations(math.complex(0, 1), 1))).toBe("math.permutations.complex");
  });
  it("perm(1,i) - complex", () => {
    expect(errorKey(() => math.permutations(1, math.complex(0, 1)))).toBe("math.permutations.complex");
  });

  it("comb(5,4)", () => {
    closeEqual(math.combinations(5, 4), 5n, "comb(5,4)");
  });
  it("comb(6,1)", () => {
    closeEqual(math.combinations(6, 1), 6n, "comb(6,1)");
  });
  it("comb(7,3)", () => {
    closeEqual(math.combinations(7, 3), 35n, "comb(7,3)");
  });
  it("comb(2,3) - n less than k", () => {
    expect(errorKey(() => math.combinations(2, 3))).toBe("math.combinations.n less than k");
  });
  it("comb(-2,3) - n less than zero", () => {
    expect(errorKey(() => math.combinations(-2, 3))).toBe("math.combinations.n less than zero");
  });
  it("comb(2,-3) - k less than zero", () => {
    expect(errorKey(() => math.combinations(2, -3))).toBe("math.combinations.k less than zero");
  });
  it("comb(i,1) - complex", () => {
    expect(errorKey(() => math.combinations(math.complex(0, 1), 1))).toBe("math.combinations.complex");
  });
  it("comb(1,i) - complex", () => {
    expect(errorKey(() => math.combinations(1, math.complex(0, 1)))).toBe("math.combinations.complex");
  });

  // Nota su bigint/number: `Numbas.math.gcd` ritorna `bigint` o `number` a
  // seconda del *tipo di ingresso originale* (§ codice, non "ripulito" —
  // vedi §6.7/decisione 7). Le assert upstream `.type=='integer'/'number'`
  // testano il token JME risultante da `evaluate('gcd(...)')`, che dipende
  // anche da come il tokenizer JME rappresenta i letterali interi (Task 2) —
  // fuori scope qui: si verifica solo il VALORE, con lo stesso tipo
  // (bigint/number) che `Numbas.math.gcd` produce per argomenti `number`
  // puri (non gli interi "esatti" che il tokenizer JME passerebbe).
  it("gcd(36,15)", () => {
    closeEqual(math.gcd(36, 15), 3, "gcd(36,15)");
  });
  it("gcd(1.1,15)", () => {
    closeEqual(math.gcd(1.1, 15), 1n, "gcd(1.1,15)");
  });
  it("gcd(-60,18)", () => {
    closeEqual(math.gcd(-60, 18), 6, "gcd(-60,18)");
  });
  it("gcd(60,-18)", () => {
    closeEqual(math.gcd(60, -18), 6, "gcd(60,-18)");
  });
  it("gcd(0,3)", () => {
    // upstream: il ramo `b==0n` ritorna sempre un bigint, anche con
    // argomenti `number` (§6.7 del report, non "raddrizzato").
    closeEqual(math.gcd(0, 3), 3n, "gcd(0,3)");
  });
  it("gcd(0,-3)", () => {
    closeEqual(math.gcd(0, -3), 3n, "gcd(0,-3)");
  });
  it("gcd(3,0)", () => {
    closeEqual(math.gcd(3, 0), 3n, "gcd(3,0)");
  });
  it("gcd(infinity,15)", () => {
    closeEqual(math.gcd(Infinity, 15), 1n, "gcd(infinity,15)");
  });
  it("gcd(2i,4) - complex", () => {
    expect(errorKey(() => math.gcd(math.complex(0, 2), 4))).toBe("math.gcf.complex");
  });

  it("coprime(2,3)", () => {
    expect(math.coprime(2, 3)).toBe(true);
  });
  it("coprime(2,-3)", () => {
    expect(math.coprime(2, -3)).toBe(true);
  });
  it("coprime(2,i)", () => {
    expect(math.coprime(2, math.complex(0, 1))).toBe(true);
  });
  it("coprime(2,4)", () => {
    expect(math.coprime(2, 4)).toBe(false);
  });
  it("coprime(2,-4)", () => {
    expect(math.coprime(2, -4)).toBe(false);
  });
  it("coprime(1,3)", () => {
    expect(math.coprime(1, 3)).toBe(true);
  });
  it("coprime(1,1)", () => {
    expect(math.coprime(1, 1)).toBe(true);
  });

  it("lcm(3,7)", () => {
    closeEqual(math.lcm(3, 7), 21, "lcm(3,7)");
  });
  it("lcm(4,6)", () => {
    closeEqual(math.lcm(4, 6), 12, "lcm(4,6)");
  });
  it("lcm(-10,35)", () => {
    closeEqual(math.lcm(-10, 35), 70, "lcm(-10,35)");
  });
  it("lcm(2,i) - complex", () => {
    expect(errorKey(() => math.lcm(2, math.complex(0, 1)))).toBe("math.lcm.complex");
  });

  it("0|1 (divides)", () => {
    expect(math.divides(0, 1)).toBe(false);
  });
  it("5|25 (divides)", () => {
    expect(math.divides(5, 25)).toBe(true);
  });
  it("6|42 (divides)", () => {
    expect(math.divides(6, 42)).toBe(true);
  });
  it("4|42 (divides)", () => {
    expect(math.divides(4, 42)).toBe(false);
  });
  it("-4|40 (divides)", () => {
    expect(math.divides(-4, 40)).toBe(true);
  });
  it("4|-40 (divides)", () => {
    expect(math.divides(4, -40)).toBe(true);
  });
  it("i|2i (divides)", () => {
    expect(math.divides(math.complex(0, 1), math.complex(0, 2))).toBe(false);
  });

  it("fact(0)", () => {
    closeEqual(math.factorial(0), 1n, "fact(0)");
  });
  it("fact(1)", () => {
    closeEqual(math.factorial(1), 1n, "fact(1)");
  });
  it("fact(6)", () => {
    closeEqual(math.factorial(6), 720n, "fact(6)");
  });
  it("fact(1/2)", () => {
    closeEqual(math.factorial(1 / 2), 0.8862269255, "fact(1/2)");
  });
  it("fact(-3/2)", () => {
    closeEqual(math.factorial(-3 / 2), -3.5449077018, "fact(-3/2)");
  });
  it("fact(i)", () => {
    deepCloseEqual(math.factorial(math.complex(0, 1)), math.complex(0.4980156681, -0.1549498283), "fact(i)");
  });

  // Nessun QUnit.test upstream esercita `divisors`/`factorise` (verificato):
  // i due casi sotto vengono dall'esempio nel JSDoc di math.js (n=210).
  it("divisors(210) — esempio dal JSDoc di math.js", () => {
    expect(math.divisors(210).map(Number).sort((a, b) => a - b)).toEqual(
      [1, 2, 3, 5, 6, 7, 10, 14, 15, 21, 30, 35, 42, 70, 105, 210].sort((a, b) => a - b)
    );
  });
  it("factorise(210) = [1,1,1,1] (2*3*5*7)", () => {
    expect(math.factorise(210).map(Number)).toEqual([1, 1, 1, 1]);
  });

  // Fix round 1, issue 1: `divisors` deve fattorizzare lo stesso valore
  // normalizzato usato per la guardia (`ensure_bigint`, che arrotonda),
  // non l'argomento originale rifattorizzato con `Math.floor` — i due
  // arrotondamenti divergono per input non interi (math.js:2222-2231).
  it("divisors(10.5) = [1n, 11n] (ensure_bigint arrotonda 10.5 a 11, non a 10)", () => {
    expect(math.divisors(10.5)).toEqual([1n, 11n]);
  });
  it("divisors(1.5) = [1n, 2n] (ensure_bigint arrotonda 1.5 a 2, non a 1)", () => {
    expect(math.divisors(1.5)).toEqual([1n, 2n]);
  });
});

describe("Exponentials", () => {
  it("sqrt(2)", () => {
    closeEqual(math.sqrt(2), Math.sqrt(2), "sqrt(2)");
  });
  it("sqrt(-1)", () => {
    deepCloseEqual(math.sqrt(-1), math.complex(0, 1), "sqrt(-1)");
  });
  it("sqrt(-49)", () => {
    deepCloseEqual(math.sqrt(-49), math.complex(0, 7), "sqrt(-49)");
  });
  it("sqrt(1+2i)", () => {
    deepCloseEqual(
      math.sqrt(math.complex(1, 2)),
      math.complex(1.272019649514068964, 0.786151377757423286069),
      "sqrt(1+2i)"
    );
  });

  it("ln(e)", () => {
    closeEqual(math.log(Math.E), 1, "ln(e)");
  });
  it("ln(1)", () => {
    closeEqual(math.log(1), 0, "ln(1)");
  });
  it("ln(-2)", () => {
    deepCloseEqual(math.log(-2), math.complex(Math.log(2), Math.PI), "ln(-2)");
  });
  it("ln(2+i)", () => {
    deepCloseEqual(
      math.log(math.complex(2, 1)),
      math.complex(Math.log(Math.sqrt(5)), Math.atan(0.5)),
      "ln(2+i)"
    );
  });
  it("log(10)", () => {
    closeEqual(math.log10(10), 1, "log(10)");
  });
  it("log(2+i)", () => {
    deepCloseEqual(
      math.log10(math.complex(2, 1)),
      math.complex(Math.LOG10E * Math.log(Math.sqrt(5)), Math.LOG10E * Math.atan(0.5)),
      "log(2+i)"
    );
  });
  it("exp(5)", () => {
    closeEqual(math.exp(5), Math.exp(5), "exp(5)");
  });
  it("exp(-2)", () => {
    closeEqual(math.exp(-2), Math.exp(-2), "exp(-2)");
  });
  it("exp(4-i)", () => {
    deepCloseEqual(
      math.exp(math.complex(4, -1)),
      math.complex(Math.exp(4) * Math.cos(-1), Math.exp(4) * Math.sin(-1)),
      "exp(4-i)"
    );
  });

  it("root(8,3)", () => {
    closeEqual(math.root(8, 3), 2, "root(8,3)");
  });
  it("root(-27,3)", () => {
    deepCloseEqual(math.root(-27, 3), -3, "root(-27,3)");
  });
  it("root(-81,4)", () => {
    deepCloseEqual(
      math.root(-81, 4),
      math.complex(Math.cos(Math.PI / 4) * 3, Math.sin(Math.PI / 4) * 3),
      "root(-81,4)"
    );
  });
  it("root(4,1.2)", () => {
    closeEqual(math.root(4, 1.2), 3.174802103936399, "root(4,1.2)");
  });
  it("root(i,-2)", () => {
    deepCloseEqual(
      math.root(math.complex(0, 1), -2),
      math.complex(0.7071067811865476, -0.7071067811865476),
      "root(i,-2)"
    );
  });
});

describe("Trigonometry", () => {
  it("sin(0)", () => {
    closeEqual(math.sin(0), 0, "sin(0)");
  });
  it("sin(pi/2)", () => {
    closeEqual(math.sin(Math.PI / 2), 1, "sin(pi/2)");
  });
  it("sin(i)", () => {
    deepCloseEqual(math.sin(math.complex(0, 1)), math.complex(0, 1.175201193643801456882381), "sin(i)");
  });
  it("cos(0)", () => {
    closeEqual(math.cos(0), 1, "cos(0)");
  });
  it("cos(pi/2)", () => {
    closeEqual(math.cos(Math.PI / 2), 0, "cos(pi/2)");
  });
  it("cos(i)", () => {
    closeEqual(math.cos(math.complex(0, 1)), 1.5430806348152437784779, "cos(i)");
  });

  it("tan(0)", () => {
    closeEqual(math.tan(0), 0, "tan(0)");
  });
  it("tan(pi/4)", () => {
    closeEqual(math.tan(Math.PI / 4), 1, "tan(pi/4)");
  });
  it("tan(i)", () => {
    deepCloseEqual(math.tan(math.complex(0, 1)), math.complex(0, 0.761594155955764888), "tan(i)");
  });

  it("cosec(pi/4)", () => {
    closeEqual(math.cosec(Math.PI / 4), Math.sqrt(2), "cosec(pi/4)");
  });
  it("cosec(i)", () => {
    deepCloseEqual(math.cosec(math.complex(0, 1)), math.complex(0, -0.850918128239321545133), "cosec(i)");
  });
  it("sec(pi/4)", () => {
    closeEqual(math.sec(Math.PI / 4), Math.sqrt(2), "sec(pi/4)");
  });
  it("sec(i)", () => {
    closeEqual(math.sec(math.complex(0, 1)), 1 / 1.5430806348152437784779, "sec(i)");
  });
  it("cot(1)", () => {
    closeEqual(math.cot(1), 0.6420926159343307, "cot(1)");
  });
  it("cot(i)", () => {
    deepCloseEqual(math.cot(math.complex(0, 1)), math.complex(0, -1.313035285499331303), "cot(i)");
  });

  it("arcsin(0.5)", () => {
    closeEqual(math.arcsin(0.5), Math.PI / 6, "arcsin(0.5)");
  });
  it("arcsin(i*sinh(1))", () => {
    deepCloseEqual(
      math.arcsin(math.mul(math.complex(0, 1), math.sinh(1))),
      math.complex(0, 1),
      "arcsin(i*sinh(1))"
    );
  });
  it("arcsin(2)", () => {
    deepCloseEqual(math.arcsin(2), math.complex(1.5707963267948966, -1.31695789692481), "arcsin(2)");
  });
  it("arccos(0.5)", () => {
    closeEqual(math.arccos(0.5), Math.PI / 3, "arccos(0.5)");
  });
  it("arccos(cosh(1))", () => {
    deepCloseEqual(math.arccos(math.cosh(1)), math.complex(0, 1), "arccos(cosh(1))");
  });
  it("arctan(1/sqrt(3))", () => {
    closeEqual(math.arctan(1 / Math.sqrt(3)), Math.PI / 6, "arctan(1/sqrt(3))");
  });
  it("arctan(i*tanh(1))", () => {
    deepCloseEqual(
      math.arctan(math.mul(math.complex(0, 1), math.tanh(1))),
      math.complex(0, 1),
      "arctan(i*tanh(1))"
    );
  });

  it("sinh(1)", () => {
    closeEqual(math.sinh(1), Math.E / 2 - 1 / (2 * Math.E), "sinh(1)");
  });
  it("sinh(ln(2))", () => {
    closeEqual(math.sinh(math.log(2)), 3 / 4, "sinh(ln(2))");
  });
  it("sinh(2i)", () => {
    deepCloseEqual(math.sinh(math.complex(0, 2)), math.complex(0, Math.sin(2)), "sinh(2i)");
  });
  it("cosh(1)", () => {
    closeEqual(math.cosh(1), Math.E / 2 + 1 / (2 * Math.E), "cosh(1)");
  });
  it("cosh(ln(3))", () => {
    closeEqual(math.cosh(math.log(3)), 5 / 3, "cosh(ln(3))");
  });
  it("cosh(-i)", () => {
    closeEqual(math.cosh(math.complex(0, -1)), Math.cos(1), "cosh(-i)");
  });
  it("tanh(1)", () => {
    closeEqual(math.tanh(1), 0.7615941559557648, "tanh(1)");
  });
  it("tanh(ln(5))", () => {
    closeEqual(math.tanh(math.log(5)), 12 / 13, "tanh(ln(5))");
  });
  it("tanh(1+i)", () => {
    deepCloseEqual(
      math.tanh(math.complex(1, 1)),
      math.complex(1.08392332733869454, 0.27175258531951171652),
      "tanh(1+i)"
    );
  });
  it("cosech(ln(3))", () => {
    closeEqual(math.cosech(math.log(3)), 3 / 4, "cosech(ln(3))");
  });
  it("sech(ln(2))", () => {
    closeEqual(math.sech(math.log(2)), 4 / 5, "sech(ln(2))");
  });
  it("coth(5)", () => {
    closeEqual(math.coth(5), 1.000090803982019, "coth(5)");
  });
  it("arcsinh(7)", () => {
    closeEqual(math.arcsinh(7), 2.644120761058629075, "arcsinh(7)");
  });
  it("arccosh(8)", () => {
    closeEqual(math.arccosh(8), 2.7686593833135738, "arccosh(8)");
  });
  it("arctanh(1+i)", () => {
    deepCloseEqual(
      math.arctanh(math.complex(1, 1)),
      math.complex(0.40235947810852507, 1.0172219678978514),
      "arctanh(1+i)"
    );
  });
});

describe("Range operations (rangeToList, rangeSize)", () => {
  it("list(1..5)", () => {
    deepCloseEqual(math.rangeToList([1, 5, 1]), [1, 2, 3, 4, 5], "list(1..5)");
  });
  it("list(1..7#2)", () => {
    deepCloseEqual(math.rangeToList([1, 7, 2]), [1, 3, 5, 7], "list(1..7#2)");
  });
  it("list(-2..3#2)", () => {
    deepCloseEqual(math.rangeToList([-2, 3, 2]), [-2, 0, 2], "list(-2..3#2)");
  });
  it("list(100..102#1/3) — don't accumulate rounding error", () => {
    deepCloseEqual(
      math.rangeToList([100, 102, 1 / 3]),
      [100, 100 + 1 / 3, 100 + 2 / 3, 101, 101 + 1 / 3, 101 + 2 / 3, 102],
      "list(100..102#1/3)"
    );
  });
  it("list(6..1#-1)", () => {
    deepCloseEqual(math.rangeToList([6, 1, -1]), [6, 5, 4, 3, 2, 1], "list(6..1#-1)");
  });

  // `rangeSize` non ha un'assert diretta upstream (`min(1..1000)`/
  // `max(1..1000)` passano per il builtin JME, non per `math.rangeSize`);
  // qui si verifica che coincida con la lunghezza di `rangeToList` sugli
  // stessi range della tabella sopra.
  it("rangeSize coincide con la lunghezza di rangeToList", () => {
    const ranges: [number, number, number][] = [
      [1, 5, 1],
      [1, 7, 2],
      [-2, 3, 2],
      [6, 1, -1],
    ];
    ranges.forEach((r) => {
      expect(math.rangeSize(r), JSON.stringify(r)).toBe(math.rangeToList(r).length);
    });
  });
});

// Fix round 1 (review), issue 3: le tre divergenze annotate in
// DIVERGENCES.md/§6.9 dell'inventario per `Fraction`, `setmath` e
// `row_echelon_form`/`reduced_row_echelon_form` non avevano copertura
// diretta — nessuna di queste è un porting di un blocco QUnit upstream
// (Fraction/setmath a valori grezzi non sono mai testati isolatamente in
// jme-tests.mjs, e la non-mutazione delle due funzioni di riduzione era
// coperta solo indirettamente tramite `matrixmath.gauss_jordan_elimination`
// in math-pure.test.ts). Le sezioni sotto colmano il vuoto.

describe("Fraction (classe, math.js:2364-2596)", () => {
  it("new Fraction(NaN) lancia RangeError (denominatore di default è bigint: il loop di raddoppio non parte, ma ensure_bigint(NaN) fallisce comunque)", () => {
    expect(() => new math.Fraction(NaN)).toThrow(RangeError);
  });
  it("new Fraction(NaN, 1) lancia il RangeError del limite di 64 raddoppi (entrambi gli argomenti sono number, il loop upstream sarebbe infinito)", () => {
    expect(() => new math.Fraction(NaN, 1)).toThrow(
      "Fraction: numeratore o denominatore non convertibile a intero"
    );
  });

  it("new Fraction(1,3).add(new Fraction(1,6)) == 1/2", () => {
    const sum = new math.Fraction(1, 3).add(new math.Fraction(1, 6));
    expect(sum.numerator).toBe(1);
    expect(sum.denominator).toBe(2);
  });
  it("new Fraction(2,3).multiply(new Fraction(3,4)) == 1/2", () => {
    const prod = new math.Fraction(2, 3).multiply(new math.Fraction(3, 4));
    expect(prod.numerator).toBe(1);
    expect(prod.denominator).toBe(2);
  });
  it("new Fraction(1,2).subtract(new Fraction(1,3)) == 1/6", () => {
    const diff = new math.Fraction(1, 2).subtract(new math.Fraction(1, 3));
    expect(diff.numerator).toBe(1);
    expect(diff.denominator).toBe(6);
  });

  it("Fraction.common_denominator([1/2, 1/3]) riscrive entrambe su denominatore 6", () => {
    const [a, b] = math.Fraction.common_denominator([new math.Fraction(1, 2), new math.Fraction(1, 3)]);
    expect(a!.denominator).toBe(6);
    expect(a!.numerator).toBe(3);
    expect(b!.denominator).toBe(6);
    expect(b!.numerator).toBe(2);
    // Le frazioni originali non sono ridotte da common_denominator, ma il
    // valore rappresentato deve restare lo stesso di 1/2 e 1/3.
    expect(a!.toFloat()).toBeCloseTo(1 / 2, 12);
    expect(b!.toFloat()).toBeCloseTo(1 / 3, 12);
  });
});

describe("setmath (set.ts, math.js:3759-3834, a valori grezzi con eq iniettabile)", () => {
  it("contains su numeri", () => {
    expect(math.setmath.contains([1, 2, 3], 2)).toBe(true);
    expect(math.setmath.contains([1, 2, 3], 4)).toBe(false);
  });
  it("contains su array annidati (objects_equal di default confronta in profondità)", () => {
    expect(
      math.setmath.contains(
        [
          [1, 2],
          [3, 4],
        ],
        [1, 2]
      )
    ).toBe(true);
    expect(
      math.setmath.contains(
        [
          [1, 2],
          [3, 4],
        ],
        [1, 3]
      )
    ).toBe(false);
  });

  it("union su numeri (dedup preservando l'ordine di a poi i nuovi di b)", () => {
    expect(math.setmath.union([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });
  it("union su array annidati", () => {
    expect(math.setmath.union([[1, 2]], [[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });

  it("intersection su numeri", () => {
    expect(math.setmath.intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });
  it("intersection su array annidati", () => {
    expect(math.setmath.intersection([[1, 2], [3, 4]], [[3, 4], [5, 6]])).toEqual([[3, 4]]);
  });

  it("minus su numeri", () => {
    expect(math.setmath.minus([1, 2, 3], [2])).toEqual([1, 3]);
  });
  it("minus su array annidati", () => {
    expect(math.setmath.minus([[1, 2], [3, 4]], [[1, 2]])).toEqual([[3, 4]]);
  });

  it("eq: stessa lunghezza e stessa intersezione", () => {
    expect(math.setmath.eq([1, 2], [2, 1])).toBe(true);
    expect(math.setmath.eq([1, 2], [1, 3])).toBe(false);
    expect(math.setmath.eq([1, 2, 2], [1, 2])).toBe(false);
  });

  it("size", () => {
    expect(math.setmath.size([1, 2, 3])).toBe(3);
    expect(math.setmath.size([])).toBe(0);
  });

  it("eq iniettabile: confronto case-insensitive su stringhe", () => {
    const caseInsensitiveEq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    expect(math.setmath.contains(["Alice", "Bob"], "ALICE", caseInsensitiveEq)).toBe(true);
    expect(math.setmath.contains(["Alice", "Bob"], "alice")).toBe(false); // default eq: case-sensitive
    expect(math.setmath.union(["Alice"], ["ALICE", "Bob"], caseInsensitiveEq)).toEqual(["Alice", "Bob"]);
    expect(math.setmath.eq(["Alice", "Bob"], ["ALICE", "BOB"], caseInsensitiveEq)).toBe(true);
  });
});

describe("matrixmath.row_echelon_form/reduced_row_echelon_form non mutano l'input", () => {
  it("row_echelon_form non muta la fraction_matrix passata", () => {
    const m = math.makeMatrix([
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
    ]);
    const fm = math.matrixmath.fraction_matrix(m);
    const before = fm.map((row) => row.map((c) => c.toString()));
    math.matrixmath.row_echelon_form(fm);
    const after = fm.map((row) => row.map((c) => c.toString()));
    expect(after).toEqual(before);
  });

  it("reduced_row_echelon_form non muta la fraction_matrix passata", () => {
    const m = math.makeMatrix([
      [1, 0],
      [0, 1],
      [2, 3],
    ]);
    const fm = math.matrixmath.fraction_matrix(m);
    const before = fm.map((row) => row.map((c) => c.toString()));
    math.matrixmath.reduced_row_echelon_form(fm);
    const after = fm.map((row) => row.map((c) => c.toString()));
    expect(after).toEqual(before);
  });
});

// Il contratto degli errori di `math/`: chiave upstream stabile, messaggio
// tradotto in entrambe le lingue, riconosciuto dall'accessore delle chiavi.
// Prima erano `new Error("<chiave>")`, cioè la chiave grezza come messaggio:
// non stava in nessun catalogo, `engineErrorKeys` non la vedeva, e quel testo
// poteva arrivare fino al feedback dello studente (parts/adaptive-marking.ts).
describe("Errori di math/", () => {
  it("portano la chiave upstream e un messaggio tradotto", () => {
    let caught: unknown;
    try {
      math.matrixmath.mul(math.makeMatrix([[1, 2]]), math.makeMatrix([[1], [2], [3]]));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MathError);
    expect(engineErrorKeys(caught)).toEqual(["matrixmath.mul.different sizes"]);
    // il messaggio non è più la chiave grezza
    expect((caught as Error).message).not.toContain("matrixmath.mul");
    expect(errorMessageIn(caught, "en")).toBe("Can't multiply matrices of different sizes.");
    expect(errorMessageIn(caught, "it")).toBe("Non posso moltiplicare matrici di dimensioni diverse.");
  });

  it("interpolano i parametri come upstream", () => {
    let caught: unknown;
    try {
      math.random_integer_partition(3, 5, () => 0.5);
    } catch (e) {
      caught = e;
    }
    expect(engineErrorKeys(caught)).toEqual(["math.random_integer_partition.invalid k"]);
    expect(errorMessageIn(caught, "en")).toBe("The size of the partition must be between 1 and 3.");
  });

  it("il prodotto scalare di una matrice troppo grande porta la sua chiave", () => {
    // la chiave qui NON è un letterale al punto di `throw`: `asVector` la
    // riceve come parametro. È il motivo per cui le due chiavi
    // `vectormath.*.matrix too big` erano sfuggite ai cataloghi.
    const big = math.makeMatrix([
      [1, 2],
      [3, 4],
    ]);
    expect(errorKey(() => math.vectormath.dot(big, [1, 2]))).toBe("vectormath.dot.matrix too big");
    expect(errorKey(() => math.vectormath.cross(big, [1, 2, 3]))).toBe("vectormath.cross.matrix too big");
    let caught: unknown;
    try {
      math.vectormath.dot(big, [1, 2]);
    } catch (e) {
      caught = e;
    }
    expect(errorMessageIn(caught, "en")).toContain("dot product");
    expect(errorMessageIn(caught, "it")).toContain("prodotto scalare");
  });

  it("ogni chiave lanciata da math/ è nei due cataloghi", () => {
    // la lista è DERIVATA dal sorgente, non scritta a mano: una chiave nuova
    // (o spostata dal punto di `throw` a un parametro, come le due
    // `vectormath.*.matrix too big`) deve far fallire questo caso da sola.
    const keys = mathErrorKeysInSource();
    expect(keys.length, "nessuna chiave trovata: la regex non combacia più").toBeGreaterThanOrEqual(31);
    for (const key of keys) {
      expect(itDict[key], `it: ${key}`).toBeDefined();
      expect(enDict[key], `en: ${key}`).toBeDefined();
    }
    // e nessuna chiave `math.*` nei cataloghi che il sorgente non lanci più
    const catalogued = Object.keys(itDict).filter((k) => /^(math|matrixmath|vectormath|setmath)\./.test(k));
    expect(catalogued.sort()).toEqual(keys.filter((k) => !k.startsWith("util.")).sort());
  });
});
