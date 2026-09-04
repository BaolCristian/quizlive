/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:3752-3766 — tema `calculus`: un solo nome, `diff`, PIGRO.
// È l'unico punto in cui i builtin chiamano `jme.calculus.differentiate`.

import { differentiate } from "../calculus";
import { collectRuleset } from "../rules-ruleset";
import { simplify } from "../rules";
import type { Scope } from "../scope";
import { TExpression, TString, type Token, type Tree } from "../tokens";
import { add, pushLazy } from "./registry";

/** Registra il tema `calculus` (jme-builtins.js:3754). */
export function registerDifferentiation(scope: Scope): void {
  // 3754-3763 — upstream dichiara la firma `[TExpression, String]`, con la
  // `String` GLOBALE di JavaScript al posto di `TString`: la firma risultante
  // non combacia con nulla, ma `diff` è pigra e le funzioni pigre non passano
  // dal controllo di tipo, quindi il refuso è innocuo. Qui si scrive
  // `TString`, che è quel che la firma voleva dire.
  add(scope, "diff", [TExpression, TString], TExpression, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const expr = (s.evaluate(trees[0] as Tree) as TExpression).tree as Tree;
      const name = (s.evaluate(trees[1] as Tree) as TString).value;
      const res = differentiate(expr, name, s);
      const ruleset = collectRuleset("all", s.allRulesets());
      const simplified = simplify(res, ruleset, s);
      return new TExpression(simplified) as Token;
    },
  });
  pushLazy("diff");
}
