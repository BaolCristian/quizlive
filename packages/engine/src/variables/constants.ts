/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:585-605 — aggiunge un elenco di costanti con nome allo
// scope, rispettando sia l'abilitazione predefinita di ciascuna definizione
// (`def.enabled`) sia quella per-domanda (`enabled`, un dizionario passato a
// parte). L'unico chiamante upstream (question.js:796,
// `makeConstants(Numbas.jme.builtin_constants, q.scope, enabled_constants)`)
// passa entrambe: `builtin_constants` include `j` con `enabled: false` (alias
// ingegneristico di `i`, disattivato di default — v.
// `jme/builtins/constants.ts`), e senza l'algebra completa su ENTRAMBI i
// flag il Task 9 non può riprodurre "j è cancellata a meno che la domanda non
// la riabiliti esplicitamente".

import type { ConstantDefinition, Scope } from "../jme/scope";
import type { Token } from "../jme/tokens";
import { normaliseName } from "../jme/tokenizer";

/** Una definizione di costante (jme-variables.js:592,
 * `constant_definition`): come `ConstantDefinition` (jme/scope.ts), ma
 * `value` può anche essere sorgente JME da compilare (upstream:
 * `typeof value != 'object'`). */
export interface ConstantSourceDefinition extends Omit<ConstantDefinition, "value"> {
  value: Token | string;
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
    // upstream non protegge `def.name` da `undefined`: qui sì (come già fa
    // la copia privata in `jme/builtins/constants.ts`), per restare
    // tipizzato senza cambiare comportamento sulle definizioni reali (hanno
    // sempre un nome).
    const names = (def.name ?? "").split(/\s*,\s*/);
    // upstream valuta come sorgente JME solo se `typeof value != 'object'`:
    // un token è già un oggetto e passa così com'è.
    const value: Token = typeof def.value !== "object" ? (scope.evaluate(def.value + "") as Token) : def.value;
    names.forEach((name) => {
      const def_enabled = def.enabled === undefined || def.enabled;
      const q_enabled = enabled !== undefined && (enabled[name] || (enabled[name] === undefined && def_enabled));
      if (!(enabled === undefined ? def_enabled : q_enabled)) {
        scope.deleteConstant(name);
        return;
      }
      defined_names.push(normaliseName(name, scope));
      const data: ConstantDefinition = { value: value };
      if (def.tex !== undefined) {
        data.tex = def.tex;
      }
      scope.setConstant(name, data);
    });
  });
  return defined_names;
}
