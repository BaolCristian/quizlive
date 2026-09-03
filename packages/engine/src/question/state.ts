/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Sostituisce `Question#resume` (question.js:935-1070) e la forma dati di
// `storage.js:405-530`, con un modello molto più semplice: il port genera le
// variabili da un seme esplicito, quindi lo stato **non** salva i valori delle
// variabili (upstream deve farlo perché `Math.random` non è seminato per
// domanda, storage.js:445). Vedi inventario 06 §9.
//
// Quel che resta di upstream è l'ORDINE di riesecuzione delle parti
// (question.js:1004-1033): prima le parti "sorgente" di una sostituzione di
// variabile, poi quelle che le referenziano.

import type { Answer, PartBase } from "../parts";
import type { PartState, QuestionState } from "./types";

/** Quel che serve a `questionToState`/`applyQuestionState`: la forma minima
 * della domanda, così il modulo non dipende dalla classe. */
export interface StatefulQuestion {
  /** Il seme con cui le variabili sono state generate. */
  readonly seed: string;
  /** Le parti di primo livello. */
  readonly parts: PartBase[];
  /** Tutte le parti sono state risposte? */
  answered: boolean;
  /** Quante volte la domanda è stata inviata per intero. */
  submitted: number;
  /** Il testo di aiuto è stato mostrato? */
  adviceDisplayed: boolean;
  /** Le risposte corrette sono state rivelate? */
  revealed: boolean;
  /** Il punteggio corrente. */
  score(): { score: number; marks: number };
  /** Mostra il testo di aiuto. */
  getAdvice(): void;
  /** Rivela le risposte corrette. */
  revealAnswer(): void;
  /** Ricalcola il punteggio. */
  updateScore(): void;
}

/** La risposta da registrare nello stato, se ce n'è una.
 *
 * upstream: `storage.js:463-530` salva sempre `student_answer`. Qui non basta
 * guardare `stagedAnswer`, perché ogni tipo di parte lo inizializza al
 * proprio valore vuoto (`""` per `numberentry`/`jme`, numberentry.js:77;
 * `[]` per le scelte multiple, multipleresponse.js:346), quindi una parte mai
 * toccata avrebbe comunque una "risposta". Si registra solo se lo studente ha
 * scritto qualcosa (`isDirty`) o se la parte è già stata corretta almeno una
 * volta (`result`); altrimenti lo stato resta pulito e il ripristino non
 * sporca `isDirty` di una parte intatta. */
function storedAnswer(part: PartBase): Answer | undefined {
  const touched = part.isDirty || part.result !== undefined;
  if (!touched) {
    return undefined;
  }
  const staged = part.stagedAnswer;
  return staged === undefined ? undefined : (staged as Answer);
}

/** Lo stato di una parte e, ricorsivamente, dei suoi gap. */
function partToState(part: PartBase): PartState {
  const state: PartState = {
    path: part.path,
    answered: part.answered,
    score: part.score,
    marks: part.availableMarks(),
  };
  const answer = storedAnswer(part);
  if (answer !== undefined) {
    state.answer = answer;
  }
  if (part.gaps.length > 0) {
    state.gaps = part.gaps.map(partToState);
  }
  return state;
}

// storage.js:405-461 (`questionSuspendData`), senza `variables`,
// `interactive_state`, `currentPart`, `group` e `number_in_group`.
/** Fotografa lo stato di una domanda in una struttura JSON-serializzabile. */
export function questionToState(q: StatefulQuestion): QuestionState {
  const { score, marks } = q.score();
  return {
    seed: q.seed,
    answered: q.answered,
    submitted: q.submitted,
    adviceDisplayed: q.adviceDisplayed,
    revealed: q.revealed,
    score: score,
    marks: marks,
    parts: q.parts.map(partToState),
  };
}

/** Rimette una risposta su una parte, senza correggerla: per un `gapfill` la
 * risposta sta nei gap, non sulla parte madre. */
function restoreAnswers(part: PartBase, state: PartState): void {
  if (part.gaps.length > 0 && state.gaps) {
    part.gaps.forEach((gap, i) => {
      const gapState = state.gaps?.[i];
      if (gapState) {
        restoreAnswers(gap, gapState);
      }
    });
    return;
  }
  if (state.answer !== undefined) {
    part.storeAnswer(state.answer);
  }
}

// question.js:985-1033 — l'ordine di riesecuzione: una parte che sostituisce
// una variabile con la risposta a un'altra va inviata DOPO quella.
/** Ordina le parti da rinviare mettendo le "sorgenti" prima di chi le usa.
 *
 * Un ciclo fra le sostituzioni non blocca l'ordinamento: le parti rimaste
 * vanno in coda nell'ordine originale, e sarà la correzione a segnalarlo
 * (`part.gapfill.cyclic adaptive marking`). */
export function orderPartsForResubmission(parts: PartBase[]): PartBase[] {
  // upstream: `part_submit_promises` è indicizzata su TUTTE le parti
  // (question.js:986-991, `q.allParts()` — quindi anche sui gap), ma
  // `submit_part` è chiamata solo su quelle di primo livello e la promessa di
  // un gap è risolta insieme a quella della parte che lo contiene
  // (question.js:1024-1030). Una sostituzione che nomina un gap fa quindi
  // aspettare la PARTE MADRE di quel gap: senza questa mappa, un percorso come
  // `p1g0` non combacerebbe con nessuna parte di primo livello e la dipendenza
  // risulterebbe già soddisfatta.
  const ownerOf = new Map<string, PartBase>();
  for (const p of parts) {
    ownerOf.set(p.path, p);
    for (const g of p.gaps) {
      ownerOf.set(g.path, p);
    }
  }
  const remaining = parts.slice();
  const done = new Set<string>();
  const out: PartBase[] = [];
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < remaining.length; ) {
      const p = remaining[i] as PartBase;
      // una dipendenza fuori dall'insieme da rinviare è già soddisfatta: quella
      // parte non verrà inviata affatto.
      const owners = p.getErrorCarriedForwardReplacements().map((r) => ownerOf.get(r.part));
      const ready = owners.every((owner) => owner === undefined || done.has(owner.path));
      if (ready) {
        out.push(p);
        done.add(p.path);
        remaining.splice(i, 1);
        progress = true;
      } else {
        i += 1;
      }
    }
  }
  return out.concat(remaining);
}

/** Riapplica uno stato salvato a una domanda appena caricata con lo stesso
 * seme: rimette le risposte, rinvia le parti già risposte e ripristina i flag
 * di livello domanda. */
export function applyQuestionState(q: StatefulQuestion, state: QuestionState): void {
  const byPath = new Map<string, PartState>();
  for (const ps of state.parts) {
    byPath.set(ps.path, ps);
  }
  for (const part of q.parts) {
    const ps = byPath.get(part.path);
    if (ps) {
      restoreAnswers(part, ps);
    }
  }
  // question.js:1004-1033: si rinviano solo le parti che risultavano risposte.
  const toSubmit = q.parts.filter((p) => byPath.get(p.path)?.answered);
  for (const part of orderPartsForResubmission(toSubmit)) {
    part.submit();
  }
  q.submitted = state.submitted;
  // question.js:1050-1056
  if (state.revealed) {
    q.revealAnswer();
  } else if (state.adviceDisplayed) {
    q.getAdvice();
  }
  q.updateScore();
}
