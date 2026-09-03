/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// marking.js:501-509 (typedef `marking_script_result`), 568-597
// (`Numbas.marking.MarkingScript`).

import type { Scope } from "../jme/scope";
import type { Token } from "../jme/tokens";
import { noteScriptConstructor, type NoteScript, type ScriptNote } from "../variables/note-script";
import { computeNote } from "./compute-note";
import type { FeedbackItem } from "./feedback";
import { makeMarkingScope } from "./note-functions";
import type { StatefulScope } from "./stateful-scope";

/** Il risultato dell'esecuzione di uno script di correzione
 * (marking.js:501-509, prodotto da `process_result`, 588-595).
 *
 * `scope` non è upstream: `process_result` ritorna solo le quattro mappe. Lo
 * si aggiunge perché è l'unico modo per raggiungere lo stato completo della
 * valutazione (il Task 8 ne ha bisogno per il feedback), e perché
 * `evaluate_note` upstream ritorna già lo scope. */
export interface MarkingScriptResult {
  /** Il feedback prodotto da ciascuna nota. */
  states: Record<string, FeedbackItem[]>;
  /** Il valore di ciascuna nota. */
  values: Record<string, Token>;
  /** Quali note sono valide. */
  stateValid: Record<string, boolean>;
  /** Gli errori che hanno reso non valida una nota. */
  stateErrors: Record<string, Error>;
  /** Lo scope in cui lo script è stato valutato. */
  scope: StatefulScope;
}

// marking.js:582-597
const MarkingScriptBase = noteScriptConstructor<MarkingScriptResult>(
  // marking.js:583-587
  (scope, variables) => makeMarkingScope(scope, variables),
  // marking.js:588-595
  (result, scope) => {
    const s = scope as StatefulScope;
    return {
      states: s.states,
      values: result.variables,
      stateValid: s.stateValid,
      stateErrors: s.stateErrors,
      scope: s,
    };
  },
  computeNote,
);

/**
 * Uno script per correggere una parte: una lista di note che possono
 * riferirsi l'una all'altra, con dipendenze che formano un grafo aciclico
 * come per le variabili di una domanda (marking.js:568-581).
 *
 * Due note sono necessarie perché una parte possa usarlo (il controllo è del
 * Task 8, `Part#setMarkingScript`):
 *
 * - `mark`, la nota finale, che produce il feedback sulla parte;
 * - `interpreted_answer`, il cui valore rappresenta la risposta dello studente
 *   come lo script l'ha interpretata.
 */
export class MarkingScript extends MarkingScriptBase {
  /** Le note dello script, per nome. */
  declare notes: Record<string, ScriptNote>;
  /** Il sorgente dello script. */
  declare source: string;

  // marking.js:582-597 + part.js:1904-1945 (`do_pre_submit_tasks`)
  /** Valuta lo script **saltando la nota `pre_submit`**.
   *
   * upstream la nota `pre_submit` serve a compiti asincroni (`check_pre_submit`
   * ritorna un `TPromise`, marking.js:348-366): `mark_answer` la valuta a
   * parte con `evaluate_note` (part.js:1963) e poi `markingScript.evaluate` la
   * ricalcola insieme a tutte le altre. Il port è solo sincrono (risoluzione 2
   * del Task 8) e `check_pre_submit` non esiste: la nota fallirebbe **dopo**
   * aver rieseguito i `submit_part` sui gap di un `gapfill`, lasciando quei
   * gap in uno stato che upstream ripulisce nell'iterazione successiva (che
   * qui non arriva mai, perché l'errore interrompe la `map`). Il risultato
   * osservabile era un `shouldResubmit` acceso a sproposito. Saltarla toglie
   * sia la divergenza sia il doppio invio. Vedi DIVERGENCES.md. */
  override evaluate(scope: Scope, variables?: Record<string, Token>): MarkingScriptResult {
    const targets = Object.keys(this.notes).filter((name) => name !== "pre_submit");
    return super.evaluate(scope, variables, targets);
  }

  // jme-variables.js:920-926, ristretto: `construct_scope` di uno script di
  // correzione produce sempre uno `StatefulScope`, ed è da lì che il Task 8
  // legge `stateErrors.pre_submit` (part.js:1917-1921).
  override evaluate_note(
    note: string,
    scope: Scope,
    variables?: Record<string, Token>,
  ): { value: Token | undefined; scope: StatefulScope } {
    const res = super.evaluate_note(note, scope, variables);
    return { value: res.value, scope: res.scope as StatefulScope };
  }
}

/** Un `MarkingScript` visto come script di note generico. */
export type MarkingNoteScript = NoteScript<MarkingScriptResult>;
