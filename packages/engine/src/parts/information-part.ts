/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/information.js:27-71 — la parte "solo informazione": nessuna
// risposta, nessuna correzione. `initDisplay` (46-48) non è portata.

import type { Scope } from "../jme/scope";
import type { Token } from "../jme/tokens";
import { registerPartType } from "./create-part";
import { PartBase } from "./part-base";
import type { Answer } from "./types";

/** Una parte che non chiede niente allo studente (information.js:27-65). */
export class InformationPart extends PartBase {
  // information.js:65
  override doesMarking = false;

  // information.js:30-36 — non incrementa il contatore delle etichette, a
  // meno che l'autore non abbia scelto un nome.
  override assignName(index: number, siblings: number): boolean {
    if (this.useCustomName) {
      super.assignName(index, siblings);
    }
    return false;
  }

  // information.js:42-45
  override finaliseLoad(): void {
    super.finaliseLoad();
    this.answered = true;
    this.isDirty = false;
  }

  // information.js:57-61 — questa parte non è mai "sporca".
  override setDirty(): void {
    this.isDirty = false;
  }

  // information.js:62-64
  override hasStagedAnswer(): boolean {
    return true;
  }

  /** Non c'è una risposta corretta da calcolare. */
  override getCorrectAnswer(_scope: Scope): Answer {
    void _scope;
    return null;
  }

  /** Non c'è una risposta da congelare. */
  override setStudentAnswer(): void {
    // niente da fare
  }

  /** Non c'è una risposta da passare all'algoritmo di correzione. */
  override rawStudentAnswerAsJME(): Token | undefined {
    return undefined;
  }
}

// information.js:71
registerPartType("information", InformationPart);
