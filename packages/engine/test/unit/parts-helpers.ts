/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Gli helper dei test delle parti, tradotti da tests/parts/part-tests.mjs:23-155
// senza DOM, storage e promesse.

import { expect } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import { Scope } from "../../src/jme/scope";
import { normaliseName } from "../../src/jme/tokenizer";
import type { Token } from "../../src/jme/tokens";
import { eq } from "../../src/jme/equality";
import type { FeedbackItem } from "../../src/marking/feedback";
import type { FinalisedState } from "../../src/marking/finalise-state";
import { createPartFromJSON } from "../../src/parts";
import type { Answer, PartJSON, PartQuestion } from "../../src/parts";
import type { PartBase } from "../../src/parts/part-base";

/** Uno scope pulito con i soli builtin, per non condividere variabili fra i
 * test. */
export function freshScope(): Scope {
  return new Scope([builtinScope]);
}

// part-tests.mjs:23
/** Costruisce una parte dal JSON dato, come `createPartFromJSON(0, data, 'p0',
 * null, null)` upstream. */
export function createPart(data: PartJSON, scope?: Scope): PartBase {
  return createPartFromJSON(0, data, "p0", { scope: scope ?? freshScope() });
}

/** Come `createPart`, ma installa una domanda finta che sa ritrovare la parte
 * e i suoi gap per percorso: `mark_part`/`submit_part` (gapfill) ne hanno
 * bisogno, ed è quello che i test upstream fanno a mano
 * (part-tests.mjs:785-786). */
export function createPartWithQuestion(data: PartJSON, scope?: Scope): PartBase {
  const s = scope ?? freshScope();
  const part = createPartFromJSON(0, data, "p0", { scope: s });
  attachFakeQuestion(part);
  return part;
}

/** Installa sullo scope della parte una domanda finta che risolve i percorsi
 * fra la parte stessa, i suoi gap e le sue alternative. */
export function attachFakeQuestion(part: PartBase): PartQuestion {
  const all: PartBase[] = [part, ...part.gaps, ...part.alternatives];
  const question: PartQuestion = {
    getPart(path: string) {
      return all.find((p) => p.path === path);
    },
    variablesTodo: {},
  };
  const scope = part.getScope();
  scope.question = question;
  part.question = question;
  for (const g of part.gaps) {
    g.question = question;
    g.getScope().question = question;
  }
  return question;
}

// part-tests.mjs:53-65, reso sincrono (nessun `waiting_for_pre_submit`).
/** Registra la risposta, la congela e corregge la parte, restituendo lo stato
 * finalizzato. */
export function markPart(p: PartBase, answer: Answer, scope?: Scope): FinalisedState {
  p.storeAnswer(answer);
  p.setStudentAnswer();
  const res = p.mark(scope ?? p.getScope());
  return res.finalised_result;
}

// part-tests.mjs:80-87
/** Lo stato contiene una voce che combacia con tutte le chiavi date? */
export function containsNote(res: FinalisedState, note: Partial<FeedbackItem>): boolean {
  return res.states.some((s) =>
    Object.entries(note).every(([k, v]) => (s as unknown as Record<string, unknown>)[k] === v),
  );
}

/** Il nome normalizzato di una nota, per `containsNote`. */
export function noteName(name: string): string {
  return normaliseName(name, builtinScope);
}

// part-tests.mjs:93-98 — upstream l'assert vero è codice morto (`return`
// prima), quindi nessun test controlla davvero la forma degli stati. Qui il
// confronto è REALE (decisione 5 del brief): gli stati sono proiettati su
// `{op, credit, factor, reason, message, note, invalid, scale}`, cioè tutto
// tranne `scope` (che è un token non confrontabile).
const COMPARED_KEYS = ["op", "credit", "factor", "reason", "message", "note", "invalid", "scale"] as const;

/** Proietta uno stato sui campi confrontabili. */
export function projectState(s: FeedbackItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of COMPARED_KEYS) {
    if (s[k] !== undefined) {
      out[k] = s[k];
    }
  }
  return out;
}

/** Confronta davvero due liste di stati, ignorando lo `scope`.
 *
 * `ignoreMessages` toglie anche `message` dal confronto: serve dove il testo
 * dipende dal dizionario i18n (che è nostro, non quello upstream). */
export function equalStates(
  a: FeedbackItem[],
  b: Array<Record<string, unknown>>,
  options?: { ignoreMessages?: boolean },
): void {
  const project = (s: FeedbackItem): Record<string, unknown> => {
    const o = projectState(s);
    if (options?.ignoreMessages) {
      delete o["message"];
    }
    return o;
  };
  expect(a.map(project)).toEqual(b);
}

/** Il formato dei test incorporati nel JSON di una parte
 * (part_unit_tests.mjs, inventario §8.3). */
export interface PartUnitTest {
  /** Il nome del caso. */
  name: string;
  /** La risposta da inviare. */
  answer: { valid: boolean; value: Answer; empty?: boolean };
  /** Le note attese. */
  notes: Array<{
    name: string;
    expected: {
      value: string;
      messages: string[];
      warnings: string[];
      error: string;
      valid: boolean;
      credit: number;
    };
  }>;
}

// part-tests.mjs:110-155
/** Esegue i test incorporati nel JSON della parte. */
export function runPartUnitTests(p: PartBase): void {
  const tests = (p.json?.["unitTests"] ?? []) as PartUnitTest[];
  for (const test of tests) {
    const prefix = `${p.name}: ${test.name}: `;
    p.storeAnswer(test.answer.value);
    p.setStudentAnswer();
    const res = p.mark_answer(p.rawStudentAnswerAsJME(), p.getScope());
    expect(res.stateValid["mark"], prefix + "la nota mark è valida").toBe(true);
    for (const note of test.notes) {
      expect(res.states[note.name], prefix + `la nota "${note.name}" esiste`).not.toBeUndefined();
      const value = res.values[note.name];
      const expectedValue = builtinScope.evaluate(note.expected.value);
      expect(sameValue(expectedValue, value), prefix + `la nota "${note.name}" vale ${note.expected.value}`).toBe(
        true,
      );
    }
    p.credit = 0;
    p.submit();
    const messages = p.markingFeedback.map((a) => a.message ?? "").join("\n");
    const mark_note = test.notes.find((n) => n.name === "mark");
    expect(mark_note, prefix + "il caso definisce la nota mark").not.toBeUndefined();
    expect(messages, prefix + "messaggi di feedback").toBe((mark_note as PartUnitTest["notes"][0]).expected.messages.join("\n"));
    expect(p.warnings.join("\n"), prefix + "avvisi").toBe(
      (mark_note as PartUnitTest["notes"][0]).expected.warnings.join("\n"),
    );
    expect(res.stateValid["mark"], prefix + "validità").toBe((mark_note as PartUnitTest["notes"][0]).expected.valid);
    expect(p.credit, prefix + "credito").toBe((mark_note as PartUnitTest["notes"][0]).expected.credit);
  }
}

/** Due token hanno lo stesso valore? (part-tests.mjs:122-133) */
function sameValue(expected: Token | null, actual: Token | undefined): boolean {
  if (!expected || !actual) {
    return expected === (actual ?? null);
  }
  try {
    return eq(expected, actual, builtinScope);
  } catch {
    return expected.type === actual.type;
  }
}
