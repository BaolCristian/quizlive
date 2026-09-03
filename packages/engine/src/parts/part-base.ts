/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// part.js:145-216 (costruttore), 306-370 (`loadFromJSON`/`finaliseLoad`),
// 421-548 senza `setScript` (alternative, sostituzioni di variabile,
// `setMarkingScript`), 549-767 (proprietà di default, `assignName`), 774-800
// (`error`), 881-1065 (warning, `availableMarks`, `calculateScore`,
// `storeAnswer`, `getScope`), 1214-1381 (`submit`).
//
// NON portati (inventario 05 §7 e decisioni 2 e 6 del brief): `loadFromXML`,
// `resume`/`store`, `display`, `signals`/`events`, `setScript`/`applyScripts`,
// gli step, la modalità "explore", `wait_for_pre_submit`.

import { t, type Locale } from "../i18n";
import { JmeError, errorMessageIn } from "../jme/errors";
import { Scope } from "../jme/scope";
import { TBool, TNum, TString, type Token, type TScope } from "../jme/tokens";
import { normaliseName } from "../jme/tokenizer";
import { contentsubvars } from "../jme/subvars";
import { compile } from "../jme/parser";
import { castToType, isType } from "../jme/evaluate";
import { builtinScope } from "../jme/builtins";
import { Fraction, capitalise, letterOrdinal, niceNumber } from "../math";
import { feedback, type FeedbackFormat, type FeedbackItem, type FeedbackReason } from "../marking/feedback";
import type { FinalisedState } from "../marking/finalise-state";
import { MarkingScript, type MarkingScriptResult } from "../marking/marking-script";
// dall'indice, non da `variables/generate`: importare il modulo registra il
// builtin `make_variables` su `builtinScope`, di cui lo script di correzione
// `jme.jme` ha bisogno (nota `vset`).
import { remakeVariables } from "../variables";
import {
  addCredit,
  markingComment,
  multCredit,
  setCredit,
  subCredit,
  type MarkingFeedbackItem,
} from "./credit";
import { applyFeedback, markAnswer, markingParameters, markPart, type MarkResult } from "./mark";
import { markAdaptive, markAgainstScope, type MarkingResults, type PartScriptResult } from "./adaptive-marking";
// `create-part.ts` importa solo il TIPO `PartBase` (`import type`, cancellato
// a runtime): il grafo dei moduli resta aciclico nonostante l'import qui.
import { createPartFromJSON } from "./create-part";
import { nicePartName } from "./nice-part-name";
import type {
  Answer,
  BasePartSettings,
  FeedbackItemPublic,
  MarkingResult,
  PartContext,
  PartJSON,
  PartQuestion,
  PartType,
  VariableReplacementJSON,
} from "./types";

/** Il feedback già accumulato, ripristinato prima di ogni tentativo di
 * correzione (part.js:1722-1731). */
export interface ExistingFeedback {
  /** Gli avvisi. */
  warnings: string[];
  /** Le voci di feedback. */
  markingFeedback: MarkingFeedbackItem[];
}

// json.js:39-48
/** Il valore dell'attributo dato, provando anche il nome tutto minuscolo. */
export function tryGet(source: Record<string, unknown> | undefined, attr: string): unknown {
  if (!source) {
    return undefined;
  }
  if (attr in source) {
    return source[attr];
  }
  if (attr.toLowerCase() in source) {
    return source[attr.toLowerCase()];
  }
  return undefined;
}

// json.js:13-35
/** Copia gli attributi dati da `source` a `target`, forzando la coercizione al
 * tipo che il campo di destinazione ha già (stringa o numero). */
export function tryLoad(
  source: Record<string, unknown> | undefined,
  attrs: string | string[],
  target: Record<string, unknown>,
  altnames?: string | string[],
): void {
  if (!source) {
    return;
  }
  const names = typeof attrs === "string" ? [attrs] : attrs;
  const alts = altnames === undefined ? [] : typeof altnames === "string" ? [altnames] : altnames;
  for (let i = 0; i < names.length; i++) {
    const attr = names[i] as string;
    const target_attr = alts[i] || attr;
    let value = tryGet(source, attr);
    if (value !== undefined) {
      if (target_attr in target && typeof target[target_attr] === "string") {
        value = String(value);
      }
      if (target_attr in target && typeof target[target_attr] === "number") {
        value = parseFloat(value as string);
      }
      target[target_attr] = value;
    }
  }
}

/** Le chiavi d'errore accumulate risalendo la catena di `originalError`.
 *
 * Sostituisce `e.originalMessages` upstream (part.js:783-789), che
 * `Numbas.Error` accumula nel costruttore: qui `JmeError` conserva la causa,
 * e la catena si ricostruisce risalendola. */
export function partErrorKeys(e: unknown): string[] {
  const keys: string[] = [];
  let cur: unknown = e;
  while (cur instanceof JmeError) {
    keys.push(cur.key);
    cur = cur.originalError;
  }
  return keys;
}

/** Il messaggio di un errore, nella lingua data (v. `errorMessageIn`). */
function errorMessage(e: unknown, locale?: Locale): string {
  return errorMessageIn(e, locale);
}

/**
 * La base di ogni tipo di parte (part.js:145-216).
 *
 * Il credito è tenuto come frazione esatta in `creditFraction`; `credit` ne è
 * la proiezione in virgola mobile (part.js:203-215).
 */
export abstract class PartBase {
  /** L'indice della definizione della parte fra le sue sorelle. */
  readonly index: number;
  /** Il percorso della parte nella domanda, es. `p0g1`. */
  readonly path: string;
  /** Il tipo di parte: lo imposta `createPart`. */
  type: PartType = "information";
  /** Il nome mostrato allo studente. */
  name: string;
  /** Un percorso unico nell'esame, `q<n><path>`. */
  full_path: string;
  /** La domanda che contiene la parte, se c'è. */
  question: PartQuestion | undefined;
  /** La parte madre, se questa è un gap o un'alternativa. */
  parentPart: PartBase | undefined;
  /** Lo scope genitore da cui la parte costruisce il proprio. */
  protected readonly parentScope: Scope;

  /** La lingua dei messaggi della parte: quella del suo scope, cioè quella
   * della domanda che la contiene. `undefined` significa "la predefinita del
   * processo" (`getLocale()`), che è il caso di una parte costruita fuori da
   * una domanda. */
  get locale(): Locale | undefined {
    return this.parentScope.locale;
  }

  /** La parte è un gap di un `gapfill`? */
  isGap: boolean;
  /** La parte è uno step? (gli step non sono portati: sempre `false`). */
  isStep = false;
  /** La parte è un'alternativa di un'altra? */
  isAlternative = false;

  /** Il punteggio massimo dichiarato. */
  marks = 0;
  /** Il credito come frazione esatta. */
  creditFraction: Fraction = Fraction.zero;
  /** Il punteggio ottenuto. */
  score = 0;
  /** Le voci di feedback prodotte dall'ultima correzione. */
  markingFeedback: MarkingFeedbackItem[] = [];
  /** Il risultato grezzo dell'ultima correzione. */
  finalised_result: FinalisedState = { valid: false, credit: 0, states: [] };
  /** Gli avvisi mostrati accanto alla risposta. */
  warnings: string[] = [];
  /** La risposta è cambiata dall'ultimo invio? */
  isDirty = false;
  /** La risposta corretta è stata rivelata? (part.js:2238-2250) */
  revealed = false;
  /** La parte è bloccata: non accetta più risposte. (part.js:2256-2261) */
  locked = false;
  /** La risposta in attesa di invio. */
  stagedAnswer: unknown = undefined;
  /** La parte ha ricevuto una risposta correggibile? */
  answered = false;
  /** I gap, se questa è una parte `gapfill`. */
  gaps: PartBase[] = [];
  /** Gli step: sempre vuoto, la feature non è portata. */
  readonly steps: PartBase[] = [];
  /** Le parti alternative. */
  alternatives: PartBase[] = [];
  /** Il messaggio mostrato se questa parte è usata come alternativa. */
  alternativeFeedbackMessage = "";
  /** Questa parte assegna punteggio? `false` per `information`. */
  doesMarking = true;
  /** La correzione va rifatta perché una parte da cui dipende è cambiata. */
  shouldResubmit = false;
  /** La correzione in corso ha usato le sostituzioni di variabile? */
  adaptiveMarkingUsed = false;
  /** Una correzione è in corso su questa parte. */
  submitting = false;
  /** Le parti la cui correzione dipende dalla risposta a questa. */
  errorCarriedForwardBackReferences: Record<string, boolean> = {};
  /** Il valore della nota `interpreted_answer` dell'ultima correzione. */
  interpretedStudentAnswer: Token | undefined;
  /** I valori delle note dell'ultima correzione. */
  marking_values: Record<string, Token> = {};
  /** Il risultato grezzo dell'ultimo script di correzione. */
  script_result: PartScriptResult | undefined;
  /** L'alternativa scelta dall'ultima correzione, se ce n'è una. */
  best_alternative: PartBase | null = null;
  /** Il JSON da cui la parte è stata caricata. */
  json: PartJSON | undefined;
  /** Lo script di correzione. `undefined` se `doesMarking` è falso. */
  markingScript: MarkingScript | undefined;

  /** Le impostazioni della parte (part.js:750-766, estese per tipo). */
  settings: BasePartSettings & Record<string, unknown> = {
    stepsPenalty: 0,
    enableMinimumMarks: true,
    minimumMarks: 0,
    showCorrectAnswer: true,
    showFeedbackIcon: true,
    hasVariableReplacements: false,
    variableReplacementStrategy: "originalfirst",
    adaptiveMarkingPenalty: 0,
    adaptiveMarkingUseCondition: "",
    adaptiveMarkingNotUsedMessage: "",
    useAlternativeFeedback: false,
    errorCarriedForwardReplacements: [],
  };

  /** Il testo della consegna, come sta nel JSON.
   *
   * upstream `part.js` non legge mai il campo `prompt`: lo usano solo il tema
   * (che lo passa per `jme.contentsubvars`) e `exam-to-xml.js`. Qui il campo è
   * conservato grezzo perché l'API pubblica della spec lo prevede; la
   * sostituzione delle variabili è del Task 9, che ha lo scope della domanda
   * con le variabili già generate. */
  promptHtml = "";
  /** Usare `customName` invece del nome generato? */
  useCustomName = false;
  /** Il nome scelto dall'autore. */
  customName = "";

  /** Lo scope della parte, costruito su richiesta. */
  private scopeCache: Scope | undefined;
  /** Il risultato dell'ultimo `submit`. */
  private lastResult: MarkingResult | undefined;

  // part.js:158-216
  constructor(index: number, path: string, ctx: PartContext, parentPart?: PartBase) {
    this.index = index;
    this.path = path || "p0";
    this.question = ctx.questionRef;
    this.parentPart = parentPart;
    this.parentScope = ctx.scope;
    this.full_path = (this.question && this.question.number !== undefined ? "q" + this.question.number : "") + this.path;
    this.name = capitalise(nicePartName(this.path, this.locale));
    if (this.question && this.question.partDictionary) {
      this.question.partDictionary[this.path] = this;
    }
    this.isGap = /g\d+$/.test(this.path);
    this.isStep = /s\d+$/.test(this.path);
  }

  // part.js:203-215
  /** La quota di punteggio ottenuta, fra 0 e 1. */
  get credit(): number {
    return this.creditFraction.toFloat();
  }

  set credit(credit: number) {
    this.creditFraction = Fraction.fromFloat(credit);
  }

  /** Lo scope da cui la parte parte per le proprie valutazioni. */
  getParentScope(): Scope {
    return this.parentScope;
  }

  // ------------------------------------------------------------------
  // Caricamento
  // ------------------------------------------------------------------

  // part.js:310-354
  /** Legge i campi comuni dal JSON. Le sottoclassi la estendono chiamando
   * `super.loadFromJSON(data)` per prime, come `util.extend` upstream
   * (util.js:42-46: prima la base, poi la sottoclasse). */
  loadFromJSON(data: PartJSON): void {
    this.json = data;
    const self = this as unknown as Record<string, unknown>;
    tryLoad(data, ["marks", "useCustomName", "customName"], self);
    this.marks = parseFloat(String(this.marks));
    tryLoad(
      data,
      [
        "showCorrectAnswer",
        "showFeedbackIcon",
        "stepsPenalty",
        "variableReplacementStrategy",
        "adaptiveMarkingPenalty",
        "adaptiveMarkingUseCondition",
        "adaptiveMarkingNotUsedMessage",
        "useAlternativeFeedback",
      ],
      this.settings as Record<string, unknown>,
    );
    const variableReplacements = tryGet(data, "variableReplacements") as VariableReplacementJSON[] | undefined;
    if (variableReplacements) {
      variableReplacements.forEach((vr) => {
        this.addVariableReplacement(vr.variable, vr.part, vr.must_go_first === true);
      });
    }
    // decisione 2 del brief: gli step non sono portati. Il campo è
    // riconosciuto e ignorato, con un avviso una volta sola per parte.
    if ("steps" in data && Array.isArray(data["steps"]) && data["steps"].length > 0) {
      warnStepsIgnored(this.path, this.question);
    }
    const alternatives = tryGet(data, "alternatives") as PartJSON[] | undefined;
    if (alternatives) {
      alternatives.forEach((ad, i) => {
        const alternative = createPartFromJSON(i, ad, this.path + "a" + i, this.context(), this);
        this.addAlternative(alternative, i);
      });
    }
    tryLoad(data, "alternativeFeedbackMessage", self);
    // upstream `part.js` non legge MAI il campo `prompt` (lo usano solo il tema
    // e `exam-to-xml.js:658`): questa riga non ha un corrispettivo upstream, ma
    // l'API pubblica della spec vuole il testo sulla parte. Vedi DIVERGENCES.md.
    tryLoad(data, "prompt", self, "promptHtml");
    const marking: Record<string, unknown> = {};
    tryLoad(data, ["customMarkingAlgorithm", "extendBaseMarkingAlgorithm"], marking);
    this.setMarkingScript(marking["customMarkingAlgorithm"] as string | undefined, marking["extendBaseMarkingAlgorithm"] === true);
    // `scripts` (JavaScript iniettato) e `nextParts` (modalità explore) non
    // sono portati: inventario §7.
  }

  // part.js:357-370
  /** Chiude il caricamento. Le sottoclassi la estendono chiamando prima
   * `super.finaliseLoad()`. */
  finaliseLoad(): void {
    this.marks = this.marks || 0;
  }

  /** Il contesto da passare alle parti figlie (gap, alternative). */
  context(): PartContext {
    return { scope: this.parentScope, questionRef: this.question };
  }

  // part.js:439-443
  /** Aggiunge un'alternativa. */
  addAlternative(alternative: PartBase, index: number): void {
    alternative.isAlternative = true;
    this.alternatives.splice(index, 0, alternative);
  }

  // part.js:453-475
  /** Aggiunge una sostituzione di variabile per il marking adattivo. */
  addVariableReplacement(variable: string, part: string, must_go_first: boolean): void {
    if (part === this.path) {
      this.error("part.marking.adaptive variable replacement refers to self");
    }
    if (!part) {
      this.error("part.marking.adaptive variable replacement refers to nothing");
    }
    const vr: VariableReplacementJSON = {
      variable: normaliseName(variable, this.getScope()),
      part: part,
      must_go_first: must_go_first,
    };
    this.settings.hasVariableReplacements = true;
    this.settings.errorCarriedForwardReplacements.push(vr);
  }

  // part.js:481-484
  /** Lo script di correzione incorporato del tipo di parte. */
  baseMarkingScript(): MarkingScript | undefined {
    return undefined;
  }

  // part.js:491-507
  /** Imposta lo script di correzione, eventualmente estendendo quello di base
   * con `customMarkingAlgorithm`. */
  setMarkingScript(markingScriptString: string | undefined, extend_base: boolean): void {
    if (!this.doesMarking) {
      return;
    }
    let algo = this.baseMarkingScript();
    if (markingScriptString) {
      algo = new MarkingScript(markingScriptString, extend_base ? algo : undefined, this.getScope());
    }
    this.markingScript = algo;
    if (!algo) {
      return;
    }
    const requiredNotes = ["mark", "interpreted_answer"];
    requiredNotes.forEach((name) => {
      if (!(name in (algo as MarkingScript).notes)) {
        this.error("part.marking.missing required note", { note: name });
      }
    });
  }

  // part.js:588-621
  /** Assegna il nome alla parte e, ricorsivamente, ai figli. Ritorna `true` se
   * il nome deve far avanzare il contatore delle etichette. */
  assignName(index: number, siblings: number): boolean {
    if (this.useCustomName) {
      this.name = contentsubvars(this.customName, this.getScope(), false);
    } else if (this.isGap) {
      this.name = capitalise(t("gap", undefined, this.locale)) + " " + index;
    } else if (this.isStep && siblings > 0) {
      this.name = capitalise(t("step", undefined, this.locale)) + " " + index;
    } else if (siblings === 0) {
      this.name = "";
    } else {
      this.name = letterOrdinal(index) + ")";
    }
    const assign_child_names = (children: PartBase[]): void => {
      let i = 0;
      children.forEach((c) => {
        const hasName = c.assignName(i, children.length - 1);
        i += hasName ? 1 : 0;
      });
    };
    assign_child_names(this.gaps);
    assign_child_names(this.alternatives);
    return this.name !== "";
  }

  // part.js:782-793
  /** Lancia un errore attribuito a questa parte.
   *
   * upstream ri-lancia l'errore originale se era già un `part.error`; qui il
   * controllo è sulla catena di chiavi (`partErrorKeys`). */
  error(message: string, args?: Record<string, string | number>, originalError?: unknown): never {
    if (originalError && partErrorKeys(originalError)[0] === "part.error") {
      throw originalError;
    }
    const nmessage = t(message, args, this.locale);
    throw new JmeError(
      "part.error",
      { path: this.name, message: nmessage },
      originalError ?? new JmeError(message, args),
    );
  }

  // ------------------------------------------------------------------
  // Scope
  // ------------------------------------------------------------------

  // part.js:1036-1041
  /** Lo scope JME della parte, costruito la prima volta che serve. */
  getScope(): Scope {
    if (!this.scopeCache) {
      this.scopeCache = this.makeScope();
    }
    return this.scopeCache;
  }

  /** Sostituisce lo scope della parte (i test upstream lo fanno per iniettare
   * una domanda finta: part-tests.mjs:785-786). */
  setScope(scope: Scope): void {
    this.scopeCache = scope;
  }

  // part.js:1049-1065
  /** Costruisce lo scope della parte: figlio di quello del genitore (parte
   * madre, domanda, o quello passato nel contesto), con `part_path` definito.
   *
   * upstream imposta anche `scope.part = this`, che nessuno legge: non è
   * portato (vedi DIVERGENCES.md). */
  makeScope(parentScope?: Scope): Scope {
    let parent = parentScope;
    if (!parent) {
      if (this.parentPart) {
        parent = this.parentPart.getScope();
      } else if (this.question && this.question.scope) {
        parent = this.question.scope;
      } else {
        parent = this.parentScope ?? new Scope(builtinScope);
      }
    }
    const scope = new Scope([parent]);
    scope.setVariable("part_path", new TString(this.path));
    return scope;
  }

  // part.js:2141-2147
  /** Uno scope che contiene i valori prodotti dall'algoritmo di correzione,
   * più `credit` e `answered`. */
  afterMarkingScope(): Scope {
    const scope = new Scope([
      this.getScope(),
      this.answered ? { variables: this.marking_values } : {},
    ]);
    scope.setVariable("credit", new TNum(this.credit));
    scope.setVariable("answered", new TBool(this.answered));
    return scope;
  }

  // ------------------------------------------------------------------
  // Ciclo di vita della risposta
  // ------------------------------------------------------------------

  // part.js:999-1015
  /** Registra la risposta dello studente, senza correggerla.
   *
   * Il tipo del brief era `Answer`; qui accetta anche `undefined`, che è quel
   * che `GapFillPart#storeAnswer` inoltra a un gap senza risposta
   * (gapfill.js:167-171 passa `answer[i]` invariato). `hasStagedAnswer` tratta
   * `undefined` e `null` allo stesso modo. */
  storeAnswer(answer: Answer | undefined): void {
    this.stagedAnswer = answer;
    this.setDirty(true);
    this.removeWarnings();
  }

  // part.js:1021-1030
  /** Segna la parte come modificata (o no) dall'ultimo invio.
   *
   * upstream la propagazione alla parte madre è DENTRO `if(this.display)`
   * (part.js:1024-1029): senza oggetto di display il flag `isDirty` del
   * genitore non viene mai aggiornato. Qui non c'è display e la propagazione è
   * incondizionata — cambia un flag visibile nell'API, quindi è in
   * DIVERGENCES.md. */
  setDirty(dirty: boolean): void {
    this.isDirty = dirty;
    if (dirty && this.parentPart && !this.isStep && !this.parentPart.submitting) {
      this.parentPart.setDirty(true);
    }
  }

  // part.js:1368-1370
  /** Lo studente ha inserito una risposta?
   *
   * upstream: `return !(this.stagedAnswer == undefined)` — un confronto LASCO,
   * quindi anche `null` conta come "nessuna risposta". Portato com'è: `Answer`
   * ammette `null` (una parte `information` non ha risposta), e trattarlo come
   * una risposta vera farebbe proseguire la correzione su un valore che i
   * `setStudentAnswer` dei tipi non sanno gestire. */
  hasStagedAnswer(): boolean {
    return this.stagedAnswer !== undefined && this.stagedAnswer !== null;
  }

  // part.js:892-896
  /** Aggiunge un avviso. */
  giveWarning(warning: string): void {
    this.warnings.push(warning);
  }

  // part.js:903-905
  /** Sostituisce la lista degli avvisi. */
  setWarnings(warnings: string[]): void {
    this.warnings = warnings;
  }

  // part.js:911-913
  /** Cancella tutti gli avvisi. */
  removeWarnings(): void {
    this.setWarnings([]);
  }

  // part.js:919-933, senza la parte "steps" (non portata)
  /** Il punteggio massimo effettivamente disponibile, dopo le penalità. */
  availableMarks(): number {
    let marks = this.marks;
    if (this.adaptiveMarkingUsed) {
      marks -= this.settings.adaptiveMarkingPenalty;
    }
    marks = Math.max(Math.min(this.marks, marks), 0);
    return marks;
  }

  // part.js:941-973, senza la parte "steps" (non portata)
  /** Calcola il punteggio a partire dal credito, e lo propaga alla parte
   * madre. */
  calculateScore(): void {
    const marks = this.availableMarks();
    this.score = this.credit * marks;
    this.applyScoreLimits();
    if (this.parentPart && !this.parentPart.submitting) {
      this.parentPart.calculateScore();
    }
  }

  // part.js:977-990
  /** Riporta il punteggio dentro i limiti minimo e massimo. */
  applyScoreLimits(): void {
    const marks = this.availableMarks();
    if (this.settings.enableMinimumMarks && this.score < this.settings.minimumMarks) {
      this.score = this.settings.minimumMarks;
      // upstream: `math.Fraction.fromFloat(this.settings.minimumMarks, marks)`
      // — `fromFloat` prende UN solo argomento, quindi `marks` è ignorato e il
      // credito diventa `minimumMarks` invece di `minimumMarks/marks`; e il
      // ramo `marks == 0` assegna il numero `0` a `creditFraction`, non una
      // frazione. Portati entrambi con i tipi corretti.
      this.creditFraction = marks !== 0 ? Fraction.fromFloat(this.settings.minimumMarks) : Fraction.zero;
      this.markingComment(t("part.marking.minimum score applied", { score: niceNumber(this.settings.minimumMarks) }, this.locale));
    }
    if (this.score > marks) {
      this.finalised_result.states.push(
        feedback.sub_credit(this.credit - 1, t("part.marking.maximum score applied", { score: niceNumber(marks) }, this.locale)),
      );
      this.score = marks;
      this.creditFraction = Fraction.one;
      this.markingComment(t("part.marking.maximum score applied", { score: niceNumber(marks) }, this.locale));
    }
  }

  // ------------------------------------------------------------------
  // Metodi astratti per tipo (part.js:1653-1678)
  // ------------------------------------------------------------------

  /** Calcola (e memorizza nelle `settings`) la risposta corretta secondo lo
   * scope dato. */
  abstract getCorrectAnswer(scope: Scope): Answer;

  /** "Congela" la risposta in attesa in quella da correggere. */
  abstract setStudentAnswer(): void;

  /** La risposta grezza dello studente come token JME. */
  abstract rawStudentAnswerAsJME(): Token | undefined;

  // part.js:1676-1678
  /** La risposta dello studente come la intende l'algoritmo di correzione,
   * usata dal marking adattivo. */
  studentAnswerAsJME(): Token | undefined {
    return this.interpretedStudentAnswer;
  }

  /** La risposta corretta, ricalcolata nello scope della parte. */
  correctAnswer(): Answer {
    return this.getCorrectAnswer(this.getScope());
  }

  // ------------------------------------------------------------------
  // Correzione
  // ------------------------------------------------------------------

  /** I parametri JME passati allo script di correzione. */
  markingParameters(rawAnswer: Token | undefined): Record<string, Token> {
    return markingParameters(this, rawAnswer);
  }

  /** Esegue lo script di correzione senza applicarne gli effetti. */
  mark_answer(studentAnswer: Token | undefined, scope: Scope): MarkingScriptResult {
    return markAnswer(this, studentAnswer, scope);
  }

  /** Corregge la risposta contro lo scope dato e applica il risultato. */
  mark(scope: Scope): MarkResult {
    return markPart(this, scope);
  }

  /** Applica una lista finalizzata di operazioni di feedback. */
  apply_feedback(finalised: FinalisedState): void {
    applyFeedback(this, finalised);
  }

  // part.js:1722-1731
  /** Ripristina il feedback dato come punto di partenza. */
  restore_feedback(feedback?: ExistingFeedback): void {
    const f = feedback ?? { warnings: [], markingFeedback: [] };
    this.setWarnings(f.warnings.slice());
    this.markingFeedback = f.markingFeedback.slice();
  }

  /** Corregge contro uno scope, considerando anche le alternative. */
  markAgainstScope(scope: Scope, existing: ExistingFeedback): MarkingResults {
    return markAgainstScope(this, scope, existing);
  }

  // part.js:1991-2086 — le operazioni di credito vivono in `credit.ts`.
  /** Imposta il credito a un valore assoluto. */
  setCredit(credit: number, message?: string, reason?: FeedbackReason, scope?: TScope): void {
    setCredit(this, credit, message, reason, scope);
  }

  /** Aggiunge credito. */
  addCredit(credit: number, message?: string, scope?: TScope): void {
    addCredit(this, credit, message, scope);
  }

  /** Sottrae credito. */
  subCredit(credit: number, message?: string, scope?: TScope): void {
    subCredit(this, credit, message, scope);
  }

  /** Moltiplica il credito. */
  multCredit(factor: number, message?: string, scope?: TScope): void {
    multCredit(this, factor, message, scope);
  }

  /** Accoda un commento al feedback. */
  markingComment(message?: string, reason?: FeedbackReason, format?: FeedbackFormat, scope?: TScope): void {
    markingComment(this, message, reason, format, scope);
  }

  // part.js:1587-1591
  /** Le sostituzioni di variabile da usare, comprese quelle della parte
   * madre. */
  getErrorCarriedForwardReplacements(): VariableReplacementJSON[] {
    let replacements = this.settings.errorCarriedForwardReplacements;
    if (this.parentPart) {
      replacements = this.parentPart.getErrorCarriedForwardReplacements().concat(replacements);
    }
    return replacements;
  }

  // part.js:1599-1621
  /** La risposta a questa parte va usata nel marking adattivo di un'altra? */
  shouldUseInAdaptiveMarking(): boolean {
    if (!this.answered) {
      return false;
    }
    if (!this.settings.adaptiveMarkingUseCondition) {
      return true;
    }
    const condition = compile(this.settings.adaptiveMarkingUseCondition);
    if (!condition) {
      return true;
    }
    const scope = this.afterMarkingScope();
    const v = scope.evaluate(condition);
    if (!isType(v ?? undefined, "boolean")) {
      throw new JmeError("part.marking.adaptive marking use condition not a boolean", {
        type: v ? v.type : "nothing",
      });
    }
    return (castToType(v as Token, "boolean") as { value: boolean }).value;
  }

  // part.js:1627-1652
  /** Lo scope in cui le variabili sono sostituite con le risposte dello
   * studente alle parti riferite. */
  errorCarriedForwardScope(): Scope {
    const replace = this.getErrorCarriedForwardReplacements();
    const question = this.question;
    if (!question) {
      return this.getScope();
    }
    const new_variables: Record<string, Token> = {};
    for (let i = 0; i < replace.length; i++) {
      const vr = replace[i] as VariableReplacementJSON;
      const p2 = question.getPart(vr.part) as PartBase | undefined;
      // upstream (part.js:1637) fa `p2.shouldUseInAdaptiveMarking()` senza
      // controlli: una parte inesistente dà un `TypeError` con un messaggio
      // illeggibile. La chiave è nostra, vedi DIVERGENCES.md.
      if (!p2) {
        throw new JmeError("part.marking.variable replacement part not found", { part: vr.part });
      }
      if (p2.shouldUseInAdaptiveMarking()) {
        const answer = p2.studentAnswerAsJME();
        if (answer !== undefined) {
          new_variables[vr.variable] = answer;
        }
      } else if (vr.must_go_first) {
        throw new JmeError("part.marking.variable replacement part not answered", { part: p2.name });
      }
      // upstream (part.js:1645) fa anche `this.warnings.push("POO")` in questo
      // ramo: è un residuo di debug, non portato.
    }
    return remakeVariables(question.variablesTodo ?? {}, new_variables, this.getScope());
  }

  // part.js:1220-1355, senza display/store/step/explore
  /** Corregge la risposta e aggiorna punteggio e feedback.
   *
   * upstream `submit()` non prende argomenti e lavora su `stagedAnswer`: qui
   * l'argomento opzionale fa da `storeAnswer` implicito, così l'API pubblica
   * è una sola chiamata (inventario §10). */
  submit(answer?: Answer): MarkingResult {
    if (answer !== undefined) {
      this.storeAnswer(answer);
    }
    this.shouldResubmit = false;
    this.credit = 0;
    this.markingFeedback = [];
    this.finalised_result = { valid: false, credit: 0, states: [] };
    this.submitting = true;
    if (this.parentPart && !this.parentPart.submitting) {
      this.parentPart.setDirty(true);
    }
    this.removeWarnings();
    if (this.hasStagedAnswer()) {
      this.setDirty(false);
      let result: MarkingResults | undefined;
      try {
        result = markAdaptive(this);
      } catch (e) {
        this.submitting = false;
        this.error("part.marking.uncaught error", { message: errorMessage(e, this.locale) }, e);
      }
      if (!result) {
        this.setCredit(0, t("part.marking.no result after replacement", undefined, this.locale));
        this.answered = true;
      } else {
        this.setWarnings(result.warnings);
        this.markingFeedback = result.markingFeedback.slice();
        this.finalised_result = result.finalised_result;
        this.adaptiveMarkingUsed = result.adaptiveMarkingUsed === true;
        this.best_alternative = result.best_alternative ?? null;
        this.script_result = result.script_result;
        this.marking_values = result.values;
        this.credit = result.credit;
        this.answered = result.answered;
      }
    } else {
      this.submit_no_staged_answer();
      this.setCredit(0, t("part.marking.did not answer", undefined, this.locale));
      this.answered = false;
    }
    const availableMarks = this.availableMarks();
    if (availableMarks < this.marks) {
      this.markingFeedback.splice(0, 0, {
        op: "feedback",
        message: t("part.marking.maximum scaled down", { count: niceNumber(availableMarks) }, this.locale),
      });
    }
    if (this.adaptiveMarkingUsed && this.settings.adaptiveMarkingPenalty > 0) {
      this.markingFeedback.splice(0, 0, {
        op: "feedback",
        message: t("part.marking.used variable replacements", undefined, this.locale),
      });
    }
    this.calculateScore();
    this.lastResult = this.buildResult();
    if (this.question && this.question.updateScore) {
      this.question.updateScore();
    }
    this.submitting = false;
    if (this.answered && this.question) {
      for (const path of Object.keys(this.errorCarriedForwardBackReferences)) {
        const p2 = this.question.getPart(path) as PartBase | undefined;
        if (p2 && p2.answered) {
          p2.pleaseResubmit();
        }
      }
    }
    return this.lastResult;
  }

  // part.js:1359-1361
  /** Chiamata quando si invia una parte senza risposta. */
  submit_no_staged_answer(): void {
    this.giveWarning(t("part.marking.not submitted", undefined, this.locale));
  }

  // part.js:1375-1381
  /** Un'altra parte è cambiata: questa va rinviata. */
  pleaseResubmit(): void {
    if (!this.shouldResubmit) {
      this.shouldResubmit = true;
      this.setDirty(true);
      this.giveWarning(t("part.marking.resubmit because of variable replacement", undefined, this.locale));
    }
  }

  // part.js:2238-2250, senza display, eventi e il ramo `steps` (non portato).
  // La ricorsione sui gap è quella che upstream mette in
  // `GapFillPart#revealAnswer` (gapfill.js:147-151, composta PRIMA di quella
  // base da `util.extend`, gapfill.js:240-242): con `gaps` vuoto per gli altri
  // tipi il risultato osservabile è identico, senza un override.
  /** Rivela la risposta corretta allo studente. */
  revealAnswer(): void {
    this.revealed = true;
    this.setDirty(false);
    this.gaps.forEach((g) => {
      g.revealAnswer();
    });
  }

  // part.js:2256-2261, senza display ed eventi
  /** Blocca la parte: non accetta più risposte. */
  lock(): void {
    this.locked = true;
  }

  /** Il risultato dell'ultimo `submit`, se c'è stato. */
  get result(): MarkingResult | undefined {
    return this.lastResult;
  }

  /** Costruisce il risultato pubblico dallo stato della parte
   * (inventario §10: `correct` è derivato, `feedback` è mappato). */
  private buildResult(): MarkingResult {
    const feedbackItems: FeedbackItemPublic[] = this.markingFeedback.map((item) => ({
      type: publicFeedbackType(item.reason),
      message: item.message ?? "",
    }));
    for (const w of this.warnings) {
      feedbackItems.push({ type: "warning", message: w });
    }
    return {
      score: this.score,
      marks: this.availableMarks(),
      credit: this.credit,
      correct: this.credit >= 1,
      valid: this.answered,
      feedback: feedbackItems,
    };
  }
}

/** Il genere pubblico di una voce di feedback (decisione 4 del brief).
 *
 * Il brief limitava la mappa `correct`/`incorrect` alle voci con
 * `op === "feedback"`; qui la ragione decide per qualunque operazione, perché
 * la voce che porta "La tua risposta è corretta." è un `add_credit` prodotto
 * da `setCredit` (part.js:1994) e classificarla come `info` la renderebbe
 * indistinguibile dal resto. `invalid` (prodotto da `fail`) conta come
 * `incorrect`: il messaggio compare comunque anche fra i `warning`. */
function publicFeedbackType(reason: FeedbackReason | undefined): FeedbackItemPublic["type"] {
  switch (reason) {
    case "correct":
      return "correct";
    case "incorrect":
    case "invalid":
      return "incorrect";
    default:
      return "info";
  }
}

/** Le domande per cui l'avviso "gli step sono ignorati" è già stato dato. */
let warnedStepQuestions = new WeakSet<object>();
/** I percorsi per cui l'avviso è già stato dato, quando non c'è una domanda. */
const warnedStepPaths = new Set<string>();

/** Avvisa una volta sola per domanda (decisione 2 del brief del Task 8) che il
 * campo `steps` è ignorato. Una parte costruita fuori da una domanda non ha un
 * contenitore su cui contare: in quel caso l'avviso è dato una volta per
 * percorso. */
function warnStepsIgnored(path: string, question: PartQuestion | undefined): void {
  if (question) {
    if (warnedStepQuestions.has(question)) {
      return;
    }
    warnedStepQuestions.add(question);
  } else {
    if (warnedStepPaths.has(path)) {
      return;
    }
    warnedStepPaths.add(path);
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[@savint/engine] la parte ${path} definisce "steps": la feature non è portata e il campo è ignorato.`,
  );
}

/** Azzera la memoria degli avvisi sugli step (per i test). */
export function resetStepsWarnings(): void {
  warnedStepPaths.clear();
  warnedStepQuestions = new WeakSet<object>();
}

/** Un item di feedback prodotto dal motore di correzione. */
export type { FeedbackItem };
