// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
/* Differenziale: correzione delle parti.
 *
 * Per ogni domanda del corpus, per tre semi e per tre risposte campione
 * (corretta, sbagliata, non valida) confronta `credit`, `valid` e i messaggi
 * di feedback con quelli del runtime upstream, in locale `en` da entrambe le
 * parti. Confronta anche la risposta corretta calcolata dalle due parti: è il
 * controllo che smaschera un ordine diverso nel mescolamento delle scelte.
 *
 * Le risposte campione sono derivate da una costruzione "sonda" separata
 * dell'oracolo, e ogni correzione parte da una domanda ricostruita da zero su
 * entrambi i lati: così i due flussi di numeri casuali restano allineati
 * (`getCorrectAnswer` e la correzione di una parte `jme` estraggono).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadQuestion, partErrorKeys } from "../../src/index";
import type { Answer, PartType } from "../../src/index";
import type { OracleFeedbackItem } from "./oracle";
import { loadOracle, type OracleApi } from "./oracle";
import { corpus, liveCorpus, type CorpusEntry } from "./corpus";
import {
  checkDivergences,
  checkDivergenceRegistryIsWellFormed,
  checkDivergencesAreDocumented,
  checkNoStaleDivergences,
  closeEqualDeep,
  type Diff,
  SEEDS,
} from "./compare";

let oracle: OracleApi;
beforeAll(async () => {
  oracle = await loadOracle();
}, 120_000);

/** Le tre risposte campione. */
const VARIANTS = ["corretta", "sbagliata", "nonvalida", "alternativa"] as const;
type Variant = (typeof VARIANTS)[number];

const MCQ_TYPES = new Set<PartType>(["1_n_2", "m_n_2", "m_n_x"]);

/** Proietta le voci di feedback del port sugli stessi campi dell'oracolo.
 *
 * `message` da solo lascerebbe fuori `credit_message`, dove finiscono due
 * delle tre chiavi con forma plurale: senza questo campo il differenziale non
 * saprebbe accorgersi di una regressione della pluralizzazione. */
function projectFeedback(
  items: ReadonlyArray<{
    message?: string | undefined;
    credit_message?: string | undefined;
    credit_change?: string | undefined;
    reason?: string | undefined;
  }>,
): OracleFeedbackItem[] {
  return items
    .filter((f) => (f.message ?? "") !== "" || (f.credit_message ?? "") !== "")
    .map((f) => ({
      message: f.message ?? "",
      credit_message: f.credit_message ?? "",
      credit_change: f.credit_change ?? "",
      reason: f.reason ?? "",
    }));
}

/** Ruota di una posizione le spunte, in ordine di riga: conserva il numero di
 * risposte selezionate (quindi resta valida dove il tipo impone un massimo)
 * ma sposta la selezione. */
function rotateTicks(ticks: boolean[][]): boolean[][] {
  const flat = ticks.flat();
  if (flat.length === 0) return ticks;
  const rotated = [flat[flat.length - 1] as boolean, ...flat.slice(0, -1)];
  let k = 0;
  return ticks.map((row) => row.map(() => rotated[k++] as boolean));
}

/** Le tre risposte campione per una parte dell'oracolo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parte upstream non tipizzata
function answersFor(p: any): Record<Variant, unknown> {
  const type = p.type as PartType;
  if (type === "gapfill") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
    const gaps = (p.gaps as any[]).map((g) => answersFor(g));
    return {
      corretta: gaps.map((a) => a.corretta),
      sbagliata: gaps.map((a) => a.sbagliata),
      nonvalida: gaps.map((a) => a.nonvalida),
      alternativa: gaps.map((a) => a.alternativa),
    };
  }
  // Una parte con alternative va interrogata anche con la risposta che
  // l'alternativa considera corretta: è l'unico modo di percorrere quel ramo.
  const alt = Array.isArray(p.alternatives) && p.alternatives.length > 0 ? p.alternatives[0] : undefined;
  if (MCQ_TYPES.has(type)) {
    // `getCorrectAnswer` di una parte a scelta multipla ritorna la matrice di
    // correzione (multipleresponse.js:585-590), non delle spunte: la risposta
    // "corretta" è quella che seleziona le celle di valore positivo.
    const matrix = p.getCorrectAnswer(p.getScope()) as number[][];
    const ticks = matrix.map((row) => row.map((v) => v > 0));
    const alternativa = alt === undefined ? ticks : (answersFor(alt).corretta as boolean[][]);
    return {
      corretta: ticks,
      sbagliata: rotateTicks(ticks),
      nonvalida: ticks.map((row) => row.map(() => false)),
      alternativa: alternativa,
    };
  }
  const correct = String(p.getCorrectAnswer(p.getScope()));
  const wrong = type === "numberentry" ? "-987654.321" : type === "jme" ? "0" : "risposta sbagliata";
  const alternativa = alt === undefined ? correct : (answersFor(alt).corretta as string);
  return { corretta: correct, sbagliata: wrong, nonvalida: "", alternativa: alternativa };
}

/** I percorsi delle parti a cui si può rispondere: quelle di primo livello che
 * assegnano punteggio (le `information` non si correggono, i gap si rispondono
 * attraverso il loro `gapfill`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- domanda upstream non tipizzata
function answerablePaths(q: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
  return (q.parts as any[]).filter((p) => p.type !== "information").map((p) => p.path as string);
}

/** Le parti di primo livello che il JSON dichiara e che assegnano punteggio.
 *
 * Serve a distinguere "questa domanda non ha parti da correggere" da "il
 * corpus si è degradato e non stiamo più confrontando niente". */
function declaresAnswerableParts(entry: CorpusEntry): boolean {
  const parts = (entry.json.parts ?? []) as Array<{ type?: string }>;
  return parts.some((p) => p.type !== "information");
}

describe("correzione", () => {
  it("il corpus in ambito non è degenere", () => {
    expect(liveCorpus.length).toBeGreaterThanOrEqual(42);
    expect(liveCorpus.filter((e) => e.source === "savint").length).toBeGreaterThanOrEqual(12);
  });

  const cases: Array<[string, CorpusEntry, string]> = [];
  for (const entry of corpus) {
    if (entry.skip !== undefined) continue;
    for (const seed of SEEDS) {
      cases.push([`${entry.id} [seme ${seed}]`, entry, seed]);
    }
  }

  it.each(cases)("%s", async (_name, entry, seed) => {
    // Sonda: costruzione usa e getta da cui si ricavano le risposte campione.
    let probe;
    try {
      probe = await oracle.oracleQuestion(entry.json, seed);
    } catch {
      expect(() => loadQuestion(entry.json, { seed: seed, locale: "en" })).toThrow();
      return;
    }
    const paths = answerablePaths(probe.q);
    if (declaresAnswerableParts(entry)) {
      expect(paths, `${entry.id}: il JSON dichiara parti correggibili ma l'oracolo non ne ha`).not.toEqual([]);
    }
    if (paths.length === 0) return;

    const answers: Record<Variant, Record<string, unknown>> = {
      corretta: {},
      sbagliata: {},
      nonvalida: {},
      alternativa: {},
    };
    for (const partPath of paths) {
      const sample = answersFor(probe.q.getPart(partPath));
      for (const v of VARIANTS) answers[v][partPath] = sample[v];
    }

    const diffs: Diff[] = [];

    // La risposta corretta, il punteggio massimo e — per le scelte multiple —
    // le due permutazioni di mescolamento.
    //
    // Le permutazioni vanno confrontate esplicitamente: upstream le usa solo
    // per l'ordine di presentazione (multipleresponse.js:370-381), non per la
    // matrice di correzione, quindi invertire i due `deal` non cambierebbe né
    // la risposta corretta né il numero di sorteggi consumati — e nessun altro
    // confronto se ne accorgerebbe.
    {
      const ours = loadQuestion(entry.json, { seed: seed, locale: "en" });
      for (const partPath of paths) {
        const part = ours.getPart(partPath);
        const theirPart = probe.q.getPart(partPath);
        if (!part) {
          diffs.push({ path: partPath, field: "esiste", detail: "il port non ha questa parte" });
          continue;
        }
        const mismatch = closeEqualDeep(part.correctAnswer(), theirPart.getCorrectAnswer(theirPart.getScope()));
        if (mismatch !== null) diffs.push({ path: partPath, field: "correctAnswer", detail: mismatch });
        if (part.marks !== theirPart.marks) {
          diffs.push({ path: partPath, field: "marks", detail: `nostro ${part.marks} vs oracolo ${theirPart.marks}` });
        }
        if (MCQ_TYPES.has(part.type)) {
          const mcq = part as unknown as { shuffleChoices: number[]; shuffleAnswers: number[]; layout: boolean[][] };
          for (const field of ["shuffleChoices", "shuffleAnswers", "layout"] as const) {
            const d = closeEqualDeep(mcq[field], theirPart[field]);
            if (d !== null) diffs.push({ path: partPath, field: field, detail: d });
          }
        }
      }
    }

    for (const variant of VARIANTS) {
      const theirs = await oracle.oracleMark(entry.json, seed, answers[variant]);
      const ours = loadQuestion(entry.json, { seed: seed, locale: "en" });
      for (const partPath of paths) {
        const part = ours.getPart(partPath);
        if (!part) continue;
        const theirRes = theirs[partPath];
        if (theirRes === undefined) continue;
        let res: { credit: number; valid: boolean; states: unknown[] };
        let ourError: string | undefined;
        let ourKeys: string[] = [];
        try {
          part.storeAnswer(answers[variant][partPath] as Answer);
          part.setStudentAnswer();
          res = part.mark(part.getScope()).finalised_result;
        } catch (e) {
          ourError = e instanceof Error ? e.message : String(e);
          ourKeys = partErrorKeys(e);
          res = { credit: 0, valid: false, states: [] };
        }
        // Una correzione che upstream fa fallire deve fallire anche qui (e
        // viceversa).
        if ((ourError !== undefined) !== (theirRes.error !== undefined)) {
          diffs.push({
            path: partPath,
            field: `errore[${variant}]`,
            detail: `nostro ${ourError ?? "(nessun errore)"} vs oracolo ${theirRes.error ?? "(nessun errore)"}`,
          });
          continue;
        }
        if (ourError !== undefined) {
          // I TESTI dei due messaggi vengono da cataloghi diversi e non si
          // confrontano, ma le CHIAVI sì: sono le stesse di upstream, e due
          // errori diversi non sono equivalenti solo perché sono entrambi
          // errori.
          const theirKeys = theirRes.errorKeys ?? [];
          if (JSON.stringify(ourKeys) !== JSON.stringify(theirKeys)) {
            diffs.push({
              path: partPath,
              field: `chiaviErrore[${variant}]`,
              detail: `nostro ${JSON.stringify(ourKeys)} vs oracolo ${JSON.stringify(theirKeys)}`,
            });
          }
          continue;
        }
        const ourFeedback = projectFeedback(res.states as Array<{ message?: string; reason?: string }>);
        if (res.credit !== theirRes.credit) {
          diffs.push({
            path: partPath,
            field: `credit[${variant}]`,
            detail: `nostro ${res.credit} vs oracolo ${theirRes.credit}`,
          });
        }
        if (res.valid !== theirRes.valid) {
          diffs.push({
            path: partPath,
            field: `valid[${variant}]`,
            detail: `nostro ${res.valid} vs oracolo ${theirRes.valid}`,
          });
        }
        if (JSON.stringify(ourFeedback) !== JSON.stringify(theirRes.feedback)) {
          diffs.push({
            path: partPath,
            field: `feedback[${variant}]`,
            detail: `nostro ${JSON.stringify(ourFeedback)} vs oracolo ${JSON.stringify(theirRes.feedback)}`,
          });
        }
      }
    }

    checkDivergences(entry.id, diffs);
  });
});

describe("invio della domanda", () => {
  // `mark_part` (part-tests.mjs:53-65) non passa da `submit`: non tocca il
  // marking adattivo, le penalità, il punteggio della domanda né gli avvisi.
  // Questo blocco chiude quel buco confrontando `Question#submit` intero.
  // `parziale` non è una risposta: è l'ASSENZA di risposta sulla prima parte,
  // con le altre corrette. Serve a percorrere i rami di fallimento della
  // correzione adattiva (`shouldUseInAdaptiveMarking` falso, `must_go_first`),
  // che una variante che risponde a tutto non raggiunge mai — ed è l'area con
  // più righe nel registro delle divergenze.
  const SUBMIT_VARIANTS: Array<Variant | "parziale"> = ["corretta", "sbagliata", "parziale"];
  const cases: Array<[string, CorpusEntry, string]> = [];
  for (const entry of corpus) {
    if (entry.skip !== undefined) continue;
    for (const seed of SEEDS) {
      cases.push([`${entry.id} [seme ${seed}]`, entry, seed]);
    }
  }

  it.each(cases)("%s", async (_name, entry, seed) => {
    let probe;
    try {
      probe = await oracle.oracleQuestion(entry.json, seed);
    } catch {
      return; // già coperto dal blocco precedente
    }
    const paths = answerablePaths(probe.q);
    if (declaresAnswerableParts(entry)) {
      expect(paths, `${entry.id}: il JSON dichiara parti correggibili ma l'oracolo non ne ha`).not.toEqual([]);
    }
    if (paths.length === 0) return;

    const diffs: Diff[] = [];
    for (const variant of SUBMIT_VARIANTS) {
      const answers: Record<string, unknown> = {};
      for (const partPath of paths) {
        if (variant === "parziale") {
          // la prima parte resta senza risposta
          if (partPath === paths[0]) continue;
          answers[partPath] = answersFor(probe.q.getPart(partPath)).corretta;
        } else {
          answers[partPath] = answersFor(probe.q.getPart(partPath))[variant];
        }
      }
      const theirs = await oracle.oracleSubmit(entry.json, seed, answers);
      let ours;
      let ourError: string | undefined;
      let ourKeys: string[] = [];
      try {
        ours = loadQuestion(entry.json, { seed: seed, locale: "en" });
        for (const partPath of Object.keys(answers)) {
          ours.getPart(partPath)?.storeAnswer(answers[partPath] as Answer);
        }
        ours.submit();
      } catch (e) {
        ourError = e instanceof Error ? e.message : String(e);
        ourKeys = partErrorKeys(e);
      }
      if ((ourError !== undefined) !== (theirs.error !== undefined)) {
        diffs.push({
          path: "-",
          field: `invio.errore[${variant}]`,
          detail: `nostro ${ourError ?? "(nessun errore)"} vs oracolo ${theirs.error ?? "(nessun errore)"}`,
        });
        continue;
      }
      if (ourError !== undefined || ours === undefined) {
        if (ourError !== undefined) {
          const theirKeys = theirs.errorKeys ?? [];
          if (JSON.stringify(ourKeys) !== JSON.stringify(theirKeys)) {
            diffs.push({
              path: "-",
              field: `invio.chiaviErrore[${variant}]`,
              detail: `nostro ${JSON.stringify(ourKeys)} vs oracolo ${JSON.stringify(theirKeys)}`,
            });
          }
        }
        continue;
      }

      const score = ours.score();
      if (score.score !== theirs.score) {
        diffs.push({ path: "-", field: `invio.score[${variant}]`, detail: `nostro ${score.score} vs oracolo ${theirs.score}` });
      }
      if (score.marks !== theirs.marks) {
        diffs.push({ path: "-", field: `invio.marks[${variant}]`, detail: `nostro ${score.marks} vs oracolo ${theirs.marks}` });
      }
      if (ours.answered !== theirs.answered) {
        diffs.push({
          path: "-",
          field: `invio.answered[${variant}]`,
          detail: `nostro ${ours.answered} vs oracolo ${theirs.answered}`,
        });
      }
      for (const partPath of paths) {
        const part = ours.getPart(partPath);
        const theirPart = theirs.parts[partPath];
        if (!part || theirPart === undefined) continue;
        if (part.score !== theirPart.score) {
          diffs.push({
            path: partPath,
            field: `invio.score[${variant}]`,
            detail: `nostro ${part.score} vs oracolo ${theirPart.score}`,
          });
        }
        if (part.credit !== theirPart.credit) {
          diffs.push({
            path: partPath,
            field: `invio.credit[${variant}]`,
            detail: `nostro ${part.credit} vs oracolo ${theirPart.credit}`,
          });
        }
        if (part.answered !== theirPart.answered) {
          diffs.push({
            path: partPath,
            field: `invio.answered[${variant}]`,
            detail: `nostro ${part.answered} vs oracolo ${theirPart.answered}`,
          });
        }
        const ourFeedback = projectFeedback(part.markingFeedback);
        if (JSON.stringify(ourFeedback) !== JSON.stringify(theirPart.feedback)) {
          diffs.push({
            path: partPath,
            field: `invio.feedback[${variant}]`,
            detail: `nostro ${JSON.stringify(ourFeedback)} vs oracolo ${JSON.stringify(theirPart.feedback)}`,
          });
        }
        // Gli avvisi erano concatenati al feedback: separarli distingue una
        // differenza nel messaggio da una nell'avviso.
        if (JSON.stringify(part.warnings) !== JSON.stringify(theirPart.warnings)) {
          diffs.push({
            path: partPath,
            field: `invio.warnings[${variant}]`,
            detail: `nostro ${JSON.stringify(part.warnings)} vs oracolo ${JSON.stringify(theirPart.warnings)}`,
          });
        }
      }
    }
    checkDivergences(entry.id, diffs);
  });
});

// Va in fondo al file: vitest esegue i `describe` nell'ordine in cui sono
// dichiarati, e il controllo deve vedere le divergenze incontrate da entrambi
// i blocchi.
describe("registro delle divergenze", () => {
  it("nessuna voce obsoleta in known-divergences.json", () => {
    checkNoStaleDivergences("marking");
  });

  it("ogni voce cita una riga viva di DIVERGENCES.md", () => {
    checkDivergencesAreDocumented();
  });

  it("ogni voce ha un campo «test» valido", () => {
    checkDivergenceRegistryIsWellFormed();
  });
});
