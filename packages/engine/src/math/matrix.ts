/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:3195-3748 — `Numbas.matrixmath`, esposto qui come namespace
// `matrixmath` (re-esportato da index.ts con `export * as matrixmath`).
// Le matrici sono array di array con proprietà extra `rows`/`columns`
// attaccate all'array esterno (§6.8 dell'inventario) — si costruiscono con
// l'helper `makeMatrix`, mai con un literal semplice. I nomi esportati
// replicano quelli upstream, quindi le funzioni scalari equivalenti di
// `complex.ts`/`compare.ts` sono importate con un alias.

import type { NumbasNumber, Matrix } from "./types";
import {
  negate as scalarNegate,
  add as scalarAdd,
  sub as scalarSub,
  mul as scalarMul,
  div as scalarDiv,
} from "./complex";
import { eq as scalarEq } from "./compare";
import { precround as scalarPrecround, siground as scalarSiground } from "./rounding";
import { Fraction } from "./fraction";
import { MathError } from "../errors";

/** Costruisce una `Matrix` a partire da un array di righe, impostando
 * sempre `rows`/`columns` (brief, ambiguità 1). */
export function makeMatrix(rows: NumbasNumber[][]): Matrix {
  const m = rows as Matrix;
  m.rows = rows.length;
  m.columns = rows.length > 0 ? rows[0]!.length : 0;
  return m;
}

/** Come `makeMatrix`, ma per matrici di `Fraction` (usato da `fraction_matrix`
 * e dalle funzioni di riduzione a scala). */
type FractionMatrix = Fraction[][] & { rows: number; columns: number };
function makeFractionMatrix(rows: Fraction[][]): FractionMatrix {
  const m = rows as FractionMatrix;
  m.rows = rows.length;
  m.columns = rows.length > 0 ? rows[0]!.length : 0;
  return m;
}

// math.js:3201-3211
/** Nega una matrice - nega ciascuno dei suoi elementi. */
export function negate(m: Matrix): Matrix {
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < m.rows; i++) {
    rows.push(m[i]!.map((x) => scalarNegate(x)));
  }
  return makeMatrix(rows);
}

// math.js:3218-3232
/** Somma due matrici. */
export function add(a: Matrix, b: Matrix): Matrix {
  const rows_ = Math.max(a.rows, b.rows);
  const columns = Math.max(a.columns, b.columns);
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < rows_; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < columns; j++) {
      row[j] = scalarAdd(a[i]?.[j] || 0, b[i]?.[j] || 0);
    }
  }
  return makeMatrix(rows);
}

// math.js:3239-3253
/** Sottrae una matrice da un'altra. */
export function sub(a: Matrix, b: Matrix): Matrix {
  const rows_ = Math.max(a.rows, b.rows);
  const columns = Math.max(a.columns, b.columns);
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < rows_; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < columns; j++) {
      row[j] = scalarSub(a[i]?.[j] || 0, b[i]?.[j] || 0);
    }
  }
  return makeMatrix(rows);
}

// math.js:3260-3279
/** Determinante di una matrice. Funziona solo fino a matrici 3×3. */
export function abs(m: Matrix): NumbasNumber {
  if (m.rows != m.columns) {
    throw new MathError("matrixmath.abs.non-square");
  }
  switch (m.rows) {
    case 1:
      return m[0]![0]!;
    case 2:
      return scalarSub(scalarMul(m[0]![0]!, m[1]![1]!), scalarMul(m[0]![1]!, m[1]![0]!));
    case 3:
      return scalarAdd(
        scalarSub(
          scalarMul(m[0]![0]!, scalarSub(scalarMul(m[1]![1]!, m[2]![2]!), scalarMul(m[1]![2]!, m[2]![1]!))),
          scalarMul(m[0]![1]!, scalarSub(scalarMul(m[1]![0]!, m[2]![2]!), scalarMul(m[1]![2]!, m[2]![0]!)))
        ),
        scalarMul(m[0]![2]!, scalarSub(scalarMul(m[1]![0]!, m[2]![1]!), scalarMul(m[1]![1]!, m[2]![0]!)))
      );
    default:
      throw new MathError("matrixmath.abs.too big");
  }
}

// math.js:3287-3296
/** Moltiplica una matrice per uno scalare. */
export function scalarmul(k: NumbasNumber, m: Matrix): Matrix {
  const out = makeMatrix(m.map((row) => row.map((x) => scalarMul(k, x))));
  return out;
}

// math.js:3303-3312
/** Divide una matrice per uno scalare. */
export function scalardiv(m: Matrix, k: NumbasNumber): Matrix {
  const out = makeMatrix(m.map((row) => row.map((x) => scalarDiv(x, k))));
  return out;
}

// math.js:3320-3339
/** Moltiplica due matrici. */
export function mul(a: Matrix, b: Matrix): Matrix {
  if (a.columns != b.rows) {
    throw new MathError("matrixmath.mul.different sizes");
  }
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < a.rows; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < b.columns; j++) {
      let s: NumbasNumber = 0;
      for (let k = 0; k < a.columns; k++) {
        s = scalarAdd(s, scalarMul(a[i]![k]!, b[k]![j]!));
      }
      row.push(s);
    }
  }
  return makeMatrix(rows);
}

// math.js:3346-3359
/** Due matrici sono uguali? Vero se ogni coppia di elementi corrispondenti è uguale. */
export function eq(a: Matrix, b: Matrix): boolean {
  const rows = Math.max(a.rows, b.rows);
  const columns = Math.max(a.columns, b.columns);
  for (let i = 0; i < rows; i++) {
    const rowA = a[i] || [];
    const rowB = b[i] || [];
    for (let j = 0; j < columns; j++) {
      if (!scalarEq(rowA[j] || 0, rowB[j] || 0)) {
        return false;
      }
    }
  }
  return true;
}

// math.js:3367-3369
/** Due matrici sono diverse? */
export function neq(a: Matrix, b: Matrix): boolean {
  return !eq(a, b);
}

// math.js:3375-3386
/** Costruisce una matrice identità `N×N`. */
export function id(n: number): Matrix {
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < n; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < n; j++) {
      row.push(j == i ? 1 : 0);
    }
  }
  return makeMatrix(rows);
}

// math.js:3392-3404
/** Trasposta di una matrice. */
export function transpose(m: Matrix): Matrix {
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < m.columns; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < m.rows; j++) {
      row.push(m[j]![i] || 0);
    }
  }
  return makeMatrix(rows);
}

// math.js:3411-3419 — upstream: usa `+=` diretto (non `math.add`), quindi
// non gestisce correttamente le celle complesse — portato identico.
/** Somma di tutte le celle. */
export function sum_cells(m: Matrix): number {
  let t = 0;
  m.forEach((row) => {
    row.forEach((cell) => {
      t += cell as number;
    });
  });
  return t;
}

// math.js:3425-3427
/** Numero di righe di una matrice. */
export function numrows(m: Matrix): number {
  return m.rows;
}

// math.js:3433-3435
/** Numero di colonne di una matrice. */
export function numcolumns(m: Matrix): number {
  return m.columns;
}

// math.js:3442-3453
/** Combina due matrici verticalmente. */
export function combine_vertically(m1: Matrix, m2: Matrix): Matrix {
  const rows_ = m1.rows + m2.rows;
  const columns = m1.columns > m2.columns ? m1.columns : m2.columns;
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < rows_; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < columns; j++) {
      row.push(i < m1.rows && j < m1.columns ? m1[i]![j]! : i >= m1.rows && j < m2.columns ? m2[i - m1.rows]![j]! : 0);
    }
  }
  return makeMatrix(rows);
}

// math.js:3461-3472
/** Combina due matrici orizzontalmente. */
export function combine_horizontally(m1: Matrix, m2: Matrix): Matrix {
  const columns_ = m1.columns + m2.columns;
  const rows_ = m1.rows > m2.rows ? m1.rows : m2.rows;
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < rows_; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < columns_; j++) {
      row.push(
        j < m1.columns && i < m1.rows ? m1[i]![j]! : j >= m1.columns && i < m2.rows ? m2[i]![j - m1.columns]! : 0
      );
    }
  }
  return makeMatrix(rows);
}

// math.js:3480-3491
/** Combina due matrici diagonalmente. */
export function combine_diagonally(m1: Matrix, m2: Matrix): Matrix {
  const rows_ = m1.rows + m2.rows;
  const columns_ = m1.columns + m2.columns;
  const rows: NumbasNumber[][] = [];
  for (let i = 0; i < rows_; i++) {
    const row: NumbasNumber[] = [];
    rows.push(row);
    for (let j = 0; j < columns_; j++) {
      row.push(
        i < m1.rows && j < m1.columns
          ? m1[i]![j]!
          : i >= m1.rows && j >= m1.columns
            ? m2[i - m1.rows]![j - m1.columns]!
            : 0
      );
    }
  }
  return makeMatrix(rows);
}

// math.js:3500-3507
/** Applica una funzione a ciascun elemento. */
export function map(m: Matrix, fn: (x: NumbasNumber) => NumbasNumber): Matrix {
  return makeMatrix(m.map((row) => row.map(fn)));
}

// math.js:3515-3519
/** Arrotonda ogni elemento al numero dato di cifre decimali. */
export function precround(m: Matrix, dp: number): Matrix {
  return map(m, (n) => scalarPrecround(n, dp));
}

// math.js:3527-3531
/** Arrotonda ogni elemento al numero dato di cifre significative. */
export function siground(m: Matrix, sf: number): Matrix {
  return map(m, (n) => scalarSiground(n, sf));
}

// math.js:3538-3575
/** Decomposizione LU: decompone una matrice quadrata `m` in una matrice
 * triangolare inferiore `L` e una superiore `U`, con `m = L*U`. */
export function lu_decomposition(m: Matrix): [Matrix, Matrix] {
  if (m.rows != m.columns) {
    throw new MathError("matrixmath.not square");
  }
  const n = m.rows;

  const L = makeMatrix(m.map((row) => row.map(() => 0 as NumbasNumber)));
  const U = makeMatrix(m.map((row) => row.map(() => 0 as NumbasNumber)));

  for (let i = 0; i < n; i++) {
    U[i]![i] = 1;
  }

  for (let j = 0; j < n; j++) {
    for (let i = j; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += (L[i]![k]! as number) * (U[k]![j]! as number);
      }
      L[i]![j] = (m[i]![j]! as number) - sum;
    }

    for (let i = j; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += (L[j]![k]! as number) * (U[k]![i]! as number);
      }
      if (L[j]![j] == 0) {
        throw new MathError("matrixmath.not invertible");
      }
      U[j]![i] = ((m[j]![i]! as number) - sum) / (L[j]![j]! as number);
    }
  }

  return [L, U];
}

// math.js:3582-3591
/** Converte una matrice di numeri in una matrice di `Fraction`. */
export function fraction_matrix(matrix: Matrix): FractionMatrix {
  // il denominatore va passato come `number` (upstream: `new Fraction(c, 1)`):
  // con `1n` il costruttore salta il ciclo di raddoppi che rende interi
  // numeratore e denominatore, e ogni cella non intera diventerebbe 0.
  const o = matrix.map((r) => r.map((c) => (c instanceof Fraction ? c : new Fraction(c as number, 1))));
  return makeFractionMatrix(o);
}

// math.js:3598-3607 — upstream usa direttamente `c.numerator/c.denominator`
// (i getter lossy della `Fraction`, non `.toFloat()`): possibile perdita di
// precisione su numeratori grandi, portata identica.
/** Converte una matrice di frazioni in una matrice di numeri. */
export function unfraction_matrix(matrix: FractionMatrix): Matrix {
  const o = matrix.map((r) => r.map((c) => c.numerator / c.denominator));
  return makeMatrix(o);
}

// math.js:3614-3670 — lavora su una copia: l'array in ingresso non è
// mutato (§6.8 dell'inventario, decisione 6 del brief). Upstream muta
// `matrix` in place; qui si copia prima di iniziare.
/** Mette una matrice in forma a scala per righe. */
export function row_echelon_form(matrixIn: FractionMatrix): FractionMatrix {
  const matrix = makeFractionMatrix(matrixIn.map((r) => [...r]));
  const rows = matrix.rows;
  const columns = matrix.columns;

  let current_row = 0;
  // for each column, there should be at most one row with a 1 in that column, and every other row should have 0 in that column
  for (let leader_column = 0; leader_column < columns; leader_column++) {
    // find the first row with a non-zero in that column
    let row: number;
    for (row = current_row; row < rows; row++) {
      if (!matrix[row]![leader_column]!.is_zero()) {
        break;
      }
    }
    // if we found a row with a non-zero in the leader column
    if (row < rows) {
      // swap that row with the <current_row>th one
      if (row != current_row) {
        const tmp = matrix[row]!;
        matrix[row] = matrix[current_row]!;
        matrix[current_row] = tmp;
      }

      // multiply this row so the leader column has a 1 in it
      const leader = matrix[current_row]![leader_column]!;
      if (!leader.is_one()) {
        matrix[current_row] = matrix[current_row]!.map((c) => c.divide(leader));
      }

      // subtract multiples of this row from every other row so they all have a zero in this column
      const subFn = (a: Fraction, b: Fraction) => a.subtract(b);
      const addFn = (a: Fraction, b: Fraction) => a.add(b);
      for (let r = current_row + 1; r < rows; r++) {
        if (r != current_row && !matrix[r]![leader_column]!.is_zero()) {
          let scale = matrix[r]![leader_column]!;
          let op = subFn;
          if (scale.numerator < 0) {
            scale = new Fraction(-scale.numerator, scale.denominator);
            op = addFn;
          }
          const rr = current_row;
          matrix[r] = matrix[r]!.map((c, i) => op(c, matrix[rr]![i]!.multiply(scale)));
        }
      }
      current_row += 1;
    }
  }

  return matrix;
}

// math.js:3672-3723 — come sopra, non muta l'array in ingresso (già
// garantito da `row_echelon_form`, che copia).
/** Mette una matrice che rappresenta un sistema di equazioni in forma a
 * scala ridotta per righe. */
export function reduced_row_echelon_form(matrixIn: FractionMatrix): FractionMatrix {
  const matrix = row_echelon_form(matrixIn);

  const rows = matrix.length;
  const columns = matrix[0]!.length;
  matrix.rows = rows;
  matrix.columns = columns;

  const subFn = (a: Fraction, b: Fraction) => a.subtract(b);
  const addFn = (a: Fraction, b: Fraction) => a.add(b);

  for (let row = 0; row < rows; row++) {
    let column: number;
    for (column = 0; column < columns && matrix[row]![column]!.is_zero(); column++) {
      /* empty */
    }

    if (column == columns) {
      continue;
    }

    for (let vrow = 0; vrow < rows; vrow++) {
      if (vrow != row && !matrix[vrow]![column]!.is_zero()) {
        let scale = matrix[vrow]![column]!;
        if (!scale.is_zero()) {
          let op = subFn;
          if (scale.numerator < 0) {
            op = addFn;
            scale = new Fraction(-scale.numerator, scale.denominator);
          }
          const rr = row;
          matrix[vrow] = matrix[vrow]!.map((c, i) => op(c, matrix[rr]![i]!.multiply(scale)));
        }
      }
    }
  }

  return matrix;
}

// math.js:3725-3727
export function gauss_jordan_elimination(matrix: Matrix): Matrix {
  return unfraction_matrix(reduced_row_echelon_form(fraction_matrix(matrix)));
}

// math.js:3734-3747
/** Trova l'inversa della matrice quadrata data. */
export function inverse(m: Matrix): Matrix {
  if (m.rows != m.columns) {
    throw new MathError("matrixmath.not square");
  }
  const n = m.rows;

  const adjoined = combine_horizontally(m, id(m.rows));
  const reduced = gauss_jordan_elimination(adjoined);
  const inv = makeMatrix(reduced.map((row) => row.slice(n)));

  return inv;
}
