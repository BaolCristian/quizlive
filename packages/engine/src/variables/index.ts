/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `variables/`, l'equivalente della parte di
// `Numbas.jme.variables` non legata al DOM (jme-variables.js:44-786, esclusi
// i rami DOM: v. §5.4 dell'inventario e DIVERGENCES.md), più `ScriptNote`/
// `note_script_constructor` (788-939).
//
// Gli export sono NOMINATI, non `export *`: i passi del caricamento di una
// domanda (`makeConstants`, `makeFunctions`, `makeRulesets`,
// `buildVariablesTodo`, `computeRuleset`, ...) sono la scomposizione interna
// del port e si importano dal loro modulo.
//
// Importare questo modulo registra anche il builtin `make_variables`
// (rinviato dal Task 4b) su `builtinScope`.

// jme-variables.js:186-247, 470-486 — generazione e rigenerazione delle
// variabili di una domanda. `remakeVariables` è quel che la correzione
// adattiva chiama per ricalcolare le variabili con le risposte sostituite.
export {
  makeVariables,
  remakeVariables,
  splitVariableNames,
  variableDependants,
  type VariableDef,
  type VariablesTodo,
  type MakeVariablesResult,
} from "./generate";

// jme-variables.js:697-786 — sostituzione delle variabili in un testo HTML.
export { substituteHtml } from "./subvars";

import { builtinScope } from "../jme/builtins";
import { registerVariablesBuiltins } from "./builtins";

registerVariablesBuiltins(builtinScope);
