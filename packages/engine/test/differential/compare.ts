/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
/* Confronti e contabilità delle divergenze note, condivisi dai tre file
 * differenziali. Solo dev. */
import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import knownDivergences from "./known-divergences.json";

/** I tre semi su cui gira ogni fixture (decisione 2 del brief). */
export const SEEDS = ["savint-1", "savint-2", "savint-3"] as const;

/** Una differenza fra port e oracolo. */
export interface Diff {
  /** Il percorso della parte, o `"-"` se la differenza è della domanda. */
  path: string;
  /** Il campo che diverge. */
  field: string;
  /** Il dettaglio, per il messaggio d'errore. */
  detail: string;
}

/** Una divergenza accettata: deve avere un motivo e una riga in DIVERGENCES.md. */
interface KnownDivergence {
  /** Quale dei tre file differenziali la incontra. */
  test: "variables" | "display" | "marking";
  /** L'id della fixture nel corpus. */
  fixture: string;
  /** Il percorso della parte, o `"-"`. */
  path: string;
  /** Il campo. */
  field: string;
  /** Perché il port diverge. */
  reason: string;
  /** Il testo ESATTO della differenza attesa. Fissarlo impedisce che una voce
   * accettata inghiotta un cambiamento futuro di quel campo: se la differenza
   * cambia forma, la voce non la copre più e il test fallisce. */
  detail: string;
  /** La riga di DIVERGENCES.md che la documenta (prima colonna). */
  divergence: string;
  /** Da quando è nota. */
  since: string;
}

const known = knownDivergences as KnownDivergence[];

/** I tre soli valori ammessi per `test`. */
const TESTS: ReadonlyArray<KnownDivergence["test"]> = ["variables", "display", "marking"];

/** Fallisce se una voce ha un `test` che non è uno dei tre file: un refuso lì
 * dentro renderebbe la voce invisibile a `checkNoStaleDivergences` (non
 * risulterebbe mai obsoleta) pur continuando a zittire una differenza. */
export function checkDivergenceRegistryIsWellFormed(): void {
  const bad = known
    .filter((e) => !TESTS.includes(e.test))
    .map((e) => `  • ${e.fixture} · ${e.path} · ${e.field}: test «${e.test}» non è uno di ${TESTS.join(", ")}`);
  expect(bad, `voci di known-divergences.json con un campo «test» non valido:\n${bad.join("\n")}`).toEqual([]);
}

/** Le voci già incontrate, per scoprire quelle obsolete. */
const seen = new Set<string>();

const key = (fixture: string, path: string, field: string): string => `${fixture}\u0000${path}\u0000${field}`;

/** Verifica le differenze trovate su una fixture: fallisce su quelle non
 * elencate in `known-divergences.json`. */
export function checkDivergences(fixture: string, diffs: Diff[]): void {
  const unexpected: string[] = [];
  for (const d of diffs) {
    const k = key(fixture, d.path, d.field);
    const entry = known.find((e) => key(e.fixture, e.path, e.field) === k);
    if (entry === undefined) {
      unexpected.push(`  • ${fixture} · ${d.path} · ${d.field}: ${d.detail}`);
    } else if (entry.detail !== d.detail) {
      // La voce copre QUELLA differenza, non il campo in generale.
      seen.add(k);
      unexpected.push(
        `  • ${fixture} · ${d.path} · ${d.field}: la differenza accettata è cambiata\n` +
          `      attesa:  ${entry.detail}\n` +
          `      trovata: ${d.detail}`,
      );
    } else {
      seen.add(k);
    }
  }
  if (unexpected.length > 0) {
    throw new Error(
      `il port diverge dall'oracolo su ${unexpected.length} campo/i non documentato/i:\n${unexpected.join("\n")}\n` +
        "Cerca prima il baco nel port (ordine dei sorteggi, deal delle scelte, ordine di valutazione " +
        "delle variabili, arrotondamenti). Solo se la divergenza è voluta, aggiungi la riga a " +
        "DIVERGENCES.md e la voce a known-divergences.json.",
    );
  }
}

/** Fallisce se una voce di `known-divergences.json` di questo file non è più
 * una divergenza: è obsoleta e va tolta (decisione 3 del brief). */
export function checkNoStaleDivergences(test: KnownDivergence["test"]): void {
  const stale = known
    .filter((e) => e.test === test)
    .filter((e) => !seen.has(key(e.fixture, e.path, e.field)))
    .map((e) => `  • ${e.fixture} · ${e.path} · ${e.field} (${e.reason})`);
  expect(stale, `voci obsolete in known-divergences.json (il port non diverge più):\n${stale.join("\n")}`).toEqual([]);
}

/** Fallisce se una voce di `known-divergences.json` cita una riga che in
 * DIVERGENCES.md non c'è (più).
 *
 * È l'altra metà della riconciliazione: `checkNoStaleDivergences` verifica che
 * ogni voce corrisponda a una differenza ancora viva, questa che corrisponda a
 * una divergenza ancora documentata. `divergence` può citare più righe,
 * separate da " + ", e ogni pezzo deve essere esattamente la prima colonna di
 * una riga. */
export function checkDivergencesAreDocumented(): void {
  const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../DIVERGENCES.md");
  const firstColumns = new Set(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .map((line) => line.slice(2).split(" | ")[0]?.trim() ?? ""),
  );
  const orphans: string[] = [];
  for (const e of known) {
    for (const ref of e.divergence.split(" + ")) {
      if (!firstColumns.has(ref)) {
        orphans.push(`  • ${e.fixture} · ${e.path} · ${e.field} cita «${ref}», che in DIVERGENCES.md non c'è`);
      }
    }
  }
  expect(orphans, `voci di known-divergences.json senza riga in DIVERGENCES.md:\n${orphans.join("\n")}`).toEqual([]);
}

/** Collassa gli spazi: la normalizzazione dell'HTML del brief (decisione 2b). */
export function normalizeHtml(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Idem per il LaTeX (decisione 2c): l'unica differenza tollerata è la
 * spaziatura, che in LaTeX non cambia la resa. */
export function normTex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** La soglia oltre la quale `x * 1e10` esce dagli interi rappresentabili da un
 * `double` (2^53 ≈ 9.007e15): sopra, arrotondare a dieci decimali è l'identità. */
const NO_ROUNDING_ABOVE = 9e5;

/** Due numeri sono uguali "a 10 decimali", con lo stesso criterio dell'helper
 * `closeEqual` upstream (jme-tests.mjs:23-30), che confronta
 * `math.precround(x,10)` dei due valori.
 *
 * La tolleranza è ASSOLUTA, non relativa: arrotondare a dieci decimali non
 * concede nulla ai valori grandi, e infatti sopra `NO_ROUNDING_ABOVE`
 * l'arrotondamento non toglie più niente e il confronto diventa di uguaglianza
 * esatta — esattamente come upstream, dove `precround(1e25, 10)` è `1e25`.
 * Nessuna delle variabili del corpus ha bisogno di margine: coincidono tutte
 * esattamente. Vedi la sezione "Test differenziali" del design doc. */
export function closeEqual(a: number, b: number): boolean {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) > NO_ROUNDING_ABOVE || Math.abs(b) > NO_ROUNDING_ABOVE) {
    // l'uguaglianza esatta è già stata provata e ha fallito.
    return false;
  }
  return Math.round(a * 1e10) === Math.round(b * 1e10);
}

/** Un `Decimal` di decimal.js (i tre campi della rappresentazione interna).
 *
 * Non è un type predicate di proposito: restringere `unknown` con un
 * predicato qui manderebbe i rami successivi a `never`. */
function isDecimal(x: unknown): boolean {
  return typeof x === "object" && x !== null && "d" in x && "e" in x && "s" in x;
}

/** Un numero complesso, `{re, im}` — con componenti `number` o `Decimal`. */
function isComplex(x: unknown): boolean {
  return typeof x === "object" && x !== null && "re" in x && "im" in x;
}

/** Confronta due valori "spacchettati". Ritorna `null` se coincidono, o la
 * descrizione della prima differenza trovata. */
export function closeEqualDeep(ours: unknown, theirs: unknown, where = ""): string | null {
  const at = where === "" ? "" : ` in ${where}`;
  const differ = (): string => `nostro ${describe(ours)} vs oracolo ${describe(theirs)}${at}`;

  if (ours === theirs) return null;

  // `integer` spacchettato è un `number` da entrambe le parti, ma il port può
  // restituire un `bigint` con l'opzione `bigInts`: confronto numerico.
  if (typeof ours === "bigint" || typeof theirs === "bigint") {
    const a = typeof ours === "bigint" ? Number(ours) : ours;
    const b = typeof theirs === "bigint" ? Number(theirs) : theirs;
    return typeof a === "number" && typeof b === "number" && closeEqual(a, b) ? null : differ();
  }
  if (typeof ours === "number" && typeof theirs === "number") {
    return closeEqual(ours, theirs) ? null : differ();
  }
  // Un `Decimal` contro un numero È una divergenza (il port avrebbe scelto un
  // tipo diverso per la stessa variabile): va segnalata, non appiattita a
  // stringa. Il confronto per stringa vale solo fra due `Decimal`.
  if (isDecimal(ours) !== isDecimal(theirs)) return differ();
  if (isDecimal(ours) && isDecimal(theirs)) {
    // decimal.js da entrambe le parti (il port dipende dallo stesso pacchetto).
    return String(ours) === String(theirs) ? null : differ();
  }
  if (isComplex(ours) && isComplex(theirs)) {
    // `re`/`im` sono numeri per `TNum` complessi e `Decimal` per `TDecimal`.
    const a = ours as { re: unknown; im: unknown };
    const b = theirs as { re: unknown; im: unknown };
    const re = closeEqualDeep(a.re, b.re, `${where}.re`);
    if (re !== null) return re;
    return closeEqualDeep(a.im, b.im, `${where}.im`);
  }
  if (Array.isArray(ours) || Array.isArray(theirs)) {
    if (!Array.isArray(ours) || !Array.isArray(theirs)) return differ();
    if (ours.length !== theirs.length) return `lunghezza ${ours.length} vs ${theirs.length}${at}`;
    for (let i = 0; i < ours.length; i++) {
      const d = closeEqualDeep(ours[i], theirs[i], `${where}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (typeof ours === "object" && ours !== null && typeof theirs === "object" && theirs !== null) {
    const ka = Object.keys(ours).sort();
    const kb = Object.keys(theirs).sort();
    if (JSON.stringify(ka) !== JSON.stringify(kb)) {
      return `chiavi ${JSON.stringify(ka)} vs ${JSON.stringify(kb)}${at}`;
    }
    for (const k of ka) {
      const d = closeEqualDeep(
        (ours as Record<string, unknown>)[k],
        (theirs as Record<string, unknown>)[k],
        where === "" ? k : `${where}.${k}`,
      );
      if (d !== null) return d;
    }
    return null;
  }
  return differ();
}

function describe(x: unknown): string {
  if (typeof x === "string") return JSON.stringify(x);
  if (typeof x === "object" && x !== null) {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }
  return String(x);
}
