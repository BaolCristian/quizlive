/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// I tipi pubblici del modulo `parts/`: la forma del JSON di una parte
// (part.js:306-354 più i campi per tipo, inventario 05 §5), la risposta dello
// studente e il risultato della correzione.

import type { Scope } from "../jme/scope";
import type { VariablesTodo } from "../variables/generate";

/** I tipi di parte in ambito (inventario 05 §5).
 *
 * `matrixentry`, `extension` e i tipi di parte custom non sono portati
 * (decisione 3 del design doc). */
export type PartType =
  | "numberentry"
  | "1_n_2"
  | "m_n_2"
  | "m_n_x"
  | "patternmatch"
  | "gapfill"
  | "jme"
  | "information";

/** La risposta dello studente a una parte.
 *
 * Per tipo:
 * - `numberentry`, `patternmatch`, `jme` → `string`;
 * - `1_n_2` → `number` (l'indice della scelta) oppure la matrice `ticks`;
 * - `m_n_2` → `boolean[]` (una per scelta) oppure la matrice `ticks`;
 * - `m_n_x` → `boolean[][]` indicizzato `[scelta][risposta]`, oppure la
 *   matrice `ticks` upstream, indicizzata `[risposta][scelta]`;
 * - `gapfill` → `Answer[]`, una per gap;
 * - `information` → nessuna (`null`).
 *
 * Le due forme delle scelte multiple sono distinte dalla forma del valore in
 * `MultipleResponsePart#storeAnswer` (risoluzione 1 del Task 8): i fixture
 * `unitTests` upstream usano la matrice `ticks`, l'API pubblica la forma
 * "naturale". */
export type Answer = string | number | boolean[] | boolean[][] | Answer[] | null;

/** Una voce di feedback come la vede chi consuma il motore. */
export interface FeedbackItemPublic {
  /** Il genere della voce. */
  type: "correct" | "incorrect" | "warning" | "info";
  /** Il messaggio da mostrare. */
  message: string;
}

/** Il risultato della correzione di una parte. */
export interface MarkingResult {
  /** Il punteggio ottenuto (`credit * marks`, con i limiti applicati). */
  score: number;
  /** Il punteggio massimo disponibile. */
  marks: number;
  /** La quota di punteggio ottenuta, fra 0 e 1. */
  credit: number;
  /** La risposta è del tutto corretta? (`credit >= 1`, decisione 4). */
  correct: boolean;
  /** La risposta era correggibile? (`false` = da correggere e rinviare). */
  valid: boolean;
  /** Le voci di feedback: `markingFeedback` seguito da `warnings`. */
  feedback: FeedbackItemPublic[];
}

/** Una regola di sostituzione di variabile per il marking adattivo
 * (part.js:444-452). */
export interface VariableReplacementJSON {
  /** Il nome della variabile da sostituire. */
  variable: string;
  /** Il percorso della parte da cui prendere la risposta. */
  part: string;
  /** La parte riferita deve essere già stata risposta? */
  must_go_first?: boolean;
}

/** Il JSON di definizione di una parte (part.js:306-354 per i campi comuni,
 * inventario 05 §5 per quelli di ciascun tipo).
 *
 * Campi riconosciuti ma IGNORATI in questo port:
 * - `steps` / `stepsPenalty` / `showStepsLabel`: la feature "step" non è
 *   portata (decisione 2 del brief); il campo produce un `console.warn`.
 * - `scripts`: JavaScript arbitrario iniettato dalla domanda (part.js:508-548).
 * - `nextParts`, `exploreObjective`, `suggestGoingBack`: modalità "explore".
 * - `marks` su una parte `gapfill`: il punteggio è sempre la somma dei gap
 *   (`gapfill.js:110`, inventario §11.7). */
export interface PartJSON {
  /** Il tipo di parte. */
  type: PartType;
  /** Il punteggio massimo. Ignorato per `gapfill`. */
  marks?: number | string;
  /** Il testo della domanda (usato dal Task 9, non da `part.js`). */
  prompt?: string;
  /** Usare `customName` invece del nome generato? */
  useCustomName?: boolean;
  /** Il nome scelto dall'autore. */
  customName?: string;
  /** Mostrare la risposta corretta al reveal? */
  showCorrectAnswer?: boolean;
  /** Mostrare l'icona ✓/✗ e le voci di feedback legate al credito? */
  showFeedbackIcon?: boolean;
  /** Uno script di correzione JME che sostituisce o estende quello di base. */
  customMarkingAlgorithm?: string;
  /** `customMarkingAlgorithm` estende lo script incorporato del tipo? */
  extendBaseMarkingAlgorithm?: boolean;
  /** Le sostituzioni di variabile per il marking adattivo. */
  variableReplacements?: VariableReplacementJSON[];
  /** Provare prima senza sostituzioni, o sostituire sempre? */
  variableReplacementStrategy?: "originalfirst" | "alwaysreplace";
  /** Punti tolti se il marking adattivo è stato usato. */
  adaptiveMarkingPenalty?: number;
  /** Condizione JME perché la risposta a questa parte "conti" nel marking
   * adattivo di un'altra. */
  adaptiveMarkingUseCondition?: string;
  /** Messaggio mostrato se la condizione non è soddisfatta. */
  adaptiveMarkingNotUsedMessage?: string;
  /** Parti alternative: la correzione sceglie quella che dà più credito. */
  alternatives?: PartJSON[];
  /** Mostrare tutto il feedback dell'alternativa usata? */
  useAlternativeFeedback?: boolean;
  /** Il messaggio mostrato se un'alternativa viene usata. */
  alternativeFeedbackMessage?: string;
  /** Punteggio minimo assegnabile. */
  minMarks?: number;
  /** Test incorporati nel JSON (formato upstream, inventario §8.3). */
  unitTests?: unknown[];
  /** Gli altri campi, specifici del tipo di parte. */
  [k: string]: unknown;
}

/** Le impostazioni di una parte, già valutate nello scope della domanda. */
export type PartSettings = Record<string, unknown>;

/** Le impostazioni comuni a tutte le parti (part.js:750-766). */
export type BasePartSettings = {
  /** Punti tolti mostrando gli step. Ignorato: gli step non sono portati. */
  stepsPenalty: number;
  /** C'è un limite inferiore al punteggio? */
  enableMinimumMarks: boolean;
  /** Il punteggio minimo assegnabile. */
  minimumMarks: number;
  /** Mostrare la risposta corretta al reveal? */
  showCorrectAnswer: boolean;
  /** Mostrare l'icona ✓/✗? Se `false`, le voci di credito non finiscono in
   * `markingFeedback` (inventario §9). */
  showFeedbackIcon: boolean;
  /** La parte ha regole di sostituzione di variabile? */
  hasVariableReplacements: boolean;
  /** `'originalfirst'` o `'alwaysreplace'`. */
  variableReplacementStrategy: "originalfirst" | "alwaysreplace";
  /** Punti tolti se il marking adattivo è usato. */
  adaptiveMarkingPenalty: number;
  /** Condizione JME per usare questa parte nel marking adattivo. */
  adaptiveMarkingUseCondition: string;
  /** Messaggio se la condizione non è soddisfatta. */
  adaptiveMarkingNotUsedMessage: string;
  /** Mostrare tutto il feedback di un'alternativa? */
  useAlternativeFeedback: boolean;
  /** Le sostituzioni di variabile per il marking adattivo. */
  errorCarriedForwardReplacements: VariableReplacementJSON[];
};

/** Quel che una parte chiede alla domanda che la contiene.
 *
 * Il Task 9 fornisce l'oggetto vero; qui basta la forma. Il brief tipizzava
 * `questionRef?: unknown`: un'interfaccia strutturale è equivalente per chi
 * costruisce le parti e toglie i cast dentro il modulo. */
export interface PartQuestion {
  /** La parte all'indirizzo dato. */
  getPart(path: string): unknown;
  /** Il grafo delle variabili della domanda, per `remakeVariables`. */
  variablesTodo?: VariablesTodo;
  /** I nomi definiti dalla domanda (variabili, funzioni, ruleset). */
  local_definitions?: { variables?: string[]; functions?: string[]; rulesets?: string[] };
  /** Lo scope della domanda. */
  scope?: Scope;
  /** Il numero della domanda, usato per `full_path`. */
  number?: number;
  /** Le parti della domanda, per percorso. */
  partDictionary?: Record<string, unknown>;
  /** Ricalcola il punteggio della domanda. */
  updateScore?(): void;
}

/** Il contesto in cui una parte vive: lo scope JME da cui parte la sua catena
 * e, se c'è, la domanda che la contiene. */
export interface PartContext {
  /** Lo scope genitore delle valutazioni JME della parte. */
  scope: Scope;
  /** La domanda che contiene la parte, se c'è. */
  questionRef?: PartQuestion | undefined;
}
