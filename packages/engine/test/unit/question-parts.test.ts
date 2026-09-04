// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// I casi di part-tests.mjs costruiti con `question_test`/`question_unit_test`,
// che il Task 8 aveva rimandato perché hanno bisogno di una `Question` intera:
// variabili di domanda, `getPart` su tutte le parti, `submit_part` fra parti
// sorelle.
//
// - "Gapfill" (782-1247): 'One JME gap with string restrictions',
//   'A gap-fill is invalid if any of the gaps are invalid', 'Show an error
//   message when a gap relies on an unanswered part', 'Sort answers',
//   'Adaptive marking order', 'Re-evaluate destructured variables after
//   variable replacement', 'Adaptive marking error when referenced part
//   doesn't exist', le due 'Adaptive marking carries through to gaps';
// - "JME" (356-638): 'Variables defined by the question aren't used in
//   evaluating student's expression', 'Expression is case-sensitive';
// - "Question" (1344-1597): 'Adaptive marking penalty', 'Catch error in a
//   marking script';
// - "Alternative answers" (1713-1793): un caso rifatto a livello di domanda
//   (gli altri sono già in parts-alternatives.test.ts, dove non serve la
//   domanda);
// - "Custom marking algorithms" (1248-1262): 'Error in mark note';
// - "Part unit tests" (2626-2643): il fixture `part-unit-tests.json`.
//
// NON tradotti, e perché:
// - 'A big question' (1414-1431): la seconda parte è di tipo `matrix`, fuori
//   ambito (decisione 3 del design doc);
// - i due casi 'Steps' (1435-1494) e 'One next part' (1600+): `steps` ed
//   `explore` non sono portati;
// - 'Extension scopes only applied to questions that uses them' (1521-1553) e
//   'Promise in question preamble' (1556-1597): estensioni e preambolo
//   JavaScript sono rifiutati al caricamento (decisioni 2-3 del brief).

import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../src/i18n";
import { loadQuestion } from "../../src/question";
import { engineErrorKeys } from "../../src/errors";
import type { NumbasQuestionJSON } from "../../src/question";
import type { PartBase } from "../../src/parts";
import { markPart, runPartUnitTests } from "./parts-helpers";
import unitTestQuestions from "../fixtures/upstream/part-unit-tests.json";

/** I messaggi di `markingFeedback` di una parte, uno per riga. */
function feedbackText(p: PartBase | undefined): string {
  return (p?.markingFeedback ?? []).map((f) => f.message ?? "").join("\n");
}

/** Le chiavi d'errore lanciate da `fn` (catena parte + domanda). */
function errorKeys(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    return engineErrorKeys(e);
  }
  return [];
}

afterEach(() => {
  setLocale("it");
});

describe("Gapfill dentro una domanda", () => {
  // part-tests.mjs:791-801
  it("un gap JME con restrizioni sulle stringhe", () => {
    const json = JSON.parse(
      '{"name":"string restriction in gapfill JME part","tags":[],"statement":"","advice":"","rulesets":{},"extensions":[],"variables":{},"variablesTest":{"condition":"","maxRuns":100},"functions":{},"preamble":{"js":"","css":""},"parts":[{"type":"gapfill","marks":0,"showCorrectAnswer":true,"showFeedbackIcon":true,"variableReplacements":[],"variableReplacementStrategy":"originalfirst","customMarkingAlgorithm":"","extendBaseMarkingAlgorithm":true,"unitTests":[],"prompt":"<p>x^2+x</p>\\n<p>[[0]]</p>","gaps":[{"type":"jme","marks":1,"answer":"x^2+x","checkingType":"absdiff","checkingAccuracy":0.001,"failureRate":1,"vsetRangePoints":5,"vsetRange":[0,1],"checkVariableNames":false,"expectedVariableNames":[],"musthave":{"strings":["("],"showStrings":false,"partialCredit":0,"message":"didn\'t use ("},"notallowed":{"strings":["^"],"showStrings":false,"partialCredit":0,"message":"did use ^"}}]},{"type":"jme","marks":1,"answer":"x","checkingType":"absdiff","checkingAccuracy":0.001,"failureRate":1,"vsetRangePoints":5,"vsetRange":[0,1],"checkVariableNames":false,"expectedVariableNames":[]}]}',
    ) as NumbasQuestionJSON;
    const q = loadQuestion(json, { seed: "gapstr" });
    const p = q.getPart("p0") as PartBase;
    const res = markPart(p, ["x^2+x"]);
    expect(res.valid, "x^2+x è valida").toBe(true);
    expect(res.credit, "x^2+x non è corretta (usa ^, manca la parentesi)").toBe(0);
    expect(markPart(p, ["x*(x+1)"]).credit, "x*(x+1) è corretta").toBe(1);
  });

  // part-tests.mjs:803-840
  it("un gapfill non è valido se anche un solo gap non lo è", () => {
    const json: NumbasQuestionJSON = {
      parts: [
        {
          type: "gapfill",
          gaps: [
            { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
            { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "gapinv" });
    const p = q.getPart("p0") as PartBase;
    p.submit();
    expect(p.credit).toBe(0);
    expect(p.answered).toBe(false);

    q.getPart("p0g0")?.storeAnswer("1");
    p.submit();
    expect(p.credit).toBe(0.5);
    expect(p.answered).toBe(false);

    q.getPart("p0g1")?.storeAnswer("1");
    p.submit();
    expect(p.credit).toBe(1);
    expect(p.answered).toBe(true);
  });

  // part-tests.mjs:843-891
  it("un gap che dipende da una parte non risposta mostra un messaggio", () => {
    setLocale("en");
    const json: NumbasQuestionJSON = {
      variables: { n: { name: "n", definition: "1" } },
      parts: [
        { type: "numberentry", marks: 1, minValue: "n", maxValue: "n" },
        {
          type: "gapfill",
          marks: 0,
          prompt: "<p>[[0]]</p>",
          gaps: [
            {
              type: "numberentry",
              marks: 1,
              variableReplacements: [{ variable: "n", part: "p0", must_go_first: true }],
              variableReplacementStrategy: "alwaysreplace",
              minValue: "n",
              maxValue: "n",
            },
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "gapdep", locale: "en" });
    const p = q.getPart("p1") as PartBase;
    q.getPart("p1g0")?.storeAnswer("1");
    p.submit();
    expect(feedbackText(p)).toBe("You must answer a) first.");
  });

  // part-tests.mjs:894-925
  it("`sortAnswers` accetta i gap in qualunque ordine", () => {
    const gaps = [
      { type: "numberentry" as const, minValue: "1", maxValue: "1", marks: 1 },
      { type: "numberentry" as const, minValue: "2", maxValue: "2", marks: 1 },
    ];
    const q = loadQuestion(
      {
        name: "q",
        parts: [
          { type: "gapfill", gaps: gaps },
          { type: "gapfill", sortAnswers: true, gaps: gaps },
        ],
      },
      { seed: "sort" },
    );
    const p0 = q.getPart("p0") as PartBase;
    expect(markPart(p0, ["1", "2"]).credit, "1,2 corretta senza sortAnswers").toBe(1);
    expect(markPart(p0, ["2", "1"]).credit, "2,1 sbagliata senza sortAnswers").toBe(0);
    const p1 = q.getPart("p1") as PartBase;
    expect(markPart(p1, ["1", "2"]).credit, "1,2 corretta con sortAnswers").toBe(1);
    expect(markPart(p1, ["2", "1"]).credit, "2,1 corretta con sortAnswers").toBe(1);
  });

  // part-tests.mjs:928-1043
  it("l'ordine di correzione adattiva dei gap, e i cicli", () => {
    const json: NumbasQuestionJSON = {
      variables: {
        a: { name: "a", definition: "1" },
        b: { name: "b", definition: "a" },
      },
      parts: [
        {
          type: "gapfill",
          useCustomName: true,
          customName: "cycle",
          gaps: [
            {
              type: "numberentry",
              marks: 1,
              variableReplacements: [{ variable: "a", part: "p0g1", must_go_first: false }],
              minValue: "b",
              maxValue: "b",
            },
            {
              type: "numberentry",
              marks: 1,
              variableReplacements: [{ variable: "b", part: "p0g0", must_go_first: false }],
              minValue: "a",
              maxValue: "a",
            },
          ],
        },
        {
          type: "gapfill",
          useCustomName: true,
          customName: "unusual order",
          gaps: [
            {
              type: "numberentry",
              marks: 1,
              variableReplacements: [{ variable: "a", part: "p1g1", must_go_first: false }],
              minValue: "b",
              maxValue: "b",
            },
            { type: "numberentry", marks: 1, minValue: "a", maxValue: "a" },
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "adaptorder" });
    expect(
      errorKeys(() => markPart(q.getPart("p0") as PartBase, ["2", "2"])),
      "il ciclo fra i gap è segnalato",
    ).toContain("part.gapfill.cyclic adaptive marking");

    const p1 = q.getPart("p1") as PartBase;
    markPart(p1, ["2", "2"]);
    expect(p1.credit, "b è corretta con la correzione adattiva").toBe(0.5);
    expect(q.getPart("p1g0")?.shouldResubmit, "il gap non è marcato da rinviare").toBeFalsy();
  });

  // part-tests.mjs:1044-1096
  it("le variabili destrutturate sono ricalcolate dopo la sostituzione", () => {
    const json: NumbasQuestionJSON = {
      name: "Destructured aren't re-evaluated!",
      variables: {
        n: { name: "n", definition: "1" },
        "x,y": { name: "x,y", definition: "[2n,3n]" },
      },
      parts: [
        { type: "numberentry", minValue: "n", maxValue: "n" },
        {
          type: "numberentry",
          variableReplacements: [{ variable: "n", part: "p0", must_go_first: true }],
          variableReplacementStrategy: "alwaysreplace",
          minValue: "x",
          maxValue: "x",
        },
      ],
    };
    const q = loadQuestion(json, { seed: "destr" });
    q.getPart("p0")?.submit("2");
    const p1 = q.getPart("p1") as PartBase;
    p1.submit("4");
    expect(p1.credit, "2n adesso vale 4").toBe(1);
  });

  // part-tests.mjs:1098-1130
  it("una sostituzione che riferisce una parte inesistente è segnalata", () => {
    setLocale("en");
    const json: NumbasQuestionJSON = {
      name: "Adaptive marking error when referenced part doesn't exist",
      variables: { n: { name: "n", definition: "1" } },
      parts: [
        {
          type: "numberentry",
          minvalue: "1",
          maxvalue: "1",
          variableReplacements: [{ variable: "n", part: "p1" }],
          variableReplacementStrategy: "alwaysreplace",
        },
      ],
    };
    const q = loadQuestion(json, { seed: "noref", locale: "en" });
    const p0 = q.getPart("p0") as PartBase;
    p0.submit("4");
    // upstream il messaggio è "There was an error in the adaptive marking for
    // this part. Please report this. Question 1: Can't find part p1."; qui la
    // parte interna è la nostra chiave `part.marking.variable replacement part
    // not found` invece del `TypeError` upstream (DIVERGENCES.md).
    expect(p0.markingFeedback[0]?.message).toContain("There was an error in the adaptive marking");
    expect(p0.markingFeedback[0]?.message).toContain("Can't find part p1.");
  });

  // part-tests.mjs:1135-1177
  it("la correzione adattiva arriva fino ai gap", () => {
    const json: NumbasQuestionJSON = {
      name: "Adaptive marking carries through to gaps",
      variables: { n: { name: "n", definition: "1" } },
      parts: [
        { type: "numberentry", minvalue: "1", maxvalue: "1" },
        {
          type: "gapfill",
          variableReplacements: [{ variable: "n", part: "p0" }],
          gaps: [
            { type: "numberentry", minvalue: "n", maxvalue: "n" },
            { type: "numberentry", minvalue: "2n", maxvalue: "2n" },
          ],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "adaptgap" });
    q.getPart("p0")?.submit("4");
    const p1 = q.getPart("p1") as PartBase;
    q.getPart("p1g0")?.storeAnswer("4");
    q.getPart("p1g1")?.storeAnswer("8");
    p1.submit();
    expect(p1.credit, "pieno: le sostituzioni arrivano ai gap").toBe(1);
    q.getPart("p1g0")?.storeAnswer("2");
    q.getPart("p1g1")?.storeAnswer("4");
    p1.submit();
    expect(p1.credit, "niente punti per risposte sbagliate").toBe(0);
  });

  // part-tests.mjs:1179-1245
  it("la correzione adattiva sostituisce anche le variabili destrutturate", () => {
    const json: NumbasQuestionJSON = {
      variables: {
        l: { name: "l", definition: "[1,2]" },
        "a,b": { name: "a,b", definition: "l" },
        c: { name: "c", definition: "a+b" },
      },
      parts: [
        {
          type: "numberentry",
          minvalue: "1",
          maxvalue: "1",
          extendBaseMarkingAlgorithm: true,
          customMarkingAlgorithm: "\ninterpreted_answer: [studentNumber, 2*studentNumber]",
        },
        {
          type: "numberentry",
          minvalue: "c",
          maxvalue: "c",
          variableReplacements: [{ variable: "l", part: "p0" }],
        },
        {
          type: "numberentry",
          minvalue: "c",
          maxvalue: "c",
          variableReplacements: [{ variable: "a,b", part: "p0" }],
        },
      ],
    };
    const q = loadQuestion(json, { seed: "adaptdestr" });
    q.getPart("p0")?.submit("4");
    const p1 = q.getPart("p1") as PartBase;
    p1.submit("12");
    expect(p1.credit, "pieno con una sola variabile sostituita").toBe(1);
    const p2 = q.getPart("p2") as PartBase;
    p2.submit("12");
    expect(p2.credit, "pieno con le variabili destrutturate sostituite").toBe(1);
  });
});

describe("JME dentro una domanda", () => {
  // part-tests.mjs:531-559
  it("le variabili della domanda non entrano nella valutazione dell'espressione dello studente", () => {
    const q = loadQuestion(
      {
        name: "scope used when evaluating JME",
        variables: { a: { name: "a", definition: "[1,2,3]" } },
        parts: [{ type: "jme", marks: 1, prompt: "<p>Scrivi $2a$</p>", answer: "2a" }],
      },
      { seed: "jmescope" },
    );
    q.getPart("p0")?.submit("2a");
    expect(q.score().score).toBe(1);
  });

  // part-tests.mjs:583-596 (`question_unit_test`)
  it("l'espressione distingue maiuscole e minuscole", () => {
    setLocale("en");
    const json = JSON.parse(
      '{"name":"case sensitivity","parts":[{"type":"jme","marks":1,"unitTests":[{"variables":[],"name":"t/t is incorrect","answer":{"valid":true,"value":"t/t"},"notes":[{"name":"mark","expected":{"value":"nothing","messages":["Your answer is incorrect."],"warnings":[],"error":"","valid":true,"credit":0}}]},{"variables":[],"name":"t/T is correct","answer":{"valid":true,"value":"t/T"},"notes":[{"name":"mark","expected":{"value":"nothing","messages":["Your answer is numerically correct."],"warnings":[],"error":"","valid":true,"credit":1}}]}],"answer":"t/T","caseSensitive":true,"valuegenerators":[{"name":"T","value":""},{"name":"t","value":""}]}]}',
    ) as NumbasQuestionJSON;
    const q = loadQuestion(json, { seed: "case", locale: "en" });
    q.allParts().forEach(runPartUnitTests);
  });
});

describe("Question", () => {
  // part-tests.mjs:1496-1507
  it("la penalità della correzione adattiva è applicata", () => {
    const json = JSON.parse(
      '{"name":"adaptive marking penalty","variables":{"a":{"name":"a","definition":"1"}},"variablesTest":{"condition":"","maxRuns":100},"parts":[{"type":"numberentry","marks":1,"customMarkingAlgorithm":"","extendBaseMarkingAlgorithm":true,"variableReplacements":[],"variableReplacementStrategy":"originalfirst","adaptiveMarkingPenalty":0,"minValue":"a","maxValue":"a"},{"type":"numberentry","marks":"2","customMarkingAlgorithm":"","extendBaseMarkingAlgorithm":true,"variableReplacements":[{"variable":"a","part":"p0","must_go_first":false}],"variableReplacementStrategy":"originalfirst","adaptiveMarkingPenalty":"1","minValue":"a","maxValue":"a"}],"partsMode":"all"}',
    ) as NumbasQuestionJSON;
    const q = loadQuestion(json, { seed: "penalty" });
    q.getPart("p0")?.submit("2");
    q.getPart("p1")?.submit("2");
    expect(q.getPart("p1")?.score).toBe(1);
  });

  // part-tests.mjs:1509-1516
  it("un errore di sintassi nello script di correzione è segnalato al caricamento", () => {
    const json: NumbasQuestionJSON = {
      name: "Error in marking algorithm",
      parts: [
        {
          type: "numberentry",
          marks: 1,
          customMarkingAlgorithm: "mark: set_credit(1",
          extendBaseMarkingAlgorithm: true,
          minValue: "1",
          maxValue: "1",
        },
      ],
    };
    const keys = errorKeys(() => loadQuestion(json, { seed: "badscript" }));
    expect(keys).toContain("part.error");
    expect(keys).toContain("jme.script.error parsing notes");
  });

  // part-tests.mjs:1714-1726 — gli altri tre casi di "Alternative answers"
  // non usano variabili di domanda e stanno in parts-alternatives.test.ts.
  it("una risposta alternativa funziona anche dentro una domanda", () => {
    const json = JSON.parse(
      '{"name":"Alternative answer: 2 instead of 1","parts":[{"type":"numberentry","marks":1,"alternatives":[{"type":"numberentry","useCustomName":true,"customName":"2","marks":0.5,"alternativeFeedbackMessage":"<p>You wrote 2.</p>","useAlternativeFeedback":false,"minValue":"2","maxValue":"2"}],"minValue":"1","maxValue":"1"}]}',
    ) as NumbasQuestionJSON;
    const q = loadQuestion(json, { seed: "alt" });
    const p = q.parts[0] as PartBase;
    p.submit("1");
    expect(p.credit, "1 credito per la risposta corretta").toBe(1);
    p.submit("2");
    expect(p.credit, "0.5 crediti per l'alternativa").toBe(0.5);
    expect(p.markingFeedback[0]?.message).toBe("<p>You wrote 2.</p>");
    expect(q.score().score).toBe(0.5);
  });
});

// part-tests.mjs:1248-1262
describe("Custom marking algorithms", () => {
  it("un errore nella nota `mark` lascia la parte non risposta", () => {
    const json = JSON.parse(
      '{"name":"marking algorithm error display","parts":[{"type":"jme","marks":1,"customMarkingAlgorithm":"q:\\n  a\\n\\nmark:\\n  apply(z)","extendBaseMarkingAlgorithm":true,"answer":"x","checkingType":"absdiff","checkingAccuracy":0.001,"failureRate":1,"vsetRangePoints":5,"vsetRange":[0,1],"valuegenerators":[{"name":"x","value":""}]}],"partsMode":"all"}',
    ) as NumbasQuestionJSON;
    const q = loadQuestion(json, { seed: "markerr" });
    const p = q.getPart("p0") as PartBase;
    p.storeAnswer("x");
    const result = p.submit();
    // upstream: `assert.notOk(p.marking_result.answered)`. `marking_result`
    // esiste sempre dopo `submit` (part.js:1310-1316), quindi l'assert
    // riguarda davvero `answered`, non l'assenza del risultato.
    expect(result, "il risultato esiste").toBeDefined();
    expect(result.valid, "`answered` è falso: la nota mark è fallita").toBe(false);
    expect(p.answered).toBe(false);
    expect(p.credit).toBe(0);
    expect(q.score()).toEqual({ score: 0, marks: 1 });
  });
});

// part-tests.mjs:2626-2643 — i test incorporati nel JSON delle sei domande in
// ambito di `part_unit_tests.mjs` (senza `matrixentry`), eseguiti su OGNI
// parte di OGNI domanda. I messaggi attesi sono in inglese.
describe("Part unit tests (fixture upstream)", () => {
  const questions = unitTestQuestions as unknown as NumbasQuestionJSON[];

  it("il fixture contiene le sei domande in ambito", () => {
    expect(questions.map((q) => q.name)).toEqual([
      "Choose one from a list part",
      "Choose several from a list part",
      "Match choices with answers part",
      "Match text pattern part",
      "Mathematical expression part",
      "Number entry part",
    ]);
  });

  for (const data of questions) {
    it(String(data.name), () => {
      setLocale("en");
      const q = loadQuestion(data, { seed: "unit-tests", locale: "en" });
      expect(q.allParts().length).toBeGreaterThan(0);
      q.allParts().forEach(runPartUnitTests);
    });
  }
});
