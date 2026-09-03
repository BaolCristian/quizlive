/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/multipleresponse.js:34-843 — l'unica classe che serve i tre tipi a
// scelta multipla (`1_n_2`, `m_n_2`, `m_n_x`), come upstream. La matrice dei
// punteggi e la griglia stanno in `multiple-response-matrix.ts`.
//
// Non portati: `loadFromXML` (40-254), `resume` (336-355), `initDisplay` (488),
// `input_widget`/`input_options` (554-584), `revealAnswer` (790-802, mostra i
// distrattori: è UI).

import { castToType, isType, unwrapValue, wrapValue } from "../jme/evaluate";
import type { Scope } from "../jme/scope";
import { subvars } from "../jme/subvars";
import { TBool, TList, TNum, type Token } from "../jme/tokens";
import { deal, parseNumber, range } from "../math";
import { MarkingScript } from "../marking/marking-script";
import { markingScripts } from "../marking/scripts";
import { registerPartType } from "./create-part";
import { buildLayout, computeMarkingMatrix, transposeRaw } from "./multiple-response-matrix";
import { PartBase, tryGet, tryLoad } from "./part-base";
import type { Answer, BasePartSettings, PartJSON } from "./types";

/** Le impostazioni di una parte a scelta multipla
 * (multipleresponse.js:537-552). */
export type MultipleResponseSettings = BasePartSettings & {
  /** `sum ticked cells`, `score per matched cell` o `all-or-nothing`. */
  markingMethod: string;
  /** Il minimo di risposte da scegliere, prima della sostituzione. */
  minAnswersString: string;
  /** Il massimo di risposte da scegliere, prima della sostituzione. */
  maxAnswersString: string;
  /** Il minimo di risposte da scegliere. */
  minAnswers: number;
  /** Il massimo di risposte da scegliere; `0` significa "illimitato". */
  maxAnswers: number;
  /** Mescolare l'ordine delle scelte? */
  shuffleChoices: boolean;
  /** Mescolare l'ordine delle risposte? */
  shuffleAnswers: boolean;
  /** La matrice dei punteggi, indicizzata `[risposta][scelta]`. */
  matrix: number[][];
  /** La combinazione perfetta di spunte, per il reveal. */
  maxMatrix: boolean[][];
  /** La matrice dei punteggi come espressione JME. */
  markingMatrixString: string;
  /** La matrice dei punteggi come array di celle. */
  markingMatrixArray: unknown[][];
  /** Come mostrare le opzioni: `radiogroup`, `checkbox`, `dropdownlist`, ... */
  displayType: string;
  /** Cosa fare se lo studente sceglie il numero sbagliato di opzioni. */
  warningType: "none" | "prevent" | "warn";
  /** La forma della griglia, per `m_n_x`. */
  layoutType: string;
  /** L'espressione che definisce la griglia, se `layoutType` è `expression`. */
  layoutExpression: string;
  /** La forma della nota `interpreted_answer`. */
  interpretedAnswerForm: string;
  /** I testi delle scelte. */
  choices: string[];
  /** I testi delle risposte. */
  answers: string[];
  /** Il messaggio mostrato per ogni cella sbagliata. */
  distractors: string[][];
};

/** La parte a scelta multipla: `1_n_2` (una fra n), `m_n_2` (più fra n),
 * `m_n_x` (abbina scelte e risposte). */
export class MultipleResponsePart extends PartBase {
  /** Le spunte dello studente, indicizzate `[risposta][scelta]`. */
  ticks: boolean[][] = [];
  /** Quante scelte (colonne) ci sono. */
  numChoices = 0;
  /** Quante risposte (righe) ci sono. */
  numAnswers = 0;
  /** `1_n_2` e `m_n_2` scambiano "scelta" e "risposta" nello schema JSON
   * storico (multipleresponse.js:260-264). */
  flipped = false;
  /** La permutazione delle scelte. */
  shuffleChoices: number[] = [];
  /** La permutazione delle risposte. */
  shuffleAnswers: number[] = [];
  /** La griglia delle celle mostrate, `[risposta][scelta]`. */
  layout: boolean[][] = [];
  declare settings: MultipleResponseSettings & Record<string, unknown>;

  constructor(...args: ConstructorParameters<typeof PartBase>) {
    super(...args);
    // multipleresponse.js:34-38 (`util.copyinto`)
    Object.assign(this.settings, {
      markingMethod: "sum ticked cells",
      minAnswersString: "0",
      maxAnswersString: "0",
      minAnswers: 0,
      maxAnswers: 0,
      shuffleChoices: false,
      shuffleAnswers: false,
      matrix: [],
      maxMatrix: [],
      markingMatrixString: "",
      markingMatrixArray: [],
      displayType: "radiogroup",
      warningType: "none",
      layoutType: "all",
      layoutExpression: "",
      interpretedAnswerForm: "list of list of boolean",
      choices: [],
      answers: [],
      distractors: [],
    });
  }

  // multipleresponse.js:494-502
  override baseMarkingScript(): MarkingScript {
    return new MarkingScript(markingScripts.multipleresponse, undefined, this.getScope());
  }

  // multipleresponse.js:255-335
  override loadFromJSON(data: PartJSON): void {
    super.loadFromJSON(data);
    const settings = this.settings as unknown as Record<string, unknown>;
    const scope = this.getScope();
    this.flipped = this.type === "1_n_2" || this.type === "m_n_2";
    if (this.type !== "1_n_2") {
      tryLoad(data, ["maxMarks"], this as unknown as Record<string, unknown>, ["marks"]);
    }
    tryLoad(data, ["showCellAnswerState", "interpretedAnswerForm"], settings);
    tryLoad(data, ["minMarks", "markingMethod"], settings, ["minimumMarks", "markingMethod"]);
    tryLoad(
      data,
      ["minAnswers", "maxAnswers", "shuffleChoices", "shuffleAnswers", "displayType", "displayColumns", "showBlankOption"],
      settings,
      ["minAnswersString", "maxAnswersString", "shuffleChoices", "shuffleAnswers", "displayType", "displayColumns", "showBlankOption"],
    );
    tryLoad(data, ["warningType"], settings);
    tryLoad(data["layout"] as Record<string, unknown> | undefined, ["type", "expression"], settings, [
      "layoutType",
      "layoutExpression",
    ]);
    if ("choices" in data) {
      const choices = data["choices"];
      if (typeof choices === "string") {
        const v = scope.evaluate(choices);
        if (!v || !isType(v, "list")) {
          this.error("part.mcq.options def not a list", { properties: "choice" });
        }
        this.settings.choices = unwrapValue(castToType(v, "list")) as string[];
      } else {
        this.settings.choices = choices as string[];
      }
      this.numChoices = this.settings.choices.length;
    }
    if ("answers" in data) {
      const answers = data["answers"];
      if (typeof answers === "string") {
        const v = scope.evaluate(answers);
        if (!v || !isType(v, "list")) {
          this.error("part.mcq.options def not a list", { properties: "answer" });
        }
        this.settings.answers = unwrapValue(castToType(v, "list")) as string[];
      } else {
        this.settings.answers = answers as string[];
      }
      this.numAnswers = this.settings.answers.length;
    }
    if (this.flipped) {
      this.numAnswers = 1;
    }
    const matrix = data["matrix"];
    if (typeof matrix === "string") {
      this.settings.markingMatrixString = matrix;
    } else {
      let rows = (matrix as unknown[]).map((row) => (typeof row === "object" && row !== null ? (row as unknown[]) : [row]));
      if (!this.flipped) {
        // multipleresponse.js:300-312: le dimensioni dichiarate prima della
        // trasposizione sono `numChoices × numAnswers`.
        rows = transposeRaw(rows, this.numChoices, this.numAnswers);
      }
      this.settings.markingMatrixArray = rows;
    }
    if (this.flipped) {
      this.numAnswers = this.numChoices;
      this.numChoices = 1;
    }
    const distractors = tryGet(data, "distractors") as unknown[] | undefined;
    if (distractors) {
      this.settings.distractors =
        this.type === "1_n_2" || this.type === "m_n_2"
          ? (distractors as string[]).map((d) => [d])
          : (distractors as string[][]);
    }
    if (!this.settings.distractors || this.settings.distractors.length === 0) {
      const rows: string[][] = [];
      for (let i = 0; i < this.numAnswers; i++) {
        const row: string[] = [];
        for (let j = 0; j < this.numChoices; j++) {
          row.push("");
        }
        rows.push(row);
      }
      this.settings.distractors = rows;
    }
  }

  // multipleresponse.js:356-487
  override finaliseLoad(): void {
    super.finaliseLoad();
    const settings = this.settings;
    const scope = this.getScope();
    if (this.type === "m_n_2") {
      settings.displayType = "checkbox";
    }
    if (settings.displayType === "radiogroup") {
      settings.markingMethod = "sum ticked cells";
    }
    if (this.type === "1_n_2" || this.type === "m_n_2") {
      settings.shuffleAnswers = settings.shuffleChoices;
      settings.shuffleChoices = false;
    }
    // multipleresponse.js:370-381 — l'ORDINE conta: `deal(numChoices)` prima di
    // `deal(numAnswers)`, così a parità di seme il mescolamento è lo stesso
    // (inventario §9).
    this.shuffleChoices = settings.shuffleChoices ? deal(this.numChoices, scope.rng) : range(this.numChoices);
    this.shuffleAnswers = settings.shuffleAnswers ? deal(this.numAnswers, scope.rng) : range(this.numAnswers);
    this.marks = parseNumber(String(this.marks), false) || 0;
    settings.minimumMarks = parseNumber(String(settings.minimumMarks), false) || 0;
    const minAnswers = scope.evaluate(subvars(settings.minAnswersString, scope));
    try {
      settings.minAnswers = (castToType(minAnswers as Token, "number") as TNum).value as number;
    } catch {
      this.error("part.setting not present", { property: "minimum answers" });
    }
    const maxAnswers = scope.evaluate(subvars(settings.maxAnswersString, scope));
    try {
      settings.maxAnswers = (castToType(maxAnswers as Token, "number") as TNum).value as number;
    } catch {
      this.error("part.setting not present", { property: "maximum answers" });
    }
    this.layout = buildLayout(this, scope);
    if (this.type === "1_n_2") {
      settings.maxAnswers = 1;
    } else if (settings.maxAnswers === 0) {
      settings.maxAnswers = this.numAnswers * this.numChoices;
    }
    this.getCorrectAnswer(scope);
    if (this.marks === 0) {
      this.marks = this.computeMarksFromMatrix();
    }
    this.ticks = [];
    this.stagedAnswer = [];
    for (let i = 0; i < this.numAnswers; i++) {
      const trow: boolean[] = [];
      const srow: boolean[] = [];
      for (let j = 0; j < this.numChoices; j++) {
        trow.push(false);
        srow.push(false);
      }
      this.ticks.push(trow);
      (this.stagedAnswer as boolean[][]).push(srow);
    }
  }

  // multipleresponse.js:436-476
  /** Il punteggio massimo ottenibile, quando l'autore non lo dichiara: la
   * somma dei punteggi migliori ottenibili con al più `maxAnswers` spunte. */
  private computeMarksFromMatrix(): number {
    const matrix = this.settings.matrix;
    let flat: number[] = [];
    switch (this.type) {
      case "1_n_2":
      case "m_n_2":
        for (let i = 0; i < matrix.length; i++) {
          flat.push(Number((matrix[i] as number[])[0]));
        }
        break;
      case "m_n_x":
        if (this.settings.displayType === "radiogroup") {
          for (let i = 0; i < this.numChoices; i++) {
            const row: number[] = [];
            for (let j = 0; j < this.numAnswers; j++) {
              row.push(Number((matrix[j] as number[])[i]));
            }
            row.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
            flat.push(row[row.length - 1] as number);
          }
        } else {
          for (let i = 0; i < matrix.length; i++) {
            flat = flat.concat((matrix[i] as number[]).map(Number));
          }
        }
        break;
      default:
        break;
    }
    flat.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    let marks = 0;
    for (
      let i = flat.length - 1;
      i >= 0 && flat.length - 1 - i < this.settings.maxAnswers && (flat[i] as number) > 0;
      i--
    ) {
      marks += flat[i] as number;
    }
    return marks;
  }

  // multipleresponse.js:589-718
  override getCorrectAnswer(scope: Scope): Answer {
    computeMarkingMatrix(this, scope);
    return this.settings.maxMatrix;
  }

  // multipleresponse.js:804-810
  override markingParameters(rawAnswer: Token | undefined): Record<string, Token> {
    const obj = super.markingParameters(rawAnswer);
    obj["shuffleChoices"] = wrapValue(this.shuffleChoices);
    obj["shuffleAnswers"] = wrapValue(this.shuffleAnswers);
    obj["layout"] = wrapValue(this.layout);
    return obj;
  }

  /** Registra la risposta dello studente.
   *
   * Oltre alla matrice `ticks` upstream (`boolean[][]` indicizzata
   * `[risposta][scelta]`), accetta la forma pubblica documentata in `Answer`:
   * un indice per `1_n_2`, una lista di booleani per `m_n_2`, una matrice
   * `[scelta][risposta]` per `m_n_x` (risoluzione 1 del Task 8). Le due forme
   * si distinguono dalla forma del valore. */
  override storeAnswer(answer: Answer): void {
    super.storeAnswer(this.normaliseAnswer(answer));
  }

  /** Traduce le forme pubbliche nella matrice `ticks`. */
  private normaliseAnswer(answer: Answer): Answer {
    if (answer === null || answer === undefined) {
      return answer;
    }
    // 1_n_2: l'indice della scelta selezionata.
    if (typeof answer === "number") {
      return this.blankTicks().map((row, i) => row.map(() => i === answer));
    }
    if (!Array.isArray(answer)) {
      return answer;
    }
    // m_n_2: una lista di booleani, una per scelta.
    if (answer.every((x) => typeof x === "boolean")) {
      return (answer as boolean[]).map((x) => [x]);
    }
    if (!answer.every((x) => Array.isArray(x))) {
      return answer;
    }
    const grid = answer as boolean[][];
    // `m_n_x` accetta sia `[risposta][scelta]` (la matrice `ticks` upstream,
    // usata dai fixture `unitTests`) sia `[scelta][risposta]`. Sono
    // distinguibili solo quando le due dimensioni differiscono: a parità di
    // dimensioni si assume la matrice `ticks`, come upstream.
    if (
      this.type === "m_n_x" &&
      this.numAnswers !== this.numChoices &&
      grid.length === this.numChoices &&
      (grid[0]?.length ?? 0) === this.numAnswers
    ) {
      return transposeGrid(grid, this.numChoices, this.numAnswers);
    }
    return grid;
  }

  /** Una matrice di spunte tutte false, delle dimensioni della parte. */
  private blankTicks(): boolean[][] {
    const rows: boolean[][] = [];
    for (let i = 0; i < this.numAnswers; i++) {
      const row: boolean[] = [];
      for (let j = 0; j < this.numChoices; j++) {
        row.push(false);
      }
      rows.push(row);
    }
    return rows;
  }

  // multipleresponse.js:742-744
  override setStudentAnswer(): void {
    this.ticks =
      this.stagedAnswer === undefined
        ? this.ticks.map((row) => row.map(() => false))
        : (this.stagedAnswer as boolean[][]).map((row) => row.slice());
  }

  // multipleresponse.js:751-753
  override rawStudentAnswerAsJME(): Token | undefined {
    return wrapValue(this.ticks);
  }

  // multipleresponse.js:759-789
  override studentAnswerAsJME(): Token | undefined {
    const o: Token[] = [];
    switch (this.type) {
      case "1_n_2":
        for (let i = 0; i < this.numAnswers; i++) {
          if (this.ticks[i]?.[0]) {
            return new TNum(i);
          }
        }
        break;
      case "m_n_2":
        for (let i = 0; i < this.numAnswers; i++) {
          o.push(new TBool(this.ticks[i]?.[0] === true));
        }
        return new TList(o);
      case "m_n_x":
        switch (this.settings.displayType) {
          case "radiogroup":
            // upstream (multipleresponse.js:774-780) indicizza `ticks` con
            // `[choice][answer]`, al contrario di ogni altro uso: portato
            // com'è, vedi DIVERGENCES.md.
            for (let choice = 0; choice < this.numChoices; choice++) {
              for (let answer = 0; answer < this.numAnswers; answer++) {
                if (this.ticks[choice]?.[answer]) {
                  o.push(new TNum(answer));
                  break;
                }
              }
            }
            return new TList(o);
          case "checkbox":
            return wrapValue(this.ticks);
        }
        break;
      default:
        break;
    }
    return undefined;
  }
}

/** Traspone una griglia di booleani. */
function transposeGrid(grid: boolean[][], rows: number, columns: number): boolean[][] {
  const out: boolean[][] = [];
  for (let i = 0; i < columns; i++) {
    const row: boolean[] = [];
    for (let j = 0; j < rows; j++) {
      row.push(grid[j]?.[i] === true);
    }
    out.push(row);
  }
  return out;
}

// multipleresponse.js:840-843
registerPartType("1_n_2", MultipleResponsePart);
registerPartType("m_n_2", MultipleResponsePart);
registerPartType("m_n_x", MultipleResponsePart);
