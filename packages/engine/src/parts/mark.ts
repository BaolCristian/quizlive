/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// part.js:1699-1716 (`mark`), 1737-1845 (`apply_feedback`), 1856-1884
// (`marking_parameters`), 1959-1982 (`mark_answer`).
//
// `do_pre_submit_tasks` (1885-1946) NON è portata: è l'unico punto in cui la
// correzione potrebbe diventare asincrona, e nessuno dei tipi in ambito la
// attiva (inventario 05 §6.9). Di conseguenza `marking_parameters` non riceve
// mai `pre_submit_parameters` e `mark_answer` è sincrona.

import { t } from "../i18n";
import { JmeError } from "../jme/errors";
import { makeSafe, wrapValue } from "../jme/evaluate";
import type { Scope } from "../jme/scope";
import { TNum, TString, type Token } from "../jme/tokens";
import { Fraction, niceNumber } from "../math";
import type { FeedbackItem } from "../marking/feedback";
import { finaliseState, type FinalisedState } from "../marking/finalise-state";
import type { MarkingScriptResult } from "../marking/marking-script";
import type { MarkingFeedbackItem } from "./credit";
import type { PartBase } from "./part-base";

/** Il risultato della correzione di una risposta contro uno scope, senza
 * considerare le alternative (part.js:1680-1686). */
export interface MarkResult {
  /** La sequenza finalizzata di operazioni di feedback. */
  finalised_result: FinalisedState;
  /** I valori delle note dell'algoritmo di correzione. */
  values: Record<string, Token>;
  /** Il risultato grezzo dello script. */
  script_result: MarkingScriptResult;
}

/** Il credito di un item come numero.
 *
 * `FeedbackItem.credit` è tipizzato `number | Fraction` (Task 7): upstream fa
 * `scale * state.credit`, che su una `Fraction` darebbe `NaN`. Nessuna
 * funzione di stato produce oggi una `Fraction`, ma il confine è qui, quindi
 * la conversione è esplicita invece di essere data per scontata. */
function creditNumber(credit: number | Fraction | undefined): number {
  if (credit === undefined) {
    return 0;
  }
  return credit instanceof Fraction ? credit.toFloat() : credit;
}

// part.js:1856-1884, senza `pre_submit_parameters`
/** I parametri JME che lo script di correzione riceve. */
export function markingParameters(part: PartBase, studentAnswer: Token | undefined): Record<string, Token> {
  const safeAnswer = studentAnswer === undefined ? undefined : makeSafe(studentAnswer);
  const obj: Record<string, Token> = {
    path: wrapValue(part.path),
    name: wrapValue(part.name),
    question_definitions: wrapValue(part.question ? (part.question.local_definitions ?? {}) : {}),
    studentAnswer: safeAnswer as Token,
    settings: wrapValue(part.settings),
    marks: new TNum(part.availableMarks()),
    partType: new TString(part.type),
    // `exec_path` esiste solo per la cache dei task pre-submit, che non sono
    // portati: resta la stringa vuota che upstream passa alla prima chiamata.
    exec_path: wrapValue(""),
    gaps: wrapValue(part.gaps.map((g) => g.markingParameters(g.rawStudentAnswerAsJME()))),
    // gli step non sono portati: la lista è sempre vuota.
    steps: wrapValue([]),
  };
  return obj;
}

// part.js:1959-1982, senza `do_pre_submit_tasks`
/** Esegue lo script di correzione contro la risposta data, senza applicarne
 * gli effetti alla parte. */
export function markAnswer(
  part: PartBase,
  studentAnswer: Token | undefined,
  scope: Scope,
): MarkingScriptResult {
  try {
    part.getCorrectAnswer(scope);
    const parameters = part.markingParameters(studentAnswer);
    Object.keys(parameters).forEach((name) => {
      if (scope.getVariable(name) !== undefined) {
        throw new JmeError("part.marking.parameter already in scope", { name: name });
      }
    });
    const script = part.markingScript;
    if (!script) {
      throw new JmeError("part.marking.missing required note", { note: "mark" });
    }
    return script.evaluate(scope, parameters);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new JmeError("part.marking.error in marking script", { message: message }, e);
  }
}

// part.js:1699-1716
/** Corregge la risposta dello studente contro lo scope dato e applica il
 * risultato alla parte. */
export function markPart(part: PartBase, scope: Scope): MarkResult {
  const studentAnswer = part.rawStudentAnswerAsJME();
  const result = part.mark_answer(studentAnswer, scope);
  let finalised_result: FinalisedState = { valid: false, credit: 0, states: [] };
  if (!result.stateErrors["mark"]) {
    finalised_result = finaliseState(result.states["mark"] ?? []);
    part.credit = 0;
    part.apply_feedback(finalised_result);
    part.interpretedStudentAnswer = result.values["interpreted_answer"];
  }
  return { finalised_result: finalised_result, values: result.values, script_result: result };
}

// part.js:1737-1845
/** Applica alla parte una sequenza finalizzata di operazioni di feedback.
 *
 * È la stessa macchina a stati di `marking.finalise_state`, con gli effetti
 * reali al posto dell'accumulatore puro (il commento upstream a marking.js:609
 * lo dice): il credito passa da `setCredit`/`addCredit`/`subCredit`/
 * `multCredit`, gli avvisi da `giveWarning`, i messaggi da `markingComment`.
 *
 * Nota sulla scala: dentro un blocco `lift`, upstream moltiplica ogni singola
 * variazione di credito per `scale` al momento della chiamata (righe 1748-1759)
 * e NON riscala al `end_lift` (1783-1787) — al contrario di `finalise_state`,
 * che riscala in blocco. I due risultati coincidono. */
export function applyFeedback(part: PartBase, finalised: FinalisedState): void {
  let valid = finalised.valid;
  let end = false;
  const states = finalised.states.slice();
  let i = 0;
  const lifts: Array<{ creditFraction: Fraction; scale: number }> = [];
  let scale = 1;
  while (i < states.length) {
    const state = states[i] as FeedbackItem;
    switch (state.op) {
      case "set_credit":
        part.setCredit(scale * creditNumber(state.credit), state.message, state.reason, state.scope);
        break;
      case "multiply_credit":
        part.multCredit(state.factor as number, state.message, state.scope);
        break;
      case "add_credit":
        part.addCredit(scale * creditNumber(state.credit), state.message, state.scope);
        break;
      case "sub_credit":
        part.subCredit(scale * creditNumber(state.credit), state.message, state.scope);
        break;
      case "warning":
        part.giveWarning(state.message as string);
        break;
      case "feedback":
        part.markingComment(state.message, state.reason, state.format, state.scope);
        break;
      case "end":
        if (state.invalid) {
          valid = false;
        }
        if (lifts.length) {
          while (i + 1 < states.length && (states[i + 1] as FeedbackItem).op !== "end_lift") {
            i += 1;
          }
        } else {
          end = true;
        }
        break;
      case "start_lift":
        lifts.push({ creditFraction: part.creditFraction, scale: scale });
        part.creditFraction = Fraction.zero;
        scale = state.scale as number;
        break;
      case "end_lift": {
        const last_lift = lifts.pop() as { creditFraction: Fraction; scale: number };
        const lift_credit = part.credit;
        part.creditFraction = last_lift.creditFraction.add(Fraction.fromFloat(lift_credit));
        scale = last_lift.scale;
        break;
      }
      default:
        break;
    }
    i += 1;
    if (end) {
      break;
    }
  }
  part.answered = valid;
  annotateCreditChanges(part);
}

// part.js:1817-1844
/** Aggiunge a ogni voce di `markingFeedback` che cambia il credito il
 * messaggio "ti sono stati assegnati N punti" e il verso del cambiamento. */
function annotateCreditChanges(part: PartBase): void {
  let total = 0;
  for (let i = 0; i < part.markingFeedback.length; i++) {
    const action = part.markingFeedback[i] as MarkingFeedbackItem;
    let credit_change = 0;
    if (action.credit !== undefined) {
      const availableMarks = part.availableMarks();
      let change = action.credit * availableMarks;
      credit_change = action.credit;
      const ot = total;
      total += change;
      change = total - ot;
      if (action.message === undefined) {
        action.message = "";
      }
      if (change !== 0) {
        const marks = Math.abs(change);
        if (change > 0) {
          action.credit_message = t("feedback.you were awarded", { count: niceNumber(marks) });
        } else {
          action.credit_message = t("feedback.taken away", { count: niceNumber(marks) });
        }
      }
    }
    let change_desc: NonNullable<MarkingFeedbackItem["credit_change"]> =
      credit_change > 0 ? "positive" : credit_change < 0 ? "negative" : "neutral";
    switch (action.reason) {
      case "correct":
        change_desc = "positive";
        break;
      case "incorrect":
        change_desc = "negative";
        break;
      case "invalid":
        change_desc = "invalid";
        break;
      default:
        break;
    }
    action.credit_change = change_desc;
  }
}
