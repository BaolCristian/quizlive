/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:1093-1192 — tema `number_ranges`, più l'helper
// `best_number_type_for_range` (1099-1105) che serve anche a `randomisation`.

import * as math from "../../math";
import { JmeError } from "../errors";
import type { Scope } from "../scope";
import { TBool, TList, TNum, TInt, TRange, type Token, type TokenConstructor } from "../tokens";
import { add } from "./registry";

// jme-builtins.js:1099-1105
/** Il tipo numerico che rappresenta meglio un range: `TInt` se estremi e
 * passo sono interi e il passo non è nullo, altrimenti `TNum`. */
export function best_number_type_for_range(range: math.Range): TokenConstructor {
  if (math.isInt(range[0]) && math.isInt(range[2]) && range[2] != 0) {
    return TInt as unknown as TokenConstructor;
  } else {
    return TNum as unknown as TokenConstructor;
  }
}

/** Costruisce un token numerico del tipo dato. */
function makeNumber(cons: TokenConstructor, n: number): Token {
  return new (cons as unknown as new (v: number) => Token)(n);
}

/** Registra il tema `number_ranges` (jme-builtins.js:1109-1188). */
export function registerRanges(scope: Scope): void {
  add(scope, "..", [TNum, TNum], TRange, math.defineRange);
  add(scope, "#", [TRange, TNum], TRange, math.rangeSteps);
  add(scope, "in", [TNum, TRange], TBool, (x: number, r: math.Range) => {
    const start = r[0];
    const end = r[1];
    const step_size = r[2];
    if (x > end || x < start) {
      return false;
    }
    if (step_size === 0) {
      return true;
    } else {
      const max_steps = Math.floor(end - start) / step_size;
      const steps = Math.floor((x - start) / step_size);
      return step_size * steps + start == x && steps <= max_steps;
    }
  });

  // 1127-1177 — le tre versioni di `except` che escludono numeri da un range,
  // dato come range, lista o valore singolo. L'ordine di registrazione è
  // quello upstream: conta per la risoluzione degli overload.
  add(scope, "except", [TRange, TRange], TList, (range: math.Range, except: math.Range) => {
    if (range[2] == 0) {
      throw new JmeError("jme.func.except.continuous range");
    }
    const cons = best_number_type_for_range(range);
    const list = math.rangeToList(range);
    if (except[2] == 0) {
      return list.filter((i) => i < except[0] || i > except[1]).map((i) => makeNumber(cons, i));
    } else {
      const values = math.rangeToList(except);
      return math.except(list, values).map((i) => makeNumber(cons, i));
    }
  });
  add(scope, "except", [TRange, "list of number"], TList, (range: math.Range, except: TNum[]) => {
    if (range[2] == 0) {
      throw new JmeError("jme.func.except.continuous range");
    }
    const cons = best_number_type_for_range(range);
    const list = math.rangeToList(range);
    const values = except.map((i) => i.value as number);
    return math.except(list, values).map((i) => makeNumber(cons, i));
  });
  add(scope, "except", [TRange, TNum], TList, (range: math.Range, except: number) => {
    if (range[2] == 0) {
      throw new JmeError("jme.func.except.continuous range");
    }
    const cons = best_number_type_for_range(range);
    const list = math.rangeToList(range);
    return math.except(list, [except]).map((i) => makeNumber(cons, i));
  });
  // esclude numeri da una lista: qui `except` è la funzione di math/
  add(scope, "except", [TList, TRange], TList, (range: Token[], except: math.Range) => {
    const values = math.rangeToList(except);
    return range.filter((r) => !values.some((e) => math.eq((r as TNum).value, e)));
  });
  add(scope, "abs", [TRange], TNum, (r: math.Range) => (r[2] == 0 ? Math.abs(r[0] - r[1]) : math.rangeSize(r)));
}
