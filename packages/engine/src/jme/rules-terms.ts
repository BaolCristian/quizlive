/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:152-455 e 1064-1151 — la scomposizione di un albero nella
// sequenza dei suoi "termini" rispetto a un operatore, con i quantificatori
// del linguaggio dei pattern.
//
// Upstream tutto questo sta in `jme-rules.js` insieme al resto; qui è un file
// a sé per restare sotto le 1000 righe (vedi DIVERGENCES.md).

import { JmeError } from "./errors";
import { isName, isOp } from "./evaluate";
import type { Scope } from "./scope";
import { converseOps } from "./tokenizer";
import { TNum, TOp, type Token, type Tree } from "./tokens";

/** Le opzioni che governano il pattern-matching (jme-rules.js:12-27). */
export interface MatchTreeOptions {
  /** Si può usare la commutatività degli operatori? */
  commutative?: boolean;
  /** Si può usare l'associatività degli operatori? */
  associative?: boolean;
  /** I termini dell'espressione che non corrispondono a nulla sono ammessi? */
  allowOtherTerms?: boolean;
  /** I gruppi con lo stesso nome si raccolgono in una lista? */
  gatherList?: boolean;
  /** Se falso, `a-b` viene letto come `a+(-b)` quando si cercano gli addendi. */
  strictInverse?: boolean;
  /** Lo scope in cui valutare le condizioni. */
  scope?: Scope;
}

// jme-rules.js:29-37
/** Interpreta la stringa di opzioni di una `Rule`: `c` commutativo,
 * `a` associativo, `g` altri termini ammessi, `l` raccogli in lista,
 * `s` inverso stretto. */
export function parseOptions(str: string): MatchTreeOptions {
  return {
    commutative: str.match(/c/) !== null,
    associative: str.match(/a/) !== null,
    allowOtherTerms: str.match(/g/) !== null,
    gatherList: str.match(/l/) !== null,
    strictInverse: str.match(/s/) !== null,
  };
}

/** Le chiavi di `MatchTreeOptions`, nell'ordine di upstream. */
const optionKeys = ["commutative", "associative", "allowOtherTerms", "gatherList", "strictInverse", "scope"] as const;

// jme-rules.js:46-59
/** Sovrascrive le opzioni di `a` con quelle di `b`.
 *
 * upstream scrive sempre tutte le chiavi (anche a `undefined`); qui le chiavi
 * senza valore restano assenti, che è indistinguibile per chi legge (nessuno
 * usa `in` su queste opzioni) e rispetta `exactOptionalPropertyTypes`. */
export function extendOptions(a?: MatchTreeOptions, b?: MatchTreeOptions): MatchTreeOptions {
  a = a || {};
  b = b || {};
  const out: MatchTreeOptions = {};
  for (const k of optionKeys) {
    const v = b[k] === undefined ? a[k] : b[k];
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

// jme-rules.js:171-177 — come si compongono due quantificatori annidati.
/** Quantificatore risultante da `esterno` applicato a `interno`. */
export const quantifier_combo: Record<string, Record<string, string>> = {
  "0": { "`?": "0", "`*": "0", "`+": "0", "`:": "0" },
  "1": { "`?": "`?", "`*": "`*", "`+": "`+", "`:": "`?" },
  "`?": { "`?": "`?", "`*": "`*", "`+": "`*", "`:": "`?" },
  "`*": { "`?": "`*", "`*": "`*", "`+": "`*", "`:": "`*" },
  "`+": { "`?": "`*", "`*": "`*", "`+": "`+", "`:": "`*" },
};

// jme-rules.js:1064-1073
/** Quante volte deve corrispondere un quantificatore: minimo e massimo. */
export const quantifier_limits: Record<string, [number, number]> = {
  "0": [0, 0],
  "1": [1, 1],
  "`?": [0, 1],
  "`*": [0, Infinity],
  "`+": [1, Infinity],
};

// jme-rules.js:1082-1101
/** Il nome sotto cui memorizzare una sottoespressione catturata, e il valore
 * da memorizzarci. `nameTree` è l'argomento destro di `;`: un nome, oppure una
 * coppia chiave-valore che indica anche il valore. */
export function resolveName(nameTree: Tree, value?: Tree): { name: string; value: Tree | undefined } {
  const nameTok = nameTree.tok;
  if (!(nameTok.type === "name" || nameTok.type === "keypair")) {
    throw new JmeError("jme.matchTree.group name not a name");
  }
  let name: string;
  if (nameTok.type === "name") {
    name = nameTok.name;
  } else {
    name = nameTok.key;
    value = (nameTree.args as Tree[])[0] as Tree;
  }
  return { name: name, value: value };
}

/** I dati di un termine trovato da `getTerms` (jme-rules.js:157-168). */
export interface TermData {
  /** Il termine stesso. */
  term: Tree;
  /** I nomi catturati da questo termine. */
  names: Tree[];
  /** I nomi identificati catturati dentro il quantificatore. */
  inside_equalnames: string[];
  /** I nomi identificati catturati fuori dal quantificatore. */
  outside_equalnames: string[];
  /** Quante volte può comparire il termine, se è un termine di pattern. */
  quantifier: string;
  /** Il minimo numero di occorrenze. */
  min: number;
  /** Il massimo numero di occorrenze. */
  max: number;
  /** Il valore da usare se il termine manca. */
  defaultValue: Tree | null;
}

/** La lista dei termini di un albero. `min_total` è valorizzato solo quando
 * `getTerms` è chiamata con `calculate_minimum`. */
export interface TermList extends Array<TermData> {
  min_total?: number;
}

// jme-rules.js:195-263
/** Un termine di una sequenza: analizza un nodo per estrarne i nomi
 * catturati, il quantificatore e il valore di default. */
export class Term implements TermData {
  term: Tree;
  names: Tree[];
  inside_equalnames: string[];
  outside_equalnames: string[];
  quantifier: string;
  min: number;
  max: number;
  defaultValue: Tree | null;

  constructor(tree: Tree) {
    const names: Tree[] = [];
    const inside_equalnames: string[] = [];
    const outside_equalnames: string[] = [];
    let equalnames = outside_equalnames;
    let quantifier = "1";
    let defaultValue: Tree | null = null;
    if (isName(tree.tok, "$z")) {
      quantifier = "0";
    }
    // si tolgono i quantificatori dalla cima dell'albero
    while (tree.tok.type === "op") {
      const op = tree.tok.name;
      const args = tree.args as Tree[];
      if (op === ";") {
        names.push(args[1] as Tree);
      } else if (op === ";=") {
        names.push(args[1] as Tree);
        equalnames.push(resolveName(args[1] as Tree).name);
      } else if (op === "`?" || op === "`*" || op === "`+") {
        quantifier = (quantifier_combo[quantifier] as Record<string, string>)[op] as string;
        equalnames = inside_equalnames;
      } else if (op === "`:") {
        quantifier = (quantifier_combo[quantifier] as Record<string, string>)[op] as string;
        if (defaultValue === null) {
          defaultValue = args[1] as Tree;
        }
      } else if (
        args.length === 1 &&
        (args[0] as Tree).tok.type === "op" &&
        ["`?", "`*", "`+", "`:"].indexOf(((args[0] as Tree).tok as TOp).name) >= 0
      ) {
        // i quantificatori attraversano le operazioni unarie: "-(x`?)" è
        // equivalente a "(-x)`?".
        tree = { tok: (args[0] as Tree).tok, args: [{ tok: tree.tok, args: (args[0] as Tree).args as Tree[] }] };
        continue;
      } else {
        break;
      }
      tree = args[0] as Tree;
    }

    // jme-rules.js:238-256 — i "nomi identificati" catturati dentro l'albero:
    // sono gli argomenti destri di `;=`.
    /** Aggiunge a `equalnames` i nomi identificati trovati in `t`. */
    function find_equal_names(t: Tree): void {
      if (t.tok.type === "op") {
        switch (t.tok.name) {
          case ";=":
            equalnames.push(resolveName((t.args as Tree[])[1] as Tree).name);
            break;
          case "`+":
          case "`?":
          case "`*":
            return;
        }
      }
      if (t.args) {
        t.args.forEach(find_equal_names);
      }
    }
    find_equal_names(tree);

    this.term = tree;
    this.names = names;
    this.inside_equalnames = inside_equalnames;
    this.outside_equalnames = outside_equalnames;
    this.quantifier = quantifier;
    this.min = (quantifier_limits[quantifier] as [number, number])[0];
    this.max = (quantifier_limits[quantifier] as [number, number])[1];
    this.defaultValue = defaultValue;
  }
}

// jme-rules.js:270-283 — le riscritture da fare quando si cercano i termini
// di un operatore in modalità non stretta: `x-y` diventa `x+(-y)`.
/** Per ogni operatore, come riscrivere gli operatori "inversi". */
const nonStrictReplacements: Record<string, Record<string, (tree: Tree) => Tree>> = {
  "+": {
    "-": function (tree) {
      return {
        tok: new TOp("+", false, false, 2, true, true),
        args: [(tree.args as Tree[])[0] as Tree, insertUnaryMinus((tree.args as Tree[])[1] as Tree)],
      };
    },
  },
  "*": {
    "/": function (tree) {
      return {
        tok: new TOp("*", false, false, 2, true, true),
        args: [
          (tree.args as Tree[])[0] as Tree,
          { tok: new TOp("/u", false, true, 1, false, false), args: [(tree.args as Tree[])[1] as Tree] },
        ],
      };
    },
  },
};

// jme-rules.js:289-292
/** Gli operatori "canonici" da cercare in modalità non stretta. */
export const nonStrictCanonicalOps: Record<string, string> = {
  "-": "+",
  "/": "*",
};

// jme-rules.js:298-306
/** Inserisce un meno unario nell'albero. Se è un prodotto, il meno si applica
 * al fattore più a sinistra. */
export function insertUnaryMinus(tree: Tree): Tree {
  if (isOp(tree.tok, "*") || isOp(tree.tok, "/")) {
    return {
      tok: tree.tok,
      args: [insertUnaryMinus((tree.args as Tree[])[0] as Tree), (tree.args as Tree[])[1] as Tree],
    };
  } else {
    return { tok: new TOp("-u", false, true, 1, false, false), args: [tree] };
  }
}

// jme-rules.js:313-327
/** Toglie gli operatori di cattura `;` e `;=` dalla cima dell'albero. */
export function unwrapCapture(tree: Tree): { tree: Tree; names: Tree[]; equalnames: string[] } {
  const names: Tree[] = [];
  const equalnames: string[] = [];
  while (isOp(tree.tok, ";")) {
    names.push((tree.args as Tree[])[1] as Tree);
    tree = (tree.args as Tree[])[0] as Tree;
  }
  while (isOp(tree.tok, ";=")) {
    names.push((tree.args as Tree[])[1] as Tree);
    equalnames.push(resolveName((tree.args as Tree[])[1] as Tree).name);
    tree = (tree.args as Tree[])[0] as Tree;
  }
  return { tree: tree, names: names, equalnames: equalnames };
}

/** La cache dei termini che upstream appende all'albero stesso. */
interface TreeWithTerms extends Tree {
  terms?: Record<string, Record<string, TermList>>;
}

// jme-rules.js:338-455
/** Dato un albero della forma `t1 <op> t2 <op> ...`, la lista dei termini.
 *
 * Con `calculate_minimum` si calcola anche `min_total`, il numero minimo di
 * termini che l'espressione deve avere: è un pre-calcolo che serve solo sui
 * termini del pattern. */
export function getTerms(tree: Tree, op: string, options: MatchTreeOptions, calculate_minimum?: boolean): TermList {
  // jme-rules.js:346-359
  /** Aggiunge a ogni termine i nomi catturati più in alto nell'albero. */
  function add_existing_names(items: TermList, existing_names: Tree[], existing_equal_names: string[]): TermList {
    return existing_names.length === 0 && existing_equal_names.length === 0
      ? items
      : items.map((item) => {
          return {
            term: item.term,
            names: existing_names.concat(item.names),
            inside_equalnames: item.inside_equalnames,
            outside_equalnames: existing_equal_names.concat(item.outside_equalnames),
            quantifier: item.quantifier,
            min: item.min,
            max: item.max,
            defaultValue: item.defaultValue,
          };
        });
  }

  // il risultato si tiene in cache sull'albero stesso, come upstream
  const intree = tree as TreeWithTerms;
  if (intree.terms === undefined) {
    intree.terms = {};
  }
  if (intree.terms[op] === undefined) {
    intree.terms[op] = {};
  }
  const cache = intree.terms[op];
  const option_signature = String(Number(options.associative) * 2 + Number(options.strictInverse));

  const cached = cache[option_signature];
  if (cached) {
    return cached;
  }

  if (isOp(tree.tok, "-u") && op === "*") {
    tree = insertUnaryMinus((tree.args as Tree[])[0] as Tree);
  }

  const replacements = nonStrictReplacements[op];
  if (!options.strictInverse && replacements) {
    for (const subop in replacements) {
      if (isOp(tree.tok, subop)) {
        tree = (replacements[subop] as (t: Tree) => Tree)(tree);
      }
    }
  }

  // jme-rules.js:392-404
  /** Il token è l'operatore cercato — direttamente, come converso, o perché in
   * modalità non stretta verrebbe riscritto in quello. */
  function isThisOp(tok: Token): boolean {
    if (isOp(tok, op)) {
      return true;
    }
    const converse = converseOps[op];
    if (options.commutative && converse && isOp(tok, converse)) {
      return true;
    }
    if (!options.strictInverse && replacements && tok.type === "op" && tok.name in replacements) {
      return true;
    }
    return false;
  }

  let args = isOp(tree.tok, op) ? (tree.args as Tree[]) : [tree];
  const converse = converseOps[op];
  if (options.commutative && converse && isOp(tree.tok, converse)) {
    args = (tree.args as Tree[]).slice().reverse();
  }

  let terms: TermList = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as Tree;
    const item = new Term(arg);
    const res = unwrapCapture(arg);
    let argtok = res.tree.tok;
    if (op === "*" && isOp(argtok, "-u")) {
      argtok = unwrapCapture(((args[i] as Tree).args as Tree[])[0] as Tree).tree.tok;
    }
    if (options.associative && isThisOp(argtok)) {
      let sub = getTerms(res.tree, op, options, false);
      sub = add_existing_names(sub, item.names, item.outside_equalnames);
      if (item.quantifier !== "1") {
        // upstream (jme-rules.js:425-429) scrive `sub = sub.map(t => { ... })`
        // senza `return`: la lista diventa di `undefined`. Qui si tiene solo
        // la mutazione, che è l'intento (vedi DIVERGENCES.md).
        sub.forEach((t) => {
          t.quantifier = (quantifier_combo[t.quantifier] as Record<string, string>)[item.quantifier] as string;
        });
      }
      terms = terms.concat(sub);
    } else {
      if (item.max > 0) {
        terms.push(item);
      }
    }
  }

  if (calculate_minimum) {
    terms.min_total = 0;
    terms.forEach((t) => {
      terms.min_total = (terms.min_total as number) + t.min;
    });
  }

  cache[option_signature] = terms;
  return terms;
}

// jme-rules.js:1124-1141
/** Toglie le divisioni unarie da un albero: `a*(/b)` diventa `a/b`.
 *
 * Esistono solo per far funzionare più facilmente il matching dei prodotti. */
export function removeUnaryDivision(tree: Tree): Tree {
  if (isOp(tree.tok, "*")) {
    const args = tree.args as Tree[];
    if (isOp((args[1] as Tree).tok, "/u")) {
      return {
        tok: new TOp("/", false, false, 2, false, false),
        args: [removeUnaryDivision(args[0] as Tree), removeUnaryDivision(((args[1] as Tree).args as Tree[])[0] as Tree)],
      };
    }
    return { tok: tree.tok, args: args.map(removeUnaryDivision) };
  }
  if (isOp(tree.tok, "/u")) {
    return {
      tok: new TOp("/", false, false, 2, false, false),
      args: [{ tok: new TNum(1) }, removeUnaryDivision((tree.args as Tree[])[0] as Tree)],
    };
  }
  return tree;
}
