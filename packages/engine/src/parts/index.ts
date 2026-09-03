/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `parts/`, l'equivalente di `Numbas.parts` più
// `Numbas.createPartFromJSON` upstream.
//
// Gli export sono NOMINATI, non `export *`: la scomposizione interna del port
// (i passi del costruttore di una parte, gli helper del credito, il motore di
// correzione adattiva) non è API. Chi ha bisogno di uno di quei simboli lo
// importa dal suo modulo, con l'idea chiara che è un dettaglio interno.
//
// Importare questo modulo registra gli otto tipi di parte in ambito nel
// registro `partConstructors`, come upstream fa in fondo a ogni
// `runtime/scripts/parts/*.js`: le righe dei tipi di parte in fondo al file
// servono anche a questo, e non vanno tolte.

export type {
  PartType,
  Answer,
  FeedbackItemPublic,
  MarkingResult,
  VariableReplacementJSON,
  PartJSON,
  PartSettings,
  BasePartSettings,
  PartQuestion,
  PartContext,
} from "./types";

// i tipi dei campi pubblici di `PartBase`: `markingFeedback`,
// `finalised_result`, `script_result`, `markingScript`.
export type { MarkingFeedbackItem } from "./credit";
export type { PartScriptResult, MarkingResults } from "./adaptive-marking";

// util.js:1310-1330 — `Numbas.util.nicePartName`.
export { nicePartName } from "./nice-part-name";

export { PartBase } from "./part-base";
export { createPartFromJSON, partConstructors } from "./create-part";

// I tipi di parte: ciascun modulo si registra al caricamento.
export { InformationPart } from "./information-part";
export { NumberEntryPart, type NumberEntrySettings } from "./number-entry-part";
export { PatternMatchPart, type PatternMatchSettings } from "./pattern-match-part";
export { MultipleResponsePart, type MultipleResponseSettings } from "./multiple-response-part";
export { JMEPart, type JMEPartSettings } from "./jme-part";
export { GapFillPart, type GapFillSettings } from "./gapfill-part";
