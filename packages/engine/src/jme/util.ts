/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Utilità di jme.js che non appartengono a nessuno dei moduli principali, più
// il rimpiazzo delle estensioni di prototipo di util.js (`Array.prototype.merge`,
// `Array.prototype.contains`, `String.prototype.contains`): il port non estende
// mai i prototipi nativi (decisione 10 del brief).

import type { Tree } from "./tokens";

// util.js:1695-1726 — `Array.prototype.merge`: unione di due array con
// ordinamento e rimozione dei duplicati (NON una semplice concatenazione).
/** Unisce `arr` in `a`, ordinando e togliendo i duplicati. Con `sortfn` i
 * duplicati sono gli elementi per cui `sortfn(x,y) == 0`, altrimenti quelli
 * uguali con `==` dopo l'ordinamento lessicografico di default. */
export function mergeUnique<T>(a: readonly T[], arr: readonly T[], sortfn?: (x: T, y: T) => number): T[] {
  if (a.length === 0) {
    return arr.slice();
  }
  const out = (a as T[]).concat(arr);
  if (sortfn) {
    out.sort(sortfn);
    for (let i = 1; i < out.length; ) {
      if (sortfn(out[i - 1] as T, out[i] as T) === 0) {
        out.splice(i, 1);
      } else {
        i++;
      }
    }
  } else {
    // `Array.prototype.sort` senza comparatore ordina per rappresentazione
    // testuale: è quello che fa upstream per gli array di stringhe (findvars).
    out.sort();
    for (let i = 1; i < out.length; ) {
      if (out[i - 1] === out[i]) {
        out.splice(i, 1);
      } else {
        i++;
      }
    }
  }
  return out;
}

// util.js:71-80 (`Numbas.util.extend_object`)
/** Copia in `destination` le proprietà proprie delle sorgenti, **saltando i
 * valori `undefined`**: è questo che permette a `Ruleset` di ereditare da
 * `displayFlags` senza sovrascrivere le flag già impostate. */
export function extendObject<T extends Record<string, unknown>>(
  destination: T,
  ...sources: Array<Record<string, unknown> | undefined>
): T {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of Object.keys(source)) {
      if (source[key] !== undefined) {
        (destination as Record<string, unknown>)[key] = source[key];
      }
    }
  }
  return destination;
}

// util.js:1728-1740 (`Numbas.util.sortBy`), qui nella sola forma usata da
// jme.js: `var fnSort = util.sortBy('id')` (jme.js:2469), il comparatore con
// cui `getFunction`/`allFunctions` fondono liste di `FuncObj`.
/** Confronta due oggetti per la proprietà `id` (numerica). */
export function sortById(a: { id: number }, b: { id: number }): number {
  return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
}

// jme.js:65-68
/** I nomi dei ruleset sono sempre minuscoli. */
export function normaliseRulesetName(name: string): string {
  return name.toLowerCase();
}

// jme.js:85-93
/** Protegge una stringa perché il parser JME la rilegga com'è. */
export function escape(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\\([{}])/g, "$1")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

// jme.js:184-205
/** Inverso di `escape`: i backslash proteggono i caratteri speciali. */
export function unescape(str: string): string {
  let estr = "";
  for (;;) {
    const i = str.indexOf("\\");
    if (i === -1) {
      break;
    }
    estr += str.slice(0, i);
    const c = str.charAt(i + 1);
    if (c === "n") {
      estr += "\n";
    } else if (c === "{" || c === "}") {
      // upstream: le graffe restano protette, perché la sostituzione di
      // variabili nelle stringhe (`subvars`) le rilegge dopo.
      estr += "\\" + c;
    } else {
      estr += c;
    }
    str = str.slice(i + 2);
  }
  estr += str;
  return estr;
}

// jme.js:101-107
/** Copia un albero riusando gli stessi token: ricrea solo i nodi `{tok,args}`. */
export function copy_tree(tree: Tree): Tree {
  const o: Tree = { tok: tree.tok };
  if (tree.args) {
    o.args = tree.args.map(copy_tree);
  }
  return o;
}
