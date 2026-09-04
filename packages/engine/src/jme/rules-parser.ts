/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:1850-1945 — il parser del linguaggio dei pattern: estende il
// parser JME standard con il token `$xxx`, i quantificatori e gli operatori
// `` `? `* `+ `! `+- `*/ ; ;= `| `: `& `where `@ ``.

import { compile, Parser } from "./parser";
import { matchTree, type PatternMatch } from "./rules-match";
import { extendOptions, type MatchTreeOptions } from "./rules-terms";
import { getBuiltinScope } from "./scope";
import { normaliseName, type TokeniserOptions } from "./tokenizer";
import { TName, type Tree } from "./tokens";

// jme-rules.js:1850-1905
/** Il parser dei pattern JME. */
export class PatternParser extends Parser {
  constructor(options?: TokeniserOptions) {
    super(options);
    // solo ASCII dopo il `$`: i nomi unicode non sono ammessi (inventario §8.13)
    this.addTokenType(/^\$[a-zA-Z_]+/, function (result, _tokens, _expr, pos) {
      const name = result[0] as string;
      const lname = normaliseName(name, this.options as { caseSensitive?: boolean });
      const token = new TName(lname);
      return { tokens: [token], start: pos, end: pos + name.length };
    });
    this.addPostfixOperator("`?", "`?", { precedence: 0.5 }); // opzionale
    this.addPostfixOperator("`*", "`*", { precedence: 0.5 }); // un numero qualsiasi di volte
    this.addPostfixOperator("`+", "`+", { precedence: 0.5 }); // almeno una volta

    this.addPrefixOperator("`!", "`!", { precedence: 0.5 }); // negazione
    this.addPrefixOperator("`+-", "`+-", { precedence: 0.5 }); // più o meno unario
    this.addPrefixOperator("`*/", "`*/", { precedence: 0.5 }); // moltiplicazione o divisione unaria

    this.addBinaryOperator(";", { precedence: 0.5 });
    this.addBinaryOperator(";=", { precedence: 0.5 });
    this.addBinaryOperator("`|", { precedence: 1000000 }); // alternanza
    this.addBinaryOperator("`:", { precedence: 1000000 }); // valore di default
    this.addBinaryOperator("`&", { precedence: 100000 }); // congiunzione
    this.addBinaryOperator("`where", { precedence: 1000000 }); // condizione
    this.addBinaryOperator("`@", { precedence: 1000000, rightAssociative: true }); // macro
  }

  override compile(expr: string): Tree | null {
    const tree = super.compile(expr);
    return this.expand_pattern(tree);
  }

  // jme-rules.js:1887-1904
  /** Espande le annotazioni che corrispondono a un pattern più grande:
   * `rational:$n` diventa ``integer:$n/integer:$n`?``. */
  expand_pattern(tree: Tree | null): Tree | null {
    if (!tree) {
      return tree;
    }
    if (tree.args) {
      tree = { tok: tree.tok, args: tree.args.map((arg) => this.expand_pattern(arg) as Tree) };
    }

    if (
      tree.tok.type === "name" &&
      tree.tok.nameWithoutAnnotation === "$n" &&
      tree.tok.annotation?.includes("rational")
    ) {
      return this.compile("integer:$n/integer:$n`?");
    }

    return tree;
  }
}

// jme-rules.js:1913
/** Il parser dei pattern condiviso da tutto il modulo. */
export const patternParser = new PatternParser();

// jme-rules.js:1927-1944
/** Confronta un'espressione con un pattern, entrambi come stringhe JME.
 *
 * Di default `commutative`, `associative` e `allowOtherTerms` sono attive e lo
 * scope è quello dei builtin. */
export function matchExpression(pattern: string, expr: string, options?: MatchTreeOptions): PatternMatch {
  const default_options: MatchTreeOptions = {
    commutative: true,
    associative: true,
    allowOtherTerms: true,
    gatherList: false,
    strictInverse: false,
    scope: getBuiltinScope(),
  };
  const opts = extendOptions(default_options, options);
  return matchTree(patternParser.compile(pattern) as Tree, compile(expr) as Tree, opts);
}
