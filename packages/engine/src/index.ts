/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
export const ENGINE_VERSION = "0.0.0";
export const UPSTREAM_COMMIT = "0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5";

export * as math from "./math";
export * as jme from "./jme";
export * as i18n from "./i18n";
// side-effect: registra il builtin `make_variables` su `builtinScope`.
export * as variables from "./variables";
// side-effect: registra `apply` fra le operazioni pigre e installa
// `substituteTreeOps.apply` (marking.js:307-310).
export * as marking from "./marking";
// side-effect: registra gli otto tipi di parte in ambito nel registro
// `partConstructors` (part.js:16).
export * as parts from "./parts";

// I tipi dell'API pubblica della spec, esposti anche senza il namespace.
export type {
  Answer,
  MarkingResult,
  PartType,
  PartSettings,
  FeedbackItemPublic as FeedbackItem,
} from "./parts/types";

