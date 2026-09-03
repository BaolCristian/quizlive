/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// part.js:1983-2086 — `setCredit`, `addCredit`, `subCredit`, `multCredit` e
// `markingComment`.
//
// Il credito è SEMPRE una `math.Fraction` (inventario 05 §9): `creditFraction`
// è la sola sorgente di verità, e `credit` ne è la proiezione in virgola
// mobile. Le quattro operazioni accodano una voce a `markingFeedback` solo se
// `settings.showFeedbackIcon` è vero — non è una scelta di sola UI: cambia il
// contenuto di `MarkingResult.feedback`.

import { Fraction } from "../math";
import type { TScope } from "../jme/tokens";
import type { FeedbackFormat, FeedbackReason } from "../marking/feedback";

/** Una voce di `markingFeedback`: quel che `apply_feedback` produce per la UI
 * (part.js:1382-1385, `Numbas.parts.feedbackmessage`). */
export interface MarkingFeedbackItem {
  /** L'operazione che ha prodotto la voce. */
  op: "add_credit" | "sub_credit" | "multiply_credit" | "feedback";
  /** La variazione di credito, dove l'operazione ne produce una. */
  credit?: number | undefined;
  /** Per `multiply_credit`, il fattore applicato. */
  factor?: number | undefined;
  /** Il messaggio mostrato allo studente. */
  message?: string | undefined;
  /** Perché l'operazione è stata applicata. */
  reason?: FeedbackReason | undefined;
  /** Il formato del messaggio. */
  format?: FeedbackFormat | undefined;
  /** Lo scope JME in cui il messaggio è stato prodotto. */
  scope?: TScope | undefined;
  /** Il verso del cambiamento di credito, calcolato da `apply_feedback`. */
  credit_change?: "positive" | "negative" | "neutral" | "invalid" | undefined;
  /** "Ti sono stati assegnati N punti", calcolato da `apply_feedback`. */
  credit_message?: string | undefined;
}

/** Il minimo che serve per applicare le operazioni di credito a una parte. */
export interface CreditHolder {
  /** Il credito come frazione esatta. */
  creditFraction: Fraction;
  /** Le voci di feedback accumulate. */
  markingFeedback: MarkingFeedbackItem[];
  /** Le impostazioni della parte: serve `showFeedbackIcon`. */
  settings: { showFeedbackIcon: boolean };
}

// part.js:1991-2004
/** Imposta il credito a un valore assoluto. */
export function setCredit(
  part: CreditHolder,
  credit: number,
  message?: string,
  reason?: FeedbackReason,
  scope?: TScope,
): void {
  const oCredit = part.creditFraction;
  part.creditFraction = Fraction.fromFloat(credit);
  if (part.settings.showFeedbackIcon) {
    part.markingFeedback.push({
      op: "add_credit",
      credit: part.creditFraction.subtract(oCredit).toFloat(),
      scope: scope,
      message: message,
      reason: reason,
    });
  }
}

// part.js:2012-2024
/** Aggiunge un valore assoluto al credito. */
export function addCredit(part: CreditHolder, credit: number, message?: string, scope?: TScope): void {
  part.creditFraction = part.creditFraction.add(Fraction.fromFloat(credit));
  if (part.settings.showFeedbackIcon) {
    part.markingFeedback.push({
      op: "add_credit",
      credit: credit,
      scope: scope,
      message: message,
    });
  }
}

// part.js:2032-2044
/** Sottrae un valore assoluto dal credito. */
export function subCredit(part: CreditHolder, credit: number, message?: string, scope?: TScope): void {
  part.creditFraction = part.creditFraction.subtract(Fraction.fromFloat(credit));
  if (part.settings.showFeedbackIcon) {
    part.markingFeedback.push({
      op: "sub_credit",
      credit: -credit,
      scope: scope,
      message: message,
    });
  }
}

// part.js:2052-2065
/** Moltiplica il credito per il fattore dato: si usa per le penalità.
 *
 * upstream l'`events.trigger` è DENTRO l'`if(showFeedbackIcon)` (part.js:2064,
 * a differenza delle tre operazioni sopra): qui non ci sono eventi, quindi la
 * differenza non è osservabile. */
export function multCredit(part: CreditHolder, factor: number, message?: string, scope?: TScope): void {
  const oCreditFraction = part.creditFraction;
  part.creditFraction = part.creditFraction.multiply(Fraction.fromFloat(factor));
  if (part.settings.showFeedbackIcon) {
    part.markingFeedback.push({
      op: "multiply_credit",
      credit: part.creditFraction.subtract(oCreditFraction).toFloat(),
      scope: scope,
      factor: factor,
      message: message,
    });
  }
}

// part.js:2074-2086
/** Accoda un commento al feedback.
 *
 * Se `showFeedbackIcon` è falso, i messaggi con ragione `correct`/`incorrect`
 * sono scartati del tutto (part.js:2075-2077). */
export function markingComment(
  part: CreditHolder,
  message?: string,
  reason?: FeedbackReason,
  format?: FeedbackFormat,
  scope?: TScope,
): void {
  if (!part.settings.showFeedbackIcon && (reason === "incorrect" || reason === "correct")) {
    return;
  }
  part.markingFeedback.push({
    op: "feedback",
    message: message,
    reason: reason,
    format: format || "string",
    scope: scope,
  });
}
