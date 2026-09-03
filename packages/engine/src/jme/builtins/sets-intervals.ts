/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:968-1091 — temi `set_theory` (968-1018) e `intervals`
// (1020-1091), uniti in un solo modulo come da §9 dell'inventario.
//
// Upstream `setmath.union(a, b, scope)` passa lo SCOPE come terzo argomento,
// perché `setmath.contains` chiama `util.eq(token, token, scope)`. Nel port
// `setmath` opera su valori generici con un comparatore INIETTATO (Task 1,
// decisione 6 di quel brief): qui si inietta `(a,b) => eq(a,b,scope)` di
// jme/equality.ts, che è esattamente `util.eq`.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TBool, TInterval, TList, TNum, TRange, TSet, type Token } from "../tokens";
import { castToType } from "../evaluate";
import { contains, distinct, eq } from "../equality";
import { add } from "./registry";

/** Il comparatore di token da passare a `setmath` in questo scope. */
function tokenEq(scope: Scope): (a: Token, b: Token) => boolean {
  return (a, b) => eq(a, b, scope);
}

/** Registra i temi `set_theory` e `intervals`. */
export function registerSetsIntervals(scope: Scope): void {
  registerSetTheory(scope);
  registerIntervals(scope);
}

// jme-builtins.js:969-1011
/** Tema `set_theory`. */
export function registerSetTheory(scope: Scope): void {
  add(scope, "set", [TList], TSet, null, {
    evaluate: (args, s) => new TSet(distinct(((args as Token[])[0] as TList).value ?? [], s)),
  });
  add(scope, "set", [TRange], TSet, null, {
    evaluate: (args, s) => {
      const l = castToType((args as Token[])[0] as Token, "list") as TList;
      return new TSet(distinct(l.value ?? [], s));
    },
  });
  add(scope, "set", ["*?"], TSet, null, {
    evaluate: (args, s) => new TSet(distinct(args as Token[], s)),
  });
  add(scope, "union", [TSet, TSet], TSet, null, {
    evaluate: (args, s) =>
      new TSet(math.setmath.union(((args as Token[])[0] as TSet).value, ((args as Token[])[1] as TSet).value, tokenEq(s))),
  });
  add(scope, "intersection", [TSet, TSet], TSet, null, {
    evaluate: (args, s) =>
      new TSet(
        math.setmath.intersection(((args as Token[])[0] as TSet).value, ((args as Token[])[1] as TSet).value, tokenEq(s)),
      ),
  });
  // `or`/`and` su insiemi: il nome è PIGRO (dichiarato dal tema `booleans`),
  // ma questi overload ricevono comunque i token perché il caso "insieme" è
  // intercettato dalla versione pigra, che delega a setmath (righe 883/903).
  add(scope, "or", [TSet, TSet], TSet, null, {
    evaluate: (args, s) =>
      new TSet(math.setmath.union(((args as Token[])[0] as TSet).value, ((args as Token[])[1] as TSet).value, tokenEq(s))),
  });
  add(scope, "and", [TSet, TSet], TSet, null, {
    evaluate: (args, s) =>
      new TSet(
        math.setmath.intersection(((args as Token[])[0] as TSet).value, ((args as Token[])[1] as TSet).value, tokenEq(s)),
      ),
  });
  add(scope, "-", [TSet, TSet], TSet, null, {
    evaluate: (args, s) =>
      new TSet(math.setmath.minus(((args as Token[])[0] as TSet).value, ((args as Token[])[1] as TSet).value, tokenEq(s))),
  });
  add(scope, "abs", [TSet], TNum, math.setmath.size);
  add(scope, "in", ["?", TSet], TBool, null, {
    evaluate: (args, s) =>
      new TBool(contains(((args as Token[])[1] as TSet).value, (args as Token[])[0] as Token, s)),
  });
}

// jme-builtins.js:1021-1086
/** Tema `intervals`. */
export function registerIntervals(scope: Scope): void {
  add(
    scope,
    "interval",
    ["number", "number", "[boolean]", "[boolean]"],
    TInterval,
    (start: number, end: number, includes_start?: boolean, includes_end?: boolean) =>
      new math.RealIntervalUnion([new math.RealInterval(start, end, !!includes_start, !!includes_end)]),
  );

  add(scope, "union", ["*interval"], TInterval, null, {
    evaluate: (args) => {
      const tokens = args as TInterval[];
      let out = (tokens[0] as TInterval).value;
      for (let i = 1; i < tokens.length; i++) {
        out = out.union((tokens[i] as TInterval).value);
      }
      return new TInterval(out);
    },
  });
  add(scope, "union", ["list of interval"], TInterval, null, {
    evaluate: (args) => {
      const intervals = (((args as Token[])[0] as TList).value ?? []) as TInterval[];
      let out = (intervals[0] as TInterval).value;
      for (let i = 1; i < intervals.length; i++) {
        out = out.union((intervals[i] as TInterval).value);
      }
      return new TInterval(out);
    },
  });

  add(scope, "+", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.union(b),
  );
  add(scope, "or", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.union(b),
  );

  add(scope, "intersection", ["*interval"], TInterval, null, {
    evaluate: (args) => {
      const tokens = args as TInterval[];
      let out = (tokens[0] as TInterval).value;
      for (let i = 1; i < tokens.length; i++) {
        out = out.intersection((tokens[i] as TInterval).value);
      }
      return new TInterval(out);
    },
  });
  add(scope, "intersection", ["list of interval"], TInterval, null, {
    evaluate: (args) => {
      const intervals = (((args as Token[])[0] as TList).value ?? []) as TInterval[];
      let out = (intervals[0] as TInterval).value;
      for (let i = 1; i < intervals.length; i++) {
        out = out.intersection((intervals[i] as TInterval).value);
      }
      return new TInterval(out);
    },
  });

  add(scope, "*", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.intersection(b),
  );
  add(scope, "and", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.intersection(b),
  );

  add(scope, "complement", [TInterval], TInterval, (a: math.RealIntervalUnion) => a.complement());
  add(scope, "not", [TInterval], TInterval, (a: math.RealIntervalUnion) => a.complement());

  add(scope, "difference", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.difference(b),
  );
  add(scope, "-", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.difference(b),
  );
  add(scope, "except", [TInterval, TInterval], TInterval, (a: math.RealIntervalUnion, b: math.RealIntervalUnion) =>
    a.difference(b),
  );

  add(scope, "start", [TInterval], TNum, (a: math.RealIntervalUnion) => a.intervals.at(0)?.start);
  add(scope, "end", [TInterval], TNum, (a: math.RealIntervalUnion) => a.intervals.at(-1)?.end);

  add(scope, "open_start", [TInterval], TBool, (a: math.RealIntervalUnion) => !a.intervals.at(0)?.includes_start);
  add(scope, "open_end", [TInterval], TBool, (a: math.RealIntervalUnion) => !a.intervals.at(-1)?.includes_end);
  add(scope, "closed_start", [TInterval], TBool, (a: math.RealIntervalUnion) => !!a.intervals.at(0)?.includes_start);
  add(scope, "closed_end", [TInterval], TBool, (a: math.RealIntervalUnion) => !!a.intervals.at(-1)?.includes_end);

  add(
    scope,
    "components",
    [TInterval],
    TList,
    null,
    // upstream passa un QUINTO argomento `{unwrapValues:false}` a
    // `add_function`, che ne accetta solo cinque: viene ignorato.
    {
      evaluate: (args) =>
        new TList(((args as Token[])[0] as TInterval).value.components().map((x) => new TInterval(x))),
    },
  );
}
