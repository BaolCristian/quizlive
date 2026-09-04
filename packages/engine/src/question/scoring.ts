/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// question.js:1291-1447 — `validate` (1297-1316), `isDirty` (1321-1331),
// `calculateScore` (1350-1408), `submit` (1413-1431), `updateScore`
// (1437-1447).
//
// upstream: `validate` e `calculateScore` hanno un secondo ramo per
// `partsMode: 'explore'` (question.js:1303-1315 e 1363-1401, che sommano per
// obiettivo e sottraggono le penalità), e `updateScore`/`submit` notificano
// `exam`, `display` e `store`. Niente di tutto questo è portato: la modalità
// "explore" è rifiutata al caricamento (decisione 1 del brief) e non c'è né
// display né storage. Vedi DIVERGENCES.md.

import type { PartBase } from "../parts";

/** Il punteggio di una domanda. */
export interface QuestionScore {
  /** Il punteggio ottenuto. */
  score: number;
  /** Il punteggio massimo. */
  marks: number;
}

// question.js:1297-1305, solo il ramo `case 'all'`
/** Tutte le parti sono state risposte (o non valgono punti)? */
export function validate(parts: PartBase[]): boolean {
  let success = true;
  for (const p of parts) {
    success = success && (p.answered || p.marks === 0);
  }
  return success;
}

// question.js:1321-1331
/** Qualcosa è cambiato dall'ultimo invio? */
export function isDirty(parts: PartBase[], revealed: boolean): boolean {
  if (revealed) {
    return false;
  }
  return parts.some((p) => p.isDirty);
}

// question.js:1350-1362, solo il ramo `case 'all'`
/** Somma punteggio e punti massimi delle parti di primo livello. */
export function calculateScore(parts: PartBase[]): QuestionScore {
  let score = 0;
  let marks = 0;
  for (const part of parts) {
    score += part.score;
    marks += part.marks;
  }
  return { score: score, marks: marks };
}

// question.js:1413-1431, senza `events` e `store`
/** Invia tutte le parti e riporta se la domanda risulta risposta. */
export function submitAllParts(parts: PartBase[]): boolean {
  for (const p of parts) {
    p.submit();
  }
  return validate(parts);
}
