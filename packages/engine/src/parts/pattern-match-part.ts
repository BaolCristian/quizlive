/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/patternmatch.js:28-152 — la parte "corrispondenza testuale". Non
// portati: `loadFromXML` (32-44), `initDisplay`/`resume` (55-64),
// `input_widget`/`input_options` (99-114).

import type { Scope } from "../jme/scope";
import { subvars } from "../jme/subvars";
import { TString, type Token } from "../jme/tokens";
import { MarkingScript } from "../marking/marking-script";
import { markingScripts } from "../marking/scripts";
import { registerPartType } from "./create-part";
import { PartBase, tryLoad } from "./part-base";
import type { Answer, BasePartSettings, PartJSON } from "./types";

/** Le impostazioni di una parte `patternmatch` (patternmatch.js:65-98). */
export type PatternMatchSettings = BasePartSettings & {
  /** Il pattern corretto, prima della sostituzione delle variabili. */
  correctAnswerString: string;
  /** Il pattern corretto, con le variabili sostituite (e, in modalità
   * `regex`, ancorato con `^`/`$`). */
  correctAnswer: string;
  /** La risposta mostrata al reveal, prima della sostituzione. */
  displayAnswerString: string;
  /** La risposta mostrata al reveal. */
  displayAnswer: string;
  /** Le maiuscole contano? */
  caseSensitive: boolean;
  /** Lo studente può inviare una risposta vuota? */
  allowEmpty: boolean;
  /** Il credito se la risposta combacia a meno delle maiuscole. */
  partialCredit: number;
  /** `regex` (espressione regolare) o `exact` (uguaglianza letterale). */
  matchMode: "regex" | "exact";
};

/** La parte in cui la risposta è confrontata con un pattern
 * (patternmatch.js:28). */
export class PatternMatchPart extends PartBase {
  /** L'ultima risposta inviata dallo studente. */
  studentAnswer: string | undefined = "";
  declare settings: PatternMatchSettings & Record<string, unknown>;

  constructor(...args: ConstructorParameters<typeof PartBase>) {
    super(...args);
    // patternmatch.js:28-31 (`util.copyinto`)
    Object.assign(this.settings, {
      correctAnswerString: ".*",
      correctAnswer: ".*",
      displayAnswerString: "",
      displayAnswer: "",
      caseSensitive: false,
      allowEmpty: false,
      partialCredit: 0,
      matchMode: "regex",
    });
  }

  // patternmatch.js:117-124
  override baseMarkingScript(): MarkingScript {
    return new MarkingScript(markingScripts.patternmatch, undefined, this.getScope());
  }

  // patternmatch.js:45-51
  override loadFromJSON(data: PartJSON): void {
    super.loadFromJSON(data);
    const settings = this.settings as unknown as Record<string, unknown>;
    tryLoad(data, ["answer", "displayAnswer"], settings, ["correctAnswerString", "displayAnswerString"]);
    tryLoad(data, ["caseSensitive", "partialCredit", "matchMode", "allowEmpty"], settings);
    this.settings.partialCredit /= 100;
  }

  // patternmatch.js:52-54
  override finaliseLoad(): void {
    super.finaliseLoad();
    this.getCorrectAnswer(this.getScope());
  }

  // patternmatch.js:120-133
  override getCorrectAnswer(scope: Scope): Answer {
    const settings = this.settings;
    settings.correctAnswer = subvars(settings.correctAnswerString, scope, true);
    switch (settings.matchMode) {
      case "regex":
        settings.correctAnswer = "^" + settings.correctAnswer + "$";
        settings.displayAnswer = subvars(settings.displayAnswerString, scope, true);
        break;
      case "exact":
        settings.displayAnswer = settings.correctAnswer;
        break;
    }
    return settings.displayAnswer;
  }

  // patternmatch.js:136-138 — nessuna pulizia, a differenza di `numberentry`.
  override setStudentAnswer(): void {
    this.studentAnswer = this.stagedAnswer as string | undefined;
  }

  // patternmatch.js:145-147
  override rawStudentAnswerAsJME(): Token | undefined {
    return new TString(this.studentAnswer as string);
  }
}

// patternmatch.js:147-152
registerPartType("patternmatch", PatternMatchPart);
