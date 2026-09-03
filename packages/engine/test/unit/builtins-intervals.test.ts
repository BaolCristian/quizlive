// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Range operations` (jme-tests.mjs:1335-1372) del modulo QUnit
// `Evaluating`, più i builtin dei temi `set_theory` (jme-builtins.js:968-1018)
// e `intervals` (1020-1091), valutati contro `builtinScope`.
//
// Il modulo QUnit `Real intervals` (1640-1855) verifica `math.RealInterval` /
// `math.RealIntervalUnion` DIRETTAMENTE, senza passare da JME: è già tradotto
// per intero dal Task 1 in `math-real-interval.test.ts` (8 blocchi, stesse
// tabelle). Qui le stesse tabelle passano dai builtin `interval`, `union`,
// `intersection`, `complement`, `difference`, che nel Task 1 non esistevano.
//
// ASSERT RIMANDATI AL TASK 4b:
//   - `-2..11 except [1,2,3,5,8]`, `-2..11 except []` e `-2..2 except
//     [1,"a",0]`: con una lista di tipo misto (o vuota) la firma
//     `except [TRange, list of number]` non combacia e vince
//     `except [TList, TList]` del tema `lists` (jme-builtins.js:1215).
//   - gli assert che usano `list(...)` (tema `lists`, riga 1209) sono
//     tradotti con il cast `range → list` che `list(...)` chiama, così la
//     copertura sul contenuto del range resta.

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { builtinScope } from "../../src/jme/builtins";
import { castToType, unwrapValue } from "../../src/jme/evaluate";
import { TInterval, type Token } from "../../src/jme/tokens";
import { closeEqual, deepCloseEqual } from "./math-helpers";
import { raisesJmeError } from "./jme-helpers";

/** Valuta nello scope dei builtin. */
function ev(expr: string, variables?: Record<string, unknown>): Token {
  const v = builtinScope.evaluate(expr, variables);
  expect(v, `${expr} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** Il valore grezzo del token. */
function val(t: Token): unknown {
  return (t as { value?: unknown }).value;
}

/** I valori JS dei token di una lista. */
function values(t: Token): unknown[] {
  return (val(t) as Token[]).map((x) => val(x));
}

/** Il contenuto di un range come lista di numeri: è quel che fa il builtin
 * `list(range)` del tema `lists` (Task 4b), passando dal cast di Task 2. */
function rangeList(expr: string): unknown {
  return unwrapValue(castToType(ev(expr), "list"));
}

/** L'unione di intervalli descritta dalla stringa, con la sintassi di
 * `RealInterval.fromString` (`"(0..1] [2..3)"`). */
function union(str: string): math.RealIntervalUnion {
  return new math.RealIntervalUnion(
    str
      .split(" ")
      .filter((x) => x.length > 0)
      .map((s) => math.RealInterval.fromString(s)),
  );
}

/** Verifica che l'espressione produca l'unione di intervalli data. */
function expectInterval(expr: string, expected: string): void {
  const t = ev(expr);
  expect(t.type, `${expr} dà un interval`).toBe("interval");
  const got = (t as TInterval).value;
  expect(got.equals(union(expected)), `${expr} = ${expected}`).toBe(true);
}

describe("Evaluating > Range operations", () => {
  it("costruzione di un range", () => {
    deepCloseEqual(val(ev("1..5")), [1, 5, 1], "1..5");
    deepCloseEqual(rangeList("1..5"), [1, 2, 3, 4, 5], "list(1..5)");
    deepCloseEqual(val(ev("1..7#2")), [1, 7, 2], "1..7#2");
    deepCloseEqual(rangeList("1..7#2"), [1, 3, 5, 7], "list(1..7#2)");
    deepCloseEqual(val(ev("-2..3#2")), [-2, 3, 2], "-2..3#2");
    deepCloseEqual(rangeList("-2..3#2"), [-2, 0, 2], "list(-2..3#2)");
    deepCloseEqual(
      rangeList("100..102#1/3"),
      [100, 100 + 1 / 3, 100 + 2 / 3, 101, 101 + 1 / 3, 101 + 2 / 3, 102],
      "list(100..102#1/3)",
    );
    deepCloseEqual(rangeList("6..1#-1"), [6, 5, 4, 3, 2, 1], "list(6..1#-1)");
    deepCloseEqual(val(ev("1..2#0")), [1, 2, 0], "1..2#0");
  });

  it("except su un range", () => {
    deepCloseEqual(values(ev("-3..7 except 0..3")), [-3, -2, -1, 4, 5, 6, 7], "-3..7 except 0..3");
    deepCloseEqual(
      values(ev("-3..7 except 0.5..3.5")),
      [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
      "-3..7 except 0.5..3.5",
    );
    deepCloseEqual(values(ev("-3..7 except 0.5..3.5#0")), [-3, -2, -1, 0, 4, 5, 6, 7], "-3..7 except 0.5..3.5#0");
    raisesJmeError(() => ev("0..5#0 except 1..3"), "jme.func.except.continuous range", "0..5#0 except 1..3");

    deepCloseEqual(values(ev("-3..7 except 4")), [-3, -2, -1, 0, 1, 2, 3, 5, 6, 7], "-3..7 except 4");
    deepCloseEqual(values(ev("-3..7 except 4.5")), [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7], "-3..7 except 4.5");
    raisesJmeError(() => ev("0..1#0 except 0.5"), "jme.func.except.continuous range", "0..1#0 except 0.5");

    deepCloseEqual(values(ev("1..5 except [2,3]")), [1, 4, 5], "1..5 except [2,3]");
    deepCloseEqual(values(ev("[1,6,9.5] except 3..8")), [1, 9.5], "[1,6,9.5] except 3..8");
  });

  it("in, abs e dpformat su un range", () => {
    expect(val(ev("-11 in -9..9")), "-11 non sta in -9..9").toBe(false);
    expect(val(ev("3 in -9..9#0")), "3 sta in -9..9#0").toBe(true);

    const sixth = (val(castToType(ev("0.2..4#0.2"), "list")) as Token[])[6] as Token;
    expect(val(ev("dpformat(x,20)", { x: sixth })), "niente accumulo di errore con passo non intero").toBe(
      "1.40000000000000000",
    );

    closeEqual(val(ev("min(1..1000)")), 1, "min(1..1000)");
    closeEqual(val(ev("max(1..1000)")), 1000, "max(1..1000)");
    closeEqual(val(ev("min(-10^6 .. 10^7)")), -Math.pow(10, 6), "min(-10^6 .. 10^7)");
    closeEqual(val(ev("max(-10^6 .. 10^7)")), Math.pow(10, 7), "max(-10^6 .. 10^7)");
  });
});

describe("Evaluating > Set theory", () => {
  it("costruzione di un insieme", () => {
    expect(values(ev("set([1,2,3,3])")).sort(), "set([1,2,3,3]) toglie i duplicati").toEqual([1, 2, 3]);
    expect(values(ev("set(1..3)")).sort(), "set(1..3)").toEqual([1, 2, 3]);
    expect(values(ev("set(1,2,2)")).sort(), "set(1,2,2)").toEqual([1, 2]);
    expect(ev("set([1,2])").type).toBe("set");
  });

  it("union, intersection, differenza e appartenenza", () => {
    expect(values(ev("union(set([1,2]),set([2,3]))")).sort(), "union").toEqual([1, 2, 3]);
    expect(values(ev("intersection(set([1,2]),set([2,3]))")), "intersection").toEqual([2]);
    expect(values(ev("set([1,2,3]) - set([2])")).sort(), "differenza insiemistica").toEqual([1, 3]);
    expect(values(ev("set([1,2]) or set([2,3])")).sort(), "or su insiemi è l'unione").toEqual([1, 2, 3]);
    expect(values(ev("set([1,2]) and set([2,3])")), "and su insiemi è l'intersezione").toEqual([2]);
    closeEqual(val(ev("abs(set([1,2,3]))")), 3, "abs di un insieme è la cardinalità");
    expect(val(ev("2 in set([1,2,3])")), "2 in set([1,2,3])").toBe(true);
    expect(val(ev("5 in set([1,2,3])")), "5 in set([1,2,3])").toBe(false);
    expect(val(ev('"a" in set(["a","b"])')), '"a" in set(["a","b"])').toBe(true);
  });
});

describe("Evaluating > Real intervals (dai builtin JME)", () => {
  it("interval() e i suoi accessori", () => {
    expectInterval("interval(0,2,true,true)", "[0..2]");
    expectInterval("interval(0,2)", "(0..2)");
    expectInterval("interval(0,2,true,false)", "[0..2)");
    expectInterval("interval(0,2,false,true)", "(0..2]");

    closeEqual(val(ev("start(interval(1,3,true,true))")), 1, "start");
    closeEqual(val(ev("end(interval(1,3,true,true))")), 3, "end");
    expect(val(ev("open_start(interval(1,3))")), "open_start").toBe(true);
    expect(val(ev("open_end(interval(1,3))")), "open_end").toBe(true);
    expect(val(ev("closed_start(interval(1,3,true,true))")), "closed_start").toBe(true);
    expect(val(ev("closed_end(interval(1,3,true,true))")), "closed_end").toBe(true);

    const comps = val(ev("components(union(interval(0,1),interval(2,3)))")) as Token[];
    expect(comps.length, "components di due intervalli disgiunti").toBe(2);
    expect(comps.every((c) => c.type === "interval"), "ogni componente è un interval").toBe(true);
  });

  it("intersezione a coppie (tabella upstream 1675-1690)", () => {
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
    ];
    /** L'espressione JME che costruisce l'intervallo descritto dalla stringa. */
    function expr(def: string): string {
      const iv = math.RealInterval.fromString(def);
      return `interval(${iv.start},${iv.end},${iv.includes_start},${iv.includes_end})`;
    }
    intersection_tests.forEach((defs) => {
      const [a, b, c] = defs.split(" ") as [string, string, string];
      expectInterval(`intersection(${expr(a)},${expr(b)})`, c);
      expectInterval(`${expr(a)} * ${expr(b)}`, c);
    });
  });

  it("unione, complemento e differenza", () => {
    expectInterval("union(interval(0,1,false,true),interval(1,2))", "(0..2)");
    expectInterval("interval(0,1,false,true) + interval(1,2)", "(0..2)");
    expectInterval("union([interval(0,1),interval(2,3)])", "(0..1) (2..3)");
    expectInterval("intersection([interval(0,2),interval(1,3)])", "(1..2)");

    expectInterval("complement(interval(1,2))", "(-Infinity..1] [2..Infinity)");
    expectInterval("not interval(1,2)", "(-Infinity..1] [2..Infinity)");

    expectInterval("difference(interval(0,3),interval(1,2))", "(0..1] [2..3)");
    expectInterval("interval(0,3) - interval(1,2)", "(0..1] [2..3)");
    expectInterval("interval(0,3) except interval(1,2)", "(0..1] [2..3)");
  });

  it("gli overload `and`/`or` su interval sono codice morto (come upstream)", () => {
    // `and`/`or` sono in `jme.lazyOps` (tema `booleans`): il valutatore usa
    // SEMPRE la prima definizione registrata con quel nome, cioè quella
    // pigra su booleani (jme-builtins.js:879/900), che sa gestire solo il
    // caso "insieme" e per tutto il resto converte a boolean. Gli overload
    // `and`/`or` su `interval` (righe 1046/1069) non sono quindi mai
    // raggiungibili: si usino `intersection`/`union` o `*`/`+`.
    raisesJmeError(() => ev("interval(0,2) and interval(1,3)"), "jme.type.no cast method");
    raisesJmeError(() => ev("interval(0,1) or interval(2,3)"), "jme.type.no cast method");
  });
});
