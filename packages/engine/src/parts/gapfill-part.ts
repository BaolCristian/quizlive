/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/gapfill.js:28-244 — la parte "riempi gli spazi": una parte madre che
// delega tutto ai gap, ciascuno una parte completa. Non portati:
// `loadFromXML` (45-56), `initDisplay` (79-81), `resume` (113-119),
// `revealAnswer` (142-151, UI), `lock` (231-235, UI).

import { wrapValue } from "../jme/evaluate";
import type { Scope } from "../jme/scope";
import { TList, type Token } from "../jme/tokens";
import { MarkingScript } from "../marking/marking-script";
import { markingScripts } from "../marking/scripts";
import { createPartFromJSON, registerPartType } from "./create-part";
import { PartBase, tryLoad } from "./part-base";
import type { Answer, BasePartSettings, PartJSON } from "./types";

/** Le impostazioni di una parte `gapfill` (gapfill.js:40-43). */
export type GapFillSettings = BasePartSettings & {
  /** Ordinare le risposte prima di correggerle? Richiede che tutti i gap
   * abbiano lo stesso tipo. */
  sortAnswers: boolean;
  /** Mostrare la risposta attesa accanto a ogni spazio? (solo UI) */
  inlineCorrectAnswer: boolean;
};

/** La parte con più spazi da riempire (gapfill.js:28). */
export class GapFillPart extends PartBase {
  /** Le risposte "congelate" dei gap. */
  studentAnswer: unknown[] = [];
  declare settings: GapFillSettings & Record<string, unknown>;

  constructor(...args: ConstructorParameters<typeof PartBase>) {
    super(...args);
    // gapfill.js:28-31 (`util.copyinto`)
    Object.assign(this.settings, {
      sortAnswers: false,
      inlineCorrectAnswer: true,
    });
  }

  // gapfill.js:135-141
  override baseMarkingScript(): MarkingScript {
    return new MarkingScript(markingScripts.gapfill, undefined, this.getScope());
  }

  // gapfill.js:57-68
  override loadFromJSON(data: PartJSON): void {
    super.loadFromJSON(data);
    tryLoad(data, ["sortAnswers", "inlineCorrectAnswer"], this.settings as unknown as Record<string, unknown>);
    const gaps = data["gaps"] as PartJSON[] | undefined;
    if (gaps) {
      gaps.forEach((gd, i) => {
        const gap = createPartFromJSON(i, gd, this.path + "g" + i, this.context(), this);
        this.addGap(gap, i);
      });
    }
  }

  // gapfill.js:69-78 — `sortAnswers` richiede gap tutti dello stesso tipo,
  // altrimenti è disattivato in silenzio.
  override finaliseLoad(): void {
    super.finaliseLoad();
    if (this.settings.sortAnswers && this.gaps.length) {
      const type = (this.gaps[0] as PartBase).type;
      if (this.gaps.some((g) => g.type !== type)) {
        this.settings.sortAnswers = false;
      }
    }
  }

  // gapfill.js:103-112
  /** Aggiunge un gap, sommandone i punti a quelli della parte. */
  addGap(gap: PartBase, index: number): void {
    gap.isGap = true;
    this.marks += gap.marks;
    this.gaps.splice(index, 0, gap);
  }

  // gapfill.js:83-100 — i punti disponibili sono SEMPRE la somma di quelli dei
  // gap (il campo JSON `marks` di un gapfill è ignorato, inventario §11.7).
  override availableMarks(): number {
    let marks = 0;
    for (const gap of this.gaps) {
      marks += gap.marks;
    }
    if (this.adaptiveMarkingUsed) {
      marks -= this.settings.adaptiveMarkingPenalty;
    }
    marks = Math.max(Math.min(this.marks, marks), 0);
    return marks;
  }

  // gapfill.js:126-134
  override hasStagedAnswer(): boolean {
    return this.gaps.some((g) => g.hasStagedAnswer());
  }

  // gapfill.js:152-166 — `undefined` se anche un solo gap non ha una risposta
  // rappresentabile.
  override rawStudentAnswerAsJME(): Token | undefined {
    if (this.gaps.some((g) => g.rawStudentAnswerAsJME() === undefined)) {
      return undefined;
    }
    return new TList(this.gaps.map((g) => g.rawStudentAnswerAsJME() as Token));
  }

  // gapfill.js:167-171
  override storeAnswer(answer: Answer): void {
    super.storeAnswer(answer);
    const answers = (answer ?? []) as Answer[];
    this.gaps.forEach((g, i) => {
      g.storeAnswer(answers[i] ?? null);
    });
  }

  // gapfill.js:172-177
  override setStudentAnswer(): void {
    this.studentAnswer = this.gaps.map((g) => {
      g.setStudentAnswer();
      return (g as unknown as { studentAnswer?: unknown }).studentAnswer;
    });
  }

  // gapfill.js:183-187
  override studentAnswerAsJME(): Token | undefined {
    return new TList(this.gaps.map((g) => g.studentAnswerAsJME() as Token));
  }

  // gapfill.js:189-193
  override getCorrectAnswer(scope: Scope): Answer {
    return this.gaps.map((g) => g.getCorrectAnswer(scope)) as Answer;
  }

  // gapfill.js:195-229 — l'ordine in cui i gap vanno corretti, con
  // rilevamento dei cicli fra le sostituzioni adattive.
  override markingParameters(rawAnswer: Token | undefined): Record<string, Token> {
    const parameters = super.markingParameters(rawAnswer);
    parameters["gap_adaptive_order"] = wrapValue(this.gapAdaptiveOrder());
    return parameters;
  }

  /** L'ordine di correzione dei gap: un gap che dipende da un altro (per
   * sostituzione di variabile) è corretto dopo di quello. Un ciclo è un
   * errore (`part.gapfill.cyclic adaptive marking`). */
  private gapAdaptiveOrder(): number[] {
    const adaptive_order: number[] = [];
    const visit = (g: PartBase | undefined, path: PartBase[]): void => {
      if (!g) {
        return;
      }
      const i = this.gaps.indexOf(g);
      if (i < 0) {
        return;
      }
      const pi = path.indexOf(g);
      if (pi >= 0) {
        this.error("part.gapfill.cyclic adaptive marking", {
          name1: g.name,
          name2: (path[pi + 1] ?? g).name,
        });
      }
      g.settings.errorCarriedForwardReplacements.forEach((vr) => {
        // upstream (gapfill.js:224) fa `p.question.getPart(...)` senza
        // controlli: fuori da una domanda andrebbe in `TypeError`.
        const other = this.question ? (this.question.getPart(vr.part) as PartBase | undefined) : undefined;
        visit(other, path.concat([g]));
      });
      if (adaptive_order.indexOf(i) === -1) {
        adaptive_order.push(i);
      }
    };
    this.gaps.forEach((g) => {
      visit(g, []);
    });
    return adaptive_order;
  }
}

// gapfill.js:237-244
registerPartType("gapfill", GapFillPart);
