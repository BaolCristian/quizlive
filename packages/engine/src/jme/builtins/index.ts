/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:36-41 — la costruzione di `Numbas.jme.builtinScope` e
// l'ordine in cui i temi registrano le loro funzioni. L'ordine CONTA: la
// risoluzione degli overload preferisce il primo match esatto e, a parità, la
// definizione registrata per prima (inventario §8.9).
//
// I temi del Task 4b (`lists`, `dictionaries`, `strings`, `type_casting`,
// `jme`, `pattern_matching`, `control_flow`, `comprehensions`,
// `differentiation`, `marking`) si aggiungono qui, ognuno nella posizione
// upstream.

import { simplificationRules } from "../rules-simplify";
import { makeRng, Scope, setBuiltinScope } from "../scope";

import { registerConstants } from "./constants";
import { registerArithmetic } from "./arithmetic";
import { registerComplexExponentials } from "./complex-exponentials";
import { registerTrigonometry } from "./trigonometry";
import { registerRounding } from "./rounding";
import { registerNumberTheory } from "./number-theory";
import { registerComparison } from "./comparison";
import { registerLinearAlgebra } from "./linear-algebra";
import { registerBooleans } from "./booleans";
import { registerRanges } from "./ranges";
import { registerNumberParsing } from "./number-parsing";

export * from "./registry";
export { registerConstants, builtinConstants } from "./constants";
export { registerArithmetic } from "./arithmetic";
export { registerComplexExponentials } from "./complex-exponentials";
export { registerTrigonometry } from "./trigonometry";
export { registerRounding } from "./rounding";
export { registerNumberTheory } from "./number-theory";
export { registerComparison } from "./comparison";
export { registerLinearAlgebra } from "./linear-algebra";
export { registerBooleans } from "./booleans";
export { registerRanges, best_number_type_for_range } from "./ranges";
export { registerNumberParsing } from "./number-parsing";

/** Registra nello scope le costanti e tutte le funzioni predefinite, nello
 * stesso ordine di `jme-builtins.js`. Si può rieseguire su uno scope nuovo. */
export function registerBuiltins(scope: Scope): void {
  registerConstants(scope);
  registerArithmetic(scope);
  registerComplexExponentials(scope);
  registerTrigonometry(scope);
  registerRounding(scope);
  registerNumberTheory(scope);
  registerComparison(scope);
  registerLinearAlgebra(scope);
  registerBooleans(scope);
  registerRanges(scope);
  registerNumberParsing(scope);
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
