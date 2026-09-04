/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// La superficie pubblica di `jme-rules.js`, l'equivalente del namespace
// `Numbas.jme.rules`. Il file upstream (2294 righe) è spezzato in sei moduli
// per restare sotto le 1000 righe per file; questo è il barile che li rimette
// insieme.
//
// Importare questo modulo (o `jme/index.ts`) registra anche `collectRuleset`
// fra i `displayHooks`: `Scope.evaluate` e `contentsubvars` ne hanno bisogno
// per le stringhe `subjme` e per `\simplify{...}`.

import { collectRuleset, Ruleset } from "./rules-ruleset";
import type { Scope } from "./scope";
import { displayHooks } from "./subvars";
import type { Tree } from "./tokens";

export * from "./rules-terms";
export * from "./rules-match";
export * from "./rules-sequence";
export * from "./rules-parser";
export * from "./rules-transform";
export * from "./rules-ruleset";
export * from "./rules-simplify";

// jme-display.js:104-117 (`jme.display.simplify`/`simplifyTree`), senza la
// parte di visualizzazione: qui si resta sempre sugli alberi.
/** Semplifica un albero secondo l'insieme di regole dato.
 *
 * `ruleset` può essere un `Ruleset` già costruito (usato com'è, come
 * `simplifyTree`) oppure una specifica da comporre con `collectRuleset`
 * leggendo gli insiemi definiti nello scope. */
export function simplify(tree: Tree, ruleset: string | string[] | Ruleset, scope: Scope): Tree {
  const rs = ruleset instanceof Ruleset ? ruleset : collectRuleset(ruleset, scope.allRulesets());
  return rs.simplify(tree, scope);
}

// `subvars.ts` (jme.js:417) chiama `collectRuleset` per interpretare le
// opzioni di `\simplify[...]{...}`: il gancio si riempie qui, come il Task 5
// riempirà quelli di visualizzazione.
displayHooks.collectRuleset = collectRuleset;
