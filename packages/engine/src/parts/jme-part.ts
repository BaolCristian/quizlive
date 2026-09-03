/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/jme.js:29-385 — la parte "espressione matematica". Non portati:
// `loadFromXML` (36-141), `resume` (170-176), `initDisplay` (187-189),
// `input_widget`/`input_options` (283-300).
//
// `jme.notations` non è portato (decisione 1 del Task 5): dove upstream
// sceglie una notazione (`settings.notation`) si usa il parser standard, e per
// `mustmatchpattern` il parser dei pattern.

import { findvars } from "../jme/evaluate";
import { JmeError, errorMessageIn } from "../jme/errors";
import { simplifyExpression, subvars as displaySubvars, treeToJME } from "../jme/display";
import { compile } from "../jme/parser";
import { patternParser } from "../jme/rules-parser";
import { collectRuleset } from "../jme/rules-ruleset";
import type { Scope } from "../jme/scope";
import { TExpression, TString, type Token, type Tree } from "../jme/tokens";
import { parseNumber } from "../math";
import { MarkingScript } from "../marking/marking-script";
import { markingScripts } from "../marking/scripts";
import { registerPartType } from "./create-part";
import { PartBase, tryGet, tryLoad } from "./part-base";
import type { Answer, BasePartSettings, PartJSON } from "./types";

// jme.js:179
/** Le regole di semplificazione applicate alla risposta CORRETTA quando
 * l'autore non ne indica (jme.js:179). La risposta dello studente riceve solo
 * `basic` (jme.jme:28-31): l'asimmetria è voluta. */
export const DEFAULT_ANSWER_SIMPLIFICATION =
  "basic,unitFactor,unitPower,unitDenominator,zeroFactor,zeroTerm,zeroPower,collectNumbers,zeroBase,constantsFirst,sqrtProduct,sqrtDivision,sqrtSquare,otherNumbers";

/** Le impostazioni di una parte `jme` (jme.js:242-282). */
export type JMEPartSettings = BasePartSettings & {
  /** La risposta corretta, prima della sostituzione delle variabili. */
  correctAnswerString: string;
  /** La risposta corretta, semplificata. */
  correctAnswer: string;
  /** Le regole di semplificazione, come stringa. */
  answerSimplificationString: string;
  /** Le variabili usate nella risposta corretta. */
  correctVariables: string[];
  /** Il metodo di confronto numerico. */
  checkingType: string;
  /** La soglia di tolleranza del confronto. */
  checkingAccuracy: number;
  /** Quanti disaccordi si tollerano. */
  failureRate: number;
  /** L'estremo inferiore dell'intervallo da cui pescare i valori. */
  vsetRangeStart: number;
  /** L'estremo superiore dell'intervallo da cui pescare i valori. */
  vsetRangeEnd: number;
  /** Quanti insiemi di valori generare. */
  vsetRangePoints: number;
  /** La lunghezza massima della risposta (0 = nessun limite). */
  maxLength: number;
  /** Il credito parziale se la risposta è troppo lunga. */
  maxLengthPC: number;
  /** Il messaggio se la risposta è troppo lunga. */
  maxLengthMessage: string;
  /** La lunghezza minima della risposta (0 = nessun limite). */
  minLength: number;
  /** Il credito parziale se la risposta è troppo corta. */
  minLengthPC: number;
  /** Il messaggio se la risposta è troppo corta. */
  minLengthMessage: string;
  /** Le stringhe che devono comparire nella risposta. */
  mustHave: string[];
  /** Il credito parziale se ne manca una. */
  mustHavePC: number;
  /** Il messaggio se ne manca una. */
  mustHaveMessage: string;
  /** Elencare le stringhe obbligatorie nel feedback? */
  mustHaveShowStrings: boolean;
  /** Le stringhe che non devono comparire nella risposta. */
  notAllowed: string[];
  /** Il credito parziale se ne compare una. */
  notAllowedPC: number;
  /** Il messaggio se ne compare una. */
  notAllowedMessage: string;
  /** Elencare le stringhe vietate nel feedback? */
  notAllowedShowStrings: boolean;
  /** Il pattern che la risposta deve rispettare, prima della sostituzione. */
  mustMatchPatternString: string;
  /** Il pattern che la risposta deve rispettare. */
  mustMatchPattern: string;
  /** Il credito parziale se la risposta non rispetta il pattern. */
  mustMatchPC: number;
  /** Il messaggio se la risposta non rispetta il pattern. */
  mustMatchMessage: string;
  /** Il nome del sottogruppo catturato da confrontare. */
  nameToCompare: string;
  /** Quando avvisare che la risposta non rispetta il pattern. */
  mustMatchWarningTime: string;
  /** Controllare che lo studente usi gli stessi nomi di variabile? */
  checkVariableNames: boolean;
  /** Forzare nomi di variabile di una sola lettera? */
  singleLetterVariables: boolean;
  /** Ammettere funzioni sconosciute? */
  allowUnknownFunctions: boolean;
  /** Interpretare la giustapposizione di nomi di funzione come composizione? */
  implicitFunctionComposition: boolean;
  /** Le maiuscole contano? */
  caseSensitive: boolean;
  /** Gli insiemi di funzioni disponibili nel confronto. */
  functionSets: string[];
  /** Le funzioni abilitate in più. */
  enabledFunctions: string[];
  /** Le funzioni disabilitate. */
  disabledFunctions: string[];
  /** La notazione JME da usare. */
  notation: string;
  /** I generatori di valori per le variabili della risposta. */
  valueGenerators: Record<string, TExpression>;
};

/** La parte in cui la risposta è un'espressione matematica (jme.js:29). */
export class JMEPart extends PartBase {
  /** L'ultima risposta inviata dallo studente. */
  studentAnswer: string | undefined = "";
  declare settings: JMEPartSettings & Record<string, unknown>;

  constructor(...args: ConstructorParameters<typeof PartBase>) {
    super(...args);
    // jme.js:29-35 (`util.copyinto`) + 242-282
    Object.assign(this.settings, {
      correctAnswerString: "",
      correctAnswer: "",
      answerSimplificationString: "",
      correctVariables: [],
      checkingType: "RelDiff",
      checkingAccuracy: 0,
      failureRate: 1,
      vsetRangeStart: 0,
      vsetRangeEnd: 1,
      vsetRangePoints: 1,
      maxLength: 0,
      maxLengthPC: 0,
      maxLengthMessage: "Your answer is too long",
      minLength: 0,
      minLengthPC: 0,
      minLengthMessage: "Your answer is too short",
      mustHave: [],
      mustHavePC: 0,
      mustHaveMessage: "",
      mustHaveShowStrings: false,
      notAllowed: [],
      notAllowedPC: 0,
      notAllowedMessage: "",
      notAllowedShowStrings: false,
      mustMatchPatternString: "",
      mustMatchPattern: "",
      mustMatchPC: 0,
      mustMatchMessage: "",
      nameToCompare: "",
      mustMatchWarningTime: "submission",
      checkVariableNames: false,
      singleLetterVariables: false,
      allowUnknownFunctions: true,
      implicitFunctionComposition: false,
      caseSensitive: false,
      functionSets: [],
      enabledFunctions: [],
      disabledFunctions: [],
      notation: "standard",
      valueGenerators: {},
    });
  }

  // jme.js:196-201
  override baseMarkingScript(): MarkingScript {
    return new MarkingScript(markingScripts.jme, undefined, this.getScope());
  }

  // jme.js:142-169
  override loadFromJSON(data: PartJSON): void {
    super.loadFromJSON(data);
    const settings = this.settings as unknown as Record<string, unknown>;
    tryLoad(data, ["answer", "answerSimplification"], settings, [
      "correctAnswerString",
      "answerSimplificationString",
    ]);
    tryLoad(data, ["checkingType", "checkingAccuracy", "failureRate"], settings);
    tryLoad(data, ["functionSets", "enabledFunctions", "disabledFunctions"], settings);
    tryLoad(data, ["vsetRangePoints"], settings);
    const vsetRange = tryGet(data, "vsetRange") as Array<string | number> | undefined;
    if (vsetRange) {
      this.settings.vsetRangeStart = parseNumber(String(vsetRange[0]), false);
      this.settings.vsetRangeEnd = parseNumber(String(vsetRange[1]), false);
    }
    tryLoad(data["maxlength"] as Record<string, unknown> | undefined, ["length", "partialCredit", "message"], settings, [
      "maxLength",
      "maxLengthPC",
      "maxLengthMessage",
    ]);
    tryLoad(data["minlength"] as Record<string, unknown> | undefined, ["length", "partialCredit", "message"], settings, [
      "minLength",
      "minLengthPC",
      "minLengthMessage",
    ]);
    tryLoad(
      data["musthave"] as Record<string, unknown> | undefined,
      ["strings", "showStrings", "partialCredit", "message"],
      settings,
      ["mustHave", "mustHaveShowStrings", "mustHavePC", "mustHaveMessage"],
    );
    tryLoad(
      data["notallowed"] as Record<string, unknown> | undefined,
      ["strings", "showStrings", "partialCredit", "message"],
      settings,
      ["notAllowed", "notAllowedShowStrings", "notAllowedPC", "notAllowedMessage"],
    );
    tryLoad(
      data["mustmatchpattern"] as Record<string, unknown> | undefined,
      ["pattern", "partialCredit", "message", "nameToCompare", "warningTime"],
      settings,
      ["mustMatchPatternString", "mustMatchPC", "mustMatchMessage", "nameToCompare", "mustMatchWarningTime"],
    );
    this.settings.mustMatchPC /= 100;
    tryLoad(
      data,
      [
        "checkVariableNames",
        "singleLetterVariables",
        "allowUnknownFunctions",
        "implicitFunctionComposition",
        "showPreview",
        "caseSensitive",
        "notation",
      ],
      settings,
    );
    const valuegenerators = tryGet(data, "valuegenerators") as Array<{ name: string; value: string }> | undefined;
    if (valuegenerators) {
      valuegenerators.forEach((g) => {
        this.addValueGenerator(g.name, g.value);
      });
    }
  }

  // jme.js:177-186
  override finaliseLoad(): void {
    super.finaliseLoad();
    if (!this.settings.answerSimplificationString.trim()) {
      this.settings.answerSimplificationString = DEFAULT_ANSWER_SIMPLIFICATION;
    }
    if (!this.settings.functionSets.length) {
      this.settings.functionSets = Object.keys(this.getScope().allFunctionSets());
    }
    this.stagedAnswer = "";
    this.getCorrectAnswer(this.getScope());
  }

  // jme.js:314-349
  override getCorrectAnswer(scope: Scope): Answer {
    const settings = this.settings;
    const answerSimplification = collectRuleset(settings.answerSimplificationString, scope.allRulesets());
    let tree: Tree | null = displaySubvars(settings.correctAnswerString, scope);
    if (!tree && this.marks > 0) {
      this.error("part.jme.answer missing");
    }
    tree = scope.expandJuxtapositions(tree as Tree, {
      singleLetterVariables: settings.singleLetterVariables,
      noUnknownFunctions: !settings.allowUnknownFunctions,
      implicitFunctionComposition: settings.implicitFunctionComposition,
      normaliseSubscripts: true,
    });
    let evalScope = scope;
    if (this.question && this.question.local_definitions) {
      evalScope = scope.unset(this.question.local_definitions);
    }
    const expr = treeToJME(tree, { plaindecimal: true }, evalScope);
    settings.correctVariables = findvars(compile(expr), [], evalScope);
    settings.correctAnswer = simplifyExpression(expr, answerSimplification, evalScope);
    // jme.js:344-345 — il pattern è compilato con il parser dei pattern.
    settings.mustMatchPattern = treeToJME(
      displaySubvars(settings.mustMatchPatternString || "", evalScope, patternParser),
      {},
      evalScope,
    );
    return settings.correctAnswer;
  }

  // jme.js:352-354
  override setStudentAnswer(): void {
    this.studentAnswer = this.stagedAnswer as string | undefined;
  }

  // jme.js:359-361
  override rawStudentAnswerAsJME(): Token | undefined {
    return new TString(this.studentAnswer as string);
  }

  // jme.js:369-379
  /** Registra un generatore di valori per una variabile della risposta. */
  addValueGenerator(name: string, expr: string): void {
    try {
      const tree = compile(expr);
      if (tree) {
        this.settings.valueGenerators[name] = new TExpression(tree);
      }
    } catch (e) {
      this.error(
        "part.jme.invalid value generator expression",
        { name: name, expr: expr, message: errorMessageIn(e, this.locale) },
        e instanceof JmeError ? e : undefined,
      );
    }
  }
}

// jme.js:381-385
registerPartType("jme", JMEPart);
