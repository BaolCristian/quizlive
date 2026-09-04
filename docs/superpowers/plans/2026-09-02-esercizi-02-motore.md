# Esercizi 02 — Motore matematico (porting Numbas): piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un pacchetto TypeScript `packages/engine` che carica una domanda nel formato JSON di Numbas, genera una variante da un seed, produce testo e LaTeX con le variabili sostituite, corregge le risposte con lo stesso esito del runtime originale e serializza lo stato del tentativo, senza DOM e senza il namespace globale `Numbas`.

**Architecture:** Porting modulo per modulo del runtime Numbas (commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5`) nell'ordine delle dipendenze: `math` → `jme` (tokenizer, parser, tipi, scope, valutazione) → regole e calcolo → funzioni predefinite → display LaTeX, notazioni, unicode → variabili → correzione (interprete degli script JME) → parti → domanda, i18n e API pubblica → harness differenziale. Ogni modulo è accettato quando i suoi test upstream, tradotti in Vitest, passano; il bundle di test upstream compilato fa da oracolo in sviluppo. Il generatore casuale è iniettato e seminato per tentativo.

**Tech Stack:** TypeScript 5 strict, ESM, Vitest 3 (ambiente `node`), `decimal.js` 10.x, `seedrandom` 3.x, jsdom (solo per l'oracolo). Nessun npm workspace: alias `@savint/engine` in tsconfig e vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-esercizi-02-motore-design.md` (programma: `docs/superpowers/specs/2026-09-02-savint-esercizi-programma-design.md`). **Inventari dei moduli** (letti dal task che li riguarda, non tutti insieme): `docs/superpowers/plans/2026-09-02-esercizi-02-motore/inventory/inventory-0N-*.md`.

## Global Constraints

- Sorgente upstream: `numbas/Numbas` al commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5`, clonato in `.numbas-upstream/` (git-ignored) dallo script del Task 0. I task citano i file come `runtime/scripts/<file>.js:<righe>` relativi a quella cartella.
- Licenza: ogni file derivato apre con l'header
  ```
  /* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
   * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
  ```
- Nessun file sotto `packages/engine/src` sopra le **1.000 righe**; nessun import da `src/` dell'app, da `next`, `react`, e nessun uso di `window`, `document`, `fetch`, `MathJax`; niente namespace globale `Numbas`.
- Casualità: mai `Math.random` nel motore; ogni funzione che estrae numeri casuali riceve un `Rng` (`() => number` in [0,1)) dallo scope; il seed è una stringa e l'algoritmo è `seedrandom` (ARC4, pacchetto npm `seedrandom`, stesso del vendor upstream).
- Comportamento: si porta l'originale, anche dove è strano, se è coperto da test; le divergenze volute si annotano in `packages/engine/DIVERGENCES.md` e nel codice con `// upstream:`.
- Tipi di parte in ambito: `numberentry`, `1_n_2`, `m_n_2`, `m_n_x`, `patternmatch`, `gapfill`, `jme`, `information`. Fuori: `matrix`, `extension`, tipi personalizzati.
- Test: per ogni modulo prima si traducono i blocchi QUnit upstream in Vitest (`describe`/`it`, `expect`), si vede rosso, poi si porta il codice. I test del motore stanno in `packages/engine/test/unit/` con il pragma `// @vitest-environment node` in testa a ogni file. Comando: `npx vitest run packages/engine/test/unit/<file>`; l'intera suite del repo resta verde (`npm run test:run`).
- Tipi: `npx tsc -p packages/engine/tsconfig.json --noEmit` pulito a ogni task; anche `npx tsc --noEmit` alla radice.
- Lint: `npx eslint --quiet packages/engine` a 0 errori (il repo ha 123 errori preesistenti altrove: `npm run lint` non è il criterio).
- Messaggi: le chiavi `R()` upstream diventano `t(key, params)` di `packages/engine/src/i18n/`, con testi `it` ed `en` nostri.
- Commit: messaggi in italiano stile `feat(engine): ...`, e ogni commit termina con
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611`.

**Modello per task** (spec, sezione "Qualità e metodo"): Opus per i Task 2, 3, 4a, 4b, 5, 7; Sonnet per 0, 1, 6, 8, 9, 10. Il controllore può salire di livello se un task si blocca.

---

## Struttura dei file

| Percorso | Responsabilità |
|---|---|
| `scripts/engine/fetch-upstream.sh` | clona `numbas/Numbas` al commit fissato in `.numbas-upstream/` |
| `packages/engine/package.json`, `tsconfig.json`, `NOTICE`, `DIVERGENCES.md`, `README.md` | impianto del pacchetto |
| `packages/engine/src/index.ts` | API pubblica (spec, sezione "API pubblica") |
| `packages/engine/src/math/*.ts` | util numerici, precisione, decimali, rng | 
| `packages/engine/src/jme/*.ts`, `jme/builtins/*.ts` | linguaggio JME |
| `packages/engine/src/variables/*.ts` | generazione variabili |
| `packages/engine/src/marking/*.ts`, `marking/scripts/*.jme` | interprete degli script di correzione |
| `packages/engine/src/parts/*.ts` | tipi di parte |
| `packages/engine/src/question/*.ts` | domanda, stato, caricamento JSON |
| `packages/engine/src/i18n/{index,it,en}.ts` | messaggi |
| `packages/engine/test/unit/*.test.ts` | test upstream tradotti + test nostri |
| `packages/engine/test/differential/*.test.ts`, `test/fixtures/**` | oracolo e corpus |
| `packages/engine/oracle/{numbas-runtime.js,locales.js,marking_scripts.js,README.md}` | bundle upstream di test (solo dev) |
| `packages/engine/src/jme/rules*.ts`, `jme/calculus.ts`, `jme/display*.ts`, `jme/unicode.ts` | semplificazione, derivate, LaTeX/JME, mappe Unicode |
| `packages/engine/src/question/*.ts` | caricamento JSON, ciclo variabili, stato, API |
| `packages/engine/test/fixtures/{upstream,savint,public}/` | corpus del differenziale |
| `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `package.json` (radice, modifica) | alias, esclusioni, dipendenze |

---

### Task 0: Impianto del pacchetto, upstream fissato, oracolo caricabile

**Files:**
- Create: `scripts/engine/fetch-upstream.sh`, `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/NOTICE`, `packages/engine/DIVERGENCES.md`, `packages/engine/README.md`, `packages/engine/src/index.ts`, `packages/engine/oracle/README.md`, `packages/engine/oracle/numbas-runtime.js` (copiato), `packages/engine/oracle/locales.js` (copiato), `packages/engine/oracle/marking_scripts.js` (copiato: senza di esso nessuna parte ha lo script di correzione, `Numbas.raw_marking_scripts`), `packages/engine/test/differential/oracle.ts`, `packages/engine/test/differential/oracle.smoke.test.ts`
- Modify: `.gitignore`, `tsconfig.json` (paths), `vitest.config.ts` (alias), `package.json` (dipendenze)

**Interfaces:**
- Produces: alias `@savint/engine` → `packages/engine/src/index.ts`; `loadOracle(): Promise<OracleApi>` con `evaluate(expr: string): unknown`, `texify(expr: string): string`, `seed(s: string): void`, `numbas: any` (il namespace globale del bundle) per i task successivi.

- [ ] **Step 1: Script di fetch dell'upstream e ignore**

```bash
# scripts/engine/fetch-upstream.sh
#!/usr/bin/env bash
# Clona il runtime Numbas al commit fissato nella spec 02, in .numbas-upstream/ (git-ignored).
set -euo pipefail
COMMIT="0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5"
DIR="$(cd "$(dirname "$0")/../.." && pwd)/.numbas-upstream"
if [ -d "$DIR/.git" ] && [ "$(git -C "$DIR" rev-parse HEAD)" = "$COMMIT" ]; then
  echo "upstream già presente al commit $COMMIT"; exit 0
fi
rm -rf "$DIR"; mkdir -p "$DIR"
git -C "$DIR" init -q
git -C "$DIR" remote add origin https://github.com/numbas/Numbas.git
git -C "$DIR" fetch -q --depth 1 origin "$COMMIT"
git -C "$DIR" checkout -q FETCH_HEAD
echo "upstream pronto in $DIR al commit $(git -C "$DIR" rev-parse --short HEAD)"
```

`chmod +x scripts/engine/fetch-upstream.sh`. In `.gitignore` aggiungi la riga `.numbas-upstream/`. Run: `scripts/engine/fetch-upstream.sh` → stampa `upstream pronto`.

- [ ] **Step 2: Impianto del pacchetto**

```json
// packages/engine/package.json
{
  "name": "@savint/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "AGPL-3.0-only",
  "description": "Motore matematico di SAVINT Esercizi: porting in TypeScript del runtime Numbas (Apache 2.0).",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run ../../packages/engine"
  }
}
```

```json
// packages/engine/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "types": ["node"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`packages/engine/NOTICE`:
```
SAVINT Esercizi — motore matematico (packages/engine)

This package contains a TypeScript port of the Numbas runtime,
https://github.com/numbas/Numbas, at commit 0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5.
Copyright 2011-2026 Newcastle University.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
these files except in compliance with the License. You may obtain a copy at
http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied.

The port and the surrounding SAVINT code are distributed under the AGPL-3.0-only
license of the SAVINT project (see LICENSE at the repository root). Numbas is a
trademark of Newcastle University; SAVINT is not affiliated with or endorsed by
Newcastle University.
```

`packages/engine/DIVERGENCES.md` (contenuto iniziale):
```markdown
# Divergenze volute rispetto al runtime Numbas

| Area | Upstream | Motore SAVINT | Motivo |
|---|---|---|---|
| Casualità | `Math.random` globale, semina solo via funzione JME `seedrandom` | `Rng` iniettato nello scope, seminato per tentativo con `seedrandom(seed)` | ricalcolo lato server con lo stesso seed |
| Formato d'ingresso | XML compilato o JSON | solo JSON | il compilatore Python resta fuori |
| Messaggi | i18next, catalogo `en-GB` + traduzioni parziali | dizionario `it`/`en` nostro | italiano completo |
| Esame | `exam.js`: navigazione, timer, SCORM, gruppi con pesca | non portato | la composizione la fa SAVINT |
```

`packages/engine/README.md`: 15 righe: cosa è, come si usa (`import { loadQuestion } from "@savint/engine"`), come si lanciano i test, il link alla spec, la riga "Derived from Numbas, see NOTICE".

`packages/engine/src/index.ts` (segnaposto tipizzato, sostituito nel Task 9):
```ts
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
export const ENGINE_VERSION = "0.0.0";
export const UPSTREAM_COMMIT = "0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5";
```

- [ ] **Step 3: Alias, dipendenze, vitest**

In `tsconfig.json` (radice), dentro `"paths"`, aggiungi `"@savint/engine": ["./packages/engine/src/index.ts"]` dopo la riga `"@/*": ["./src/*"]`.

In `vitest.config.ts`, dentro `resolve.alias`, aggiungi `"@savint/engine": path.resolve(__dirname, "./packages/engine/src/index.ts")`, e in `test.exclude` aggiungi `".numbas-upstream/**"`.

Run: `npm install decimal.js@^10.6.0 seedrandom@^3.0.5 && npm install -D @types/seedrandom@^3.0.8` (decimal.js è già presente come dipendenza transitiva 10.6.0; diventa diretta).

- [ ] **Step 4: Oracolo — copia del bundle e smoke test**

Copia `.numbas-upstream/tests/numbas-runtime.js`, `.numbas-upstream/tests/locales.js` e `.numbas-upstream/tests/marking_scripts.js` in `packages/engine/oracle/` senza modifiche. `packages/engine/oracle/README.md`:
```markdown
# Oracolo (solo sviluppo)
Bundle di test del runtime Numbas, copiato da `tests/numbas-runtime.js`, `tests/locales.js` e `tests/marking_scripts.js`
del repository numbas/Numbas al commit 0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5 (Apache 2.0, Copyright Newcastle University).
Usato solo dai test differenziali in `packages/engine/test/differential/`; non entra nel build.
Per aggiornarlo: `scripts/engine/fetch-upstream.sh` e ricopia i due file, poi aggiorna il commit qui e in NOTICE.
```

Aggiungi in `eslint.config.mjs`, nel `globalIgnores`, le voci `"packages/engine/oracle/**"` e `".numbas-upstream/**"`.

```ts
// packages/engine/test/differential/oracle.ts
/* Carica il bundle di test upstream in Node (jsdom) e ne espone una facciata tipizzata. Solo dev. */
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import path from "node:path";

export interface OracleApi {
  numbas: any;                                   // il namespace globale Numbas del bundle
  evaluate(expr: string): any;                   // Numbas.jme.builtinScope.evaluate(expr)
  texify(expr: string): string;                  // Numbas.jme.display.exprToLaTeX(expr, [], scope)
  seed(s: string): void;                         // Math.seedrandom(s) del vendor upstream
}

let cached: Promise<OracleApi> | null = null;

export function loadOracle(): Promise<OracleApi> {
  if (cached) return cached;
  cached = (async () => {
    const dom = new JSDOM("");
    const g = globalThis as any;
    g.window = dom.window; g.document = dom.window.document; g.navigator = dom.window.navigator;
    const require = createRequire(import.meta.url);
    const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../oracle");
    require(path.join(dir, "numbas-runtime.js"));
    require(path.join(dir, "locales.js"));
    require(path.join(dir, "marking_scripts.js"));
    const Numbas = g.Numbas;
    // Come tests/headless.mjs upstream: sblocca lo scheduler dichiarando 'base' caricato.
    Numbas.queueScript("base", [], function () {});
    await new Promise((r) => setTimeout(r, 0));
    const scope = Numbas.jme.builtinScope;
    return {
      numbas: Numbas,
      evaluate: (expr: string) => scope.evaluate(expr),
      texify: (expr: string) => Numbas.jme.display.exprToLaTeX(expr, [], scope),
      seed: (s: string) => { (Math as any).seedrandom(s); },
    };
  })();
  return cached;
}
```

```ts
// packages/engine/test/differential/oracle.smoke.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { loadOracle } from "./oracle";

describe("oracolo upstream", () => {
  it("valuta 1+1 e produce LaTeX", async () => {
    const o = await loadOracle();
    expect(o.evaluate("1+1").value).toBe(2);
    expect(o.texify("x^2/2")).toContain("\\frac");
  });
  it("è deterministico a parità di seed", async () => {
    const o = await loadOracle();
    o.seed("savint"); const a = o.evaluate("random(1..1000000)").value;
    o.seed("savint"); const b = o.evaluate("random(1..1000000)").value;
    expect(a).toBe(b);
  });
});
```

Se il bundle non espone `Math.seedrandom` (vendor non incluso) o `exprToLaTeX` ha un altro nome, correggi la facciata leggendo `.numbas-upstream/tests/headless.mjs` e `.numbas-upstream/tests/jme/jme-tests.mjs` (helper in testa) e annota la differenza nel report: la facciata è il punto d'appoggio dei task 2–10.

- [ ] **Step 5: Verifica e commit**

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && npm run test:run`
Expected: smoke test 2/2 verde; tipi puliti; suite del repo verde.

```bash
git add scripts/engine packages/engine .gitignore tsconfig.json vitest.config.ts eslint.config.mjs package.json package-lock.json
git commit -m "feat(engine): impianto del pacchetto, upstream fissato e oracolo di test"
```

---

### Task 1: `math/` — util numerici, precisione, decimali, rng

**Inventario da leggere prima:** `docs/superpowers/plans/2026-09-02-esercizi-02-motore/inventory/inventory-01-math-util.md` (§2 superficie con le righe upstream, §5 test, §6 punti delicati, §7 suddivisione). Le righe citate sotto sono di `.numbas-upstream/runtime/scripts/math.js` e `util.js`.

**Files:**
- Create: `packages/engine/src/math/types.ts`, `complex.ts`, `compare.ts`, `rounding.ts`, `format.ts`, `trig.ts`, `integer-rounding.ts`, `number-theory.ts`, `ranges.ts`, `random.ts`, `fraction.ts`, `complex-decimal.ts`, `vector.ts`, `matrix.ts`, `set.ts`, `real-interval.ts`, `string-format.ts`, `combinatorics.ts`, `predicates.ts`, `index.ts` (mappa file → righe upstream in inventario §7; ogni file ≤1000 righe: `matrix.ts` e `format.ts` sono i più grandi, ~600 righe ciascuno)
- Create: `packages/engine/test/unit/math-helpers.ts` (helper comuni), `math-pure.test.ts` (blocchi QUnit puri), `math-direct.test.ts` (blocchi QUnit riscritti a chiamata diretta), `math-random.test.ts`, `math-real-interval.test.ts`, `util-strings.test.ts`
- Modify: `packages/engine/DIVERGENCES.md`, `packages/engine/src/index.ts` (re-export `* as math`)

**Interfaces:**
- Consumes: `decimal.js` (`import Decimal from "decimal.js"`), tipo `Rng` da `types.ts`.
- Produces (i task 2–8 li importano da `@savint/engine/src/math` con questi nomi esatti):

```ts
// types.ts
export type Rng = () => number;                     // in [0,1); mai Math.random nel motore
export type Complex = { complex: true; re: number; im: number };   // stessa forma upstream, NON una classe
export type NumbasNumber = number | bigint | Complex;
export type Vector = number[];
export type Matrix = NumbasNumber[][] & { rows: number; columns: number };
export type Range = [start: number, end: number, step: number];   // come upstream (math.js:2071)
export type NotationStyle = { re: RegExp; format: (integer: string, decimal: string) => string; clean?: (s: string) => string };
export function isComplex(n: unknown): n is Complex;

// complex.ts (math.js:65-417) — `complex(re, im)` collassa a `re` quando `im` è 0/falsy, come upstream (§6.3)
export function complex(re: number, im?: number): NumbasNumber;
export function add(a: NumbasNumber, b: NumbasNumber): NumbasNumber;   // sub, mul, div, pow, negate, conjugate, abs, arg, re, im, sqrt, log, exp, root, ensure_bigint ...
// compare.ts (423-666): eq (NaN==NaN true, isclose 1e-15 per i reali, esatta fra bigint), isclose, lt, gt, leq, geq, max, min, listmax, listmin, is_scalar_multiple, positive, negative, nonnegative
// rounding.ts (676-821, 1160-1401): precround, siground, countDP, countSigFigs, toGivenPrecision, toGivenPrecisionScientific, withinTolerance, parseScientific, unscientific, piDegree, toExponential, addDigits
// format.ts: niceNumber(n, options?: NiceNumberOptions), niceRealNumber, niceDecimal, niceComplexDecimal, numberToDecimal + da util.js:513-747
//   standardNumberFormatter, matchNotationStyle, cleanNumber, formatNumberNotation, parseNumber, parseDecimal, parseInt, parseFraction, numberNotationStyles (Record<string, NotationStyle>)
//   NiceNumberOptions = { precisionType?: "dp" | "sigfig"; precision?: number; style?: string; scientificStyle?: string; syntax?: "plain" | "latex"; infinity?: string; imaginary?: string; circle_constant?: { scale: number; symbol: string } }
//   lo stile predefinito è "plain" (parametro esplicito, nessuna variabile globale di locale: §8.4 → la locale entra nel Task 9)
// trig.ts, integer-rounding.ts, number-theory.ts (gcd, gcf alias, lcm, coprime, divisors, factorise, largest_square_factor, primes, primes_bigints, combinations, permutations, productRange, sum, prod, integer_partitions, factorial, gamma)
// ranges.ts: range, defineRange, rangeSteps, rangeToList, rangeToDecimalList, rangeSize, rationalApproximation
// random.ts — ogni funzione riceve `rng: Rng` come ULTIMO parametro:
export function randomint(n: number, rng: Rng): number;
export function randomrange(min: number, max: number, rng: Rng): number;
export function shuffle<T>(list: readonly T[], rng: Rng): T[];
export function deal(n: number, rng: Rng): number[];
export function choose<T>(list: readonly T[], rng: Rng): T;
export function weighted_random<T>(list: readonly [T, number][], rng: Rng): T | undefined;
export function random(range: Range, rng: Rng): number;
export function random_integer_partition(n: number, k: number, rng: Rng): number[];
export function shuffle_together<T extends unknown[][]>(lists: T, rng: Rng): T;
export function inverse(l: number[]): number[]; export function reorder<T>(list: readonly T[], order: readonly number[]): T[];
// fraction.ts: class Fraction (2364-2596) stessi nomi upstream; complex-decimal.ts: ensure_decimal, isComplexDecimal, class ComplexDecimal (2599-2861)
// vector.ts (2874-3181) namespace `vectormath`; matrix.ts (3195-3748) `matrixmath`; set.ts (3759-3834) `setmath` con eq su valori grezzi:
export function contains<T>(set: readonly T[], element: T, eq?: (a: T, b: T) => boolean): boolean;   // union, intersection, minus, uguale firma
// real-interval.ts (3836-4076): class RealInterval, class RealIntervalUnion
// predicates.ts (util.js:395-518 + 96-346, solo valori grezzi): isInt, isFloat, isFraction, isNumber, isBool, parseBool, wrapListIndex, re_fraction, copyarray, copyobj, copyinto, objects_equal, arraysEqual
// string-format.ts (util.js:749-1076, 1619-1671): slugify, lpad, rpad, formatString, formatTime, currency, separateThousands, unPercent, pluralise, capitalise, splitbrackets, contentsplitbrackets, escapeHTML, sortBy, hashCode, caselessCompare
// combinatorics.ts (util.js:1082-1309): product, cartesian_power, zip, combinations, combinations_with_replacement, permutations, letterOrdinal
// index.ts: `export * from "./complex"` ... più `export * as vectormath from "./vector"`, `export * as matrixmath from "./matrix"`, `export * as setmath from "./set"`
```

**Decisioni già prese (non riaprirle, sono le risposte a inventario §8):**
1. `primes`/`primes_bigints`: si **corregge** il baco `72077211` → `7207, 7211` (1000 primi ordinati, verificati con un test che controlla lunghezza 1000, ordinamento e che ogni elemento sia primo). Riga in `DIVERGENCES.md`.
2. Numeri complessi: si mantiene la forma upstream `{complex:true,re,im}` con collasso a `number` quando `im` è 0 (type guard `isComplex`, nessuna classe). Motivo: fedeltà con l'oracolo e con `jme` (Task 2) che fa `typeof`/`.complex` ovunque.
3. Test: si portano **ora** sia i blocchi QUnit puri (inventario §5, ~18 test) sia una versione a chiamata diretta dei blocchi che passano per `evaluate()`; il Task 4 li ripeterà via `evaluate()`, la doppia copertura è voluta.
4. Stile numerico predefinito: `"plain"`, parametro esplicito; niente globale di locale.
5. Non si portano: `debounce`, `b64encode`, `b64decode`, `prefix_css_selectors`, `document_ready`, `isNonemptyHTML` (ramo DOM: si porta solo il ramo regex), polyfill di prototipo. `nicePartName` va nel Task 8, `util.eq`/`neq`/`equalityTests`/`except`/`distinct`/`contains` su token nel Task 2.
6. `setmath` confronta valori grezzi con `eq` iniettabile (default `objects_equal`); il ciclo `util ⇄ math` sparisce. `row_echelon_form`/`reduced_row_echelon_form` non mutano l'input (copiano). Il costruttore di `Fraction` limita il ciclo di raddoppio a 64 iterazioni e poi lancia `RangeError`. Tutte e tre in `DIVERGENCES.md`.
7. `math.gcf` resta esportato come alias di `gcd`; `lcm` chiama `gcd` direttamente (§6.7).

- [ ] **Step 1: Helper di test e blocchi QUnit puri (rosso)**

`packages/engine/test/unit/math-helpers.ts` replica gli helper di `tests/jme/jme-tests.mjs:19-38`:

```ts
import { expect } from "vitest";
import * as math from "../../src/math";

/** Arrotonda a 10 decimali prima del confronto, come closeEqual upstream. */
export function closeEqual(actual: unknown, expected: unknown, message?: string): void {
  const r = (v: unknown) => (typeof v === "number" ? math.precround(v, 10) : v);
  expect(r(actual), message).toEqual(r(expected));
}
export function deepCloseEqual(actual: unknown, expected: unknown, message?: string): void {
  const r = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(r) : typeof v === "number" ? math.precround(v, 10) : v;
  expect(r(actual), message).toEqual(r(expected));
}
```

Traduci in `math-pure.test.ts`, `math-real-interval.test.ts`, `util-strings.test.ts` (ogni file inizia con `// @vitest-environment node`) esattamente questi blocchi, una `it` per ogni `assert` upstream, con lo stesso messaggio:
- `Subvars > splitbrackets` (jme-tests.mjs:67-79), `contentsplitbrackets` (80-82), `util` (129-138)
- `Evaluating > Numbas.math` (459-472), `Is scalar multiple` (960-1003), `Vector and Matrix operations` solo le assert dirette 1289-1318, `Gauss-jordan elimination` (1321-1334)
- `Real intervals` tutti e 8 (1640-1855)
- `Display > niceNumber` (2236-2251), `niceDecimal` (2253-2265), `niceComplexDecimal` (2267-2282), `Number notation styles` (2315-2431)

Run: `npx vitest run packages/engine/test/unit/math-pure.test.ts`
Expected: FAIL, `Cannot find module '../../src/math'`.

- [ ] **Step 2: `types.ts`, `complex.ts`, `compare.ts`, `rounding.ts`, `trig.ts`, `integer-rounding.ts`, `number-theory.ts`, `ranges.ts`**

Porta riga per riga nell'ordine dato (ogni file dipende dai precedenti). Vincoli specifici:
- `precround` (math.js:1160-1198), `siground` (1199-1245), `countSigFigs`/`toGivenPrecision` (1307-1349): **verbatim**, regex incluse, con un commento per ogni gruppo di cattura (§6.4, §6.11).
- `mod` (297-306): mantieni il controllo `=== 0n` così com'è (§6.6).
- `eq` (500-517): `NaN` uguale a `NaN` (§6.5).
- `ensure_bigint` e ogni ramo `typeof n === "bigint"`: mantieni, TS `target` è ES2022.

Test aggiuntivo in `math-pure.test.ts`:
```ts
it("primes: 1000 primi ordinati e corretti (divergenza dal baco 72077211)", () => {
  expect(math.primes).toHaveLength(1000);
  expect(math.primes.indexOf(7207)).toBeGreaterThan(-1);
  expect(math.primes.indexOf(7211)).toBe(math.primes.indexOf(7207) + 1);
  for (let i = 1; i < math.primes.length; i++) expect(math.primes[i]! > math.primes[i - 1]!).toBe(true);
  expect(math.primes_bigints.map(Number)).toEqual(math.primes);
});
```

Run: `npx vitest run packages/engine/test/unit/math-pure.test.ts` → i test di `Numbas.math`, `niceNumber`, `niceDecimal` restano rossi solo per `format.ts` mancante; il resto verde.

Commit: `git commit -m "feat(engine/math): numeri, confronti, arrotondamento, trigonometria e teoria dei numeri"`

- [ ] **Step 3: `random.ts`, `fraction.ts`, `complex-decimal.ts`, `format.ts`, `predicates.ts`**

`random.ts`: nei tre punti primitivi (`randomint` 1001-1003, `randomrange` 1817-1819, `weighted_random` 1878-1895) sostituisci `Math.random()` con `rng()`; le altre funzioni prendono `rng` e lo passano. Test `math-random.test.ts` con un rng deterministico:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import seedrandom from "seedrandom";
import * as math from "../../src/math";

const rngFrom = (seed: string): math.Rng => { const r = seedrandom(seed); return () => r(); };

describe("random con rng iniettato", () => {
  it("è deterministico a parità di seed", () => {
    const a = Array.from({ length: 20 }, () => math.randomint(1000, rngFrom("s")));
    const b = Array.from({ length: 20 }, () => math.randomint(1000, rngFrom("s")));
    expect(a).toEqual(b);
  });
  it("shuffle è una permutazione e non muta l'input", () => {
    const rng = rngFrom("x"); const input = [1, 2, 3, 4, 5, 6];
    const out = math.shuffle(input, rng);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]); expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("random(range) resta nel passo e nei limiti", () => {
    const rng = rngFrom("r");
    for (let i = 0; i < 200; i++) { const v = math.random([1, 9, 2], rng); expect([1, 3, 5, 7, 9]).toContain(v); }
  });
  it("deal(n) è una permutazione di 0..n-1", () => {
    expect([...math.deal(7, rngFrom("d"))].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
```

`fraction.ts`: costruttore con limite di 64 raddoppi poi `throw new RangeError("Fraction: numeratore o denominatore non convertibile a intero")` (§6.9). `complex-decimal.ts`: `toNumber()` scarta la parte immaginaria come upstream (§6.10, commento `// upstream:`). `format.ts`: `numberNotationStyles` con `clean` opzionale (§6.12); `parseNumber`/`cleanNumber`/`matchNotationStyle` verbatim dalle righe util.js:513-747.

Run: `npx vitest run packages/engine/test/unit/math-pure.test.ts packages/engine/test/unit/math-random.test.ts` → tutto verde tranne i blocchi vettori/matrici.

Commit: `git commit -m "feat(engine/math): casualità iniettata, frazioni, decimali complessi e formattazione"`

- [ ] **Step 4: `vector.ts`, `matrix.ts`, `set.ts`, `real-interval.ts`, `string-format.ts`, `combinatorics.ts`, `index.ts`**

`matrix.ts`: le matrici sono array con proprietà `rows`/`columns` (tipo `Matrix`); `row_echelon_form`/`reduced_row_echelon_form` lavorano su una copia (`matrix.map(r => [...r])` con `rows`/`columns` ricopiati). `set.ts`: `contains(set, el, eq = objects_equal)`. `index.ts` come nel blocco Interfaces. `packages/engine/src/index.ts`: aggiungi `export * as math from "./math";`.

Run: `npx vitest run packages/engine/test/unit` → tutto verde.

Commit: `git commit -m "feat(engine/math): vettori, matrici, insiemi, intervalli reali e stringhe"`

- [ ] **Step 5: Test a chiamata diretta dei blocchi `evaluate()`**

In `math-direct.test.ts` riscrivi come chiamate dirette (senza JME) le assert di questi blocchi di `jme-tests.mjs`, traducendo `evaluate('f(a,b)')` in `math.f(a,b)` e `closeEqual(...)` con l'helper: `Number functions` (righe che chiamano `abs`, `sign`, `sqrt`, `root`, `mod`, `ceil`, `floor`, `round`, `trunc`, `fract`), `Number theory/combinatorics` (`gcd`, `lcm`, `coprime`, `divisors`, `factorise`, `perm`→`permutations`, `comb`→`combinations`, `fact`→`factorial`), `Rounding` (1078-1093: tutti i casi `precround`/`siground`, incluso `precround(237.55749999999998,3)==237.558` e `precround(237.55748999999998,3)==237.557`), `Converting numbers to strings` (`niceNumber` con `dp`/`sigfig`), `Trigonometry`, `Exponentials`, `Currency` (`currency`), `Range operations` (`rangeToList`, `rangeSize`). Salta le assert che usano tipi JME (`dec(...)`, `matrix(...)` letterali, liste con `except`) annotandole in un commento in testa al file: "coperte dal Task 4 via evaluate".

Run: `npx vitest run packages/engine/test/unit/math-direct.test.ts`
Expected: verde. Un caso rosso qui è quasi sempre un errore di porting in `precround`/`siground`: confronta con l'oracolo, `npx vitest run packages/engine/test/differential/oracle.smoke.test.ts` conferma che l'oracolo gira, poi valuta la stessa espressione con `loadOracle()` in un test temporaneo.

- [ ] **Step 6: DIVERGENCES.md, verifiche, commit**

Aggiungi a `packages/engine/DIVERGENCES.md` quattro righe (primi corretti; `setmath` su valori grezzi; nessuna mutazione in `row_echelon_form`; limite nel costruttore di `Fraction`), ognuna con il riferimento upstream `math.js:<righe>`.

Run:
```bash
npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine
wc -l packages/engine/src/math/*.ts | sort -n | tail -3          # nessun file > 1000
grep -rn "Math.random\|document\|window\|Numbas\." packages/engine/src/math/ ; echo "atteso: nessuna riga sopra"
npm run test:run
```
Expected: tutto verde, nessun match ai grep, suite del repo verde.

```bash
git add packages/engine
git commit -m "feat(engine/math): test diretti dei blocchi evaluate e divergenze annotate"
```

---

### Task 2: `jme/` — tokenizer, parser, tipi, scope, valutazione (più `i18n/` ed errori)

**Inventario da leggere prima:** `inventory/inventory-02-jme-core.md` (§2 tipi token, §3 superficie con righe, §6 test, §7 punti delicati, §8 suddivisione). Righe citate: `.numbas-upstream/runtime/scripts/jme.js`.

**Files:**
- Create: `packages/engine/src/i18n/index.ts`, `i18n/it.ts`, `i18n/en.ts`
- Create: `packages/engine/src/jme/errors.ts`, `tokens.ts` (jme.js:3623-4407, 4544-4658, 5821-6280: le 24 classi `T*`, `registerType`, `getNameInfo`), `funcobj.ts` (4520-4543, 1161-1176, 2470-2490: `FuncObj`, `signature`, `parseSignature`, `describeSignature`, `converseOps`), `tokenizer.ts` (1177-1245, 1450-1642, 1782-2036), `unicode.ts` (da `runtime/scripts/unicode-mappings.js`: 7 tabelle, 1591 voci, dato puro consumato solo dal tokenizer; si porta anche `punctuation`), `parser.ts` (64-183, 282-345, 2038-2466), `scope.ts` (2491-2557, 2576-3319 senza `expandJuxtapositions`), `juxtapositions.ts` (3320-3620), `evaluate.ts` (214-281, 730-1159, 4807-4936: `evaluate`, `substituteTree`, coercizione `isType/castToType/findCompatibleType/wrapValue/unwrapValue`, `findvars`), `compare.ts` (346-405, 4671-4998, 5010-5279: `compare`, `checkingFunctions`, `resultsEqual`, `randoms`, `varsUsed`, `compareTokens*`, `treesSame`, `compareTrees`), `equality.ts` (da `util.js:150-346`: `eq`, `neq`, `equalityTests`, `except`, `distinct`, `contains` su token JME, rinviati dal Task 1; `equalityTests` per `matrix`/`vector`/`set` usa `math.matrixmath.eq` ecc.), `infer.ts` (5280-5608: `inferVariableTypes`, `inferExpressionType`, `makeFast`), `subvars.ts` (399-594: `contentsubvars`, `texsplit`, `subvars`, `tokenToDisplayString`, `typeToDisplayString`, con hook verso display), `index.ts`
- Create: `packages/engine/test/unit/jme-helpers.ts`, `jme-compiling.test.ts`, `jme-scopes.test.ts`, `jme-evaluating-core.test.ts`, `jme-coercion.test.ts`, `i18n.test.ts`
- Modify: `packages/engine/src/index.ts`, `packages/engine/DIVERGENCES.md`

**Interfaces:**
- Consumes: `math` (Task 1): `NumbasNumber`, `Complex`, `isComplex`, `Fraction`, `ComplexDecimal`, `Rng`, `objects_equal`, `arraysEqual`, `precround`, ecc.
- Produces (nomi vincolanti per i Task 3–9):

```ts
// i18n/index.ts
export type Locale = "it" | "en";
export type Params = Record<string, string | number>;
export function t(key: string, params?: Params, locale?: Locale): string;   // interpolazione `{name}`; chiave assente → ritorna la chiave stessa
export function setLocale(l: Locale): void; export function getLocale(): Locale;
// i18n/it.ts, en.ts: `export const it: Record<string, string> = { "jme.shunt.no left bracket": "Manca la parentesi aperta", ... }`

// jme/errors.ts
export class JmeError extends Error {
  readonly key: string;            // la chiave upstream, es. "jme.shunt.no left bracket" — i test confrontano questa
  readonly params: Params | undefined;
  readonly originalError: unknown;
  constructor(key: string, params?: Params, originalError?: unknown);   // message = t(key, params)
}

// jme/tokens.ts — stessa forma upstream: classi con `type` letterale, `value`, `casts` come oggetto letterale (l'ORDINE delle chiavi decide gli overload, §7.9)
export type TokenType = "nothing"|"number"|"integer"|"rational"|"decimal"|"interval"|"string"|"boolean"|"list"|"keypair"|"dict"|"set"|"vector"|"matrix"|"range"|"name"|"function"|"op"|"lambda"|"punc"|"promise"|"expression"|"scope"|"html";
export interface Tree { tok: Token; args?: Tree[]; bracketed?: boolean }
export class TNum { readonly type = "number"; value: NumbasNumber; originalValue?: string; precisionType?: "dp"|"sigfig"; precision?: number; constructor(n: NumbasNumber) }
export class TInt { readonly type = "integer"; bigValue: bigint; get value(): number /* Number(bigValue), come upstream jme.js:3743-3751 */; originalValue?: string }
export class TRational, TDecimal, TInterval, TString (safe, latex, subjme, display_latex), TBool, TList, TKeyPair, TDict, TSet, TVector, TMatrix, TRange, TName (name, annotation, nameInfo), TFunc, TOp (name, postfix, prefix, vars, precedence, commutative, associative, negated), TLambda, TPunc, TPromise, TExpression, TScope, TNothing, THTML (opaco: value: string, nessun DOM)
export type Token = TNum | TInt | ... | THTML;
export const types: Record<TokenType, new (...a: any[]) => Token>;
export function registerType(cls, name: string, casts?: Record<string, (t: Token) => Token>): void;
export function getNameInfo(name: string): NameInfo;

// jme/funcobj.ts
export class FuncObj { id: number; name: string; intype; outtype; outcons; fn; random: boolean; description; typecheck(args: Token[]): boolean; evaluate(args: Token[] | Tree[], scope: Scope): Token; constructor(name, intype: SignatureInput[], outcons, fn, options?: FuncObjOptions) }
export interface FuncObjOptions { description?: string; typecheck?; evaluate?; unwrapValues?: boolean; random?: boolean; latex?: boolean; lazy?: boolean }
export const signature: { type(t): Signature; anything(): Signature; multiple(s): Signature; optional(s): Signature; sequence(...s): Signature; list(...s): Signature; listof(s): Signature; dict(s): Signature; or(...s): Signature; label(name, s): Signature };
export function parseSignature(s: string | SignatureInput): Signature; export function describeSignature(s): string;

// jme/tokenizer.ts
export interface TokeniserOptions { closeMissingBrackets?: boolean; addMissingArguments?: boolean }
export function tokenise(expr: string, options?: TokeniserOptions): Token[];   // implementato in parser.ts (classe Parser unica, come upstream), riesportato da jme/index.ts
export const precedence: Record<string, number>, synonyms, prefixForm, postfixForm, commutative, associative, funcSynonyms, opSynonyms, relations, converseOps;
export function normaliseName(name: string, settings?: { caseSensitive?: boolean }): string;

// jme/parser.ts
export class Parser { constructor(options?: TokeniserOptions); tokenise(expr): Token[]; shunt(tokens): Tree; compile(expr: string): Tree | null; addBinaryOperator(name, opts?); addPrefixOperator(name, alt?, opts?); addPosfixOperator(name, alt?, opts?) }
export const standardParser: Parser;
export function compile(expr: string): Tree | null;   // null per stringa vuota, come upstream
export function compileList(expr: string): Tree[];

// jme/scope.ts
export class FunctionSet { constructor(name: string, options?); add(fn: FuncObj): void; ... }
export const lazyOps: string[];        // mutabile: i builtin (Task 4) vi aggiungono "if", "and", "or", "switch", ...
export class Scope {
  variables: Record<string, Token>; constants: Record<string, { value: Token; tex?: string }>; functions: Record<string, FuncObj[]>; function_sets; rulesets: Record<string, unknown>; deleted; parser: Parser; caseSensitive: boolean;
  rng: Rng;                            // ereditato dal padre; la radice senza padre usa `makeRng("savint")` (deterministico)
  question?: unknown;                  // riferimento opaco, riempito dal Task 9
  constructor(parentOrExtras?: Scope | ScopeExtras | Array<Scope | ScopeExtras>);
  clone(): Scope; setVariable(name, value): void; getVariable(name): Token | undefined; deleteVariable(name, opts?): void; setConstant(name, data): void; getConstant(name); isConstant(tok): boolean;
  addFunction(fn): FuncObj; getFunction(name): FuncObj[]; deleteFunction(name): void; addFunctionSet, getRuleset(name), setRuleset(name, ruleset), allVariables(), allFunctions(), allConstants(), allRulesets(), collectVariables()...
  matchFunctionToArguments(tok: Token, args: Token[]): { fn: FuncObj; signature: SignatureResult } | null;
  evaluate(expr: string | Tree, variables?: Record<string, unknown>, noSubstitution?: boolean): Token | null;   // null per espressione vuota, come upstream (ruling post-review Task 2)
  expandJuxtapositions(tree: Tree, options?: JuxtapositionOptions): Tree;   // implementato in juxtapositions.ts
}
export function makeRng(seed: string): Rng;   // seedrandom(seed) → () => number

// jme/evaluate.ts
export function evaluate(tree: Tree | string, scope: Scope): Token | null;
export function substituteTree(tree: Tree | null, scope: Scope, allowUnbound?: boolean, unwrapExpressions?: boolean): Tree | null;
export function findvars(tree: Tree, boundvars?: string[], scope?: Scope): string[];
export function isType(tok: Token, type: string): boolean; export function castToType(tok: Token, type: string | TypeDescription): Token; export function findCompatibleType(a: string, b: string): string | undefined;
export function wrapValue(v: unknown, typeHint?: string): Token;   // null/undefined → TString("") come upstream (§7.8)
export function unwrapValue(tok: Token, options?: { bigInts?: boolean }): unknown;
export function isDeterministic(tree: Tree, scope: Scope): boolean; export function isRandom(tree: Tree, scope: Scope): boolean;
export const findvarsOps: Record<string, (tree: Tree, boundvars: string[], scope: Scope) => string[]>;          // registri riempiti dai builtin (Task 4b) per let/map/filter/...
export const substituteTreeOps: Record<string, (tree: Tree, scope: Scope, allowUnbound: boolean) => Tree>;
export const isDeterministicOps: Record<string, (tree: Tree, scope: Scope) => boolean>;

// jme/compare.ts
export const checkingFunctions: Record<"absdiff"|"reldiff"|"dp"|"sigfig", (r1: NumbasNumber, r2: NumbasNumber, tolerance: number) => boolean>;
export function resultsEqual(r1: Token, r2: Token, checkingFunction, checkingAccuracy: number, scope: Scope): boolean;
export function compare(tree1: Tree, tree2: Tree, settings: CompareSettings, scope: Scope): boolean;
export function treesSame(a: Tree, b: Tree, scope: Scope): boolean; export function compareTrees(a: Tree, b: Tree): -1 | 0 | 1; export function varsUsed(tree: Tree): string[];

// jme/equality.ts (util.js:150-346)
export function eq(a: Token, b: Token, scope: Scope): boolean; export function neq(a: Token, b: Token, scope: Scope): boolean;
export const equalityTests: Record<string, (a: Token, b: Token, scope: Scope) => boolean>;
export function except<T extends Token>(list: T[], exclude: Token | Token[], scope: Scope): T[]; export function distinct<T extends Token>(list: T[], scope: Scope): T[]; export function contains(list: Token[], value: Token, scope: Scope): boolean;

// jme/subvars.ts
export function contentsubvars(str: string, scope: Scope, sub_tex?: boolean): string;
export function subvars(str: string, scope: Scope, sub_tex?: boolean): string;
export function texsplit(s: string): string[];
export function tokenToDisplayString(tok: Token, scope: Scope): string;
export const displayHooks: { treeToJME?: (tree: Tree, settings: unknown, scope: Scope) => string; texify?: (tree: Tree, settings: unknown, scope: Scope) => string; exprToLaTeX?: (expr: string, ruleset: unknown, scope: Scope) => string };   // riempiti da jme/display.ts (Task 5); se assenti, i rami `\var{}`/`\simplify{}`/`subjme` lanciano JmeError("jme.subvars.display not available")
```

**Decisioni già prese (risposte a inventario §9):**
1. Interpolazione `{expr}` nelle stringhe (§7.14): si porta ora `contentsubvars`/`texsplit`/`subvars` in `jme/subvars.ts`; i rami che servono `treeToJME`/`texify` passano da `displayHooks`, che il Task 5 riempie importando `jme/display.ts` da `jme/index.ts`. I test `Subvars > subvars/findvars` che usano `\var{}`/`\simplify{}` vanno nel Task 5.
2. `jme.compare` e i confronti stanno in `jme/compare.ts` (file proprio), non in `evaluate.ts`.
3. `THTML` resta come tipo opaco con `value: string`; nessun DOM.
4. `makeFast` si porta in `infer.ts` con il test `Make fast` (jme-tests.mjs:1625).
5. `TInt ↔ TDecimal` passa da stringa (`new Decimal(String(n))`), come upstream.
6. `casts` sono oggetti letterali; test esplicito che l'ordine delle chiavi decide l'overload.
7. Profondità di ricorsione: nessun limite, `RangeError` nativo come upstream.
8. `Scope.question` opzionale e opaco.
9. `function_sets`: niente registro globale; `FunctionSet` scrive solo nello scope che la contiene.
10. Prototipi: mai estendere `Array.prototype`/`String.prototype`; `contains` → `includes`, `merge` → `mergeUnique(a, b, sortfn?)` in `jme/util.ts` con la semantica esatta di util.js (unione, ordinamento, dedup).
11. `Numbas.Error` → `JmeError` con `key`; gli helper di test confrontano `err.key`.
12. `Rng`: `Scope.rng` con default deterministico `makeRng("savint")` alla radice; i builtin casuali (Task 4) leggono `scope.rng`; `loadQuestion` (Task 9) imposta `makeRng(seed)`.

- [ ] **Step 1: `i18n/` ed errori (test → codice)**

`i18n.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { t, setLocale } from "../../src/i18n";
import { JmeError } from "../../src/jme/errors";

describe("i18n", () => {
  it("traduce con parametri in it ed en", () => {
    setLocale("it"); expect(t("jme.typecheck.function not defined", { op: "foo", suggestion: "" })).toContain("foo");
    setLocale("en"); expect(t("jme.typecheck.function not defined", { op: "foo", suggestion: "" })).toContain("foo");
  });
  it("ritorna la chiave se manca", () => { expect(t("chiave.inesistente")).toBe("chiave.inesistente"); });
  it("JmeError espone la chiave upstream", () => {
    const e = new JmeError("jme.shunt.no left bracket");
    expect(e.key).toBe("jme.shunt.no left bracket"); expect(e).toBeInstanceOf(Error); expect(e.message.length).toBeGreaterThan(0);
  });
});
```
`it.ts`/`en.ts` contengono almeno le 36 chiavi elencate in inventario §7.10, con testi nostri (per l'inglese puoi partire da `.numbas-upstream/locales/en-GB.json`, chiave per chiave, riscrivendo). Ogni test dei task successivi che aggiunge chiavi le aggiunge a entrambi i file.

Run: `npx vitest run packages/engine/test/unit/i18n.test.ts` → rosso, poi verde dopo l'implementazione.

- [ ] **Step 2: Test QUnit tradotti (rosso)**

`jme-helpers.ts` replica gli helper di jme-tests.mjs:19-64: `raisesJmeError(fn, key)` (verifica `err.key`), `removePos(tree)`, `treesEqual(a, b)` (confronta `tok.type`/`tok.name`/`args.length` ricorsivamente ignorando `pos`/`bracketed`), `tokWithPos(tok, pos)`, e `makeToyScope()` che registra `FuncObj` minimi per `+`, `-`, `*`, `/`, `^`, `=`, `<`, `abs` su `number` e `if` (con `lazy: true`, aggiunto a `lazyOps`) — basta per i test di meccanismo.

Traduci una `it` per `assert`:
- `Compiling` (140-456): tutti i 20 test → `jme-compiling.test.ts`
- `Scopes` (1856-2017): `Variables`, `Functions`, `Function sets`, `Custom parser`, `Constants`, `unset`, `Scope JME functions` (con `makeToyScope()`); **non** `Rulesets` (Task 3) → `jme-scopes.test.ts`
- `Evaluating`: `jme.typecheck`, `jme.findCompatibleType`, `Number-like types`, `jme.enumerate_signatures`, `jme.inferVariableTypes`, `jme.inferExpressionType`, `wrapValue`, `Safe strings`, `Annotations`, `isRandom`, `isDeterministic`, `Sub-expressions`, `Make fast` → `jme-evaluating-core.test.ts`; se un'assert usa un builtin non in `makeToyScope()`, aggiungilo al toy scope solo se è un wrapper di una funzione di `math/` (es. `sqrt`, `floor`), altrimenti spostala in un commento in testa "coperta dal Task 4"
- `jme-coercion.test.ts`: test nostri su `castToType`/`findCompatibleType`/`wrapValue(null)`→`TString("")`, e sull'ordine delle chiavi in `casts` (registra due tipi con cast in ordine diverso e verifica quale overload vince)

Run: `npx vitest run packages/engine/test/unit/jme-compiling.test.ts` → FAIL per moduli mancanti.

- [ ] **Step 3: `tokens.ts`, `funcobj.ts`, `util.ts`**

Porta le 24 classi con `registerType` e le tabelle `casts` (inventario §2). `TInt.value` getter/setter con `ensure_bigint` (§7.4). `wrapValue`/`unwrapValue` vanno in `evaluate.ts` ma le classi hanno già i costruttori upstream (es. `new TList(value: Token[])`, `new TNum(n)`). Un file solo per i tipi rischia le 1000 righe: se `tokens.ts` supera 900 righe, sposta `TVector/TMatrix/TRange/TInterval/TSet` in `tokens-collections.ts` e ri-esporta da `tokens.ts`.

Run: `npx tsc -p packages/engine/tsconfig.json --noEmit` pulito. Commit: `feat(engine/jme): tipi di token, funcObj e firme`

- [ ] **Step 4: `unicode.ts`, `tokenizer.ts` e `parser.ts`**

`unicode.ts`: converti `unicode-mappings.js` (una riga da 59 KB) in oggetti letterali TS esportati con gli stessi nomi (`letters`, `greek`, `subscripts`, `superscripts`, `symbols`, `punctuation`, ...): usa uno script Node usa-e-getta che legge il file e stampa JSON formattato, così il file resta leggibile e sotto le 1000 righe (se sfora, spezza in `unicode-letters.ts` + `unicode-symbols.ts`). `Parser.normaliseName` (jme.js:1873-1900) applica le sostituzioni nell'ordine esatto: lettere matematiche, greche (iterando le chiavi nell'ordine del file), pedici.

Porta `tokeniser_types` **nell'ordine upstream** (§7.1) con la moltiplicazione implicita cablata in ogni riconoscitore; `make_re()` con ordinamento per lunghezza decrescente (§7.2); `shunt`/`addoutput` con relazioni incatenate, operatori negati, pipe, keypair→dict, lambda (§7.3). Regex `\p{...}` con flag `u` come upstream.

Run: `npx vitest run packages/engine/test/unit/jme-compiling.test.ts` → verde (20 test). Commit: `feat(engine/jme): tokenizer e parser shunting-yard`

- [ ] **Step 5: `scope.ts`, `juxtapositions.ts`, `evaluate.ts`**

`resolve()` con la semantica esatta di `deleted` (§7.6); `getFunction` che si ferma al primo livello con cancellazione; `deleteVariable` cancella anche la costante omonima. `Scope.evaluate` controlla `lazyOps` **prima** di valutare gli argomenti (§7.5). `matchFunctionToArguments`: prima match esatto, poi `compare_matches` sull'ordine di `Object.keys(casts)` (§7.9). `isRandom` memoizza `fn.random` (§7.12). `Scope.rng` come da Interfaces.

Run: `npx vitest run packages/engine/test/unit/jme-scopes.test.ts packages/engine/test/unit/jme-coercion.test.ts` → verde. Commit: `feat(engine/jme): scope, valutazione e coercizione dei tipi`

- [ ] **Step 6: `compare.ts`, `infer.ts`, `subvars.ts`, `index.ts`**

`subvars.ts`: `contentsubvars` string-based con `displayHooks`; `tokenToDisplayString` (jme.js:~520-560) per le stringhe semplici. `index.ts` esporta tutto; `packages/engine/src/index.ts` aggiunge `export * as jme from "./jme";`.

Run: `npx vitest run packages/engine/test/unit` → tutto verde. Commit: `feat(engine/jme): confronto, inferenza dei tipi e sostituzione nelle stringhe`

- [ ] **Step 7: Verifiche e chiusura**

`DIVERGENCES.md`: `JmeError` al posto di `Numbas.Error`; niente prototipi estesi; `displayHooks` al posto della dipendenza implicita `jme → jme.display`; `Scope.rng` con default deterministico; nessun `function_sets` globale.

Run:
```bash
npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine
wc -l packages/engine/src/jme/*.ts | sort -n | tail -3
grep -rn "Math.random\|document\.\|window\.\|Numbas\.\|prototype\." packages/engine/src/jme/ ; echo "atteso: nessuna riga sopra"
npm run test:run
```
Commit: `docs(engine): divergenze del modulo jme`

---

### Task 3: `jme/rules*.ts`, `jme/calculus.ts` — pattern matching, semplificazione, derivate

**Inventario da leggere prima:** `inventory/inventory-03-rules-calculus-builtins.md` §2 (jme-rules.js), §3 (jme-calculus.js), §7 (test), §8 punti 1-8 e 13-14, §9 (suddivisione). Righe citate: `.numbas-upstream/runtime/scripts/jme-rules.js` e `jme-calculus.js`.

**Files:**
- Create: `packages/engine/src/jme/rules-match.ts` (jme-rules.js:1-1757: `parseOptions`, `extendOptions`, `Term`, `getTerms`, `matchTree` e tutti i `match*`, `findSequenceMatch` **verbatim**, `mergeMatches`), `jme/rules-transform.ts` (1758-1849: `applyPostReplacement`, `transform`, `transformAll`, classe `Rule`), `jme/rules-parser.ts` (1850-1945: `PatternParser extends Parser`, `patternParser`, `matchExpression`), `jme/rules-ruleset.ts` (1946-2108: `displayFlags`, `Ruleset`, `collectRuleset`), `jme/rules-simplify.ts` (2109-2294: `simplificationRules`, `conflictingSimplificationRules`, `compileRules`; **senza** il blocco commentato di 17 regole 2207-2227), `jme/rules.ts` (barrel + `simplify`), `jme/calculus.ts` (jme-calculus.js intero)
- Create: `packages/engine/test/unit/jme-rules.test.ts`, `jme-simplify.test.ts`, `jme-calculus.test.ts`
- Modify: `packages/engine/src/jme/scope.ts` (`rulesets: Record<string, Ruleset>` con `import type`), `jme/index.ts`, `DIVERGENCES.md`, `i18n/{it,en}.ts` (chiavi `jme.rules.*`, `ruleset.*`, `jme.calculus.*`)

**Interfaces:**
- Consumes: `Parser`, `Tree`, `Token`, `Scope`, `compile`, `compareTrees`, `treesSame`, `normaliseName`, `JmeError` (Task 2).
- Produces:

```ts
// jme/rules-match.ts
export interface MatchTreeOptions { commutative?: boolean; associative?: boolean; allowOtherTerms?: boolean; gatherList?: boolean; strictInverse?: boolean; scope?: Scope }
export type PatternMatch = Record<string, Tree> | false;
export function matchTree(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch;
// jme/rules-transform.ts
export class Rule { pattern: Tree; result: Tree | null; options: MatchTreeOptions; name?: string; constructor(pattern: string | Tree, result: string | Tree | null, options?: string | MatchTreeOptions, name?: string); match(exprTree: Tree, scope: Scope): PatternMatch; matchAll(exprTree, scope): PatternMatch[]; replace(exprTree, scope): { expression: Tree; changed: boolean }; replaceAll(exprTree, scope): { expression: Tree; changed: boolean } }
export function transform(pattern: Tree, result: Tree, exprTree: Tree, options: MatchTreeOptions): { expression: Tree; changed: boolean };
// jme/rules-parser.ts
export class PatternParser extends Parser {}; export const patternParser: PatternParser;
export function matchExpression(pattern: string, expr: string, options?: Partial<MatchTreeOptions>): PatternMatch;
// jme/rules-ruleset.ts
export const displayFlags: Record<string, boolean>;
export class Ruleset { rules: Rule[]; flags: Record<string, boolean>; constructor(rules: Rule[], flags?: Record<string, boolean>); simplify(exprTree: Tree, scope: Scope): Tree; flagSet(name: string): boolean }
export function collectRuleset(set: string | Array<string | Rule | Ruleset>, scopeSets: Record<string, Ruleset>): Ruleset;   // "basic" aggiunto SOLO se `set` è una stringa (§8.2)
// jme/rules-simplify.ts
export const simplificationRules: Record<string, Ruleset>;   // 22 + "all" (che NON include i 6 conflicting, §8.4)
export const conflictingSimplificationRules: Record<string, Ruleset>;
// jme/rules.ts
export function simplify(tree: Tree, ruleset: string | string[] | Ruleset, scope: Scope): Tree;   // albero → albero, senza display
// jme/calculus.ts
export const derivatives: Record<string, Tree>; export const distributingDerivatives: Record<string, true>;
export function differentiate(tree: Tree, x: string, scope: Scope): Tree;
```

**Decisioni già prese:**
1. `findSequenceMatch` (1393-1573) e `matchTermSequence` si portano riga per riga, stato `capture` incluso; niente regex "vere".
2. Le regole restano in **array ordinati**; `Ruleset.simplify` mantiene il ciclo `while(changed)` con `break` alla prima regola che cambia e il rilevamento cicli oltre 100 iterazioni (§8.1).
3. `collectRuleset`: asimmetria stringa/array preservata (§8.2); nomi di ruleset e flag di display nello stesso spazio (§8.3).
4. Il blocco commentato (2207-2227) non si porta.
5. L'assert `m_strictplus` (jme-tests.mjs:2103) si traduce identica con commento `// upstream: passa perché m_strictplus è un nome qualunque`.
6. `calculus.ts` non importa display: il messaggio d'errore usa il nome della funzione, non `treeToJME` (riga 172).
7. `Scope.rulesets` diventa `Record<string, Ruleset>`; `Scope.getRuleset(name)` ritorna `Ruleset | undefined`.

- [ ] **Step 1: Test tradotti (rosso)**

`jme-rules.test.ts`: `Pattern-matching > matchExpression` (jme-tests.mjs:2033-2208, ~90 assert, con gli helper locali `matchExpression`/`matchTree`/`matchCapturedNames`) e `replace` (2209-2233). `jme-simplify.test.ts`: `Scopes > Rulesets` (1935-1960) più test nostri su `simplify`: `simplify(compile("1*x"), "basic", scope)` → albero uguale a `compile("x")` via `treesSame`; `simplify(compile("2*3"), "collectNumbers", scope)` → `6`; `"x+0"` con `"zeroTerm"` → `x`; `collectRuleset("trig", simplificationRules)` contiene le regole di `basic`, `collectRuleset(["trig"], ...)` no; `collectRuleset("all,!basic")` non contiene `basic`. `jme-calculus.test.ts`: i 20 casi di `Evaluating > Calculus` (1578-1607) riscritti come `treesSame(simplify(differentiate(compile(expr), "x", scope), "basic", scope), simplify(compile(expected), "basic", scope), scope)`; se un caso non è confrontabile così, commentalo con "verifica via treeToJME nel Task 5".

Run: `npx vitest run packages/engine/test/unit/jme-rules.test.ts` → FAIL.

- [ ] **Step 2: `rules-match.ts`, `rules-transform.ts`, `rules-parser.ts`**

Run: `npx vitest run packages/engine/test/unit/jme-rules.test.ts` → verde. Commit: `feat(engine/jme): pattern matching e riscrittura degli alberi`

- [ ] **Step 3: `rules-ruleset.ts`, `rules-simplify.ts`, `rules.ts`, `calculus.ts`**

Run: `npx vitest run packages/engine/test/unit/jme-simplify.test.ts packages/engine/test/unit/jme-calculus.test.ts` → verde. Commit: `feat(engine/jme): ruleset di semplificazione e derivate simboliche`

- [ ] **Step 4: Verifiche**

`DIVERGENCES.md`: blocco morto non portato; messaggio di `calculus` senza display.

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && wc -l packages/engine/src/jme/rules*.ts && npm run test:run`

Commit: `docs(engine): divergenze di rules e calculus`

---

### Task 4a: `jme/builtins/` (prima metà) — funzioni numeriche, algebra lineare, insiemi, intervalli, casualità, `builtinScope`

**Inventario da leggere prima:** `inventory/inventory-03-rules-calculus-builtins.md` §4 (jme-builtins.js: temi, `lazyOps`, tabella delle firme §4.4), §6 (da non portare), §7, §8 punti 9-12 e 15, §9 (tabella dei file), §10. Righe citate: `.numbas-upstream/runtime/scripts/jme-builtins.js`.

**Files:**
- Create: `packages/engine/src/jme/builtins/registry.ts` (helper `add(scope, name, intype, outcons, fn, options)` che replica `set.add_function`, e i 9 `sig.*`), `builtins/constants.ts` (le 6 costanti: `e`, `pi`/`π`, `i`, `infinity`/`infty`/`∞`, `nothing`... come upstream righe ~41-86), `builtins/arithmetic.ts` (87-180), `builtins/complex-exponentials.ts` (182-215), `builtins/trigonometry.ts` (216-275), `builtins/rounding.ts` (281-423), `builtins/number-theory.ts` (425-528), `builtins/comparison.ts` (531-566), `builtins/linear-algebra.ts` (569-859; `numrows`/`numcolumns` registrati **una volta**, la seconda registrazione upstream è irraggiungibile: commento `// upstream:`), `builtins/booleans.ts` (878-966), `builtins/sets-intervals.ts` (968-1091), `builtins/ranges.ts` (1108-1192), `builtins/number-parsing.ts` (1916-2210; `scientificnumberhtml` come stringa pura), `builtins/randomisation.ts` (2927-3012), `builtins/index.ts`
- Create: `packages/engine/test/unit/builtins-numeric.test.ts`, `builtins-linear-algebra.test.ts`, `builtins-random.test.ts`, `builtins-intervals.test.ts`
- Modify: `packages/engine/src/jme/index.ts`, `DIVERGENCES.md`, `i18n/{it,en}.ts` (tutte le chiavi `Numbas.Error(` dei file portati: enumerale con `grep -n "Numbas.Error(" .numbas-upstream/runtime/scripts/jme-builtins.js`)

**Interfaces:**
- Consumes: Task 1 (`math`, funzioni casuali con `rng` in coda), Task 2 (`Scope`, `FuncObj`, `signature`, `types`, `lazyOps`, `findvarsOps`, `substituteTreeOps`, `isDeterministicOps`, `makeRng`, `JmeError`), Task 3 (`Ruleset`, per `builtinScope.rulesets`).
- Produces:

```ts
// jme/builtins/registry.ts
export function add(scope: Scope, name: string, intype: SignatureInput[], outcons: TokenCtor | "?", fn: ((...a: any[]) => unknown) | null, options?: FuncObjOptions): FuncObj;
export const sig: { type(t: string): Signature; anything(): Signature; multiple(s): Signature; optional(s): Signature; sequence(...s): Signature; list(...s): Signature; listof(s): Signature; dict(s): Signature; or(...s): Signature; label(name, s): Signature };
// jme/builtins/index.ts
export function registerBuiltins(scope: Scope): void;    // chiama registerConstants, registerArithmetic, ..., registerRandomisation; nel Task 4b si estende
export const builtinScope: Scope;                         // radice: new Scope({ rulesets: simplificationRules }) + registerBuiltins; rng = makeRng("savint")
// ogni builtins/<tema>.ts: export function register<Tema>(scope: Scope): void
```

**Decisioni già prese:**
1. Le funzioni casuali leggono `scope.rng` e chiamano `math.random(range, scope.rng)`, `math.shuffle(list, scope.rng)`, ecc. Il builtin `seedrandom(seed, expr)` è lazy: valuta `expr` in `new Scope(scope)` con `rng = makeRng(seed)` (niente monkey-patch, §8.12).
2. `THTML` resta opaco (Task 2); il tema `html` va nel Task 4b solo per le funzioni pure.
3. `http` e `promises` non si portano (§10.3); `TPromise` non è mai prodotto.
4. Overload: "primo esatto vince, a parità vince il primo registrato" è già in `Scope.matchFunctionToArguments` (Task 2); l'ordine di registrazione qui è quello upstream.
5. Le funzioni con `options.evaluate` ma non lazy ricevono argomenti già valutati; solo i 32 nomi di `jme.lazyOps` (§4.3) vengono aggiunti a `lazyOps`.
6. I doc-tests (540 esempi) confrontano tramite `treeToJME`: si eseguono alla fine del Task 5, non qui. Qui l'accettazione sono i blocchi `Evaluating` che confrontano valori.

- [ ] **Step 1: Test tradotti (rosso)**

Traduci da `Evaluating` (jme-tests.mjs:457-1639), con `evaluate = (expr) => builtinScope.evaluate(expr)` e gli helper `closeEqual`/`deepCloseEqual`/`raisesJmeError`: `Arithmetic`, `Number functions`, `Number theory/combinatorics`, `Ordering numbers`, `Rounding`, `Currency`, `Converting numbers to strings`, `Random numbers` (con `builtinScope.rng = makeRng("test")` all'inizio), `Exponentials`, `Trigonometry`, `Vector and Matrix operations`, `Gauss-jordan elimination`, `Range operations`, `Number-like types`, `Boolean operations`, e `Real intervals` (1640-1855) per intero. Un blocco che usa funzioni del Task 4b (`map`, `filter`, `let`, `string`, `latex`, `join`...) va nel Task 4b: elencalo in un commento in testa.

Run: `npx vitest run packages/engine/test/unit/builtins-numeric.test.ts` → FAIL.

- [ ] **Step 2: `registry.ts`, `constants.ts`, `index.ts` con `builtinScope`, poi i temi numerici**

Porta `arithmetic`, `complex-exponentials`, `trigonometry`, `rounding`, `number-theory`, `comparison`, `booleans`, `number-parsing`. `translate` non è qui (Task 4b).

Run: `npx vitest run packages/engine/test/unit/builtins-numeric.test.ts` → verde. Commit: `feat(engine/jme): scope predefinito e funzioni numeriche`

- [ ] **Step 3: `linear-algebra`, `sets-intervals`, `ranges`, `randomisation`**

Run: `npx vitest run packages/engine/test/unit/builtins-*.test.ts` → verde; `builtins-random.test.ts` verifica anche che `builtinScope.evaluate("seedrandom('a', random(1..1000000))")` sia stabile e che due `Scope` con `makeRng("k")` diano la stessa sequenza. Commit: `feat(engine/jme): algebra lineare, insiemi, intervalli e casualità seminata`

- [ ] **Step 4: Verifiche**

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && wc -l packages/engine/src/jme/builtins/*.ts | sort -n | tail -3 && grep -rn "Math.random\|document\|window\|fetch(" packages/engine/src/jme/builtins/ ; npm run test:run`

Commit: `docs(engine): divergenze dei builtin numerici`

---

### Task 4b: `jme/builtins/` (seconda metà) — liste, dizionari, stringhe, cast, sotto-espressioni, controllo di flusso, comprensioni

**Inventario da leggere prima:** come il Task 4a, in particolare §4.4 per i temi `lists`, `dictionaries`, `strings`, `type_casting`, `jme`, `pattern_matching`, `control_flow`, `comprehensions`, `calculus`, `marking`, `html`; §8 punti 10, 11, 15.

**Files:**
- Create: `packages/engine/src/jme/builtins/lists.ts` (1195-1547), `dictionaries.ts` (1550-1659), `strings.ts` (1662-1812; `translate` → `t()` di `i18n/`), `type-casting.ts` (1815-1913; `latex`/`string` via `displayHooks`, `simplify` via `rules.simplify`), `jme-introspection.ts` (2213-2636, **senza** `make_variables`, che il Task 6 registra), `pattern-matching.ts` (2639-2766), `html-pure.ts` (solo `escape_html`, `isnonemptyhtml` come stringhe; `html`, `image`, `table`, `max_width`, `max_height` non portati), `control-flow.ts` (3015-3224), `comprehensions.ts` (3227-3750), `differentiation.ts` (3753-3766, builtin `diff` su `calculus.ts`), `marking-builtins.ts` (3769-3782, `resultsequal` su `jme/compare.ts`)
- Create: `packages/engine/test/unit/builtins-lists.test.ts`, `builtins-strings.test.ts`, `builtins-control-flow.test.ts`, `builtins-subexpressions.test.ts`
- Modify: `builtins/index.ts` (registra i nuovi temi), `DIVERGENCES.md`, `i18n/{it,en}.ts`

**Interfaces:**
- Consumes: Task 4a (`add`, `sig`, `builtinScope`), Task 3 (`simplify`, `matchExpression`, `Rule`, `differentiate`), Task 2 (`displayHooks`, `findvarsOps`, `substituteTreeOps`, `isDeterministicOps`, `lazyOps`, `resultsEqual`, `checkingFunctions`).
- Produces: `registerBuiltins` completo; i 14 gestori di `findvarsOps` per `let`, `map`, `for:`, `filter`, `iterate`, `iterate_until`, `foldl`, `take`, `|>`, `try`, `satisfy`, `isset`, `safe`, `render` (§8.11).

**Decisioni già prese:**
1. `make_variables` è registrato dal Task 6; `latex`/`string`/`render` che dipendono dal display funzionano dopo il Task 5 (`displayHooks`): i loro test vanno nel Task 5.
2. `satisfy(names, definitions, conditions, maxRuns)` si porta qui (è un builtin, non il ciclo di domanda).
3. `resultsequal` usa `jme/compare.ts` del Task 2 (nessuno stub).

- [ ] **Step 1: Test tradotti (rosso)**

Da `Evaluating`: `List operations`, `Dictionaries`, `Branching`, `Repetition`, `Sub-expressions` (le assert senza `latex`/`string`), `Safe strings`, `HTML` solo `escape_html`; da `Scopes`: `Scope JME functions` se non già verde con il toy scope del Task 2 (sostituisci `makeToyScope()` con `builtinScope`).

Run: `npx vitest run packages/engine/test/unit/builtins-lists.test.ts` → FAIL.

- [ ] **Step 2: `lists`, `dictionaries`, `strings`, `html-pure`, `type-casting`**

Commit: `feat(engine/jme): liste, dizionari, stringhe e cast`

- [ ] **Step 3: `control-flow`, `comprehensions`, `jme-introspection`, `pattern-matching`, `differentiation`, `marking-builtins`**

Aggiungi i nomi lazy a `lazyOps` e i gestori a `findvarsOps`/`substituteTreeOps`/`isDeterministicOps` nel punto di registrazione di ogni funzione (stesse righe upstream).

Run: `npx vitest run packages/engine/test/unit` → verde; anche i test del Task 2 che citavano "coperta dal Task 4" vanno riattivati ora (sostituendo il toy scope con `builtinScope`). Commit: `feat(engine/jme): controllo di flusso, comprensioni e sotto-espressioni`

- [ ] **Step 4: Verifiche**

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && wc -l packages/engine/src/jme/builtins/*.ts | sort -n | tail -3 && grep -rn "Math.random\|document\|window\|fetch(\|new Function" packages/engine/src/jme/builtins/ ; npm run test:run`

Commit: `docs(engine): divergenze dei builtin strutturali`

---

### Task 5: `jme/display*.ts` — LaTeX e JME da alberi

**Inventario da leggere prima:** `inventory/inventory-04-display-notations-unicode-variables.md` (§2 jme-display.js, §3 notazioni, §8 test, §9 punti delicati, §10 suddivisione). Righe citate: `.numbas-upstream/runtime/scripts/jme-display.js`.

**Files:**
- Create: `packages/engine/src/jme/display.ts` (jme-display.js:26-149 API di alto livello, 860-1046 `Displayer` base, 1048-1648 `Texifier`/`texify`), `jme/display-tex.ts` (151-858: `texOps` 91 voci, `typeToTeX` 19 voci, `texNameAnnotations`, `specialNames`, `texUnaryAdditionOrMinus`, `texTimesSymbol`), `jme/display-jme.ts` (1650-1996 `typeToJME` 21 voci, `jmeFunctions`, `opBrackets`, `jmeOpSymbols`; 1998-2333 `JMEifier`/`treeToJME`)
- Create: `packages/engine/test/unit/jme-display.test.ts`, `jme-subvars-tex.test.ts`
- Modify: `packages/engine/src/jme/index.ts` (importa `./display` per riempire `displayHooks`), `DIVERGENCES.md`

**Interfaces:**
- Consumes: `Tree`, `Token`, `Scope`, `displayHooks` (Task 2); `Ruleset`, `simplify` (Task 3); `math.niceNumber`, `numberNotationStyles` (Task 1); builtin `with_precision`/`imprecise` (Task 4).
- Produces:

```ts
// jme/display.ts
export interface DisplaySettings { fractionnumbers?: boolean; mixedfractions?: boolean; flatfractions?: boolean; rowvector?: boolean; alwaystimes?: boolean; timesdot?: boolean; timesspace?: boolean; noscientificnumbers?: boolean; nicenumber?: boolean; barematrices?: boolean; accuracy?: number; ignorestringattributes?: boolean; wrapexpressions?: boolean; matrixcommas?: boolean; store_precision?: boolean; [k: string]: unknown }
export const NICE_NUMBER_MAX_LENGTH = 20;   // soglia "out.length > 20" ripetuta 6 volte upstream (§9), una sola costante qui
export function texify(tree: Tree, settings: DisplaySettings, scope: Scope): string;
export function treeToJME(tree: Tree, settings: DisplaySettings, scope: Scope): string;
export function exprToLaTeX(expr: string, ruleset: string | string[] | Ruleset, scope: Scope, parser?: Parser): string;
export function treeToLaTeX(tree: Tree, ruleset: string | string[] | Ruleset, scope: Scope): string;
export function simplifyExpression(expr: string, ruleset: string | string[] | Ruleset, scope: Scope, parser?: Parser): string;
export function simplifyTree(tree: Tree, ruleset: Ruleset, scope: Scope, allowUnbound?: boolean): Tree;
export function subvars(expr: string, scope: Scope): Tree;   // jme-display.js:~120-149
```

**Decisioni già prese (risposte a inventario §11):**
1. `jme-notations.js` **non si porta**: il JSON di domanda non seleziona notazioni e i tipi di parte in ambito usano il parser standard. Riga in `DIVERGENCES.md`; il test `Built-in notations` resta fuori.
2. `unicode-mappings.js` è già nel Task 2 (`jme/unicode.ts`), qui non si tocca.
3. `numberNotationStyles` sta in `math/format.ts` (Task 1).
4. Nessun ciclo di import: `display*.ts` importa da `jme/tokens`, `scope`, `evaluate`, `rules`; `subvars.ts` (Task 2) non importa display, usa `displayHooks`; `jme/index.ts` importa `./display` così gli hook sono sempre riempiti quando si importa `@savint/engine`.
5. `registerType` per il display non esiste: `typeToTeX`/`typeToJME` sono dizionari statici completi per i 24 tipi.
6. `align_text_blocks`, `tree_diagram` e gli alias di compatibilità (2336-2479) non si portano.
7. LaTeX: i test upstream si traducono con confronto **esatto** della stringa; solo se un caso fallisce esclusivamente per spazi si confronta dopo `normTex = (s) => s.replace(/\s+/g, " ").trim()` e si annota con `// upstream: differenza di soli spazi`.

- [ ] **Step 1: Test tradotti (rosso)**

`jme-display.test.ts` (una `it` per `assert`): `Display > tokens with precision` (jme-tests.mjs:2284), `subvars` (2432), `token to display string` (2437), `tree to JME` (2458-2598), `Simplify surds` (2600), `brackets involving subtraction` (2610), `localisation doesn't affect treeToJME` (2618), `Localise number representation` (2627), `large product` (2650), `texName` (2657), `texify` (2693), `expression to LaTeX` (2732-2824), `Tree to LaTeX` (2826). I test usano `Numbas.jme.builtinScope` → `builtinScope` del Task 4.
`jme-subvars-tex.test.ts`: `Subvars > subvars` (83-94) e `findvars` (95-119) rinviati dal Task 2 (usano `\var{}`/`\simplify{}` e `jme.display`).

Run: `npx vitest run packages/engine/test/unit/jme-display.test.ts` → FAIL.

- [ ] **Step 2: `display-tex.ts`**

Porta i dizionari verbatim. Attenzione (§9): `texOps['-']` coniuga il secondo operando complesso (righe 357-361); `texUnaryAdditionOrMinus` (251-274) nega `re`/`im` direttamente; la moltiplicazione implicita TeX (300-341) ha 9 casi **nell'ordine del codice**; `texTimesSymbol` (1462) dipende da `timesdot`/`timesspace`, non da `alwaystimes`; frazioni con tre flag indipendenti (`fractionnumbers`, `mixedfractions`, `flatfractions`); π scalato via `piDegree` e `scope.getConstant` (920, 1216-1233).

- [ ] **Step 3: `display.ts` (`Displayer`, `Texifier`, API)**

`Displayer<TOut>` base astratta con i campi-dizionario sovrascrivibili; `Texifier` estende. `exprToLaTeX`/`treeToLaTeX`/`simplifyExpression` compilano, semplificano con `rules.simplify` (Task 3) e chiamano `texify`. In coda al file: `displayHooks.treeToJME = treeToJME; displayHooks.texify = texify; displayHooks.exprToLaTeX = exprToLaTeX;` (import da `./subvars`).

Run: `npx vitest run packages/engine/test/unit/jme-display.test.ts -t "LaTeX|texify|texName"` → verde.

- [ ] **Step 4: `display-jme.ts` (`JMEifier`, `treeToJME`)**

Euristica JME per la moltiplicazione implicita separata da quella TeX (1821-1840, non condividere la funzione, §9). `store_precision` produce `imprecise(x)`/`with_precision(x, p, t)` (funzioni JME del Task 4). `JMEifier.prototype.niceNumber` (2113) è un wrapper che inietta i simboli dello scope: non confonderlo con `settings.nicenumber` né con `math.niceNumber`.

Run: `npx vitest run packages/engine/test/unit` → tutto verde, compresi i doc-tests del Task 4 che confrontano `treeToJME` senza spazi.

- [ ] **Step 5: Verifiche e commit**

`DIVERGENCES.md`: notazioni non portate; `NICE_NUMBER_MAX_LENGTH` unica; niente `registerType` di display; eventuali `normTex`.

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && wc -l packages/engine/src/jme/display*.ts && npm run test:run`

```bash
git add packages/engine
git commit -m "feat(engine/jme): display LaTeX e JME degli alberi"
```

---

### Task 6: `variables/` — generazione delle variabili, funzioni e ruleset personalizzati, script di note

**Inventario da leggere prima:** `inventory/inventory-04-display-notations-unicode-variables.md` §5 (jme-variables.js: layout, superficie, algoritmo §5.3, DOM vs puro §5.4), §9 (determinismo), §10. Righe citate: `.numbas-upstream/runtime/scripts/jme-variables.js`.

**Files:**
- Create: `packages/engine/src/variables/generate.ts` (191-245 `computeVariable`, 328-398 `splitVariableNames`/`makeVariables`, 482-526 `remakeVariables`, 613-687 `variableDependants`), `variables/functions.ts` (51-182), `variables/rulesets.ts` (536-576), `variables/constants.ts` (585-605), `variables/note-script.ts` (795-939 `re_note`, `ScriptNote`, `noteScriptConstructor`), `variables/subvars.ts` (parte pura di `DOMsubvars` 708-774 → `substituteHtml`), `variables/builtins.ts` (registra il builtin `make_variables`, jme-builtins.js tema `jme`, rinviato dal Task 4b: `registerVariablesBuiltins(scope)`; `variables/index.ts` lo chiama su `builtinScope` all'import), `variables/index.ts`
- Create: `packages/engine/test/unit/variables.test.ts`, `variables-note-script.test.ts`
- Modify: `packages/engine/src/index.ts`, `DIVERGENCES.md`, `i18n/it.ts`, `i18n/en.ts` (chiavi `jme.variables.*`, `ruleset.*`)

**Interfaces:**
- Consumes: `Scope`, `Tree`, `Token`, `FuncObj`, `compile`, `evaluate`, `findvars`, `JmeError` (Task 2); `contentsubvars`, `tokenToDisplayString` (Task 2, `jme/subvars.ts`); `Ruleset`, `collectRuleset` (Task 3).
- Produces:

```ts
// variables/generate.ts
export interface VariableDef { tree: Tree | null; vars: string[]; names?: string[]; originalName?: string; description?: string; templateType?: string; definition?: string }
export type VariablesTodo = Record<string, VariableDef>;   // ordine di inserimento = ordine del JSON (§9: determina l'ordine dei draw casuali)
export function computeVariable(name: string, todo: VariablesTodo, scope: Scope, path?: string[], computeFn?: typeof computeVariable): Token;
export function makeVariables(todo: VariablesTodo, scope: Scope, condition?: Tree | null, computeFn?: typeof computeVariable, targets?: string[]): { variables: Record<string, Token>; conditionSatisfied: boolean; scope: Scope };
export function remakeVariables(todo: VariablesTodo, changed: Record<string, Token>, scope: Scope, computeFn?, targets?: string[]): Scope;
export function variableDependants(todo: VariablesTodo, ancestors: string[], scope: Scope): VariablesTodo;
export function splitVariableNames(s: string): string[];

// variables/functions.ts
export interface FunctionDef { name: string; definition: string; language: "jme" | "javascript"; outtype: string; parameters: Array<{ name: string; type: string }> }
export function makeFunction(def: FunctionDef, scope: Scope, withEnv?: Record<string, unknown>, options?: { allowJavascript?: boolean }): FuncObj;
export function makeFunctions(defs: FunctionDef[], scope: Scope, withEnv?, options?): Record<string, FuncObj>;

// variables/rulesets.ts
export function computeRuleset(name: string, todo: Record<string, unknown>, scope: Scope, path?: string[]): Ruleset;
export function makeRulesets(todo: Record<string, unknown>, scope: Scope): Record<string, Ruleset>;

// variables/constants.ts
export function makeConstants(definitions: Array<{ name: string; value: string; tex: string }>, scope: Scope, enabled?: Record<string, boolean>): string[];

// variables/note-script.ts
export class ScriptNote { name: string; description: string; expr: string; tree: Tree; vars: string[]; constructor(source: string, scope: Scope) }
export interface NoteScript<TResult> { notes: Record<string, ScriptNote>; evaluate(scope: Scope, variables?: Record<string, Token>): TResult; evaluate_note(note: string, scope: Scope, variables?): TResult; source: string; base?: NoteScript<TResult> }
export function noteScriptConstructor<TResult>(constructScope: (scope: Scope, variables?) => Scope, processResult: (result, scope: Scope) => TResult, computeNote?: typeof computeVariable): new (source: string, base?: NoteScript<TResult>, scope?: Scope) => NoteScript<TResult>;

// variables/subvars.ts
export function substituteHtml(html: string, scope: Scope): string;   // = contentsubvars(html, scope, true) con la serializzazione per tipo di doToken (708-774): stringhe grezze, liste separate da virgola, html come stringa, resto via tokenToDisplayString
```

**Decisioni già prese:**
1. Solo le versioni **sincrone**: `computeVariablePromise`/`makeVariablesPromise` e `TPromise` non si portano (nessun tipo di parte in ambito è asincrono, inventario 05 §6.9). Il test `Promises > makeVariablesPromise` (jme-tests.mjs:2833) resta fuori; riga in `DIVERGENCES.md`.
2. `makeVariables` valuta la `condition` **una volta**; il ciclo `maxRuns` è del Task 9.
3. L'ordine di `Object.keys(todo)` è l'ordine del JSON: vietato riordinare (alfabetico, topologico) — un test lo verifica con un rng contato.
4. `DOMcontentsubber`, `DOMcontentsubvars`, la coda DOM di `DOMsubvars` non si portano: `substituteHtml` lavora su stringa (niente attributi, niente salto di `<script>`); riga in `DIVERGENCES.md`.
5. Funzioni JavaScript personalizzate (`makeJavascriptFunction`, `new Function`): si portano; `options.allowJavascript` predefinito `true` (il Task 9 lo espone in `LoadOptions.allowJavascriptFunctions`, predefinito `true`). Motivo: molte domande pubbliche le usano; il contenuto è dei docenti.
6. Nessun `rng` esplicito qui: le funzioni casuali leggono `scope.rng` (Task 2/4).

- [ ] **Step 1: Test (rosso)**

`variables.test.ts` (nostri, non esistono test upstream puri; usa `builtinScope` del Task 4 come padre):
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Scope, compile, findvars, makeRng } from "../../src/jme";
import { builtinScope } from "../../src/jme/builtins";
import { makeVariables, remakeVariables, variableDependants } from "../../src/variables";
import { JmeError } from "../../src/jme/errors";

const def = (expr: string) => { const tree = compile(expr)!; return { tree, vars: findvars(tree), definition: expr }; };
const fresh = (seed = "s") => { const s = new Scope(builtinScope); s.rng = makeRng(seed); return s; };

describe("makeVariables", () => {
  it("risolve le dipendenze ricorsivamente", () => {
    const r = makeVariables({ a: def("b+1"), b: def("2") }, fresh());
    expect(r.variables.a!.value).toBe(3); expect(r.conditionSatisfied).toBe(true);
  });
  it("riferimento circolare → chiave upstream", () => {
    expect(() => makeVariables({ a: def("b"), b: def("a") }, fresh())).toThrow(JmeError);
    try { makeVariables({ a: def("b"), b: def("a") }, fresh()); } catch (e) { expect((e as JmeError).key).toBe("jme.variables.circular reference"); }
  });
  it("assegnazione multipla a,b", () => {
    const r = makeVariables({ "a,b": def("[1,2]") }, fresh());
    expect(r.variables.a!.value).toBe(1); expect(r.variables.b!.value).toBe(2);
  });
  it("la condizione è valutata una volta e non rigenera", () => {
    const r = makeVariables({ n: def("random(1..6)") }, fresh("x"), compile("n>100"));
    expect(r.conditionSatisfied).toBe(false);
  });
  it("stesso seed → stessi valori; l'ordine del JSON decide i draw", () => {
    const todo = () => ({ a: def("random(1..1000)"), b: def("random(1..1000)") });
    const r1 = makeVariables(todo(), fresh("k")); const r2 = makeVariables(todo(), fresh("k"));
    expect(r1.variables.a!.value).toBe(r2.variables.a!.value); expect(r1.variables.b!.value).toBe(r2.variables.b!.value);
    const swapped = makeVariables({ b: def("random(1..1000)"), a: def("random(1..1000)") }, fresh("k"));
    expect(swapped.variables.b!.value).toBe(r1.variables.a!.value);
  });
  it("remakeVariables ricalcola solo i dipendenti", () => {
    const todo = { a: def("1"), b: def("a+1"), c: def("5") };
    const r = makeVariables(todo, fresh());
    const s2 = remakeVariables(todo, { a: r.scope.evaluate("10") }, r.scope);
    expect(s2.getVariable("b")!.value).toBe(11); expect(s2.getVariable("c")!.value).toBe(5);
    expect(Object.keys(variableDependants(todo, ["a"], r.scope))).toEqual(["b"]);
  });
});
```
`variables-note-script.test.ts`: costruisci con `noteScriptConstructor` una classe con `constructScope = (s) => new Scope(s)` e `processResult = (r) => r`, valuta lo script `"a: 1\nb (la somma): a+1"` e verifica `notes.b.description === "la somma"`, `evaluate(scope).variables.b.value === 2`, errore `jme.variables.circular reference` su `"a: b\nb: a"`.

Run: `npx vitest run packages/engine/test/unit/variables.test.ts` → FAIL.

- [ ] **Step 2: Porting**

Porta `generate.ts` (mantieni `newpath.splice(0,0,name)` e i messaggi di errore con le chiavi di §5.3), `functions.ts`, `rulesets.ts`, `constants.ts`, `note-script.ts`, `subvars.ts`, `index.ts`; chiavi i18n `jme.variables.empty name`, `circular reference`, `variable not defined`, `error computing dependency`, `empty definition`, `error evaluating variable`, `ruleset.circular reference`, `ruleset.set not defined` in `it.ts`/`en.ts`. `packages/engine/src/index.ts`: `export * as variables from "./variables";`.

Run: `npx vitest run packages/engine/test/unit/variables.test.ts packages/engine/test/unit/variables-note-script.test.ts` → verde.

- [ ] **Step 3: Verifiche e commit**

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && grep -rn "document\|window\|Promise" packages/engine/src/variables/ ; npm run test:run`
Expected: verde; il grep non trova nulla.

```bash
git add packages/engine
git commit -m "feat(engine/variables): generazione deterministica delle variabili, funzioni e ruleset di domanda"
```

---

### Task 7: `marking/` — interprete degli script di correzione

**Inventario da leggere prima:** `inventory/inventory-05-marking-parts.md` §2 (marking.js), §3 (script `.jme`), §6 (dipendenze), §8.1 (helper di test), §9 (punti delicati), §10. Righe citate: `.numbas-upstream/runtime/scripts/marking.js` e `runtime/scripts/marking_scripts/*.jme`.

**Files:**
- Create: `packages/engine/src/marking/feedback.ts` (marking.js:21-99), `marking/note-functions.ts` (101-454: le 24 funzioni/operatori delle note come `FuncObj` registrati in uno scope di marking; `apply`, `submit_part`, `mark_part`, `concat_feedback` incluse; `apply_marking_script` e `check_pre_submit` **non** implementate), `marking/stateful-scope.ts` (457-499), `marking/compute-note.ts` (501-566), `marking/marking-script.ts` (568-597), `marking/finalise-state.ts` (608-693), `marking/scripts/{numberentry,multipleresponse,patternmatch,gapfill,jme}.jme` (copie verbatim con header di licenza in commento `//`), `marking/scripts/index.ts` (generato), `marking/index.ts`
- Create: `scripts/engine/embed-marking-scripts.mjs` (legge i `.jme` e scrive `marking/scripts/index.ts` con `export const markingScripts = { numberentry: \`...\`, ... } as const;`)
- Create: `packages/engine/test/unit/marking-finalise.test.ts`, `marking-script.test.ts`, `marking-scripts-embedded.test.ts`
- Modify: `packages/engine/src/index.ts`, `DIVERGENCES.md`, `i18n/{it,en}.ts` (chiavi `marking.*`)

**Interfaces:**
- Consumes: `Scope`, `FuncObj`, `Token`, `Tree`, `lazyOps` (Task 2); `builtinScope` (Task 4); `noteScriptConstructor`, `computeVariable` (Task 6); `math.Fraction` (Task 1).
- Produces:

```ts
// marking/feedback.ts — union discriminata; include i due op interni start_lift/end_lift (§9)
export type FeedbackOp = "set_credit" | "multiply_credit" | "add_credit" | "sub_credit" | "end" | "feedback" | "warning" | "concat" | "start_lift" | "end_lift";
export interface FeedbackItem { op: FeedbackOp; credit?: number | Fraction; factor?: number; reason?: "correct" | "incorrect" | "invalid" | ""; message?: string; format?: "string" | "html"; invalid?: boolean; states?: FeedbackItem[]; scale?: number }
export const feedback: { set_credit(credit, reason?, message?): FeedbackItem; add_credit(...): FeedbackItem; sub_credit, multiply_credit, end(invalid?), feedback(message, reason?, format?), warning(message), concat(states, scale?) };

// marking/stateful-scope.ts
export class StatefulScope extends Scope { state: FeedbackItem[]; states: Record<string, FeedbackItem[]>; stateValid: Record<string, boolean>; stateErrors: Record<string, Error>; override evaluate(expr, variables?): Token }

// marking/marking-script.ts
export interface MarkingScriptResult { states: Record<string, FeedbackItem[]>; values: Record<string, Token>; stateValid: Record<string, boolean>; stateErrors: Record<string, Error>; scope: StatefulScope }
export class MarkingScript { notes: Record<string, ScriptNote>; source: string; constructor(source: string, base?: MarkingScript, scope?: Scope); evaluate(scope: Scope, parameters: Record<string, Token>): MarkingScriptResult; evaluate_note(name: string, scope: Scope, parameters): MarkingScriptResult }

// marking/finalise-state.ts
export interface FinalisedState { valid: boolean; credit: number; states: FeedbackItem[] }
export function finaliseState(states: FeedbackItem[]): FinalisedState;   // aritmetica del credito SOLO con Fraction (§9)

// marking/scripts/index.ts (generato)
export const markingScripts: { numberentry: string; multipleresponse: string; patternmatch: string; gapfill: string; jme: string };
```

**Decisioni già prese:**
1. Gli script `.jme` sono dati: copiati verbatim e incorporati in `scripts/index.ts` dal generatore (niente `?raw`, niente config di bundler). Un test verifica che il file generato coincida con i `.jme` (rigenera in memoria e confronta).
2. `apply_marking_script`, `check_pre_submit`, `pre_submit` e `TPromise` non si implementano (inventario §11.6, §6.9); riga in `DIVERGENCES.md`.
3. Il credito è sempre `Fraction`; `FinalisedState.credit` è `number` solo in uscita (`fraction.toFloat()`).
4. `start_lift`/`end_lift` fanno parte dell'unione `FeedbackOp`.
5. Il Task 8 riusa `finaliseState` per `apply_feedback` invece di duplicare lo `switch`.

- [ ] **Step 1: Generatore e script incorporati**

Scrivi `scripts/engine/embed-marking-scripts.mjs` (Node puro: legge `packages/engine/src/marking/scripts/*.jme`, escape di backtick/`${`, scrive `index.ts` con l'header Apache) e `marking-scripts-embedded.test.ts` che ricalcola l'output e lo confronta con il file su disco (`expect(generated).toBe(readFileSync(...))`). Copia i 5 `.jme` da `.numbas-upstream/runtime/scripts/marking_scripts/`.

Run: `node scripts/engine/embed-marking-scripts.mjs && npx vitest run packages/engine/test/unit/marking-scripts-embedded.test.ts` → verde.

- [ ] **Step 2: Test di `finaliseState` e `MarkingScript` (rosso)**

`marking-finalise.test.ts`, casi presi da `marking.js:608-693` letti riga per riga:
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { finaliseState } from "../../src/marking";
import { feedback as f } from "../../src/marking/feedback";

describe("finaliseState", () => {
  it("set_credit poi add_credit: 0.5 + 0.25 esatti", () => {
    const r = finaliseState([f.set_credit(0.5, "incorrect", "a"), f.add_credit(0.25, "b")]);
    expect(r.credit).toBe(0.75); expect(r.valid).toBe(true);
  });
  it("tre add_credit da 1/3 danno 1 (via Fraction.fromFloat, come upstream)", () => {
    const r = finaliseState([f.add_credit(1 / 3), f.add_credit(1 / 3), f.add_credit(1 / 3)]);
    expect(r.credit).toBeCloseTo(1, 12);   // esatto se upstream usa fromFloat (approssimazione razionale); leggi marking.js:620-690 e, se è esatto, usa toBe(1)
  });
  it("end(true) rende invalido e azzera", () => {
    const r = finaliseState([f.set_credit(1), f.end(true)]);
    expect(r.valid).toBe(false); expect(r.credit).toBe(0);
  });
  it("end() interrompe: gli stati successivi sono ignorati", () => {
    const r = finaliseState([f.set_credit(0.5), f.end(), f.set_credit(1)]);
    expect(r.credit).toBe(0.5);
  });
  it("concat con scale moltiplica il credito dei sotto-stati", () => {
    const r = finaliseState([f.concat([f.set_credit(1)], 0.5)]);
    expect(r.credit).toBe(0.5);
  });
  it("multiply_credit", () => { expect(finaliseState([f.set_credit(1), f.multiply_credit(0.5)]).credit).toBe(0.5); });
});
```
`marking-script.test.ts`: con `builtinScope` (Task 4) valuta lo script
```
mark: correct("Ok")
```
e verifica `result.states.mark` contiene `{op:"set_credit", credit: 1, reason:"correct", message:"Ok"}`; poi lo script `numberentry` incorporato con i parametri di `numberentry.jme` (`studentAnswer: "2"`, `settings` con `minvalue`/`maxvalue` 2, `precisionType: "none"`, `allowFractions: false`, `notationStyles: ["plain"]`, `correctAnswerFraction: false`, `mustBeReduced: false`, `mustBeReducedPC: 0`, `strictPrecision: true`, `precisionPC: 0`, `precisionMessage: ""`, `showPrecisionHint: false`, `displayAnswer: "2"`, `correctAnswerStyle: "plain"`, `precision: 0`, `unit`/`unitsPC` se presenti nello script — leggi la lista esatta in inventario §3.1) e verifica `finaliseState(result.states.mark).credit === 1`, e `"abc"` → `valid === false` con un `warning`. Se qualche parametro manca, lo script lancia `jme.variables.variable not defined`: aggiungilo, non toglierlo dallo script.

Run: `npx vitest run packages/engine/test/unit/marking-finalise.test.ts` → FAIL.

- [ ] **Step 3: Porting**

`feedback.ts`, `finalise-state.ts` (verbatim, `Fraction` ovunque), `stateful-scope.ts` (`evaluate` che accumula `state`), `note-functions.ts` (i `FuncObj` di 101-454 registrati da `makeMarkingScope(parent: Scope): StatefulScope`; `correctif`/`multiply_credit_if`/`add_credit_if`; `warn`≠`fail`, §9), `compute-note.ts`, `marking-script.ts` (usa `noteScriptConstructor` del Task 6 con `constructScope` che crea uno `StatefulScope` e `processResult` che raccoglie `states/values/stateValid/stateErrors`). Chiavi i18n `marking.*` dai `R()` di marking.js.

Run: `npx vitest run packages/engine/test/unit/marking-*.test.ts` → verde.

- [ ] **Step 4: Verifiche e commit**

`DIVERGENCES.md`: script incorporati; niente pre_submit/promesse/`apply_marking_script`.

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && npm run test:run`

```bash
git add packages/engine scripts/engine
git commit -m "feat(engine/marking): interprete degli script di correzione con credito esatto"
```

---

### Task 8: `parts/` — tipi di parte e `submit(answer): MarkingResult`

**Inventario da leggere prima:** `inventory/inventory-05-marking-parts.md` §4 (part.js), §5 (campi JSON per tipo), §6, §7 (da non portare), §8 (test, helper, esempi JSON minimi §8.5), §9 (punti delicati: **tutti**), §10, §11. Righe citate: `.numbas-upstream/runtime/scripts/part.js` e `runtime/scripts/parts/*.js`.

**Files:**
- Create: `packages/engine/src/parts/types.ts` (`PartType`, `PartJSON`, `Answer`, `MarkingResult`, `FeedbackItemPublic`, `PartSettings`), `parts/part-base.ts` (part.js:145-216, 306-370, 444-548 senza `setScript`/`applyScripts`, 934-1065 senza steps/store/display), `parts/credit.ts` (1983-2086), `parts/mark.ts` (1653-1845 `mark`/`apply_feedback` via `finaliseState`, 1846-1884 `marking_parameters` senza pre-submit, 1947-1982 `mark_answer` sincrono), `parts/adaptive-marking.ts` (1066-1190, 1415-1652: `markAdaptive`, `markAlternatives`, `markAgainstScope`, replacement di variabili), `parts/create-part.ts` (63-143), `parts/nice-part-name.ts` (util.js:1310-1330), `parts/number-entry-part.ts`, `parts/pattern-match-part.ts`, `parts/gapfill-part.ts`, `parts/jme-part.ts`, `parts/multiple-response-part.ts` (+ `parts/multiple-response-matrix.ts` se supera 1000 righe), `parts/information-part.ts`, `parts/index.ts`
- Create: `packages/engine/test/unit/parts-helpers.ts`, `parts-base.test.ts`, `parts-numberentry.test.ts`, `parts-jme.test.ts`, `parts-patternmatch.test.ts`, `parts-multipleresponse.test.ts`, `parts-gapfill.test.ts`, `parts-alternatives.test.ts`
- Modify: `packages/engine/src/index.ts`, `DIVERGENCES.md`, `i18n/{it,en}.ts` (chiavi `part.*`, `question.*` usate da part.js e dai tipi)

**Interfaces:**
- Consumes: Task 2 (`Scope`, `compile`, `evaluate`, `castToType`, `findvars`, `expandJuxtapositions`), Task 3 (`Ruleset`), Task 4 (`builtinScope`), Task 5 (`treeToJME`, `texify`), Task 6 (`substituteHtml`, `makeVariables`), Task 7 (`MarkingScript`, `finaliseState`, `markingScripts`, `StatefulScope`), Task 1 (`Fraction`, `deal`).
- Produces (l'API pubblica della spec, sezione "API pubblica"):

```ts
// parts/types.ts
export type PartType = "numberentry" | "1_n_2" | "m_n_2" | "m_n_x" | "patternmatch" | "gapfill" | "jme" | "information";
export type Answer = string | number | boolean[] | boolean[][] | Answer[] | null;   // per tipo: numberentry/patternmatch/jme → string; 1_n_2 → number (indice scelta); m_n_2 → boolean[]; m_n_x → boolean[][] indicizzato [scelta][risposta] come `ticks` upstream; gapfill → Answer[]
export interface FeedbackItemPublic { type: "correct" | "incorrect" | "warning" | "info"; message: string }
export interface MarkingResult { score: number; marks: number; credit: number; correct: boolean; valid: boolean; feedback: FeedbackItemPublic[] }
export interface PartJSON { type: PartType; marks?: number; prompt?: string; useCustomName?: boolean; customName?: string; showCorrectAnswer?: boolean; showFeedbackIcon?: boolean; customMarkingAlgorithm?: string; extendBaseMarkingAlgorithm?: boolean; variableReplacements?: VariableReplacementJSON[]; variableReplacementStrategy?: "originalfirst" | "alwaysreplace"; adaptiveMarkingPenalty?: number; alternatives?: PartJSON[]; useAlternativeFeedback?: boolean; alternativeFeedbackMessage?: string; unitTests?: unknown[]; [k: string]: unknown }   // più i campi per tipo di inventario §5
export type PartSettings = Record<string, unknown>;   // settings per tipo, già valutate nello scope della domanda

// parts/part-base.ts
export interface PartContext { scope: Scope; questionRef?: unknown; locale?: Locale }
export abstract class PartBase {
  readonly type: PartType; readonly path: string; readonly index: number; name: string;
  marks: number; credit: number; score: number; answered: boolean; isDirty: boolean; creditFraction: Fraction;
  settings: PartSettings; promptHtml: string; markingScript: MarkingScript; markingFeedback: FeedbackItem[]; warnings: string[];
  gaps: PartBase[]; parentPart?: PartBase; alternatives: PartBase[];
  constructor(index: number, path: string, ctx: PartContext, parentPart?: PartBase);
  abstract loadFromJSON(data: PartJSON): void; abstract finaliseLoad(): void;
  abstract getCorrectAnswer(scope: Scope): Answer; abstract setStudentAnswer(): void; abstract rawStudentAnswerAsJME(): Token | undefined; abstract studentAnswerAsJME(): Token | undefined;
  storeAnswer(answer: Answer): void;
  submit(answer: Answer): MarkingResult;      // storeAnswer + setStudentAnswer + mark + calculateScore; idempotente
  mark(scope: Scope): MarkResult; calculateScore(): void;
  get result(): MarkingResult | undefined; correctAnswer(): Answer;
  getScope(): Scope; markingParameters(rawAnswer: Token | undefined): Record<string, Token>;
}
export function createPartFromJSON(index: number, data: PartJSON, path: string, ctx: PartContext, parentPart?: PartBase): PartBase;   // registry per tipo; tipo sconosciuto → JmeError("part.unknown type")
```

**Decisioni già prese (risposte a inventario §11 e alla spec):**
1. `alternatives` **si porta** (`markAlternatives`, `useAlternativeFeedback`), con i test `Alternative answers` (part-tests.mjs:1713-1793).
2. `steps` e `stepsPenalty` **non si portano** (niente UI di rivelazione nel player v1): il campo JSON è ignorato con un `console.warn` una volta per domanda; riga in `DIVERGENCES.md` e nota nello schema TS.
3. `showFeedbackIcon=false` sopprime le voci come upstream (fedeltà); `MarkingResult.feedback` rispecchia `markingFeedback` + `warnings`.
4. `correct = credit >= 1`; mappa dei feedback: `op:"feedback"` con `reason:"correct"` → `correct`, `reason:"incorrect"` → `incorrect`, voci da `warnings` → `warning`, il resto → `info`.
5. `equal_states` upstream è morto (§9): i test tradotti confrontano davvero `states` proiettati su `{op, credit, reason, message}` (senza `scope`).
6. `apply_marking_script`, `pre_submit`, `store`, `display`, `signals`/`events`, XML, `resume` non si portano.
7. `gapfill.marks` è sempre la somma dei gap (§11.7): il campo JSON è ignorato, documentato in `types.ts`.
8. `multipleresponse`: `maxAnswers=0` = illimitato; trasposizione della matrice solo se `!flipped`; `deal(numChoices)` **prima** di `deal(numAnswers)` con `scope.rng` (§9); `m_n_x` accetta `boolean[][]` `[scelta][risposta]`. `storeAnswer` dei tre tipi accetta **sia** la forma pubblica (`number` / `boolean[]` / `boolean[][]`) **sia** la matrice `ticks` upstream (`boolean[][]`, riconosciuta dalla forma), così i fixture `unitTests` (`answer.value` = ticks) girano invariati.
9. `numberentry`: la precisione effettiva usa quella **rilevata** nella risposta (§9); `allowFractions` forzato `false` se `precisionType != "none"`.
10. `jme`: rilevamento "formula" `nome = espressione` (§9), `answerSimplification` solo sulla risposta corretta, `checkVariableNames` con `caseSensitive`.
11. `customMarkingAlgorithm` + `extendBaseMarkingAlgorithm` si portano (base = script incorporato del tipo).

- [ ] **Step 1: Helper e test tradotti (rosso)**

`parts-helpers.ts` replica part-tests.mjs:23-98 senza DOM/store: `createPart(data: PartJSON, scope = new Scope(builtinScope))`, `markPart(p, answer, scope?)` (sincrono: `storeAnswer` + `setStudentAnswer` + `p.mark(scope)` → `MarkResult`), `containsNote(res, note)` (80-87), `equalStates(a, b)` **reale** (decisione 5), `runPartUnitTests(p)` (110-155, per gli `unitTests` incorporati nel JSON). Traduci, una `it` per `assert`, i moduli: `Part` (189-198), `Stateful scope` (211-217), `Number entry` (218-355), `JME` (356-638), `Pattern match` (639-662), `Choose one from a list` (706-733), `Choose several from a list` (734-759), `Match choices with answers` (760-781), `Gapfill` (782-1247) **solo i test che usano `createPartFromJSON`**, `Custom marking algorithms` (1248-1262), `Alternative answers` (1713-1793). I test che usano `question_test`/`question_unit_test` (costruiscono una `Question`) vanno elencati in un commento in testa a `parts-gapfill.test.ts` come "Task 9". Salta `Matrix entry`, `Pre-submit tasks`, `Explore mode`, `Signals`, `Exams`, `Custom marking JavaScript`.

Run: `npx vitest run packages/engine/test/unit/parts-numberentry.test.ts` → FAIL.

- [ ] **Step 2: `types.ts`, `part-base.ts`, `credit.ts`, `mark.ts`, `adaptive-marking.ts`, `create-part.ts`, `nice-part-name.ts`, `information-part.ts`**

`submit(answer)`: `storeAnswer(answer)`; `setStudentAnswer()`; `this.mark(this.getScope())` → `apply_feedback` tramite `finaliseState` (Task 7) che produce `credit`, `markingFeedback`, `answered`; `calculateScore()`; costruisce e memorizza `MarkingResult`. Credito solo via `creditFraction` (`credit.ts`).

Run: `npx vitest run packages/engine/test/unit/parts-base.test.ts` → verde. Commit: `feat(engine/parts): base delle parti, credito esatto e correzione`

- [ ] **Step 3: `number-entry-part.ts`, `pattern-match-part.ts`, `multiple-response-part.ts`**

Run: `npx vitest run packages/engine/test/unit/parts-numberentry.test.ts packages/engine/test/unit/parts-patternmatch.test.ts packages/engine/test/unit/parts-multipleresponse.test.ts` → verde. Commit: `feat(engine/parts): numberentry, patternmatch e scelte multiple`

- [ ] **Step 4: `jme-part.ts`, `gapfill-part.ts` (+ alternatives, custom marking)**

`gapfill`: `sortAnswers` richiede gap dello stesso tipo; `gap_adaptive_order` con rilevamento cicli (`part.gapfill.cyclic adaptive marking`); un gap invalido con `sortAnswers` blocca tutto (`question.can not submit`). `jme`: `vsetRange`/`vsetRangePoints`/`failureRate` con `scope.rng`; `expandJuxtapositions` sull'input dello studente secondo `singleLetterVariables`/`allowUnknownFunctions`/`implicitFunctionComposition`.

Run: `npx vitest run packages/engine/test/unit/parts-*.test.ts` → verde. Commit: `feat(engine/parts): espressioni matematiche, gapfill e risposte alternative`

- [ ] **Step 5: Verifiche e commit**

`DIVERGENCES.md`: steps ignorati; niente pre-submit/store/display; `correct` derivato; feedback mappato. `packages/engine/src/index.ts`: `export * as parts from "./parts";` e i tipi `Answer`, `MarkingResult`, `PartType`, `PartSettings`, `FeedbackItemPublic as FeedbackItem`.

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && wc -l packages/engine/src/parts/*.ts | sort -n | tail -3 && grep -rn "document\|window\|Math.random" packages/engine/src/parts/ ; npm run test:run`

```bash
git add packages/engine
git commit -m "docs(engine): divergenze del modulo parts"
```

---

### Task 9: `question/` — caricamento JSON, ciclo delle variabili, stato, API pubblica

**Inventario da leggere prima:** `inventory/inventory-06-question-json-tests-i18n.md` §1 (mappa di question.js), §2 (i 24 campi JSON con default), §3 (ciclo di vita), §5 (chiavi `R()`), §7, §8 (**tutti** i punti delicati), §9. Righe citate: `.numbas-upstream/runtime/scripts/question.js`.

**Files:**
- Create: `packages/engine/src/question/types.ts` (`NumbasQuestionJSON` con i 24 campi di §2 e i tipi delle parti, `QuestionState`, `PartState`, `JMEValue`, `LoadOptions`), `question/load.ts` (question.js:495-645 `loadFromJSON`; 772-808 costanti → funzioni → rulesets in quest'ordine), `question/variables.ts` (809-889: `variablesTodo`, ciclo `variablesTest` con `maxRuns`, `variable_generation_run_number`, `flatten`), `question/parts.ts` (673-723, 1202-1213: istanziazione parti, `allParts`, `getPart`), `question/scoring.ts` (1291-1447 senza display/storage), `question/state.ts` (`toState`/`restoreQuestion`), `question/question.ts` (classe `Question`, `regenerate`, `revealAnswer`, `adviceHtml`), `question/index.ts`
- Create: `packages/engine/test/unit/question-load.test.ts`, `question-variables.test.ts`, `question-state.test.ts`, `question-parts.test.ts`, `api.test.ts`, `packages/engine/test/fixtures/upstream/part-unit-tests.json` (dal fixture `tests/parts/part_unit_tests.mjs`: le 6 domande in ambito, senza `matrixentry`)
- Modify: `packages/engine/src/index.ts` (API pubblica completa), `README.md` (uso), `DIVERGENCES.md`, `i18n/{it,en}.ts` (chiavi `question.*` di §5)

**Interfaces:**
- Consumes: tutto: `builtinScope`, `Scope`, `makeRng`, `compile`, `findvars` (Task 2/4), `makeConstants`, `makeFunctions`, `makeRulesets`, `makeVariables`, `substituteHtml` (Task 6), `createPartFromJSON`, `PartBase` (Task 8), `exprToLaTeX` (Task 5), `t`/`setLocale` (Task 2).
- Produces: l'API della spec, sezione "API pubblica", con queste precisazioni:

```ts
// question/types.ts
export type JMEValue = number | bigint | string | boolean | Complex | JMEValue[] | { [k: string]: JMEValue } | null;
export interface LoadOptions { seed: string; locale?: Locale; allowJavascriptFunctions?: boolean /* default true */; ignorePreamble?: boolean /* default false */ }
export interface QuestionState { seed: string; answered: boolean; submitted: number; adviceDisplayed: boolean; revealed: boolean; score: number; marks: number; parts: PartState[] }
export interface PartState { path: string; answered: boolean; score: number; marks: number; answer?: Answer; gaps?: PartState[] }
// question/question.ts
export class Question { readonly seed: string; readonly name: string; readonly statementHtml: string; readonly adviceHtml: string; readonly variables: Record<string, JMEValue>; readonly parts: PartBase[]; readonly scope: Scope; score(): { score: number; marks: number }; regenerate(seed: string): Question; toState(): QuestionState; revealAnswer(): void; allParts(): PartBase[]; getPart(path: string): PartBase | undefined }
export function loadQuestion(json: NumbasQuestionJSON, opts: LoadOptions): Question;
export function restoreQuestion(json: NumbasQuestionJSON, state: QuestionState, opts?: { locale?: Locale }): Question;
// src/index.ts
export function renderLatex(expr: string, opts?: { ruleset?: string | string[]; locale?: Locale }): string;   // exprToLaTeX(expr, opts?.ruleset ?? "all", builtinScope)
export function evaluate(expr: string, variables?: Record<string, JMEValue>): JMEValue;                         // scope figlio di builtinScope con wrapValue, unwrapValue in uscita
export { loadQuestion, restoreQuestion, Question }; export type { NumbasQuestionJSON, QuestionState, PartState, Answer, JMEValue, PartType, PartSettings, FeedbackItem, LoadOptions, Locale };
```

**Decisioni già prese (risposte a inventario §10 e §8):**
1. `partsMode: "explore"` è fuori ambito: `loadQuestion` lancia `JmeError("question.parts mode not supported", { mode })`; `objectives`, `penalties`, `maxMarks`, `showAllParts` ignorati. Riga in `DIVERGENCES.md`.
2. `preamble.js` non vuoto (dopo `trim()`) → `JmeError("question.preamble not supported")`, a meno di `ignorePreamble: true` (allora `console.warn` e si ignora). `preamble.css` ignorato. Nessun `new Function` nel modulo `question/`.
3. `extensions` non vuoto → `JmeError("question.required extension not available", { name })` (fail-fast, §8).
4. Funzioni personalizzate: `language: "javascript"` con `type: "promise"` → `JmeError("question.function.async not supported", { name })`; le altre passano a `makeFunctions` con `allowJavascript: opts.allowJavascriptFunctions ?? true`.
5. Ciclo `variablesTest`: `maxRuns` default 10, clamp `[1, 1000000]`; a ogni tentativo un **nuovo** `new Scope(questionScope)` con `variable_generation_run_number = TNum(run)` e una nuova chiamata a `makeVariables` (consuma altra casualità dallo **stesso** `rng`, come upstream); `condition === ""` → `compile` ritorna `null` → un solo giro senza valutare; oltre `maxRuns` → `JmeError("jme.variables.question took too many runs to generate variables")`.
6. Scope a strati: `builtinScope` → domanda (`constants`, poi `functions`, poi `rulesets`, in quest'ordine) → variabili generate (`flatten`) → parte (`part_path`) → gap. `Scope.question = question` per l'adaptive marking (Task 2 lo prevede opaco).
7. `QuestionState` **non** salva le variabili: si rigenerano dal seed. `restoreQuestion` = `loadQuestion(json, { seed: state.seed, locale })` + `part.submit(answer)` per ogni `PartState` con `answered`, nell'ordine "sorgenti prima delle parti con `variableReplacements`" (question.js:1004-1033), + `revealed` → `revealAnswer()`.
8. `statementHtml`/`adviceHtml`/`promptHtml` = `substituteHtml(html, scope)`; le formule restano LaTeX in `\(...\)`/`\[...\]`; nessun MathJax.
9. Chiavi i18n: si mantengono le chiavi upstream (Global Constraints), non chiavi proprie più corte.
10. `hasCustomName` calcolato da `customName` non vuoto (§8 ultimo punto).
11. `locale`: `setLocale(opts.locale ?? "it")` prima di caricare; i messaggi di feedback delle parti escono nella lingua corrente.

- [ ] **Step 1: Fixture e test (rosso)**

Converti `.numbas-upstream/tests/parts/part_unit_tests.mjs` in `test/fixtures/upstream/part-unit-tests.json` (script Node usa-e-getta: `import` del modulo, `JSON.stringify(unit_test_questions.filter(q => !q.parts.some(p => p.type === "matrix")), null, 2)`).

`question-load.test.ts`: `loadQuestion` di una domanda minima `{ name: "Q", statement: "<p>{a}+{b}</p>", variables: { a: { name: "a", definition: "random(1..9)" }, b: { name: "b", definition: "a+1" } }, parts: [{ type: "numberentry", marks: 1, minValue: "a+b", maxValue: "a+b" }] }` con `seed: "s1"`: `statementHtml` contiene i valori, `variables.b === variables.a + 1`, `parts[0].type === "numberentry"`; stesso seed → stessi valori; `regenerate("s2")` cambia i valori; `partsMode: "explore"` → errore con chiave; `preamble.js: "x=1"` → errore, con `ignorePreamble` carica; `extensions: ["geogebra"]` → errore; funzione `type: "promise"` → errore.
`question-variables.test.ts`: `variablesTest: { condition: "a > 5", maxRuns: 100 }` con `a: random(1..9)` → `variables.a > 5`; `maxRuns: 1` con condizione impossibile → chiave `jme.variables.question took too many runs to generate variables`; `variable_generation_run_number` disponibile (`definition: "variable_generation_run_number"`); condizione `""` → nessun errore.
`question-parts.test.ts`: traduci i test rinviati dal Task 8 (`question_test` di `Gapfill`, `Question` 1344-1597 nelle parti che non usano steps/explore, `Alternative answers` basati su domanda, `Variables` 1794-1861) e `Part unit tests` (2626-2643) eseguendo `runPartUnitTests` (Task 8) su ogni parte di ogni domanda del fixture JSON.
`question-state.test.ts`: `toState()` dopo due `submit` → `restoreQuestion(json, state)` ha stesso `score()`, stessi `result` per parte, stesse `variables`; stato serializzabile con `JSON.stringify` senza perdita.
`api.test.ts`: `renderLatex("x^2/2")` contiene `\\frac`; `evaluate("a+1", { a: 2 })` → `3`; `evaluate("[1,2]")` → `[1,2]`; `loadQuestion(..., { locale: "en" })` produce feedback in inglese, `"it"` in italiano (una parte `numberentry` con risposta `"abc"` → messaggio della chiave `part.numberentry.answer invalid`).

Run: `npx vitest run packages/engine/test/unit/question-load.test.ts` → FAIL.

- [ ] **Step 2: `types.ts`, `load.ts`, `variables.ts`, `parts.ts`**

Commit: `feat(engine/question): caricamento JSON e generazione deterministica delle variabili`

- [ ] **Step 3: `scoring.ts`, `state.ts`, `question.ts`, `index.ts`, API in `src/index.ts`, README**

`README.md` di `packages/engine`: esempio d'uso (caricare, leggere `statementHtml`, `submit`, `toState`/`restoreQuestion`), come rigenerare l'oracolo, come eseguire i test.

Run: `npx vitest run packages/engine/test/unit` → verde. Commit: `feat(engine/question): punteggio, stato serializzabile e API pubblica`

- [ ] **Step 4: Verifiche**

Run: `npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && grep -rn "new Function\|eval(\|document\|window\|Math.random" packages/engine/src/question/ ; npm run test:run && npm run build`
Expected: verde; il grep non trova nulla; `next build` non tocca `packages/engine/oracle` (verifica che `.next/` non contenga `numbas-runtime`).

Commit: `docs(engine): divergenze del modulo question e README`

---

### Task 10: harness differenziale contro l'oracolo upstream

**Inventario da leggere prima:** `inventory/inventory-06-question-json-tests-i18n.md` §6 (infrastruttura di test upstream, ricetta dell'oracolo con `createQuestionFromJSON`, `mark_part`), §8 (ordine di consumo della casualità). Spec, sezione "Test differenziali".

**Files:**
- Modify: `packages/engine/test/differential/oracle.ts` (aggiunge `oracleQuestion`, `oracleMark`, `oracleDisplay`)
- Create: `packages/engine/test/differential/variables.diff.test.ts`, `display.diff.test.ts`, `marking.diff.test.ts`, `known-divergences.json`, `corpus.ts` (carica tutte le fixture), `packages/engine/test/fixtures/savint/*.json` (almeno 8 domande scritte a mano per le superiori: una per tipo di parte in ambito, una `gapfill` mista, una con `variablesTest`, una con `alternatives`, una con funzioni JME personalizzate e ruleset; testi in italiano), `packages/engine/test/fixtures/upstream/part-tests-questions.json` (le domande JSON inline di `part-tests.mjs` usate da `question_test`, estratte a mano o con uno script), `packages/engine/test/fixtures/public/README.md`, `scripts/engine/fetch-public-questions.sh`
- Modify: `packages/engine/README.md`, `DIVERGENCES.md`, `docs/superpowers/specs/2026-09-02-esercizi-02-motore-design.md` (solo se il differenziale impone una tolleranza documentata)

**Interfaces:**
- Consumes: l'API pubblica (Task 9), la facciata dell'oracolo (Task 0).
- Produces:

```ts
// test/differential/oracle.ts (estensione)
export interface OracleApi {
  evaluate(expr: string): unknown; texify(expr: string): string; seed(s: string): void; numbas: any;
  oracleDisplay(expr: string, ruleset?: string): string;                                      // Numbas.jme.display.exprToLaTeX(expr, ruleset ?? "all", Numbas.jme.builtinScope)
  oracleQuestion(json: object, seed: string): Promise<{ variables: Record<string, unknown>; statementHtml: string; parts: any[]; q: any }>;   // Math.seedrandom(seed); createQuestionFromJSON(json, 0); generateVariables(); await signals.on("ready"); variabili via q.unwrappedVariables
  oracleMark(json: object, seed: string, answers: Record<string, unknown>): Promise<Record<string, { credit: number; valid: boolean; feedback: string[] }>>;   // per path: storeAnswer, setStudentAnswer, mark(scope) → finalised_result
}
// test/differential/known-divergences.json: [{ "fixture": "...", "path": "p0", "field": "feedback", "reason": "...", "since": "2026-..." }]
```

**Decisioni già prese:**
1. Parità del seed: l'oracolo chiama `Math.seedrandom(seed)` del vendor prima di `createQuestionFromJSON`; il nostro `makeRng(seed)` usa `seedrandom` npm (stesso ARC4). Verifica preliminare nel test: le prime 5 estrazioni di `Math.random()` dopo `Math.seedrandom("x")` coincidono con `makeRng("x")()`; se no, il pacchetto npm va allineato alla versione vendorizzata (`.numbas-upstream/runtime/scripts/seedrandom/seedrandom.js`, leggi l'header per la versione) e la scelta va in `DIVERGENCES.md`.
2. Confronti: (a) variabili a parità di seed: `unwrapValue` nostro contro `q.unwrappedVariables`, numeri con `closeEqual` a 10 decimali, tutto il resto `toEqual`; (b) `statementHtml`: uguale dopo `normalizeHtml = (s) => s.replace(/\s+/g, " ").trim()`; (c) LaTeX di `renderLatex` contro `oracleDisplay` su un elenco di 60 espressioni (prese da `jme-tests.mjs:2732-2824` e da `test/fixtures/savint`), dopo `normTex`; (d) per ogni parte e per ogni risposta campione (corretta = `correctAnswer()`, sbagliata, non valida) `credit`, `valid` e i messaggi di feedback (ordine e testo, in locale `en` da entrambe le parti).
3. Una differenza è accettata solo se documentata in `known-divergences.json` con motivo e riferimento a `DIVERGENCES.md`; il test fallisce su differenze non elencate e su voci elencate che non divergono più (voce obsoleta).
4. Il corpus pubblico CC BY è **opzionale**: `scripts/engine/fetch-public-questions.sh` scarica da un elenco di URL in `test/fixtures/public/sources.txt` se l'editor pubblico offre l'esportazione JSON senza autenticazione (verifica sull'editor `numbas.mathcentre.ac.uk`, voce "Download" di una domanda); se non è possibile, il README lo dice e il task si chiude con il corpus `upstream` + `savint`.
5. I test differenziali sono lenti (jsdom + bundle da 1,6 MB): file separati sotto `test/differential/`, esclusi da `npm run test:run` della radice tramite `vitest.config.ts` (`exclude: ["packages/engine/test/differential/**"]`) e lanciati con `npm run test:engine:diff` (script nuovo in `package.json`: `vitest run packages/engine/test/differential`). Lo smoke test dell'oracolo (Task 0) segue la stessa sorte.

- [ ] **Step 1: Estensione della facciata e test di parità del seed**

`variables.diff.test.ts` inizia con il test di parità delle 5 estrazioni (decisione 1).

Run: `npx vitest run packages/engine/test/differential/variables.diff.test.ts` → verde sulla parità del seed prima di procedere.

- [ ] **Step 2: Corpus**

Scrivi le fixture `savint` (JSON valido per `loadQuestion` **e** per l'oracolo), estrai `part-tests-questions.json`, `corpus.ts` che le enumera. `fetch-public-questions.sh` + README.

- [ ] **Step 3: Test differenziali**

`variables.diff.test.ts` (per ogni fixture × 3 seed), `display.diff.test.ts`, `marking.diff.test.ts` (per ogni parte × 3 risposte). Per ogni differenza trovata: prima cerca l'errore nel port (ordine delle estrazioni casuali, `deal` scelte/risposte, ordine di valutazione delle variabili, arrotondamenti); solo se l'originale è instabile o la divergenza è voluta (`DIVERGENCES.md`) aggiungi la voce a `known-divergences.json`.

Run: `npm run test:engine:diff` → verde.

- [ ] **Step 4: Verifiche finali del pacchetto**

Run:
```bash
npm run test:engine:diff && npx vitest run packages/engine && npx tsc -p packages/engine/tsconfig.json --noEmit && npx tsc --noEmit && npx eslint --quiet packages/engine && npm run test:run && npm run build
wc -l packages/engine/src/**/*.ts | sort -n | tail -5
grep -rln "Math.random\|document\.\|window\.\|new Function" packages/engine/src/ ; echo "atteso: solo variables/functions.ts (new Function, gated)"
```

```bash
git add packages/engine scripts/engine package.json vitest.config.ts
git commit -m "test(engine): harness differenziale contro il runtime Numbas e corpus"
```

---

## Note per il controllore

- L'ordine è 0, 1, 2, 3, 4a, 4b, 5, 6, 7, 8, 9, 10. I test "rinviati" da un task al successivo sono elencati in commenti in testa ai file di test: il task che li riceve li riattiva.
- Dopo il Task 5 vanno eseguiti anche i 540 doc-tests (`jme-doc-tests.test.ts`, loop su `.numbas-upstream/tests/jme/doc-tests.mjs` copiato in `test/fixtures/upstream/doc-tests.json`, confronto senza spazi via `treeToJME`) e `Documentation > Coverage`/`Random flag set properly` adattati: sono il criterio "(+ doc-tests)" del Task 4 nella spec, spostati qui perché richiedono `treeToJME`.
- Le divergenze annotate lungo il percorso in `DIVERGENCES.md` vanno rilette al Task 10: ognuna deve avere una voce in `known-divergences.json` o essere invisibile al differenziale.
