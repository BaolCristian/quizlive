/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:65-150 (classe `Rule`) e 1758-1849 (`applyPostReplacement`,
// `transform`, `transformAll`): la riscrittura di un albero a partire da un
// match.

import { treesSame } from "./compare";
import { evaluate, isFunction, substituteTree } from "./evaluate";
import { compile } from "./parser";
import { findCapturedNames, matchAllTree, matchTree, type PatternMatch } from "./rules-match";
import { patternParser } from "./rules-parser";
import { extendOptions, parseOptions, type MatchTreeOptions } from "./rules-terms";
import { Scope } from "./scope";
import { TNothing, TOp, type TInt, type Token, type Tree } from "./tokens";

/** Il risultato di una riscrittura (jme-rules.js:1783-1789). */
export interface TransformResult {
  /** L'espressione risultante. */
  expression: Tree;
  /** L'espressione è diversa da quella di partenza? */
  changed: boolean;
}

// jme-rules.js:1758-1780
/** Applica le operazioni indicate nel risultato di una riscrittura:
 * `eval(x)` viene sostituito col valore di `x`, `m_listval(l,n)` con
 * l'n-esimo elemento, e gli operatori con un solo argomento non `nothing`
 * si riducono a quell'argomento. */
export function applyPostReplacement(tree: Tree, options: MatchTreeOptions): Tree {
  const tok = tree.tok;
  if (tree.args) {
    const args = tree.args.map((arg) => applyPostReplacement(arg, options));
    tree = { tok: tok, args: args };
  }
  if (isFunction(tok, "eval")) {
    // l'argomento di `eval` non è mai vuoto: `evaluate` non ritorna null
    return { tok: evaluate((tree.args as Tree[])[0] as Tree, options.scope as Scope) as Token };
  } else if (isFunction(tok, "m_listval")) {
    const n = ((tree.args as Tree[])[1] as Tree).tok as TInt;
    return (((tree.args as Tree[])[0] as Tree).args as Tree[])[n.value] as Tree;
  } else if (tok.type === "op") {
    const filled_args = (tree.args as Tree[]).filter((a) => a.tok.type !== "nothing");
    if (filled_args.length === 1 && filled_args.length < (tree.args as Tree[]).length) {
      return filled_args[0] as Tree;
    }
  }

  return tree;
}

// jme-rules.js:1801-1832
/** Sostituisce un'espressione con un'altra, se corrisponde alla regola data. */
export function transform(
  ruleTree: Tree,
  resultTree: Tree,
  exprTree: Tree,
  options: MatchTreeOptions,
): TransformResult {
  const match = matchTree(ruleTree, exprTree, options);
  if (!match) {
    return { expression: exprTree, changed: false };
  }
  const names = findCapturedNames(ruleTree);
  names.forEach((name) => {
    if (!(name in match)) {
      match[name] = { tok: new TNothing() };
    }
  });

  let out = substituteTree(
    resultTree,
    new Scope({ variables: match as unknown as Record<string, Token> }),
    true,
  ) as Tree;
  out = applyPostReplacement(out, options);
  // upstream tiene il nome dell'operatore nel dizionario dei match, sotto
  // `__op__`, dove il valore è una stringa e non un albero.
  const op = (match as unknown as Record<string, string>)["__op__"] as string;
  if (match["_rest_start"]) {
    out = { tok: new TOp(op), args: [match["_rest_start"] as Tree, out] };
  }
  if (match["_rest_end"]) {
    out = { tok: new TOp(op), args: [out, match["_rest_end"] as Tree] };
  }
  return { expression: out, changed: !treesSame(exprTree, out, options.scope as Scope) };
}

// jme-rules.js:1843-1848
/** Applica `transform` a ogni sottoalbero, dal basso verso l'alto. */
export function transformAll(
  ruleTree: Tree,
  resultTree: Tree,
  exprTree: Tree,
  options: MatchTreeOptions,
): TransformResult {
  let changed = false;
  if (exprTree.args) {
    const args = exprTree.args.map((arg) => {
      const o = transformAll(ruleTree, resultTree, arg, options);
      changed = changed || o.changed;
      return o.expression;
    });
    exprTree = { tok: exprTree.tok, args: args };
  }

  const o = transform(ruleTree, resultTree, exprTree, options);
  changed = changed || o.changed;
  return { expression: o.expression, changed: changed };
}

// jme-rules.js:77-150
/** Una regola di riscrittura: un pattern e il risultato in cui trasformarlo. */
export class Rule {
  /** Il nome leggibile della regola, se ce n'è uno. */
  declare name?: string;
  /** La stringa JME del pattern. */
  patternString: string | Tree;
  /** Il pattern compilato. */
  pattern: Tree;
  /** Le opzioni di default dell'algoritmo di match. */
  options: MatchTreeOptions;
  /** La stringa JME del risultato. */
  resultString: string | Tree | null;
  /** Il risultato compilato. */
  result: Tree | null;

  constructor(
    pattern: string | Tree,
    result: string | Tree | null,
    options?: string | MatchTreeOptions,
    name?: string,
  ) {
    if (name !== undefined) {
      this.name = name;
    }
    this.patternString = pattern;
    this.pattern =
      typeof pattern === "string" ? (patternParser.compile(pattern) as Tree) : pattern;
    if (typeof options === "string") {
      options = parseOptions(options);
    }
    this.options = options || {};
    this.resultString = result;
    // upstream passa `result` a `jme.compile` anche quando è `null`, e
    // `String(null)` compila al nome `null`: si porta com'è.
    this.result = result !== null && typeof result === "object" ? result : compile(String(result));
  }

  toString(): string {
    return String(this.patternString) + " -> " + String(this.resultString);
  }

  // jme-rules.js:93-100
  /** Le opzioni di default della regola, estese con quelle date. */
  get_options(options?: MatchTreeOptions): MatchTreeOptions {
    if (!options) {
      return this.options;
    } else {
      return extendOptions(this.options, options);
    }
  }

  // jme-rules.js:110-112
  /** Confronta la regola con l'albero dato. */
  match(exprTree: Tree, scope: Scope): PatternMatch {
    return matchTree(this.pattern, exprTree, this.get_options({ scope: scope }));
  }

  // jme-rules.js:121-123
  /** Tutti i match della regola dentro l'espressione. */
  matchAll(exprTree: Tree, scope: Scope): Array<Record<string, Tree>> {
    return matchAllTree(this.pattern, exprTree, this.get_options({ scope: scope }));
  }

  // jme-rules.js:132-134
  /** Riscrive l'espressione se corrisponde al pattern della regola. */
  replace(exprTree: Tree, scope: Scope): TransformResult {
    return transform(this.pattern, this.result as Tree, exprTree, this.get_options({ scope: scope }));
  }

  // jme-rules.js:143-145
  /** Riscrive tutte le occorrenze del pattern nell'espressione. */
  replaceAll(exprTree: Tree, scope: Scope): TransformResult {
    return transformAll(this.pattern, this.result as Tree, exprTree, this.get_options({ scope: scope }));
  }
}
