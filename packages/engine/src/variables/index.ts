/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `variables/`, l'equivalente della parte di
// `Numbas.jme.variables` non legata al DOM (jme-variables.js:44-786, esclusi
// i rami DOM: v. §5.4 dell'inventario e DIVERGENCES.md), più `ScriptNote`/
// `note_script_constructor` (788-939).
//
// Importare questo modulo registra anche il builtin `make_variables`
// (rinviato dal Task 4b) su `builtinScope`.

export * from "./generate";
export * from "./functions";
export * from "./rulesets";
export * from "./constants";
export * from "./note-script";
export * from "./subvars";
export * from "./builtins";

import { builtinScope } from "../jme/builtins";
import { registerVariablesBuiltins } from "./builtins";

registerVariablesBuiltins(builtinScope);
