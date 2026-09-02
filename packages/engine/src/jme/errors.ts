/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Sostituto di `Numbas.Error` (runtime/scripts/numbas.js:82-95): jme.js lancia
// sempre `new Numbas.Error(chiave, params?, originalError?)`, dove la chiave è
// una stringa puntata stabile (`'jme.shunt.no left bracket'`) e la traduzione
// avviene dentro il costruttore. I test upstream confrontano `e.originalMessage`
// (la chiave, non il testo tradotto): qui la chiave è `err.key`.

import { t, type Params } from "../i18n";

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
