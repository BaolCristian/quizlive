# @savint/engine

Motore matematico di SAVINT Esercizi: porting in TypeScript del runtime
[Numbas](https://github.com/numbas/Numbas), per valutare espressioni JME,
correggere le risposte e generare varianti casuali seminate delle domande.

Il pacchetto è **puro**: niente DOM, niente rete, niente `Math.random`, niente
globale `Numbas`. Gira identico nel browser e in Node, e a parità di seme
produce sempre gli stessi numeri — è questo che permette di ricalcolare un
punteggio lato server.

"A parità di seme" va preso alla lettera: la riproducibilità è di ogni singola
`Question`, che il suo generatore ce l'ha (`loadQuestion({ seed })`). Le
utilità senza seme — `evaluate`, `renderLatex` — condividono un generatore di
processo: non usano `Math.random`, ma non sono ripetibili da sole (vedi sotto).

## Il modello in tre parole

Una **domanda** (`Question`) è un oggetto JSON prodotto dall'editor Numbas. Al
caricamento il motore:

1. genera le **variabili** della domanda da un seme esplicito (`random(1..9)` e
   compagnia estraggono da un generatore seminato, non da `Math.random`);
2. sostituisce quelle variabili nell'enunciato, nel testo di aiuto e nelle
   consegne delle parti;
3. costruisce le **parti**, cioè le domande vere e proprie a cui lo studente
   risponde (`numberentry`, `jme`, `patternmatch`, le tre scelte multiple,
   `gapfill`, `information`).

Ogni parte si corregge da sola: le si passa una risposta e restituisce un
punteggio con il feedback già tradotto.

## Uso

### Caricare una domanda

```ts
import { loadQuestion } from "@savint/engine";
import type { NumbasQuestionJSON } from "@savint/engine";

const json: NumbasQuestionJSON = {
  name: "Somma",
  statement: "<p>Quanto fa {a} + {b}?</p>",
  variables: {
    a: { name: "a", definition: "random(1..9)" },
    b: { name: "b", definition: "random(1..9)" },
  },
  parts: [{ type: "numberentry", marks: 1, minValue: "a+b", maxValue: "a+b" }],
};

const q = loadQuestion(json, { seed: "studente-42", locale: "it" });

q.statementHtml; // "<p>Quanto fa 3 + 7?</p>"
q.variables; // { a: 3, b: 7 }
q.parts[0].promptHtml; // la consegna della parte, variabili già sostituite
```

Il **seme** decide la variante: lo stesso seme dà sempre gli stessi numeri, un
seme diverso dà un altro esercizio. Per dare a ogni studente la sua variante
basta usare il suo identificativo come seme. `q.regenerate("altro-seme")`
restituisce una nuova `Question` sullo stesso JSON, senza toccare quella di
partenza.

### Inviare una risposta e leggere il risultato

```ts
const part = q.getPart("p0")!;      // "p0" è la prima parte, "p0g1" il secondo gap di p0
const result = part.submit("10");

result.score;    // 1        punti ottenuti
result.marks;    // 1        punti disponibili
result.credit;   // 1        la quota ottenuta, fra 0 e 1
result.correct;  // true     credit >= 1
result.valid;    // true     la risposta era correggibile (false = da rifare)
result.feedback; // [{ type: "correct", message: "La tua risposta è corretta." }]

q.score();       // { score: 1, marks: 1 }  il totale della domanda
```

`submit(answer)` è idempotente: rinviare la stessa risposta ridà lo stesso
risultato. La forma della risposta dipende dal tipo di parte:

| tipo | risposta |
|---|---|
| `numberentry`, `patternmatch`, `jme` | `string` |
| `1_n_2` (scelta singola) | l'indice della scelta (`number`) |
| `m_n_2` (scelte multiple) | `boolean[]`, una per scelta |
| `m_n_x` (griglia) | `boolean[][]`: `[scelta][risposta]` oppure `[risposta][scelta]` — v. sotto |
| `gapfill` | un array con la risposta di ciascun gap |
| `information` | nessuna |

La griglia di `m_n_x` accetta **entrambe** le orientazioni: la forma "naturale"
`[scelta][risposta]` e la matrice interna `[risposta][scelta]`, che è quella che
usa il runtime Numbas. Il motore le distingue dalle dimensioni, quindi la
distinzione funziona solo se il numero di scelte e quello di risposte sono
diversi: **con una griglia quadrata la risposta è sempre letta come matrice
interna** `[risposta][scelta]`. È anche la forma in cui la risposta finisce nello
stato salvato, qualunque sia quella inviata.

Per un `gapfill` si può inviare la parte madre con l'array di tutte le
risposte, oppure riempire i gap uno per uno e poi inviare la madre:

```ts
q.getPart("p0g0")!.storeAnswer("3");
q.getPart("p0g1")!.storeAnswer("4");
q.getPart("p0")!.submit();
```

`q.submit()` invia tutte le parti in una volta.

### Salvare e ripristinare lo stato

Lo stato è un oggetto JSON piccolo: **non contiene le variabili**, perché si
rigenerano dal seme.

```ts
const state = q.toState();
localStorage.setItem("esercizio", JSON.stringify(state));

// più tardi, magari su un altro processo:
import { restoreQuestion } from "@savint/engine";
const q2 = restoreQuestion(json, JSON.parse(localStorage.getItem("esercizio")!));

q2.score();               // lo stesso punteggio di prima
q2.getPart("p0")!.result; // lo stesso feedback
```

`restoreQuestion` ricarica la domanda con il seme dello stato, rimette le
risposte e rinvia le parti già risposte (nell'ordine giusto, se una dipende
dalla risposta a un'altra). Se lo stato dice `revealed`, le risposte corrette
vengono rivelate e la domanda risulta bloccata.

**Lo stato porta il seme, non la lingua.** I numeri si riproducono esatti;
la lingua no, a meno di ripassarla: `restoreQuestion(json, state, { locale })`.
Senza, si prende la predefinita del processo al momento del ripristino, che
può non essere quella con cui la domanda era stata caricata. È un'asimmetria
voluta — la lingua è una scelta di chi mostra la domanda, e uno stato salvato
deve poter essere riaperto in un'altra lingua — ma sorprende, ora che la lingua
è una proprietà della domanda: chi vuole la stessa di prima salvi `q.locale`
accanto allo stato.

### Rivelare le risposte

```ts
q.revealAnswer();   // blocca la domanda, mostra l'aiuto e le risposte corrette
q.revealed;         // true
q.adviceHtml;       // il testo di aiuto, variabili già sostituite
q.getPart("p0")!.correctAnswer();
```

### Le due utilità indipendenti dalle domande

```ts
import { evaluate, renderLatex } from "@savint/engine";

evaluate("a+1", { a: 2 });  // 3
evaluate("[1,2]");          // [1, 2]
renderLatex("x^2/2");       // "\\frac{x^2}{2}"
```

`renderLatex` produce LaTeX, non HTML: la resa grafica (MathJax, KaTeX, …) è
dell'applicazione. Anche l'enunciato di una domanda contiene le formule come
LaTeX dentro `\(...\)` / `\[...\]`.

Una precisazione su `evaluate`: non prende un seme, e lo scope che costruisce
eredita il generatore casuale di `builtinScope`, che è **uno solo per
processo**. Le funzioni casuali (`random(1..9)`, `shuffle`, `deal`) restano
riproducibili solo nel senso che non usano `Math.random`: due chiamate
consecutive danno risultati diversi, e il risultato della seconda dipende da
quante ne sono state fatte prima nel processo. Se serve una sequenza
riproducibile, la si semina esplicitamente — `seedrandom("seme", expr)` in JME,
oppure uno `Scope` proprio con `{ rng: makeRng("seme") }`. `loadQuestion`, che
un seme lo prende, non ha questo problema: ogni domanda ha il suo generatore.

Stessa forma per la lingua: `evaluate` non ne prende una, e i suoi eventuali
messaggi d'errore escono nella **predefinita del processo** (`setLocale`). È il
comportamento giusto per un'utilità senza domanda — non c'è nessuno scope da
cui ereditarla — ma è un cambiamento rispetto a prima, quando la lingua era una
globale che `loadQuestion` riscriveva: allora `evaluate` seguiva, senza dirlo,
l'ultima domanda caricata. `renderLatex` invece la lingua la accetta
(`renderLatex(expr, { locale: "en" })`).

### `Decimal`

`math.Decimal` esportato da questo pacchetto **non è** la classe di
`decimal.js`: è un `Decimal.clone()` con la configurazione di Numbas
(precisione 40, `modulo: EUCLID`, niente notazione esponenziale sotto le mille
cifre). Un'istanza costruita col `Decimal` di `decimal.js` "nudo" si comporta
diversamente — altra precisione, altra resa — e `instanceof` fra le due classi
è falso. Chi confronta valori decimali del motore deve usare il `Decimal` del
motore. Upstream la differenza non esiste perché muta la classe globale;
qui non la si tocca (vedi DIVERGENCES.md).

### Lingua

I messaggi di feedback e gli errori escono in italiano o in inglese:

```ts
loadQuestion(json, { seed: "s", locale: "en" });
```

La lingua appartiene alla **domanda**, non al processo: `loadQuestion` la fissa
sullo scope della domanda, e resta quella per tutte le correzioni successive,
comunque venga caricata un'altra domanda nel frattempo. `setLocale(l)` imposta
solo la predefinita per chi non passa `locale`, letta al momento del
caricamento; `q.locale` dice quale lingua ha una domanda.

La lingua non cambia la resa dei numeri, che è sempre quella "plain"
(`12345.6789`, separatore di lista `,`).

### Il parser JME

`jme.compile(expr)` e `jme.tokenise(expr)` usano `jme.standardParser`, uno
solo per processo. Un `new jme.Parser()` invece parte da un'istantanea delle
tabelle e si può estendere (`addBinaryOperator`, …) senza toccare nessun altro.

⚠️ Le tabelle della grammatica che il namespace espone — `jme.ops`,
`jme.precedence`, `jme.arity`, `jme.commutative`, `jme.associative`,
`jme.synonyms` e le altre — sono gli **oggetti vivi** dello `standardParser`,
non copie: sono lì per essere letti (che operatori esistono, con che
precedenza). Scriverci dentro cambia il modo in cui viene interpretata ogni
espressione JME di ogni domanda del processo, e non c'è modo di annullarlo. Per
questo le funzioni libere che lo facevano per conto tuo (`addBinaryOperator` e
compagnia sullo `standardParser`) non sono esportate: restano i metodi
omonimi di `Parser`, che agiscono su un'istanza tua.

### Cosa non è supportato

Il caricamento fallisce, con un errore esplicito, se la domanda usa:

- `partsMode: "explore"` (obiettivi, penalità, parti generate al volo);
- un `preamble.js` non vuoto — JavaScript arbitrario, che il motore non esegue
  (`{ ignorePreamble: true }` lo ignora con un avviso invece di fallire);
- una `extensions` non vuota;
- una funzione personalizzata asincrona (`language: "javascript"` con
  `type: "promise"`).

Le funzioni personalizzate JavaScript sincrone sono permesse; per contenuti non
fidati si passa `{ allowJavascriptFunctions: false }`.

Fuori ambito anche: i tipi di parte `matrixentry`, `extension` e quelli custom;
gli `steps` di una parte (il campo è ignorato con un avviso); il formato XML;
la composizione di un esame (navigazione, timer, SCORM).

Gli errori del motore derivano tutti da `EngineError` — `JmeError` per
`jme/`, `parts/`, `marking/` e `question/`, `MathError` per `math/` — e
portano una **chiave** stabile (`err.key`, per esempio
`"question.preamble not supported"`) oltre al messaggio tradotto.
`engineErrorKeys(err)` dà la catena delle chiavi, dalla più esterna alla più
interna, e la lista vuota per un errore che non viene dal motore: è così che si
distingue una domanda malfatta da un guasto del motore.

Il messaggio è tradotto al momento del lancio, nella lingua predefinita del
processo (lo stesso contratto di `Numbas.Error` upstream). Chi deve mostrarlo
in un'altra lingua usa `errorMessageIn(err, locale)`, che lo ricostruisce da
`err.key` e `err.params`; è quel che fa il motore stesso prima di mettere un
errore nel feedback di uno studente.

## Sviluppo

### Test

```
npx vitest run packages/engine        # unitari
npm run test:engine:diff              # differenziali contro l'oracolo
npx tsc -p packages/engine/tsconfig.json --noEmit
npx eslint --quiet packages/engine
```

I test unitari sono la traduzione di quelli upstream
(`.numbas-upstream/tests/`): ogni file dice in testa da quale modulo QUnit
viene e quali casi non sono stati tradotti, con il perché.

### Test differenziali

`test/differential/` fa girare il runtime Numbas originale nello stesso
processo e confronta il port con lui. Sono lenti (il bundle è 1,6 MB e va
caricato in jsdom), quindi stanno fuori da `npm run test:run` — li esclude
`vitest.config.ts` — e hanno una configurazione propria,
`vitest.diff.config.ts`, lanciata da `npm run test:engine:diff`.

Tre file, un aspetto per file:

| file | confronta |
|---|---|
| `variables.diff.test.ts` | la parità del seme (le prime estrazioni di `makeRng` contro `Math.seedrandom`), i valori delle variabili generate, l'enunciato e il nome con le variabili sostituite, e **la posizione del generatore casuale dopo il caricamento** — cioè che il port abbia consumato esattamente gli stessi sorteggi |
| `display.diff.test.ts` | `renderLatex` contro `jme.display.exprToLaTeX` su 83 espressioni (59 dal test "expression to LaTeX" upstream, il resto dalle fixture `savint`) |
| `marking.diff.test.ts` | per ogni parte e quattro risposte campione (corretta, sbagliata, non valida, quella dell'alternativa): `credit`, `valid` e i messaggi di feedback; la risposta corretta, il punteggio e le permutazioni di mescolamento; e un invio dell'intera domanda (`Question#submit`), che copre correzione adattiva, penalità e punteggio |

Il corpus è in `test/differential/corpus.ts`. Le domande fuori dall'ambito del
port (modalità explore, `matrixentry`, step, preambolo JS, funzioni asincrone)
restano nel corpus con il motivo dell'esclusione, calcolato dal JSON.

Una differenza fa fallire il test. È accettata solo se elencata in
`test/differential/known-divergences.json` con il motivo e il riferimento alla
riga di [`DIVERGENCES.md`](./DIVERGENCES.md) che la documenta; e una voce
elencata che non diverge più fa fallire il test a sua volta, così il registro
non invecchia.

### L'oracolo

`packages/engine/oracle/` contiene il runtime Numbas compilato (upstream commit
`0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5`), usato dai test differenziali per
confrontare il port con l'originale. Si rigenera dal clone upstream con:

```
cd .numbas-upstream && make runtime marking_scripts locales
cp tests/numbas-runtime.js tests/marking_scripts.js tests/locales.js ../packages/engine/oracle/
```

Non è codice di produzione: non finisce nel bundle dell'applicazione.

### Fixture

`test/fixtures/upstream/` contiene i dati estratti dal repository upstream:

- `doc-tests.json`, dagli esempi della documentazione JME;
- `part-tests-questions.json`, le 42 domande JSON inline passate a
  `question_test` in `tests/parts/part-tests.mjs`, rigenerabile con
  `node scripts/engine/extract-part-tests-questions.mjs` (non le legge
  staticamente: carica il bundle dell'oracolo, stubba QUnit e intercetta
  `Numbas.createQuestionFromJSON`);
- `part-unit-tests.json`, dalle domande di `tests/parts/part_unit_tests.mjs`
  (le sei in ambito, senza `matrixentry`), rigenerabile con:

```
node -e "import('./.numbas-upstream/tests/parts/part_unit_tests.mjs').then(async m => {
  const fs = await import('node:fs');
  const qs = m.unit_test_questions.filter(q => !q.parts.some(p => p.type === 'matrix'));
  fs.writeFileSync('packages/engine/test/fixtures/upstream/part-unit-tests.json', JSON.stringify(qs, null, 2) + '\n');
})"
```

`test/fixtures/savint/` contiene 12 domande scritte a mano in italiano per le
superiori — una per tipo di parte in ambito, più un `gapfill` misto, una con
`variablesTest`, una con `alternatives` e una con funzioni JME e ruleset
personalizzati. Sono valide sia per `loadQuestion` sia per l'oracolo: il
differenziale fallisce se l'oracolo ne rifiuta una.

`test/fixtures/public/` è il corpus pubblico, **facoltativo e non
committato**: v. il [README](./test/fixtures/public/README.md) di quella
cartella, che documenta anche come l'editor pubblico espone l'esportazione
senza autenticazione.

### Divergenze

Ogni scostamento voluto dal runtime upstream è una riga di
[`DIVERGENCES.md`](./DIVERGENCES.md), con un commento `// upstream:` nel punto
del codice.

Spec: `docs/superpowers/specs/2026-09-02-esercizi-02-motore-design.md`;
inventari di porting in `docs/superpowers/plans/2026-09-02-esercizi-02-motore/inventory/`.

## Licenze

Il port e il resto di SAVINT sono AGPL-3.0-only (`LICENSE` alla radice del
repository). Il runtime Numbas da cui derivano è Apache 2.0, Copyright
2011-2026 Newcastle University: la copia della licenza è in
[`LICENSE-Apache-2.0.txt`](./LICENSE-Apache-2.0.txt) e l'attribuzione, con
l'elenco di quel che è ridistribuito verbatim, in [`NOTICE`](./NOTICE).

Derived from Numbas, see NOTICE.
