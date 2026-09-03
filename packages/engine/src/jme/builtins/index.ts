/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:36-41 — la costruzione di `Numbas.jme.builtinScope` e
// l'ordine in cui i temi registrano le loro funzioni. L'ordine CONTA: la
// risoluzione degli overload preferisce il primo match esatto e, a parità, la
// definizione registrata per prima (inventario §8.9).
//
// Ogni tema è avvolto in `functionSet(...)`, l'equivalente del
// `builtin_function_set({name, description}, ...)` upstream: le funzioni sono
// registrate una per una nello scope (nell'ordine originale) e l'insieme
// finisce in `scope.function_sets`, dove lo cerca il builtin
// `add_function_sets` (jme-builtins.js:2599).
//
// I temi `http` (3785-3812) e `promises` (3815-3824) non sono portati, e del
// tema `html` (2769-2924) restano solo `isnonemptyhtml` ed `escape_html`:
// vedi DIVERGENCES.md. I temi `jme` (2213-2636), `pattern_matching`
// (2639-2766), `control_flow` (3015-3224), `comprehensions` (3227-3750),
// `calculus` (3753-3766) e `marking` (3769-3782) arrivano nel passo
// successivo.

import { simplificationRules } from "../rules-simplify";
import { makeRng, Scope, setBuiltinScope } from "../scope";

import { functionSet } from "./registry";
import { registerConstants } from "./constants";
import { registerArithmetic } from "./arithmetic";
import { registerComplexNumbers, registerExponentials } from "./complex-exponentials";
import { registerTrigonometry } from "./trigonometry";
import { registerRounding } from "./rounding";
import { registerNumberTheory } from "./number-theory";
import { registerComparison } from "./comparison";
import { registerLinearAlgebra } from "./linear-algebra";
import { registerBooleans } from "./booleans";
import { registerIntervals, registerSetTheory } from "./sets-intervals";
import { registerRanges } from "./ranges";
import { registerLists } from "./lists";
import { registerDictionaries } from "./dictionaries";
import { registerStrings } from "./strings";
import { registerTypeCasting } from "./type-casting";
import {
  registerJson,
  registerNumberConversion,
  registerNumberFormatting,
  registerPrecision,
} from "./number-parsing";
import { registerHtmlPure } from "./html-pure";
import { registerRandomisation } from "./randomisation";

export * from "./registry";
export { registerConstants, builtinConstants } from "./constants";
export { registerArithmetic } from "./arithmetic";
export {
  registerComplexExponentials,
  registerComplexNumbers,
  registerExponentials,
} from "./complex-exponentials";
export { registerTrigonometry } from "./trigonometry";
export { registerRounding } from "./rounding";
export { registerNumberTheory } from "./number-theory";
export { registerComparison } from "./comparison";
export { registerLinearAlgebra } from "./linear-algebra";
export { registerBooleans } from "./booleans";
export { registerSetsIntervals, registerSetTheory, registerIntervals } from "./sets-intervals";
export { registerRanges, best_number_type_for_range } from "./ranges";
export { registerLists } from "./lists";
export { registerDictionaries } from "./dictionaries";
export { registerStrings } from "./strings";
export { registerTypeCasting } from "./type-casting";
export {
  registerNumberParsing,
  registerNumberFormatting,
  registerNumberConversion,
  registerPrecision,
  registerJson,
} from "./number-parsing";
export { registerHtmlPure } from "./html-pure";
export { registerRandomisation } from "./randomisation";

/** Registra nello scope le costanti e tutte le funzioni predefinite, nello
 * stesso ordine di `jme-builtins.js`. Si può rieseguire su uno scope nuovo. */
export function registerBuiltins(scope: Scope): void {
  registerConstants(scope);
  functionSet(scope, { name: "arithmetic", description: "Arithmetic operations" }, registerArithmetic);
  functionSet(scope, { name: "complex_numbers", description: "Complex numbers" }, registerComplexNumbers);
  functionSet(scope, { name: "exponentials", description: "Exponentials and logarithms" }, registerExponentials);
  functionSet(scope, { name: "trigonometry", description: "Trigonometry" }, registerTrigonometry);
  functionSet(scope, { name: "rounding", description: "Rounding" }, registerRounding);
  functionSet(scope, { name: "number_theory", description: "Number theory" }, registerNumberTheory);
  functionSet(scope, { name: "comparison", description: "Comparison" }, registerComparison);
  functionSet(scope, { name: "linear_algebra", description: "Linear algebra" }, registerLinearAlgebra);
  functionSet(scope, { name: "booleans", description: "Booleans" }, registerBooleans);
  functionSet(scope, { name: "set_theory", description: "Set theory" }, registerSetTheory);
  functionSet(scope, { name: "intervals", description: "Real intervals" }, registerIntervals);
  functionSet(scope, { name: "number_ranges", description: "Ranges of numbers" }, registerRanges);
  functionSet(scope, { name: "lists", description: "Lists" }, registerLists);
  functionSet(scope, { name: "dictionaries", description: "Dictionaries" }, registerDictionaries);
  functionSet(scope, { name: "strings", description: "Strings" }, registerStrings);
  functionSet(scope, { name: "type_casting", description: "Converting between data types" }, registerTypeCasting);
  functionSet(scope, { name: "number_parsing", description: "Parsing numbers" }, (s) => {
    registerNumberFormatting(s);
    registerNumberConversion(s);
  });
  functionSet(scope, { name: "precision", description: "Testing precision" }, registerPrecision);
  functionSet(scope, { name: "json", description: "JSON" }, registerJson);
  functionSet(scope, { name: "html", description: "HTML" }, registerHtmlPure);
  functionSet(scope, { name: "randomisation", description: "Random" }, registerRandomisation);
}

// jme-builtins.js:41 — `new Scope({rulesets: jme.rules.simplificationRules})`.
/** Lo scope predefinito del linguaggio JME: costanti, funzioni e rule-set di
 * semplificazione. Il generatore casuale è seminato in modo deterministico:
 * chi vuole una sequenza diversa costruisce uno scope figlio con il proprio
 * `rng` (o usa `seedrandom`). */
export const builtinScope: Scope = new Scope({ rulesets: simplificationRules, rng: makeRng("savint") });
registerBuiltins(builtinScope);

// jme.js:4836 — `findvars` senza scope usa `jme.builtinScope`.
setBuiltinScope(builtinScope);
