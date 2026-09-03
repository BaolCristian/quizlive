/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// marking.js:21-99 — il typedef `feedback_item`, l'enum `FeedbackOps` e i
// costruttori `Numbas.marking.feedback`.

import type { Fraction } from "../math";
import type { TScope } from "../jme/tokens";

/** Il genere di un'operazione di feedback (marking.js:42-66).
 *
 * `start_lift`/`end_lift` NON sono nell'enum upstream: sono stringhe letterali
 * che `finalise_state` (marking.js:665,672) e `Part#apply_feedback` usano solo
 * internamente per espandere un `concat`. Qui fanno parte dell'unione, perché
 * il `switch` del port deve trattarle (inventario 05 §9, decisione 4). */
export type FeedbackOp =
  /** Imposta il credito al valore dato. */
  | "set_credit"
  /** Aggiunge il credito dato. */
  | "add_credit"
  /** Moltiplica il credito corrente per il fattore dato. */
  | "multiply_credit"
  /** Sottrae il credito dato. */
  | "sub_credit"
  /** Termina la correzione. */
  | "end"
  /** Mostra un avviso accanto al widget della risposta. */
  | "warning"
  /** Mostra un messaggio allo studente. */
  | "feedback"
  /** Accoda in blocco la lista di item data, con un fattore di scala. */
  | "concat"
  /** Apre un blocco "lift" (interno a `finaliseState`). */
  | "start_lift"
  /** Chiude un blocco "lift" (interno a `finaliseState`). */
  | "end_lift";

/** Perché l'operazione è applicata (marking.js:28).
 *
 * Upstream non elenca i valori: oltre a `correct`/`incorrect`/`invalid`,
 * `add_credit_if` (marking.js:204) usa anche `neutral`, e `set_credit`
 * (171-176) e `feedback` (240-245) non passano nessuna ragione. */
export type FeedbackReason = "correct" | "incorrect" | "invalid" | "neutral" | "";

/** Il formato del messaggio di un item (marking.js:258-275). */
export type FeedbackFormat = "string" | "html";

/** Una riga di feedback prodotta correggendo una risposta; può modificare il
 * credito assegnato (marking.js:21-34).
 *
 * I campi opzionali sono dichiarati `| undefined` di proposito: i costruttori
 * upstream scrivono sempre tutte le chiavi, anche quando il valore è
 * `undefined`, e `exactOptionalPropertyTypes` vieterebbe di assegnarle. */
export interface FeedbackItem {
  /** L'operazione da eseguire. */
  op: FeedbackOp;
  /** Parametro per cambiare il credito; il significato dipende da `op`. */
  credit?: number | Fraction | undefined;
  /** Per gli item `multiply_credit`, il fattore per cui moltiplicare. */
  factor?: number | undefined;
  /** Perché l'operazione è applicata. */
  reason?: FeedbackReason | undefined;
  /** Il messaggio da mostrare allo studente. */
  message?: string | undefined;
  /** Il formato di `message`. */
  format?: FeedbackFormat | undefined;
  /** Per gli item `end`, la risposta è stata giudicata non correggibile? */
  invalid?: boolean | undefined;
  /** Per gli item `concat`, gli item da aggiungere allo stato.
   *
   * Il brief chiamava questo campo `states`: upstream (marking.js:96-98,
   * letto da 660) lo chiama `messages`, ed è il nome che gli script `.jme`
   * vedono quando l'item passa per un dizionario JME. */
  messages?: FeedbackItem[] | undefined;
  /** Per gli item `concat`/`start_lift`, il fattore di scala del credito. */
  scale?: number | undefined;
  /** Lo scope JME in cui il messaggio è stato prodotto, usato più tardi per la
   * sostituzione delle variabili (marking.js:119-121; letto da
   * `part.js:1750-1765`). */
  scope?: TScope | undefined;
  /** La nota che ha prodotto l'item (marking.js:561-563). */
  note?: string | undefined;
}

/** I costruttori degli item di feedback (marking.js:74-99). */
export const feedback = {
  // marking.js:75-77
  set_credit(credit: number | Fraction, reason?: FeedbackReason, message?: string): FeedbackItem {
    return { op: "set_credit", credit: credit, reason: reason, message: message };
  },
  // marking.js:78-80
  add_credit(credit: number | Fraction, message?: string): FeedbackItem {
    return { op: "add_credit", credit: credit, message: message };
  },
  // marking.js:81-83
  sub_credit(credit: number | Fraction, message?: string): FeedbackItem {
    return { op: "sub_credit", credit: credit, message: message };
  },
  // marking.js:84-86
  multiply_credit(factor: number, message?: string): FeedbackItem {
    return { op: "multiply_credit", factor: factor, message: message };
  },
  // marking.js:87-89
  end(invalid?: boolean): FeedbackItem {
    return { op: "end", invalid: invalid || false };
  },
  // marking.js:90-92
  warning(message: string): FeedbackItem {
    return { op: "warning", message: message };
  },
  // marking.js:93-95
  feedback(message: string, reason?: FeedbackReason, format?: FeedbackFormat, scope?: TScope): FeedbackItem {
    return { op: "feedback", message: message, reason: reason, format: format, scope: scope };
  },
  // marking.js:96-98
  concat(messages: FeedbackItem[], scale: number): FeedbackItem {
    return { op: "concat", messages: messages, scale: scale };
  },
};
