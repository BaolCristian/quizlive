/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `question/`: l'equivalente di
// `Numbas.Question` + `Numbas.createQuestionFromJSON` upstream, senza il
// percorso XML, senza `Numbas.display` e senza `Numbas.storage`.
//
// Gli export sono NOMINATI, non `export *`. I passi del costruttore
// (`parseQuestionJSON`, `buildQuestionScope`, `buildVariablesTodo`,
// `generateVariables`, `finaliseVariableScope`, `createParts`,
// `assignPartNames`, `applyQuestionState`, ...) sono la scomposizione interna
// del port, non API: chi ne ha bisogno li importa dal loro modulo.

export { Question, loadQuestion, restoreQuestion } from "./question";

export type {
  JMEValue,
  LoadOptions,
  QuestionVariableJSON,
  QuestionFunctionJSON,
  QuestionConstantJSON,
  NumbasQuestionJSON,
  PartState,
  QuestionState,
  LocalDefinitions,
} from "./types";

/** Il tipo ritornato da `Question#score()`. */
export type { QuestionScore } from "./scoring";
