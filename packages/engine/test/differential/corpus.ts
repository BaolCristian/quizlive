/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
/* Il corpus di domande su cui gira il differenziale.
 *
 * Tre provenienze:
 *  - `upstream`: le domande JSON inline di `tests/parts/part-tests.mjs`,
 *    estratte con `scripts/engine/extract-part-tests-questions.mjs`;
 *  - `savint`: le domande scritte a mano per le superiori italiane,
 *    `test/fixtures/savint/*.json`;
 *  - `public`: le domande CC BY scaricate a mano dal database pubblico
 *    dell'editor con `scripts/engine/fetch-public-questions.sh`. La cartella
 *    è vuota nel repository (i JSON di terzi non si committano): se ci sono,
 *    entrano nel corpus da sole.
 *
 * Le domande fuori dall'ambito del port (modalità explore, `matrixentry`,
 * step, preambolo JS, estensioni, funzioni asincrone) restano nel corpus ma
 * con `skip` valorizzato: il motivo è calcolato dal JSON, non elencato a mano,
 * così una domanda nuova finisce nel posto giusto da sola.
 */
import fs from "node:fs";
import path from "node:path";
import type { NumbasQuestionJSON } from "../../src/index";

/** Una domanda del corpus. */
export interface CorpusEntry {
  /** L'identificatore stabile: lo usano `known-divergences.json` e i nomi dei test. */
  id: string;
  /** Da dove viene. */
  source: "upstream" | "savint" | "public";
  /** Il nome leggibile (upstream: modulo e nome del test QUnit). */
  name: string;
  /** Il JSON della domanda. */
  json: NumbasQuestionJSON;
  /** Se valorizzato, la domanda è fuori dall'ambito del port: il motivo. */
  skip?: string;
}

const here = path.dirname(new URL(import.meta.url).pathname);
const fixtures = path.resolve(here, "../fixtures");

/** I tipi di parte portati (decisione 3 del design doc). */
const SUPPORTED_PART_TYPES = new Set([
  "numberentry",
  "1_n_2",
  "m_n_2",
  "m_n_x",
  "patternmatch",
  "gapfill",
  "jme",
  "information",
]);

interface RawPart {
  type?: string;
  steps?: unknown[];
  gaps?: RawPart[];
  alternatives?: RawPart[];
  [k: string]: unknown;
}

function* walkParts(parts: RawPart[] | undefined): Generator<RawPart> {
  for (const p of parts ?? []) {
    yield p;
    yield* walkParts(p.gaps);
    yield* walkParts(p.alternatives);
    yield* walkParts(p.steps as RawPart[] | undefined);
  }
}

/** Perché questa domanda è fuori dall'ambito del port, o `undefined`. */
export function skipReason(json: NumbasQuestionJSON): string | undefined {
  if (json.partsMode === "explore") return "modalità explore non portata";
  if (Array.isArray(json.extensions) && json.extensions.length > 0) return "estensioni non supportate";
  if (typeof json.preamble?.js === "string" && json.preamble.js.trim() !== "") {
    return "preambolo JavaScript non supportato";
  }
  for (const f of Object.values(json.functions ?? {})) {
    if (f.language === "javascript" && f.type === "promise") return "funzioni JavaScript asincrone non supportate";
  }
  const parts = json.parts as RawPart[] | undefined;
  for (const p of walkParts(parts)) {
    if (typeof p.type === "string" && !SUPPORTED_PART_TYPES.has(p.type)) {
      return `tipo di parte «${p.type}» non portato`;
    }
    if (Array.isArray(p.steps) && p.steps.length > 0) return "step non portati";
  }
  // `part-tests.mjs` registra una funzione JME `wait` per i compiti
  // pre-invio (part.js:1904-1945): non è nel motore, e i compiti asincroni
  // sono fuori ambito.
  if (JSON.stringify(json).includes("wait(")) return "compiti pre-invio asincroni non portati";
  return undefined;
}

function entry(id: string, source: CorpusEntry["source"], name: string, json: NumbasQuestionJSON): CorpusEntry {
  const reason = skipReason(json);
  return reason === undefined ? { id, source, name, json } : { id, source, name, json, skip: reason };
}

function loadSavint(): CorpusEntry[] {
  const dir = path.join(fixtures, "savint");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as NumbasQuestionJSON;
      return entry(`savint/${f.replace(/\.json$/, "")}`, "savint", (json.name as string) ?? f, json);
    });
}

/** Le domande pubbliche scaricate in locale, se ce ne sono. */
function loadPublic(): CorpusEntry[] {
  const dir = path.join(fixtures, "public");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as NumbasQuestionJSON;
      return entry(`public/${f.replace(/\.json$/, "")}`, "public", (json.name as string) ?? f, json);
    });
}

function loadUpstream(): CorpusEntry[] {
  const file = path.join(fixtures, "upstream", "part-tests-questions.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{ name: string; data: NumbasQuestionJSON }>;
  return raw.map((q, i) => entry(`upstream/${String(i).padStart(2, "0")}`, "upstream", q.name, q.data));
}

/** Tutte le domande del corpus: `savint`, poi `upstream`, poi le eventuali
 * `public` scaricate in locale. */
export const corpus: CorpusEntry[] = [...loadSavint(), ...loadUpstream(), ...loadPublic()];

/** Le domande in ambito. */
export const liveCorpus: CorpusEntry[] = corpus.filter((e) => e.skip === undefined);
