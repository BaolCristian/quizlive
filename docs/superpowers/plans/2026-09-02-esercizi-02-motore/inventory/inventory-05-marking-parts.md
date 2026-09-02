# Inventario di porting — motore di correzione (`marking.js`) e tipi di parte (`part.js`, `parts/*.js`)

Sorgente: clone upstream Numbas, commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5` (2026-08-26), in
`/private/tmp/claude-502/.../scratchpad/numbas`. Licenza Apache 2.0, copyright Newcastle University.

File esaminati:
- `runtime/scripts/marking.js` (694 righe)
- `marking_scripts/{numberentry,patternmatch,gapfill,multipleresponse,jme}.jme` (in ambito, 666 righe) e `matrixentry.jme` (144 righe, fuori ambito)
- `runtime/scripts/part.js` (2402 righe)
- `runtime/scripts/parts/{numberentry,patternmatch,gapfill,jme,information}.js` e `multipleresponse.js` (in ambito)
- `runtime/scripts/parts/{matrixentry,custom_part_type,extension}.js` (fuori ambito, solo referenziati)
- `tests/parts/part-tests.mjs` (3999 righe), `tests/parts/part_unit_tests.mjs` (5 righe), `tests/marking_scripts.js` (16 righe)

---

## 1. Scopo dei file

**`runtime/scripts/marking.js`** — Il motore che interpreta gli "script di correzione" (linguaggio JME
con "note" simili a variabili, ma con effetti collaterali su un accumulatore di credito/feedback). Definisce
le funzioni JME con stato (`correct`, `set_credit`, `warn`, `fail`, `apply`, …), la classe `StatefulScope`
(uno `Scope` JME che accumula una lista di `feedback_item`), la classe `MarkingScript` (parsing/valutazione
delle note come un DAG, ordinamento per dipendenza) e `finalise_state` (riduce la sequenza di operazioni di
stato a un `{valid, credit, states}` finale). Non conosce nulla di specifico per tipo di parte.

**`marking_scripts/*.jme`** — Sei "programmi" scritti nel linguaggio delle note, uno per tipo di parte
builtin (`numberentry`, `patternmatch`, `gapfill`, `multipleresponse`, `jme`, `matrixentry`). Sono testo puro,
incorporato come stringa in `Numbas.raw_marking_scripts` da `tests/marking_scripts.js` (o dal bundle di build
per l'app reale) e parsato da `marking.MarkingScript`. `matrixentry.jme` è fuori ambito (tipo `matrix` non
portato).

**`runtime/scripts/part.js`** — La classe base `Numbas.parts.Part` e le funzioni `createPart`/
`createPartFromJSON`/`createPartFromXML`. Gestisce: caricamento da JSON/XML, ciclo di vita della risposta
(`storeAnswer` → `submit` → `mark` → `apply_feedback` → `calculateScore`), credito come frazione esatta,
marking adattivo (sostituzione di variabili con risposte di altre parti), step, parti "next" (modalità
"explore"), alternative. È la superclasse di tutti i tipi di parte in ambito.

**`runtime/scripts/parts/numberentry.js`, `patternmatch.js`, `gapfill.js`, `jme.js`, `information.js`,
`multipleresponse.js`** — Sottoclassi di `Part` che implementano `loadFromJSON`, `getCorrectAnswer`,
`setStudentAnswer`, `rawStudentAnswerAsJME` e i default di `settings` per ciascun tipo. `multipleresponse.js`
implementa tre tipi di parte (`1_n_2`, `m_n_2`, `m_n_x`) con un'unica classe `MultipleResponsePart`.

**`tests/parts/part-tests.mjs`** — Suite QUnit (headless, jsdom) con ~19 moduli e un centinaio di blocchi di
test; costruisce parti/domande da JSON con `createPartFromJSON`/`Numbas.createQuestionFromJSON` ed esercita
`mark()`/`submit()`. `part_unit_tests.mjs` è un fixture JSON (un intero "exam" con 6 domande) usato da un
blocco dei test. `tests/marking_scripts.js` inietta il contenuto dei sei file `.jme` in
`Numbas.raw_marking_scripts` per l'ambiente di test (bundle compilato, non lettura da filesystem).

---

## 2. `marking.js`

### 2.1 Layout

| riga inizio | riga fine | cosa contiene |
|---|---|---|
| 1–19 | | `queueScript`, alias locali (`jme`, `sig`, `math`, tipi `T*`, `Fraction`) |
| 21–66 | | typedef `feedback_item`; enum `Numbas.marking.FeedbackOps` (8 valori) |
| 68–99 | | `Numbas.marking.feedback` — costruttori dei `feedback_item` (uno per ogni `FeedbackOps`, più `feedback`/`concat`) |
| 101–130 | | `marking.state_fn(name,args,outtype,fn)` — helper per creare una `jme.funcObj` "stateful": esegue `fn`, appende `fn().state` allo stato dello `StatefulScope` più vicino nella catena `parent`, e ritorna `fn().return` avvolto come token JME |
| 132–307 | | `state_functions` — array di `jme.funcObj` costruite con `state_fn` (elenco completo in 2.2) |
| 308–310 | | `jme.substituteTreeOps.apply = (tree) => tree` — impedisce la sostituzione ingenua dell'albero sintattico per `apply(...)` (i suoi argomenti sono nomi di note, non da sostituire) |
| 312–332 | | `submit_part(part, answer)` — funzione JS (non JME) che sottomette una risposta a un'altra parte (usata da `submit_part_gap` in gapfill) e ne ritorna `{credit, marks, feedback, answered}` come `TDict` |
| 334–346 | | `state_fn` `submit_part(path)` / `submit_part(path, answer)` — wrapper JME di cui sopra, risolve `scope.question.getPart(path)` |
| 348–366 | | `state_fn` `check_pre_submit(path, answer, exec_path)` — invoca `part.do_pre_submit_tasks`; se ci sono promesse pendenti ritorna un `TPromise` (**unico punto in cui il marking può essere asincrono**, si veda §6) |
| 368–404 | | `state_fn` `apply_marking_script(script_name, studentAnswer, settings, marks)` — istanzia ed esegue un `MarkingScript` con nome arbitrario dentro un altro script (usato per marking custom/plugin, non dai 6 script in ambito) |
| 405–443 | | `state_fn` `mark_part(path, answer)` — marca un'altra parte (usato da `gapfill.jme`) senza applicarne il feedback/credito al proprio stato: chiama `part.mark_answer` direttamente e poi `marking.finalise_state` |
| 444–454 | | `state_fn` `concat_feedback(messages, scale, strip_messages?)` — impacchetta una lista di `feedback_item` (tipicamente il risultato di un `mark_part`/`submit_part` su un gap) come blocco "lift" con fattore di scala (si veda `start_lift`/`end_lift` in `finalise_state`) |
| 457–499 | | classe `Numbas.marking.StatefulScope` — `Scope` JME con `state`/`states`/`state_valid`/`state_errors`; `evaluate()` sovrascritto per accumulare `this.state` in modo annidato (`nesting_depth`) |
| 501–566 | | typedef `marking_script_result`; `marking.compute_note(name, todo, scope)` — calcola una nota una volta sola (cache su `scope.getVariable`), intercetta errori e li registra in `state_errors`/`state_valid`, propaga invalidità alle dipendenze |
| 568–597 | | `Numbas.marking.MarkingScript = jme.variables.note_script_constructor(construct_scope, process_result, compute_note)` — costruttore di classe generato da una funzione factory di `jme-variables.js` (fuori ambito di questo file, appartiene al modulo `variables/`) |
| 599–606 | | typedef `finalised_state` |
| 608–693 | | `marking.finalise_state(states)` — riduce la sequenza di `feedback_item` a `{valid, credit, states}` (dettagli in 2.4) |

### 2.2 Tutte le funzioni "stateful" (note-language) definite in `state_functions`

Ogni riga usa la firma JME (tipi degli argomenti → tipo di ritorno) e la riga in cui `state_fn`/`funcObj` è
istanziata. Tutte, tranne `apply`, ricevono argomenti già **spacchettati** in valori JS (`jme.unwrapValue`).

| nome JME | firma | riga | semantica sullo stato |
|---|---|---|---|
| `correct` | `() -> bool` | 133–138 | `state=[set_credit(1,'correct', R('part.marking.correct'))]`, return `true` |
| `correct` | `(string) -> bool` | 139–144 | come sopra ma con messaggio custom |
| `incorrect` | `() -> bool` | 145–150 | `state=[set_credit(0,'incorrect', R('part.marking.incorrect'))]`, return `false` |
| `incorrect` | `(string) -> bool` | 151–156 | come sopra, messaggio custom |
| `correctif` | `(bool) -> bool` / `(bool,string,string) -> bool` | 169, 170 | dispatch su `correctif()` (157–168): `set_credit(1,...)` o `set_credit(0,...)` secondo la condizione |
| `set_credit` | `(number,string) -> number` | 171–176 | `state=[set_credit(n, undefined, message)]` |
| `multiply_credit` | `(number,string) -> number` | 177–182 | `state=[multiply_credit(n, message)]` |
| `multiply_credit_if` | `(bool,number,string,string) -> bool` | 183–188 | se vero: `multiply_credit`; se falso: solo `feedback(negative_message)` |
| `multiply_credit_if` | `(bool,number,string) -> bool` | 189–194 | se vero: `multiply_credit`; se falso: nessun effetto |
| `add_credit` | `(number,string) -> number` | 195–200 | `state=[add_credit(n, message)]` |
| `add_credit_if` | `(bool,number,string,string) -> bool` | 201–206 | se vero: `add_credit`; se falso: `feedback(negative_message, n<0?'neutral':'incorrect')` |
| `add_credit_if` | `(bool,number,string) -> bool` | 207–212 | se vero: `add_credit`; se falso: nessun effetto |
| `sub_credit` | `(number,string) -> number` | 213–218 | `state=[sub_credit(n, message)]` |
| `end` | `() -> bool` | 219–224 | `state=[end(invalid=false)]` — interrompe la valutazione della nota corrente (si ferma `finalise_state`) |
| `fail` | `(string) -> string` | 225–233 | `state=[set_credit(0,'invalid',message), end(true)]` — segna la risposta **non valida** |
| `warn` | `(string) -> string` | 234–239 | `state=[warning(message)]` — avviso mostrato accanto al widget, non tocca il credito |
| `feedback` | `(string) -> string` | 240–245 | `state=[feedback(message, reason=null, format=null, scope)]` |
| `positive_feedback` | `(string) -> string` | 246–251 | `feedback(message,'correct')` |
| `negative_feedback` | `(string) -> string` | 252–257 | `feedback(message,'incorrect')` |
| `feedback` | `(html) -> html` | 258–263 | come `feedback(string)` con `format='html'` |
| `positive_feedback` | `(html) -> html` | 264–269 | come sopra, `reason='correct'` |
| `negative_feedback` | `(html) -> html` | 270–275 | come sopra, `reason='incorrect'` |
| `;` (operatore) | `(?,?) -> ?` | 276–280 | ritorna il secondo argomento; lo stato di **entrambi** gli argomenti è già stato accumulato durante la loro valutazione (è così che `a();b()` incatena gli effetti) |
| `apply` | `(multiple name\|list) -> name` | 281–307 | **lazy** (in `jme.lazyOps`, riga 307): per ogni argomento che è un nome di nota, recupera `p.states[name]` (lo stato già calcolato per quella nota, dal `StatefulScope` più vicino con `.states`) e lo concatena al proprio; se l'argomento è un valore lista (es. il risultato di `submit_part`), lo tratta come lista letterale di `feedback_item`. Serve per "riprodurre" gli effetti di una nota già valutata nella nota `mark` |
| `submit_part` | `(string) -> dict` / `(string, ?) -> dict` | 334–339, 340–346 | non è in `state_functions` come `state_fn` puro: chiama la funzione JS `submit_part` (312–332) che esegue `part.submit()` sull'altra parte con la risposta data e ritorna `{credit, marks, feedback, answered}` — **non** aggiunge nulla allo stato dello script chiamante (l'aggregazione è responsabilità della nota che lo invoca, es. `concat_feedback`) |
| `check_pre_submit` | `(string,?,string) -> ?` | 348–366 | esegue i task di pre-submit di un'altra parte; può ritornare un `TPromise` |
| `apply_marking_script` | `(string,?,dict,number) -> dict` | 368–404 | esegue ricorsivamente un altro `MarkingScript` per nome, in un nuovo `StatefulScope` figlio |
| `mark_part` | `(string,?) -> dict` | 405–443 | marca (ma non sottomette) un'altra parte: se `answer` è `nothing`, imposta credito 0 con messaggio "nothing entered"; altrimenti chiama `part.mark_answer` e poi `marking.finalise_state`; ritorna `{marks, credit, feedback, valid, states, state_valid, values}` |
| `concat_feedback` | `(list,number,bool?) -> list` | 444–454 | `state=[concat(messages, scale)]`; se `strip_messages`, azzera i campi `message` (usato quando l'icona di feedback del gap è nascosta) |

### 2.3 `MarkingScript` — parsing, ordine di valutazione, note speciali

- **Parsing**: delegato a `Numbas.jme.variables.note_script_constructor` (definito in `jme-variables.js:846-938`,
  fuori ambito di questo file ma linkato qui: appartiene al modulo `variables/` del piano). Lo script sorgente
  viene diviso in blocchi separati da righe vuote (`jme-variables.js:867`); ogni blocco è parsato da
  `ScriptNote` (`jme-variables.js:812-836`) con la regex `/^(\$?[a-zA-Z_][a-zA-Z0-9_]*'*)(?:\s*\(([^)]*)\))?\s*:\s*((?:.|\n)*)$/m`
  — nome, descrizione opzionale tra parentesi, `:`, espressione JME. `this.vars = jme.findvars(tree,[],scope)`
  registra le dipendenze per l'ordinamento topologico.
- Se è passato un `base` (script da estendere), le note del `base` con lo stesso nome diventano accessibili
  come `base_<nome>` (utile per gli script "extendBaseMarkingAlgorithm" custom delle domande, fuori ambito MVP).
- **Ordine di valutazione**: `Script.prototype.evaluate` (`jme-variables.js:919-924`) chiama
  `jme.variables.makeVariables(this.notes, scope, null, compute_note)` — lo stesso risolutore di dipendenze
  usato per le variabili della domanda (DAG topologico su `note.vars`), con `marking.compute_note` (§2.1,
  righe 523-566 di `marking.js`) come funzione di calcolo per singola nota. Ogni nota è calcolata **una sola
  volta** (cache su `scope.getVariable`/`stateful_scope.states[name]`), gli errori di una nota non bloccano
  necessariamente le altre (si veda `marking.ignore_note_errors`, riga 5: se `true` — default — un errore in
  una nota la rende solo "non valida" invece di propagare un'eccezione, a meno che una nota `todo` dipenda
  esplicitamente da essa ed essa stessa non sia valida).
- **Note speciali richieste** (controllate da `Part.prototype.setMarkingScript`, `part.js:501-506`): `mark` e
  `interpreted_answer` devono esistere nello script, altrimenti `part.error("part.marking.missing required note")`.
- **`marks`** non è una nota: è un **parametro** iniettato nello scope di valutazione da
  `Part.prototype.marking_parameters` (`part.js:1863`, `new jme.types.TNum(this.availableMarks())`), insieme a
  `studentAnswer`, `settings`, `path`, `name`, `gaps`, `steps`, `partType`, `exec_path`, `question_definitions`.
- Lo scope di costruzione (`construct_scope`, passato da `marking.js:583-587`) crea uno `StatefulScope([scope,
  {variables:variables}])` — quindi ogni valutazione di script ha il proprio `state`/`states` isolato, ma vede
  le variabili della domanda tramite la catena `parent`.
- `process_result` (`marking.js:588-595`) trasforma il risultato grezzo di `makeVariables` in
  `{states, values, state_valid, state_errors}` = il `marking_script_result` usato da `Part#mark_answer`.

### 2.4 `finalise_state` — calcolo del credito e lista di feedback ordinata

`marking.finalise_state(states)` (righe 617-693) itera la lista di `feedback_item` prodotta dalla nota `mark`
(il campo `states.mark` del risultato dello script) mantenendo:
- `credit` come `math.Fraction` (parte da `Fraction.zero`, **mai** float finché non si chiama `.toFloat()` alla
  fine, riga 690) — evita errori di arrotondamento su sequenze lunghe di `add_credit`/`multiply_credit`;
- `valid` (booleano, diventa `false` se un `end(invalid=true)` viene incontrato);
- `out_states` — lista di operazioni effettivamente "attive" (copia filtrata degli item incontrati, comprese
  quelle dentro un blocco `concat`/lift);
- un meccanismo di **"lift"** per `concat_feedback`: quando incontra un item `CONCAT` (riga 657-664), lo
  espande **inline** nella sequenza come `start_lift(scale) ... messages ... end_lift`; `start_lift` salva
  `(credit, scale)` correnti su uno stack e azzera il credito locale; gli item dentro il lift accumulano
  credito indipendentemente; `end_lift` lo recupera scalato (`credit_padre + credito_lift * scale`) — questo è
  il meccanismo con cui il feedback di un gap (o di un'altra parte) viene "innestato" proporzionalmente nel
  feedback della parte madre;
- `end` (op `END`): se ci sono lift aperti (`num_lifts>0`), salta al prossimo `end_lift` invece di terminare
  tutto lo script (un `fail()`/`end()` dentro un gap termina solo la valutazione di quel gap, non l'intera
  nota `mark` del genitore).

Ritorna `{valid, credit: credit.toFloat(), states: out_states}` — esattamente il tipo `finalised_state`.
**Nota di duplicazione voluta**: `Part.prototype.apply_feedback` (`part.js:1737-1845`) reimplementa la stessa
macchina a stati (stesso switch su `op`, stessa logica di lift) ma applicandola *agli effetti collaterali
reali* sull'oggetto `Part` (`setCredit`/`addCredit`/`subCredit`/`multCredit`/`giveWarning`/`markingComment`)
invece che a un accumulatore puro — il commento a riga 609 lo dice esplicitamente. Nel port TypeScript queste
due funzioni possono condividere un'unica implementazione generica parametrizzata sugli "effetti" da eseguire
per ciascun `op` (vedi §10).

### 2.5 Superficie pubblica `Numbas.marking.*`

| membro | riga | tipo |
|---|---|---|
| `marking.ignore_note_errors` | 5 | `boolean` (flag globale, default `true`) |
| `marking.FeedbackOps` | 42 | enum di 8 stringhe: `set_credit, add_credit, multiply_credit, sub_credit, end, warning, feedback, concat` (nota: `start_lift`/`end_lift` **non** sono nell'enum, sono stringhe letterali usate solo internamente da `finalise_state`/`apply_feedback`) |
| `marking.feedback` | 74 | oggetto di costruttori (`set_credit`, `add_credit`, `sub_credit`, `multiply_credit`, `end`, `warning`, `feedback`, `concat`) |
| `marking.state_fn` | 110 | factory di `jme.funcObj` stateful |
| `marking.StatefulScope` | 471, 499 | classe, estende `jme.Scope` |
| `marking.compute_note` | 523 | funzione di calcolo nota singola |
| `marking.MarkingScript` | 582 | classe (note script) |
| `marking.finalise_state` | 617 | funzione pura `states[] -> {valid,credit,states}` |

---

## 3. Script di correzione (`marking_scripts/*.jme`)

### 3.1 `numberentry.jme` (117 righe)

| nota | significato |
|---|---|
| `studentNumber` | risposta parsata come numero (frazione se `allowFractions`, altrimenti decimale) |
| `isInteger` | `countdp(studentAnswer)=0` |
| `isFraction` | `"/" in studentAnswer` |
| `numerator`, `denominator` | componenti della frazione se `isFraction`, altrimenti `0` |
| `cancelled` | vero se la frazione **non** è ridotta ai minimi termini; se `mustBeReduced`, applica penalità `mustBeReducedPC` |
| `cleanedStudentAnswer` | `cleannumber(studentAnswer, notationStyles)` |
| `student_is_scientific` | la risposta è in notazione scientifica? |
| `scientific_precision_offset` | `1` se `precisionType="dp"` (la notazione scientifica ha una cifra significativa in più delle decimali) |
| `studentPrecision` | precisione effettivamente usata dallo studente (max tra quella richiesta e quella rilevata) |
| `raw_minvalue`, `raw_maxvalue` | `minvalue`/`maxvalue` arrotondati alla precisione dello studente |
| `minvalue`, `maxvalue` | `min`/`max` dei due precedenti (protezione se l'arrotondamento inverte l'ordine) |
| `validNumber` | se `isnan(studentNumber)`: `warn` + `fail` (risposta non valida) |
| `numberInRange` | `correct()` se in `[minvalue,maxvalue]`, altrimenti `incorrect(); end()` |
| `correctPrecision` | penalità `precisionPC` se la precisione non corrisponde a quella richiesta |
| `mark` | `apply(validNumber); apply(numberInRange); assert(numberInRange,end()); if(isFraction, apply(cancelled), apply(correctPrecision))` |
| `interpreted_answer` | `apply(validNumber); studentNumber` |

Settings letti: `settings["allowFractions"]`, `settings["notationStyles"]`, `settings["mustBeReduced"]`,
`settings["mustBeReducedPC"]`, `settings["precisionType"]`, `settings["precision"]`, `settings["minvalue"]`,
`settings["maxvalue"]`, `settings["strictPrecision"]`, `settings["precisionPC"]`, `settings["precisionMessage"]`.

### 3.2 `patternmatch.jme` (50 righe)

| nota | significato |
|---|---|
| `regex_match` | `match_regex(correctAnswer, studentAnswer, "u")` |
| `regex_match_case_insensitive` | come sopra con flag `"iu"` |
| `exact_match` | `studentAnswer = correctAnswer` |
| `exact_match_case_insensitive` | `lower(studentAnswer) = lower(correctAnswer)` |
| `matches` | dispatch su `matchMode` (`"regex"`/`"exact"`) verso `regex_match`/`exact_match` |
| `matches_case_insensitive` | idem, versione case-insensitive |
| `mark` | `assert(allowEmpty or len>0, warn+fail); if(caseSensitive, correct/parziale(partialCredit)/incorrect, correct/incorrect su match case-insensitive)` |
| `interpreted_answer` | `studentAnswer` (stringa grezza) |

Settings letti: `settings["correctAnswer"]`, `settings["matchMode"]`, `settings["caseSensitive"]`,
`settings["partialCredit"]`, `settings["allowEmpty"]`.

### 3.3 `gapfill.jme` (79 righe)

| nota | significato |
|---|---|
| `marked_original_order` | `map(mark_part(gap["path"],studentAnswer), ..., zip(gaps,studentAnswer))` — marca ogni gap nell'ordine originale (serve solo a determinare validità) |
| `interpreted_answers` | valori `interpreted_answer` di ogni gap, ordine originale |
| `answers` | come sopra, ordinati con `sort()` se `settings["sortAnswers"]` |
| `gap_order` | `sort_destinations(interpreted_answers)` se `sortAnswers`, altrimenti `gap_adaptive_order` (parametro iniettato da `GapFillPart.marking_parameters`, non un setting) |
| `answer_order` | `0..(len-1)` se `sortAnswers`, altrimenti `gap_adaptive_order` |
| `gap_feedback` | per ogni coppia `(gap_number,answer_number)` in `zip(gap_order,answer_order)`: `submit_part` sul gap, prefissa il feedback con l'header del gap (se ha nome e più gap), poi `concat_feedback(non_warning_feedback, marks>0 ? result["marks"]/marks : 1/len(gaps), noFeedbackIcon)`; cattura errori con `try(...,err,fail(...))` |
| `all_valid` | tutti i gap sono validi (da `marked_original_order`) |
| `mark` | `assert(all_valid or not sortAnswers, fail(...)); apply(answers); apply(gap_feedback)` |
| `interpreted_answer` | `answers` |
| `pre_submit` | propaga `check_pre_submit` a ciascun gap (rilevante solo se un gap è di un tipo che definisce una nota `pre_submit`, nessuno dei tipi in ambito la definisce) |

Settings letti: `settings["sortAnswers"]`. Parametri non-settings usati: `gaps` (lista di dict con `path`,
`name`, `settings`), `studentAnswer` (lista), `gap_adaptive_order` (iniettato, si veda `gapfill.js:195-229`),
`marks`.

### 3.4 `multipleresponse.jme` (127 righe) — copre `1_n_2`, `m_n_2`, `m_n_x`

| nota | significato |
|---|---|
| `numAnswers`, `numChoices` | dimensioni di `settings["matrix"]` |
| `numTicks` | quante celle sono selezionate in `studentAnswer` |
| `wrongNumber` | `assert(minAnswers<=numTicks<=maxAnswers, ...)`: se `warningType="prevent"` → `fail`; altrimenti `incorrect(); end()` |
| `tick_indexes` | prodotto cartesiano `shuffleAnswers × shuffleChoices` (ordine di iterazione = ordine mescolato) |
| `only_ticked_score_ticks` | marking method "sum ticked cells": per ogni cella ticchata, `add_credit(matrix[x][y]/marks, ...)` o feedback negativo se il distrattore ha testo |
| `layout_tick_indexes` | `tick_indexes` filtrati da `layout[][]` (celle effettivamente visibili, es. triangolari) |
| `binary_score_ticks` | marking method "score per matched cell"/"all-or-nothing": confronta lo stato tick/untick di ogni cella visibile con `matrix[x][y]>0`, assegna `1/len(layout_tick_indexes)` per cella corretta |
| `score_ticks` | dispatch su `settings["markingMethod"]` verso una delle due precedenti |
| `total_score` | somma di `score_ticks` (non usato da `mark`, disponibile per script custom) |
| `mark` | `assert(marks>0,correct()); assert(markingMethod<>"sum ticked cells" or numTicks>0, warn+fail); apply(wrongNumber); apply(score_ticks)` |
| `choice_indices`, `choice_index`, `pair_indices`, `answer_indices` | forme alternative della risposta interpretata (indici) |
| `interpreted_answer` | switch su `settings["interpretedAnswerForm"]` (10 varianti: indice/testo di scelta, lista booleani, indici/testi di scelte, indici/testi di coppie, lista indici/testi; default `studentAnswer` grezzo) |

Settings letti: `settings["matrix"]`, `settings["minAnswers"]`, `settings["maxAnswers"]`,
`settings["warningType"]`, `settings["distractors"]`, `settings["markingMethod"]`, `settings["choices"]`,
`settings["answers"]`, `settings["interpretedAnswerForm"]`. Parametri non-settings: `shuffleAnswers`,
`shuffleChoices`, `layout` (iniettati da `MultipleResponsePart.marking_parameters`, `multipleresponse.js:804-810`).

### 3.5 `jme.jme` (293 righe)

| nota | significato |
|---|---|
| `evaluation_scope` | scope JME con function set/enabled/disabled applicati |
| `expand_juxtapositions_settings` | dict per il passo "espandi giustapposizioni" (`singleLetterVariables`, `noUnknownFunctions`, `implicitFunctionComposition`, `normaliseSubscripts:true`) |
| `studentExpr_empty` | `assert(trim<>"" and parse<>parse(""), warn+fail)` — blocca risposte vuote |
| `notation` | `settings["notation"]` |
| `studentExpr` | parse + espandi giustapposizioni + `simplify(...,'basic')` della risposta; su errore di parsing: `warn+fail` con messaggio, ritorna `nothing` |
| `cleanedStudentString` | `string(studentExpr)` |
| `scope_vars` | `definedvariables()` (variabili già nello scope) |
| `correctExpr` | risposta corretta, stesso trattamento (parse+espandi) |
| `studentMatch`, `correctMatch` | risultato di `match(expr, mustMatchPattern)` con case-sensitivity da `settings["caseSensitive"]` |
| `compareName` | `settings["nameToCompare"]` |
| `formula_replacement_pattern`, `formula_replacement`, `studentCompare`, `correctCompare` | se la risposta è una "formula" (`nome = espressione`), sostituisce `lhs = rhs` con `resultsequal(lhs,rhs,checkingType,checkingAccuracy)` prima del confronto numerico; altrimenti confronta l'espressione (o il gruppo `compareName` se c'è un pattern) |
| `failNameToCompare` | se `mustMatchPattern` e `compareName` sono dati ma lo studente non ha quel gruppo: `incorrect(mustMatchMessage); end()` |
| `studentVariables`, `correctVariables` | `findvars` sulle espressioni da confrontare |
| `unexpectedVariables` | se `checkVariableNames` e ci sono variabili nello studente non nella risposta corretta: `warn`+`feedback` |
| `failMinLength`, `failMaxLength` | penalità `minLengthPC`/`maxLengthPC` se lunghezza fuori range |
| `forbiddenStrings`, `forbiddenStringsPenalty` | stringhe di `settings["notAllowed"]` presenti → penalità `notAllowedPC` + `warn` |
| `requiredStrings`, `requiredStringsPenalty` | stringhe di `settings["mustHave"]` mancanti → penalità `mustHavePC` + `warn` |
| `vRange` | `settings["vsetRangeStart"]..settings["vsetRangeEnd"] # 0` |
| `answerVariables` | unione delle variabili usate |
| `formula_match`, `is_formula`, `formula_variable`, `formula_expression`, `formula_type` | rilevamento/analisi della forma "formula" della risposta corretta |
| `value_generator_definitions`, `value_generators`, `variable_types`, `default_value_generator` | costruzione dei generatori di valori casuali per il controllo numerico (default per tipo: number/decimal/integer/rational/matrix/vector/boolean/set) |
| `vset` | `settings["vsetRangePoints"]` insiemi di valori generati; su errore: `warn+fail`, ritorna `[]` |
| `agree` | per ogni insieme di valori: `resultsequal(eval(studentCompare), eval(correctCompare), checkingType, checkingAccuracy)`; su errore per singolo set: `warn+fail`, `false` |
| `numFails` | numero di disaccordi |
| `numericallyCorrect` | `correct()` se `numFails < settings["failureRate"]`, altrimenti `incorrect()` |
| `sameVars` | **deprecata**, no-op (`nothing`) mantenuta per compatibilità con vecchi script custom |
| `studentMatches`, `mustMatchMessage`, `failMatchPatternPrevent`, `failMatchPattern` | verifica/penalità sul pattern `mustMatchPattern` (bloccante se `mustMatchWarningTime="prevent"`, altrimenti penalità `mustMatchPC`) |
| `mark` | catena di `apply(...)` in ordine: `studentExpr, failNameToCompare, unexpectedVariables, sameVars, failMatchPatternPrevent, numericallyCorrect, failMinLength, failMaxLength, forbiddenStringsPenalty, requiredStringsPenalty, failMatchPattern` |
| `interpreted_answer` | `apply(studentExpr); studentExpr` |

Settings letti: `functionSets`, `enabledFunctions`, `disabledFunctions`, `singleLetterVariables`,
`allowUnknownFunctions`, `implicitFunctionComposition`, `notation`, `correctAnswer`, `mustMatchPattern`,
`caseSensitive`, `nameToCompare`, `checkingType`, `checkingAccuracy`, `minLength`, `minLengthPC`,
`minLengthMessage`, `maxLength`, `maxLengthPC`, `maxLengthMessage`, `notAllowed`, `notAllowedPC`,
`notAllowedMessage`, `mustHave`, `mustHavePC`, `mustHaveMessage`, `vsetRangeStart`, `vsetRangeEnd`,
`vsetRangePoints`, `valueGenerators`, `failureRate`, `mustMatchMessage`, `mustMatchWarningTime`,
`mustMatchPC`, `checkVariableNames`.

### 3.6 `matrixentry.jme` (144 righe) — FUORI AMBITO

Tipo di parte `matrix` non portato (decisione 3 del design doc). Non descritto oltre; le note
`rows/cols/correct_rows/correct_cols/num_cells/cell_indexes/student_cell_precisions/all_same_precision/
studentPrecision/allowFractions/allowedNotationStyles/studentNumbers/studentMatrix/empty_cells/any_empty/
invalid_cells/any_invalid/wrong_precision_cells/wrong_precision/wrong_size/rounded_student_matrix/
rounded_correct_matrix/correct_cells/mark/interpreted_answer` esistono nel file ma non vanno tradotte.

---

## 4. `part.js`

### 4.1 Layout

| riga inizio | riga fine | cosa contiene |
|---|---|---|
| 14–48 | | imports, `Numbas.parts = {}`, `Numbas.partConstructors = {}` |
| 49–84 | | `Numbas.createPartFromXML` — **fuori ambito** (percorso XML) |
| 85–118 | | `Numbas.createPartFromJSON` — **API pubblica principale** |
| 119–143 | | `Numbas.createPart(index,type,path,question,parentPart,store,scope)` — dispatcher su `partConstructors[type]` |
| 145–216 | | costruttore `Part(index,path,question,parentPart,store)` — inizializza `signals`/`events` (schedule), `settings`, `gaps/steps/alternatives`, getter/setter `credit` basato su `creditFraction` (Fraction esatta) |
| 217–241 | | inizio `Part.prototype`, proprietà `signals/store/xml/json` |
| 242–305 | | `loadFromXML` — **fuori ambito** |
| 306–354 | | `loadFromJSON(data)` — **in ambito, dettagliato in 4.2** |
| 355–370 | | `finaliseLoad()` — imposta `marks`/`showStepsLabel`/`applyScripts`/`customConstructor`, valuta le penalità dei `nextParts` |
| 372–385 | | `allChildren()`, `initDisplay()` (fuori ambito, display) |
| 386–420 | | `resume()` — **fuori ambito** (storage/SCORM) |
| 421–443 | | `addStep`, `addAlternative` |
| 444–475 | | `addVariableReplacement(variable,part,must_go_first)` |
| 476–507 | | `baseMarkingScript()` (astratto), `setMarkingScript(str,extend_base)` — istanzia `marking.MarkingScript`, valida note richieste |
| 508–548 | | `setScript(name,order,script)` — inietta JavaScript arbitrario (`new Function`) per sovrascrivere un metodo; **da non portare tal quale** (§7) |
| 549–767 | | proprietà di default e relativi JSDoc (`name`, `marks`, `creditFraction`, `score`, `markingFeedback`, `finalised_result`, `warnings`, `isDirty`, `stagedAnswer`, `answered`, `gaps/steps/alternatives`, `settings` di base) |
| 588–623 | | `assignName(index,siblings)` |
| 774–800 | | `error(message,args,originalError)` — genera `Numbas.Error('part.error',...)` con `R()` |
| 801–880 | | `input_widget`, `input_options`, `applyScripts()` (applica gli script custom di 508-548) |
| 881–933 | | `display` prop, `giveWarning/setWarnings/removeWarnings`, `availableMarks()` |
| 934–990 | | `calculateScore()`, `applyScoreLimits()` |
| 991–1031 | | `storeAnswer(answer,dontStore)`, `setDirty(dirty)` |
| 1032–1065 | | `getScope()`, `makeScope(parentScope)` |
| 1066–1190 | | `markAdaptive()` — cuore del marking adattivo (variable replacement) |
| 1191–1213 | | `wait_for_pre_submit(promise)` — **fuori ambito** (async pre-submit) |
| 1214–1355 | | `submit()` — orchestratore principale |
| 1356–1381 | | `submit_no_staged_answer()`, `hasStagedAnswer()`, `pleaseResubmit()` |
| 1382–1414 | | typedef (`feedbackmessage`, `marking_results`, `alternative_result`, `markAlternatives_result`) |
| 1415–1544 | | `markAlternatives(scope,feedback,exec_path)` — marking contro `this` + `this.alternatives`, sceglie il credito migliore |
| 1545–1577 | | `markAgainstScope(scope,feedback,exec_path)` — wrapper su `markAlternatives` |
| 1578–1622 | | `getErrorCarriedForwardReplacements()`, `shouldUseInAdaptiveMarking()` |
| 1623–1652 | | `errorCarriedForwardScope()` — costruisce lo scope con le variabili sostituite |
| 1653–1679 | | `getCorrectAnswer` (astratto), `setStudentAnswer` (astratto), `rawStudentAnswerAsJME` (astratto), `studentAnswerAsJME` |
| 1680–1716 | | `mark(scope,exec_path)` — esegue lo script e applica `finalise_state` |
| 1717–1731 | | `restore_feedback(feedback)` |
| 1732–1845 | | `apply_feedback(feedback)` — replica la state machine di `marking.finalise_state` applicando effetti reali |
| 1846–1884 | | `marking_parameters(studentAnswer,pre_submit_parameters,exec_path)` |
| 1885–1946 | | `do_pre_submit_tasks(...)` — **fuori ambito** (promesse) |
| 1947–1982 | | `mark_answer(studentAnswer,scope,exec_path)` — invoca `markingScript.evaluate` |
| 1983–2065 | | `setCredit`, `addCredit`, `subCredit`, `multCredit` |
| 2066–2086 | | `markingComment(message,reason,format,scope)` |
| 2087–2134 | | `showSteps/openSteps/hideSteps` — **fuori ambito** (feature "steps", §7) |
| 2135–2147 | | `afterMarkingScope()` |
| 2148–2231 | | `availableNextParts/makeNextPart/removeNextPart` — **fuori ambito** (modalità "explore") |
| 2232–2250 | | `revealAnswer(dontStore)` |
| 2251–2263 | | `lock()` |
| 2264–2400 | | classe `NextPart` — **fuori ambito** (explore) |

### 4.2 Costruttore e `loadFromJSON` — campi letti

`Part(index,path,question,parentPart,store)` (145-216): imposta `index/store/question/parentPart/path`,
`full_path='q'+question.number+path`, `name`, `label=''`, `settings=copyobj(prototype.settings)`,
`gaps=[]/steps=[]/alternatives=[]`, `isStep=/s\d+$/`, `isGap=/g\d+$/`, `errorCarriedForwardReplacements=[]`,
`errorCarriedForwardBackReferences={}`, `nextParts=[]`, `pre_submit_cache=[]`, `markingFeedback=[]`,
`finalised_result={valid:false,credit:0,states:[]}`, `warnings=[]`, `scripts={}`; getter/setter `credit`
delegano a `creditFraction` (`math.Fraction`).

`loadFromJSON(data)` (righe 310-354) — campi letti tramite `Numbas.json.tryLoad`/`tryGet`
(`json.js:13-50`: cerca prima il nome esatto poi il minuscolo; se il target ha già un valore stringa/numero,
forza la coercizione):

| campo JSON | tipo | default (se assente) | riga | significato |
|---|---|---|---|---|
| `marks` | string/number | `0` (via `finaliseLoad`) | 315-316 | punteggio massimo, `parseFloat`-ato subito |
| `useCustomName` | bool | `false` | 315 | usa `customName` invece del nome auto-generato |
| `customName` | string | `''` | 315 | nome custom, sostituito con variabili in `assignName` |
| `showCorrectAnswer` | bool | `true` | 317 | mostra la risposta corretta al reveal |
| `showFeedbackIcon` | bool | `true` | 317 | mostra l'icona ✓/✗ e le voci di feedback legate al credito |
| `stepsPenalty` | number | `0` | 317 | penalità marks per mostrare gli step |
| `showStepsLabel` | string | `R('question.show steps')` (359) | 317 | etichetta bottone step |
| `variableReplacementStrategy` | `'originalfirst'\|'alwaysreplace'` | `'originalfirst'` | 317 | strategia di marking adattivo |
| `adaptiveMarkingPenalty` | number | `0` | 317 | penalità marks se il replacement è usato |
| `adaptiveMarkingUseCondition` | JME string | `''` | 317 | condizione perché un'altra parte "conti" nel replacement |
| `adaptiveMarkingNotUsedMessage` | string | `''` | 317 | messaggio se la condizione non è soddisfatta |
| `exploreObjective` | string\|null | `null` | 317 | **explore mode**, fuori ambito |
| `suggestGoingBack` | bool | `false` | 317 | **explore mode**, fuori ambito |
| `useAlternativeFeedback` | bool | `false` | 317 | mostra tutto il feedback di un'alternativa invece del solo messaggio riassuntivo |
| `variableReplacements` | array `{variable,part,must_go_first}` | `[]` | 318-323 | regole di sostituzione per marking adattivo, via `addVariableReplacement` |
| `steps` | array di JSON parte | `[]` | 324-329 | sotto-parti "step", **fuori ambito come feature UI** ma il campo va comunque riconosciuto nello schema (§7) |
| `alternatives` | array di JSON parte | `[]` | 330-336 | parti alternative (vedi `markAlternatives`) |
| `alternativeFeedbackMessage` | string | `''` | 337 | messaggio mostrato se un'alternativa viene usata |
| `customMarkingAlgorithm` | JME note-script string | `''` | 338-340 | override completo/parziale dello script di marking |
| `extendBaseMarkingAlgorithm` | bool | — | 338-340 | se `customMarkingAlgorithm` estende lo script builtin o lo sostituisce |
| `scripts` | dict `{name:{order,script}}` | `{}` | 341-345 | override JS di metodi — **da non portare** (§7) |
| `nextParts` | array | `[]` | 346-353 | **explore mode**, fuori ambito |

### 4.3 Risoluzione delle `settings`

Le `settings` di base (righe 750-766) sono copiate nel costruttore (`util.copyobj`); ogni sottoclasse le
estende con `util.copyinto(SubClass.prototype.settings, this.settings)` nel proprio costruttore. Nessuna
valutazione JME avviene in `loadFromJSON`: i campi restano stringhe/JSON grezzi (es. `minvalueString`). La
valutazione JME (`jme.subvars` + `scope.evaluate`, o `jme.evaluate` diretto) avviene **in `getCorrectAnswer`**,
chiamato da `finaliseLoad` di ogni sottoclasse — quindi dipende dallo `scope` della domanda (variabili +
funzioni), non dal parsing JSON. Esempi concreti per tipo in §5. La sostituzione `\var{...}` nei **prompt**
delle domande (`jme.contentsubvars`) è gestita da `question.js` (fuori ambito di questo file); `part.js` la usa
solo per il nome custom (`assignName`, riga 590) e per l'etichetta di un `NextPart` (riga 2334, fuori ambito).

### 4.4 Ciclo di vita della risposta — tabella metodi

| metodo | firma | riga | cosa fa | dipende da display/storage/DOM? |
|---|---|---|---|---|
| `storeAnswer` | `(answer, dontStore?)` | 999-1015 | salva `stagedAnswer`, `setDirty(true)`, rimuove warning, eventualmente notifica lo storage (debounced) | **sì** (storage, opzionale/guardato) |
| `setStudentAnswer` | `()` (astratto in `Part`, override per tipo) | 1664 | "congela" `stagedAnswer` in `studentAnswer`/`ticks` per il marking | no |
| `hasStagedAnswer` | `() -> bool` | 1368-1370 | `stagedAnswer !== undefined` | no |
| `submit` | `()` | 1220-1355 | orchestratore: pulisce stato, chiama `markAdaptive()`, gestisce `waiting_for_pre_submit`, applica risultato (`warnings/markingFeedback/finalised_result/credit/answered`), risottomette gli step "dirty", `calculateScore()`, aggiorna storage/display, propaga a parti in `errorCarriedForwardBackReferences` | **sì** (display/storage guardati; explore-mode block righe 1233-1246 da rimuovere) |
| `markAdaptive` | `() -> marking_results\|undefined` | 1073-1190 | prova prima senza sostituzioni (salvo strategia `alwaysreplace`), poi con `errorCarriedForwardScope()` se conviene o è richiesto; gestisce errori di dipendenza "part not answered" | no (ma dipende da `this.question`) |
| `markAgainstScope` | `(scope, feedback, exec_path) -> marking_results` | 1554-1577 | wrapper su `markAlternatives`, riporta l'errore della nota `mark` come warning | no |
| `markAlternatives` | `(scope, feedback, exec_path) -> markAlternatives_result` | 1422-1544 | marca `this` e ciascuna `this.alternatives[i]`, sceglie il credito scalato migliore | no |
| `mark` | `(scope, exec_path) -> mark_result` | 1699-1716 | `rawStudentAnswerAsJME()` → `mark_answer()` → `marking.finalise_state()` → `apply_feedback()`; imposta `interpretedStudentAnswer` | no |
| `mark_answer` | `(studentAnswer, scope, exec_path) -> marking_script_result` | 1959-1982 | `getCorrectAnswer(scope)`, `do_pre_submit_tasks`, poi `this.markingScript.evaluate(scope, marking_parameters)` | parzialmente (pre-submit può essere async, §6) |
| `apply_feedback` | `(finalised_state)` | 1737-1845 | replica la state machine di `finalise_state` chiamando `setCredit/addCredit/subCredit/multCredit/giveWarning/markingComment`; calcola `credit_change`/`credit_message` per ogni voce di `markingFeedback` | no |
| `calculateScore` | `()` | 941-973 | `score = credit * availableMarks()`; se ci sono step mostrati, somma i punteggi degli step (clippato a `marks`); propaga al `parentPart` | **sì** (display, guardato) — la parte "steps" è fuori ambito (§7) |
| `setCredit` | `(credit, message, reason, scope)` | 1991-2004 | imposta `creditFraction` assoluto, accoda a `markingFeedback` (`op:'add_credit'`, delta) se `showFeedbackIcon` | no |
| `addCredit` | `(credit, message, scope)` | 2012-2024 | somma a `creditFraction` | no |
| `subCredit` | `(credit, message, scope)` | 2032-2044 | sottrae da `creditFraction` | no |
| `multCredit` | `(factor, message, scope)` | 2052-2065 | moltiplica `creditFraction` | no |
| `giveWarning` | `(warning)` | 892-896 | accoda a `this.warnings` | **sì** (display, guardato) |
| `markingComment` | `(message,reason,format,scope)` | 2074-2086 | accoda a `markingFeedback` (`op:'feedback'`); se `!showFeedbackIcon` e `reason` è `correct/incorrect`, la scarta | no |
| `markingFeedback` | proprietà `Array` | 653 | lista di azioni di feedback pronte per la UI (con `credit_change`/`credit_message` aggiunti da `apply_feedback`) | no |
| `revealAnswer` | `(dontStore?)` | 2238-2250 | `revealed=true`, `setDirty(false)`, apre e rivela gli step | **sì** (display/storage, guardati); step-part fuori ambito |
| `getCorrectAnswer` | `(scope)` — **astratto** | 1659 | calcola/valuta la risposta corretta secondo lo scope dato; override per tipo (§5) | no |
| `validate` | — | **non definita su `Part`** | — | solo `information.js:53` (ritorna sempre `true`) e `question.js:1295` (validazione a livello domanda); nessun metodo generico `Part.prototype.validate` |
| `rawStudentAnswerAsJME` | `() -> jme.token` — **astratto** | 1670-1671 | rappresentazione JME grezza della risposta, passata come `studentAnswer` allo script | no |
| `studentAnswerAsJME` | `() -> jme.token` | 1676-1678 | default: `this.interpretedStudentAnswer` (valore della nota `interpreted_answer`); usato per il marking adattivo (error-carried-forward) | no |
| `marks` | proprietà `number` | 633 | punteggio massimo dichiarato | no |
| `credit` | getter/setter su `creditFraction` | 203-215 | proporzione `[0,1]` come frazione esatta | no |
| `score` | proprietà `number` | 648 | `credit * availableMarks()` (più step) | no |
| `answered` | proprietà `bool` | 679 | impostata da `apply_feedback` (= `valid` del `finalised_state`) | no |
| `isDirty` | proprietà `bool` | 668 | risposta modificata dopo l'ultimo submit | **sì** (display, guardato — propaga a `parentPart`/`question.display`) |
| `variableReplacements` / marking adattivo | `addVariableReplacement`, `getErrorCarriedForwardReplacements`, `shouldUseInAdaptiveMarking`, `errorCarriedForwardScope` | 453-475, 1578-1652 | in ambito: meccanismo per far dipendere la correzione di una parte dalla risposta di un'altra | no |
| `steps` | proprietà, `addStep`, `showSteps/openSteps/hideSteps` | 421-432, 2087-2134 | **fuori ambito come feature UI** (§7); la sola parte necessaria per la correzione (penalità marks se `stepsShown`) è residua |
| `nextParts` / explore mode | `availableNextParts/makeNextPart/removeNextPart`, classe `NextPart` | 2148-2400 | **fuori ambito** (§7) |
| `alternatives` | `addAlternative`, `markAlternatives` | 439-443, 1415-1544 | ambiguo — non è nell'API pubblica del design doc; vedi §11 |

---

## 5. Tipi di parte in ambito

### 5.1 `numberentry` (`parts/numberentry.js`, 295 righe)

**Layout**: 19-32 costruttore · 33-52 `loadFromXML` (fuori ambito) · 53-66 `loadFromJSON` · 67-78 `finaliseLoad`
· 79-88 `initDisplay`/`resume` (fuori ambito) · 89-97 `baseMarkingScript` · 98-141 default `settings` · 142-158
`input_widget`/`input_options` (fuori ambito, UI) · 159-263 `getCorrectAnswer` · 264-276 `cleanAnswer` · 277-290
`setStudentAnswer`/`rawStudentAnswerAsJME` · 291-295 registrazione.

Campi JSON (`loadFromJSON`, righe 53-66):

| campo | tipo | default | riga | significato |
|---|---|---|---|---|
| `answer` | string/number | — | 56-58 | se presente, imposta **sia** `minvalueString` **sia** `maxvalueString` (risposta esatta) |
| `minValue` | JME string | `'0'` | 59 | → `settings.minvalueString` |
| `maxValue` | JME string | `'0'` | 59 | → `settings.maxvalueString` |
| `correctAnswerFraction` | bool | `false` | 60 | mostra la risposta come frazione al reveal |
| `correctAnswerStyle` | string | — | 60 | stile di formattazione numero (`niceNumber`) |
| `allowFractions` | bool | `false` | 60 | accetta `a/b` come risposta |
| `mustBeReduced` | bool | `false` | 61 | la frazione deve essere ridotta |
| `mustBeReducedPC` | number (%, /100) | `0` | 61-62 | credito parziale se non ridotta |
| `notationStyles` | array string | `['plain','en','si-en']` | 63 | stili di notazione numerica accettati |
| `precisionPartialCredit` | number (%, /100) | `0` | 64-65 | → `settings.precisionPC` |
| `strictPrecision` | bool | `false` | 64 | zeri finali obbligatori |
| `showPrecisionHint` | bool | `true` | 64 | UI |
| `showFractionHint` | bool | `true` | 64 | UI |
| `precision` | JME string | `'0'` | 64 | → `settings.precisionString` |
| `precisionType` | `'none'\|'dp'\|'sigfig'` | `'none'` | 64 | tipo di precisione richiesta |
| `precisionMessage` | string | `R('You have not given your answer...')` (138) | 64 | messaggio penalità precisione |

**Settings dopo valutazione** (`getCorrectAnswer`, 164-263): `precision` (numero, valutato da
`precisionString` con `jme.subvars`+`scope.evaluate`; errore se `sigfig`≤0 o `dp`<0), `minvalue`/`maxvalue`
(valutati, tipizzati `decimal` con "wiggle room" di 12 cifre extra se sono numeri finiti — righe 196-213,
per assorbire errori di floating point nella generazione della variante), `displayAnswer` (stringa
finale mostrata al reveal, da `displayAnswerString` o calcolata come punto medio/estremo dell'intervallo).
`finaliseLoad` (67-78) forza `allowFractions=false` se `precisionType != 'none'`.

**Risposta studente**: `rawStudentAnswerAsJME()` → `TString(studentAnswer)` dopo `cleanAnswer` (trim, 270-276).
**`getCorrectAnswer`**: vedi sopra; ritorna `settings.displayAnswer` (stringa). Validazioni: `part.setting not
present` se min/max mancanti; `part.numberentry.zero sig fig` / `part.numberentry.negative decimal places`.

### 5.2 `multipleresponse` — `1_n_2`, `m_n_2`, `m_n_x` (`parts/multipleresponse.js`, 843 righe)

**Layout**: 34-38 costruttore · 40-254 `loadFromXML` (fuori ambito) · 255-335 `loadFromJSON` · 336-355 `resume`
(fuori ambito) · 356-487 `finaliseLoad` · 488-502 `initDisplay`/`ticks`/`baseMarkingScript` · 503-553
proprietà/`settings` default · 554-584 `input_widget`/`input_options` (fuori ambito UI) · 585-718
`getCorrectAnswer` · 719-739 `storeTick` · 740-752 `setStudentAnswer`/`rawStudentAnswerAsJME` · 753-789
`studentAnswerAsJME` · 790-802 `revealAnswer` · 804-810 `marking_parameters` · 819-839 `layoutTypes` · 840-843
registrazione (3 tipi sulla stessa classe).

**`this.flipped`**: per `1_n_2`/`m_n_2`, "answer" e "choice" sono scambiati nello schema JSON storico (righe
260-264, commento esplicito "extremely bad design decision"); nel port conviene normalizzare lo schema
pubblico ed emulare `flipped` solo internamente.

Campi JSON (`loadFromJSON`, righe 255-335):

| campo | tipo | default | riga | significato |
|---|---|---|---|---|
| `maxMarks` | number | — | 266 | → `this.marks`, solo se `type != '1_n_2'` |
| `showCellAnswerState` | bool | — | 268 | UI |
| `interpretedAnswerForm` | string | `'list of list of boolean'` | 268 | forma di `interpreted_answer` (10 varianti, §3.4) |
| `minMarks` | number | `0` | 269 | → `settings.minimumMarks` |
| `markingMethod` | string | `'sum ticked cells'` | 269 | `'sum ticked cells'\|'score per matched cell'\|'all-or-nothing'` |
| `minAnswers` | JME string | `'0'` | 270 | → `settings.minAnswersString` |
| `maxAnswers` | JME string | `'0'` | 270 | → `settings.maxAnswersString` (0 = illimitato) |
| `shuffleChoices` | bool | `false` | 270 | ordine casuale delle scelte (righe) |
| `shuffleAnswers` | bool | `false` | 270 | ordine casuale delle risposte (colonne) |
| `displayType` | string | `'radiogroup'` | 270 | `radiogroup\|checkbox\|dropdownlist\|...` |
| `displayColumns` | number | — | 270 | UI |
| `showBlankOption` | bool | — | 270 | UI |
| `warningType` | `'none'\|'prevent'\|'warn'` | `'none'` | 271 | comportamento su numero scelte errato |
| `layout.type` | string | `'all'` | 272 | `all\|lowertriangle\|strictlowertriangle\|uppertriangle\|strictuppertriangle\|expression` (solo `m_n_x`) |
| `layout.expression` | JME string | `''` | 272 | matrice/lista di liste booleana, se `layoutType='expression'` |
| `choices` | array string \| JME string (lista) | — | 273-284 | testi delle scelte; se stringa, valutata come JME lista |
| `answers` | array string \| JME string (lista) | — | 285-296 | testi delle risposte (solo `m_n_x`, o "choices" per `1_n_2`/`m_n_2` dopo flip) |
| `matrix` | JME string \| array di array/numero | — | 300-312 | punteggio per cella; se array e non `flipped`, trasposta (`rows=numChoices,columns=numAnswers` prima della trasposizione) |
| `distractors` | array (di array, o di stringhe se flipped) | righe di `''` | 319-334 | messaggio mostrato per cella se sbagliata (HTML) |

**Settings dopo valutazione** (`finaliseLoad`, 356-486): `shuffleChoices`/`shuffleAnswers` diventano **permutazioni**
(`math.deal(n)` — usa `Math.random`, ordine di generazione = choices poi answers, righe 371-380) o identità
(`math.range(n)`); `minAnswers`/`maxAnswers` valutati via JME nello scope; per `m_n_x` con `layoutType`, la
matrice `layout[i][j]` è costruita chiamando la funzione di `layoutTypes` o valutando `layoutExpression`;
`getCorrectAnswer` (585-718) valuta `markingMatrixString`/`markingMatrixArray` in una matrice numerica
`settings.matrix[answer][choice]`, azzera le celle non in `layout`, e calcola `settings.maxMatrix` (la
combinazione "perfetta" di tick, usata per il reveal); se `marks==0` esplicitamente, lo **calcola** sommando i
punteggi massimi ottenibili (righe 436-475, complesso: dipende dal tipo e da `displayType`).

**Risposta studente**: `ticks` (matrice `numAnswers × numChoices` di bool) ← `stagedAnswer` via `setStudentAnswer`.
`rawStudentAnswerAsJME()` → `wrapValue(this.ticks)`. `studentAnswerAsJME()` produce forme diverse per tipo
(indice singolo per `1_n_2`, lista di bool per `m_n_2`, lista di indici o matrice per `m_n_x` secondo
`displayType`). Validazioni: numerosi `error()` su matrice/scelte malformate (`part.mcq.*`, elencati in §7/§9).

### 5.3 `patternmatch` (`parts/patternmatch.js`, 152 righe)

**Layout**: 28-31 costruttore · 32-44 `loadFromXML` (fuori ambito) · 45-51 `loadFromJSON` · 52-54
`finaliseLoad` · 55-64 `initDisplay`/`resume` (fuori ambito) · 65-98 `settings` default · 99-114
`input_widget`/`input_options` · 115-133 `getCorrectAnswer` · 134-146 `setStudentAnswer`/`rawStudentAnswerAsJME`
· 147-152 registrazione.

| campo | tipo | default | riga | significato |
|---|---|---|---|---|
| `answer` | JME/regex string | `'.*'` | 48 | → `settings.correctAnswerString` |
| `displayAnswer` | string | `''` | 48 | → `settings.displayAnswerString` |
| `caseSensitive` | bool | `false` | 49 | |
| `partialCredit` | number (%, /100) | `0` | 49-50 | credito se corretto tranne il case |
| `matchMode` | `'regex'\|'exact'` | `'regex'` | 49 | |
| `allowEmpty` | bool | `false` | 49 | |

**Settings dopo valutazione** (`getCorrectAnswer`, 120-133): `correctAnswerString` sostituito con variabili
(`jme.subvars(...,scope,true)`); se `matchMode='regex'`, avvolto in `^...$`; `displayAnswer` da
`displayAnswerString` sostituito. **Risposta studente**: `rawStudentAnswerAsJME()` → `TString(studentAnswer)`
grezza (nessun trim/pulizia, a differenza di `numberentry`).

### 5.4 `gapfill` (`parts/gapfill.js`, 244 righe)

**Layout**: 28-31 costruttore · 32-43 `settings` default · 45-56 `loadFromXML` (fuori ambito) · 57-68
`loadFromJSON` · 69-78 `finaliseLoad` · 79-81 `initDisplay` (fuori ambito) · 83-100 `availableMarks` (override,
somma i marks dei gap) · 103-112 `addGap` · 113-119 `resume` (fuori ambito) · 120-134
`stagedAnswer`/`hasStagedAnswer` · 135-141 `baseMarkingScript` · 142-151 `revealAnswer` (override, delega ai
gap) · 152-166 `rawStudentAnswerAsJME` · 167-171 `storeAnswer` (override, delega ai gap) · 172-177
`setStudentAnswer` · 178-187 `studentAnswerAsJME` · 189-193 `getCorrectAnswer` · 195-229 `marking_parameters`
(**cruciale**: calcola `gap_adaptive_order` rilevando cicli nelle sostituzioni adattive tra gap, errore
`part.gapfill.cyclic adaptive marking`) · 231-235 `lock` · 237-244 registrazione.

| campo | tipo | default | riga | significato |
|---|---|---|---|---|
| `sortAnswers` | bool | `false` | 61 | ordina le risposte prima di marcare (solo se tutti i gap hanno lo stesso `type`, altrimenti disabilitato silenziosamente in `finaliseLoad`, righe 70-77) |
| `inlineCorrectAnswer` | bool | `true` | 61 | UI |
| `gaps` | array di JSON parte | — | 62-67 | ogni gap è una `Part` completa, creata con `createPartFromJSON(i, gd, path+'g'+i, ...)` |

Nessuna valutazione JME propria (delega tutto ai gap). **Risposta studente**: `rawStudentAnswerAsJME()` →
`TList` dei `rawStudentAnswerAsJME()` di ogni gap, oppure `undefined` se **uno solo** dei gap ritorna
`undefined` (152-166). **`getCorrectAnswer`**: `gaps.map(g => g.getCorrectAnswer(scope))` — delega pura.
`marks` non è letto da JSON per il gapfill: è **sempre ricalcolato** come somma di `gap.marks` (`addGap`, riga
110, e `availableMarks`, righe 87-99).

### 5.5 `jme` (`parts/jme.js`, 385 righe)

**Layout**: 29-35 costruttore · 36-141 `loadFromXML` (fuori ambito) · 142-169 `loadFromJSON` · 170-176 `resume`
(fuori ambito) · 177-186 `finaliseLoad` · 187-189 `initDisplay` (fuori ambito) · 190-201
`studentAnswer`/`baseMarkingScript` · 202-282 `settings` default + JSDoc · 283-307 `input_widget`/
`input_options`/`getNotation` · 309-349 `getCorrectAnswer` · 350-362 `setStudentAnswer`/`rawStudentAnswerAsJME`
· 364-379 `addValueGenerator` · 381-386 registrazione.

| campo | tipo | default | riga | significato |
|---|---|---|---|---|
| `answer` | JME string | `''` | 147 | → `settings.correctAnswerString` |
| `answerSimplification` | string (regole separate da virgola) | `''` (poi default in `finaliseLoad`, riga 179) | 147 | → `settings.answerSimplificationString` |
| `checkingType` | string | `'RelDiff'` | 148 | `RelDiff\|AbsDiff\|DecPlaces\|SigFigs\|StringMatch` |
| `checkingAccuracy` | number | `0` | 148 | |
| `failureRate` | number | `1` | 148 | numero di disaccordi tollerati |
| `functionSets` | array string | `[]` (poi tutti i set, `finaliseLoad` riga 181-183) | 149 | |
| `enabledFunctions`, `disabledFunctions` | array string | `[]` | 149 | filtro funzioni disponibili nello scope di valutazione |
| `vsetRangePoints` | number | `1` | 150 | quanti set di valori generare |
| `vsetRange` | array `[start,end]` (string/number) | `[0,1]` | 151-155 | → `vsetRangeStart`/`vsetRangeEnd` (`util.parseNumber`) |
| `maxlength.length` | number | `0` | 156 | → `settings.maxLength` |
| `maxlength.partialCredit` | number | `0` | 156 | → `settings.maxLengthPC` |
| `maxlength.message` | string | `'Your answer is too long'` | 156 | → `settings.maxLengthMessage` |
| `minlength.length`/`.partialCredit`/`.message` | come sopra | `0`/`0`/`'Your answer is too short'` | 157 | → `minLength`/`minLengthPC`/`minLengthMessage` |
| `musthave.strings` | array string | `[]` | 158 | → `settings.mustHave` |
| `musthave.showStrings` | bool | `false` | 158 | → `mustHaveShowStrings` |
| `musthave.partialCredit` | number | `0` | 158 | → `mustHavePC` |
| `musthave.message` | string | `''` | 158 | → `mustHaveMessage` |
| `notallowed.*` | come `musthave.*` | idem | 159 | → `notAllowed`/`notAllowedShowStrings`/`notAllowedPC`/`notAllowedMessage` |
| `mustmatchpattern.pattern` | JME pattern string | `''` | 160 | → `mustMatchPatternString` |
| `mustmatchpattern.partialCredit` | number (%, /100) | `0` | 160-161 | → `mustMatchPC` |
| `mustmatchpattern.message` | string | `''` | 160 | → `mustMatchMessage` |
| `mustmatchpattern.nameToCompare` | string | `''` | 160 | → `nameToCompare` |
| `mustmatchpattern.warningTime` | `'input'\|'submission'\|'prevent'` | `'submission'` | 160 | → `mustMatchWarningTime` |
| `checkVariableNames` | bool | `false` | 162 | |
| `singleLetterVariables` | bool | `false` | 162 | |
| `allowUnknownFunctions` | bool | `true` | 162 | |
| `implicitFunctionComposition` | bool | `false` | 162 | |
| `showPreview` | bool | — | 162 | UI |
| `caseSensitive` | bool | `false` | 162 | |
| `notation` | string | `'standard'` | 162 | notazione JME da usare per parse/display |
| `valuegenerators` | array `{name,value}` | — | 163-168 | → `addValueGenerator`, popola `settings.valueGenerators[name] = TExpression` |

**Settings dopo valutazione** (`getCorrectAnswer`, 314-349): `answerSimplification` (ruleset risolto via
`jme.collectRuleset`), `correctAnswer` (espressione con variabili sostituite, giustapposizioni espanse,
semplificata secondo le regole), `correctVariables` (`findvars`), `mustMatchPattern` (compilato con la
notazione `pattern_matching`). **Risposta studente**: `rawStudentAnswerAsJME()` → `TString(studentAnswer)`
grezza (il parsing avviene nello script `.jme`, non qui). Validazione: `part.jme.answer missing` se
`correctAnswerString` manca e `marks>0`.

### 5.6 `information` (`parts/information.js`, 71 righe)

**Layout**: intero file, nessuna suddivisione necessaria: 27-28 costruttore vuoto · 30-36 `assignName`
(override: ritorna sempre `false`, cioè non incrementa il contatore di etichette, a meno di `useCustomName`)
· 38-41 `loadFromXML`/`loadFromJSON` (entrambi no-op) · 42-45 `finaliseLoad` (`answered=true`,`isDirty=false`)
· 46-48 `initDisplay` (fuori ambito) · 49-56 `validate()` (sempre `true`) · 57-61 `setDirty` (no-op) · 62-64
`hasStagedAnswer` (sempre `true`) · 65 `doesMarking=false` · 67-71 registrazione.

Nessun campo JSON specifico (il `prompt` è gestito da `question.js`, non da `part.js`). Nessuna correzione:
`doesMarking=false` fa sì che `setMarkingScript` (`part.js:487-490`) ritorni immediatamente senza costruire
alcun `MarkingScript`, e `submit()`/`markAdaptive()` (`part.js:1076-1078`) ritornano `undefined` per
`doesMarking=false`, quindi `submit()` imposta `credit=0` con messaggio `'part.marking.no result after
replacement'` **salvo** che `answered` viene comunque forzato `true` da `finaliseLoad`. Nel port, `information`
è essenzialmente un "no-op part": nessuna `Answer`, nessun `MarkingResult` significativo.

---

## 6. Dipendenze e globali

### 6.1 `Numbas.jme` / `Numbas.jme.variables`

Usati pervasivamente in `marking.js` e `part.js`: `jme.funcObj`, `jme.Scope`, `jme.types.{TNothing,TString,
THTML,TList,TName,TNum,TBool,TDict,TExpression,TPromise,TScope}`, `jme.unwrapValue`/`jme.wrapValue`,
`jme.lazyOps`, `jme.substituteTreeOps`, `jme.signature` (`sig`), `jme.normaliseName`, `jme.compile`,
`jme.findvars`, `jme.subvars`, `jme.contentsubvars`, `jme.isType`, `jme.castToType`, `jme.makeSafe`,
`jme.evaluate`, `jme.display.simplifyExpression`, `jme.collectRuleset`, `jme.notations` (incl.
`pattern_matching`), `jme.expandJuxtapositions`/`scope.expandJuxtapositions`. `jme.variables.computeVariable`
(usato da `marking.compute_note`, `marking.js:534`), `jme.variables.note_script_constructor`
(`marking.js:582`), `jme.variables.makeVariables`/`remakeVariables` (indirettamente, dentro
`note_script_constructor`, `jme-variables.js:846-938`, e in `part.js:1650` `errorCarriedForwardScope`),
`jme.variables.DOMcontentsubvars` (`multipleresponse.js:243`, fuori ambito, solo XML/display).

### 6.2 `Numbas.util`

`capitalise`, `nicePartName`, `copyobj`, `copyinto`, `copyarray`, `extend`, `extend_object`, `debounce`
(`part.js:201`, solo per il debounce dello storage — fuori ambito), `eq` (confronto token, usato in
`do_pre_submit_tasks` per il cache lookup — fuori ambito), `isFloat`, `isNonemptyHTML`, `letterOrdinal`,
`parseNumber`.

### 6.3 `Numbas.math`

`math.Fraction` (`.zero`, `.one`, `.fromFloat`, `.add`, `.subtract`, `.multiply`, `.toFloat`) — usato sia in
`marking.finalise_state` sia in `Part`'s `creditFraction`/`setCredit`/`addCredit`/`subCredit`/`multCredit`;
`math.deal(n)` (permutazione casuale, `multipleresponse.js:372,378` — **usa `Math.random`**, va sostituito col
generatore iniettato/seminato del progetto, §9), `math.range(n)`, `math.niceNumber`, `math.niceRealNumber`,
`math.rationalApproximation`, `math.ComplexDecimal`. `Numbas.matrixmath.transpose` (`multipleresponse.js`).

### 6.4 `R()` — chiavi i18n usate in questi file (JavaScript)

**`marking.js`**: `part.marking.correct`, `part.marking.incorrect`, `part.marking.nothing entered` (3 chiavi).

**`part.js`** (20 chiavi): `question.show steps`, `gap`, `step`, `part.marking.steps no matter`,
`part.marking.steps change`, `part.marking.minimum score applied`, `part.marking.maximum score applied`,
`part.marking.used variable replacements`, `part.marking.adaptive variable replacement does not satisfy
condition message`, `part.marking.adaptive variable replacement does not satisfy condition`, `part.marking.error
in adaptive marking`, `part.marking.counts towards objective`, `part.marking.no result after replacement`,
`part.marking.did not answer`, `part.marking.maximum scaled down`, `part.marking.revealed steps`,
`part.marking.not submitted`, `part.marking.resubmit because of variable replacement`,
`feedback.you were awarded`, `feedback.taken away`. Più `R.apply(this,[message,args])` generico in `error()`
(riga 786, chiave dinamica).

**`parts/numberentry.js`** (3): `'You have not given your answer to the correct precision.'` (usata come
chiave letterale — idioma Numbas: se la chiave non esiste nel dizionario, `R()` ritorna la stringa stessa come
fallback), `minimum value`, `maximum value`.

**`parts/jme.js`** (2): `part.jme.answer too long`, `part.jme.answer too short`.

### 6.5 `translate(...)` — chiavi i18n usate negli script `.jme` in ambito (23 chiavi uniche)

`part.gapfill.error marking gap`, `part.gapfill.feedback header`, `part.jme.answer invalid`, `part.jme.error
checking numerically`, `part.jme.marking.correct`, `part.jme.must-have bits`, `part.jme.must-have one`,
`part.jme.must-have several`, `part.jme.must-match.failed`, `part.jme.must-match.warning`, `part.jme.not-allowed
bits`, `part.jme.not-allowed one`, `part.jme.not-allowed several`, `part.jme.unexpected variable name`,
`part.marking.nothing entered`, `part.marking.partially correct`, `part.mcq.correct choice`, `part.mcq.incorrect
choice`, `part.mcq.wrong number of choices`, `part.numberentry.answer invalid`, `part.numberentry.answer not
reduced`, `part.patternmatch.correct except case`, `question.can not submit`. (`matrixentry.jme` ne usa altre
4, fuori ambito: `part.matrix.empty cell`, `part.matrix.invalid cell`, `part.matrix.not all cells same
precision`, `part.matrix.some incorrect`.)

### 6.6 `Numbas.display` / `Numbas.storage` / SCORM

Ogni accesso è **sempre guardato** (`this.display && ...`, `this.store && ...`), quindi rimuovibile per
semplice cancellazione della riga/branch: `initDisplay` (crea un `*PartDisplay` per tipo, tutte fuori
ambito), `resume()` (legge da `this.store.loadPart(this)`), `store.storeStagedAnswer`, `store.partAnswered`,
`store.stepsShown/stepsHidden`, `store.initPart`. Nessuna logica di marking dipende dal loro valore (sono
puramente notifiche best-effort).

### 6.7 `Numbas.schedule`

`Numbas.schedule.SignalBox`/`EventBox` (`part.js:161-162`) — pub/sub usato per `signals.trigger('finaliseLoad'
| 'resume' | ...)` ed `events.trigger('pre-submit' | 'post-submit' | 'setCredit' | ...)` in **decine** di punti
del file. Nessuno di questi eventi è consumato da `marking.js` o dai `parts/*.js` in ambito per calcolare il
risultato — sono hook per `display`/plugin esterni. Sicuro da rimuovere/no-op nel port (si può sostituire con
callback opzionali se serve osservabilità, ma non è necessario per `submit()->MarkingResult` sincrono).

### 6.8 `Numbas.Question`

`part.question` è usato per: `question.getPart(path)` (risoluzione riferimenti in adaptive marking/gap/
submit_part), `question.unwrappedVariables` (script JS custom, fuori ambito), `question.local_definitions`
(variabili definite dalla domanda, usate per escludere variabili "note" dal riconoscimento come "studente" in
`jme.js:333-337` e per `NextPart.usesStudentAnswer`), `question.partDictionary`, `question.variablesTodo`
(`errorCarriedForwardScope`), `question.exam`/`question.partsMode`/`question.showAllParts` (explore mode, fuori
ambito), `question.addExtraPart`/`removePart`/`updateScore` (explore mode, fuori ambito), `question.isDirty()`,
`question.signals`.

### 6.9 Sincrono o asincrono?

**Il marking dei sei tipi in ambito è interamente sincrono.** L'unico punto della codebase in cui il marking
può ritornare una `Promise` è `do_pre_submit_tasks`/`check_pre_submit` (`part.js:1904-1946`, `marking.js:348-
366`), attivato solo se `this.markingScript.notes.pre_submit !== undefined`. Tra gli script in ambito, **solo
`gapfill.jme` definisce una nota `pre_submit`** (righe 70-79), ma il suo unico effetto è chiamare
`check_pre_submit` sui gap — che a sua volta ritorna una promessa solo se **il gap stesso** ha una nota
`pre_submit`. Nessuno dei tipi `numberentry/patternmatch/multipleresponse/jme/information` definisce
`pre_submit`, quindi in pratica anche `gapfill` di parti-in-ambito resta sincrono. Il meccanismo `TPromise`/
`waiting_for_pre_submit` esiste per estensioni e `custom_part_type` (funzioni JS `async` esposte come funzioni
JME, fuori ambito). **Conclusione per il port**: `submit(answer): MarkingResult` può essere implementato in
modo puramente sincrono per tutti gli 8 tipi in ambito, senza `Promise`/`async` nell'API pubblica.

---

## 7. Da non portare

| file | righe | ragione |
|---|---|---|
| `part.js` | 49-84 (`createPartFromXML`), 242-305 (`loadFromXML`) | percorso XML, sostituito da `createPartFromJSON`/`loadFromJSON` |
| `part.js` | 380-385, 488 (dichiarazione), tutte le occorrenze `this.display && ...` (~32, sparse) | display/DOM |
| `part.js` | 391-420 (`resume`), tutte le occorrenze `this.store && ...` | storage/SCORM |
| `part.js` | 508-548 (`setScript`), 809-880 (`applyScripts`) | esecuzione di JavaScript arbitrario iniettato dalla domanda (`new Function`); incompatibile con un motore strict/sandboxed; feature "custom marking JavaScript" non richiesta dal design (JME `customMarkingAlgorithm` sì, JS `scripts` no) |
| `part.js` | 1191-1213 (`wait_for_pre_submit`), 1885-1946 (`do_pre_submit_tasks`), riferimenti a `TPromise`/`waiting_for_pre_submit` in `submit`/`markAdaptive`/`markAlternatives`/`mark_answer` | meccanismo di attesa asincrona per `custom_part_type`/estensioni; nessun tipo in ambito lo attiva (§6.9) |
| `part.js` | 1233-1246 (blocco `partsMode=='explore'` dentro `submit`), 2148-2231 (`availableNextParts`/`makeNextPart`/`removeNextPart`), 2264-2400 (classe `NextPart`), campo JSON `nextParts` | modalità "explore" (catena di parti sbloccate dinamicamente) — non nell'elenco tipi/API del design doc |
| `part.js` | 421-432 (`addStep`), porzione "steps" di 914-933 (`availableMarks`) e 941-973 (`calculateScore`), 2087-2134 (`showSteps/openSteps/hideSteps`), porzione "steps" di 2238-2250 (`revealAnswer`), campo JSON `steps` | feature "step" (aiuto sbloccabile con penalità) — non presente nella shape pubblica `Part`/`MarkingResult` del design doc |
| `part.js` | tutte le chiamate `Numbas.schedule`/`this.signals`/`this.events` (righe 161-162 e trigger sparsi in ogni metodo) | pub/sub per `display`/plugin, non necessario per un `submit()` sincrono che ritorna direttamente il risultato |
| `parts/{numberentry,patternmatch,gapfill,jme}.js` | `loadFromXML` (rispettivamente 35-52, 33-44, 45-56, 38-141), `initDisplay`, `resume` | XML, display, storage |
| `parts/multipleresponse.js` | 40-254 (`loadFromXML`), 336-355 (`resume`), 488-490 (`initDisplay`) | XML, storage, display |
| `parts/information.js` | 46-48 (`initDisplay`) | display |
| `runtime/scripts/parts/matrixentry.js`, `custom_part_type.js`, `extension.js` | intero file | tipo `matrix`, tipi di parte custom, estensioni — fuori ambito per decisione di design (decisione 3) |
| `marking_scripts/matrixentry.jme` | intero file | idem |

---

## 8. Test upstream

### 8.1 `tests/parts/part-tests.mjs` — helper (righe 1-187)

| helper | riga | firma | scopo |
|---|---|---|---|
| `createPartFromJSON` | 23 | `(data) -> Part` | wrapper locale su `Numbas.createPartFromJSON(0,data,'p0',null,null)` (senza `question`/`store`) |
| `with_wait` | 27-47 | `(fn) -> async fn` | registra temporaneamente una funzione JME `wait(seconds)->TPromise`, per testare il percorso asincrono di `pre_submit` |
| `scorm_storage` | 49-51 | `() -> SCORMStorage` | fuori ambito |
| `mark_part` | 53-65 | `async (p, answer, scope?) -> finalised_state` | `storeAnswer` + `setStudentAnswer` + `p.mark(scope)`; se `p.waiting_for_pre_submit`, `await` e rimarca; **è `async`/awaited nei test anche se, per i tipi in ambito, il corpo di `mark()` è sempre sincrono** |
| `submit_part` | 67-72 | `(p) -> Promise<void>` | risolve su evento `'post-submit'`, poi chiama `p.submit()` |
| `matrix` | 74-78 | `(cells) -> cells` | annota `.rows`/`.columns` su un array di array (fixture per `matrixentry`, fuori ambito) |
| `contains_note` | 80-87 | `(res, note) -> bool` | cerca in `res.states` un `feedback_item` che combaci con le chiavi di `note` |
| `equal_states` | 93-98 | `(assert,a,b,...) -> void` | **rotta/disattivata**: dopo aver ripulito `a` dal campo `scope`, chiama `assert.ok(true)` e fa `return` **prima** di eseguire il vero `assert.deepEqual` (riga 96-97 sono codice morto) — nessun test upstream sta davvero confrontando gli stati con questo helper (§9) |
| `run_with_part_type` | 100-108 | `async (type, test_fn)` | swap temporaneo di `Numbas.custom_part_types`, fuori ambito |
| `run_part_unit_tests` | 110-155 | `async (assert, p)` | esegue gli `unitTests` embedded nel JSON della parte (formato in 8.3); confronta note/messaggi/warning/validità/credito attesi |
| `question_test` | 157-179 | `(name,data,test_fn,error_fn?,num_assertions?)` | `QUnit.test` che costruisce una `Question` intera (`Numbas.createQuestionFromJSON`), `generateVariables()`, attende `q.signals.on('ready')`, poi esegue `test_fn(assert,q)` |
| `question_unit_test` | 181-187 | `(name,data)` | `question_test` che esegue `run_part_unit_tests` su tutte le parti (`q.allParts()`) |

Tutti i test sono dichiarati `async function(assert)`; il marking stesso (per i tipi in ambito) è sincrono
(§6.9) ma l'harness usa comunque `await` in modo uniforme (anche perché `submit_part`/`question_test` aspettano
eventi `signals`/`events`, non promesse di marking).

### 8.2 Moduli QUnit — nomi, righe, numero di test, tipi coperti

| modulo | righe | test (diretti + `question_test`) | tipi coperti |
|---|---|---|---|
| `Part` | 189-198 | 2 | generico (`numberentry` come fixture) |
| `Custom marking JavaScript` | 199-210 | 1 | generico, `scripts.mark` custom (fuori ambito) |
| `Stateful scope` | 211-217 | 1 | `StatefulScope` puro |
| `Number entry` | 218-355 | 16 | `numberentry` |
| `JME` | 356-638 | 13 | `jme` |
| `Pattern match` | 639-662 | 2 | `patternmatch` |
| `Matrix entry` | 663-705 | 5 | `matrix` (**fuori ambito**) |
| `Choose one from a list` | 706-733 | 4 | `1_n_2` |
| `Choose several from a list` | 734-759 | 4 | `m_n_2` |
| `Match choices with answers` | 760-781 | 3 | `m_n_x` |
| `Gapfill` | 782-1247 | 11 | `gapfill` (+ `numberentry`/`jme` come gap) |
| `Custom marking algorithms` | 1248-1262 | 1 | `customMarkingAlgorithm` JME (in ambito come feature di `Part`) |
| `Pre-submit tasks` | 1263-1343 | 1 | meccanismo pre-submit (fuori ambito per i tipi in ambito) |
| `Question` | 1344-1597 | 10 | integrazione parte/domanda (steps, adaptive marking) |
| `Explore mode` | 1598-1712 | 5 | fuori ambito |
| `Alternative answers` | 1713-1793 | 4 | `alternatives` (ambiguo, vedi §11) |
| `Variables` | 1794-1861 | 1 | variabili di domanda (fuori ambito di questo inventario) |
| `Signals` | 1862-2625 | 5 | eventi (fuori ambito) |
| `Part unit tests` | 2626-2643 | 1 | esegue `unit_test_questions` da `part_unit_tests.mjs` con `question_unit_test` |
| `Exams` | 2644-3999 | 22 | integrazione a livello esame (fuori ambito) |

Totale: 81 `QUnit.test(` diretti + 33 `question_test(` (di cui 1 wrapper interno a `question_unit_test`) + 2
`question_unit_test(` (1 è la definizione) ⇒ **112 blocchi di test effettivi** nel file (la nota del design
doc "101 blocchi" è una stima approssimativa, non ricontrollata riga per riga). `createPartFromJSON(` compare
65 volte, `createQuestionFromJSON(` 5 volte (usato anche indirettamente da ogni chiamata a `question_test`).

### 8.3 `tests/parts/part_unit_tests.mjs` (5 righe)

Esporta `unit_test_exam` (un intero "esame" JSON, un `question_group` con 6 domande: "Choose one from a
list", "Choose several from a list", "Match choices with answers", "Match text pattern", "Mathematical
expression", "Matrix entry part", "Number entry part" — nota: sono 7 domande in realtà, l'ultima è
`matrixentry`, fuori ambito) e `unit_test_questions = unit_test_exam.question_groups[0].questions`. Ogni parte
di ogni domanda porta un campo `unitTests: [{variables, name, answer:{valid,value,empty?}, notes:[{name,
expected:{value,messages,warnings,error,valid,credit}}]}]` — è il formato "unit test embedded nel JSON della
domanda" usato da `run_part_unit_tests`/`question_unit_test` (8.1). Esempio (da `1_n_2`, riga 3):
```json
{"variables": [], "name": "Correct", "answer": {"valid": true, "value": [[true], [false], [false]], "empty": false},
 "notes": [{"name": "mark", "expected": {"value": "nothing", "messages": ["You chose a correct answer."],
 "warnings": [], "error": "", "valid": true, "credit": 1}}]}
```

### 8.4 `tests/marking_scripts.js` (16 righe)

Non è un file di test: `Numbas.queueScript('marking_scripts',['marking'], ...)` che popola
`Numbas.raw_marking_scripts` con il contenuto **letterale** (stringhe con `\n` escaped) dei sei file
`marking_scripts/*.jme`, per l'ambiente di test headless (che carica un bundle, non il filesystem). Nel port
TypeScript i sei `.jme` diventano dati importati direttamente (constanti stringa o file `.jme` con un loader),
come previsto dall'architettura (`packages/engine/src/marking/scripts/*.jme`).

### 8.5 Esempi JSON minimi verbatim (uno per tipo in ambito)

```js
// numberentry — part-tests.mjs:220
{type:'numberentry', marks: 1, minValue: '1', maxValue: '1'}

// 1_n_2 — part-tests.mjs:713
{type:'1_n_2', choices: ['a','b','c'], matrix: [[1],[0],[0]]}

// m_n_2 — part-tests.mjs:748
{type:'m_n_2', choices: ['a','b'], matrix: [[1],[1]]}

// m_n_x — part-tests.mjs:762
{type:'m_n_x', choices: ['a','b'], answers: ['A','B'], matrix: [[1,0],[0,1]]}

// patternmatch — part-tests.mjs:641
{type:'patternmatch', answer: 'hi+', displayAnswer: 'hi'}

// gapfill — part-tests.mjs:784
{type:'gapfill', gaps: [{type: 'jme', answer: 'x+2'}]}

// jme — part-tests.mjs:358
{type:'jme', answer: 'x+2'}

// information — part-tests.mjs:2488 (usata come step, ma è JSON di parte completo)
{type: 'information'}
```

---

## 9. Punti delicati

- **Credito come frazione esatta**: sia `marking.finalise_state` (`marking.js:620-690`) sia
  `Part.creditFraction`/`setCredit`/`addCredit`/`subCredit`/`multCredit` (`part.js:203-215`, 1991-2065) usano
  `math.Fraction`, **mai** float intermedio. Una somma ingenua in float di molte `add_credit` (es. gapfill con
  molti gap, o `multipleresponse` con molte celle) romperebbe i test che si aspettano `credit` esattamente
  uguale a `0.5`/`0.6`/ecc. Il port deve portare (o riusare) una classe `Fraction` esatta prima di toccare il
  marking.
- **`precisionType`/precisione in `numberentry`**: la logica in `numberentry.jme` (righe 39-102) distingue
  notazione scientifica da normale, e usa `max(settings["precision"], countdp/countsigfigs(...))` — cioè la
  precisione **effettiva** usata per arrotondare `minvalue`/`maxvalue` dipende **dalla risposta dello
  studente**, non solo dal setting. Un port che arrotondi `minvalue`/`maxvalue` una volta sola con la
  precisione richiesta (ignorando quella "rilevata" nella risposta) romperà i casi limite (es. "0.100" contro
  richiesta "2 dp": `part-tests.mjs:263-271`).
- **`allowFractions`/`mustBeReduced`**: `settings.allowFractions` viene **forzato a `false`** se
  `precisionType != 'none'` (`numberentry.js:69-71`) — combinazione non ovvia da uno sguardo alle sole
  `settings` JSON.
- **`notationStyles`**: lista di stringhe passata direttamente alle funzioni JME `parsedecimal`/`cleannumber`/
  `parsenumber` (fuori ambito di questi file, appartengono a `math.js`/`util.js`); il port deve portare quelle
  funzioni di parsing con lo stesso comportamento per stile (`plain`,`en`,`si-en`,`si-fr`,`scientific`,...).
- **Multiple response — `minAnswers`/`maxAnswers`/`warningType`**: `maxAnswers=0` significa "illimitato" (non
  zero!) sia nello script (`multipleresponse.jme:9`) sia in `finaliseLoad` (`multipleresponse.js:431-434`, dove
  se `settings.maxAnswers==0` viene sostituito con `numAnswers*numChoices`, salvo `1_n_2` dove è sempre `1`).
  `warningType='prevent'` rende la risposta **non valida** (`fail`), `'warn'`/`'none'` la rendono solo
  `incorrect()` — differenza critica per `answered`/`valid` nel `MarkingResult`.
- **`matrix` field**: due formati di ingresso — stringa JME (`markingMatrixString`, valutata a runtime) o
  array di array/numeri (`markingMatrixArray`, con **trasposizione condizionale** se `!flipped`,
  `multipleresponse.js:300-312` — la trasposizione dipende dal tipo, `1_n_2`/`m_n_2` sono "flipped" quindi
  **non** trasposti). Un porting che tratti `matrix` uniformemente per i tre tipi introdurrebbe un bug di
  trasposizione silenzioso.
- **`shuffleChoices`/`shuffleAnswers` e ordine di `Math.random`**: `finaliseLoad` (`multipleresponse.js:370-
  381`) chiama `math.deal(numChoices)` **prima** di `math.deal(numAnswers)` — se il port genera permutazioni
  con un RNG seminato per tentativo (decisione 5 del design), l'**ordine delle chiamate** deve essere
  identico (choices poi answers) per produrre lo stesso ordine di mescolamento a parità di seed. Lo stesso
  vale per `math.deal` dentro `1_n_2`/`m_n_2` dove `shuffleAnswers = shuffleChoices` originale e
  `shuffleChoices` è forzato `false` (righe 366-369) — attenzione a non invertire la semantica.
- **`gapfill` — `sortAnswers`**: se `true`, richiede che **tutti** i gap abbiano lo stesso `type`
  (`gapfill.js:69-78`, altrimenti disabilitato silenziosamente senza errore); inoltre se `sortAnswers` e
  **uno** dei gap non è valido, l'intera parte fallisce con `question.can not submit` (`gapfill.jme:62-64`) —
  comportamento diverso da `sortAnswers=false`, dove i gap invalidi restano invalidi individualmente ma non
  bloccano il submit degli altri.
- **`gap_adaptive_order` vs `gap_order`**: quando `sortAnswers=false`, l'ordine di marking dei gap è
  `gap_adaptive_order` — calcolato da `GapFillPart.marking_parameters` (`gapfill.js:195-229`) con una visita
  DFS che rileva **cicli** nelle dipendenze di sostituzione adattiva tra gap (errore
  `part.gapfill.cyclic adaptive marking`). Questo non è un semplice `0..n-1`: un gap che dipende (via
  `variableReplacements`) da un altro gap viene marcato **dopo** di esso.
- **`jme` — `checkingType`/`vsetRange`/`checkVariableNames`/`singleLetterVariables`/`allowUnknownFunctions`/
  `implicitFunctionComposition`/`caseSensitive`**: il controllo di correttezza è **numerico stocastico**
  (`vsetRangePoints` valutazioni su valori casuali in `vRange`, tollerando `failureRate` disaccordi) — non un
  confronto simbolico. `checkVariableNames` confronta gli insiemi di variabili **case-sensitive o meno**
  secondo `settings["caseSensitive"]` (nota `scope_case_sensitive`, `jme.jme:87,90`), quindi il port deve
  portare anche `case_sensitive`/`scope_case_sensitive` (funzioni JME builtin, fuori ambito di questi file ma
  necessarie).
- **`jme` — rilevamento "formula"**: se la risposta corretta è nella forma `nome = espressione`
  (`formula_match`, `jme.jme:145-160`), il confronto **non** è letterale ma tramite `resultsequal(lhs, rhs,
  checkingType, checkingAccuracy)` — cioè `x = y` è trattato come un'equazione da verificare, non come
  un'espressione booleana letterale da confrontare. Un naive port che confronti solo `studentExpr` con
  `correctExpr` come stringhe/alberi romperebbe tutti i casi "formula" (test `part-tests.mjs:531-580`).
- **`answerSimplification`**: default lungo e specifico (`jme.js:179`,
  `'basic,unitFactor,unitPower,unitDenominator,zeroFactor,zeroTerm,zeroPower,collectNumbers,zeroBase,
  constantsFirst,sqrtProduct,sqrtDivision,sqrtSquare,otherNumbers'`) applicato **solo** alla risposta
  corretta (per la visualizzazione/reveal), **non** alla risposta dello studente (che viene solo
  `simplify(...,'basic')`, `jme.jme:28-31`) — asimmetria voluta.
- **`showPreview`**: solo UI (mostra un'anteprima renderizzata mentre lo studente digita), nessun effetto sul
  marking — sicuro da ignorare come "settings" ma da portare nello schema JSON se il player lo userà.
  `showFeedbackIcon`: **non** solo UI — se `false`, `Part.setCredit`/`addCredit`/`subCredit`/`multCredit`
  (`part.js:1994,2015,2035,2055`) **non accodano** la voce a `markingFeedback`, e `markingComment` scarta i
  messaggi con `reason` `correct`/`incorrect` (`part.js:2075-2077`) — incide sul contenuto di
  `MarkingResult.feedback`, non solo sulla sua presentazione.
- **Warning vs risposta non valida**: `warn(message)` (accantona un avviso, **non** tocca `valid`/`credit`) è
  diverso da `fail(message)` (`set_credit(0,'invalid',...)` + `end(true)`, **rende `valid=false`**). Il design
  doc distingue `valid` da `credit=0` nel `MarkingResult` — un port che collassi `warn` e `fail` nello stesso
  campo perderebbe questa distinzione (es. `numberentry` con risposta non numerica: `warn`+`fail` insieme,
  §3.1 `validNumber`).
- **`equal_states` è disattivato** (`part-tests.mjs:93-98`, §8.1): nessun test upstream verifica realmente la
  **forma esatta** degli item di `finalised_state.states` con `deepEqual` — solo `credit`/`messages`/
  `warnings`/`valid` sono controllati (via `contains_note`/`markingFeedback`/`join('\n')`). Chi porta i test in
  Vitest deve **riattivare** un confronto reale se vuole garanzie sulla shape di `FeedbackItem[]`, altrimenti
  rischia di divergere silenziosamente dall'originale su quel punto.
- **`start_lift`/`end_lift` non sono in `FeedbackOps`** (§2.5): sono stringhe letterali usate solo
  internamente da `finalise_state`/`apply_feedback`; un port che modellasse `FeedbackOps` come union type TS
  a partire dal solo enum pubblico dimenticherebbe questi due casi del `switch`.

---

## 10. Proposta di suddivisione TypeScript

Target: `packages/engine/src/marking/` e `packages/engine/src/parts/` (vincolo: nessun file > 1000 righe).

| upstream (riga) | target file | note |
|---|---|---|
| `marking.js:21-99` (typedef, `FeedbackOps`, costruttori `feedback`) | `marking/feedback.ts` | tipi `FeedbackItem`/`FeedbackOp` come union discriminata TS |
| `marking.js:101-454` (`state_fn`, `state_functions`, `submit_part`/`mark_part`/`concat_feedback` helper) | `marking/note-functions.ts` | ogni funzione JME diventa una entry in una tabella `Record<string, NoteFunction>` registrata nello scope JME; `apply`/`check_pre_submit`/`apply_marking_script` possono essere omesse o stubbate (nessun tipo in ambito le richiede a runtime salvo `apply`, che resta necessaria) |
| `marking.js:457-499` (`StatefulScope`) | `marking/stateful-scope.ts` | estende la classe `Scope` del modulo `jme/scope.ts` (task 2) |
| `marking.js:501-566` (`compute_note`) | `marking/compute-note.ts` | dipende da `jme/variables` (task 6, `makeVariables`/dipendenze topologiche) |
| `marking.js:568-597` (`MarkingScript`) | `marking/marking-script.ts` | riusa `note_script_constructor`-equivalente da `variables/note-script.ts` (task 6) |
| `marking.js:608-693` (`finalise_state`) | `marking/finalise-state.ts` | funzione pura, facilmente testabile in isolamento; **condivisa** con l'equivalente TS di `apply_feedback` (vedi sotto) tramite un unico "interprete" parametrizzato sugli effetti |
| `marking_scripts/*.jme` (5 file in ambito) | `marking/scripts/*.jme` (dati, importati come stringa) | nessuna traduzione di sintassi: sono programmi JME, li esegue l'interprete portato nel task 2/6/7 |
| `part.js:145-216` (costruttore), `306-354` (`loadFromJSON`), `355-370` (`finaliseLoad`) | `parts/part-base.ts` | classe astratta `PartBase<TAnswer,TSettings>`; niente `xml`/`store`/`signals`/`events` |
| `part.js:444-548` (variable replacements, `setMarkingScript`) esclusi `setScript`/`applyScripts` | `parts/part-base.ts` | |
| `part.js:934-990` (`calculateScore`/`applyScoreLimits`) **senza** la parte "steps" | `parts/part-base.ts` | |
| `part.js:991-1065` (`storeAnswer`/`setDirty`/`getScope`/`makeScope`) **senza** i guardrail display/store | `parts/part-base.ts` | |
| `part.js:1066-1190` (`markAdaptive`), `1415-1652` (`markAlternatives`/`markAgainstScope`/ecf) | `parts/adaptive-marking.ts` | modulo separato: è la parte più complessa e riusabile indipendentemente da display/UI |
| `part.js:1653-1845` (`mark`/`apply_feedback`/typedef) | `parts/mark.ts` | `apply_feedback` reimplementata come "esegui `finalise_state` producendo insieme `{credit, markingFeedback}`" — **unificare** con `marking/finalise-state.ts` invece di duplicare lo switch |
| `part.js:1846-1884` (`marking_parameters`) **senza** `pre_submit_parameters` | `parts/mark.ts` | |
| `part.js:1947-1982` (`mark_answer`) **senza** `do_pre_submit_tasks` | `parts/mark.ts` | sincrono, ritorna direttamente `marking_script_result` |
| `part.js:1983-2086` (`setCredit`/`addCredit`/`subCredit`/`multCredit`/`markingComment`) | `parts/credit.ts` | |
| `parts/numberentry.js` (tranne XML/display/resume) | `parts/number-entry-part.ts` | |
| `parts/patternmatch.js` (tranne XML/display/resume) | `parts/pattern-match-part.ts` | |
| `parts/gapfill.js` (tranne XML/display) | `parts/gapfill-part.ts` | dipende da `parts/part-base.ts` per costruire i gap ricorsivamente |
| `parts/jme.js` (tranne XML/display/resume) | `parts/jme-part.ts` | |
| `parts/multipleresponse.js` (tranne XML/display/resume) | `parts/multiple-response-part.ts` (>500 righe: valutare split `matrix.ts` per `getCorrectAnswer`/layout) | unica classe per `1_n_2`/`m_n_2`/`m_n_x`, come upstream |
| `parts/information.js` (tranne display) | `parts/information-part.ts` | banale |
| `part.js:63-143` (`createPart(FromJSON)`) | `parts/create-part.ts` | `createPartFromJSON(index,data,path,question?) -> Part`; registry `partConstructors: Record<PartType, PartClass>` |

**Firme proposte**:

```ts
// marking/stateful-scope.ts
class StatefulScope extends Scope {
  state: FeedbackItem[];
  states: Record<string, FeedbackItem[]>;
  stateValid: Record<string, boolean>;
  stateErrors: Record<string, Error>;
  evaluate(expr: JMETree, variables?: Record<string, JMEValue>): JMEValue;
}

// marking/marking-script.ts
class MarkingScript {
  constructor(source: string, base?: MarkingScript, scope?: Scope);
  notes: Record<string, ScriptNote>;
  evaluate(scope: Scope, parameters: Record<string, JMEValue>): MarkingScriptResult;
}
interface MarkingScriptResult {
  states: Record<string, FeedbackItem[]>;
  values: Record<string, JMEValue>;
  stateValid: Record<string, boolean>;
  stateErrors: Record<string, Error>;
}

// marking/finalise-state.ts
function finaliseState(states: FeedbackItem[]): { valid: boolean; credit: number; states: FeedbackItem[] };

// parts/part-base.ts
abstract class PartBase<TSettings = unknown> {
  readonly type: PartType;
  readonly path: string;
  marks: number;
  credit: number;      // derivato da creditFraction (Fraction esatta)
  score: number;
  answered: boolean;
  isDirty: boolean;
  settings: TSettings;
  abstract loadFromJSON(data: PartJSON): void;
  abstract getCorrectAnswer(scope: Scope): unknown;
  abstract setStudentAnswer(): void;
  abstract rawStudentAnswerAsJME(): JMEValue | undefined;
  storeAnswer(answer: unknown): void;
  submit(): MarkingResult;               // orchestratore sincrono, sostituisce Part#submit
  mark(scope: Scope): MarkResult;        // sostituisce Part#mark
}

// parts/create-part.ts
function createPartFromJSON(index: number, data: PartJSON, path: string, question?: QuestionRef): Part;
```

**Mappatura `submit(answer): MarkingResult` (spec) ⇄ ciclo di vita upstream**: il metodo pubblico sincrono
`submit(answer)` del design doc corrisponde a `storeAnswer(answer)` + `setStudentAnswer()` + `Part#submit()`
(righe 992-1355) **collassati in una sola chiamata idempotente** — upstream li separa per supportare lo
staging della risposta prima del click "invia" (UI), non necessario in un'API programmatica. Il risultato
`{score, marks, credit, correct, valid, feedback}` si ottiene da: `credit`/`marks`/`score` da
`Part.credit`/`marks`/`score` dopo `calculateScore()`; `valid` da `finalised_result.valid` (== `answered`
dopo `apply_feedback`, riga 1797); `correct` **non esiste esplicitamente upstream** — va derivato come
`credit >= 1` (o da `reason==='correct'` sull'ultimo `set_credit`, meno robusto); `feedback` da
`markingFeedback` mappato da `{op,message,reason,format,credit,credit_message,...}` upstream ai quattro tipi
`correct|incorrect|warning|info` del design doc (mapping: `op==='feedback'` + `reason==='correct'` →
`correct`; `reason==='incorrect'` → `incorrect`; item da `giveWarning` (`op` originale `warning`, già
confluito in `this.warnings`, non in `markingFeedback`) → `warning`; tutto il resto → `info`).

---

## 11. Domande aperte

1. **`alternatives`** (`part.js:439-443,1415-1544`, JSON field `alternatives`, modulo test "Alternative
   answers" righe 1713-1793): il design doc non lo menziona né nei tipi in ambito né nella shape `Part`
   dell'API pubblica. Va portato nella prima versione (aggiunge un ramo non banale a `markAgainstScope`) o
   rimandato come `matrix`/`extension`/custom part types? Se rimandato, va escluso anche dallo schema JSON
   accettato da `loadFromJSON`, o solo ignorato silenziosamente?
2. **`steps`** (bocciato in §7 come "fuori ambito UI") — ma il campo JSON `steps` e la penalità
   `stepsPenalty` **incidono sul punteggio finale** (`calculateScore`), non sono solo UI. Se il player
   (sotto-progetto 3) vorrà supportare gli step in futuro, conviene portare almeno il calcolo del punteggio
   (senza UI di reveal) già in questo modulo, per evitare una migrazione di schema JSON più tardi?
3. **`useAlternativeFeedback`/`alternativeFeedbackMessage`** dipendono da `alternatives` (domanda 1) — stessa
   sorte.
4. **`equal_states` disattivato nei test upstream** (§9): quando i test upstream verranno tradotti in Vitest
   (task 7/8 del piano), si vuole **riattivare** un confronto reale sulla shape di `FeedbackItem[]` (rischio:
   scoprire divergenze non documentate rispetto all'originale) o mantenere la stessa copertura "debole"
   dell'originale (solo credito/messaggi/validità)?
5. **`showFeedbackIcon=false`** sopprime intere voci di `markingFeedback` (§9) — il design doc non specifica
   se `MarkingResult.feedback` debba comunque contenere quelle voci (per un consumatore che voglia comunque
   costruire la propria UI) o rispecchiare esattamente l'omissione upstream. Da chiarire con chi consuma
   l'API nel sotto-progetto 3.
6. **`apply_marking_script`** (`marking.js:368-404`, ricorsione tra script per nome) non è usata da nessuno
   dei sei script in ambito né dai test — esiste per marking custom via plugin. Da non implementare nella
   prima versione, ma da tenere a mente se in futuro si vorrà supportare `customMarkingAlgorithm` che invoca
   script "fratelli".
7. **Numerazione dei "marks" del gapfill quando `marks` è dichiarato esplicitamente nel JSON**: upstream
   ignora sempre il campo (lo ricalcola sommando i gap, `gapfill.js:110,87-99`); va documentato esplicitamente
   nello schema TS che `marks` non è un campo utile per `gapfill` (per evitare che l'editor, sotto-progetto 5,
   lo scriva inutilmente).
