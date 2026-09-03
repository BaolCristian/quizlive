/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:878-966 — tema `booleans`. `and`, `or`, `implies`, `nand`,
// `nor` sono PIGRE (jme.lazyOps, righe 958-962): ricevono gli alberi e
// decidono loro se valutare il secondo argomento. `and`/`or` hanno anche il
// caso speciale "il primo argomento è un insieme", che delega a
// intersezione/unione insiemistica.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TBool, TSet, type Token, type Tree } from "../tokens";
import { castToType, isType } from "../evaluate";
import { eq } from "../equality";
import { add, pushLazy } from "./registry";

/** Registra il tema `booleans` (jme-builtins.js:879-962). */
export function registerBooleans(scope: Scope): void {
  // 879-896
  add(scope, "and", [TBool, TBool], TBool, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      let a = s.evaluate(trees[0] as Tree) as Token;

      if (isType(a, "set")) {
        const b = s.evaluate(trees[1] as Tree) as Token;
        return new TSet(
          math.setmath.intersection((castToType(a, "set") as TSet).value, (castToType(b, "set") as TSet).value, (x, y) =>
            eq(x, y, s),
          ),
        );
      }

      a = castToType(a, "boolean");

      if (!(a as TBool).value) {
        return new TBool(false);
      }
      return castToType(s.evaluate(trees[1] as Tree) as Token, "boolean");
    },
  });

  // 897-899
  add(scope, "not", [TBool], TBool, (a: boolean) => !a);

  // 900-917
  add(scope, "or", [TBool, TBool], TBool, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      let a = s.evaluate(trees[0] as Tree) as Token;
      if (a.type == "set") {
        const b = s.evaluate(trees[1] as Tree) as Token;
        return new TSet(
          math.setmath.union((castToType(a, "set") as TSet).value, (castToType(b, "set") as TSet).value, (x, y) =>
            eq(x, y, s),
          ),
        );
      }

      a = castToType(a, "boolean");

      if ((a as TBool).value) {
        return new TBool(true);
      }
      return castToType(s.evaluate(trees[1] as Tree) as Token, "boolean");
    },
  });

  // 918-921
  add(scope, "xor", [TBool, TBool], TBool, (a: boolean, b: boolean) => (a || b) && !(a && b));

  // 922-933 — upstream legge `a.value` senza cast a boolean: fedele.
  add(scope, "implies", [TBool, TBool], TBool, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const a = s.evaluate(trees[0] as Tree) as Token;

      if (!(a as { value?: unknown }).value) {
        return new TBool(true);
      }
      return s.evaluate(trees[1] as Tree) as Token;
    },
  });

  // 934-945
  add(scope, "nand", [TBool, TBool], TBool, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const a = s.evaluate(trees[0] as Tree) as Token;

      if (!(a as { value?: unknown }).value) {
        return new TBool(true);
      }
      const b = s.evaluate(trees[1] as Tree) as Token;
      return new TBool(!(b as { value?: unknown }).value);
    },
  });

  // 946-957
  add(scope, "nor", [TBool, TBool], TBool, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const a = s.evaluate(trees[0] as Tree) as Token;

      if ((a as { value?: unknown }).value) {
        return new TBool(false);
      }
      const b = s.evaluate(trees[1] as Tree) as Token;
      return new TBool(!(b as { value?: unknown }).value);
    },
  });

  // 958-962
  pushLazy("and");
  pushLazy("or");
  pushLazy("implies");
  pushLazy("nand");
  pushLazy("nor");
}
