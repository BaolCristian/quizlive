/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:41-57 — la costante di scope `nothing` e le sei definizioni
// di `Numbas.jme.builtin_constants`, registrate con
// `Numbas.jme.variables.makeConstants` (jme-variables.js:585-605).
//
// `makeConstants` vive in `jme-variables.js` (Task 6): qui se ne riproduce la
// sola parte che serve ai builtin (separazione dei nomi sulla virgola e
// gestione di `enabled`), come funzione locale.

import * as math from "../../math";
import type { Scope, ConstantDefinition } from "../scope";
import { TNothing, TNum } from "../tokens";

/** Le definizioni delle costanti predefinite (jme-builtins.js:47-54).
 * `name` può elencare più alias separati da virgola. */
export const builtinConstants: ConstantDefinition[] = [
  { name: "e", value: new TNum(Math.E), tex: "e" },
  { name: "pi", value: new TNum(Math.PI), tex: "\\pi" },
  { name: "i", value: new TNum(math.complex(0, 1) as math.Complex), tex: "i" },
  { name: "infinity,infty", value: new TNum(Infinity), tex: "\\infty" },
  { name: "NaN", value: new TNum(NaN), tex: "\\texttt{NaN}" },
  // alias ingegneristico di `i`: disattivato di default, quindi `makeConstants`
  // lo CANCELLA dallo scope invece di definirlo.
  { name: "j", value: new TNum(math.complex(0, 1) as math.Complex), tex: "j", enabled: false },
];

// jme-variables.js:585-605, nella sola forma usata qui (`enabled` assente).
/** Definisce le costanti date nello scope, separando gli alias sulla virgola.
 * Una definizione con `enabled: false` viene invece cancellata. */
function makeConstants(definitions: ConstantDefinition[], scope: Scope): void {
  definitions.forEach((def) => {
    const names = (def.name ?? "").split(/\s*,\s*/);
    names.forEach((name) => {
      const def_enabled = def.enabled === undefined || def.enabled;
      if (!def_enabled) {
        scope.deleteConstant(name);
        return;
      }
      const d: ConstantDefinition = { value: def.value };
      if (def.tex !== undefined) {
        d.tex = def.tex;
      }
      scope.setConstant(name, d);
    });
  });
}

// jme-builtins.js:42, 57
/** Registra `nothing` e le costanti predefinite nello scope. */
export function registerConstants(scope: Scope): void {
  scope.setConstant("nothing", { value: new TNothing(), tex: "\\text{nothing}" });
  makeConstants(builtinConstants, scope);
}
