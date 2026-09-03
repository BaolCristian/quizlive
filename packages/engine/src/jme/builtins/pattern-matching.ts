/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:2638-2766 — tema `pattern_matching`: 4 nomi, 7 firme, tutte
// con un `evaluate` custom (nessuna è pigra). Usano `jme.rules.Rule` del
// Task 3.

import { Scope, type Scope as ScopeType } from "../scope";
import { TBool, TDict, TExpression, TString, type Token, type Tree } from "../tokens";
import { substituteTree, wrapValue } from "../evaluate";
import { Rule } from "../rules-transform";
import { add } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

// jme-builtins.js:2640-2666
/** Il risultato di `match`: `{match: bool, groups: dict}`. */
function match_subexpression(expr: Tree, pattern: string, options: string, scope: ScopeType): Token {
  const rule = new Rule(pattern, null, options);
  const match = rule.match(expr, scope);
  if (!match) {
    return wrapValue({ match: false, groups: {} });
  } else {
    const groups: Record<string, Token> = {};
    for (const [k, v] of Object.entries(match)) {
      if (k.slice(0, 2) != "__") {
        groups[k] = new TExpression(v);
      }
    }
    return wrapValue({ match: true, groups: groups });
  }
}

// jme-builtins.js:2686-2699
/** L'espressione corrisponde al pattern? */
function matches_subexpression(expr: Tree, pattern: string, options: string, scope: ScopeType): TBool {
  const rule = new Rule(pattern, null, options);
  const match = rule.match(expr, scope);
  return new TBool(match !== false);
}

// jme-builtins.js:2722-2731
/** Riscrive tutte le occorrenze del pattern nell'espressione. */
function replace_expression(
  pattern: string,
  repl: string,
  expr: Tree,
  options: string,
  scope: ScopeType,
): TExpression {
  const rule = new Rule(pattern, repl, options);
  const out = rule.replaceAll(expr, scope).expression;
  return new TExpression(out);
}

/** Registra il tema `pattern_matching` (jme-builtins.js:2668-2762). */
export function registerPatternMatching(scope: ScopeType): void {
  // 2668-2684
  add(scope, "match", [TExpression, TString], TDict, null, {
    evaluate: (args, s) =>
      match_subexpression(
        (toks(args)[0] as TExpression).tree as Tree,
        (toks(args)[1] as TString).value,
        "ac",
        s,
      ),
  });
  add(scope, "match", [TExpression, TString, TString], TDict, null, {
    evaluate: (args, s) =>
      match_subexpression(
        (toks(args)[0] as TExpression).tree as Tree,
        (toks(args)[1] as TString).value,
        (toks(args)[2] as TString).value,
        s,
      ),
  });

  // 2700-2716
  add(scope, "matches", [TExpression, TString], TBool, null, {
    evaluate: (args, s) =>
      matches_subexpression(
        (toks(args)[0] as TExpression).tree as Tree,
        (toks(args)[1] as TString).value,
        "ac",
        s,
      ),
  });
  add(scope, "matches", [TExpression, TString, TString], TBool, null, {
    evaluate: (args, s) =>
      matches_subexpression(
        (toks(args)[0] as TExpression).tree as Tree,
        (toks(args)[1] as TString).value,
        (toks(args)[2] as TString).value,
        s,
      ),
  });

  // 2732-2749
  add(scope, "replace", [TString, TString, TExpression], TExpression, null, {
    evaluate: (args, s) =>
      replace_expression(
        (toks(args)[0] as TString).value,
        (toks(args)[1] as TString).value,
        (toks(args)[2] as TExpression).tree as Tree,
        "acg",
        s,
      ),
  });
  add(scope, "replace", [TString, TString, TExpression, TString], TExpression, null, {
    evaluate: (args, s) =>
      replace_expression(
        (toks(args)[0] as TString).value,
        (toks(args)[1] as TString).value,
        (toks(args)[2] as TExpression).tree as Tree,
        (toks(args)[3] as TString).value,
        s,
      ),
  });

  // 2750-2762 — upstream MUTA il dizionario ricevuto, sostituendo i token
  // `expression` con i loro alberi: `substituteTree` legge le variabili di
  // uno scope, e una variabile può contenere direttamente un albero.
  add(scope, "substitute", [TDict, TExpression], TExpression, null, {
    evaluate: (args) => {
      const substitutions = (toks(args)[0] as TDict).value ?? {};
      for (const [k, v] of Object.entries(substitutions)) {
        if (v.type == "expression") {
          substitutions[k] = (v as TExpression).tree as unknown as Token;
        }
      }
      const expr = (toks(args)[1] as TExpression).tree as Tree;
      const nscope = new Scope({ variables: substitutions });
      const nexpr = substituteTree(expr, nscope, true, true);
      return new TExpression(nexpr);
    },
  });
}
