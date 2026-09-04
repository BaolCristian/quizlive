/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:1946-2108 — le flag di visualizzazione, la classe `Ruleset`
// (con il ciclo di semplificazione a punto fisso) e `collectRuleset`.

import * as math from "../math";
import { JmeError } from "./errors";
import type { Rule } from "./rules-transform";
import type { Scope } from "./scope";
import { displayHooks } from "./subvars";
import type { Tree } from "./tokens";
import { extendObject, normaliseRulesetName } from "./util";

// jme-rules.js:1946-1957 — i valori sono `undefined` apposta, così
// `extendObject` (che salta gli `undefined`) non li copia nei `Ruleset`: una
// flag risulta impostata solo se qualcuno l'ha nominata davvero.
/** Le flag che controllano il comportamento delle funzioni di
 * visualizzazione JME. */
export const displayFlags: Record<string, boolean | undefined> = {
  fractionnumbers: undefined,
  rowvector: undefined,
  alwaystimes: undefined,
  mixedfractions: undefined,
  flatfractions: undefined,
  barematrices: undefined,
  timesdot: undefined,
  timesspace: undefined,
  noscientificnumbers: undefined,
};

/** Una rappresentazione testuale dell'albero, per il rilevamento dei cicli.
 *
 * upstream usa `notation.treeToJME(exprTree)`; qui si passa dal gancio
 * `displayHooks.treeToJME` quando il modulo di visualizzazione (Task 5) è
 * caricato, altrimenti si ripiega su una firma strutturale (vedi
 * DIVERGENCES.md). */
function treeSignature(tree: Tree, scope: Scope): string {
  const hook = displayHooks.treeToJME;
  if (hook) {
    return hook(tree, {}, scope);
  }
  const tok = tree.tok as { type: string; name?: string; value?: unknown };
  const head = tok.name !== undefined ? `${tok.type}:${tok.name}` : `${tok.type}:${String(tok.value)}`;
  if (tree.args === undefined) {
    return head;
  }
  return `${head}(${tree.args.map((a) => treeSignature(a, scope)).join(",")})`;
}

// jme-rules.js:1979-2050
/** Un insieme di regole di semplificazione, più le flag di visualizzazione. */
export class Ruleset {
  /** Le regole, nell'ordine in cui vanno applicate. */
  rules: Rule[];
  /** Le flag di visualizzazione impostate da questo insieme. */
  flags: Record<string, boolean>;

  constructor(rules: Rule[], flags?: Record<string, boolean>) {
    this.rules = rules;
    this.flags = extendObject({} as Record<string, boolean>, displayFlags, flags);
  }

  // jme-rules.js:1985-1992
  /** La flag è impostata? */
  flagSet(flag: string): boolean {
    flag = normaliseRulesetName(flag);
    if (Object.hasOwn(this.flags, flag)) {
      return this.flags[flag] as boolean;
    } else {
      return false;
    }
  }

  // jme-rules.js:2003-2035 — il ciclo si ferma quando nessuna regola cambia
  // più nulla. Ad ogni giro si semplificano prima tutti i figli, poi si
  // prova la prima regola che cambia qualcosa e si ricomincia. Il rilevamento
  // dei cicli parte solo dopo 100 iterazioni (inventario §8.1).
  /** Applica le regole all'espressione finché non cambia più nulla. */
  simplify(exprTree: Tree, scope: Scope): Tree {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const rs = this;
    let changed = true;
    let depth = 0;
    const seen: string[] = [];
    while (changed) {
      if (exprTree.args) {
        const nargs = exprTree.args.map((arg) => rs.simplify(arg, scope));
        exprTree = { tok: exprTree.tok, args: nargs };
      }
      changed = false;
      for (let i = 0; i < this.rules.length; i++) {
        const result = (this.rules[i] as Rule).replace(exprTree, scope);
        if (result.changed) {
          if (depth > 100) {
            const str = treeSignature(exprTree, scope);
            if (seen.indexOf(str) !== -1) {
              throw new JmeError("jme.display.simplifyTree.stuck in a loop", { expr: str });
            }
            seen.push(str);
          }
          changed = true;
          exprTree = result.expression;
          depth += 1;
          break;
        }
      }
    }
    return exprTree;
  }
}

/** Quello che `collectRuleset` accetta come descrizione di un insieme di
 * regole: una stringa con i nomi separati da virgole, un `Ruleset` già
 * costruito, un array di nomi/regole/insiemi, o un oggetto con le sole
 * `flags` (i test di visualizzazione upstream passano `{flags:{...}}`,
 * jme-tests.mjs:2484). */
export type RulesetSpec =
  | string
  | Ruleset
  | Array<string | Rule | Ruleset>
  | { flags?: Record<string, boolean>; rules?: Array<string | Rule | Ruleset> };

// jme-rules.js:2051-2108
/** Compone un `Ruleset` a partire da una lista di nomi o di insiemi.
 *
 * Il nome `basic` viene aggiunto in testa **solo** quando `set` è una stringa
 * (inventario §8.2): `collectRuleset('trig')` include `basic`,
 * `collectRuleset(['trig'])` no. Il prefisso `!` toglie le regole di un
 * insieme, o disattiva una flag di visualizzazione (§8.3). */
export function collectRuleset(set: RulesetSpec, scopeSets: Record<string, Ruleset>): Ruleset {
  scopeSets = math.copyobj(scopeSets);
  if (!set) {
    return new Ruleset([], {});
  }
  if (!scopeSets) {
    throw new JmeError("jme.display.collectRuleset.no sets");
  }

  const rules: Rule[] = [];
  let flags: Record<string, boolean> = {};
  let items: Array<string | Rule | Ruleset>;
  if (typeof set === "string") {
    items = set.split(",");
    items.splice(0, 0, "basic");
  } else if (Array.isArray(set)) {
    items = set;
  } else {
    flags = extendObject(flags, set.flags);
    // jme-rules.js:2067-2069 — upstream sostituisce `set` con `set.rules` solo
    // se c'è: altrimenti resta l'oggetto, la cui `length` è `undefined` e il
    // ciclo non parte. Qui l'equivalente è la lista vuota.
    items = set.rules ?? [];
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === "string") {
      const m = /^\s*(!)?(.*)\s*$/.exec(item) as RegExpExecArray;
      const neg = m[1] === "!";
      const name = normaliseRulesetName((m[2] as string).trim());
      if (name in displayFlags) {
        flags[name] = !neg;
      } else if (name.length > 0) {
        if (!(name in scopeSets)) {
          throw new JmeError("jme.display.collectRuleset.set not defined", { name: name });
        }
        const sub = collectRuleset(scopeSets[name] as Ruleset, scopeSets);
        flags = extendObject(flags, sub.flags);
        scopeSets[name] = sub;
        sub.rules.forEach((r) => {
          const mi = rules.indexOf(r);
          if (neg) {
            if (mi >= 0) {
              rules.splice(mi, 1);
            }
          } else {
            if (mi === -1) {
              rules.push(r);
            }
          }
        });
      }
    } else {
      rules.push(item as Rule);
    }
  }
  return new Ruleset(rules, flags);
}
