// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `List operations` (jme-tests.mjs:1373-1440) e `Dictionaries`
// (1441-1457) del modulo QUnit `Evaluating`, più gli assert dei blocchi già
// tradotti dal Task 4a che erano rimandati al Task 4b perché usano i temi
// `lists`/`dictionaries` (jme-builtins.js:1195-1659):
//   - `Range operations` (1335): `-2..11 except [1,2,3,5,8]`, `-2..11 except []`,
//     `-2..2 except [1,"a",0]` (la firma `except [TList,TList]` del tema
//     `lists`, riga 1215, che vince su quella di `number_ranges`).
//   - `Arithmetic` (698): `[1,2]+[3,4]`, `[1,2]+3`, `["x","y"]+"z"`.
//   - `Number functions` (845): `abs([1,2,3,4])`.
//
// RIMANDATO AL TASK 5 (serve `jme.display`):
//   - `sort([expression('5'),expression('3')])` e
//     `sort_destinations([expression('5'),expression('3')])` sono tradotti,
//     perché `compareTokens` sugli `expression` non passa dal display; è
//     `jme_string`/`string(expression)` che ne ha bisogno, e quello è nel
//     Task 5.
//   - `transpose([[1,2],[3,4,5]])` è già coperto da
//     builtins-linear-algebra.test.ts (Task 4a).

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { builtinScope } from "../../src/jme/builtins";
import { unwrapValue } from "../../src/jme/evaluate";
import type { Token } from "../../src/jme/tokens";
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

/** I valori JS dei token di una lista (l'equivalente di `.value.map(getValue)`). */
function values(expr: string): unknown[] {
  return (val(ev(expr)) as Token[]).map((x) => val(x));
}

describe("Evaluating > List operations", () => {
  it("except", () => {
    deepCloseEqual(values('["a","b","c"] except "a"'), ["b", "c"], '["a","b","c"] except "a"');
    deepCloseEqual(values('["a","b","c"] except ["a","c","f"]'), ["b"], '["a","b","c"] except ["a","c","f"]');
    // rimandati dal Task 4a (builtins-intervals.test.ts): la firma di `lists`
    // vince su quella di `number_ranges` per liste miste o vuote.
    deepCloseEqual(values("-2..11 except [1,2,3,5,8]"), [-2, -1, 0, 4, 6, 7, 9, 10, 11], "-2..11 except [1,2,3,5,8]");
    deepCloseEqual(
      values("-2..11 except []"),
      [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      "-2..11 except []",
    );
    deepCloseEqual(values('-2..2 except [1,"a",0]'), [-2, -1, 2], '-2..2 except [1,"a",0]');
  });

  it("listval su liste", () => {
    deepCloseEqual(values('["a","b","c","d","e"][0..2]'), ["a", "b"], '["a","b","c","d","e"][0..2]');
    deepCloseEqual(values('["a","b","c","d","e"][0..5#2]'), ["a", "c", "e"], '["a","b","c","d","e"][0..5#2]');
    closeEqual(val(ev('["a","b","c"][1]')), "b", '["a","b","c"][1]');
    closeEqual(val(ev('["a","b","c"][-1]')), "c", "indice negativo dal fondo");
    raisesJmeError(() => ev('["a","b","c"][5]'), "jme.func.listval.invalid index", "indice fuori dalla lista");
  });

  it("all e some", () => {
    expect(val(ev("all([])")), "all([])").toBe(true);
    expect(val(ev("all([true])")), "all([true])").toBe(true);
    expect(val(ev("all([false])")), "all([false])").toBe(false);
    expect(val(ev("all([true,false])")), "all([true,false])").toBe(false);
    expect(val(ev("all([false,true])")), "all([false,true])").toBe(false);
    expect(val(ev("all([true,true])")), "all([true,true])").toBe(true);

    expect(val(ev("some([])")), "some([])").toBe(false);
    expect(val(ev("some([true])")), "some([true])").toBe(true);
    expect(val(ev("some([false])")), "some([false])").toBe(false);
    expect(val(ev("some([true,false])")), "some([true,false])").toBe(true);
    expect(val(ev("some([false,true])")), "some([false,true])").toBe(true);
    expect(val(ev("some([true,true])")), "some([true,true])").toBe(true);
    expect(val(ev("some([false,false])")), "some([false,false])").toBe(false);
  });

  it("sort", () => {
    deepCloseEqual(unwrapValue(ev("sort([1,2,3])")), [1, 2, 3], "sort([1,2,3])");
    deepCloseEqual(unwrapValue(ev("sort([2,1,3])")), [1, 2, 3], "sort([2,1,3])");
    deepCloseEqual(
      (unwrapValue(ev("sort([expression('5'),expression('3')])")) as Array<{ tok: { value: unknown } }>).map(
        (t) => t.tok.value,
      ),
      [3, 5],
      "sort([expression('5'),expression('3')])",
    );
    deepCloseEqual(unwrapValue(ev('sort([2,1 as "number"])')), [1, 2], 'sort([2,1 as "number"])');
    deepCloseEqual(
      (unwrapValue(ev("sort([1/2, 1/4, 1/2, 1/4])")) as math.Fraction[]).map((n) => n.toFloat()),
      [0.25, 0.25, 0.5, 0.5],
      "sort([1/2,1/4,1/2,1/4])",
    );
  });

  it("sort_destinations", () => {
    deepCloseEqual(unwrapValue(ev("sort_destinations([1,2,3])")), [0, 1, 2], "sort_destinations([1,2,3])");
    deepCloseEqual(unwrapValue(ev("sort_destinations([2,1,3])")), [1, 0, 2], "sort_destinations([2,1,3])");
    deepCloseEqual(
      unwrapValue(ev("sort_destinations([expression('5'),expression('3')])")),
      [1, 0],
      "sort_destinations([expression('5'),expression('3')])",
    );
  });

  it("sort_by", () => {
    deepCloseEqual(
      unwrapValue(ev("sort_by(0,[[0,5], [1,3]])")),
      [
        [0, 5],
        [1, 3],
      ],
      "sort_by(0,[[0,5],[1,3]])",
    );
    deepCloseEqual(
      unwrapValue(ev("sort_by(1,[[0,5], [1,3]])")),
      [
        [1, 3],
        [0, 5],
      ],
      "sort_by(1,[[0,5],[1,3]])",
    );
    deepCloseEqual(
      unwrapValue(ev("sort_by(2,[[0,5], [1,3]])")),
      [
        [0, 5],
        [1, 3],
      ],
      "sort_by(2,[[0,5],[1,3]])",
    );
    deepCloseEqual(
      unwrapValue(ev("sort_by(2,[[0,5], [1,3,2]])")),
      [
        [1, 3, 2],
        [0, 5],
      ],
      "sort_by(2,[[0,5],[1,3,2]])",
    );
    deepCloseEqual(
      unwrapValue(ev("sort_by('a',[['a':0,'b':5], ['a':1,'b':3]])")),
      [
        { a: 0, b: 5 },
        { a: 1, b: 3 },
      ],
      "sort_by('a',...)",
    );
    deepCloseEqual(
      unwrapValue(ev("sort_by('b',[['a':0,'b':5], ['a':1,'b':3]])")),
      [
        { a: 1, b: 3 },
        { a: 0, b: 5 },
      ],
      "sort_by('b',...)",
    );
    deepCloseEqual(
      unwrapValue(ev("sort_by('c',[['a':0,'b':5], ['c':1,'b':3]])")),
      [
        { c: 1, b: 3 },
        { a: 0, b: 5 },
      ],
      "sort_by('c',...)",
    );
  });

  it("dict con argomenti sbagliati", () => {
    raisesJmeError(() => ev("dict(2)"), "jme.typecheck.no right type definition", "dict(2)");
    raisesJmeError(() => ev('dict(["a",1])'), "jme.typecheck.no right type definition", 'dict(["a",1])');
  });

  it("sum e prod", () => {
    closeEqual(val(ev("sum([])")), 0, "sum([])");
    expect(ev("sum([])").type, "sum([]) ritorna un number").toBe("number");
    closeEqual(val(ev("sum([1,2,3])")), 6, "sum([1,2,3])");
    expect(ev("sum([1,2,3])").type, "sum([1,2,3]) ritorna un integer").toBe("integer");
    expect(ev("sum([1.1,2,3])").type, "sum([1.1,2,3]) ritorna un number").toBe("number");
    expect(ev("sum([dec(1), pi])").type, "sum([dec(1), pi]) ritorna un decimal").toBe("decimal");
    expect(String(val(ev("sum([1/2, 3/4])"))), "sum([1/2, 3/4])").toBe("5/4");
    expect(ev("sum([1/2, 3/4])").type, "sum([1/2, 3/4]) ritorna un rational").toBe("rational");
    expect(ev("sum([1, 1/2, dec(3)])").type, "sum([1, 1/2, dec(3)]) ritorna un decimal").toBe("decimal");
    expect(ev("sum([1, 1/2, dec(3), 1.1])").type, "sum([1, 1/2, dec(3), 1.1]) ritorna un decimal").toBe("decimal");

    closeEqual(val(ev("prod([])")), 1, "prod([])");
    closeEqual(val(ev("prod([2,3,4])")), 24, "prod([2,3,4])");
    expect(ev("prod([])").type, "prod([]) ritorna un number").toBe("number");
    expect(ev("prod([2,3,4])").type, "prod([2,3,4]) ritorna un integer").toBe("integer");
    expect(ev("prod([2.1,3,4])").type, "prod([2.1,3,4]) ritorna un number").toBe("number");
    expect(ev("prod([dec(2), pi])").type, "prod([dec(2), pi]) ritorna un decimal").toBe("decimal");
    expect(String(val(ev("prod([1/2, 3/4])"))), "prod([1/2, 3/4])").toBe("3/8");
    expect(ev("prod([1/2, 3/4])").type, "prod([1/2, 3/4]) ritorna un rational").toBe("rational");
    expect(ev("prod([1, 1/2, dec(3)])").type, "prod([1, 1/2, dec(3)]) ritorna un decimal").toBe("decimal");
    expect(ev("prod([1, 1/2, dec(3), 1.1])").type, "prod([1, 1/2, dec(3), 1.1]) ritorna un decimal").toBe("decimal");

    raisesJmeError(() => ev('sum(["a","b"])'), "jme.typecheck.no right type definition", 'sum(["a","b"])');
  });

  it("gli assert di Arithmetic e Number functions rimandati dal Task 4a", () => {
    deepCloseEqual(values("[1,2]+[3,4]"), [1, 2, 3, 4], "[1,2]+[3,4]");
    deepCloseEqual(values("[1,2]+3"), [1, 2, 3], "[1,2]+3");
    deepCloseEqual(values('["x","y"]+"z"'), ["x", "y", "z"], '["x","y"]+"z"');
    closeEqual(val(ev("abs([1,2,3,4])")), 4, "abs([1,2,3,4])");
  });

  it("le altre funzioni di lista del tema (jme-builtins.js:1209-1547)", () => {
    deepCloseEqual(unwrapValue(ev("list(1..5)")), [1, 2, 3, 4, 5], "list(1..5)");
    deepCloseEqual(unwrapValue(ev("distinct([1,2,1,3,2])")), [1, 2, 3], "distinct");
    expect(val(ev("2 in [1,2,3]")), "in su una lista").toBe(true);
    deepCloseEqual(unwrapValue(ev("reorder([10,20,30],[2,0,1])")), [30, 10, 20], "reorder");
    deepCloseEqual(unwrapValue(ev("flatten([[1,2],[3]])")), [1, 2, 3], "flatten");
    deepCloseEqual(unwrapValue(ev("groups_of([1,2,3,4,5],2)")), [[1, 2], [3, 4], [5]], "groups_of");
    deepCloseEqual(
      unwrapValue(ev("enumerate(['a','b'])")),
      [
        [0, "a"],
        [1, "b"],
      ],
      "enumerate",
    );
    deepCloseEqual(unwrapValue(ev("reverse([1,2,3])")), [3, 2, 1], "reverse");
    deepCloseEqual(unwrapValue(ev("indices([1,2,1],1)")), [0, 2], "indices");
    deepCloseEqual(
      unwrapValue(ev("product([1,2],[3,4])")),
      [
        [1, 3],
        [1, 4],
        [2, 3],
        [2, 4],
      ],
      "product di due liste",
    );
    deepCloseEqual(
      unwrapValue(ev("product([1,2],2)")),
      [
        [1, 1],
        [1, 2],
        [2, 1],
        [2, 2],
      ],
      "product come potenza cartesiana",
    );
    deepCloseEqual(
      unwrapValue(ev("zip([1,2],[3,4])")),
      [
        [1, 3],
        [2, 4],
      ],
      "zip",
    );
    deepCloseEqual(
      unwrapValue(ev("combinations([1,2,3],2)")),
      [
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      "combinations",
    );
    deepCloseEqual(
      unwrapValue(ev("combinations_with_replacement([1,2],2)")),
      [
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      "combinations_with_replacement",
    );
    deepCloseEqual(
      unwrapValue(ev("permutations([1,2],2)")),
      [
        [1, 2],
        [2, 1],
      ],
      "permutations",
    );
    deepCloseEqual(
      unwrapValue(ev("frequencies([1,2,1])")),
      [
        [1, 2],
        [2, 1],
      ],
      "frequencies",
    );
    deepCloseEqual(
      unwrapValue(ev("group_by(0,[[0,5],[1,3],[0,4]])")),
      [
        [
          0,
          [
            [0, 5],
            [0, 4],
          ],
        ],
        [1, [[1, 3]]],
      ],
      "group_by",
    );
  });
});

describe("Evaluating > Dictionaries", () => {
  it("costruzione e accesso", () => {
    expect(builtinScope.parser.compile('["a": -1]'), "operazione prefissa come valore di un elemento").toBeTruthy();
    closeEqual(val(ev('["a": 1]["a"]')), 1, '["a": 1]["a"] = 1');
    closeEqual(val(ev('dict("a": 1, "b": 2)["a"]')), 1, 'dict("a": 1, "b": 2)["a"] = 1');
    raisesJmeError(() => ev('["a": 1]["b"]'), "jme.func.listval.key not in dict", '["a": 1]["b"]');
    deepCloseEqual(values('keys( ["a": 1, "b": 2] )'), ["a", "b"], "keys");
    deepCloseEqual(values('values( ["a": 1, "b": 2] )'), [1, 2], "values");
    deepCloseEqual(
      unwrapValue(ev('items( ["a": 1, "b": 2] )')),
      [
        ["a", 1],
        ["b", 2],
      ],
      "items",
    );
    expect(val(ev('"a" in ["a": 1]')), '"a" in ["a": 1]').toBe(true);
    expect(val(ev('"b" in ["a": 1]')), '"b" in ["a": 1]').toBe(false);
    expect(val(ev('"__proto__" in dict()')), '"__proto__" in dict()').toBe(false);
    deepCloseEqual(
      unwrapValue(ev('["a":1,"b":2]+["a":4,"c":3]')),
      { a: 4, b: 2, c: 3 },
      '["a":1,"b":2]+["a":4,"c":3]',
    );
    deepCloseEqual(
      unwrapValue(ev('map(let(bits,x,["a":bits]),x,[1,2,3])')),
      [{ a: 1 }, { a: 2 }, { a: 3 }],
      'map(let(bits,x,["a":bits]),x,[1,2,3])',
    );
    deepCloseEqual(unwrapValue(ev('dict([["a",1],["b",2]])')), { a: 1, b: 2 }, 'dict([["a",1],["b",2]])');
    deepCloseEqual(unwrapValue(ev('let(["x":1],x)')), 1, 'let(["x":1],x)');
  });

  it("le altre funzioni del tema (jme-builtins.js:1570-1655)", () => {
    deepCloseEqual(unwrapValue(ev('merge(["a":1],["b":2])')), { a: 1, b: 2 }, "merge di più dizionari");
    deepCloseEqual(unwrapValue(ev('merge([["a":1],["b":2]])')), { a: 1, b: 2 }, "merge di una lista di dizionari");
    deepCloseEqual(unwrapValue(ev('values(["a":1,"b":2], ["b","a"])')), [2, 1], "values con le chiavi scelte");
    raisesJmeError(
      () => ev('values(["a":1], ["z"])'),
      "jme.func.listval.key not in dict",
      "values con una chiave assente",
    );
    closeEqual(val(ev('get(["a":1], "a", 0)')), 1, "get di una chiave presente");
    closeEqual(val(ev('get(["a":1], "z", 7)')), 7, "get di una chiave assente");
    closeEqual(val(ev('abs(["a":1,"b":2])')), 2, "abs di un dizionario");
  });
});
