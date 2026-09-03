/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-display.js:26-149 — l'API di alto livello `jme.display.*`:
// `exprToLaTeX`, `treeToLaTeX`, `simplifyExpression`, `simplify`,
// `simplifyTree` e `subvars`.
//
// È anche il punto d'ingresso del modulo di visualizzazione: importa
// `display-texifier.ts` e `display-jme.ts`, ne riespone la superficie
// pubblica e riempie i quattro ganci di `displayHooks`. Chi importa questo
// file ha il modulo completo.
//
// `jme-notations.js` non si porta (decisione 1 del brief): dove upstream
// passa una `Notation`, qui si usa direttamente il parser standard (o quello
// passato come argomento). `subvars` è la sola parte di `Notation` che serve,
// ed è portata qui (jme-notations.js:71-113).

import * as math from "../math";
import { unwrapSubexpression } from "./evaluate";
import { JmeError } from "./errors";
import { compile, Parser } from "./parser";
import { collectRuleset, Ruleset, type RulesetSpec } from "./rules-ruleset";
import { simplificationRules } from "./rules-simplify";
import type { Scope } from "./scope";
import { displayHooks } from "./subvars";
import type { Tree, TFunc } from "./tokens";
import { extendObject } from "./util";
import { texify, type DisplaySettings } from "./display-texifier";
import { treeToJME } from "./display-jme";

export {
  Displayer,
  Texifier,
  texify,
  eqMaybeUntyped,
  NICE_NUMBER_MAX_LENGTH,
  type DisplaySettings,
  type DisplaySettingsArg,
  type CircleConstant,
  type CommonConstants,
} from "./display-texifier";
// `treeToJME` sta in `display-jme.ts`, ma la superficie pubblica del modulo
// di visualizzazione è questa (upstream è tutta `Numbas.jme.display.*`).
export { treeToJME } from "./display-jme";

// ---------------------------------------------------------------------------
// jme-display.js:26-149 — l'API di alto livello.
// ---------------------------------------------------------------------------

// jme-display.js:36-48
/** Compila, semplifica e rende in LaTeX un'espressione JME. */
export function exprToLaTeX(expr: string, ruleset: RulesetSpec, scope: Scope, parser?: Parser): string {
  let rs: Ruleset;
  if (!ruleset) {
    rs = collectRuleset(simplificationRules["basic"] as Ruleset, scope.allRulesets());
  } else {
    rs = collectRuleset(ruleset, scope.allRulesets());
  }
  expr += "";
  if (!expr.trim().length) {
    // se l'espressione è vuota non vale la pena di compilarla
    return "";
  }
  const tree = simplify(expr, rs, scope, parser);
  const settings = extendObject({ scope: scope } as DisplaySettings, rs.flags);
  return texify(tree, settings, scope);
}

// jme-display.js:59-71
/** Come `exprToLaTeX`, ma a partire da un albero già compilato. */
export function treeToLaTeX(tree: Tree, ruleset: RulesetSpec, scope: Scope): string {
  let rs: Ruleset;
  if (!ruleset) {
    rs = collectRuleset(simplificationRules["basic"] as Ruleset, scope.allRulesets());
  } else {
    rs = collectRuleset(ruleset, scope.allRulesets());
  }
  const simplified_tree = simplifyTree(tree, rs, scope);
  const settings = extendObject({ scope: scope } as DisplaySettings, rs.flags);
  return texify(simplified_tree, settings, scope);
}

// jme-display.js:84-90
/** Semplifica un'espressione JME e la restituisce come stringa JME. */
export function simplifyExpression(expr: string, ruleset: RulesetSpec, scope: Scope, parser?: Parser): string {
  if (expr.trim() === "") {
    return "";
  }
  const simplifiedTree = simplify(expr, ruleset, scope, parser);
  const settings = extendObject(
    { nicenumber: false, noscientificnumbers: true } as DisplaySettings,
    (ruleset as Ruleset | undefined)?.flags,
  );
  return treeToJME(simplifiedTree, settings, scope);
}

// jme-display.js:104-117
/** Semplifica un'espressione JME e ne restituisce l'albero. */
export function simplify(expr: string, ruleset: RulesetSpec, scope: Scope, parser?: Parser): Tree | null {
  if (expr.trim() === "") {
    return null;
  }
  let rs: Ruleset;
  if (!ruleset) {
    rs = collectRuleset(simplificationRules["basic"] as Ruleset, scope.allRulesets());
  } else {
    rs = collectRuleset(ruleset, scope.allRulesets());
  }
  // upstream compila con `notypecheck: true`, così si possono usare nomi di
  // funzione non definiti; il nostro `compile` non fa controlli di tipo.
  const exprTree = parser ? parser.compile(expr) : compile(expr);
  if (!exprTree) {
    return null;
  }
  return simplifyTree(exprTree, rs, scope);
}

// jme-display.js:131-134
/** Applica a un albero le regole di semplificazione date.
 *
 * `allowUnbound` è accettato per fedeltà alla firma upstream, che però non lo
 * usa (jme-display.js:133 passa a `ruleset.simplify` solo scope e notazione). */
export function simplifyTree(tree: Tree, ruleset: Ruleset, scope: Scope, allowUnbound?: boolean): Tree {
  void allowUnbound;
  return ruleset.simplify(tree, scope);
}

// jme-notations.js:71-113 (`Notation.prototype.subvars`), che
// jme-display.js:144-148 si limita a delegare.
/** Sostituisce i valori nelle graffe di un'espressione JME e ne restituisce
 * l'albero.
 *
 * `parser` corrisponde a `this.compile` della `Notation` upstream: senza, si
 * usa il parser standard. Serve al tipo di parte `jme`, che compila il pattern
 * di `mustmatchpattern` con il parser dei pattern
 * (parts/jme.js:344-345, `jme.notations.pattern_matching`). */
export function subvars(expr: string, scope: Scope, parser?: Parser): Tree {
  const sbits = math.splitbrackets(expr, "{", "}");
  let wrapped_expr = "";
  const subs: Tree[] = [];
  for (let j = 0; j < sbits.length; j += 1) {
    if (j % 2 === 0) {
      wrapped_expr += sbits[j];
    } else {
      const v = scope.evaluate(sbits[j] as string);
      if (v === null) {
        throw new JmeError("jme.subvars.null substitution", { str: sbits[j] as string });
      }
      if (treeToJME({ tok: v }, {}, scope) === "") {
        continue;
      }
      subs.push(unwrapSubexpression({ tok: v }));
      wrapped_expr += " texify_simplify_subvar(" + (subs.length - 1) + ")";
    }
  }

  const tree = parser ? parser.compile(wrapped_expr) : compile(wrapped_expr);
  if (!tree) {
    return tree as unknown as Tree;
  }

  /** Sostituisce ogni `texify_simplify_subvar(x)` con il valore corrispondente. */
  function replace_subvars(t: Tree): Tree {
    if (t.tok.type === "function" && (t.tok as TFunc).name === "texify_simplify_subvar") {
      const index = ((((t.args as Tree[])[0] as Tree).tok as { value: number }).value) as number;
      return subs[index] as Tree;
    }
    if (t.args) {
      const args = t.args.map(replace_subvars);
      const out: Tree = { tok: t.tok, args: args };
      if (t.bracketed !== undefined) {
        out.bracketed = t.bracketed;
      }
      return out;
    }
    return t;
  }

  return replace_subvars(tree);
}

// jme.js:399-434 arriva qui attraverso i ganci: `subvars.ts` è caricato prima
// del modulo di visualizzazione, che quindi si registra da sé (vedi il
// commento in testa a `subvars.ts`). `displayHooks.treeToJME` lo riempie
// `display-jme.ts`.
displayHooks.texify = texify as (tree: Tree, settings: unknown, scope: Scope) => string;
displayHooks.exprToLaTeX = exprToLaTeX as unknown as (expr: string, ruleset: unknown, scope: Scope) => string;
displayHooks.subvars = subvars as (expr: string, scope: Scope) => Tree;
