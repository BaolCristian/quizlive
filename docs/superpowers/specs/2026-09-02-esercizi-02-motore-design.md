# Esercizi 02 — Motore matematico (porting del runtime Numbas)

**Data:** 2026-09-02
**Stato:** decisioni prese in conversazione; documento in attesa di revisione
**Programma:** `2026-09-02-savint-esercizi-programma-design.md` (sotto-progetto 2)

## Contesto (verificato sul repository `numbas/Numbas`, commit 0f0ea33 del 2026-08-26)

- Il motore è in `runtime/scripts/`: circa 30.000 righe di JavaScript senza
  Knockout né jQuery (verificato con grep). MathJax compare solo in un commento.
- **Il runtime carica esami, domande e parti anche da JSON**: `createExamFromJSON`
  (`exam.js:45`), `createQuestionFromJSON` (`question.js:51`),
  `createPartFromJSON` (`part.js:99`) e `loadFromJSON` in tutti i tipi di parte.
  Il percorso XML (compilatore Python, `xml.js`, `exam-to-xml.js`, formato
  `.exam`) è un'alternativa che **non** portiamo.
- Test upstream: `tests/jme/jme-tests.mjs` (122 blocchi QUnit),
  `tests/parts/part-tests.mjs` (101 blocchi, 70 dei quali costruiscono le parti
  da JSON), `tests/jme/doc-tests.mjs` (generati dalla documentazione). Girano
  headless con jsdom + QUnit sul bundle compilato `tests/numbas-runtime.js`.
- Script di correzione: sei file JME in `marking_scripts/` (810 righe),
  incorporati come stringhe in `Numbas.raw_marking_scripts` e interpretati da
  `marking.js`.
- Dipendenze terze del motore: `decimal.js` v10.1.1 (MIT), `seedrandom` (MIT,
  usato solo dalla funzione JME `seedrandom`), `i18next` (MIT, tramite `R()` in
  una trentina di punti, quasi tutti in `part.js`), `parsel` (4 usi in
  `util.js`, da verificare se servono fuori dal display).
- Casualità: il runtime originale usa `Math.random`; per esame è previsto un
  `randomSeed` nei dati di sospensione. Nessuna semina per domanda.
- Licenza Apache 2.0: opera derivata ammessa con attribuzione.

## Obiettivo

Un pacchetto TypeScript **nostro**, senza dipendenze da Next, React o DOM, che:

1. carica una domanda nel **formato JSON di Numbas** (lo stesso prodotto dal
   loro editor e usato dai loro test);
2. genera una **variante** deterministica da un seed;
3. produce il testo delle parti con le variabili sostituite e le formule in
   LaTeX;
4. **corregge** la risposta di ogni parte con lo stesso esito dell'originale
   (punteggio, feedback, risposta corretta);
5. serializza e ripristina lo **stato di un tentativo**;
6. gira sia nel browser sia in Node, così il server ricalcola il punteggio.

Il sotto-progetto 3 (player) consuma l'API pubblica qui definita; il
sotto-progetto 5 (editor) produce il JSON che questo motore legge.

## Decisioni prese

1. **Porting completo** modulo per modulo, in TypeScript strict, ESM, senza il
   namespace globale `Numbas`. Nessuna dipendenza dal runtime originale a
   runtime; l'originale resta solo come oracolo di test in sviluppo.
2. **Formato d'ingresso = JSON di domanda Numbas** (schema documentato su
   numbas.org.uk/schema). Si portano solo i campi dei tipi di parte in ambito.
3. **Tipi di parte nella prima versione**: `numberentry`, `1_n_2` (scelta
   singola), `m_n_2` (scelta multipla), `m_n_x` (abbinamento), `patternmatch`,
   `gapfill`, `jme` (espressione matematica), `information`. Rinviati:
   `matrix`, `extension`, tipi di parte personalizzati.
4. **Posizione**: `packages/engine/` nel repo, raggiunto dall'app con l'alias
   TypeScript `@savint/engine` (tsconfig `paths`), **senza** npm workspaces:
   build Docker e pm2 non cambiano. Estraibile in pacchetto npm dopo il lancio.
5. **Determinismo**: il generatore casuale è iniettato nello scope della
   domanda e seminato per tentativo (algoritmo `seedrandom`, pacchetto npm
   omonimo, stesso ARC4 del vendor upstream). È un miglioramento voluto rispetto
   all'originale: serve al server per ricalcolare un tentativo dal suo seed.
6. **Aritmetica**: `decimal.js` 10.x come dipendenza npm, stessa major del vendor.
7. **Messaggi**: dizionario nostro `it`/`en` al posto di i18next; i messaggi
   del motore (feedback di correzione, errori JME) sono scritti da noi in
   italiano e inglese.
8. **Attribuzione**: file `packages/engine/NOTICE` con il copyright Newcastle
   University e la licenza Apache 2.0; header di attribuzione nei file derivati;
   voce nella pagina informazioni di SAVINT (sotto-progetto 3).

## Non-obiettivi

- Esame (`exam.js`): navigazione, timer, sospensione SCORM, modalità
  diagnostica, gruppi di domande con pesca casuale. Portiamo la domanda;
  l'aggregazione in "esercizio" e la **pesca casuale dal bacino** (decisione 9
  del programma) le fa il dominio SAVINT nei sotto-progetti 3 e 4.
- XML, compilatore Python, formato `.exam`, temi, display, storage, `csv`,
  `download`, `controls`, `schedule`, `timing`.
- Tipi di parte fuori ambito (vedi decisione 3).
- Interfaccia utente: nessun componente React qui.
- Compatibilità byte per byte con il LaTeX dell'originale dove il nostro
  rendering è equivalente (vedi test differenziali).

## Architettura

```
packages/engine/
  package.json            solo metadati e script di test (nessuna pubblicazione ora)
  tsconfig.json           strict, ESM, target ES2022, nessun DOM lib
  NOTICE                  attribuzione Apache 2.0 (Newcastle University 2011-2026)
  src/
    index.ts              API pubblica (sotto)
    math/                 util numerici, precisione, decimali, random iniettabile   ← util.js, math.js
    jme/
      tokenizer.ts, parser.ts, types.ts, scope.ts, evaluate.ts               ← jme.js (jme-base)
      rules.ts            semplificazione e pattern matching                  ← jme-rules.js
      calculus.ts                                                            ← jme-calculus.js
      builtins/           funzioni predefinite, spezzate per tema             ← jme-builtins.js
      display.ts          espressione → LaTeX                                 ← jme-display.js
      notations.ts                                                           ← jme-notations.js
      unicode.ts                                                             ← unicode-mappings.js
    variables/            definizione, ordinamento, generazione con vincoli   ← jme-variables.js
    marking/              interprete degli script di correzione, feedback     ← marking.js
      scripts/*.jme       i sei script upstream, come dati
    parts/                base + numberentry, multipleresponse, patternmatch, gapfill, jme, information  ← part.js, parts/*.js
    question/             caricamento JSON, variante, stato serializzabile    ← question.js (senza XML/display)
    i18n/                 messaggi it/en
  test/
    unit/                 test upstream tradotti in Vitest, per modulo
    differential/         harness con l'oracolo (vedi sotto)
    fixtures/             domande JSON di esempio (superiori, 5 anni)
  oracle/                 tests/numbas-runtime.js + locales.js upstream, solo dev (git-tracked, Apache)
```

Vincoli:
- Nessun modulo importa da `src/app` o da Next; nessun accesso a `window`,
  `document`, `fetch`.
- File piccoli: nessun file sopra le 1.000 righe (upstream `jme.js` è 6.281
  righe: si spezza per responsabilità).
- Vitest con un secondo progetto di configurazione per `packages/engine`
  (ambiente `node`), incluso in `npm run test:run` della radice.

## API pubblica (`packages/engine/src/index.ts`)

```ts
export type Locale = "it" | "en";

export interface LoadOptions { seed: string; locale?: Locale }

export function loadQuestion(json: NumbasQuestionJSON, opts: LoadOptions): Question;

export interface Question {
  readonly seed: string;
  readonly name: string;
  readonly statementHtml: string;            // HTML con variabili sostituite; formule come LaTeX in \( \) e \[ \]
  readonly adviceHtml: string;
  readonly variables: Record<string, JMEValue>;
  readonly parts: Part[];
  score(): { score: number; marks: number };
  regenerate(seed: string): Question;        // nuova variante, stesso JSON
  toState(): QuestionState;                  // serializzabile (JSON) per salvataggio e ripresa
}

export function restoreQuestion(json: NumbasQuestionJSON, state: QuestionState, opts?: { locale?: Locale }): Question;

export interface Part {
  readonly path: string;                     // "p0", "p0g1"
  readonly type: PartType;
  readonly promptHtml: string;
  readonly marks: number;
  readonly settings: PartSettings;           // campi specifici per tipo (scelte, unità, precisione, ...), già sostituiti
  readonly gaps?: Part[];                    // solo gapfill
  submit(answer: Answer): MarkingResult;     // idempotente: ricorregge e aggiorna lo stato
  readonly result?: MarkingResult;
  correctAnswer(): Answer;                   // per "mostra la soluzione"
}

export interface MarkingResult {
  score: number; marks: number; credit: number;   // credit ∈ [0,1]
  correct: boolean; valid: boolean;               // valid=false: risposta non interpretabile
  feedback: FeedbackItem[];                       // { type: "correct"|"incorrect"|"warning"|"info", message }
}

export function renderLatex(expr: string, opts?: DisplayOptions): string;  // espressione JME → LaTeX
export function evaluate(expr: string, scope?: Record<string, JMEValue>): JMEValue;
export type { NumbasQuestionJSON, QuestionState, Answer, JMEValue, PartType, PartSettings, FeedbackItem };
```

`Answer` per tipo: `numberentry` → stringa digitata; `1_n_2` → indice;
`m_n_2` → array di booleani; `m_n_x` → matrice di booleani; `patternmatch` →
stringa; `jme` → stringa (espressione); `gapfill` → array di risposte dei gap.

## Ordine di porting e criteri di accettazione

Un modulo è portato quando i suoi test upstream tradotti passano. Ordine dal
grafo delle dipendenze (`queueScript`), ogni riga è almeno un task del piano:

| # | Modulo nostro | Sorgente upstream | Righe | Criterio |
|---|---|---|---|---|
| 1 | `math/` | util.js, math.js, decimal | ~5.900 | test `math` e `util` di jme-tests |
| 2 | `jme/` base: tokenizer, parser, tipi (24), scope, valutazione | jme.js | ~6.300 | test di parsing e valutazione |
| 3 | `jme/rules.ts`, `jme/calculus.ts` | jme-rules.js, jme-calculus.js | ~2.500 | test di semplificazione |
| 4 | `jme/builtins/` | jme-builtins.js | ~3.800 | test delle funzioni predefinite (+ doc-tests) |
| 5 | `jme/display.ts`, `notations.ts`, `unicode.ts` | jme-display.js, jme-notations.js, unicode-mappings.js | ~3.000 | test di display |
| 6 | `variables/` | jme-variables.js | ~1.200 | test delle variabili |
| 7 | `marking/` + script | marking.js, marking_scripts/*.jme | ~1.500 | test di marking (part-tests) |
| 8 | `parts/` | part.js, parts/{numberentry,multipleresponse,patternmatch,gapfill,jme,information}.js | ~5.000 | part-tests per tipo |
| 9 | `question/` + `i18n/` + API | question.js (solo JSON), localisation | ~1.500 | test di domanda; fixtures |
| 10 | differenziale | — | — | harness verde sul corpus |

Le stime di righe sono dell'originale; il TypeScript sarà più corto per la
parte non portata (display, XML, SCORM).

## Test differenziali (task 10, ma l'harness nasce al task 2)

- `packages/engine/oracle/` contiene `numbas-runtime.js` e `locales.js` presi da
  `tests/` upstream al commit 0f0ea33, con il relativo header di licenza.
- Harness `test/differential/oracle.ts`: carica il bundle in jsdom (come
  `tests/headless.mjs` upstream), espone `oracleEvaluate(expr)`,
  `oracleDisplay(expr)`, `oracleQuestion(json, seed)` e `oracleMark(json, seed,
  answers)`. Per la parità del seed, l'oracolo chiama `Math.seedrandom(seed)`
  del vendor prima di generare; il nostro motore usa lo stesso algoritmo.
- Corpus: le domande JSON dei part-tests upstream, le nostre fixtures per le
  superiori, e un campione di domande pubbliche CC BY scaricate dall'editor
  Numbas (in `test/fixtures/public/`, con attribuzione).
- Confronti: valore delle variabili a parità di seed; LaTeX di display (dopo
  normalizzazione degli spazi); `credit`, `correct`, `valid` e testo del
  feedback per risposte campione (corrette, sbagliate, non valide).
- L'oracolo non entra in produzione: è escluso dal build Next (fuori da
  `src/`, importato solo dai test).

## Localizzazione

I messaggi upstream usati dal motore (chiavi `R()` in `part.js`, `marking.js`,
`numberentry.js`, `jme.js`, `matrixentry` escluso) diventano
`packages/engine/src/i18n/{it,en}.ts` con le stesse chiavi; l'italiano lo
scriviamo noi, senza dipendere dal file upstream tradotto al 40%.

## Qualità e metodo

- TDD per modulo: prima si traduce il blocco di test upstream, si vede rosso,
  poi si porta il codice. Per i moduli senza test upstream (i18n, API) si
  scrivono test nostri.
- Ogni file derivato apre con l'header Apache (`Copyright 2011-2026 Newcastle
  University ... Ported to TypeScript for SAVINT`).
- Nessuna riscrittura "creativa" del comportamento: dove l'originale è strano
  ma testato, si porta uguale e si annota con `// upstream:` il motivo. Le
  divergenze volute (random iniettato, messaggi, niente XML) sono elencate in
  `packages/engine/DIVERGENCES.md`.
- Subagenti: un implementatore per task, in sequenza; modello capace (Opus) per
  i task 2, 3, 4, 5, 7; standard (Sonnet) per 1, 6, 8, 9, 10; revisore per
  task; revisione finale dell'intero pacchetto.

## Rischi

- **Dimensione di `jme.js`** (6.281 righe, parser + tipi + valutazione): si
  spezza in 4-5 file; il task 2 è il più lungo e il più delicato.
- **Parità numerica**: differenze di arrotondamento tra `Math` e `decimal.js`
  emergono nei test differenziali; si accetta una tolleranza documentata solo
  dove l'originale stesso è instabile.
- **Formato JSON non documentato al 100%**: dove lo schema pubblico e il codice
  divergono, vince il codice upstream (i test lo esercitano).
- **Tempo**: 8-12 settimane di lavoro secondo il programma; con agenti in
  sequenza la durata dipende dal numero di round di revisione per task.

## Punti aperti

- KaTeX o MathJax per il rendering del LaTeX nel player: si decide nel
  sotto-progetto 3 provando l'output di `display.ts` sul corpus.
- Pubblicazione del pacchetto su npm: dopo il lancio.
