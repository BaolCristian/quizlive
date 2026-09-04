/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Sostituto di `Numbas.Error` (runtime/scripts/numbas.js:82-95), la classe che
// upstream lancia da OGNI livello: `math.js`, `util.js`, `jme.js`, `part.js`.
// Qui il modulo sta sotto tutti gli altri — dipende solo da `i18n/` — perché
// `math/` non può importare `jme/` (l'inverso sì).
//
// La chiave è una stringa puntata stabile (`'math.order complex numbers'`) e
// la traduzione avviene nel costruttore, come upstream. I test upstream
// confrontano `e.originalMessage`, cioè la chiave non tradotta: qui è
// `err.key`.

import { t, type Locale, type Params } from "./i18n";

/** Un errore del motore identificato da una chiave stabile.
 *
 * `message` è la chiave già tradotta nella lingua predefinita del processo,
 * come `Numbas.Error`; chi deve mostrarlo in un'altra lingua lo ricostruisce
 * da `key`/`params` con `errorMessageIn`. */
export class EngineError extends Error {
  /** La chiave upstream, es. `"jme.shunt.no left bracket"`. Stabile fra le
   * lingue: è questa che i test confrontano. */
  readonly key: string;
  /** I parametri di interpolazione passati al messaggio. */
  readonly params: Params | undefined;
  /** L'errore che ha causato questo, se c'è (upstream: terzo argomento di
   * `Numbas.Error`, letto come `e.originalError`). */
  readonly originalError: unknown;

  constructor(key: string, params?: Params, originalError?: unknown) {
    super(t(key, params));
    this.name = "EngineError";
    this.key = key;
    this.params = params;
    this.originalError = originalError;
  }
}

/** Un errore lanciato da `math/`: le stesse chiavi upstream (`math.*`,
 * `matrixmath.*`, `vectormath.*`, e le tre `util.*` che il port tiene in
 * `math/`).
 *
 * upstream sono `new Numbas.Error(chiave)` come tutti gli altri; la classe
 * separata serve solo a dire da quale strato viene l'errore, perché
 * `math/` sta sotto `jme/` e non può usarne la classe. */
export class MathError extends EngineError {
  constructor(key: string, params?: Params, originalError?: unknown) {
    super(key, params, originalError);
    this.name = "MathError";
  }
}

/** Le chiavi d'errore accumulate risalendo la catena di `originalError`.
 *
 * Sostituisce `e.originalMessages` upstream (part.js:783-789, question.js:
 * 249-260), che `Numbas.Error` accumula nel costruttore: qui l'errore conserva
 * la causa e la catena si ricostruisce risalendola. Un errore che non viene
 * dal motore dà la lista vuota. */
export function engineErrorKeys(e: unknown): string[] {
  const keys: string[] = [];
  let cur: unknown = e;
  while (cur instanceof EngineError) {
    keys.push(cur.key);
    cur = cur.originalError;
  }
  return keys;
}

/** Il messaggio di un errore qualsiasi, reso nella lingua data.
 *
 * Gli errori del motore traducono nel costruttore, come `Numbas.Error`, quindi
 * `e.message` è nella lingua predefinita del processo al momento del lancio.
 * Chi deve mostrare quel testo a uno studente lo ricostruisce da `key` e
 * `params` nella lingua giusta — il contratto documentato della classe. Con
 * `locale` assente il risultato coincide con `e.message`. */
export function errorMessageIn(e: unknown, locale?: Locale): string {
  if (e instanceof EngineError) {
    return t(e.key, e.params, locale);
  }
  return e instanceof Error ? e.message : String(e);
}
