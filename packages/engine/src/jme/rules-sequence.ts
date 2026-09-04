/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:1152-1573 — l'allineamento fra i termini di un pattern e quelli
// di un'espressione: `matchOrdinaryOp`, `matchTermSequence` e l'automa di
// `findSequenceMatch`.
//
// `findSequenceMatch` è un piccolo motore di espressioni regolari con
// backtracking esplicito: è portato riga per riga, stato `capture` compreso
// (inventario §8.6). Niente regex vere, niente riscritture "più pulite".

import { compareTrees } from "./compare";
import { isOp } from "./evaluate";
import { matchTree } from "./rules-match";
import {
  getTerms,
  removeUnaryDivision,
  resolveName,
  nonStrictCanonicalOps,
  type MatchTreeOptions,
  type TermData,
  type TermList,
} from "./rules-terms";
import { associative as globalAssociative, commutative as globalCommutative } from "./tokenizer";
import { TExpression, TList, TOp, type Tree } from "./tokens";
import type { PatternMatch } from "./rules-match";

// jme-rules.js:1160-1217
/** Confronta un'espressione con un pattern la cui cima è un operatore
 * ordinario: si trovano i termini di entrambi e si allineano, rispettando i
 * quantificatori del pattern. */
export function matchOrdinaryOp(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch {
  const ruleTok = ruleTree.tok as TOp;
  const exprTok = exprTree.tok;
  let op = ruleTok.name;
  let commuting = Boolean(options.commutative && ruleTok.commutative);
  let associating = Boolean(options.associative && ruleTok.associative);
  if (!options.strictInverse && nonStrictCanonicalOps[op]) {
    op = nonStrictCanonicalOps[op] as string;
    commuting = Boolean(options.commutative && globalCommutative[op]);
    associating = Boolean(options.associative && globalAssociative[op]);
  }
  const term_options: MatchTreeOptions = {
    commutative: options.commutative ?? false,
    associative: associating,
    strictInverse: options.strictInverse ?? false,
  };
  const ruleTerms = getTerms(ruleTree, op, term_options, true);
  const exprTerms = getTerms(exprTree, op, term_options, false);
  if (exprTerms.length < (ruleTerms.min_total as number)) {
    return false;
  }

  if (!associating) {
    if (!isOp(exprTok, op) && ruleTerms.length === 1) {
      return false;
    }
  }

  const namedTerms = matchTermSequence(
    ruleTerms,
    exprTerms,
    commuting,
    Boolean(options.allowOtherTerms) && associating,
    options,
  );
  if (namedTerms === false) {
    return false;
  }

  // si raccolgono i gruppi con nome
  const match: Record<string, Tree> = {};
  for (const name in namedTerms) {
    const terms = namedTerms[name] as Tree[];
    if (terms.length === 1) {
      match[name] = removeUnaryDivision(terms[0] as Tree);
    } else if (options.gatherList) {
      match[name] = {
        tok: new TList(terms.length),
        args: terms.map((t) => {
          return { tok: new TExpression(removeUnaryDivision(t)) };
        }),
      };
    } else {
      let sub = terms[0] as Tree;
      for (let i = 1; i < terms.length; i++) {
        sub = { tok: new TOp(op), args: [sub, terms[i] as Tree] };
      }
      if (op === "*") {
        sub = removeUnaryDivision(sub);
      }
      match[name] = sub;
    }
  }
  // upstream mette anche il nome dell'operatore nel dizionario dei match, dove
  // il valore è una stringa e non un albero: lo rilegge `transform`.
  (match as unknown as Record<string, string>)["__op__"] = op;

  return match;
}

/** Il risultato memorizzato del confronto fra un termine dell'espressione e un
 * termine del pattern. */
interface CachedTermMatch {
  match: PatternMatch;
  inside_equalnames: Record<string, Tree>;
  outside_equalnames: Record<string, Tree>;
}

// jme-rules.js:1229-1392
/** Allinea i termini del pattern a quelli dell'espressione.
 *
 * Ritorna `false` se non c'è corrispondenza, altrimenti un dizionario che
 * associa a ogni nome catturato la lista delle sottoespressioni corrispondenti
 * (sta a chi chiama ricomporle). */
export function matchTermSequence(
  ruleTerms: TermList,
  exprTerms: TermList,
  commuting: boolean,
  allowOtherTerms: boolean,
  options: MatchTreeOptions,
  term_options?: MatchTreeOptions,
): Record<string, Tree[]> | false {
  const termOptions = term_options || options;
  const matches: Record<number, Record<number, CachedTermMatch>> = {};
  exprTerms.forEach((_, i) => {
    matches[i] = {};
  });

  // jme-rules.js:1246-1275
  /** Il termine dell'espressione corrisponde a quello del pattern? Il
   * risultato si tiene in cache per la coppia di indici. */
  function term_ok(exprTerm: TermData, ruleTerm: TermData, ic: number, pc: number): boolean {
    const row = matches[ic] as Record<number, CachedTermMatch>;
    if (row[pc] === undefined) {
      const m = matchTree(ruleTerm.term, exprTerm.term, termOptions);
      const inside_equalnames: Record<string, Tree> = {};
      ruleTerm.inside_equalnames.forEach((name) => {
        if (m && m[name]) {
          inside_equalnames[name] = m[name] as Tree;
        } else if (ruleTerm.names.some((n) => resolveName(n).name === name)) {
          if (m && m["_match"]) {
            inside_equalnames[name] = m["_match"] as Tree;
          }
        }
      });
      const outside_equalnames: Record<string, Tree> = {};
      ruleTerm.outside_equalnames.forEach((name) => {
        if (m && m[name]) {
          outside_equalnames[name] = m[name] as Tree;
        } else if (ruleTerm.names.some((n) => resolveName(n).name === name)) {
          if (m && m["_match"]) {
            outside_equalnames[name] = m["_match"] as Tree;
          }
        }
      });
      row[pc] = {
        match: m,
        inside_equalnames: inside_equalnames,
        outside_equalnames: outside_equalnames,
      };
    }
    return (row[pc] as CachedTermMatch).match !== false;
  }

  // jme-rules.js:1285-1307
  /** L'assegnamento corrente rispetta i vincoli? L'unico vincolo è che tutte
   * le sottoespressioni catturate con lo stesso nome tramite `;=` siano
   * uguali secondo `compareTrees`. */
  function constraint_ok(assignment: number[], ic: number, pc: number): boolean {
    const m1 = (matches[ic] as Record<number, CachedTermMatch>)[pc] as CachedTermMatch;
    const ruleTerm = ruleTerms[pc] as TermData;
    if (ruleTerm.inside_equalnames.length === 0 && ruleTerm.outside_equalnames.length === 0) {
      return true;
    }
    return assignment.every((p, i) => {
      if (p < 0 || p >= ruleTerms.length) {
        return true;
      }
      const m2 = (matches[i] as Record<number, CachedTermMatch>)[p] as CachedTermMatch;
      const equalnames = p === pc ? "inside_equalnames" : "outside_equalnames";
      return ruleTerm[equalnames].every((name) => {
        const e1 = m1[equalnames][name];
        const e2 = m2[equalnames][name];
        if (e1 === undefined || e2 === undefined) {
          return true;
        }
        return compareTrees(e1, e2) === 0;
      });
    });
  }

  const assignment = findSequenceMatch(ruleTerms, exprTerms, {
    checkFn: term_ok,
    constraintFn: constraint_ok,
    commutative: commuting,
    allowOtherTerms: allowOtherTerms,
  });
  if (assignment === false) {
    return false;
  }

  const namedTerms: Record<string, Tree[]> = {};

  const identified_names: Record<string, TermData> = {};
  ruleTerms.forEach((ruleTerm) => {
    ruleTerm.outside_equalnames.forEach((name) => {
      identified_names[name] = identified_names[name] || ruleTerm;
    });
  });

  // jme-rules.js:1341-1352
  /** Registra che `exprTree` è stato catturato col nome dato. */
  function nameTerm(name: string, exprTree: Tree, ruleTerm?: TermData, allowReservedName?: boolean): void {
    if (!allowReservedName && name.match(/^_/)) {
      return;
    }
    if (!namedTerms[name]) {
      namedTerms[name] = [];
    }
    if (
      identified_names[name] !== undefined &&
      identified_names[name] !== ruleTerm &&
      (namedTerms[name] as Tree[]).length
    ) {
      return;
    }
    (namedTerms[name] as Tree[]).push(exprTree);
  }
  // jme-rules.js:1358-1363
  /** Registra la corrispondenza fra `ruleTerm` e `exprTree`: aggiunge
   * `exprTree` a tutti i nomi di `ruleTerm`. */
  function matchTerm(ruleTerm: TermData, exprTree: Tree): void {
    ruleTerm.names.forEach((name) => {
      const o = resolveName(name, exprTree);
      nameTerm(o.name, o.value as Tree, ruleTerm);
    });
  }

  assignment.result.forEach((is, j) => {
    const ruleTerm = ruleTerms[j] as TermData;

    if (is.length) {
      is.forEach((i) => {
        const match = ((matches[i] as Record<number, CachedTermMatch>)[j] as CachedTermMatch).match;
        for (const name in match as Record<string, Tree>) {
          nameTerm(name, (match as Record<string, Tree>)[name] as Tree, ruleTerm);
        }
        matchTerm(ruleTerm, (exprTerms[i] as TermData).term);
      });
    } else if (ruleTerm.defaultValue) {
      matchTerm(ruleTerm, ruleTerm.defaultValue);
    }
  });
  assignment.ignored_start_terms.forEach((i) => {
    nameTerm("_rest", (exprTerms[i] as TermData).term, undefined, true);
    nameTerm("_rest_start", (exprTerms[i] as TermData).term, undefined, true);
  });
  assignment.ignored_end_terms.forEach((i) => {
    nameTerm("_rest", (exprTerms[i] as TermData).term, undefined, true);
    nameTerm("_rest_end", (exprTerms[i] as TermData).term, undefined, true);
  });

  return namedTerms;
}

/** Le opzioni di `findSequenceMatch` (jme-rules.js:1375-1382). */
export interface FindSequenceMatchOptions {
  /** I termini che non corrispondono a nulla possono essere ignorati? */
  allowOtherTerms?: boolean;
  /** I termini dell'espressione si possono considerare in qualsiasi ordine? */
  commutative?: boolean;
  /** L'assegnamento corrente rispetta i vincoli? */
  constraintFn: (assignment: number[], ic: number, pc: number) => boolean;
  /** Il termine dell'espressione corrisponde a quello del pattern? */
  checkFn: (exprTerm: TermData, ruleTerm: TermData, ic: number, pc: number) => boolean;
}

/** Il risultato di `findSequenceMatch`. */
export interface SequenceMatch {
  /** I termini iniziali non usati. */
  ignored_start_terms: number[];
  /** Per ogni termine del pattern, gli indici dei termini che gli
   * corrispondono. */
  result: number[][];
  /** Gli altri termini non usati. */
  ignored_end_terms: number[];
}

// jme-rules.js:1393-1573
/** Allinea una sequenza di termini a una sequenza-pattern, rispettando i
 * quantificatori. Il match è greedy: un termine in ingresso preferisce i
 * termini di pattern che vengono prima. */
export function findSequenceMatch(
  pattern: TermList,
  input: TermList,
  options: FindSequenceMatchOptions,
): SequenceMatch | false {
  let capture: number[] = [];
  let start = 0;
  let done = false;
  let failed = false;
  let pc = 0;
  let ic = 0;

  /** Quante volte si è già usato il termine di pattern `p`. */
  function count(p: number): number {
    return capture.filter((x) => x === p).length;
  }
  /** Il termine di pattern `p` è stato usato tutte le volte consentite? */
  function consumed(p: number): boolean {
    return count(p) >= (pattern[p] as TermData).max;
  }
  /** Il termine di pattern `p` è stato usato almeno il minimo di volte? */
  function enough(p: number): boolean {
    return count(p) >= (pattern[p] as TermData).min;
  }
  /** Sposta avanti di uno il puntatore d'inizio: i termini prima dell'inizio
   * finiscono in `ignored_start_terms`. */
  function increment_start(): void {
    start += 1;
    ic = start;
    pc = 0;
  }
  /** Torna all'ultima scelta libera. Se si è già all'inizio e `allowOtherTerms`
   * è attivo, sposta avanti il puntatore d'inizio. */
  function backtrack(): void {
    if (options.allowOtherTerms && ic === start && capture.length === start && start < input.length - 1) {
      capture.push(-1);
      increment_start();
      return;
    }

    ic -= 1;
    while (ic >= start && (ic >= capture.length || (capture[ic] as number) >= pattern.length)) {
      ic -= 1;
    }

    if (ic < start) {
      if (options.allowOtherTerms && start < input.length - 1) {
        capture = [];
        increment_start();
        for (let i = 0; i < start; i++) {
          capture.push(-1);
        }
        return;
      } else {
        failed = true;
        return;
      }
    }
    pc = (capture[ic] as number) + 1;
    capture = capture.slice(0, ic);
  }
  /** Sposta avanti di uno il puntatore d'ingresso. In modalità commutativa
   * riporta il puntatore del pattern all'inizio. */
  function advance_input(): void {
    ic += 1;
    if (options.commutative) {
      pc = 0;
    }
  }

  while (!done && !failed) {
    while (pc < pattern.length && consumed(pc)) {
      // il termine è già stato usato quanto basta: si va avanti
      pc += 1;
    }
    if (ic === input.length) {
      // siamo alla fine dell'ingresso
      while (pc < pattern.length && enough(pc)) {
        pc += 1;
      }
      if (pc === pattern.length) {
        // tutti i termini del pattern sono stati consumati
        if (!pattern.every((_, p) => enough(p))) {
          backtrack();
        } else {
          done = true;
        }
      } else {
        backtrack();
      }
    } else if (pc >= pattern.length) {
      // fine del pattern ma restano termini in ingresso
      if (pc === pattern.length && options.commutative && options.allowOtherTerms) {
        capture.push(pattern.length);
        advance_input();
      } else if (pc === pattern.length && !options.commutative && options.allowOtherTerms) {
        while (ic < input.length) {
          capture.push(pattern.length);
          advance_input();
        }
      } else {
        backtrack();
      }
    } else if (
      options.checkFn(input[ic] as TermData, pattern[pc] as TermData, ic, pc) &&
      options.constraintFn(capture, ic, pc)
    ) {
      capture.push(pc);
      advance_input();
    } else if (options.commutative || enough(pc)) {
      pc += 1;
    } else {
      backtrack();
    }
  }
  if (failed) {
    return false;
  }
  const result = pattern.map((_p, i) =>
    capture.map((_, j) => j).filter((j) => capture[j] === i),
  );
  let ignored_start_terms: number[];
  let ignored_end_terms: number[];
  if (options.commutative) {
    ignored_start_terms = [];
    ignored_end_terms = [];
    let ignored = ignored_start_terms;
    capture.forEach((p, i) => {
      if (p === pattern.length) {
        ignored.push(i);
      } else {
        ignored = ignored_end_terms;
      }
    });
  } else {
    ignored_start_terms = input.slice(0, start).map((_, j) => j);
    ignored_end_terms = capture.map((_, j) => j).filter((j) => capture[j] === pattern.length);
  }
  return { ignored_start_terms: ignored_start_terms, result: result, ignored_end_terms: ignored_end_terms };
}
