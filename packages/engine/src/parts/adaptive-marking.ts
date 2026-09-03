/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// part.js:1073-1190 (`markAdaptive`), 1422-1544 (`markAlternatives`),
// 1554-1577 (`markAgainstScope`).
//
// I rami `waiting_for_pre_submit` (1101, 1110, 1447-1450, 1468-1470, 1533-1535)
// NON sono portati: senza `check_pre_submit` nessuna correzione può restare in
// attesa (decisione 2 del Task 7, inventario §6.9). Non è portato nemmeno il
// blocco `partsMode == 'explore'` (1107).

import { t } from "../i18n";
import { JmeError } from "../jme/errors";
import type { Scope } from "../jme/scope";
import { TNum, TString, type Token } from "../jme/tokens";
import { feedback, type FeedbackItem } from "../marking/feedback";
import type { FinalisedState } from "../marking/finalise-state";
import type { MarkingFeedbackItem } from "./credit";
import { partErrorKeys, type ExistingFeedback, type PartBase } from "./part-base";
import type { VariableReplacementJSON } from "./types";

/** Il risultato grezzo di uno script di correzione, come lo vede il marking
 * adattivo: nei rami d'errore solo `stateErrors` è valorizzato. */
export interface PartScriptResult {
  /** Il feedback prodotto da ciascuna nota. */
  states?: Record<string, FeedbackItem[]> | undefined;
  /** Il valore di ciascuna nota. */
  values?: Record<string, Token> | undefined;
  /** Quali note sono valide. */
  stateValid?: Record<string, boolean> | undefined;
  /** Gli errori che hanno reso non valida una nota. */
  stateErrors: Record<string, Error>;
}

/** Il risultato della correzione contro una singola alternativa
 * (part.js:1397-1404). */
export interface AlternativeResult {
  /** La sequenza finalizzata di operazioni di feedback. */
  finalised_result: FinalisedState;
  /** I valori delle note. */
  values: Record<string, Token>;
  /** La quota di punteggio ottenuta. */
  credit: number;
  /** Il risultato grezzo dello script. */
  script_result: PartScriptResult;
}

/** Il risultato di `markAlternatives` (part.js:1406-1411). */
export interface MarkAlternativesResult {
  /** Il risultato della migliore alternativa (o della parte stessa). */
  result: AlternativeResult;
  /** L'alternativa usata, `null` se è stata usata la parte stessa. */
  best_alternative: PartBase | null;
}

/** Il risultato complessivo della correzione di una parte
 * (part.js:1387-1395). */
export interface MarkingResults {
  /** Gli avvisi accumulati. */
  warnings: string[];
  /** Le voci di feedback per la UI. */
  markingFeedback: MarkingFeedbackItem[];
  /** La sequenza finalizzata di operazioni di feedback. */
  finalised_result: FinalisedState;
  /** I valori delle note. */
  values: Record<string, Token>;
  /** La quota di punteggio ottenuta. */
  credit: number;
  /** La risposta era correggibile? */
  answered: boolean;
  /** L'alternativa usata, se ce n'è una. */
  best_alternative?: PartBase | null | undefined;
  /** Il risultato grezzo dello script. */
  script_result: PartScriptResult;
  /** La correzione ha usato le sostituzioni di variabile? */
  adaptiveMarkingUsed?: boolean | undefined;
}

/** Il messaggio di un errore qualsiasi. */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** L'errore, come `Error`. */
function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

// part.js:1422-1544
/** Corregge la risposta contro la parte e ciascuna delle sue alternative, e
 * tiene il risultato che assegna più credito (scalato sui punti
 * dell'alternativa). */
export function markAlternatives(
  part: PartBase,
  scope: Scope,
  existing: ExistingFeedback,
): MarkAlternativesResult {
  // part.js:1435-1457
  const mark_alternative = (alt: PartBase): AlternativeResult => {
    alt.restore_feedback(existing);
    let values: Record<string, Token> = {};
    let finalised_result: FinalisedState = { states: [], valid: false, credit: 0 };
    let script_result: PartScriptResult = { stateErrors: {} };
    try {
      const result = alt.mark(scope);
      finalised_result = result.finalised_result;
      values = result.values;
      script_result = result.script_result;
    } catch (e) {
      part.giveWarning(errorMessage(e));
      script_result = { stateErrors: { mark: asError(e) } };
    }
    return {
      finalised_result: finalised_result,
      values: values,
      credit: alt.credit,
      script_result: script_result,
    };
  };

  let res = mark_alternative(part);
  // upstream (part.js:1459-1462, 1537-1542) protegge due blocchi con
  // `res.valid`, ma `res` è un `alternative_result`, che non ha un campo
  // `valid`: sono rami morti. Non portati — vedi DIVERGENCES.md.

  let best_alternative: {
    scale: number;
    scaled_credit: number;
    result: AlternativeResult;
    alternative: PartBase;
    index: number;
  } | null = null;

  if (part.alternatives.length) {
    for (let i = 0; i < part.alternatives.length; i++) {
      const alt = part.alternatives[i] as PartBase;
      alt.stagedAnswer = part.stagedAnswer;
      alt.setStudentAnswer();
      const altres = mark_alternative(alt);
      if (!altres.finalised_result.valid) {
        continue;
      }
      const scale = part.marks === 0 ? 1 : alt.marks / part.marks;
      const scaled_credit = altres.credit * scale;
      if (altres.credit === 0) {
        continue;
      }
      if (scaled_credit < res.credit) {
        continue;
      }
      if (best_alternative && scaled_credit <= best_alternative.scaled_credit) {
        continue;
      }
      altres.credit = scaled_credit;
      best_alternative = {
        scale: scale,
        scaled_credit: scaled_credit,
        result: altres,
        alternative: alt,
        index: i,
      };
    }
    if (best_alternative) {
      const alternative = best_alternative.alternative;
      res = best_alternative.result;
      const reason =
        best_alternative.scaled_credit === 1 ? "correct" : best_alternative.scaled_credit === 0 ? "incorrect" : "";
      let states: FeedbackItem[] = [
        feedback.set_credit(best_alternative.scaled_credit, reason, alternative.alternativeFeedbackMessage),
      ];
      if (alternative.settings.useAlternativeFeedback) {
        states = res.finalised_result.states
          .map((s) => {
            if (s.credit !== undefined) {
              s.credit = (typeof s.credit === "number" ? s.credit : s.credit.toFloat()) * best_alternative!.scale;
            }
            return s;
          })
          .concat(states);
      }
      res.finalised_result = {
        credit: best_alternative.scaled_credit,
        states: states,
        valid: true,
      };
      part.restore_feedback(existing);
      part.credit = 0;
      part.apply_feedback(res.finalised_result);
      part.setWarnings(alternative.warnings.slice());
      res.values["used_alternative"] = new TNum(best_alternative.index);
      res.values["used_alternative_name"] = new TString(alternative.name);
    }
  }

  return {
    result: res,
    best_alternative: best_alternative ? best_alternative.alternative : null,
  };
}

// part.js:1554-1577
/** Corregge contro lo scope dato, riportando come avviso l'eventuale errore
 * della nota `mark`. */
export function markAgainstScope(part: PartBase, scope: Scope, existing: ExistingFeedback): MarkingResults {
  const altres = markAlternatives(part, scope, existing);
  const res = altres.result;
  const markError = res.script_result.stateErrors["mark"];
  if (markError) {
    const message = markError.message;
    part.markingComment(message);
    part.giveWarning(message);
  }
  return {
    warnings: part.warnings.slice(),
    markingFeedback: part.markingFeedback.slice(),
    best_alternative: altres.best_alternative,
    script_result: res.script_result,
    finalised_result: res.finalised_result,
    values: res.values,
    credit: part.credit,
    answered: part.answered,
  };
}

// part.js:1073-1190
/** Corregge la risposta, usando il marking adattivo quando serve.
 *
 * Prova prima senza sostituzioni (salvo strategia `alwaysreplace`), poi con lo
 * scope in cui le variabili sono sostituite con le risposte alle parti
 * riferite; tiene il risultato migliore. */
export function markAdaptive(part: PartBase): MarkingResults | undefined {
  if (!part.doesMarking) {
    return undefined;
  }
  part.setStudentAnswer();

  const existing_feedback: ExistingFeedback = {
    warnings: part.warnings.slice(),
    markingFeedback: part.markingFeedback.slice(),
  };

  const settings = part.isAlternative && part.parentPart ? part.parentPart.settings : part.settings;

  let result: MarkingResults | undefined;
  let result_original: MarkingResults | undefined;
  let try_replacement = false;
  const hasReplacements = part.getErrorCarriedForwardReplacements().length > 0;

  if (settings.variableReplacementStrategy === "originalfirst" || !hasReplacements) {
    result_original = part.markAgainstScope(part.getScope(), existing_feedback);
    result = result_original;
    try_replacement = hasReplacements && (!result.answered || result.credit < 1);
  }

  if (settings.variableReplacementStrategy === "alwaysreplace" && hasReplacements) {
    try_replacement = true;
  }

  if (try_replacement) {
    try {
      const scope = part.errorCarriedForwardScope();
      const result_replacement = part.markAgainstScope(scope, existing_feedback);
      if (!result_original || (result_replacement.answered && result_replacement.credit > result_original.credit)) {
        result = result_replacement;
        result.finalised_result.states.splice(0, 0, feedback.feedback(t("part.marking.used variable replacements")));
        result.adaptiveMarkingUsed = true;
      }
    } catch (e) {
      result = handleAdaptiveError(part, e, result);
    }
  }
  return result;
}

// part.js:1120-1183
/** Traduce in feedback un errore avvenuto durante il marking adattivo. */
function handleAdaptiveError(
  part: PartBase,
  e: unknown,
  result: MarkingResults | undefined,
): MarkingResults | undefined {
  const keys = partErrorKeys(e);
  if (keys.includes("part.marking.variable replacement part not answered")) {
    const errorFeedback: FeedbackItem[] = [feedback.feedback(errorMessage(e))];
    part.getErrorCarriedForwardReplacements().forEach((vr: VariableReplacementJSON) => {
      const other = part.question ? (part.question.getPart(vr.part) as PartBase | undefined) : undefined;
      if (other && other.answered && !other.shouldUseInAdaptiveMarking()) {
        errorFeedback.splice(0, 0, {
          op: "feedback",
          message: other.settings.adaptiveMarkingNotUsedMessage
            ? t("part.marking.adaptive variable replacement does not satisfy condition message", {
                name: other.name,
                message: other.settings.adaptiveMarkingNotUsedMessage,
              })
            : t("part.marking.adaptive variable replacement does not satisfy condition", { name: other.name }),
          reason: "",
          format: "string",
        });
      }
    });
    const out = result ?? emptyErrorResult(errorFeedback, asError(e));
    out.warnings.push(errorMessage(e));
    return out;
  }
  try {
    part.error(errorMessage(e), {}, e);
  } catch (pe) {
    // upstream (part.js:1170) interpola `e.message`, l'errore ORIGINALE, non
    // `pe` (il `part.error` appena costruito): il messaggio mostrato allo
    // studente non deve avere il prefisso col nome della parte. `pe` finisce
    // solo in `script_result.state_errors.mark`.
    const errorFeedback: FeedbackItem[] = [
      feedback.feedback(t("part.marking.error in adaptive marking", { message: errorMessage(e) })),
    ];
    if (!result) {
      return emptyErrorResult(errorFeedback, asError(pe));
    }
  }
  return result;
}

// part.js:1136-1152
/** Il risultato "vuoto" costruito quando il marking adattivo fallisce e non
 * c'era un risultato senza sostituzioni. */
function emptyErrorResult(errorFeedback: FeedbackItem[], error: Error): MarkingResults {
  return {
    warnings: [],
    markingFeedback: errorFeedback as MarkingFeedbackItem[],
    finalised_result: { valid: false, credit: 0, states: errorFeedback },
    values: {},
    credit: 0,
    // upstream: il literal di part.js:1136-1152 e 1168-1183 NON ha la chiave
    // `answered`, quindi `this.answered = result.answered` (part.js:1275)
    // assegna `undefined` — un valore che il resto del codice tratta come
    // falso ma che non è un booleano. Qui è `false`. Vedi DIVERGENCES.md.
    answered: false,
    script_result: { stateErrors: { mark: error } },
  };
}

/** Il tipo dell'errore lanciato quando una parte riferita non è stata
 * risposta: esportato per i test. */
export const VARIABLE_REPLACEMENT_NOT_ANSWERED = "part.marking.variable replacement part not answered";

/** Un errore di marking adattivo, per i test. */
export function isAdaptiveMarkingError(e: unknown, key: string): boolean {
  return e instanceof JmeError && partErrorKeys(e).includes(key);
}
