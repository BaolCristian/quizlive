/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `marking/`, l'equivalente del namespace
// `Numbas.marking` upstream (runtime/scripts/marking.js), più gli script di
// correzione `.jme` incorporati.
//
// Importare questo modulo ha un effetto collaterale globale, come upstream:
// registra `apply` fra le operazioni pigre (`jme.lazyOps`) e installa
// `substituteTreeOps.apply` (marking.js:307-310).

export * from "./feedback";
export * from "./finalise-state";
export * from "./stateful-scope";
export * from "./note-functions";
export * from "./compute-note";
export * from "./marking-script";
export * from "./scripts";
