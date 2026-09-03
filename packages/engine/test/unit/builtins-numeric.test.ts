// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione dei blocchi "numerici" del modulo QUnit `Evaluating`
// (tests/jme/jme-tests.mjs:457-1639), valutati contro `builtinScope`:
// `Number-like types` (505), `Arithmetic` (698), `Number functions` (845),
// `Number theory/combinatorics` (899), `Ordering numbers` (1005),
// `Rounding` (1036), `Converting numbers to strings` (1134),
// `Exponentials` (1174), `Trigonometry` (1206).
//
// BLOCCHI E ASSERT TRADOTTI DAL TASK 4b (funzioni di temi non portati qui):
//   - `Currency` (1125) per intero: `currency` sta nel tema `strings`
//     (jme-builtins.js:1759) → builtins-strings.test.ts.
//   - `Boolean operations` (1483) per intero: tutti e 5 gli assert usano
//     `let` (control_flow) e `len` (lists) → builtins-control-flow.test.ts.
//     Il tema `booleans` è portato qui, ma questi assert non lo esercitano da
//     soli.
//   - `Arithmetic`: gli assert su liste (`[1,2]+[3,4]`, `[1,2]+3`,
//     `["x","y"]+"z"`) → builtins-lists.test.ts; quelli su stringhe
//     (`"hi "+"there"`, `"n: "+1`, `2+" things"`) → builtins-strings.test.ts.
//   - `Number functions`: `abs([1,2,3,4])` (tema `lists`) →
//     builtins-lists.test.ts; i due `award` (tema `marking`) →
//     builtins-subexpressions.test.ts.
//   - `Rounding`: nessuno.
//
// DIVERGENZE DI TRADUZIONE:
//   - `assert.equal` di QUnit confronta con `==`: dove la risoluzione degli
//     overload sceglie una firma `rational`/`decimal` (perché la lista dei
//     cast di `integer` mette `rational` prima di `number`), upstream
//     confronta un `Fraction`/`ComplexDecimal` con un numero e passa per
//     coercizione a stringa. Qui quegli assert usano `looseEqual`, che fa la
//     stessa cosa esplicitamente.

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { builtinScope } from "../../src/jme/builtins";
import { castToType } from "../../src/jme/evaluate";
import { TNum, type Token } from "../../src/jme/tokens";
import { closeEqual, deepCloseEqual } from "./math-helpers";
import { raisesJmeError } from "./jme-helpers";

/** `jme.evaluate(t, builtinScope)` degli helper upstream (jme-tests.mjs:475). */
function ev(expr: string): Token {
  const v = builtinScope.evaluate(expr);
  expect(v, `${expr} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** `evaluateNumber` upstream (jme-tests.mjs:483-486). */
function evn(expr: string): math.NumbasNumber {
  return (castToType(ev(expr), "number") as TNum).value;
}

/** Il valore grezzo del token. */
function val(t: Token): unknown {
  return (t as { value?: unknown }).value;
}

// `toEqual` di vitest confronta anche le proprietà extra `rows`/`columns`
// attaccate all'array esterno di una `Matrix` (a differenza del `deepEqual` di
// QUnit): si confronta il solo contenuto numerico.
const plainMatrix = (m: unknown): unknown[][] => (m as unknown[][]).map((row) => [...row]);

/** Gli errori di `math/` sono `Error` semplici con la chiave come messaggio
 * (Task 1), non `JmeError`: `raisesNumbasError` upstream si traduce così. */
function raisesMathError(fn: () => unknown, key: string, message?: string): void {
  expect(fn, message).toThrow(key);
}

/** `assert.equal` di QUnit confronta con `==`, quindi un `Fraction` o una
 * `ComplexDecimal` combaciano con il numero corrispondente tramite la loro
 * rappresentazione testuale. Serve dove la risoluzione degli overload sceglie
 * la firma `rational`/`decimal` invece di `number` (la lista dei cast di
 * `integer` mette `rational` prima di `number`, jme.js:3753-3769): è il
 * comportamento upstream, non una divergenza. */
function looseEqual(actual: unknown, expected: unknown, message?: string): void {
  expect(String(actual), message).toBe(String(expected));
}

describe("Evaluating > Number-like types", () => {
  it("i tipi prodotti dall'aritmetica esatta", () => {
    expect(ev("1").type, "1 è un intero").toBe("integer");
    expect(ev("1.0").type, "1.0 è un number").toBe("number");
    expect(ev("1/2").type, "1/2 è un rational").toBe("rational");
    expect(ev("1^1").type, "1^1 è un intero").toBe("integer");
    expect(ev("(1/4) * 2.0").type, "rational per number dà number").toBe("number");

    expect(ev("1+1.0").type, "1+1.0 è un number").toBe("number");
    expect(ev("1+dec(1)").type, "1+dec(1) è un decimal").toBe("decimal");
    expect(ev("dec(1)+dec(1)").type, "dec(1)+dec(1) è un decimal").toBe("decimal");
    expect(ev("1/2+dec(1)").type, "1/2+dec(1) è un decimal").toBe("decimal");
    expect(val(ev("1/6+1/6+1/6+1/6+1/6+1/6 = 1")), "sei sesti fanno esattamente 1").toBe(true);
    expect(val(ev("1/2=0.5")), "1/2=0.5").toBe(true);
    expect(ev("1+1/2").type, "1+1/2 dà un rational").toBe("rational");
  });

  it("cast automatico degli elementi di lista in vector()", () => {
    expect(ev("vector([1,dec(1),1/2])"), "vector([1,dec(1),1/2])").toBeTruthy();
  });

  it("except su range e liste conserva i tipi", () => {
    expect((val(ev("1..5 except 2..3")) as Token[])[0]?.type, "1..5 except 2..3 dà interi").toBe("integer");
    expect((val(ev("1..5 except [2,3]")) as Token[])[0]?.type, "1..5 except [2,3] dà interi").toBe("integer");
    expect((val(ev("1..5 except 2")) as Token[])[0]?.type, "1..5 except 2 dà interi").toBe("integer");
    expect((val(ev("1..5#0.5 except 2..3")) as Token[])[0]?.type, "1..5#0.5 except 2..3 dà number").toBe("number");
    expect((val(ev("1.5..3.5 except 2..3")) as Token[])[0]?.type, "1.5..3.5 except 2..3 dà number").toBe("number");
    const l = val(ev("[1,6,9.5] except 3..8")) as Token[];
    expect(
      l[0]?.type === "integer" && l[1]?.type === "number",
      "[1,6,9.5] except 3..8 conserva i tipi originali",
    ).toBe(true);
  });

  it("precisione conservata nella conversione a decimal", () => {
    const n = new TNum(33 / 2572780);
    n.value = (n.value as number) - Math.pow(10, -17);
    n.precisionType = "dp";
    n.precision = 17;
    const dn = (castToType(n, "decimal") as { value: math.ComplexDecimal }).value;
    const edn = val(ev('precround(dec(33)/dec(2572780) - dec("1e-17"), 17)')) as math.ComplexDecimal;
    expect(dn.equals(edn), "un number a 17 dp diventa un decimal arrotondato a 17 dp").toBe(true);
    expect(dn + "", "il number vale 0.00001282659224651").toBe("0.00001282659224651");

    const n2 = ev("precround(degrees(arcsin(4 sin(radians(40))/3)),2)");
    expect(
      String((castToType(n2, "decimal") as { value: math.ComplexDecimal }).value),
      "un number arrotondato a 2 dp resta a 2 dp come decimal",
    ).toBe("58.99");

    const n3 = ev("siground(degrees(arcsin(4 sin(radians(40))/3))/1000,4)");
    expect(
      String((castToType(n3, "decimal") as { value: math.ComplexDecimal }).value),
      "un number arrotondato a 4 cifre significative resta tale come decimal",
    ).toBe("0.05899");

    // la parte "numero" può dichiarare una precisione negativa: la
    // conversione non deve lanciare.
    const n4 = ev("pi*10^20") as TNum;
    n4.precisionType = "dp";
    n4.precision = -30;
    expect(String((castToType(n4, "decimal") as { value: math.ComplexDecimal }).value)).toBe("314159265358979334144");
  });

  it("isnan sui complessi", () => {
    expect(val(ev("isnan(i)")), "i non è NaN").toBe(false);
    expect(val(ev("isnan(nan * i)")), "nan*i è NaN").toBe(true);
    expect(val(ev("isnan(nan + i)")), "nan + i è NaN").toBe(true);
  });
});

describe("Evaluating > Arithmetic", () => {
  it("somma, differenza, prodotto e quoziente di numeri", () => {
    closeEqual(evn("+2"), 2, "+2");
    closeEqual(evn("-2"), -2, "-2");
    closeEqual(evn("1+2"), 3, "1+2");
    deepCloseEqual(evn("i+1"), math.complex(1, 1), "i+1");
    closeEqual(evn("3-13"), -10, "3-13");
    closeEqual(evn("5*4"), 20, "5*4");
    closeEqual(evn("i*i"), -1, "i*i");
    closeEqual(evn("5/2"), 2.5, "5/2");
    deepCloseEqual(evn("5/(1+i)"), math.complex(2.5, -2.5), "5/(1+i)");
    deepCloseEqual(evn("(1+i)/5"), math.complex(0.2, 0.2), "(1+i)/5");
    deepCloseEqual(evn("(1+i)/(2-i)"), math.complex(0.2, 0.6), "(1+i)/(2-i)");
  });

  it("potenze", () => {
    closeEqual(evn("2^4"), 16, "2^4");
    closeEqual(evn("(-6)^2"), 36, "(-6)^2");
    // `(-36)^0.5` e `(-6)^2` scelgono la firma `^ [integer, decimal]`: il
    // risultato è una ComplexDecimal, confrontata come stringa (upstream).
    looseEqual(val(ev("(-36)^0.5")), new math.ComplexDecimal(new math.Decimal(0), new math.Decimal(6)), "(-36)^0.5");
    looseEqual(val(ev("(-6)^2")), new math.ComplexDecimal(new math.Decimal(36), new math.Decimal(0)), "(-6)^2");
    expect(String(val(ev("dec(-0.5)^-2"))), "dec(-0.5)^-2").toBe("4");
    expect(String(val(ev("dec(-3)^3"))), "dec(-3)^3").toBe("-27");
    expect(ev("2^dec(-5)").type, "intero^decimal dà un decimal").toBe("decimal");
    deepCloseEqual(evn("(1+i)^0"), 1, "(1+i)^0");
    deepCloseEqual(evn("(1+i)^5"), math.complex(-4, -4), "(1+i)^5");
    deepCloseEqual(evn("(1+i)^6"), math.complex(0, -8), "(1+i)^6");
    deepCloseEqual(evn("(1+i)^(-2)"), math.complex(0, -0.5), "(1+i)^(-2)");
    deepCloseEqual(evn("(1+i)^(-3)"), math.complex(-0.25, -0.25), "(1+i)^(-3)");
    deepCloseEqual(evn("2^i"), math.complex(0.7692389013639721, 0.6389612763136348), "2^i");
    expect(evn("e^0.9"), "e^0.9 == exp(0.9)").toBe(evn("exp(0.9)"));
  });

  it("le costanti decimali sono più precise di Math.E/Math.PI", () => {
    expect(val(ev("iszero(dec(e)-exp(dec(1)))")), "dec(e) usa una e più precisa di Math.E").toBe(true);
    expect(val(ev("iszero(dec(e)-exp(1))")), "dec(e) usa una e più precisa di Math.E").toBe(false);
    expect(val(ev("iszero(dec(pi)-arccos(dec(-1)))")), "dec(pi) usa un pi più preciso di Math.PI").toBe(true);
    expect(val(ev("iszero(dec(pi)-arccos(-1))")), "dec(pi) usa un pi più preciso di Math.PI").toBe(false);
  });

  it("aritmetica mista number/decimal", () => {
    deepCloseEqual(evn("dec(1+2i)/dec(3+4i)"), math.complex(11 / 25, 2 / 25), "dec(1+2i)/dec(3+4i)");
    expect(String(val(ev("(1+2i)+dec(3)"))), "(1+2i)+dec(3)").toBe(
      String(new math.ComplexDecimal(new math.Decimal(4), new math.Decimal(2))),
    );
    expect(String(val(ev("i - dec(1)"))), "i - dec(1)").toBe(
      String(new math.ComplexDecimal(new math.Decimal(-1), new math.Decimal(1))),
    );
  });

  it("le potenze su number e su decimal danno lo stesso risultato", () => {
    for (const a of [1, -1, 2, -2, 9, -9]) {
      for (const b of [0, 1, -1, 2, -2, 0.5, -0.5, 1.5, -0.5, 3, -3]) {
        const n = evn(`(${a})^(${b})`);
        const d = evn(`dec(${a})^(${b})`);
        deepCloseEqual(n, d, `(${a})^(${b}) number concorda con decimal`);
      }
    }
  });

  it("vettori e matrici", () => {
    deepCloseEqual(val(ev("vector(1,2)+vector(2,3)")), [3, 5], "vector(1,2)+vector(2,3)");
    deepCloseEqual(
      plainMatrix(val(ev("matrix([1,0],[0,1])+matrix([0,1],[1,0])"))),
      [
        [1, 1],
        [1, 1],
      ],
      "matrix([1,0],[0,1])+matrix([0,1],[1,0])",
    );
    deepCloseEqual(val(ev("vector(1,2)-vector(5,5)")), [-4, -3], "vector(1,2)-vector(5,5)");
    deepCloseEqual(
      plainMatrix(val(ev("matrix([1,0],[0,1])-matrix([2,1],[2,1])"))),
      [
        [-1, -1],
        [-2, 0],
      ],
      "matrix([1,0],[0,1])-matrix([2,1],[2,1])",
    );
    deepCloseEqual(val(ev("5*vector(1,2)")), [5, 10], "5*vector(1,2)");
    deepCloseEqual(val(ev("vector(1,2)*5")), [5, 10], "vector(1,2)*5");
    deepCloseEqual(val(ev("matrix([1,1],[3,2])*vector(1,2)")), [3, 7], "matrix([1,1],[3,2])*vector(1,2)");
    deepCloseEqual(
      plainMatrix(val(ev("5*matrix([1,0],[0,1])"))),
      [
        [5, 0],
        [0, 5],
      ],
      "5*matrix([1,0],[0,1])",
    );
    deepCloseEqual(
      plainMatrix(val(ev("matrix([1,0],[0,1])*5"))),
      [
        [5, 0],
        [0, 5],
      ],
      "matrix([1,0],[0,1])*5",
    );
    deepCloseEqual(
      plainMatrix(val(ev("matrix([1,2],[1,1])*matrix([2,3],[4,5])"))),
      [
        [10, 13],
        [6, 8],
      ],
      "matrix([1,2],[1,1])*matrix([2,3],[4,5])",
    );
  });
});

describe("Evaluating > Number functions", () => {
  it("abs", () => {
    closeEqual(val(ev("abs(-5.4)")), 5.4, "abs(-5.4)");
    closeEqual(val(ev("abs(1+i)")), Math.sqrt(2), "abs(1+i)");
    closeEqual(val(ev("abs(1..5)")), 5, "abs(1..5)");
    closeEqual(val(ev("abs(1..5#1.2)")), 4, "abs(1..5#1.2)");
    closeEqual(val(ev("abs(1..4#0)")), 3, "abs(1..4#0)");
    closeEqual((val(ev("abs(dec(3))")) as math.ComplexDecimal).toNumber(), 3, "abs(dec(3))");
    closeEqual(val(ev("abs(vector(3,4))")), 5, "abs(vector(3,4))");
    closeEqual(val(ev("abs(vector(3,4,5,5,5))")), 10, "abs(vector(3,4,5,5,5))");
  });

  it("arg, re, im, conj", () => {
    closeEqual(val(ev("arg(1+i)")), Math.PI / 4, "arg(1+i)");
    closeEqual(val(ev("arg(-1-i)")), (-3 * Math.PI) / 4, "arg(-1-i)");
    closeEqual(val(ev("arg(0)")), 0, "arg(0)");
    closeEqual(val(ev("arg(1)")), 0, "arg(1)");
    expect(String(val(ev("dec(1.0/7.0)*7-1"))), "dec(1.0/7.0)*7-1").toBe("0");

    closeEqual(val(ev("re(1)")), 1, "re(1)");
    closeEqual(val(ev("re(i)")), 0, "re(i)");
    closeEqual(val(ev("re(5+6i)")), 5, "re(5+6i)");
    closeEqual(val(ev("im(1)")), 0, "im(1)");
    closeEqual(val(ev("im(i)")), 1, "im(i)");
    closeEqual(val(ev("im(5+6i)")), 6, "im(5+6i)");
    closeEqual(val(ev("conj(1)")), 1, "conj(1)");
    deepCloseEqual(val(ev("conj(i)")), math.complex(0, -1), "conj(i)");
    deepCloseEqual(val(ev("conj(5+6i)")), math.complex(5, -6), "conj(5+6i)");
  });

  it("isint", () => {
    closeEqual(val(ev("isint(0)")), true, "isint(0)");
    closeEqual(val(ev("isint(542)")), true, "isint(542)");
    closeEqual(val(ev("isint(-431)")), true, "isint(-431)");
    closeEqual(val(ev("isint(4/3)")), false, "isint(4/3)");
    closeEqual(val(ev("isint(-43.1)")), false, "isint(-43.1)");
    closeEqual(val(ev("isint(5i)")), false, "isint(5i)");
  });

  it("degrees e sign", () => {
    closeEqual(val(ev("degrees(0)")), 0, "degrees(0)");
    closeEqual(val(ev("degrees(pi)")), 180, "degrees(pi)");
    closeEqual(val(ev("degrees(1)")), 57.29577951308232, "degrees(1)");
    closeEqual(val(ev("degrees(5.5*pi)")), 990, "degrees(5.5*pi)");
    deepCloseEqual(val(ev("degrees(pi*i)")), math.complex(0, 180), "degrees(pi*i)");

    closeEqual(val(ev("sign(54)")), 1, "sign(54)");
    closeEqual(val(ev("sign(0.5)")), 1, "sign(0.5)");
    closeEqual(val(ev("sign(0)")), 0, "sign(0)");
    closeEqual(val(ev("sign(-43)")), -1, "sign(-43)");
    deepCloseEqual(val(ev("sign(4-i)")), math.complex(1, -1), "sign(4-i)");
  });
});

describe("Evaluating > Number theory/combinatorics", () => {
  it("mod", () => {
    deepCloseEqual(val(ev("mod(0,0)")), NaN, "mod(0,0)");
    deepCloseEqual(val(ev("mod(5,0)")), NaN, "mod(5,0)");
    closeEqual(val(ev("mod(13,2)")), 1, "mod(13,2)");
    closeEqual(val(ev("mod(4.765,3)")), 1.765, "mod(4.765,3)");
    closeEqual(val(ev("mod(-13,6)")), 5, "mod(-13,6)");
    closeEqual(val(ev("mod(2.4,1.1)")), 0.2, "mod(2.4,1.1)");
  });

  it("perm", () => {
    closeEqual(val(ev("perm(5,4)")), 120, "perm(5,4)");
    closeEqual(val(ev("perm(6,1)")), 6, "perm(6,1)");
    raisesMathError(() => ev("perm(2,3)"), "math.permutations.n less than k");
    raisesMathError(() => ev("perm(-2,3)"), "math.permutations.n less than zero");
    raisesMathError(() => ev("perm(2,-3)"), "math.permutations.k less than zero");
    raisesMathError(() => ev("perm(i,1)"), "math.permutations.complex");
    raisesMathError(() => ev("perm(1,i)"), "math.permutations.complex");
  });

  it("comb", () => {
    closeEqual(val(ev("comb(5,4)")), 5, "comb(5,4)");
    closeEqual(val(ev("comb(6,1)")), 6, "comb(6,1)");
    closeEqual(val(ev("comb(7,3)")), 35, "comb(7,3)");
    raisesMathError(() => ev("comb(2,3)"), "math.combinations.n less than k");
    raisesMathError(() => ev("comb(-2,3)"), "math.combinations.n less than zero");
    raisesMathError(() => ev("comb(2,-3)"), "math.combinations.k less than zero");
    raisesMathError(() => ev("comb(i,1)"), "math.combinations.complex");
    raisesMathError(() => ev("comb(1,i)"), "math.combinations.complex");
  });

  it("gcd", () => {
    closeEqual(val(ev("gcd(36,15)")), 3, "gcd(36,15)");
    expect(ev("gcd(36,15)").type, "gcd(36,15) dà un intero").toBe("integer");
    closeEqual(val(ev("gcd(1.1,15)")), 1, "gcd(1.1,15)");
    expect(ev("gcd(1.1,15)").type, "gcd(1.1,15) dà un number").toBe("number");
    closeEqual(val(ev("gcd(-60,18)")), 6, "gcd(-60,18)");
    closeEqual(val(ev("gcd(60,-18)")), 6, "gcd(60,-18)");
    closeEqual(val(ev("gcd(0,3)")), 3, "gcd(0,3)");
    closeEqual(val(ev("gcd(0,-3)")), 3, "gcd(0,-3)");
    closeEqual(val(ev("gcd(3,0)")), 3, "gcd(3,0)");
    closeEqual(val(ev("gcd(infinity,15)")), 1, "gcd(infinity,15)");
    raisesMathError(() => ev("gcd(2i,4)"), "math.gcf.complex");
  });

  it("coprime", () => {
    closeEqual(val(ev("coprime(2,3)")), true, "coprime(2,3)");
    closeEqual(val(ev("coprime(2,-3)")), true, "coprime(2,-3)");
    closeEqual(val(ev("coprime(2,i)")), true, "coprime(2,i)");
    closeEqual(val(ev("coprime(2,4)")), false, "coprime(2,4)");
    closeEqual(val(ev("coprime(2,-4)")), false, "coprime(2,-4)");
    closeEqual(val(ev("coprime(1,3)")), true, "coprime(1,3)");
    closeEqual(val(ev("coprime(1,1)")), true, "coprime(1,1)");
  });

  it("lcm", () => {
    closeEqual(val(ev("lcm(3,7)")), 21, "lcm(3,7)");
    expect(ev("lcm(3,7)").type, "lcm(3,7) dà un intero").toBe("integer");
    expect(ev("lcm([3,7,9])").type, "lcm([3,7,9]) dà un intero").toBe("integer");
    closeEqual(val(ev("lcm(4,6)")), 12, "lcm(4,6)");
    closeEqual(val(ev("lcm(-10,35)")), 70, "lcm(-10,35)");
    raisesMathError(() => ev("lcm(2,i)"), "math.lcm.complex");
  });

  it("l'operatore divide", () => {
    closeEqual(val(ev("0|1")), false, "0|1");
    closeEqual(val(ev("5|25")), true, "5|25");
    closeEqual(val(ev("6|42")), true, "6|42");
    closeEqual(val(ev("4|42")), false, "4|42");
    closeEqual(val(ev("-4|40")), true, "-4|40");
    closeEqual(val(ev("4|-40")), true, "4|-40");
    closeEqual(val(ev("i|2i")), false, "i|2i");
  });
});

describe("Evaluating > Ordering numbers", () => {
  it("min e max su numeri", () => {
    closeEqual(val(ev("min(3,5)")), 3, "min(3,5)");
    closeEqual(val(ev("min(54,1.5654)")), 1.5654, "min(54,1.5654)");
    closeEqual(val(ev("min(-32,4)")), -32, "min(-32,4)");
    raisesMathError(() => ev("min(i,1+i)"), "math.order complex numbers");
    closeEqual(val(ev("min([3,1,-5,-2])")), -5, "min([3,1,-5,-2])");

    closeEqual(val(ev("max(3,5)")), 5, "max(3,5)");
    closeEqual(val(ev("max(54,1.5654)")), 54, "max(54,1.5654)");
    closeEqual(val(ev("max(-32,4)")), 4, "max(-32,4)");
    raisesMathError(() => ev("max(i,1+i)"), "math.order complex numbers");
    closeEqual(val(ev("max([3,1,-5,-2])")), 3, "max([3,1,-5,-2])");
  });

  it("min e max su razionali", () => {
    expect(String(val(ev("max(1/2, 1/3)"))), "max(1/2, 1/3)").toBe("1/2");
    expect(String(val(ev("min(1/2, 1/3)"))), "min(1/2, 1/3)").toBe("1/3");
    expect(String(val(ev("max([12/18,-43/67, 3/4,1/2])"))), "max([12/18,-43/67, 3/4,1/2])").toBe("3/4");
    expect(String(val(ev("min([12/18,-43/67, 3/4,1/2])"))), "min([12/18,-43/67, 3/4,1/2])").toBe("-43/67");
  });

  it("min e max su decimal", () => {
    expect(ev("max([dec(0),dec(1)])").type).toBe("decimal");
    expect(ev("min([dec(0),dec(1)])").type).toBe("decimal");
    expect(ev("max(dec(0),dec(1))").type).toBe("decimal");
    expect(ev("min(dec(0),dec(1))").type).toBe("decimal");

    raisesMathError(() => ev("min(decimal(2)i, decimal(0))"), "math.order complex numbers");
    raisesMathError(() => ev("max(decimal(2)i, decimal(0))"), "math.order complex numbers");
    raisesMathError(() => ev("min([decimal(2)i, decimal(0)])"), "math.order complex numbers");
    raisesMathError(() => ev("max([decimal(2)i, decimal(0)])"), "math.order complex numbers");
  });
});

describe("Evaluating > Rounding", () => {
  it("radians", () => {
    closeEqual(val(ev("radians(0)")), 0, "radians(0)");
    closeEqual(val(ev("radians(180)")), Math.PI, "radians(180)");
    closeEqual(val(ev("radians(1080)")), 6 * Math.PI, "radians(1080)");
    deepCloseEqual(val(ev("radians(90+360i)")), math.complex(Math.PI / 2, 2 * Math.PI), "radians(90+360i)");
  });

  it("ceil, floor, trunc, fract, round", () => {
    closeEqual(val(ev("ceil(0.1)")), 1, "ceil(0.1)");
    closeEqual(val(ev("ceil(532.9)")), 533, "ceil(532.9)");
    closeEqual(val(ev("ceil(0)")), 0, "ceil(0)");
    closeEqual(val(ev("ceil(-14.6)")), -14, "ceil(-14.6)");
    deepCloseEqual(val(ev("ceil(1.7-2.3i)")), math.complex(2, -2), "ceil(1.7-2.3i)");

    closeEqual(val(ev("floor(0.1)")), 0, "floor(0.1)");
    closeEqual(val(ev("floor(532.9)")), 532, "floor(532.9)");
    closeEqual(val(ev("floor(0)")), 0, "floor(0)");
    closeEqual(val(ev("floor(-14.6)")), -15, "floor(-14.6)");
    deepCloseEqual(val(ev("floor(1.2i)")), math.complex(0, 1), "floor(1.2i)");

    closeEqual(val(ev("trunc(0)")), 0, "trunc(0)");
    closeEqual(val(ev("trunc(5)")), 5, "trunc(5)");
    closeEqual(val(ev("trunc(14.3)")), 14, "trunc(14.3)");
    closeEqual(val(ev("trunc(-4.76)")), -4, "trunc(-4.76)");
    deepCloseEqual(val(ev("trunc(0.5+4.75i)")), math.complex(0, 4), "trunc(0.5+4.75i)");
    closeEqual(val(ev("trunc(5.1264,2)")), 5.12, "trunc(5.1264,2)");
    closeEqual(val(ev("trunc(-5.1264,2)")), -5.12, "trunc(-5.1264,2)");

    // `fract(0)` e `fract(5)` prendono la firma `fract [rational]` (vedi
    // `looseEqual` in testa): il valore è un `Fraction`, non un number.
    looseEqual(val(ev("fract(0)")), 0, "fract(0)");
    looseEqual(val(ev("fract(5)")), 0, "fract(5)");
    closeEqual(val(ev("fract(14.3)")), 0.3, "fract(14.3)");
    closeEqual(val(ev("fract(-4.76)")), -0.76, "fract(-4.76)");
    deepCloseEqual(val(ev("fract(0.5+4.75i)")), math.complex(0.5, 0.75), "fract(0.5+4.75i)");

    closeEqual(val(ev("round(0)")), 0, "round(0)");
    closeEqual(val(ev("round(12321)")), 12321, "round(12321)");
    closeEqual(val(ev("round(1.4)")), 1, "round(1.4)");
    closeEqual(val(ev("round(4.9)")), 5, "round(4.9)");
    closeEqual(val(ev("round(11.5)")), 12, "round(11.5)");
    closeEqual(val(ev("round(-3.2)")), -3, "round(-3.2)");
    closeEqual(val(ev("round(-3.5)")), -3, "round(-3.5)");
    closeEqual(val(ev("round(-50)")), -50, "round(-50)");
    deepCloseEqual(val(ev("round(1.4-6.7i)")), math.complex(1, -7), "round(1.4-6.7i)");
  });

  it("precround", () => {
    looseEqual(val(ev("precround(1.1234567891011121314151617181920,0)")), 1, "precround(1.1234567891011121314151617181920,0)");
    looseEqual(val(ev("precround(1.1234567891011121314151617181920,1)")), 1.1, "precround(1.1234567891011121314151617181920,1)");
    looseEqual(val(ev("precround(1.1234567891011121314151617181920,5)")), 1.12346, "precround(1.1234567891011121314151617181920,5)");
    looseEqual(val(ev("precround(1.1234567891011121314151617181920,20)")), 1.12345678910111213142, "precround(1.1234567891011121314151617181920,20)");
    looseEqual(val(ev("precround(1.9999,3)")), 2, "precround(1.9999,3)");
    looseEqual(val(ev("precround(-132.6545,3)")), -132.654, "precround(-132.6545,3)");
    looseEqual(val(ev("precround(123456789012,8)")), 123456789012, "precround(123456789012,8)");
    looseEqual(val(ev("precround(4+488/1000,3)")), 4.488, "precround(4+488/1000,3)");
    looseEqual(val(ev("precround(0.05,2)")), 0.05, "precround(0.05,2)");
    looseEqual(val(ev("precround(-0.05,2)")), -0.05, "precround(-0.05,2)");
    looseEqual(val(ev("precround(-2.51,0)")), -3, "precround(-2.51,0)");

    looseEqual(val(ev("precround(237.55749999999998,3)")), 237.558, "precround(237.55749999999998,3)");
    looseEqual(val(ev("precround(237.55748999999998,3)")), 237.557, "precround(237.55748999999998,3)");
    looseEqual(val(ev("precround(-237.55750000000001,3)")), -237.557, "precround(-237.55750000000001,3)");
    looseEqual(val(ev("precround(-237.55751000000001,3)")), -237.558, "precround(-237.55751000000001,3)");
  });

  it("siground", () => {
    expect(val(ev("siground(0.123,2)"))).toBe(0.12);
    expect(val(ev("siground(123456.123456,3)"))).toBe(123000);
    expect(val(ev("siground(-32.45,3)"))).toBe(-32.5);
    expect(val(ev("siground(-32452,2)"))).toBe(-32000);
    expect(val(ev("siground(-2.51,1)"))).toBe(-3);
    expect(val(ev("siground(14515200,3)"))).toBe(14500000);

    expect(ev("siground(1/7,3)").type, "siground(1/7,3) è un decimal").toBe("decimal");
    expect(val(ev("fract(siground(1/7,2)*100)=0")), "fract(siground(1/7,2)*100)=0").toBe(true);
    expect(val(ev("siground(cos(pi/2),3)")), "siground(cos(pi/2),3)").toBe(0);
  });

  it("arrotondamento dei razionali", () => {
    const fractions: [string, number, number, number, string][] = [
      ["0/1", 0, 0, 0, "0/1"],
      ["1/3", 0, 0, 1, "1/3"],
      ["-1/3", 0, -1, 0, "-1/3"],
      ["3/3", 1, 1, 1, "0/3"],
      ["-3/3", -1, -1, -1, "-0/3"],
      ["4/3", 1, 1, 2, "1/3"],
      ["-4/3", -1, -2, -1, "-1/3"],
    ];
    fractions.forEach(([expr, t, f, c, fr]) => {
      expect(val(ev(`trunc(${expr})`)), `trunc(${expr})`).toBe(t);
      expect(val(ev(`floor(${expr})`)), `floor(${expr})`).toBe(f);
      expect(val(ev(`ceil(${expr})`)), `ceil(${expr})`).toBe(c);
      expect(String(val(ev(`fract(${expr})`))), `fract(${expr})`).toBe(String(val(ev(fr))));
    });
  });
});

describe("Evaluating > Converting numbers to strings", () => {
  it("tobinary, tooctal, tohexadecimal", () => {
    expect(val(ev("tobinary(3^100)")), "tobinary(3^100)").toBe(
      "101101001000110010100111100101001100111001101110110100001010110010110110100000111110111011101011101011010010100011111010101010111001111001110000001001111010001",
    );
    expect(val(ev("tooctal(3^100)")), "tooctal(3^100)").toBe("55106247451471566412626640767353532243725271716011721");
    expect(val(ev("tohexadecimal(3^100)")), "tohexadecimal(3^100)").toBe("5a4653ca673768565b41f775d6947d55cf3813d1");
  });
});

describe("Evaluating > Exponentials", () => {
  it("sqrt, ln, log, exp", () => {
    closeEqual(val(ev("sqrt(2)")), Math.sqrt(2), "sqrt(2)");
    deepCloseEqual(val(ev("sqrt(-1)")), math.complex(0, 1), "sqrt(-1)");
    deepCloseEqual(val(ev("sqrt(-49)")), math.complex(0, 7), "sqrt(-49)");
    deepCloseEqual(val(ev("sqrt(1+2i)")), math.complex(1.272019649514068964, 0.786151377757423286069), "sqrt(1+2i)");

    closeEqual(val(ev("ln(e)")), 1, "ln(e)");
    closeEqual(val(ev("ln(1)")), 0, "ln(1)");
    deepCloseEqual(val(ev("ln(-2)")), math.complex(Math.log(2), Math.PI), "ln(-2)");
    deepCloseEqual(val(ev("ln(2+i)")), math.complex(Math.log(Math.sqrt(5)), Math.atan(0.5)), "ln(2+i)");
    closeEqual(val(ev("log(10)")), 1, "log(10)");
    deepCloseEqual(
      val(ev("log(2+i)")),
      math.complex(Math.LOG10E * Math.log(Math.sqrt(5)), Math.LOG10E * Math.atan(0.5)),
      "log(2+i)",
    );
    closeEqual(val(ev("exp(5)")), Math.exp(5), "exp(5)");
    closeEqual(val(ev("exp(-2)")), Math.exp(-2), "exp(-2)");
    deepCloseEqual(
      val(ev("exp(4-i)")),
      math.complex(Math.exp(4) * Math.cos(-1), Math.exp(4) * Math.sin(-1)),
      "exp(4-i)",
    );
    expect(val(ev("isclose(ln(dec(-e)), dec(ln(e)) - dec(pi)*i)")), "ln(dec(-e))").toBe(true);
    expect(val(ev("isclose(exp(dec(pi/2)*i), i)")), "exp(dec(pi/2)*i)").toBe(true);
  });

  it("fact e root", () => {
    closeEqual(val(ev("fact(0)")), 1, "fact(0)");
    closeEqual(val(ev("fact(1)")), 1, "fact(1)");
    closeEqual(val(ev("fact(6)")), 720, "fact(6)");
    closeEqual(val(ev("fact(1/2)")), 0.8862269255, "fact(1/2)");
    closeEqual(val(ev("fact(-3/2)")), -3.5449077018, "fact(-3/2)");
    deepCloseEqual(val(ev("fact(i)")), math.complex(0.4980156681, -0.1549498283), "fact(i)");

    closeEqual(val(ev("root(8,3)")), 2, "root(8,3)");
    deepCloseEqual(val(ev("root(-27,3)")), -3, "root(-27,3)");
    deepCloseEqual(
      val(ev("root(-81,4)")),
      math.complex(Math.cos(Math.PI / 4) * 3, Math.sin(Math.PI / 4) * 3),
      "root(-81,4)",
    );
    closeEqual(val(ev("root(4,1.2)")), 3.174802103936399, "root(4,1.2)");
    deepCloseEqual(val(ev("root(i,-2)")), math.complex(0.7071067811865476, -0.7071067811865476), "root(i,-2)");
  });
});

describe("Evaluating > Trigonometry", () => {
  it("sin, cos, tan", () => {
    closeEqual(val(ev("sin(0)")), 0, "sin(0)");
    closeEqual(val(ev("sin(pi/2)")), 1, "sin(pi/2)");
    deepCloseEqual(val(ev("sin(i)")), math.complex(0, 1.175201193643801456882381), "sin(i)");
    closeEqual(val(ev("cos(0)")), 1, "cos(0)");
    closeEqual(val(ev("cos(pi/2)")), 0, "cos(pi/2)");
    deepCloseEqual(val(ev("cos(i)")), 1.5430806348152437784779, "cos(i)");

    closeEqual(val(ev("tan(0)")), 0, "tan(0)");
    closeEqual(val(ev("tan(pi/4)")), 1, "tan(pi/4)");
    deepCloseEqual(val(ev("tan(i)")), math.complex(0, 0.761594155955764888), "tan(i)");
  });

  it("cosec, sec, cot", () => {
    closeEqual(val(ev("cosec(pi/4)")), Math.sqrt(2), "cosec(pi/4)");
    deepCloseEqual(val(ev("cosec(i)")), math.complex(0, -0.850918128239321545133), "cosec(i)");
    closeEqual(val(ev("sec(pi/4)")), Math.sqrt(2), "sec(pi/4)");
    closeEqual(val(ev("sec(i)")), 1 / 1.5430806348152437784779, "sec(i)");
    closeEqual(val(ev("cot(1)")), 0.6420926159343307, "cot(1)");
    deepCloseEqual(val(ev("cot(i)")), math.complex(0, -1.313035285499331303), "cot(i)");
  });

  it("funzioni inverse", () => {
    closeEqual(val(ev("arcsin(0.5)")), Math.PI / 6, "arcsin(0.5)");
    deepCloseEqual(val(ev("arcsin(i*sinh(1))")), math.complex(0, 1), "arcsin(i*sinh(1))");
    deepCloseEqual(val(ev("arcsin(2)")), math.complex(1.5707963267948966, -1.31695789692481), "arcsin(2)");
    closeEqual(val(ev("arccos(0.5)")), Math.PI / 3, "arccos(0.5)");
    deepCloseEqual(val(ev("arccos(cosh(1))")), math.complex(0, 1), "arccos(cosh(1))");
    closeEqual(val(ev("arctan(1/sqrt(3))")), Math.PI / 6, "arctan(1/sqrt(3))");
    deepCloseEqual(val(ev("arctan(i*tanh(1))")), math.complex(0, 1), "arctan(i*tanh(1))");
  });

  it("funzioni iperboliche", () => {
    closeEqual(val(ev("sinh(1)")), Math.E / 2 - 1 / (2 * Math.E), "sinh(1)");
    closeEqual(val(ev("sinh(ln(2))")), 3 / 4, "sinh(ln(2))");
    deepCloseEqual(val(ev("sinh(2i)")), math.complex(0, Math.sin(2)), "sinh(2i)");
    closeEqual(val(ev("cosh(1)")), Math.E / 2 + 1 / (2 * Math.E), "cosh(1)");
    closeEqual(val(ev("cosh(ln(3))")), 5 / 3, "cosh(ln(3))");
    closeEqual(val(ev("cosh(-i)")), Math.cos(1), "cosh(-i)");
    closeEqual(val(ev("tanh(1)")), 0.7615941559557648, "tanh(1)");
    closeEqual(val(ev("tanh(ln(5))")), 12 / 13, "tanh(ln(5))");
    deepCloseEqual(val(ev("tanh(1+i)")), math.complex(1.08392332733869454, 0.27175258531951171652), "tanh(1+i)");
    closeEqual(val(ev("cosech(ln(3))")), 3 / 4, "cosech(ln(3))");
    closeEqual(val(ev("sech(ln(2))")), 4 / 5, "sech(ln(2))");
    closeEqual(val(ev("coth(5)")), 1.000090803982019, "coth(5)");
    closeEqual(val(ev("arcsinh(7)")), 2.644120761058629075, "arcsinh(7)");
    closeEqual(val(ev("arccosh(8)")), 2.7686593833135738, "arccosh(8)");
    deepCloseEqual(val(ev("arctanh(1+i)")), math.complex(0.40235947810852507, 1.0172219678978514), "arctanh(1+i)");
  });
});

describe("Evaluating > jme.typecheck (assert riattivati dal Task 2)", () => {
  it("gli errori di tipo con lo scope dei builtin", () => {
    raisesJmeError(() => ev("x()"), "jme.typecheck.function not defined", "x()");
    raisesJmeError(() => ev("gcd(2)"), "jme.typecheck.no right type definition", "gcd(2)");
  });
});
