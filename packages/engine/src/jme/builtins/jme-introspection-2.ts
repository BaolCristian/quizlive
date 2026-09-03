/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:2453-2636 — seconda metà del tema `jme` (vedi
// `jme-introspection.ts` per la prima): `eval`, `findvars`,
// `definedvariables`, `infer_variable_types`, `infer_type`,
// `canonical_compare`, `numerical_compare`, `debug_log`,
// `scope_case_sensitive`, `scope`, `case_sensitive`, `set_variables`,
// `add_function_sets`, `add_functions`, `remove_functions`.
//
// `make_variables` (2500-2521) è saltato: lo registra il Task 6.

import { Scope, type Scope as ScopeType } from "../scope";
import { TBool, TDict, TExpression, TList, TNum, TScope, TString, type Token, type Tree } from "../tokens";
import { findvars, unwrapValue, wrapValue } from "../evaluate";
import { compare, compareTrees } from "../compare";
import { inferExpressionType, inferVariableTypes } from "../infer";
import { add, pushLazy } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

/** Registra la seconda metà del tema `jme` (jme-builtins.js:2454-2636). */
export function registerJmeScopes(scope: ScopeType): void {
  // 2454-2465 — `random: undefined` significa "non si sa": `isRandom` deve
  // guardare l'espressione valutata, non la definizione.
  add(scope, "eval", [TExpression], "?", null, {
    evaluate: (args, s) => s.evaluate((toks(args)[0] as TExpression).tree as Tree) as Token,
    random: undefined,
  });
  add(scope, "eval", [TExpression, TDict], "?", null, {
    evaluate: (args, s) => {
      const variables = (toks(args)[1] as TDict).value ?? {};
      return new Scope([s, { variables: variables }]).evaluate(
        (toks(args)[0] as TExpression).tree as Tree,
      ) as Token;
    },
    random: undefined,
  });

  // 2466-2481
  add(scope, "findvars", [TExpression], TList, null, {
    evaluate: (args, s) => {
      const vars = findvars((toks(args)[0] as TExpression).tree as Tree, [], s);
      return new TList(vars.map((v) => new TString(v)));
    },
  });
  add(scope, "definedvariables", [], TList, null, {
    evaluate: (_args, s) => {
      const vars = Object.keys(s.allVariables());
      return new TList(vars.map((x) => new TString(x)));
    },
  });

  // 2482-2499
  add(scope, "infer_variable_types", [TExpression], TDict, null, {
    evaluate: (args, s) => {
      const expr = toks(args)[0] as TExpression;
      let assignments = inferVariableTypes(expr.tree as Tree, s);
      if (!assignments) {
        assignments = {};
      }
      return wrapValue(assignments);
    },
  });
  add(scope, "infer_type", [TExpression], TString, null, {
    evaluate: (args, s) => {
      const expr = toks(args)[0] as TExpression;
      return wrapValue(inferExpressionType(expr.tree as Tree, s));
    },
  });

  // 2500-2521 — `make_variables`: registrata dal Task 6 (`variables/`).

  // 2522-2529
  add(scope, "canonical_compare", ["?", "?"], TNum, null, {
    evaluate: (args) => {
      const trees = args as Tree[];
      const cmp = compareTrees(trees[0] as Tree, trees[1] as Tree);
      return new TNum(cmp);
    },
  });
  pushLazy("canonical_compare");

  // 2530-2537
  add(scope, "numerical_compare", [TExpression, TExpression], TBool, null, {
    evaluate: (args, s) => {
      const a = (toks(args)[0] as TExpression).tree as Tree;
      const b = (toks(args)[1] as TExpression).tree as Tree;
      return new TBool(compare(a, b, {}, s));
    },
  });

  // 2538-2544 — upstream stampa su `console.log`; il motore non scrive mai
  // sulla console (gira anche lato server), quindi il builtin ritorna il
  // valore senza stampare. Vedi DIVERGENCES.md.
  add(scope, "debug_log", ["?", "?"], "?", null, {
    evaluate: (args) => toks(args)[0] as Token,
  });

  // 2545-2554
  add(scope, "scope_case_sensitive", ["?", TBool], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const caseSensitive =
        trees.length > 1 ? ((s.evaluate(trees[1] as Tree) as TBool).value as boolean) : true;
      const scope2 = new Scope([s, { caseSensitive: caseSensitive }]);
      return scope2.evaluate(trees[0] as Tree) as Token;
    },
  });
  pushLazy("scope_case_sensitive");

  // 2555-2560
  add(scope, "scope", [], TScope, null, {
    evaluate: (_args, s) => new TScope(new Scope({ constants: s.allConstants() })),
  });

  // 2561-2577
  add(scope, "eval", [TExpression, TScope], "?", null, {
    evaluate: (args) => {
      const expr = toks(args)[0] as TExpression;
      const eval_scope = (toks(args)[1] as TScope).scope;
      return eval_scope.evaluate(expr.tree as Tree) as Token;
    },
    random: undefined,
  });
  add(scope, "eval", [TExpression, TScope, TDict], "?", null, {
    evaluate: (args) => {
      const eval_scope = (toks(args)[1] as TScope).scope;
      const variables = (toks(args)[2] as TDict).value ?? {};
      return new Scope([eval_scope, { variables }]).evaluate(
        (toks(args)[0] as TExpression).tree as Tree,
      ) as Token;
    },
    random: undefined,
  });

  // 2578-2598
  add(scope, "case_sensitive", [TScope, TBool], TScope, null, {
    evaluate: (args) => {
      const argscope = (toks(args)[0] as TScope).scope;
      const outscope = argscope.clone();
      outscope.caseSensitive = (toks(args)[1] as TBool).value;
      return new TScope(outscope);
    },
  });
  add(scope, "set_variables", [TScope, TDict], TScope, null, {
    evaluate: (args) => {
      const argscope = (toks(args)[0] as TScope).scope;
      const variables = (toks(args)[1] as TDict).value ?? {};
      const outscope = argscope.clone();
      for (const [k, v] of Object.entries(variables)) {
        outscope.setVariable(k, v);
      }
      return new TScope(outscope);
    },
  });

  // 2599-2636
  add(scope, "add_function_sets", [TScope, "list of string"], TScope, null, {
    evaluate: (args, s) => {
      const argscope = (toks(args)[0] as TScope).scope;
      const set_names = unwrapValue(toks(args)[1] as Token) as string[];
      const outscope = argscope.clone();
      for (const set_name of set_names) {
        const set = s.getFunctionSet(set_name);
        // upstream non controlla: con un nome sconosciuto `addFunctionSet`
        // lancerebbe un TypeError leggendo `set.name`.
        if (set) {
          outscope.addFunctionSet(set);
        }
      }
      return new TScope(outscope);
    },
  });
  add(scope, "add_functions", [TScope, "list of string"], TScope, null, {
    evaluate: (args, s) => {
      const argscope = (toks(args)[0] as TScope).scope;
      const names = unwrapValue(toks(args)[1] as Token) as string[];
      const outscope = argscope.clone();
      for (const name of names) {
        for (const fn of s.getFunction(name)) {
          outscope.addFunction(fn);
        }
      }
      return new TScope(outscope);
    },
  });
  add(scope, "remove_functions", [TScope, "list of string"], TScope, null, {
    evaluate: (args) => {
      const argscope = (toks(args)[0] as TScope).scope;
      const names = unwrapValue(toks(args)[1] as Token) as string[];
      const outscope = argscope.clone();
      for (const name of names) {
        outscope.deleteFunction(name);
      }
      return new TScope(outscope);
    },
  });
}
