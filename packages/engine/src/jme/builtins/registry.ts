/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:60-68 (`builtin_function_set`) + jme.js:2524-2540
// (`FunctionSet.add_function`): l'unico meccanismo con cui `jme-builtins.js`
// registra una funzione.
//
// Upstream ogni tema costruisce un `jme.FunctionSet` e lo assorbe nello scope
// con `builtinScope.addFunctionSet(set)`; il set finisce anche nel registro
// globale `Numbas.jme.function_sets`, usato solo dall'editor per raggruppare
// le funzioni nella documentazione. Qui `add(scope, ...)` chiama direttamente
// `scope.addFunction`, preservando l'ORDINE DI REGISTRAZIONE (da cui dipende
// la risoluzione degli overload: primo match esatto, a parità primo
// registrato — inventario §8.9). Vedi DIVERGENCES.md per il raggruppamento
// per tema, che qui è dato dai moduli `builtins/<tema>.ts`.

import { JmeError } from "../errors";
import { FuncObj, signature, type FuncObjOptions, type SignatureInput } from "../funcobj";
import { compile } from "../parser";
import { FunctionSet, type Scope, lazyOps } from "../scope";
import { displayHooks } from "../subvars";
import type { TokenConstructor, Tree } from "../tokens";

// jme-builtins.js:60-68 — l'insieme di funzioni del tema in costruzione.
// upstream ogni tema costruisce un `jme.FunctionSet` con `add_function` e poi
// lo assorbe nello scope; qui `add` registra subito nello scope (per non
// alterare l'ordine) e, se un tema è aperto, aggiunge la definizione anche al
// suo insieme, che `functionSet` deposita nello scope alla fine. Serve a
// `scope.getFunctionSet(nome)`, cioè al builtin `add_function_sets`
// (jme-builtins.js:2599).
let currentSet: FunctionSet | undefined;

/**
 * Registra una definizione di funzione nello scope, con la stessa semantica di
 * `FunctionSet.add_function` (jme.js:2534-2540): se `random` non è indicato, la
 * funzione è dichiarata NON casuale (`random: false`, non `undefined`).
 */
export function add(
  scope: Scope,
  name: string,
  intype: SignatureInput[],
  outcons: TokenConstructor | "?",
  fn: ((...args: never[]) => unknown) | null,
  options?: FuncObjOptions,
): FuncObj {
  const opts: FuncObjOptions = { ...(options ?? {}) };
  opts.random = "random" in opts ? opts.random : false;
  const jme_fn = new FuncObj(name, intype, outcons, fn, opts);
  scope.addFunction(jme_fn);
  if (currentSet) {
    currentSet.functions.push(jme_fn);
  }
  return jme_fn;
}

// jme-builtins.js:60-68 (`builtin_function_set`).
/** Esegue `register` dichiarando che le funzioni registrate appartengono al
 * tema dato, e deposita l'insieme risultante nello scope. */
export function functionSet(
  scope: Scope,
  options: { name: string; description: string },
  register: (scope: Scope) => void,
): void {
  const previous = currentSet;
  const set = new FunctionSet(options);
  currentSet = set;
  try {
    register(scope);
  } finally {
    currentSet = previous;
  }
  // le funzioni sono già nello scope (`add` le ha registrate una per una):
  // `addFunctionSet` non le duplica e serve a registrare l'insieme per nome.
  scope.addFunctionSet(set);
}

/** Una notazione JME: sa compilare una stringa e riscrivere un albero
 * (jme-notations.js:414). */
export interface Notation {
  compile: (str: string) => Tree | null;
  treeToJME: (tree: Tree, settings: unknown, scope: Scope) => string;
}

// jme-builtins.js:72-84 (`get_notation`).
/** La notazione con il nome dato.
 *
 * upstream le legge da `Numbas.jme.notations` (jme-notations.js, non portato
 * in questo batch): qui esiste solo `standard`, cioè il parser e il
 * serializzatore predefiniti. Vedi DIVERGENCES.md. */
export function get_notation(notation_name: string): Notation {
  if (notation_name !== "standard") {
    throw new JmeError("jme.func.parse.no notation", { notation_name: notation_name });
  }
  return {
    compile: (str) => compile(str),
    treeToJME: (tree, settings, scope) => {
      const hook = displayHooks.treeToJME;
      if (!hook) {
        throw new JmeError("jme.subvars.display not available", { op: "treeToJME" });
      }
      return hook(tree, settings, scope);
    },
  };
}

// jme-builtins.js:31 (`var sig = jme.signature`).
/** I costruttori di firma, con il nome breve usato da `jme-builtins.js`. */
export const sig = signature;

// jme-builtins.js:33 — le opzioni delle funzioni che lavorano su interi
// esatti: gli argomenti arrivano come `bigint`.
/** `{unwrapValues: {bigInts: true}}`, l'`int_options` upstream. */
export const int_options: FuncObjOptions = { unwrapValues: { bigInts: true } };

/** Dichiara pigro il nome dato (`jme.lazyOps.push(...)` upstream).
 *
 * Upstream il push è incondizionato perché `jme-builtins.js` gira una volta
 * sola al caricamento; qui `registerBuiltins` può essere rieseguito su uno
 * scope nuovo (i test ne costruiscono di puliti) e `lazyOps` è un array
 * globale condiviso, quindi si evita il duplicato. */
export function pushLazy(name: string): void {
  if (lazyOps.indexOf(name) === -1) {
    lazyOps.push(name);
  }
}
