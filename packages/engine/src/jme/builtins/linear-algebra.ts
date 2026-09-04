/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:569-859 — tema `linear_algebra`: 30 nomi, 59 firme.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TBool, TList, TMatrix, TNum, TRange, TVector, type Token } from "../tokens";
import { castToType } from "../evaluate";
import { add, sig } from "./registry";

/** Un token numerico che può portare l'informazione di precisione. */
type WithPrecision = { precisionType?: "dp" | "sigfig" | undefined; precision?: number | undefined };

/** Attacca `rows`/`columns` all'array esterno, come fa upstream prima di
 * costruire un `TMatrix`. */
function asMatrix(value: math.NumbasNumber[][], rows: number, columns: number): math.Matrix {
  const m = value as math.Matrix;
  m.rows = rows;
  m.columns = columns;
  return m;
}

/** Copia la precisione dichiarata da un token all'altro. */
function copyPrecision(to: WithPrecision, from: WithPrecision | undefined): void {
  to.precisionType = from?.precisionType;
  to.precision = from?.precision;
}

/** Registra il tema `linear_algebra` (jme-builtins.js:570-856). */
export function registerLinearAlgebra(scope: Scope): void {
  registerOperators(scope);
  registerMatrixFunctions(scope);
  registerConstructors(scope);
}

// jme-builtins.js:570-607
/** Operatori aritmetici e prodotti su vettori e matrici. */
function registerOperators(scope: Scope): void {
  add(scope, "+u", [TVector], TVector, (a: math.Vector) => a);
  add(scope, "+u", [TMatrix], TMatrix, (a: math.Matrix) => a);

  add(scope, "-u", [TVector], TVector, math.vectormath.negate);
  add(scope, "-u", [TMatrix], TMatrix, math.matrixmath.negate);
  add(scope, "+", [TVector, TVector], TVector, math.vectormath.add);
  add(scope, "+", [TMatrix, TMatrix], TMatrix, math.matrixmath.add);
  add(scope, "-", [TVector, TVector], TVector, math.vectormath.sub);
  add(scope, "-", [TMatrix, TMatrix], TMatrix, math.matrixmath.sub);
  add(scope, "*", [TNum, TVector], TVector, math.vectormath.mul);
  add(scope, "*", [TVector, TNum], TVector, (a: math.Vector, b: math.NumbasNumber) => math.vectormath.mul(b, a));
  add(scope, "*", [TMatrix, TVector], TVector, math.vectormath.matrixmul);
  add(scope, "*", [TNum, TMatrix], TMatrix, math.matrixmath.scalarmul);
  add(scope, "*", [TMatrix, TNum], TMatrix, (a: math.Matrix, b: math.NumbasNumber) => math.matrixmath.scalarmul(b, a));
  add(scope, "*", [TMatrix, TMatrix], TMatrix, math.matrixmath.mul);
  add(scope, "*", [TVector, TMatrix], TVector, math.vectormath.vectormatrixmul);
  add(scope, "/", [TMatrix, TNum], TMatrix, (a: math.Matrix, b: math.NumbasNumber) =>
    math.matrixmath.scalardiv(a, b),
  );
  add(scope, "/", [TVector, TNum], TVector, (a: math.Vector, b: math.NumbasNumber) => math.vectormath.div(a, b));

  add(scope, "dot", [TVector, TVector], TNum, math.vectormath.dot);
  add(scope, "dot", [TMatrix, TVector], TNum, math.vectormath.dot);
  add(scope, "dot", [TVector, TMatrix], TNum, math.vectormath.dot);
  add(scope, "dot", [TMatrix, TMatrix], TNum, math.vectormath.dot);
  add(scope, "cross", [TVector, TVector], TVector, math.vectormath.cross);
  add(scope, "cross", [TMatrix, TVector], TVector, math.vectormath.cross);
  add(scope, "cross", [TVector, TMatrix], TVector, math.vectormath.cross);
  add(scope, "cross", [TMatrix, TMatrix], TVector, math.vectormath.cross);
}

// jme-builtins.js:608-665
/** Funzioni su matrici e vettori. */
function registerMatrixFunctions(scope: Scope): void {
  add(scope, "det", [TMatrix], TNum, math.matrixmath.abs);
  add(scope, "numrows", [TMatrix], TNum, (m: math.Matrix) => m.rows);
  add(scope, "numcolumns", [TMatrix], TNum, (m: math.Matrix) => m.columns);
  add(scope, "angle", [TVector, TVector], TNum, math.vectormath.angle);
  add(scope, "transpose", [TVector], TMatrix, math.vectormath.transpose);
  add(scope, "transpose", [TMatrix], TMatrix, math.matrixmath.transpose);
  add(scope, "transpose", ["list of list"], TList, null, {
    evaluate: (args) => {
      const lists = ((args as Token[])[0] as TList).value as TList[];
      const l = Math.min(...lists.map((x) => (x.value as Token[]).length));
      const o: TList[] = [];
      for (let i = 0; i < l; i++) {
        o.push(new TList(lists.map((x) => (x.value as Token[])[i] as Token)));
      }
      return new TList(o);
    },
  });
  add(scope, "is_zero", [TVector], TBool, math.vectormath.is_zero);
  add(scope, "id", [TNum], TMatrix, math.matrixmath.id);
  add(scope, "sum_cells", [TMatrix], TNum, math.matrixmath.sum_cells);
  // upstream: seconda registrazione (righe 632/635) irraggiungibile, omessa —
  // firma identica alla prima, e a parità vince il primo registrato
  // (inventario §8.9).
  add(scope, "combine_vertically", [TMatrix, TMatrix], TMatrix, (m1: math.Matrix, m2: math.Matrix) =>
    math.matrixmath.combine_vertically(m1, m2),
  );
  add(scope, "stack", [TMatrix, TMatrix], TMatrix, (m1: math.Matrix, m2: math.Matrix) =>
    math.matrixmath.combine_vertically(m1, m2),
  );
  add(scope, "combine_horizontally", [TMatrix, TMatrix], TMatrix, (m1: math.Matrix, m2: math.Matrix) =>
    math.matrixmath.combine_horizontally(m1, m2),
  );
  add(scope, "augment", [TMatrix, TMatrix], TMatrix, (m1: math.Matrix, m2: math.Matrix) =>
    math.matrixmath.combine_horizontally(m1, m2),
  );
  add(scope, "combine_diagonally", [TMatrix, TMatrix], TMatrix, (m1: math.Matrix, m2: math.Matrix) =>
    math.matrixmath.combine_diagonally(m1, m2),
  );
  add(scope, "lu_decomposition", [TMatrix], TList, null, {
    evaluate: (args) => {
      const m = ((args as Token[])[0] as TMatrix).value;
      const [L, U] = math.matrixmath.lu_decomposition(m);
      return new TList([new TMatrix(L), new TMatrix(U)]);
    },
  });

  add(scope, "gauss_jordan_elimination", [TMatrix], TMatrix, math.matrixmath.gauss_jordan_elimination);

  add(scope, "inverse", [TMatrix], TMatrix, math.matrixmath.inverse);
  add(
    scope,
    "is_scalar_multiple",
    [TVector, TVector, sig.optional(sig.type("number")), sig.optional(sig.type("number"))],
    TBool,
    math.is_scalar_multiple,
  );
  add(scope, "abs", [TVector], TNum, math.vectormath.abs);
}

// jme-builtins.js:666-856
/** `listval` su vettori/matrici e i costruttori `vector`/`matrix`/`rowvector`. */
function registerConstructors(scope: Scope): void {
  add(scope, "listval", [TVector, TNum], TNum, null, {
    evaluate: (args) => {
      const vector = ((args as Token[])[0] as TVector).value;
      const index = math.wrapListIndex(((args as Token[])[1] as TNum).value as number, vector.length);
      return new TNum((vector[index] || 0) as number);
    },
  });
  add(scope, "listval", [TVector, TRange], TVector, null, {
    evaluate: (args) => {
      const range = ((args as Token[])[1] as TRange).value as math.Range;
      const vector = ((args as Token[])[0] as TVector).value;
      const start = math.wrapListIndex(range[0], vector.length);
      const end = math.wrapListIndex(range[1], vector.length);
      const v: math.NumbasNumber[] = [];
      for (let i = start; i < end; i++) {
        v.push(vector[i] || 0);
      }
      return new TVector(v);
    },
  });
  add(scope, "listval", [TMatrix, TNum], TVector, null, {
    evaluate: (args) => {
      const matrix = ((args as Token[])[0] as TMatrix).value;
      const index = math.wrapListIndex(((args as Token[])[1] as TNum).value as number, matrix.length);
      return new TVector((matrix[index] || []) as math.NumbasNumber[]);
    },
  });
  add(scope, "listval", [TMatrix, TRange], TMatrix, null, {
    evaluate: (args) => {
      const range = ((args as Token[])[1] as TRange).value as math.Range;
      const matrix = ((args as Token[])[0] as TMatrix).value;
      const start = math.wrapListIndex(range[0], matrix.length);
      const end = math.wrapListIndex(range[1], matrix.length);
      const sliced = matrix.slice(start, end) as math.NumbasNumber[][];
      return new TMatrix(asMatrix(sliced, end - start, matrix.columns));
    },
  });

  add(scope, "vector", [sig.multiple(sig.type("number"))], TVector, null, {
    evaluate: (args) => {
      const tokens = args as TNum[];
      const value: math.NumbasNumber[] = [];
      for (let i = 0; i < tokens.length; i++) {
        value.push((tokens[i] as TNum).value);
      }
      const t = new TVector(value);
      if (tokens.length > 0) {
        copyPrecision(t, tokens[0]);
      }
      return t;
    },
  });
  add(scope, "vector", [sig.listof(sig.type("number"))], TVector, null, {
    evaluate: (args) => {
      const list = (args as Token[])[0] as TList;
      const items = (list.value ?? []) as TNum[];
      const value = items.map((x) => x.value);
      const t = new TVector(value);
      if (items.length > 0) {
        copyPrecision(t, items[0]);
      }
      return t;
    },
  });

  add(scope, "matrix", [sig.listof(sig.type("vector"))], TMatrix, null, {
    evaluate: (args) => {
      const list = (args as Token[])[0] as TList;
      const items = (list.value ?? []) as TVector[];
      let rows = list.vars;
      let columns = 0;
      let value: math.NumbasNumber[][] = [];
      if (!items.length) {
        rows = 0;
        columns = 0;
      } else {
        value = items.map((v) => v.value);
        columns = (items[0] as TVector).value.length;
      }
      const t = new TMatrix(asMatrix(value, rows, columns));
      if (items.length > 0) {
        copyPrecision(t, items[0]);
      }
      return t;
    },
  });
  add(scope, "matrix", [sig.listof(sig.listof(sig.type("number")))], TMatrix, null, {
    evaluate: (args) => {
      const list = (args as Token[])[0] as TList;
      const items = (list.value ?? []) as TList[];
      let rows = list.vars;
      let columns = 0;
      const value: math.NumbasNumber[][] = [];
      if (!items.length) {
        rows = 0;
        columns = 0;
      } else {
        for (let i = 0; i < rows; i++) {
          const row = ((items[i] as TList).value ?? []) as TNum[];
          value.push(row.map((x) => x.value));
          columns = Math.max(columns, row.length);
        }
      }
      const t = new TMatrix(asMatrix(value, rows, columns));
      if (rows > 0 && columns > 0) {
        copyPrecision(t, ((items[0] as TList).value as TNum[])[0]);
      }
      return t;
    },
  });
  add(scope, "matrix", [sig.listof(sig.type("number"))], TMatrix, null, {
    evaluate: (args) => {
      const list = (args as Token[])[0] as TList;
      const items = (list.value ?? []) as Token[];
      let rows: number;
      let columns: number;
      let value: math.NumbasNumber[][] = [];
      if (!items.length) {
        rows = 0;
        columns = 0;
      } else {
        value = [items.map((e) => (castToType(e, "number") as TNum).value)];
        rows = 1;
        columns = list.vars;
      }
      const t = new TMatrix(asMatrix(value, rows, columns));
      if (rows > 0 && columns > 0) {
        copyPrecision(t, items[0] as WithPrecision);
      }
      return t;
    },
  });
  add(scope, "matrix", [sig.multiple(sig.listof(sig.type("number")))], TMatrix, null, {
    evaluate: (args) => {
      const lists = args as TList[];
      const rows = lists.length;
      let columns = 0;
      const value: math.NumbasNumber[][] = [];
      for (let i = 0; i < lists.length; i++) {
        const row = ((lists[i] as TList).value ?? []) as TNum[];
        value.push(row.map((x) => x.value));
        columns = Math.max(columns, row.length);
      }
      const t = new TMatrix(asMatrix(value, rows, columns));
      if (rows > 0 && columns > 0) {
        copyPrecision(t, ((lists[0] as TList).value as TNum[])[0]);
      }
      return t;
    },
  });

  add(scope, "rowvector", [sig.multiple(sig.type("number"))], TMatrix, null, {
    evaluate: (args) => {
      const tokens = args as TNum[];
      const row: math.NumbasNumber[] = [];
      for (let i = 0; i < tokens.length; i++) {
        row.push((tokens[i] as TNum).value);
      }
      const matrix = asMatrix([row], 1, row.length);
      const t = new TMatrix(matrix);
      if (matrix.columns > 0) {
        copyPrecision(t, tokens[0]);
      }
      return t;
    },
  });
  add(scope, "rowvector", [sig.listof(sig.type("number"))], TMatrix, null, {
    evaluate: (args) => {
      const list = (args as Token[])[0] as TList;
      const items = (list.value ?? []) as TNum[];
      const row = items.map((x) => x.value);
      const matrix = asMatrix([row], 1, row.length);
      const t = new TMatrix(matrix);
      if (matrix.columns > 0) {
        copyPrecision(t, items[0]);
      }
      return t;
    },
  });
}
