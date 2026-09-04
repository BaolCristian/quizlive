/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Sostituto di `Numbas.Error` (runtime/scripts/numbas.js:82-95) per lo strato
// `jme/`: jme.js lancia sempre `new Numbas.Error(chiave, params?,
// originalError?)`, dove la chiave è una stringa puntata stabile
// (`'jme.shunt.no left bracket'`) e la traduzione avviene dentro il
// costruttore. I test upstream confrontano `e.originalMessage` (la chiave, non
// il testo tradotto): qui la chiave è `err.key`.
//
// La classe base sta in `src/errors.ts`, sotto `math/`: upstream è UNA sola
// classe per tutti gli strati, e `math/` non può importare da `jme/`.

import { EngineError } from "../errors";
import type { Params } from "../i18n";

export { errorMessageIn } from "../errors";

export class JmeError extends EngineError {
  constructor(key: string, params?: Params, originalError?: unknown) {
    super(key, params, originalError);
    this.name = "JmeError";
  }
}
