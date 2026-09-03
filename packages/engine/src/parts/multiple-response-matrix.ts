/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/multipleresponse.js:585-718 (`getCorrectAnswer`: la matrice dei
// punteggi e la combinazione "perfetta" di spunte) e 819-839
// (`layoutTypes`), separati dalla classe per non superare le 1000 righe.

import { errorMessageIn } from "../errors";
import { JmeError } from "../jme/errors";
import { castToType, isType } from "../jme/evaluate";
import { signature } from "../jme/funcobj";
import type { Scope } from "../jme/scope";
import type { Token, TList, TMatrix, TNum } from "../jme/tokens";
import { isFloat, matrixmath, makeMatrix, type Matrix, type NumbasNumber } from "../math";
import type { MultipleResponsePart } from "./multiple-response-part";

// multipleresponse.js:819-839
/** Le forme di griglia disponibili per una parte `m_n_x`: dicono quali celle
 * `[riga, colonna]` sono mostrate. */
export const layoutTypes: Record<string, (row: number, column: number) => boolean> = {
  all: () => true,
  lowertriangle: (row, column) => row >= column,
  strictlowertriangle: (row, column) => row > column,
  uppertriangle: (row, column) => row <= column,
  strictuppertriangle: (row, column) => row < column,
};

/** Traspone una matrice di celle non ancora valutate (stringhe o numeri).
 *
 * upstream usa `Numbas.matrixmath.transpose`, che legge `m.rows`/`m.columns`
 * (impostati a mano poco prima, multipleresponse.js:305-306) e non la forma
 * reale dell'array; qui le dimensioni sono parametri espliciti, con la stessa
 * semantica. */
export function transposeRaw(m: unknown[][], rows: number, columns: number): unknown[][] {
  const out: unknown[][] = [];
  for (let i = 0; i < columns; i++) {
    const row: unknown[] = [];
    out.push(row);
    for (let j = 0; j < rows; j++) {
      row.push((m[j] ? m[j]![i] : undefined) ?? 0);
    }
  }
  return out;
}

/** Una matrice numerica con `rows`/`columns` impostati. */
function asMatrix(rows: NumbasNumber[][]): Matrix {
  return makeMatrix(rows);
}

// multipleresponse.js:591-624
/** Valuta la matrice dei punteggi definita da un'espressione JME. */
function matrixFromExpression(part: MultipleResponsePart, scope: Scope): Matrix {
  const value = scope.evaluate(part.settings.markingMatrixString);
  if (!value) {
    throw new JmeError("part.mcq.matrix not a list");
  }
  let matrix: Matrix;
  let m: ReturnType<ReturnType<typeof signature.type>>;
  if ((m = signature.type("matrix")([value]))) {
    matrix = (castToType(value, m[0]!) as TMatrix).value;
  } else if ((m = signature.listof(signature.type("number"))([value]))) {
    const list = (castToType(value, m[0]!) as TList).value ?? [];
    matrix = asMatrix(list.map((e) => [(e as TNum).value]));
  } else if ((m = signature.listof(signature.listof(signature.type("number")))([value]))) {
    const list = (castToType(value, m[0]!) as TList).value ?? [];
    matrix = asMatrix(list.map((row) => ((row as TList).value ?? []).map((e) => (e as TNum).value)));
  } else {
    part.error("part.mcq.matrix not a list");
  }
  if (part.flipped) {
    matrix = matrixmath.transpose(matrix);
  }
  if (matrix.length !== part.numChoices) {
    part.error("part.mcq.matrix wrong size");
  }
  for (let i = 0; i < part.numChoices; i++) {
    if ((matrix[i] as NumbasNumber[]).length !== part.numAnswers) {
      part.error("part.mcq.matrix wrong size");
    }
  }
  return matrixmath.transpose(matrix);
}

// multipleresponse.js:625-651
/** Costruisce la matrice dei punteggi da un array di celle, valutando quelle
 * che sono espressioni JME. */
function matrixFromArray(part: MultipleResponsePart, scope: Scope): NumbasNumber[][] {
  const matrix: NumbasNumber[][] = [];
  const source = part.settings.markingMatrixArray;
  for (let i = 0; i < part.numAnswers; i++) {
    const row: NumbasNumber[] = [];
    matrix.push(row);
    for (let j = 0; j < part.numChoices; j++) {
      let value: unknown = source[i] ? source[i]![j] : undefined;
      if (isFloat(value)) {
        value = parseFloat(String(value));
      } else {
        if (value === "") {
          part.error("part.mcq.matrix cell empty", { part: part.path, row: i, column: j });
        }
        try {
          const v = scope.evaluate(String(value));
          value = (castToType(v as Token, "number") as TNum).value;
        } catch (e) {
          part.error("part.mcq.matrix jme error", {
            part: part.path,
            row: i,
            column: j,
            error: errorMessageIn(e, scope.locale),
          });
        }
        if (!isFloat(value)) {
          part.error("part.mcq.matrix not a number", { part: part.path, row: i, column: j });
        }
        value = parseFloat(String(value));
      }
      row[j] = value as NumbasNumber;
    }
  }
  return matrix;
}

// multipleresponse.js:589-718
/** Calcola `settings.matrix` (punteggio per cella, indicizzato
 * `[risposta][scelta]`) e `settings.maxMatrix` (la combinazione perfetta di
 * spunte, usata al reveal). */
export function computeMarkingMatrix(part: MultipleResponsePart, scope: Scope): boolean[][] | undefined {
  const settings = part.settings;
  const matrix: NumbasNumber[][] = settings.markingMatrixString
    ? (matrixFromExpression(part, scope) as NumbasNumber[][])
    : matrixFromArray(part, scope);

  // multipleresponse.js:652-659 — le celle fuori dalla griglia non valgono
  // niente.
  for (let i = 0; i < matrix.length; i++) {
    const l = (matrix[i] as NumbasNumber[]).length;
    for (let j = 0; j < l; j++) {
      if (!part.layout[i]?.[j]) {
        (matrix[i] as NumbasNumber[])[j] = 0;
      }
    }
  }

  let maxMatrix: boolean[][] | undefined;
  switch (part.type) {
    // multipleresponse.js:661-674
    case "1_n_2": {
      let max = 0;
      let maxi: number | null = null;
      for (let i = 0; i < part.numAnswers; i++) {
        const cell = Number((matrix[i] as NumbasNumber[])[0]);
        if (cell > max || maxi === null) {
          max = cell;
          maxi = i;
        }
      }
      const best: boolean[][] = [];
      for (let i = 0; i < part.numAnswers; i++) {
        best.push([i === maxi]);
      }
      maxMatrix = best;
      break;
    }
    // multipleresponse.js:675-679
    case "m_n_2":
      maxMatrix = matrix.map((r) => [Number(r[0]) > 0]);
      break;
    // multipleresponse.js:680-706
    case "m_n_x":
      switch (settings.displayType) {
        case "radiogroup": {
          const correctTicks: number[] = [];
          for (let i = 0; i < part.numChoices; i++) {
            let maxj = -1;
            let max = 0;
            for (let j = 0; j < part.numAnswers; j++) {
              const cell = Number((matrix[j] as NumbasNumber[])[i]);
              if (maxj === -1 || cell > max) {
                maxj = j;
                max = cell;
              }
            }
            correctTicks.push(maxj);
          }
          maxMatrix = matrix.map((r, j) => r.map((_c, i) => j === correctTicks[i]));
          break;
        }
        case "checkbox":
          maxMatrix = matrix.map((r) => r.map((c) => Number(c) > 0));
          break;
      }
      break;
    default:
      break;
  }
  settings.matrix = matrix as number[][];
  if (maxMatrix !== undefined) {
    settings.maxMatrix = maxMatrix;
  }
  return maxMatrix;
}

// multipleresponse.js:496-533 — la griglia delle celle mostrate.
/** Costruisce `part.layout`: `layout[risposta][scelta]` dice se la cella è
 * mostrata (e quindi se può valere punti). */
export function buildLayout(part: MultipleResponsePart, scope: Scope): boolean[][] {
  const settings = part.settings;
  const layout: boolean[][] = [];
  if (part.type === "m_n_x") {
    let layoutFunction: (row: number, column: number) => boolean;
    if (settings.layoutType === "expression") {
      // multipleresponse.js:501-508 — l'espressione va [riga][colonna], al
      // contrario di tutto il resto della parte.
      const value = scope.evaluate(settings.layoutExpression);
      if (!value) {
        // upstream (multipleresponse.js:508) fa `jme.unwrapValue(jme.evaluate(...))`
        // senza controlli e va in `TypeError`. La chiave è nostra: non è un
        // problema della MATRICE DEI PUNTEGGI ma della griglia.
        part.error("part.mcq.invalid layout", { layoutType: settings.layoutType });
      }
      const layoutMatrix = unwrapBooleanGrid(value);
      layoutFunction = (row, column) => layoutMatrix[row]?.[column] === true;
    } else {
      const fn = layoutTypes[settings.layoutType];
      if (!fn) {
        // upstream (multipleresponse.js:510) prende `layoutTypes[...]`
        // indefinito e va in `TypeError` alla prima cella. Chiave nostra.
        part.error("part.mcq.invalid layout", { layoutType: settings.layoutType });
      }
      layoutFunction = fn;
    }
    for (let i = 0; i < part.numAnswers; i++) {
      const row: boolean[] = [];
      for (let j = 0; j < part.numChoices; j++) {
        row.push(layoutFunction(j, i));
      }
      layout.push(row);
    }
  } else {
    for (let i = 0; i < part.numAnswers; i++) {
      const row: boolean[] = [];
      for (let j = 0; j < part.numChoices; j++) {
        row.push(true);
      }
      layout.push(row);
    }
  }
  return layout;
}

/** Estrae una griglia di booleani da una matrice o da una lista di liste. */
function unwrapBooleanGrid(value: Token): boolean[][] {
  if (isType(value, "matrix")) {
    const m = (castToType(value, "matrix") as TMatrix).value;
    return m.map((row) => row.map((c) => Number(c) !== 0));
  }
  const list = (castToType(value, "list") as TList).value ?? [];
  return list.map((row) => {
    const cells = (castToType(row, "list") as TList).value ?? [];
    return cells.map((c) => {
      if (isType(c, "boolean")) {
        return (castToType(c, "boolean") as { value: boolean }).value;
      }
      return Number((castToType(c, "number") as TNum).value) !== 0;
    });
  });
}
