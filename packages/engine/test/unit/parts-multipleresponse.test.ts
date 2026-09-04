// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione dei moduli QUnit "Choose one from a list" (part-tests.mjs:706-733),
// "Choose several from a list" (734-759) e "Match choices with answers"
// (760-781), più i casi della forma pubblica di `Answer` (risoluzione 1 del
// Task 8: `storeAnswer` accetta sia la matrice `ticks` sia l'indice/la lista).

import { describe, it, expect, afterEach } from "vitest";
import { setLocale } from "../../src/i18n";
import { Scope, makeRng } from "../../src/jme/scope";
import { builtinScope } from "../../src/jme/builtins";
import { unwrapValue } from "../../src/jme/evaluate";
import { createPart, markPart, runPartUnitTests } from "./parts-helpers";
import type { MultipleResponsePart } from "../../src/parts/multiple-response-part";

describe("Choose one from a list", () => {
  it("non scegliere niente non è valido", () => {
    const p = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: [[1], [0], [0]] });
    expect(markPart(p, [[false], [false], [false]]).valid).toBe(false);
  });

  it("tre scelte, la prima è corretta", () => {
    const p = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: [[1], [0], [0]] });
    expect(markPart(p, [[true], [false], [false]]).credit).toBe(1);
    expect(markPart(p, [[false], [true], [false]]).credit).toBe(0);
  });

  it("tre scelte, la terza è corretta", () => {
    const p = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: [[0], [0], [1]] });
    expect(markPart(p, [[false], [false], [true]]).credit).toBe(1);
    expect(markPart(p, [[true], [false], [false]]).credit).toBe(0);
  });

  it("tre scelte, matrice come espressione JME", () => {
    const p = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: "[1,0,0]" });
    expect(markPart(p, [[true], [false], [false]]).credit).toBe(1);
    expect(markPart(p, [[false], [true], [false]]).credit).toBe(0);
  });

  it("la forma pubblica della risposta è l'indice della scelta", () => {
    const p = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: [[1], [0], [0]] });
    expect(markPart(p, 0).credit).toBe(1);
    expect(markPart(p, 1).credit).toBe(0);
    expect(markPart(p, 2).credit).toBe(0);
  });
});

describe("Choose several from a list", () => {
  it("sum ticked cells: non scegliere niente non è valido", () => {
    const p = createPart({
      type: "m_n_2",
      choices: ["a", "b"],
      matrix: [[1], [0]],
      markingMethod: "sum ticked cells",
    });
    expect(markPart(p, [[false], [false]]).valid).toBe(false);
    expect(markPart(p, [[false], [true]]).valid).toBe(true);
  });

  it("score per matched cell: non scegliere niente è valido", () => {
    const p = createPart({
      type: "m_n_2",
      choices: ["a", "b"],
      matrix: [[1], [0]],
      markingMethod: "score per matched cell",
    });
    expect(markPart(p, [[false], [false]]).valid).toBe(true);
  });

  it("due scelte, entrambe giuste", () => {
    const p = createPart({ type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]] });
    expect(markPart(p, [[true], [true]]).credit).toBe(1);
    expect(markPart(p, [[true], [false]]).credit).toBe(0.5);
  });

  it("due scelte, minAnswers = 2", () => {
    const p = createPart({ type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]], minAnswers: 2 });
    expect(markPart(p, [[false], [true]]).credit).toBe(0);
  });

  it("la forma pubblica della risposta è una lista di booleani", () => {
    const p = createPart({ type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]] });
    expect(markPart(p, [true, true]).credit).toBe(1);
    expect(markPart(p, [true, false]).credit).toBe(0.5);
  });

  it("warningType=prevent rende non valida la risposta con troppe scelte", () => {
    const p = createPart({
      type: "m_n_2",
      choices: ["a", "b"],
      matrix: [[1], [1]],
      maxAnswers: 1,
      warningType: "prevent",
    });
    expect(markPart(p, [true, true]).valid).toBe(false);
  });

  it("warningType=warn lascia la risposta valida ma senza credito", () => {
    const p = createPart({
      type: "m_n_2",
      choices: ["a", "b"],
      matrix: [[1], [1]],
      maxAnswers: 1,
      warningType: "warn",
    });
    const res = markPart(p, [true, true]);
    expect(res.valid).toBe(true);
    expect(res.credit).toBe(0);
  });
});

describe("Match choices with answers", () => {
  it("la matrice dei punteggi è id(2)", () => {
    const p = createPart({ type: "m_n_x", choices: ["a", "b"], answers: ["A", "B"], matrix: [[1, 0], [0, 1]] });
    expect(markPart(p, [[true, false], [false, true]]).credit).toBe(1);
    expect(markPart(p, [[true, true], [true, true]]).credit).toBe(1);
  });

  it("la matrice dei punteggi è id(2) con -5 per la scelta sbagliata", () => {
    const p = createPart({ type: "m_n_x", choices: ["a", "b"], answers: ["A", "B"], matrix: [[1, -5], [-5, 1]] });
    expect(markPart(p, [[true, false], [false, true]]).credit).toBe(1);
    markPart(p, [[true, true], [true, true]]);
    p.calculateScore();
    expect(p.credit).toBe(0);
  });

  it("l'ordine del feedback segue la griglia da sinistra a destra e dall'alto in basso", () => {
    const p = createPart({
      type: "m_n_x",
      choices: ["a", "b"],
      answers: ["A", "B"],
      matrix: [[1, -5], [-5, 1]],
      distractors: [["Aa", "Ba"], ["Ab", "Bb"]],
    });
    const res = markPart(p, [[true, true], [true, true]]);
    expect(res.states.map((s) => s.message).join("\n")).toBe("Aa\nAb\nBa\nBb");
  });

  it("una griglia [scelta][risposta] non quadrata è trasposta nella matrice ticks", () => {
    // 3 scelte × 2 risposte: la forma pubblica è [scelta][risposta], la
    // matrice `ticks` è [risposta][scelta].
    const p = createPart({
      type: "m_n_x",
      choices: ["a", "b", "c"],
      answers: ["A", "B"],
      matrix: [
        [1, 0],
        [1, 0],
        [0, 1],
      ],
    });
    const mrp = p as MultipleResponsePart;
    expect(mrp.numChoices).toBe(3);
    expect(mrp.numAnswers).toBe(2);
    const res = markPart(p, [
      [true, false],
      [true, false],
      [false, true],
    ]);
    expect(res.credit).toBe(1);
    expect(mrp.ticks).toEqual([
      [true, true, false],
      [false, false, true],
    ]);
  });

  it("la matrice ticks upstream è accettata invariata", () => {
    const p = createPart({
      type: "m_n_x",
      choices: ["a", "b", "c"],
      answers: ["A", "B"],
      matrix: [
        [1, 0],
        [1, 0],
        [0, 1],
      ],
    });
    const res = markPart(p, [
      [true, true, false],
      [false, false, true],
    ]);
    expect(res.credit).toBe(1);
  });
});

describe("Multiple response — dettagli di caricamento", () => {
  it("la matrice non è trasposta per i tipi flipped e lo è per m_n_x", () => {
    const one = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: [[1], [0], [0]] }) as MultipleResponsePart;
    expect(one.settings.matrix).toEqual([[1], [0], [0]]);
    const grid = createPart({
      type: "m_n_x",
      choices: ["a", "b"],
      answers: ["A", "B"],
      matrix: [[1, 2], [3, 4]],
    }) as MultipleResponsePart;
    // JSON: [scelta][risposta]; settings.matrix: [risposta][scelta].
    expect(grid.settings.matrix).toEqual([[1, 3], [2, 4]]);
  });

  it("maxAnswers=0 significa illimitato", () => {
    const p = createPart({ type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]] }) as MultipleResponsePart;
    expect(p.settings.maxAnswers).toBe(p.numAnswers * p.numChoices);
    expect(markPart(p, [true, true]).credit).toBe(1);
  });

  it("il mescolamento usa il generatore dello scope, choices prima di answers", () => {
    const data = {
      type: "m_n_x" as const,
      choices: ["a", "b", "c"],
      answers: ["A", "B"],
      matrix: [
        [1, 0],
        [1, 0],
        [0, 1],
      ],
      shuffleChoices: true,
      shuffleAnswers: true,
    };
    const scopeA = new Scope([builtinScope, { rng: makeRng("seme") }]);
    const scopeB = new Scope([builtinScope, { rng: makeRng("seme") }]);
    const a = createPart(data, scopeA) as MultipleResponsePart;
    const b = createPart(data, scopeB) as MultipleResponsePart;
    expect(a.shuffleChoices).toEqual(b.shuffleChoices);
    expect(a.shuffleAnswers).toEqual(b.shuffleAnswers);
    expect([...a.shuffleChoices].sort()).toEqual([0, 1, 2]);
    expect([...a.shuffleAnswers].sort()).toEqual([0, 1]);
  });

  it("i punti sono calcolati dalla matrice quando non sono dichiarati", () => {
    const p = createPart({ type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]] });
    expect(p.marks).toBe(2);
  });

  it("studentAnswerAsJME dà l'indice per 1_n_2 e la lista per m_n_2", () => {
    const one = createPart({ type: "1_n_2", choices: ["a", "b", "c"], matrix: [[1], [0], [0]] });
    markPart(one, 2);
    expect(unwrapValue(one.studentAnswerAsJME()!)).toBe(2);
    const several = createPart({ type: "m_n_2", choices: ["a", "b"], matrix: [[1], [1]] });
    markPart(several, [true, false]);
    expect(unwrapValue(several.studentAnswerAsJME()!)).toEqual([true, false]);
  });

  it("una lista di scelte definita da un'espressione JME è valutata", () => {
    const p = createPart({ type: "1_n_2", choices: '["a","b","c"]', matrix: [[1], [0], [0]] }) as MultipleResponsePart;
    expect(p.settings.choices).toEqual(["a", "b", "c"]);
    expect(markPart(p, 0).credit).toBe(1);
  });

  it("layoutType azzera le celle fuori dalla griglia", () => {
    const p = createPart({
      type: "m_n_x",
      choices: ["a", "b"],
      answers: ["A", "B"],
      matrix: [[1, 1], [1, 1]],
      layout: { type: "strictlowertriangle", expression: "" },
    }) as MultipleResponsePart;
    // `layout[risposta][scelta] = riga > colonna` con riga=scelta, colonna=risposta
    expect(p.settings.matrix.flat().filter((x) => x !== 0)).toHaveLength(1);
  });
});

// part-tests.mjs:110-155 + part_unit_tests.mjs — il formato "unit test
// incorporato nel JSON". Il fixture è copiato verbatim dalla prima parte della
// domanda "Choose one from a list part"; i messaggi attesi sono in inglese,
// quindi il caso gira con la locale `en`.
describe("Part unit tests incorporati", () => {
  afterEach(() => setLocale("it"));

  it("il fixture 1_n_2 di part_unit_tests.mjs passa", () => {
    setLocale("en");
    const p = createPart({
      type: "1_n_2",
      useCustomName: false,
      customName: "",
      marks: 0,
      showCorrectAnswer: true,
      showFeedbackIcon: true,
      variableReplacements: [],
      variableReplacementStrategy: "originalfirst",
      adaptiveMarkingPenalty: 0,
      customMarkingAlgorithm: "",
      extendBaseMarkingAlgorithm: true,
      unitTests: [
        {
          variables: [],
          name: "Correct",
          answer: { valid: true, value: [[true], [false], [false]], empty: false },
          notes: [
            {
              name: "mark",
              expected: {
                value: "nothing",
                messages: ["You chose a correct answer."],
                warnings: [],
                error: "",
                valid: true,
                credit: 1,
              },
            },
          ],
        },
        {
          variables: [],
          name: "Incorrect",
          answer: { valid: true, value: [[false], [true], [false]], empty: false },
          notes: [
            {
              name: "mark",
              expected: {
                value: "nothing",
                messages: ["You chose an incorrect answer."],
                warnings: [],
                error: "",
                valid: true,
                credit: 0,
              },
            },
          ],
        },
      ],
      minMarks: 0,
      maxMarks: 0,
      shuffleChoices: false,
      displayType: "radiogroup",
      displayColumns: 0,
      showCellAnswerState: true,
      choices: ["Choice 1", "Choice 2", "Choice 3"],
      matrix: ["1", 0, 0],
      distractors: ["", "", ""],
    });
    runPartUnitTests(p);
  });
});
