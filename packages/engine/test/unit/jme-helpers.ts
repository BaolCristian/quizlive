/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Replica gli helper di tests/jme/jme-tests.mjs:19-64 (`raisesNumbasError`,
// `remove_pos`, `treesEqual`, `tokWithPos`) più `makeToyScope`, che registra i
// `FuncObj` minimi necessari per esercitare il meccanismo di valutazione prima
// che il Task 4 porti i builtin veri.

import { expect } from "vitest";
import * as math from "../../src/math";
import { JmeError } from "../../src/jme/errors";
import { FuncObj } from "../../src/jme/funcobj";
import { lazyOps, Scope } from "../../src/jme/scope";
import { TBool, TNum, type Token, type Tree } from "../../src/jme/tokens";
import { simplificationRules } from "../../src/jme/rules-simplify";

/** Verifica che `fn` lanci un `JmeError` con la chiave upstream data. */
export function raisesJmeError(fn: () => unknown, key: string, message?: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, message ?? `atteso un errore con chiave ${key}`).toBeInstanceOf(JmeError);
  expect((thrown as JmeError).key, message).toBe(key);
}

/** Toglie `pos` e `bracketed` da un albero, per i confronti strutturali. */
export function removePos(tree: Tree): Tree {
  if (tree.tok) {
    delete (tree.tok as { pos?: number }).pos;
  }
  delete tree.bracketed;
  if (tree.args) {
    tree.args.forEach((a) => removePos(a));
  }
  return tree;
}

/** Una descrizione compatta della forma di un albero: tipo, nome e arità di
 * ogni nodo. Serve solo a rendere leggibili i fallimenti di `treesEqual`. */
function shape(tree: Tree): string {
  const name = (tree.tok as { name?: string }).name;
  const head = name !== undefined ? `${tree.tok.type}:${name}` : tree.tok.type;
  if (tree.args === undefined) {
    return head;
  }
  return `${head}(${tree.args.map(shape).join(",")})`;
}

/** Confronto strutturale fra alberi: tipo, nome e arità di ogni nodo, senza
 * guardare i valori né le posizioni (jme-tests.mjs:52-57). */
export function treesEqual(a: Tree, b: Tree, message?: string): void {
  /** Il predicato upstream, riprodotto esattamente. */
  function check(x: Tree, y: Tree): boolean {
    return (
      x.tok.type === y.tok.type &&
      (x.tok as { name?: string }).name === (y.tok as { name?: string }).name &&
      x.args?.length === y.args?.length &&
      (!(x.args !== undefined && x.args.length > 0) || x.args.every((xa, i) => check(xa, (y.args as Tree[])[i] as Tree)))
    );
  }
  if (!check(a, b)) {
    // `toBe` su due stringhe dà un messaggio di fallimento leggibile
    expect(shape(a), message).toBe(shape(b));
  }
  expect(check(a, b), message).toBe(true);
}

/** Imposta la posizione di un token e lo restituisce (jme-tests.mjs:61-64). */
export function tokWithPos<T extends Token>(tok: T, pos: number): T {
  tok.pos = pos;
  return tok;
}

/** Uno scope giocattolo con le sole funzioni che servono a esercitare
 * `Scope.evaluate`, `matchFunctionToArguments` e `castArgumentsToSignature`
 * prima che il Task 4 porti i builtin. Le implementazioni sono involucri
 * sottili attorno a `math/`. */
export function makeToyScope(): Scope {
  const scope = new Scope();

  /** Registra un operatore binario su numeri. */
  function binop(name: string, fn: (a: math.NumbasNumber, b: math.NumbasNumber) => math.NumbasNumber): void {
    scope.addFunction(
      new FuncObj(name, [TNum, TNum], TNum, fn as (...args: never[]) => unknown, { random: false }),
    );
  }
  /** Registra una relazione binaria su numeri. */
  function relation(name: string, fn: (a: math.NumbasNumber, b: math.NumbasNumber) => boolean): void {
    scope.addFunction(
      new FuncObj(name, [TNum, TNum], TBool, fn as (...args: never[]) => unknown, { random: false }),
    );
  }
  /** Registra una funzione unaria su numeri. */
  function unop(name: string, fn: (a: math.NumbasNumber) => math.NumbasNumber): void {
    scope.addFunction(new FuncObj(name, [TNum], TNum, fn as (...args: never[]) => unknown, { random: false }));
  }

  binop("+", math.add);
  binop("-", math.sub);
  binop("*", math.mul);
  binop("/", math.div);
  binop("^", math.pow);
  unop("-u", math.negate);
  unop("+u", (a) => a);
  relation("=", math.eq);
  relation("<", math.lt);
  relation(">", math.gt);
  relation("<=", math.leq);
  relation(">=", math.geq);
  unop("abs", math.abs);
  unop("sqrt", math.sqrt);
  unop("floor", (a) => Math.floor(a as number));

  // `if` è pigra: riceve gli alberi e valuta solo il ramo scelto.
  if (!lazyOps.includes("if")) {
    lazyOps.push("if");
  }
  scope.addFunction(
    new FuncObj("if", ["?", "?", "?"], "?", null, {
      random: false,
      evaluate(args, s) {
        const trees = args as Tree[];
        const test = s.evaluate(trees[0] as Tree) as TBool;
        // i rami di un `if` sono alberi, quindi la valutazione non è nulla
        return s.evaluate((test.value ? trees[1] : trees[2]) as Tree) as Token;
      },
    }),
  );

  return scope;
}

/** Lo scope giocattolo del Task 3: `makeToyScope()` più le costanti (`pi`,
 * `e`, `i`, `infinity`) e le funzioni che i rule-set di semplificazione
 * valutano nelle condizioni `` `where `` e nei blocchi `eval(...)`
 * (`im`, `re`, `isint`, `gcd_without_pi_or_i`, `sin`, `cos`, `ln`).
 *
 * Sta a parte da `makeToyScope()` perché le costanti cambiano il risultato di
 * `findvars` e della valutazione dei nomi: i test dei Task 1-2 assumono uno
 * scope senza costanti.
 *
 * Dal Task 4b i test di pattern-matching, semplificazione e derivazione usano
 * `builtinScope`, come upstream: questo scope resta come alternativa "senza
 * builtin" per chi debba esercitare il meccanismo in isolamento. */
export function makePatternScope(): Scope {
  const scope = makeToyScope();
  scope.setConstant("pi", { value: new TNum(Math.PI) });
  scope.setConstant("e", { value: new TNum(Math.E) });
  scope.setConstant("i", { value: new TNum(math.complex(0, 1) as math.Complex) });
  scope.setConstant("infinity", { value: new TNum(Infinity) });

  /** Registra una funzione unaria da numero a numero. */
  function unop(name: string, fn: (a: math.NumbasNumber) => math.NumbasNumber): void {
    scope.addFunction(new FuncObj(name, [TNum], TNum, fn as (...args: never[]) => unknown, { random: false }));
  }
  unop("im", (a) => math.im(a));
  unop("re", (a) => math.re(a));
  unop("sin", math.sin);
  unop("cos", math.cos);
  unop("ln", math.log);
  scope.addFunction(
    new FuncObj("isint", [TNum], TBool, ((a: math.NumbasNumber) => math.isInt(a)) as (...args: never[]) => unknown, {
      random: false,
    }),
  );
  // jme-builtins.js:480-489 — toglie i fattori di pi o i prima del gcd.
  scope.addFunction(
    new FuncObj(
      "gcd_without_pi_or_i",
      [TNum, TNum],
      TNum,
      ((a: math.NumbasNumber, b: math.NumbasNumber) => {
        if (math.isComplex(a) && a.re === 0) {
          a = a.im;
        }
        if (math.isComplex(b) && b.re === 0) {
          b = b.im;
        }
        a = (a as number) / (math.pow(Math.PI, math.piDegree(a)) as number);
        b = (b as number) / (math.pow(Math.PI, math.piDegree(b)) as number);
        return math.gcf(a, b);
      }) as (...args: never[]) => unknown,
      { random: false },
    ),
  );
  return scope;
}

/** `makePatternScope()` più i ruleset di semplificazione, che upstream vivono
 * in `Numbas.jme.builtinScope` (jme-builtins.js:41). */
export function makeSimplifyScope(): Scope {
  return new Scope([makePatternScope(), { rulesets: simplificationRules }]);
}

/** Valuta l'espressione e verifica che il risultato non sia nullo: dalla
 * revisione del Task 2 `Scope.evaluate` dichiara `Token | null`, e ritorna
 * `null` solo per un'espressione vuota. */
export function evaluated(scope: Scope, expr: string | Tree): Token {
  const v = scope.evaluate(expr);
  expect(v, `${typeof expr === "string" ? expr : "l'albero"} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** Il valore numerico del token, castato a `number`. */
export function numberValue(tok: Token): math.NumbasNumber {
  return (tok as TNum).value;
}
