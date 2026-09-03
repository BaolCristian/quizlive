/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `jme/`, l'equivalente del namespace
// `Numbas.jme` upstream.
//
// ATTENZIONE: l'ordine degli export QUI È VINCOLANTE, e niente lo impone
// automaticamente. Tre moduli fanno lavoro di inizializzazione al primo
// caricamento — `rules.ts` registra `collectRuleset` fra i `displayHooks`,
// `builtins.ts` costruisce `builtinScope`, `display.ts` e `display-jme.ts`
// riempiono gli altri `displayHooks` — e un `export *` è anche un import: è
// questa lista a decidere in che ordine girano. Spostare una riga può far
// valutare `builtins.ts` prima di `rules.ts` e lasciare `builtinScope` senza
// ruleset. Le righe sotto dicono, una per una, da cosa dipendono; il grafo
// resta circolare come lo era il namespace unico di jme.js, ma NESSUN modulo
// deve leggere simboli di un altro durante la propria inizializzazione.

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
// costruisce `builtinScope` al caricamento, e per farlo ha bisogno che
// `scope`, `rules` e `evaluate` siano già inizializzati.
export * from "./builtins";
// vanno per ultimi: `display.ts` usa `builtinScope` come scope predefinito dei
// renderer, e i due moduli riempiono `displayHooks` (`texify`, `exprToLaTeX`,
// `subvars`, `treeToJME`), di cui `Scope.evaluate`, `contentsubvars` e
// `Ruleset.simplify` hanno bisogno.
//
// `display.ts` esporta anche `simplify` e `subvars`, che collidono con gli
// omonimi di `rules.ts` (semplifica un albero già compilato) e di
// `subvars.ts` (sostituisce le variabili in una stringa, restituendo una
// stringa). Upstream vivono in namespace diversi (`jme.display.*` contro
// `jme.*`/`jme.rules.*`): qui le versioni del display prendono un prefisso.
export {
  NICE_NUMBER_MAX_LENGTH,
  Displayer,
  Texifier,
  texify,
  exprToLaTeX,
  treeToLaTeX,
  simplifyExpression,
  simplifyTree,
  simplify as displaySimplify,
  subvars as displaySubvars,
  type DisplaySettings,
  type DisplaySettingsArg,
  type CircleConstant,
  type CommonConstants,
} from "./display";
export * from "./display-jme";
