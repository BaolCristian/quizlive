/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `parts/`, l'equivalente di `Numbas.parts` più
// `Numbas.createPartFromJSON` upstream.
//
// Importare questo modulo registra gli otto tipi di parte in ambito nel
// registro `partConstructors`, come upstream fa in fondo a ogni
// `runtime/scripts/parts/*.js`.

export * from "./types";
export * from "./credit";
export * from "./mark";
export * from "./adaptive-marking";
export * from "./nice-part-name";
export * from "./part-base";
export * from "./create-part";

// I tipi di parte: ciascun modulo si registra al caricamento.
export * from "./information-part";
export * from "./number-entry-part";
export * from "./pattern-match-part";
export * from "./multiple-response-part";
export * from "./jme-part";
export * from "./gapfill-part";
