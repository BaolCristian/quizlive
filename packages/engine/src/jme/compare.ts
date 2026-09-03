/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:346-405 (`compare`), 4671-4697 (`randoms`, `varnamesAgree`),
// 4712-4797 (`checkingFunctions`), 4936-4998 (`resultsEqual`), 5010-5279
// (`varsUsed`, `compareTokens*`, `sortTokensBy`, `treesSame`, `compareTrees`).

import * as math from "../math";
import type { Rng } from "../math";
import { TNum, type Token, type Tree } from "./tokens";
import { Scope } from "./scope";
import { castToType, findCompatibleType, findvars, isMonomial, isOp, isType } from "./evaluate";
import { eq } from "./equality";

/** Una funzione che decide se due risultati numerici sono abbastanza vicini. */
export type CheckingFunction = (
  r1: math.NumbasNumber | math.ComplexDecimal,
  r2: math.NumbasNumber | math.ComplexDecimal,
  tolerance: number,
) => boolean;

// jme.js:4712-4797
/** Le funzioni di confronto numerico con tolleranza. */
export const checkingFunctions: Record<"absdiff" | "reldiff" | "dp" | "sigfig", CheckingFunction> = {
  /** Differenza assoluta: fallisce se `|r1-r2|` supera la tolleranza. */
  absdiff(r1, r2, tolerance) {
    if (math.isComplexDecimal(r1) || math.isComplexDecimal(r2)) {
      const d1 = math.ensure_decimal(r1 as math.NumbasNumber);
      const d2 = math.ensure_decimal(r2 as math.NumbasNumber);
      return d1.minus(d2).absoluteValue().re.lessThan(Math.abs(tolerance));
    }
    if (r1 === Infinity || r1 === -Infinity) {
      return r1 === r2;
    }
    return math.leq(
      math.abs(math.sub(r1 as math.NumbasNumber, r2 as math.NumbasNumber)),
      Math.abs(tolerance),
    );
  },
  /** Differenza relativa: fallisce se `r1/r2 - 1` supera la tolleranza. */
  reldiff(r1, r2, tolerance) {
    if (math.isComplexDecimal(r1) || math.isComplexDecimal(r2)) {
      const d1 = math.ensure_decimal(r1 as math.NumbasNumber);
      const d2 = math.ensure_decimal(r2 as math.NumbasNumber);
      return d1.minus(d2).absoluteValue().re.lessThan(d2.re.times(tolerance).absoluteValue());
    }
    if (r1 === Infinity || r1 === -Infinity) {
      return r1 === r2;
    }
    if (r2 !== 0) {
      return math.leq(
        Math.abs(math.sub(r1 as math.NumbasNumber, r2 as math.NumbasNumber) as number),
        Math.abs(math.mul(tolerance, r2 as math.NumbasNumber) as number),
      );
    } else {
      // se la risposta corretta è 0, si controlla la differenza assoluta
      return math.leq(Math.abs(math.sub(r1 as math.NumbasNumber, r2 as math.NumbasNumber) as number), tolerance);
    }
  },
  /** Arrotonda entrambi i valori a `tolerance` cifre decimali. */
  dp(r1, r2, tolerance) {
    if (math.isComplexDecimal(r1) || math.isComplexDecimal(r2)) {
      const d1 = math.ensure_decimal(r1 as math.NumbasNumber);
      const d2 = math.ensure_decimal(r2 as math.NumbasNumber);
      return d1.toDecimalPlaces(tolerance).equals(d2.toDecimalPlaces(tolerance));
    }
    if (r1 === Infinity || r1 === -Infinity) {
      return r1 === r2;
    }
    tolerance = Math.floor(Math.abs(tolerance));
    return math.eq(
      math.precround(r1 as math.NumbasNumber, tolerance),
      math.precround(r2 as math.NumbasNumber, tolerance),
    );
  },
  /** Arrotonda entrambi i valori a `tolerance` cifre significative. */
  sigfig(r1, r2, tolerance) {
    if (math.isComplexDecimal(r1) || math.isComplexDecimal(r2)) {
      const d1 = math.ensure_decimal(r1 as math.NumbasNumber);
      const d2 = math.ensure_decimal(r2 as math.NumbasNumber);
      return d1.toSignificantDigits(tolerance).equals(d2.toSignificantDigits(tolerance));
    }
    if (r1 === Infinity || r1 === -Infinity) {
      return r1 === r2;
    }
    tolerance = Math.floor(Math.abs(tolerance));
    return math.eq(
      math.siground(r1 as math.NumbasNumber, tolerance),
      math.siground(r2 as math.NumbasNumber, tolerance),
    );
  },
};

// jme.js:4671-4682 — upstream usa `Numbas.math.randomrange`, che attinge al
// generatore globale; qui il generatore arriva dallo scope (decisione 5 del
// design doc: niente `Math.random`).
/** Genera `times` assegnazioni casuali di valori fra `min` e `max` per ognuno
 * dei nomi dati. */
export function randoms(
  varnames: string[],
  min: number,
  max: number,
  times: number,
  rng: Rng,
): Array<Record<string, Token>> {
  times *= varnames.length || 1;
  const rs: Array<Record<string, Token>> = [];
  for (let i = 0; i < times; i++) {
    const r: Record<string, Token> = {};
    for (let j = 0; j < varnames.length; j++) {
      r[varnames[j] as string] = new TNum(math.randomrange(min, max, rng));
    }
    rs.push(r);
  }
  return rs;
}

// jme.js:4689-4697
/** Ogni nome di `array1` che non inizia con `$` compare in `array2`? */
export function varnamesAgree(array1: string[], array2: string[]): boolean {
  for (let i = 0; i < array1.length; i++) {
    const name = array1[i] as string;
    if (name[0] !== "$" && !array2.includes(name)) {
      return false;
    }
  }
  return true;
}

/** Le impostazioni di `compare` (jme.js:327-337). */
export interface CompareSettings {
  /** Il nome del metodo di confronto: una chiave di `checkingFunctions`. */
  checkingType?: string;
  /** L'estremo inferiore dell'intervallo da cui pescare i valori. */
  vsetRangeStart?: number;
  /** L'estremo superiore. */
  vsetRangeEnd?: number;
  /** Quanti valori pescare per ogni variabile. */
  vsetRangePoints?: number;
  /** Il parametro di tolleranza della funzione di confronto. */
  checkingAccuracy?: number;
  /** Quante volte il confronto deve fallire per dichiarare le espressioni
   * diverse. */
  failureRate?: number;
  /** Le due espressioni devono usare esattamente le stesse variabili. */
  sameVars?: boolean;
}

// jme.js:346-398
/** Confronta due espressioni valutandole su un campione casuale di valori
 * delle loro variabili libere. */
export function compare(tree1: Tree, tree2: Tree, settings: CompareSettings, scope: Scope): boolean {
  const s: Required<Omit<CompareSettings, "sameVars">> & { sameVars?: boolean } = {
    vsetRangeStart: 0,
    vsetRangeEnd: 1,
    vsetRangePoints: 5,
    checkingType: "absdiff",
    checkingAccuracy: 0.0001,
    failureRate: 1,
    ...(settings ?? {}),
  };
  const checkingFunction = checkingFunctions[
    s.checkingType.toLowerCase() as keyof typeof checkingFunctions
  ] as CheckingFunction;
  try {
    if (tree1 == null || tree2 == null) {
      // una delle due espressioni non è valida: non si possono confrontare
      return false;
    }
    // le variabili usate nelle due espressioni: se sono diverse non si possono
    // confrontare.
    // upstream (jme.js:365-368) prova a togliere da queste liste le variabili
    // già definite nello scope con `delete vars1[v]`, ma `vars1` è un array e
    // la cancellazione per nome non fa nulla: il ciclo è un no-op e non è
    // portato.
    const vars1 = findvars(tree1, [], scope);
    const vars2 = findvars(tree2, [], scope);
    if (s.sameVars) {
      if (!varnamesAgree(vars1, vars2)) {
        return false;
      }
    } else {
      vars2.forEach((n) => {
        if (!vars1.includes(n)) {
          vars1.push(n);
        }
      });
    }
    const hasNames = vars1.length > 0;
    const numRuns = hasNames ? s.vsetRangePoints : 1;
    const failureRate = hasNames ? s.failureRate : 1;
    let errors = 0;
    const rs = randoms(vars1, s.vsetRangeStart, s.vsetRangeEnd, numRuns, scope.rng);
    for (let i = 0; i < rs.length; i++) {
      const nscope = new Scope([scope, { variables: rs[i] as Record<string, Token> }]);
      // `tree1`/`tree2` sono stati controllati non nulli qui sopra, quindi
      // nemmeno i risultati lo sono
      const r1 = nscope.evaluate(tree1) as Token;
      const r2 = nscope.evaluate(tree2) as Token;
      if (!resultsEqual(r1, r2, checkingFunction, s.checkingAccuracy, scope)) {
        errors++;
      }
    }
    return errors < failureRate;
  } catch {
    // upstream: qualunque eccezione (compilazione, tipo, ...) vale "diverse"
    return false;
  }
}

// jme.js:4936-4998
/** I due risultati sono uguali secondo la funzione di confronto data? */
export function resultsEqual(
  r1: Token,
  r2: Token,
  checkingFunction: CheckingFunction,
  checkingAccuracy: number,
  scope: Scope,
): boolean {
  const type = findCompatibleType(r1.type, r2.type);
  if (!type) {
    return false;
  }
  r1 = castToType(r1, type);
  r2 = castToType(r2, type);
  let v1 = (r1 as { value: unknown }).value;
  let v2 = (r2 as { value: unknown }).value;

  switch (type) {
    case "rational":
      return checkingFunction(
        (v1 as math.Fraction).toDecimal() as unknown as math.NumbasNumber,
        (v2 as math.Fraction).toDecimal() as unknown as math.NumbasNumber,
        checkingAccuracy,
      );
    case "number":
    case "decimal":
    case "integer":
      if (math.isComplex(v1) || math.isComplex(v2)) {
        if (!math.isComplex(v1)) {
          v1 = { re: v1 as number, im: 0, complex: true } as math.Complex;
        }
        if (!math.isComplex(v2)) {
          v2 = { re: v2 as number, im: 0, complex: true } as math.Complex;
        }
        return (
          checkingFunction((v1 as math.Complex).re, (v2 as math.Complex).re, checkingAccuracy) &&
          checkingFunction((v1 as math.Complex).im, (v2 as math.Complex).im, checkingAccuracy)
        );
      } else {
        return checkingFunction(v1 as math.NumbasNumber, v2 as math.NumbasNumber, checkingAccuracy);
      }
    case "vector": {
      const a1 = v1 as math.NumbasNumber[];
      const a2 = v2 as math.NumbasNumber[];
      if (a1.length !== a2.length) {
        return false;
      }
      for (let i = 0; i < a1.length; i++) {
        if (
          !resultsEqual(
            new TNum(a1[i] as number),
            new TNum(a2[i] as number),
            checkingFunction,
            checkingAccuracy,
            scope,
          )
        ) {
          return false;
        }
      }
      return true;
    }
    case "matrix": {
      const m1 = v1 as math.Matrix;
      const m2 = v2 as math.Matrix;
      if (m1.rows !== m2.rows || m1.columns !== m2.columns) {
        return false;
      }
      for (let i = 0; i < m1.rows; i++) {
        for (let j = 0; j < m1.columns; j++) {
          if (
            !resultsEqual(
              new TNum(((m1[i] as math.NumbasNumber[])[j] as number) || 0),
              new TNum(((m2[i] as math.NumbasNumber[])[j] as number) || 0),
              checkingFunction,
              checkingAccuracy,
              scope,
            )
          ) {
            return false;
          }
        }
      }
      return true;
    }
    case "list": {
      const l1 = v1 as Token[];
      const l2 = v2 as Token[];
      if (l1.length !== l2.length) {
        return false;
      }
      for (let i = 0; i < l1.length; i++) {
        if (!resultsEqual(l1[i] as Token, l2[i] as Token, checkingFunction, checkingAccuracy, scope)) {
          return false;
        }
      }
      return true;
    }
    default:
      return eq(r1, r2, scope);
  }
}

// jme.js:5010-5024 — a differenza di `findvars`, tiene i duplicati e ignora
// `findvarsOps`.
/** I nomi delle variabili usate nell'albero, in ordine di visita. */
export function varsUsed(tree: Tree): string[] {
  switch (tree.tok.type) {
    case "name":
      return [tree.tok.name];
    case "op":
    case "function": {
      let o: string[] = [];
      const args = tree.args ?? [];
      for (let i = 0; i < args.length; i++) {
        o = o.concat(varsUsed(args[i] as Tree));
      }
      return o;
    }
    default:
      return [];
  }
}

// jme.js:5036-5038
/** Confronta il campo `value` di due token con gli operatori JavaScript. */
export function compareTokensByValue(a: Token, b: Token): number {
  const av = (a as { value: number | string | boolean }).value;
  const bv = (b as { value: number | string | boolean }).value;
  return av > bv ? 1 : av < bv ? -1 : 0;
}

// jme.js:5046-5056
/** Come confrontare due token dello stesso tipo, per tipo. */
export const tokenComparisons: Record<string, (a: Token, b: Token) => number> = {
  number: compareTokensByValue,
  integer: compareTokensByValue,
  rational(a, b) {
    const av = (a as { value: math.Fraction }).value;
    const bv = (b as { value: math.Fraction }).value;
    return av.gt(bv) ? 1 : av.lt(bv) ? -1 : 0;
  },
  string: compareTokensByValue,
  boolean: compareTokensByValue,
};

// jme.js:5068-5086
/** Confronta due token, per l'ordinamento. */
export function compareTokens(a: Token, b: Token): number {
  if (a.type !== b.type) {
    const type = findCompatibleType(a.type, b.type);
    if (type) {
      return compareTokens(castToType(a, type), castToType(b, type));
    }
    return compareTrees({ tok: a }, { tok: b });
  }
  const compare = tokenComparisons[a.type];
  if (compare) {
    return compare(a, b);
  }
  return compareTrees({ tok: a }, { tok: b });
}

// jme.js:5095-5107
/** Un comparatore che applica `fn` ai token prima di confrontarli; i valori
 * `undefined` finiscono in fondo. */
export function sortTokensBy(fn: (tok: Token) => Token | undefined): (a: Token, b: Token) => number {
  return function (a: Token, b: Token) {
    const fa = fn(a);
    const fb = fn(b);
    if (fa === undefined) {
      return fb === undefined ? 0 : 1;
    } else if (fb === undefined) {
      return -1;
    }
    return compareTokens(fa, fb);
  };
}

// jme.js:5117-5142
/** I due alberi sono esattamente uguali? */
export function treesSame(a: Tree | undefined, b: Tree | undefined, scope: Scope): boolean {
  if (a == undefined || b == undefined) {
    return a == undefined && b == undefined;
  }
  let ta = a.tok;
  let tb = b.tok;
  if (a.args || b.args) {
    if (!(a.args && b.args && a.args.length === b.args.length)) {
      return false;
    }
    for (let i = 0; i < a.args.length; i++) {
      if (!treesSame(a.args[i], b.args[i], scope)) {
        return false;
      }
    }
  } else {
    const type = findCompatibleType(ta.type, tb.type);
    if (!type) {
      return false;
    }
    ta = castToType(ta, type);
    tb = castToType(tb, type);
  }
  return eq(ta, tb, scope);
}

// jme.js:5158-5271
/** Confronta due alberi per l'ordinamento canonico.
 *
 * Nell'ordine: la lista delle variabili usate, i monomi prima del resto, il
 * tipo di dato, le potenze, il nome dell'operatore, gli argomenti, il valore. */
export function compareTrees(a: Tree, b: Tree): number {
  let sign_a = 1;
  while (isOp(a.tok, "-u")) {
    a = (a.args as Tree[])[0] as Tree;
    sign_a *= -1;
  }
  let sign_b = 1;
  while (isOp(b.tok, "-u")) {
    b = (b.args as Tree[])[0] as Tree;
    sign_b *= -1;
  }
  const va = varsUsed(a);
  const vb = varsUsed(b);
  for (let i = 0; i < va.length; i++) {
    if (i >= vb.length) {
      return -1;
    }
    if (va[i] !== vb[i]) {
      return (va[i] as string) < (vb[i] as string) ? -1 : 1;
    }
  }
  if (vb.length > va.length) {
    return 1;
  }

  const ma = isMonomial(a);
  const mb = isMonomial(b);
  const isma = ma !== false;
  const ismb = mb !== false;
  if (isma !== ismb) {
    return isma ? -1 : 1;
  }
  if (isma && ismb && !(a.tok.type === "name" && b.tok.type === "name")) {
    const d = compareTrees(ma.base, (mb as Exclude<typeof mb, false>).base);
    if (d === 0) {
      const dd = compareTrees((mb as Exclude<typeof mb, false>).degree, ma.degree);
      if (dd !== 0) {
        return dd;
      } else {
        const dc = compareTrees(ma.coefficient, (mb as Exclude<typeof mb, false>).coefficient);
        return dc !== 0 ? dc : sign_a === sign_b ? 0 : sign_a ? 1 : -1;
      }
    } else {
      return d;
    }
  }

  if (a.tok.type !== b.tok.type) {
    const order = ["op", "function"];
    const oa = order.indexOf(a.tok.type);
    const ob = order.indexOf(b.tok.type);
    if (oa !== ob) {
      return oa > ob ? -1 : 1;
    }
    return a.tok.type < b.tok.type ? -1 : 1;
  }

  if (a.args || b.args) {
    const aargs = a.args || [];
    const bargs = b.args || [];
    if (aargs.length !== bargs.length) {
      return aargs.length < bargs.length ? -1 : 1;
    }
    for (let i = 0; i < aargs.length; i++) {
      const c = compareTrees(aargs[i] as Tree, bargs[i] as Tree);
      if (c !== 0) {
        return c;
      }
    }
  }

  switch (a.tok.type) {
    case "op":
    case "function": {
      /** L'albero ha la forma `?^?`, `?*(?^?)` o `?/(?^?)`? */
      function is_pow(t: Tree): boolean {
        const name = (t.tok as { name?: string }).name;
        const second = t.args ? ((t.args[1] as Tree).tok as { name?: string }).name : undefined;
        return name === "^" || (name === "*" && second === "^") || (name === "/" && second === "^");
      }
      const pa = is_pow(a);
      const pb = is_pow(b);
      if (pa && !pb) {
        return -1;
      } else if (!pa && pb) {
        return 1;
      }
      const na = (a.tok as { name: string }).name;
      const nb = (b.tok as { name: string }).name;
      if (na !== nb) {
        return na < nb ? -1 : 1;
      }
      break;
    }
    case "expression":
      return compareTrees(a.tok.tree as Tree, (b.tok as { tree: Tree }).tree);
    default:
      if (isType(a.tok, "number")) {
        const na = (castToType(a.tok, "number") as TNum).value;
        const nb = (castToType(b.tok, "number") as TNum).value;
        if (math.isComplex(na) || math.isComplex(nb)) {
          const ca = math.isComplex(na) ? na : { re: na as number, im: 0, complex: true as const };
          const cb = math.isComplex(nb) ? nb : { re: nb as number, im: 0, complex: true as const };
          const gt = ca.re > cb.re || (ca.re === cb.re && ca.im > cb.im);
          const equal = ca.re === cb.re && ca.im === cb.im && sign_a === sign_b;
          return gt ? 1 : equal ? 0 : -1;
        } else {
          return (na as number) < (nb as number)
            ? -1
            : (na as number) > (nb as number)
              ? 1
              : sign_a === sign_b
                ? 0
                : sign_a
                  ? 1
                  : -1;
        }
      }
  }
  return sign_a === sign_b ? 0 : sign_a ? 1 : -1;
}
