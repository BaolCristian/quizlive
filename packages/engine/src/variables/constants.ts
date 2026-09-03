/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:585-605 — aggiunge un elenco di costanti con nome allo
// scope, rispettando l'abilitazione per-domanda (`enabled`).
//
// Semplificazione rispetto a upstream: la firma del brief non porta
// `def.enabled` (il flag di abilitazione predefinita dentro ciascuna
// definizione) — solo `enabled`, il dizionario per-domanda passato a parte.
// Con `def.enabled` sempre `undefined`, l'algebra booleana upstream
// (righe 596-600) si riduce a: senza `enabled` tutte le costanti sono
// impostate; con `enabled`, una costante è cancellata SOLO se
// `enabled[nome] === false` esplicito (assente o `true` la lascia impostata).

import type { Scope } from "../jme/scope";
import type { Token } from "../jme/tokens";
import { normaliseName } from "../jme/tokenizer";

/** Una definizione di costante (jme-variables.js:592, `constant_definition`
 * semplificato: `value` è sempre sorgente JME, mai un token già pronto). */
export interface ConstantSourceDefinition {
  name: string;
  value: string;
  tex: string;
}

// jme-variables.js:585-605
/** Aggiunge le costanti date allo scope; ritorna i nomi normalizzati
 * effettivamente definiti. */
export function makeConstants(
  definitions: ConstantSourceDefinition[],
  scope: Scope,
  enabled?: Record<string, boolean>,
): string[] {
  const defined_names: string[] = [];
  definitions.forEach((def) => {
    const names = def.name.split(/\s*,\s*/);
    // upstream valuta solo se `typeof value != 'object'`: qui `def.value` è
    // sempre sorgente JME (v. commento in testa al file), quindi si valuta
    // sempre. `evaluate` ritorna `Token | null` solo per un'espressione
    // vuota, come upstream ritornerebbe `undefined`.
    const value = scope.evaluate(def.value + "") as Token;
    names.forEach((name) => {
      if (enabled !== undefined && enabled[name] === false) {
        scope.deleteConstant(name);
        return;
      }
      defined_names.push(normaliseName(name, scope));
      scope.setConstant(name, { value: value, tex: def.tex });
    });
  });
  return defined_names;
}
