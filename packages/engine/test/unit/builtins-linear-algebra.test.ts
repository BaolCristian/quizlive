// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Vector and Matrix operations` (jme-tests.mjs:1251-1320) e
// `Gauss-jordan elimination` (1321-1334) del modulo QUnit `Evaluating`,
// valutati contro `builtinScope`.
//
// ASSERT NON TRADOTTI QUI:
//   - i tre `type(...)` (`type(combine_vertically(...))`, ecc.) sono
//     RIATTIVATI dal Task 4b, che porta `type` nel tema `jme`
//     (jme-builtins.js:2394); il tipo del token resta verificato anche con
//     `.type` in TypeScript.
//   - i due costruttori `new TVector(1)` / `new TVector([1,[2],[3]])`: sono
//     asserzioni sul tipo `TVector` (Task 2), non sui builtin.
//   - i tre "input not mutated" su `matrixmath.combine_*`: già tradotti dal
//     Task 1 in math-pure.test.ts.
//   - `Gauss-jordan elimination` upstream chiama `matrixmath.gauss_jordan_elimination`
//     direttamente (già coperto da math-pure.test.ts): qui la stessa tabella
//     passa dal builtin JME.

import { describe, it, expect } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import type { Token } from "../../src/jme/tokens";
import { deepCloseEqual, closeEqual } from "./math-helpers";

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

// `toEqual` di vitest confronta anche le proprietà extra `rows`/`columns`
// attaccate all'array esterno di una `Matrix` (a differenza del `deepEqual`
// di QUnit): si confronta il solo contenuto numerico.
const plainMatrix = (m: unknown): unknown[][] => (m as unknown[][]).map((row) => [...row]);

describe("Evaluating > Vector and Matrix operations", () => {
  it("costruttori degeneri", () => {
    expect(ev("matrix([i])"), "valori complessi nelle matrici").toBeTruthy();
    expect(ev("vector()"), "vettore vuoto").toBeTruthy();
    expect(ev("vector([])"), "vettore vuoto costruito da una lista").toBeTruthy();
    expect(ev("matrix([])"), "matrice 0×0").toBeTruthy();
    expect(ev("matrix([[]])"), "matrice 1×0").toBeTruthy();
    expect(ev("vector(i)"), "valori complessi nei vettori").toBeTruthy();
  });

  it("dot e cross", () => {
    closeEqual(val(ev("dot(vector(1,2),vector(2,3))")), 8, "dot(vector(1,2),vector(2,3))");
    closeEqual(val(ev("dot(matrix([1],[2],[3]),vector(6,5,4))")), 28, "dot(matrix,vector)");
    closeEqual(val(ev("dot(vector(6,5,4),matrix([1],[2],[3]))")), 28, "dot(vector,matrix)");
    closeEqual(val(ev("dot(matrix([1],[2],[3]),matrix([1],[2],[3]))")), 14, "dot(matrix,matrix)");
    deepCloseEqual(val(ev("cross(vector(1,2,3),vector(5,6,7))")), [-4, 8, -4], "cross(vector,vector)");
    deepCloseEqual(val(ev("cross(vector(1,2,3),matrix([5,6,7]))")), [-4, 8, -4], "cross(vector,matrix)");
    deepCloseEqual(val(ev("cross(matrix([1,2,3]),vector(5,6,7))")), [-4, 8, -4], "cross(matrix,vector)");
  });

  it("det e sum_cells", () => {
    closeEqual(val(ev("det(matrix([2,4],[3,5]))")), -2, "det(matrix([2,4],[3,5]))");
    expect(() => ev("det(matrix([2,4,6],[3,5,7]))"), "det di una matrice non quadrata").toThrow(
      "matrixmath.abs.non-square",
    );
    expect(
      () => ev("det(matrix([1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]))"),
      "det di una matrice troppo grande",
    ).toThrow("matrixmath.abs.too big");
    closeEqual(val(ev("sum_cells(matrix([1,2],[3,4]))")), 10, "sum_cells(matrix([1,2],[3,4]))");
  });

  it("transpose e id", () => {
    deepCloseEqual(plainMatrix(val(ev("transpose(vector(1,2,3))"))), [[1, 2, 3]], "transpose(vector(1,2,3))");
    deepCloseEqual(plainMatrix(val(ev("transpose(matrix([1,2,3]))"))), [[1], [2], [3]], "transpose(matrix([1,2,3]))");
    deepCloseEqual(
      plainMatrix(val(ev("transpose(matrix([1],[2],[3]))"))),
      [[1, 2, 3]],
      "transpose(matrix([1],[2],[3]))",
    );
    deepCloseEqual(
      plainMatrix(val(ev("transpose(transpose(matrix([1,2,3])))"))),
      [[1, 2, 3]],
      "transpose(transpose(matrix([1,2,3])))",
    );
    deepCloseEqual(plainMatrix(val(ev("id(1)"))), [[1]], "id(1)");
    deepCloseEqual(
      plainMatrix(val(ev("id(2)"))),
      [
        [1, 0],
        [0, 1],
      ],
      "id(2)",
    );
    deepCloseEqual(
      plainMatrix(val(ev("id(3)"))),
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      "id(3)",
    );
    deepCloseEqual(
      plainMatrix(val(ev("id(4)"))),
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      "id(4)",
    );
    deepCloseEqual(val(ev("vector(1,2)*matrix([[1,2],[3,4]])")), [7, 10], "vector*matrix");
  });

  it("combine_vertically", () => {
    deepCloseEqual(
      plainMatrix(val(ev("combine_vertically(matrix([[1,2], [3,4]]), matrix([[5,6]]))"))),
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      "senza padding",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_vertically(matrix([[1,2], [3,4]]), matrix([[5]]))"))),
      [
        [1, 2],
        [3, 4],
        [5, 0],
      ],
      "con padding",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_vertically(matrix([[1,2], [3,4]]), matrix([[5,6,7]]))"))),
      [
        [1, 2, 0],
        [3, 4, 0],
        [5, 6, 7],
      ],
      "con padding",
    );
    expect(ev("combine_vertically(matrix([[1,2], [3,4]]), matrix([[5,6]]))").type).toBe("matrix");
    expect(val(ev("type(combine_vertically(matrix([[1,2], [3,4]]), matrix([[5,6]])))")), "type(combine_vertically)").toBe(
      "matrix",
    );
    closeEqual(val(ev("numrows(combine_vertically(matrix([[1,2], [3,4]]), matrix([[5,6]])))")), 3, "numrows");
    closeEqual(val(ev("numcolumns(combine_vertically(matrix([[1,2], [3,4]]), matrix([[5,6]])))")), 2, "numcolumns");
  });

  it("combine_horizontally", () => {
    deepCloseEqual(
      plainMatrix(val(ev("combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5],[6]]))"))),
      [
        [1, 2, 5],
        [3, 4, 6],
      ],
      "senza padding",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5]]))"))),
      [
        [1, 2, 5],
        [3, 4, 0],
      ],
      "con padding",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5],[6],[7]]))"))),
      [
        [1, 2, 5],
        [3, 4, 6],
        [0, 0, 7],
      ],
      "con padding",
    );
    expect(ev("combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5,6]]))").type).toBe("matrix");
    expect(
      val(ev("type(combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5,6]])))")),
      "type(combine_horizontally)",
    ).toBe("matrix");
    closeEqual(val(ev("numrows(combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5,6]])))")), 2, "numrows");
    closeEqual(val(ev("numcolumns(combine_horizontally(matrix([[1,2], [3,4]]), matrix([[5,6]])))")), 4, "numcolumns");
  });

  it("combine_diagonally", () => {
    deepCloseEqual(
      plainMatrix(val(ev("combine_diagonally(matrix([[1]]), matrix([[2]]))"))),
      [
        [1, 0],
        [0, 2],
      ],
      "due matrici 1×1",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_diagonally(matrix([[1,2,3]]), matrix([[4],[5],[6]]))"))),
      [
        [1, 2, 3, 0],
        [0, 0, 0, 4],
        [0, 0, 0, 5],
        [0, 0, 0, 6],
      ],
      "riga con colonna",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_diagonally(matrix([[1],[2],[3]]), matrix([[4,5,6]]))"))),
      [
        [1, 0, 0, 0],
        [2, 0, 0, 0],
        [3, 0, 0, 0],
        [0, 4, 5, 6],
      ],
      "colonna con riga",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_diagonally(matrix([[1,2,0,0], [3,4,0,0]]), matrix([[0,0,5,6]]))"))),
      [
        [1, 2, 0, 0, 0, 0, 0, 0],
        [3, 4, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 5, 6],
      ],
      "combine_diagonally",
    );
    deepCloseEqual(
      plainMatrix(val(ev("combine_diagonally(matrix([[1,2,0,0], [3,4,0,0]]), matrix([[0,0,5,0]]))"))),
      [
        [1, 2, 0, 0, 0, 0, 0, 0],
        [3, 4, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 5, 0],
      ],
      "combine_diagonally",
    );
    expect(val(ev("combine_diagonally(id(1),id(1))=id(2)")), "combine_diagonally(id(1),id(1))=id(2)").toBe(true);
    expect(ev("combine_diagonally(id(1),id(1))").type).toBe("matrix");
    expect(val(ev("type(combine_diagonally(id(1),id(1)))")), "type(combine_diagonally)").toBe("matrix");
    closeEqual(val(ev("numrows(combine_diagonally(id(1),id(1)))")), 2, "numrows");
    closeEqual(val(ev("numcolumns(combine_diagonally(id(1),id(1)))")), 2, "numcolumns");
  });

  it("slicing di una matrice con un range", () => {
    deepCloseEqual(
      plainMatrix(val(ev("id(4)[0..2]"))),
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
      ],
      "id(4)[0..2]",
    );
  });

  it("inverse di una matrice con componenti non intere", () => {
    // upstream usa `let(m, ..., precround(m*inverse(m),10))`: `let` arriva col
    // Task 4b, quindi ora si può usare la forma originale.
    deepCloseEqual(
      plainMatrix(
        val(
          ev(
            "let(m, matrix([0.1, 0.12, 0.123],[0.1234, 0.12345, 0.123456],[0.1234567, 0.12345678, 0.123456789]), precround(m*inverse(m),10))",
          ),
        ),
      ),
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      "m*inverse(m) è l'identità",
    );
  });
});

describe("Evaluating > Gauss-jordan elimination", () => {
  it("la tabella upstream, passando dal builtin JME", () => {
    const tests: [string, number[][]][] = [
      [
        "matrix([0,0,0],[1,0,0],[0,0,1])",
        [
          [1, 0, 0],
          [0, 0, 1],
          [0, 0, 0],
        ],
      ],
      [
        "matrix([1,0],[0,1],[2,3])",
        [
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
      [
        "matrix([2,0,4,6,12,15,24],[1,0,2,3,8,10,18],[-2,0,-4,-6,-16,-20,-18])",
        [
          [1, 0, 2, 3, 0, 0, 0],
          [0, 0, 0, 0, 1, 1.25, 0],
          [0, 0, 0, 0, 0, 0, 1],
        ],
      ],
    ];
    tests.forEach(([input, out]) => {
      deepCloseEqual(plainMatrix(val(ev(`gauss_jordan_elimination(${input})`))), out, input);
    });
  });
});

describe("Evaluating > altre funzioni di algebra lineare", () => {
  it("angle, is_zero, is_scalar_multiple, lu_decomposition", () => {
    closeEqual(val(ev("angle(vector(1,0),vector(0,1))")), Math.PI / 2, "angle(vector(1,0),vector(0,1))");
    expect(val(ev("is_zero(vector(0,0))")), "is_zero(vector(0,0))").toBe(true);
    expect(val(ev("is_zero(vector(0,1))")), "is_zero(vector(0,1))").toBe(false);
    expect(val(ev("is_scalar_multiple(vector(1,2),vector(2,4))")), "is_scalar_multiple").toBe(true);
    expect(val(ev("is_scalar_multiple(vector(1,2),vector(2,5))")), "is_scalar_multiple").toBe(false);
    const lu = val(ev("lu_decomposition(matrix([1,2],[3,4]))")) as Token[];
    expect(lu.length, "lu_decomposition dà due matrici").toBe(2);
    expect(lu[0]?.type).toBe("matrix");
    expect(lu[1]?.type).toBe("matrix");
  });

  it("listval su vettori e matrici", () => {
    closeEqual(val(ev("vector(3,4,5)[1]")), 4, "vector(3,4,5)[1]");
    deepCloseEqual(val(ev("vector(3,4,5)[0..2]")), [3, 4], "vector(3,4,5)[0..2]");
    deepCloseEqual(val(ev("matrix([1,2],[3,4])[1]")), [3, 4], "matrix([1,2],[3,4])[1]");
  });

  it("rowvector, stack e augment", () => {
    deepCloseEqual(plainMatrix(val(ev("rowvector(1,2,3)"))), [[1, 2, 3]], "rowvector(1,2,3)");
    deepCloseEqual(plainMatrix(val(ev("rowvector([1,2,3])"))), [[1, 2, 3]], "rowvector([1,2,3])");
    deepCloseEqual(
      plainMatrix(val(ev("stack(matrix([1,2]),matrix([3,4]))"))),
      [
        [1, 2],
        [3, 4],
      ],
      "stack",
    );
    deepCloseEqual(plainMatrix(val(ev("augment(matrix([1]),matrix([2]))"))), [[1, 2]], "augment");
  });

  it("transpose di una lista di liste", () => {
    const t = val(ev("transpose([[1,2],[3,4]])")) as Token[];
    expect(t.length).toBe(2);
    expect((t[0] as { value: Token[] }).value.map((x) => (x as { value: unknown }).value)).toEqual([1, 3]);
    expect((t[1] as { value: Token[] }).value.map((x) => (x as { value: unknown }).value)).toEqual([2, 4]);
  });
});
