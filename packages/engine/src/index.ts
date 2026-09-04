/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// L'API pubblica di `@savint/engine`. I namespace (`math`, `jme`, ...) sono
// l'equivalente del globale `Numbas`; sopra di essi c'è la superficie ridotta
// che l'applicazione consuma davvero: `loadQuestion`, `restoreQuestion`,
// `renderLatex`, `evaluate`.

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
export * as question from "./question";

import { builtinScope } from "./jme/builtins";
import { exprToLaTeX } from "./jme/display";
import { unwrapValue, wrapValue } from "./jme/evaluate";
import { Scope } from "./jme/scope";
import { getLocale, setLocale } from "./i18n";
import type { Locale } from "./i18n";
import type { Token } from "./jme/tokens";
import type { JMEValue } from "./question/types";

// -------------------------------------------------------------------------
// La superficie di alto livello
// -------------------------------------------------------------------------

export { loadQuestion, restoreQuestion, Question } from "./question";
export { engineErrorKeys, errorMessageIn, EngineError, MathError } from "./errors";
export { setLocale, getLocale, t } from "./i18n";
export { JmeError } from "./jme/errors";

export type {
  NumbasQuestionJSON,
  QuestionState,
  PartState,
  JMEValue,
  LoadOptions,
} from "./question/types";
export type {
  Answer,
  MarkingResult,
  PartType,
  PartSettings,
  PartJSON,
  FeedbackItemPublic as FeedbackItem,
} from "./parts/types";
export type { Locale } from "./i18n";

/** Le opzioni di `renderLatex`. */
export interface RenderLatexOptions {
  /** L'insieme di regole di semplificazione da applicare prima di rendere
   * l'espressione. Predefinito `"all"`. */
  ruleset?: string | string[];
  /** La lingua degli eventuali messaggi d'errore.
   *
   * Non cambia la resa dei numeri: il motore non ha le globali di formato di
   * `Numbas.locale` (separatore delle liste sempre `,`, notazione sempre
   * `plain`) — vedi DIVERGENCES.md. */
  locale?: Locale;
}

/** Rende un'espressione JME in LaTeX.
 *
 * ```ts
 * renderLatex("x^2/2"); // "\\frac{x^2}{2}"
 * ```
 */
export function renderLatex(expr: string, opts?: RenderLatexOptions): string {
  const locale = opts?.locale;
  if (locale === undefined) {
    return exprToLaTeX(expr, opts?.ruleset ?? "all", builtinScope);
  }
  // la lingua viaggia sullo scope (`Scope.locale`); l'unica cosa che ancora
  // legge la predefinita del processo è `JmeError`, che traduce al momento del
  // lancio come upstream (`Numbas.Error`) — quindi la si sposta e la si
  // rimette, il che è sicuro perché `exprToLaTeX` è sincrona.
  const scope = new Scope([builtinScope, { locale: locale }]);
  const previous = getLocale();
  setLocale(locale);
  try {
    return exprToLaTeX(expr, opts?.ruleset ?? "all", scope);
  } finally {
    setLocale(previous);
  }
}

/** Valuta un'espressione JME, con le variabili date.
 *
 * I valori in ingresso sono convertiti in token JME (`jme.wrapValue`) e il
 * risultato è riconvertito in valore JavaScript (`jme.unwrapValue`).
 *
 * ```ts
 * evaluate("a+1", { a: 2 }); // 3
 * evaluate("[1,2]");         // [1, 2]
 * ```
 */
export function evaluate(expr: string, variables?: Record<string, JMEValue>): JMEValue {
  const vars: Record<string, Token> = {};
  for (const [name, value] of Object.entries(variables ?? {})) {
    vars[name] = wrapValue(value);
  }
  const scope = new Scope([builtinScope, { variables: vars }]);
  const value = scope.evaluate(expr);
  return value === null ? null : (unwrapValue(value) as JMEValue);
}
