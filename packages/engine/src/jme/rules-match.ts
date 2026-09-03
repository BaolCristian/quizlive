/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:456-1151 e 1574-1757 — il cuore del pattern-matching: il
// dispatcher `matchTree` e tutti i matcher specializzati (nomi speciali,
// funzioni `m_*`, operatori del linguaggio dei pattern, liste, token).
//
// La scomposizione in termini sta in `rules-terms.ts`, l'allineamento delle
// sequenze in `rules-sequence.ts` (upstream sono tutti nello stesso file:
// vedi DIVERGENCES.md).

import * as math from "../math";
import { JmeError } from "./errors";
import { eq } from "./equality";
import { castToType, findvars, isOp, isType, substituteTree } from "./evaluate";
import { patternParser } from "./rules-parser";
import { matchOrdinaryOp, matchTermSequence } from "./rules-sequence";
import { extendOptions, resolveName, Term, type MatchTreeOptions, type TermList } from "./rules-terms";
import { Scope } from "./scope";
import { normaliseName } from "./tokenizer";
import { TList, TString, type TName, type Token, type Tree } from "./tokens";
import { copy_tree, extendObject, mergeUnique } from "./util";

/** Il risultato di un match riuscito: i nomi catturati con i relativi
 * sottoalberi. `false` se il match fallisce (jme-rules.js:461-467). */
export type PatternMatch = Record<string, Tree> | false;

// jme-rules.js:456-483
/** Il nome `_match` contiene sempre l'intero albero che ha corrisposto al
 * pattern: questa funzione lo aggiunge se manca. */
function preserve_match(m: PatternMatch, exprTree: Tree): PatternMatch {
  if (m === false) {
    return false;
  }
  if (m["_match"] === undefined) {
    m["_match"] = exprTree;
  }
  return m;
}

// jme-rules.js:484-536
/** Verifica ricorsivamente se `exprTree` corrisponde a `ruleTree`. */
export function matchTree(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const scope = options.scope as Scope;
  const m = ((): PatternMatch => {
    if (!exprTree) {
      return false;
    }

    if (isType(ruleTree.tok, "name")) {
      const c = scope.getConstant((ruleTree.tok as TName).name);
      if (c) {
        ruleTree = { tok: c.value };
      }
    }

    if (isType(exprTree.tok, "name")) {
      const c = scope.getConstant((exprTree.tok as TName).name);
      if (c) {
        exprTree = { tok: c.value };
      }
    }

    const ruleTok = ruleTree.tok;
    if (isOp(ruleTok, ";") || isOp(ruleTok, ";=")) {
      const mm = matchTree((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
      if (!mm) {
        return false;
      }
      const o = resolveName((ruleTree.args as Tree[])[1] as Tree, mm["_match"]);
      mm[o.name] = o.value as Tree;
      return mm;
    }

    switch (ruleTok.type) {
      case "name":
        return matchName(ruleTree, exprTree, options);
      case "function":
        return matchFunction(ruleTree, exprTree, options);
      case "op":
        return matchOp(ruleTree, exprTree, options);
      case "list":
        return matchList(ruleTree, exprTree, options);
      default:
        return matchToken(ruleTree, exprTree, options);
    }
  })();
  return preserve_match(m, exprTree);
}

/** Il valore numerico di un token, o `undefined` se non è un numero. */
function asNumber(tok: Token): math.NumbasNumber | undefined {
  try {
    return (castToType(tok, "number") as { value: math.NumbasNumber }).value;
  } catch {
    return undefined;
  }
}

// jme-rules.js:537-632
/** Le condizioni che si possono annotare su `$n`, es. `integer:$n`. */
export const number_conditions: Record<string, (exprTree: Tree, options: MatchTreeOptions) => boolean> = {
  complex(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.isComplex(v);
  },
  imaginary(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.isComplex(v) && math.re(v) === 0;
  },
  real(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.im(v) === 0;
  },
  positive(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.positive(v);
  },
  nonnegative(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.nonnegative(v);
  },
  negative(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.negative(v);
  },
  integer(exprTree) {
    if (exprTree.tok.type === "integer") {
      return true;
    }
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : math.isInt(v);
  },
  decimal(exprTree) {
    if (asNumber(exprTree.tok) === undefined) {
      return false;
    }
    return math.countDP((exprTree.tok as { originalValue?: string }).originalValue as string) > 0;
  },
  rational(exprTree, options) {
    if (exprTree.tok.type === "rational") {
      return true;
    }
    return matchTree(patternParser.compile("integer:$n/integer:$n`?") as Tree, exprTree, options) !== false;
  },
  nonzero(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : !math.eq(v, 0);
  },
  nonone(exprTree) {
    const v = asNumber(exprTree.tok);
    return v === undefined ? false : !math.eq(v, 1);
  },
};

// jme-rules.js:634-666
/** I nomi JME che hanno un significato speciale nei pattern. */
export const specialMatchNames: Record<string, (r: Tree, e: Tree, o: MatchTreeOptions) => PatternMatch> = {
  "?": function () {
    return {};
  },
  $n: function (ruleTree, exprTree, options) {
    const ruleTok = ruleTree.tok as TName;
    const exprTok = exprTree.tok;
    if (ruleTok.annotation !== undefined) {
      const satisfies = ruleTok.annotation.every((condition) => {
        const test = number_conditions[condition];
        return !test || test(exprTree, options);
      });
      if (!satisfies) {
        return false;
      }
    } else {
      if (!isType(exprTok, "number")) {
        return false;
      }
    }
    return {};
  },
  $v: function (_ruleTree, exprTree) {
    if (exprTree.tok.type !== "name") {
      return false;
    }
    return {};
  },
  $z: function () {
    return false;
  },
};

// jme-rules.js:677-692
/** Confronta un token nome: `?` corrisponde a qualsiasi cosa, `$n` a un
 * numero, `$z` a niente; gli altri nomi corrispondono allo stesso nome. */
function matchName(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const ruleTok = ruleTree.tok;
  const exprTok = exprTree.tok;
  if (ruleTok.type !== "name") {
    return false;
  }
  const special = specialMatchNames[ruleTok.nameWithoutAnnotation];
  if (special) {
    return special(ruleTree, exprTree, options);
  } else {
    if (exprTok.type !== "name") {
      return false;
    }
    const same = normaliseName(ruleTok.name, options.scope) === normaliseName(exprTok.name, options.scope);
    return same ? {} : false;
  }
}

// jme-rules.js:699-703
/** Costruisce un matcher che forza alcune opzioni e richiama `matchTree`. */
function setMatchOptions(new_options: MatchTreeOptions): (r: Tree, e: Tree, o: MatchTreeOptions) => PatternMatch {
  return function (ruleTree, exprTree, options) {
    return matchTree((ruleTree.args as Tree[])[0] as Tree, exprTree, extendOptions(options, new_options));
  };
}

// jme-rules.js:711-726
/** Corrisponde se il pattern compare come sottoespressione in un punto
 * qualsiasi dell'espressione. */
function matchAnywhere(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const noptions = extendOptions(options, { allowOtherTerms: true });
  const m = matchTree(ruleTree, exprTree, noptions);
  if (m !== false) {
    return m;
  }
  if (exprTree.args) {
    for (let i = 0; i < exprTree.args.length; i++) {
      const am = matchAnywhere(ruleTree, exprTree.args[i] as Tree, options);
      if (am !== false) {
        return am;
      }
    }
  }
  return false;
}

// jme-rules.js:734-771
/** Le funzioni JME che hanno un significato speciale nei pattern. */
export const specialMatchFunctions: Record<string, (r: Tree, e: Tree, o: MatchTreeOptions) => PatternMatch> = {
  m_uses: function (ruleTree, exprTree, options) {
    const names = (ruleTree.args as Tree[]).map((t) => (t.tok as TName).name);
    return matchUses(names, exprTree, options);
  },
  m_exactly: setMatchOptions({ allowOtherTerms: false }),
  m_commutative: setMatchOptions({ commutative: true }),
  m_noncommutative: setMatchOptions({ commutative: false }),
  m_associative: setMatchOptions({ associative: true }),
  m_nonassociative: setMatchOptions({ associative: false }),
  m_strictinverse: setMatchOptions({ strictInverse: true }),
  m_gather: setMatchOptions({ gatherList: false }),
  m_nogather: setMatchOptions({ gatherList: true }),
  m_type: function (ruleTree, exprTree) {
    const tok = (ruleTree.args as Tree[])[0]?.tok as { name?: string; value?: unknown };
    const wantedType = (tok.name ?? tok.value) as string;
    return matchType(wantedType, exprTree);
  },
  m_func: function (ruleTree, exprTree, options) {
    return matchGenericFunction(ruleTree, exprTree, options);
  },
  m_op: function (ruleTree, exprTree, options) {
    return matchGenericOp(ruleTree, exprTree, options);
  },
  m_anywhere: function (ruleTree, exprTree, options) {
    return matchAnywhere((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
};

// jme-rules.js:781-791
/** Confronta un'applicazione di funzione, smistando alle funzioni speciali. */
function matchFunction(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const ruleTok = ruleTree.tok;
  if (ruleTok.type !== "function") {
    return false;
  }
  const special = specialMatchFunctions[ruleTok.nameWithoutAnnotation];
  if (special) {
    return special(ruleTree, exprTree, options);
  } else {
    return matchOrdinaryFunction(ruleTree, exprTree, options);
  }
}

// jme-rules.js:800-814
/** `m_func(nome, argomenti)`: corrisponde a una funzione qualsiasi il cui nome
 * (come stringa) e i cui argomenti (come lista) soddisfano i due pattern. */
function matchGenericFunction(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  if (exprTree.tok.type !== "function") {
    return false;
  }
  const nameRule = (ruleTree.args as Tree[])[0] as Tree;
  const argsRule = (ruleTree.args as Tree[])[1] as Tree;
  const exprNameTree: Tree = { tok: new TString(exprTree.tok.name) };
  const argsTree: Tree = { tok: new TList(), args: exprTree.args as Tree[] };
  const m_name = matchTree(nameRule, exprNameTree, options);
  const m_args = matchTree(argsRule, argsTree, options);
  if (m_name && m_args) {
    return mergeMatches([m_name, m_args]);
  } else {
    return false;
  }
}

// jme-rules.js:823-836
/** Come `matchGenericFunction`, ma per gli operatori (`m_op`). */
function matchGenericOp(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  if (exprTree.tok.type !== "op") {
    return false;
  }
  const nameRule = (ruleTree.args as Tree[])[0] as Tree;
  const argsRule = (ruleTree.args as Tree[])[1] as Tree;
  const exprNameTree: Tree = { tok: new TString(exprTree.tok.name) };
  const argsTree: Tree = { tok: new TList(), args: exprTree.args as Tree[] };
  const m_name = matchTree(nameRule, exprNameTree, options);
  const m_args = matchTree(argsRule, argsTree, options);
  if (m_name && m_args) {
    return mergeMatches([m_name, m_args]);
  } else {
    return false;
  }
}

// jme-rules.js:837-870
/** Gli operatori del linguaggio dei pattern. */
export const specialMatchOps: Record<string, (r: Tree, e: Tree, o: MatchTreeOptions) => PatternMatch> = {
  "`?": function (ruleTree, exprTree, options) {
    return matchTree((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`*": function (ruleTree, exprTree, options) {
    return matchTree((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`+": function (ruleTree, exprTree, options) {
    return matchTree((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`|": function (ruleTree, exprTree, options) {
    return matchAny(ruleTree.args as Tree[], exprTree, options);
  },
  "`:": function (ruleTree, exprTree, options) {
    return matchDefault((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`+-": function (ruleTree, exprTree, options) {
    return matchOptionalPrefix(["-u", "+u"], (ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`*/": function (ruleTree, exprTree, options) {
    return matchOptionalPrefix(["/u"], (ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`!": function (ruleTree, exprTree, options) {
    return matchNot((ruleTree.args as Tree[])[0] as Tree, exprTree, options);
  },
  "`&": function (ruleTree, exprTree, options) {
    return matchAnd(ruleTree.args as Tree[], exprTree, options);
  },
  "`where": function (ruleTree, exprTree, options) {
    return matchWhere((ruleTree.args as Tree[])[0] as Tree, (ruleTree.args as Tree[])[1] as Tree, exprTree, options);
  },
  "`@": function (ruleTree, exprTree, options) {
    return matchMacro((ruleTree.args as Tree[])[0] as Tree, (ruleTree.args as Tree[])[1] as Tree, exprTree, options);
  },
};

// jme-rules.js:880-890
/** Confronta un'applicazione di operatore, smistando agli operatori speciali. */
function matchOp(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const ruleTok = ruleTree.tok;
  if (ruleTok.type !== "op") {
    return false;
  }
  const special = specialMatchOps[ruleTok.name];
  if (special) {
    return special(ruleTree, exprTree, options);
  } else {
    return matchOrdinaryOp(ruleTree, exprTree, options);
  }
}

// jme-rules.js:901-925
/** `` `where ``: l'espressione deve corrispondere al pattern e la condizione,
 * scritta nei nomi catturati, deve valutare a vero. */
function matchWhere(pattern: Tree, condition: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const scope = new Scope(options.scope as Scope);

  const m = matchTree(pattern, exprTree, options);
  if (!m) {
    return false;
  }

  const variables = m as unknown as Record<string, Token>;
  // upstream: `util.copyobj(condition, true)`, una copia profonda che clona
  // anche i token. Qui i token sono istanze di classe (con getter e tabelle
  // di cast sul prototipo): una copia strutturale li romperebbe, quindi si usa
  // `copy_tree` (jme.js:101-107), che copia i nodi e riusa i token.
  let cond = copy_tree(condition);
  cond = substituteTree(cond, new Scope({ variables: variables }), true) as Tree;
  try {
    const cscope = new Scope([scope, { variables: variables }]);
    const result = cscope.evaluate(cond, undefined, true);
    if (result !== null && result.type === "boolean" && result.value === false) {
      return false;
    }
  } catch {
    return false;
  }
  return m;
}

// jme-rules.js:935-952
/** `` `@ ``: sostituisce i sotto-pattern con nome prima di confrontare. */
function matchMacro(subPatterns: Tree, pattern: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  if (subPatterns.tok.type !== "dict") {
    throw new JmeError("jme.matchTree.match macro first argument not a dictionary");
  }
  const d: Record<string, Tree> = {};
  (subPatterns.args as Tree[]).forEach((keypair) => {
    const name = (keypair.tok as { key: string }).key;
    d[name] = (keypair.args as Tree[])[0] as Tree;
  });
  const substituted = substituteTree(
    pattern,
    new Scope({ variables: d as unknown as Record<string, Token> }),
    true,
  ) as Tree;
  return matchTree(substituted, exprTree, options);
}

// jme-rules.js:962-1013
/** Confronta l'applicazione di una funzione ordinaria: stessa funzione, e
 * argomenti che corrispondono agli argomenti del pattern. */
function matchOrdinaryFunction(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const ruleTok = ruleTree.tok as { name: string };
  const exprTok = exprTree.tok;
  if (
    exprTok.type !== "function" ||
    (ruleTok.name !== "?" && normaliseName(ruleTok.name, options.scope) !== normaliseName(exprTok.name, options.scope))
  ) {
    return false;
  }
  const ruleArgs: TermList = (ruleTree.args as Tree[]).map((t) => new Term(t));
  const exprArgs: TermList = (exprTree.args as Tree[]).map((t) => new Term(t));

  const namedTerms = matchTermSequence(ruleArgs, exprArgs, false, false, options);
  if (namedTerms === false) {
    return false;
  }

  // jme-rules.js:985-1000
  /** Il nome è catturato da questo albero? */
  function name_captured(name: string, tree: Tree): boolean {
    if (isOp(tree.tok, ";")) {
      const res = resolveName((tree.args as Tree[])[1] as Tree);
      if (res.name === name) {
        return true;
      }
    }
    if (tree.args) {
      return tree.args.some((t2) => name_captured(name, t2));
    }
    return false;
  }

  // si raccolgono i gruppi con nome
  const match: Record<string, Tree> = {};
  for (const name in namedTerms) {
    let occurrences = 0;
    for (let i = 0; i < (ruleTree.args as Tree[]).length; i++) {
      if (name_captured(name, (ruleTree.args as Tree[])[i] as Tree)) {
        occurrences += 1;
      }
    }
    const terms = namedTerms[name] as Tree[];
    match[name] = occurrences <= 1 ? (terms[0] as Tree) : { tok: new TList(terms.length), args: terms };
  }
  return match;
}

// jme-rules.js:1022-1053
/** Confronta un pattern che è una lista. */
function matchList(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  if (exprTree.tok.type !== "list") {
    return false;
  }
  /** Gli elementi di una lista: gli argomenti dell'albero, o — se la lista è
   * già stata valutata — i token nel valore. */
  function getElements(list: Tree): Tree[] {
    if (list.args) {
      return list.args;
    } else {
      return ((list.tok as TList).value as Token[]).map((e) => ({ tok: e }));
    }
  }
  const ruleElements: TermList = getElements(ruleTree).map((t) => new Term(t));
  const exprElements: TermList = getElements(exprTree).map((t) => new Term(t));

  options = extendOptions(options, { allowOtherTerms: false });

  const namedTerms = matchTermSequence(ruleElements, exprElements, false, false, options);
  if (namedTerms === false) {
    return false;
  }

  // si raccolgono i gruppi con nome
  const match: Record<string, Tree> = {};
  for (const name in namedTerms) {
    const terms = namedTerms[name] as Tree[];
    if (terms.length === 1 && !options.gatherList) {
      match[name] = terms[0] as Tree;
    } else {
      match[name] = { tok: new TList(terms.length), args: terms };
    }
  }
  return match;
}

// jme-rules.js:1062-1066
/** Confronto esatto fra token: stesso tipo e stesso valore. */
function matchToken(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  return eq(ruleTree.tok, exprTree.tok, options.scope as Scope) ? {} : false;
}

// jme-rules.js:1108-1122
/** I nomi catturati da un pattern. */
export function findCapturedNames(ruleTree: Tree): string[] {
  const tok = ruleTree.tok;
  let names: string[] = [];
  if (isOp(tok, ";") || isOp(tok, ";=")) {
    const res = resolveName((ruleTree.args as Tree[])[1] as Tree);
    names.push(res.name);
  }
  if (ruleTree.args) {
    for (let i = 0; i < ruleTree.args.length; i++) {
      const argnames = findCapturedNames(ruleTree.args[i] as Tree);
      names = mergeUnique(names, argnames);
    }
  }
  return names;
}

// jme-rules.js:1582-1590
/** `` `| ``: il primo pattern che corrisponde vince. */
function matchAny(patterns: Tree[], exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  for (let i = 0; i < patterns.length; i++) {
    const m = matchTree(patterns[i] as Tree, exprTree, options);
    if (m) {
      return m;
    }
  }
  return false;
}

// jme-rules.js:1600-1603
/** `` `: ``: il valore di default ha senso solo dentro una sequenza di
 * termini, quindi qui si confronta solo il pattern. */
function matchDefault(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  return matchTree(ruleTree, exprTree, options);
}

// jme-rules.js:1609-1623
/** Porta in cima all'albero l'eventuale meno unario. */
export function extractLeadingMinus(tree: Tree): Tree {
  if (isOp(tree.tok, "*") || isOp(tree.tok, "/")) {
    const args = tree.args as Tree[];
    if (isOp((args[0] as Tree).tok, "-u")) {
      return {
        tok: (args[0] as Tree).tok,
        args: [{ tok: tree.tok, args: [((args[0] as Tree).args as Tree[])[0] as Tree, args[1] as Tree] }],
      };
    } else {
      const left = extractLeadingMinus(args[0] as Tree);
      if (isOp(left.tok, "-u")) {
        return { tok: left.tok, args: [{ tok: tree.tok, args: [(left.args as Tree[])[0] as Tree, args[1] as Tree] }] };
      } else {
        return tree;
      }
    }
  } else {
    return tree;
  }
}

// jme-rules.js:1634-1650
/** Corrisponde a `rule` oppure a `prefisso(rule)`, per una lista di operatori
 * unari opzionali. */
function matchOptionalPrefix(
  prefixes: string[],
  ruleTree: Tree,
  exprTree: Tree,
  options: MatchTreeOptions,
): PatternMatch {
  const originalExpr = exprTree;
  exprTree = extractLeadingMinus(exprTree);
  for (let i = 0; i < prefixes.length; i++) {
    const prefix = prefixes[i] as string;
    if (isOp(exprTree.tok, prefix)) {
      exprTree = (exprTree.args as Tree[])[0] as Tree;
      break;
    }
  }
  const m = matchTree(ruleTree, exprTree, options);
  if (m) {
    m["_match"] = originalExpr;
    return m;
  } else {
    return false;
  }
}

// jme-rules.js:1659-1665
/** `` `! ``: corrisponde se l'espressione NON corrisponde al pattern. */
function matchNot(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  if (!matchTree(ruleTree, exprTree, options)) {
    return preserve_match({}, exprTree);
  } else {
    return false;
  }
}

// jme-rules.js:1675-1683
/** `m_uses`: corrisponde se l'espressione usa tutti i nomi liberi elencati. */
function matchUses(names: string[], exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const vars = findvars(exprTree, [], options.scope);
  for (let i = 0; i < names.length; i++) {
    if (!vars.includes(names[i] as string)) {
      return false;
    }
  }
  return {};
}

// jme-rules.js:1691-1697
/** `m_type`: corrisponde se il token in cima ha il tipo richiesto. */
function matchType(wantedType: string, exprTree: Tree): PatternMatch {
  if (exprTree.tok.type === wantedType) {
    return {};
  } else {
    return false;
  }
}

// jme-rules.js:1707-1722
/** `` `& ``: tutti i pattern devono corrispondere. */
function matchAnd(patterns: Tree[], exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const matches: Array<Record<string, Tree>> = [];
  for (let i = 0; i < patterns.length; i++) {
    const m = matchTree(patterns[i] as Tree, exprTree, options);
    if (m) {
      matches.push(m);
    } else {
      return false;
    }
  }
  return mergeMatches(matches);
}

// jme-rules.js:1732-1744
/** Tutti i match del pattern, in qualsiasi punto dell'espressione. */
export function matchAllTree(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): Array<Record<string, Tree>> {
  let matches: Array<Record<string, Tree>> = [];
  const m = matchTree(ruleTree, exprTree, options);
  if (m) {
    matches = [m];
  }
  if (exprTree.args) {
    exprTree.args.forEach((arg) => {
      const submatches = matchAllTree(ruleTree, arg, options);
      matches = matches.concat(submatches);
    });
  }
  return matches;
}

// jme-rules.js:1752-1756
/** Fonde una lista di match: i successivi vincono sui precedenti. */
export function mergeMatches(matches: Array<Record<string, Tree>>): Record<string, Tree> {
  return extendObject({} as Record<string, Tree>, ...(matches as Array<Record<string, unknown>>));
}
