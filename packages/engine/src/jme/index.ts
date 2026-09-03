/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `jme/`, l'equivalente del namespace
// `Numbas.jme` upstream. L'ordine degli export non conta: nessun modulo legge
// simboli di un altro durante la valutazione (il grafo è circolare come lo era
// il namespace unico di jme.js).

export * from "./errors";
export * from "./tokens";
export * from "./funcobj";
export * from "./util";
export * as unicode from "./unicode";
export * from "./tokenizer";
export * from "./parser";
export * from "./scope";
export * from "./juxtapositions";
export * from "./evaluate";
export * from "./compare";
export * from "./equality";
export * from "./infer";
export * from "./subvars";
// `./rules` va importato sempre: il modulo registra `collectRuleset` fra i
// `displayHooks`, di cui `Scope.evaluate` e `contentsubvars` hanno bisogno.
export * from "./rules";
export * as calculus from "./calculus";
// va per ultimo: il modulo costruisce `builtinScope` al caricamento, e per
// farlo ha bisogno che `scope`, `rules` e `evaluate` siano già inizializzati.
export * from "./builtins";
