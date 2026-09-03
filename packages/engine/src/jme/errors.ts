/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Sostituto di `Numbas.Error` (runtime/scripts/numbas.js:82-95): jme.js lancia
// sempre `new Numbas.Error(chiave, params?, originalError?)`, dove la chiave è
// una stringa puntata stabile (`'jme.shunt.no left bracket'`) e la traduzione
// avviene dentro il costruttore. I test upstream confrontano `e.originalMessage`
// (la chiave, non il testo tradotto): qui la chiave è `err.key`.

import { t, type Locale, type Params } from "../i18n";

export class JmeError extends Error {
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
    this.name = "JmeError";
    this.key = key;
    this.params = params;
    this.originalError = originalError;
  }
}

/** Il messaggio di un errore qualsiasi, reso nella lingua data.
 *
 * `JmeError` traduce nel costruttore, come `Numbas.Error` upstream, quindi
 * `e.message` è nella lingua predefinita del processo al momento del lancio.
 * Chi deve mostrare quel testo a uno studente lo ricostruisce da `key` e
 * `params` nella lingua giusta — che è il contratto documentato della classe.
 * Con `locale` assente il comportamento coincide con `e.message`. */
export function errorMessageIn(e: unknown, locale?: Locale): string {
  if (e instanceof JmeError) {
    return t(e.key, e.params, locale);
  }
  return e instanceof Error ? e.message : String(e);
}
