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
// upstream: `Numbas.jme` espone anche `globalTables`, `initialTables` e
// `globalTokeniserTypes`. Qui restano interni: sono le tabelle CONDIVISE dallo
// `standardParser` dopo `adoptGlobalTables`, quindi mutarle cambia il parsing
// JME di ogni domanda del processo. Le singole tabelle (`ops`, `precedence`,
// ...) restano esposte come upstream, perché servono a leggere la grammatica.
export {
  normaliseName,
  ops,
  prefixForm,
  postfixForm,
  arity,
  precedence,
  relations,
  commutative,
  associative,
  funcSynonyms,
  opSynonyms,
  synonyms,
  rightAssociative,
  converseOps,
  unicode_annotations,
  superscript_replacements,
  default_re,
  re,
  adoptGlobalTables,
  type TokeniserOptions,
  type OperatorOptions,
  type TokeniserMatch,
  type TokeniserType,
  type TokeniserTables,
  type AdoptTarget,
} from "./tokenizer";
// senza `addBinaryOperator`/`addPrefixOperator`/`addPostfixOperator`: le tre
// funzioni libere mutano lo `standardParser`, cioè il parser di OGNI domanda
// del processo, e nessuno le chiama. Restano i metodi omonimi di `Parser`, che
// agiscono su un'istanza che chi chiama possiede.
export {
  default_tokeniser_types,
  Parser,
  standardParser,
  tokenise,
  compile,
  shunt,
  compileList,
} from "./parser";
// senza `lazyOps` (array globale mutabile) e `setBuiltinScope` (sostituisce lo
// scope dei builtin per l'intero processo): sono ganci di bootstrap interni.
export {
  makeRng,
  FunctionSet,
  Scope,
  getBuiltinScope,
  type ConstantDefinition,
  type ScopeExtras,
  type CallSignature,
} from "./scope";
export * from "./juxtapositions";
export * from "./evaluate";
export * from "./compare";
export * from "./equality";
export * from "./infer";
// senza `displayHooks`: è la tabella dei ganci che `display.ts` e `rules.ts`
// riempiono al caricamento, e sovrascriverne uno cambia la resa di tutto il
// processo.
export { texsplit, typeToDisplayString, tokenToDisplayString, subvars, contentsubvars } from "./subvars";
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
