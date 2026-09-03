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

import { FuncObj, signature, type FuncObjOptions, type SignatureInput } from "../funcobj";
import { lazyOps, type Scope } from "../scope";
import type { TokenConstructor } from "../tokens";

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
  return jme_fn;
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
