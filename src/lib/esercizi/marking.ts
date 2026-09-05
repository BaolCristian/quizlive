import {
  loadQuestion, restoreQuestion,
  type NumbasQuestionJSON, type QuestionState, type MarkingResult, type Locale,
} from "@savint/engine";

export interface EsitoRicalcolo {
  score: number;
  maxScore: number;
  state: QuestionState;
  feedback: { path: string; items: MarkingResult["feedback"] }[];
}

/** Ricostruisce la domanda dal seme del tentativo e riapplica lo stato che il
 * client dichiara, poi legge il punteggio dal motore. Il seme del tentativo
 * vince sempre su quello dentro lo stato: è il server a decidere quale
 * domanda lo studente sta risolvendo. */
export function ricalcola(
  content: unknown,
  seed: string,
  state: QuestionState | null,
  locale: Locale,
): EsitoRicalcolo {
  const json = content as NumbasQuestionJSON;
  const q = state
    ? restoreQuestion(json, { ...state, seed }, { locale })
    : loadQuestion(json, { seed, locale });

  q.updateScore();
  const punteggio = q.score();

  return {
    score: punteggio.score,
    maxScore: punteggio.marks,
    state: q.toState(),
    feedback: q.allParts().map((p) => ({ path: p.path, items: p.result?.feedback ?? [] })),
  };
}
