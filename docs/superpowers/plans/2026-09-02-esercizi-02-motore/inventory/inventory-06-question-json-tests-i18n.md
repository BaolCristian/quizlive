# Inventario di porting — question.js, formato JSON, localizzazione, test (Numbas runtime)

Sorgente: clone upstream `numbas/Numbas`, commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5`
(26 ago 2026). File letti per intero: `runtime/scripts/question.js` (1467 righe),
`runtime/scripts/json.js` (52 righe), `runtime/scripts/localisation.js` (77 righe),
`runtime/scripts/schedule.js` (406 righe), `locales/en-GB.json` (541 chiavi),
`locales/it-IT.json` (554 chiavi), più `runtime/scripts/part.js`,
`runtime/scripts/storage.js`, `runtime/scripts/jme-variables.js` e `Makefile`
per capire la parte JSON/i18n/test coinvolte da question.js. Tutti i numeri di
riga sono verificati con lettura diretta o `grep -n` sul commit indicato.

## 1. question.js — mappa

`Numbas.queueScript('question', ['base','schedule','jme','jme-variables','util','part','standard_parts'], ...)`
(riga 15) racchiude l'intero file in una IIFE registrata come modulo. Legenda:
JSON = solo percorso caricamento da JSON: XML = solo percorso XML/compilatore
Python; display = coinvolge `Numbas.display`/DOM; storage = coinvolge
`Numbas.storage`/SCORM; explore-steps = solo modalità `partsMode:'explore'`
(o steps/gap); both = usato da entrambi i percorsi di caricamento.

| riga inizio | riga fine | cosa contiene | categoria |
|---|---|---|---|
| 1 | 14 | licenza Apache + `queueScript('standard_parts', ...)` | both |
| 15 | 16 | apertura modulo `question`, `var jme = Numbas.jme` | both |
| 17 | 38 | `Numbas.createQuestionFromXML(xml, number, exam, group, scope, store, loading)` | XML path |
| 39 | 60 | `Numbas.createQuestionFromJSON(data, number, exam, group, scope, store, loading)` | **JSON path** |
| 61 | 105 | costruttore `Question` (signals, events, scope, preamble, variablesTest, parts, objectives, penalties, extensions) | both |
| 106 | 187 | JSDoc dei soli eventi (`@event`), nessun codice | both (doc) |
| 188 | 239 | default di prototipo: `partsMode`, `maxMarks`, `objectiveVisibility`, `penaltyVisibility`, `showAllParts`, `currentPart`, `signals`, `store` | both (showAllParts/currentPart usati solo da explore) |
| 241 | 260 | `error(message, args, originalError)` — throw con `R.apply` e numero domanda | both |
| 262 | 424 | `loadFromXML(xml)` (incl. creazione parti su `variablesGenerated`+`rulesetsMade`, righe 404-423) | XML path |
| 426 | 458 | `addExtraPart(def_index, scope, variables, previousPart, index)` — dispatcher explore mode verso XML o JSON (riga 445-449) | explore-steps |
| 460 | 472 | `createExtraPartFromXML` | XML path (explore-steps) |
| 474 | 483 | `setCurrentPart(part)` (riga 481 chiama `this.display.currentPart`) | display + explore-steps |
| 485 | 645 | `loadFromJSON(data)` | **JSON path** (vedi §3) |
| 647 | 656 | `useExtension(extension)` | both |
| 658 | 671 | `addExtensionScopes()` | both |
| 673 | 687 | `createExtraPartFromJSON(json_index, scope, ...)` | **JSON path** (explore-steps) |
| 689 | 699 | `setErrorCarriedForwardBackReferences()` | both |
| 701 | 710 | `allParts()` — parti top-level + gaps + steps | both |
| 712 | 723 | `addPart(part, index)` (riga 720: `this.display && this.display.addPart`) | both (hook display) |
| 725 | 744 | `removePart(part)` (riga 734 display, righe 736-742 solo explore) | both (display + explore-steps) |
| 746 | 771 | JSDoc di `finaliseLoad` | both |
| 772 | 918 | `finaliseLoad(loading)` — cablaggio dei signal (vedi §3); righe 890-892/901-903/915-917 toccano `Numbas.display` | **both** (nucleo del ciclo di vita) |
| 920 | 926 | `getScope()` | both |
| 928 | 934 | `generateVariables()` — trigger esterno che avvia la generazione | both |
| 935 | 1070 | `resume()` — carica `question_suspend_data`/`part_suspend_data` da `Numbas.storage` | **storage** |
| 1071 | 1168 | default di campo: `xml`, `number`, `name`, `statement`, `advice`, `scope`, `marks`, `score`, `visited`, `answered`, `submitted`, `adviceDisplayed`, `locked`, `revealed`, `parts`, `partDictionary`, `extraPartOrder`, `display`, `callbacks` | both |
| 1169 | 1177 | `leave()` | display |
| 1178 | 1201 | `runPreamble()` — esegue `preamble.js` via `new Function(['question'], js)` | both (**punto delicato**, vedi §8) |
| 1202 | 1213 | `getPart(path)` | both |
| 1215 | 1224 | `getObjective(name)` | explore-steps |
| 1226 | 1235 | `getPenalty(name)` | explore-steps |
| 1237 | 1252 | `getAdvice(dontStore)` (righe 1248-1249 storage) | both (storage hook) |
| 1254 | 1265 | `lock()` (riga 1263 display) | both (display hook) |
| 1266 | 1290 | `revealAnswer(dontStore)` (righe 1280-1284 display, 1285-1287 storage) | both |
| 1291 | 1316 | `validate()` — ramo `'explore'` righe 1303-1315 | both (explore-steps branch) |
| 1317 | 1331 | `isDirty()` | both |
| 1332 | 1345 | `leavingDirtyQuestion()` (usa `this.exam.display`) | display |
| 1346 | 1408 | `calculateScore()` — ramo `'explore'` righe 1363-1401 (objectives/penalties/nextParts) | both (explore-steps branch) |
| 1409 | 1431 | `submit()` (riga 1429 storage) | both (storage hook) |
| 1432 | 1447 | `updateScore()` (riga 1443 display, riga 1445 storage) | both |
| 1448 | 1465 | `onHTMLAttached`/`onVariablesGenerated` (deprecati, wrapper su `signals.on`) | display |
| 1466 | 1467 | chiusura oggetto prototype + `queueScript` | both |

**Cosa NON è in question.js ma è citato**: la creazione delle singole parti è
delegata a `Numbas.createPartFromJSON` (`part.js:99`, altro modulo/altro
inventario); la generazione dei valori delle variabili è delegata a
`Numbas.jme.variables.makeVariablesPromise`/`makeVariables`
(`jme-variables.js:410`/`343`, anch'esso altro modulo).

## 2. Formato JSON di domanda

`Question.loadFromJSON(data)` (question.js:495-645) usa due helper da
`Numbas.json` (§4): `tryLoad(source, attrs, target)` copia attributi con
coercizione di tipo, `tryGet(source, attr)` legge un singolo campo (provando
anche la versione minuscola del nome). Tabella di **tutti** i campi letti
(direttamente o nei blocchi di `finaliseLoad` che li consumano):

| campo | tipo | default | riga (lettura → consumo) | significato | in ambito? |
|---|---|---|---|---|---|
| `name` | string | `''` (proto riga 1085) | 500 | nome della domanda; a `variablesGenerated` (888) le `{variabili}` nel nome sono sostituite via `jme.contentsubvars` | SI |
| `customName` | string | non impostato nel path JSON | 500 | nome alternativo; **nel path JSON `hasCustomName` non viene mai calcolato** (a differenza del path XML, righe 280-283) | SI (minore) |
| `partsMode` | `'all'\|'explore'` | `'all'` (197) | 500 | modalità di generazione delle parti | SI |
| `maxMarks` | number | `0` (203) | 500; usato 781-787 | punteggio massimo esplicito in modalità explore; se 0 viene sommato da `objectives[].limit` | SI (solo explore) |
| `objectiveVisibility` | `'always'\|'when-active'` | `'always'` (209) | 500 | metadato di visualizzazione degli obiettivi | SI (solo display/explore) |
| `penaltyVisibility` | `'always'\|'when-active'` | `'always'` (215) | 500 | idem per le penalità | SI (solo display/explore) |
| `showAllParts` | boolean | `false` (221) | 500 | mostra tutte le parti insieme in explore mode | SI (solo explore) |
| `statement` | string (HTML) | `''` (1090) | 500 | testo introduttivo | SI |
| `advice` | string (HTML) | `''` (1095) | 500 | testo di aiuto mostrato dopo l'invio | SI |
| `tags` | `string[]` | `[]` (ctor riga 80) | 503-506 | etichette libere, non lette altrove nel motore | SI (passivo) |
| `extensions` | `string[]` | `[]` (ctor riga 104) | 508-513 → consumate da `useExtension`/`addExtensionScopes` (647-671) | nomi di estensioni JS richieste | **NO** (rinviato — consigliato throw esplicito, §8) |
| `builtin_constants` | `Record<string,boolean>` | `{}` | 555-560 → consumate 789-796 | abilita/disabilita `e,pi,i,infinity/infty,NaN,j` (`jme-builtins.js:49-56`) | SI |
| `constants` | `Array<{name,value,tex,enabled?}>` | `[]` | 561 → consumate 797 | costanti personalizzate; `value` è un'espressione JME stringa oppure già un token (`jme-variables.js:585-604`) | SI |
| `functions` | `Record<name,{definition,language,type,parameters:[name,type][]}>` | `{}` | 564-582 → consumate 800-804 | funzioni JME (`language:'jme'`) o JavaScript (`language:'javascript'`) personalizzate | SI (JS: **punto delicato**, §8) |
| `rulesets` | `Record<name,string[]>` | `{}` | 583-589 → consumate 805-808 | set di regole di semplificazione (nomi builtin/custom, prefisso `!` per esclusione) | SI (dipende da `jme-rules.js`, altro modulo) |
| `objectives` | `Array<{name,limit,mode?}>` | `[]` | 591-603 | obiettivi in modalità explore; **`mode` non è mai letto da `loadFromJSON`** | SI (solo explore; `mode` ignorato) |
| `penalties` | `Array<{name,limit,mode?}>` | `[]` | 604-616 | penalità in modalità explore; **`mode` idem ignorato** | SI (solo explore; `mode` ignorato) |
| `variables` | `Record<key,{name,definition,group?,description?,templateType?}>` | `{}` | 618-622 → consumate 809-843 | definizioni delle variabili; **la chiave esterna dell'oggetto non è mai letta**, solo `Object.values(variables)` (621) — vince sempre `.name` interno | SI (`group`/`description`/`templateType` sono solo editor, non letti dal loader) |
| `variablesTest` | `{condition:string,maxRuns:number}` | `{condition:'',maxRuns:10}` (ctor 95-98) | 623-626 → consumato 844-867 | condizione JME che le variabili generate devono soddisfare, con tentativi massimi | SI |
| `parts` | `Array<part JSON>` | assente ⇒ nessuna parte | letto a 629, dentro l'handler registrato 628-644 | definizioni delle parti (delegate a `Numbas.createPartFromJSON`, `part.js:99`) | SI |
| `metadata` | `{description,licence,...}` | — | **mai letto** da `loadFromJSON` | metadati editor (descrizione, licenza) | NO (editor-only) |
| `ungrouped_variables` | `string[]` | — | **mai letto** | raggruppamento UI delle variabili nell'editor | NO (editor-only) |
| `variable_groups` | array | — | **mai letto** | idem, raggruppamento UI | NO (editor-only) |
| `preamble` | `{js:string,css:string}` | `{js:'',css:''}` (ctor 87-90) | 543-548 → eseguito da `runPreamble` (1183-1201) | JS eseguito prima della generazione variabili | SI (`js`: **punto delicato**, §8; `css`: NO, fuori ambito no-DOM) |

Nota su `functions[name].parameters`: nel JSON è un array di coppie
`[nome, tipo]` (es. `[['time','number']]`), tradotto a riga 573-578 in
`{name, type}`. Nota su `objectives`/`penalties`: `tryLoad(od, ['name','limit'], objective)`
(righe 600, 613) legge solo quei due campi; l'oggetto risultante include anche
`score:0` e `answered:false`/`applied:false` inizializzati dal motore.

### Formato della definizione di variabile

Ogni voce di `variables` è un oggetto con (almeno) `name` e `definition`
(stringa JME). Verificato su `jme-variables.js` typedef (righe 24-29) e sul
loop di `finaliseLoad` (809-843): il motore normalizza il nome
(`jme.normaliseName`), lo separa se è una destrutturazione `"a,b"`
(`jme.variables.splitVariableNames`, riga 328-331 di `jme-variables.js`),
compila `definition` con `Numbas.jme.compile` e ne trova le dipendenze con
`jme.findvars`. I campi `group`, `description`, `templateType` (visti negli
export dell'editor) **non sono letti dal runtime**: servono solo all'editor
per raggruppare/documentare le variabili nella UI.

### Esempio minimo (verbatim da `tests/parts/part-tests.mjs:1345-1362`)

```js
question_test(
    'Question',
    {
        name:'Barg',
        parts: [
            {type:'jme',answer:'x+2', marks: 1}
        ]
    },
    async function(assert,q) {
        var p = q.getPart('p0');
        assert.ok(p,'Part created');
        p.storeAnswer('x+2');
        q.submit();

        assert.equal(q.name,'Barg');
        assert.equal(q.score,1,'Score is 1');
    }
);
```

### Esempio con variabili e parte `jme` (verbatim da `tests/parts/part-tests.mjs:1393-1413`)

```js
question_test(
    'e defined as a variable is not used in mathematical expression part answers',
    {
        variables: {
                'e': {
                    name: 'e',
                    definition: '3'
                }
        },
        parts: [
            {
                type: 'jme',
                answer: 'e^2+a',
                answerSimplification: 'basic',
            }
        ]
    },
    async function(assert, q) {
        const p = q.getPart('p0');
        var res = await mark_part(p,['e^2+a']);
        assert.equal(res.credit,1,'"e^2+a" correct');
    }
);
```

### Esempio "reale" (export editor completo, verbatim da `tests/parts/part-tests.mjs:696`)

Mostra tutti i campi a livello domanda quando la sorgente è un vero export
JSON (chiavi tra virgolette, non un object literal JS):

```json
{"name":"wrong size matrix","tags":[],"metadata":{"description":"","licence":"Creative Commons Attribution 4.0 International"},"statement":"","advice":"","rulesets":{},"extensions":[],"variables":{"rows":{"name":"rows","group":"Ungrouped variables","definition":"4","description":"","templateType":"anything"}},"variablesTest":{"condition":"","maxRuns":100},"ungrouped_variables":["rows"],"variable_groups":[],"functions":{},"preamble":{"js":"","css":""},"parts":[{"type":"gapfill","marks":0,"showCorrectAnswer":true,"showFeedbackIcon":true,"scripts":{},"variableReplacements":[],"variableReplacementStrategy":"originalfirst","customMarkingAlgorithm":"","extendBaseMarkingAlgorithm":true,"unitTests":[],"prompt":"\n<p>[[0]]</p>","gaps":[{"type":"matrix","marks":"4","showCorrectAnswer":true,"showFeedbackIcon":true,"scripts":{},"variableReplacements":[],"variableReplacementStrategy":"originalfirst","customMarkingAlgorithm":"","extendBaseMarkingAlgorithm":true,"unitTests":[],"correctAnswer":"matrix([1,0,3,3,1],[0,1,4,4,2],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0])","correctAnswerFractions":true,"numRows":"6","numColumns":"5","allowResize":true,"tolerance":0,"markPerCell":false,"allowFractions":true}],"sortAnswers":false}]}
```

E l'export con `partsMode:"explore"`/`objectives`/`penalties` popolati
(verbatim, `tests/parts/part-tests.mjs:1686`, solo i campi a livello
domanda finali):

```json
"partsMode":"explore","maxMarks":"0","objectives":[{"name":"Main objective","limit":1,"mode":"sum"},{"name":"Second objective","limit":"2","mode":"sum"}],"penalties":[{"name":"Penalty","limit":"1","mode":"sum"}],"objectiveVisibility":"always","penaltyVisibility":"always"
```

(nota il campo `mode:"sum"` presente nell'export ma mai letto da
`loadFromJSON` — probabile funzionalità futura o usata solo dall'editor.)

Formato `functions` non vuoto (verbatim, `tests/parts/part-tests.mjs:1274-1289`):

```js
functions: {
    'wait': {
        parameters: [['time', 'number']],
        type: 'promise',
        language: 'javascript',
        definition: `
var promise = new Promise(function(resolve, reject) {
  setTimeout(function() {
    resolve({
      seconds_waited: new Numbas.jme.types.TNum(time)
    })
  }, time*50);
});
return new Numbas.jme.types.TPromise(promise);
                            `
    }
}
```

Questo esempio è la prova che il formato supporta funzioni JavaScript
**asincrone** (`type:'promise'` → `Numbas.jme.types.TPromise`) — vedi §8.

## 3. Ciclo di vita della domanda (percorso JSON)

Passi con righe esatte. Tutta l'orchestrazione passa per
`Numbas.schedule.SignalBox` (`schedule.js:162-296`): `signals.trigger(name)`
risolve una Promise associata al nome dell'evento; `signals.on(nomeOEventi, fn)`
fa un `Promise.all` sulle Promise degli eventi richiesti e poi esegue `fn`.
Non c'è coda "a passi": è un grafo di dipendenze dichiarato con `.on(...)` in
`finaliseLoad`, risolto dal motore delle Promise nativo.

1. **`Numbas.createQuestionFromJSON(data, number, exam, group, scope, store, loading)`**
   (question.js:51-60) crea `new Question(...)` (61-105), chiama
   `q.loadFromJSON(data)` (495-645), poi `q.finaliseLoad(loading)` (772-918).
   Errori sono incapsulati in `Numbas.Error('question.error creating question', ...)`.
2. **`loadFromJSON`** (sincrono) legge tutti i campi (§2) e **registra** (non
   esegue) gli handler dei signal via `q.signals.trigger(...)` per gli eventi
   già disponibili subito (`preambleLoaded` 549, `constantsLoaded` 562,
   `functionsLoaded` 582, `rulesetsLoaded` 589, `variableDefinitionsLoaded` 627)
   e un handler `on(['variablesGenerated','rulesetsMade'], ...)` (628-644) che
   più tardi creerà le `Part` via `Numbas.createPartFromJSON` e triggererà
   `partsGenerated` (643).
3. **`finaliseLoad`** (sincrono nella registrazione, asincrono nell'esecuzione)
   cablaggia in ordine di dipendenza:
   - `on('preambleLoaded')` (779-788) → `q.runPreamble()` (1183-1201): esegue
     `preamble.js` con `new Function(['question'], js)`; il risultato è
     avvolto in `Promise.resolve(res).then(() => trigger('preambleRun'))`
     — **primo punto asincrono**, anche se `preamble.js` è codice sincrono
     (una `Promise.resolve().then` è comunque un giro di microtask).
   - `on(['preambleRun','constantsLoaded'])` (789-799) → `makeConstants`
     builtin poi custom → `trigger('constantsMade')`.
   - `on(['preambleRun','functionsLoaded'])` (800-804) → `makeFunctions` →
     nuovo `Scope` con le funzioni → `trigger('functionsMade')`.
   - `on(['preambleRun','rulesetsLoaded'])` (805-808) → `makeRulesets` →
     `trigger('rulesetsMade')`.
   - `on(['variableDefinitionsLoaded','functionsMade','rulesetsMade','constantsMade'])`
     (809-843) → per ogni definizione: `normaliseName`, `splitVariableNames`
     (destrutturazione), controllo duplicati (817), `Numbas.jme.compile`
     (**sincrono**, jme.js:2451-2465 — su stringa vuota ritorna `null`),
     `findvars` per le dipendenze → popola `q.variablesTodo[name] = {tree, vars}`
     → `trigger('variablesTodoMade')`.
   - `on(['generateVariables','functionsMade','rulesetsMade','constantsMade','variablesTodoMade'])`
     (844-867, funzione **`async`**) → ciclo `while(runs<maxRuns && !conditionSatisfied)`:
     ad ogni iterazione crea un nuovo `Scope`, imposta la variabile
     `variable_generation_run_number`, e fa
     `await jme.variables.makeVariablesPromise(q.variablesTodo, scope, condition)`
     (`jme-variables.js:410-469`). **Qui viene consumato `Math.random`**
     (tramite le funzioni JME `random`/`weighted_random`/`deal`/... valutate
     dentro `computeVariablePromise`, `jme-variables.js:256-321`, che valuta
     l'albero di ogni variabile in ordine di dipendenza — vedi §8 per l'ordine
     esatto). Se `maxRuns` viene esaurito senza soddisfare `condition`:
     `q.error('jme.variables.question took too many runs to generate variables')`.
     Altrimenti `q.scope = scope` → `trigger('variablesSet')`.
   - `on('variablesSet')` (868-886) → `q.scope = new Scope([q.scope]); q.scope.flatten()`;
     costruisce `q.local_definitions = {variables, functions, rulesets}` (nomi,
     usati da `storage.js` per il suspend data); `q.unwrappedVariables[name] =
     Numbas.jme.unwrapValue(v)` per ogni variabile → `trigger('variablesGenerated')`.
   - `on('variablesGenerated')` (887-889) → `q.name = jme.contentsubvars(q.name, q.scope)`.
   - `on('partsGenerated')` (893-899) → assegna i nomi/numeri alle parti
     (`p.assignName(i, ...)`, altro modulo).
   - `on(['variablesGenerated','partsGenerated'])` (900-903, display; 904-906)
     → `trigger('finalisedLoad')`.
   - se `!loading`: `on('finalisedLoad')` (907-911) → `trigger('ready')`.
     Se `loading` (ripresa da stato salvato), `'ready'` è triggerato più
     tardi da `resume()` (riga 1046-1048).
   - `on('ready')` (912-914) → `q.updateScore()`.
4. **Trigger esterno**: il chiamante deve invocare esplicitamente
   `q.generateVariables()` (928-934, fa solo `signals.trigger('generateVariables')`)
   — è questo che sblocca il passo "generateVariables" sopra. Nei test:
   `part-tests.mjs:163` fa `q.generateVariables(); await q.signals.on('ready')`.
5. **`regenerate`**: **non esiste un metodo `regenerate` in question.js**
   (verificato con grep — zero occorrenze). Il pattern upstream per
   rigenerare una domanda è ricreare l'oggetto da zero (`createQuestionFromJSON`
   di nuovo sullo stesso `data`), dato che `Math.random` non è seminato per
   domanda: ogni chiamata a `generateVariables()` consumerebbe casualità
   "fresca" dal generatore globale. **Questo è un punto dove il port
   diverge deliberatamente** (decisione 5 della spec: seed esplicito per
   `Question.regenerate(seed)`), non c'è un equivalente upstream diretto da
   copiare — va progettato ex novo (riusando comunque l'algoritmo di step 3).
6. **`revealAnswer(dontStore)`** (1266-1290): `lock()` (blocca tutte le parti),
   `revealed=true`, `getAdvice(dontStore)`, poi `part.revealAnswer(dontStore)`
   per ogni parte (delegato a `part.js`), infine notifica storage
   (`store.answerRevealed`, 1285-1287) e trigger `'revealed'`.
7. **`score`/`marks`**: `calculateScore()` (1350-1408) somma `part.score`/
   `part.marks` di tutte le parti top-level in modalità `'all'`; in modalità
   `'explore'` (1363-1401) somma per obiettivo (`o.score += part.score`,
   limitato a `o.limit`) e sottrae le penalità (limitate a `p.limit`), poi
   clampa il totale tra 0 e `maxMarks`. `q.answered = q.validate()` (1406).
   `updateScore()` (1437-1447) chiama `calculateScore`, poi propaga a
   `exam.updateScore()`, `display.showScore()`, `store.saveQuestion(this)`.
8. **`resume`/serializzazione stato** (935-1070, **storage**): `q.resume()`
   registra `on(['constantsMade'])` (949-1069) che: (a) chiama
   `q.store.loadQuestion(q)` per ottenere `qobj` (forma in `storage.js:24-34`,
   tipo `question_suspend_data`); (b) per ogni `[k,v]` di `qobj.variables`
   fa `q.scope.setVariable(k,v)` — **inietta i valori delle variabili non
   deterministiche salvate PRIMA di rigenerare**, così `generateVariables()`
   (chiamato subito dopo, riga 954) le trova già presenti in scope e non le
   ricalcola (i controlli di `computeVariable`/`computeVariablePromise`
   fanno `if(existing_value!==undefined) return existing_value`); (c) dopo
   `variablesSet`+`partsGenerated`, ripristina `interactive_state` per i
   token che lo supportano (`tok.resume_interactive_state(state)`, riga 961)
   e chiama `part.resume()` per ogni parte (963-965, delegato a `part.js:391`);
   (d) per `partsMode:'explore'` ricostruisce le parti extra via
   `previousPart.makeNextPart(...)` (967-982); (e) **ri-sottomette** ogni
   parte già risposta (`submit_part`, 1004-1033) rispettando l'ordine delle
   sostituzioni di variabile adattive (`errorCarriedForwardReplacements`),
   attende tutte le Promise (`Promise.all(promises_to_wait_for)`, 1041) poi
   triggera `'partsResumed'`; (f) infine ripristina i flag di livello domanda
   (`adviceDisplayed, answered, revealed, submitted, visited, score`, 1050-1056),
   eventualmente richiama `revealAnswer(true)`/`getAdvice(true)`, e triggera
   `'ready'`.
   **Campi che compongono lo stato di una domanda** (da `storage.js:405-461`,
   `questionSuspendData`): `name`, `number_in_group`, `group`, `visited`,
   `answered`, `submitted`, `adviceDisplayed`, `revealed`, `score`, `max_score`,
   `currentPart` (solo explore), `variables` (dict nome→JME-stringa, **solo
   le variabili la cui definizione NON è deterministica** — `storage.js:445`:
   `if(!question.variablesTodo[names] || Numbas.jme.isDeterministic(tree,scope)) return;`
   — le variabili deterministiche NON vengono salvate, si ricalcolano da sole),
   `interactive_state` (dict nome→stato per token con `get_interactive_state()`),
   `parts` (array di `part_suspend_data`, da `storage.js:463-530`: `answered`,
   `stepsShown`, `stepsOpen`, `name`, `index`, `previousPart`, `pre_submit_cache`,
   `alternatives`, `score`, `max_score`, `student_answer`, `correct_answer`,
   `steps[]`, più campi specifici del tipo da `typeStorage.suspend_data(part,this)`).

## 4. json.js

52 righe, `Numbas.queueScript('json', ['base'], ...)` (riga 2), namespace
`Numbas.json` (riga 4-51):

- `tryLoad(source, attrs, target, altnames)` (righe 13-36): per ogni nome in
  `attrs` (stringa singola o array), legge `json.tryGet(source, attr)` e, se
  il valore non è `undefined`, lo scrive in `target[target_attr]` **coercendo
  il tipo** in base al tipo già presente in `target`: se `target[attr]` è
  `string`, fa `value += ''`; se è `number`, fa `parseFloat(value)` (righe
  27-32). Supporta nomi alternativi (`altnames`) per rinominare in scrittura.
- `tryGet(source, attr)` (righe 43-50): ritorna `source[attr]` se presente,
  altrimenti `source[attr.toLowerCase()]`, altrimenti `undefined`. Questa è
  la ragione per cui i campi JSON possono avere maiuscole/minuscole miste
  nell'export e funzionare comunque (case-insensitive **solo tramite
  fallback su tutto minuscolo**, non case-insensitive generico).

Nessun'altra logica: non fa validazione di schema, non lancia eccezioni,
ritorna semplicemente `undefined` se il campo manca.

## 5. localisation.js e cataloghi

`runtime/scripts/localisation.js` (77 righe) inizializza **i18next**:
`R = function() { return i18next.t.apply(i18next, arguments) }` (righe 2-4).
`Numbas.locale.init()` (58-76) chiama `i18next.init({ lng, lowerCaseLng:true,
keySeparator:false, nsSeparator:false, interpolation:{unescapePrefix:'-',
format:(value,format)=>format=='niceNumber'?Numbas.math.niceNumber(value):undefined},
resources: Numbas.locale.resources })`. `keySeparator:false`/`nsSeparator:false`
significa che le chiavi **non** sono namespace/percorsi annidati (nonostante
i punti nei nomi tipo `jme.variables.empty name`): sono chiavi piatte,
verificato — `locales/en-GB.json` è un oggetto JSON piatto di 541 coppie
chiave→stringa (non nidificato), stesso per `it-IT.json` (554 coppie).

**Sintassi di interpolazione usata nei cataloghi** (stile i18next, non `%s`):
- `{{nome}}` — interpolazione con escape HTML di default.
- `{{-nome}}` — interpolazione **senza** escape (usata per messaggi che sono
  già HTML sicuro, es. `{{-message}}` per incapsulare un altro messaggio
  d'errore già tradotto).
- `{{count,niceNumber}}` — applica il formatter custom `niceNumber` (righe
  66-70 di localisation.js, chiama `Numbas.math.niceNumber`).
- `$t(chiave)` — riferimento incrociato a un'altra chiave del catalogo (es.
  `$t(mark)`, `$t(was)` in `feedback.you were awarded`).
- Pluralizzazione i18next standard via suffisso `_plural` (es. `mark`/`mark_plural`
  = "mark"/"marks", `was`/`was_plural` = "was"/"were"; **in `it-IT.json`
  questi restano in inglese**, vedi sotto — porzione non tradotta).

### Come sono state estratte le chiavi (comando esatto)

I moduli in ambito passano le chiavi a `R()` in tre modi equivalenti (tutti
finiscono in `i18next.t`): chiamata diretta `R('chiave', args)`; costruzione
di un errore `new Numbas.Error('chiave', args)` (che internamente fa
`R.apply(e, [message, args])`, `numbas.js:78-89`); il metodo `.error('chiave', args)`
di `Question`/`Part` (question.js:253, part.js:786) che fa la stessa cosa
prima di rilanciare. **Solo 34 delle 174 chiavi trovate vengono passate con
una `R(...)` letterale**; le altre 140 arrivano esclusivamente da
`Numbas.Error(...)`/`.error(...)` — un porting che cercasse solo `R\(` con
grep ne perderebbe l'80%. Estrazione fatta con uno script Python (regex
`(?:R\(|Numbas\.Error\(|\.error\()\s*(['"])(...)\1`) sui 15 file in ambito,
poi lookup diretto in `en-GB.json`/`it-IT.json` come dizionari piatti.
Comando equivalente riproducibile via shell:

```bash
cd runtime/scripts
grep -noE "R\((['\"])[^'\"]*\1" part.js marking.js question.js jme.js \
  jme-builtins.js jme-variables.js jme-display.js math.js util.js \
  parts/numberentry.js parts/multipleresponse.js parts/patternmatch.js \
  parts/gapfill.js parts/jme.js parts/information.js
grep -noE "Numbas\.Error\((['\"])[^'\"]*\1" <stessi file>
grep -noE "\.error\((['\"])[^'\"]*\2" <stessi file>
# poi lookup di ogni chiave in locales/en-GB.json e locales/it-IT.json (Python json.load, dict piatto)
```

### Tabella completa (174 chiavi)

174 chiavi distinte, di cui **17 assenti dal catalogo inglese** (fallback
i18next = ritorna la chiave stessa, essendo `en-GB.json` incompleto anche in
inglese) e **85 delle 157 tradotte in italiano sono identiche all'inglese**
(non tradotte — coerente con la nota della spec "~40% tradotto": 72/157 ≈ 46%
hanno un testo italiano realmente diverso). Curiosità: anche le chiavi
strutturali `mark`/`was` (usate con `$t()` per la pluralizzazione dei
messaggi di punteggio) restano in inglese in `it-IT.json`.

| chiave | en | it (o "= en") | dove (prima occorrenza) |
|---|---|---|---|
| `You have not given your answer to the correct precision.` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | parts/numberentry.js:138 |
| `alternative` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | util.js:1326 |
| `feedback.taken away` | <strong>{{count,niceNumber}}</strong> $t(mark) $t(was) taken away. | <strong>{{count,niceNumber}}</strong> $t(mark) $t(was) tolto. | part.js:1826 |
| `feedback.you were awarded` | You were awarded <strong>{{count,niceNumber}}</strong> $t(mark). | Ti sono stati assegnati <strong>{{count,niceNumber}}</strong> $t(mark). | part.js:1824 |
| `gap` | gap | = en | part.js:592 (+1) |
| `jme.compile list.mismatched bracket` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme.js:301 (+1) |
| `jme.compile list.missing right bracket` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme.js:318 |
| `jme.display.unknown token type` | Can't texify token type {{type}} | = en | jme-display.js:1088 (+1) |
| `jme.evaluate.no scope given` | Numbas.jme.evaluate must be given a Scope | = en | jme.js:271 |
| `jme.func.except.continuous range` | Can't use the 'except' operator on continuous ranges. | Non posso usare l'operatore 'eccetto' su intervalli continui. | jme-builtins.js:1132 (+2) |
| `jme.func.fetch.http error` | The HTTP request to <code>{{url}}</code> failed with error {{status}}: {{statusText}} | = en | jme-builtins.js:3796 |
| `jme.func.listval.invalid index` | Invalid list index {{index}} on list of size {{size}} | Indice delle liste {{index}} non valido in una lista di dimensione {{size}} | jme-builtins.js:1309 |
| `jme.func.listval.key not in dict` | Dictionary does not contain the key <code>{{key}}</code> | = en | jme-builtins.js:1617 (+1) |
| `jme.func.listval.not a list` | Object is not subscriptable | = en | jme-builtins.js:1303 |
| `jme.func.parse.no notation` | There is no notation called <code>{{notation_name}}</code>. | = en | jme-builtins.js:81 |
| `jme.func.satisfy.condition not a boolean` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme-builtins.js:2246 |
| `jme.func.satisfy.took too many runs` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme-builtins.js:2255 |
| `jme.func.satisfy.wrong number of definitions` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme-builtins.js:2231 |
| `jme.func.switch.no default case` | No default case for Switch statement | = en | jme-builtins.js:3048 |
| `jme.iterate_until.condition produced non-boolean` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme-builtins.js:3599 |
| `jme.makeFast.no fast definition of function` | The function <code>{{name}}</code> here isn't defined in a way that can be made fast. | = en | jme.js:5667 |
| `jme.map.matrix map returned non number` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme-builtins.js:3261 |
| `jme.map.vector map returned non number` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme-builtins.js:3270 |
| `jme.matrix.reports bad size` | Matrix reports its size incorrectly - must be an error in constructor function | La matrice riporta la sua misura in modo incorretto - ci dev'essere un errore nella funzione di costruzione | jme.js:4032 (+1) |
| `jme.matrix.value not the right type` | Tried to construct a vector using a value of the wrong type. | = en | jme.js:4028 |
| `jme.parse signature.invalid signature string` | Invalid function signature string: {{str}} | = en | jme.js:6253 |
| `jme.script.error parsing notes` | Error parsing marking script: {{- message}} | = en | jme-variables.js:887 |
| `jme.script.note.compilation error` | Error compiling note <code>{{name}}</code>: {{-message}} | = en | jme-variables.js:833 |
| `jme.script.note.empty expression` | The note <code>{{name}}</code> is empty. | = en | jme-variables.js:828 |
| `jme.script.note.invalid definition` | Invalid note definition: <code>{{source}}</code>. {{-hint}} | = en | jme-variables.js:822 |
| `jme.script.note.invalid definition.description missing closing bracket` | You might be missing a closing bracket | = en | jme-variables.js:820 |
| `jme.script.note.invalid definition.missing colon` | You might be missing a colon after the name and description | = en | jme-variables.js:818 |
| `jme.shunt.expected argument before comma` | Expected to see something between the opening bracket and the comma | = en | jme.js:2098 |
| `jme.shunt.keypair in wrong place` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme.js:2216 |
| `jme.shunt.list mixed argument types` | Can't parse {{mode}}: mix of dictionary and list elements | = en | jme.js:2272 |
| `jme.shunt.missing operator` | Expression can't be evaluated -- missing an operator. | L'espressione non può essere computata -- manca un operatore | jme.js:2438 |
| `jme.shunt.no left bracket` | No matching left bracket | Manca una parentesi sinistra | jme.js:2054 |
| `jme.shunt.no left bracket in function` | No matching left bracket in function application or tuple | Manca la parentesi sinistra nell'applicare una funzione o in un vettore | jme.js:2106 |
| `jme.shunt.no right bracket` | No matching right bracket | Manca una parentesi destra | jme.js:2419 |
| `jme.shunt.no right square bracket` | No matching right square bracket to end list | Manca una parentesi quadra a destra per chiudere la lista | jme.js:2425 (+1) |
| `jme.shunt.not enough arguments` | Not enough arguments for operation <code>{{op}}</code> | Non ci sono abbastanza argomenti per l'operazione <code>{{op}}</code> | jme.js:2241 |
| `jme.shunt.pipe right hand takes no arguments` | The expression on the right-hand side of the pipe operator must be a function application. | = en | jme.js:2341 |
| `jme.substituteTree.undefined variable` | Undefined variable: <code>{{name}}</code> | Variabile non definita: <code>{{name}}</code> | jme.js:233 |
| `jme.subvars.error compiling` | {{-message}} in <code>{{expression}}</code> | = en | jme.js:564 (+1) |
| `jme.subvars.html inserted twice` | An HTML value has been embedded twice. Consider defining a function to generate a new value each time it is used. | = en | jme-variables.js:726 |
| `jme.subvars.null substitution` | Empty variable substitution: <code>$t(left brace){{str}}$t(right brace) | = en | jme.js:568 (+1) |
| `jme.texsubvars.missing parameter` | Missing parameter in {{op}}: {{parameter}} | Parametro mancante in {{op}}: {{parameter}} | jme.js:472 |
| `jme.texsubvars.no right brace` | No matching <code>}</code> in {{op}} | = en | jme.js:485 |
| `jme.texsubvars.no right bracket` | No matching <code>]</code> in {{op}} arguments. | = en | jme.js:461 |
| `jme.thtml.not html` | Passed a non-HTML value into the THTML constructor. | È stato passato un valore non HTML nel costruttore THTML. | jme.js:3881 |
| `jme.tokenise.invalid near` | Invalid expression: <code>{{expression}}</code> at position {{position}} near <code>{{nearby}}</code> | = en | jme.js:2028 |
| `jme.tokenise.keypair key not a string` | Dictionary key should be a string, not {{type}}. | = en | jme.js:1437 |
| `jme.tokenise.number.object not complex` | Invalid object passed into number constructor. | = en | jme.js:3674 |
| `jme.type.no cast method` | Can't automatically convert from {{from}} to {{to}}. | Non posso convertire automaticamente da {{from}} a {{to}}. | jme.js:760 |
| `jme.type.type already registered` | The data type {{type}} has already been registered so can't be registered again. | = en | jme.js:3635 |
| `jme.typecheck.for in name wrong type` | The name in a <code>for</code> statement must be a name or list of names, not {{type}}. | = en | jme-builtins.js:3336 (+1) |
| `jme.typecheck.function maybe implicit multiplication` | Function <code>{{name}}</code> is not defined. Did you mean <code>{{first}}*{{possibleOp}}(...)</code>? | La funzione <code>{{name}}</code> non è definita. Volevi dire <code>{{first}}*{{possibleOp}}(...)</code>? | jme.js:2884 |
| `jme.typecheck.function not defined` | Function <code>{{op}}</code> is not defined. Is <code>{{op}}</code> a variable, and did you mean <code>{{suggestion}}*(...)</code>? | La funzione <code>{{op}}</code> non è definita. <code>{{op}}</code> è una variabile, e intendevi <code>{{suggestion}}*(...)</code>? | jme.js:2886 (+1) |
| `jme.typecheck.map not on enumerable` | <code>map</code> operation must work over a list or a range, not {{type}} | L'operazione <code>map</code> deve funzionare con una lista o un intervallo, non {{type}} | jme-builtins.js:3291 |
| `jme.typecheck.no right type definition` | No definition of <code>{{op}}</code> of correct type found. | Non ho trovato una definizione di '{{op}}' del tipo giusto. | jme.js:3259 (+7) |
| `jme.typecheck.no right type unbound name` | Variable <code>{{name}}</code> is not defined. | La variabile <code>{{name}}</code> non è definita. | jme.js:3256 |
| `jme.typecheck.op not defined` | Operation <code>{{op}}</code> is not defined. | L'operazione '{{op}}' non è definita. | jme.js:2889 |
| `jme.typecheck.wrong arguments for anonymous function` | Wrong number of arguments for this anonymous function. | = en | jme.js:4302 (+1) |
| `jme.typecheck.wrong names for anonymous function` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | jme.js:4276 |
| `jme.user javascript.error` | Error in user-defined javascript function <code>{{name}}</code>: {{-message}} | = en | jme-variables.js:124 |
| `jme.user javascript.returned undefined` | User-defined javascript function <code>{{name}}</code> returned <code>undefined</code>. | = en | jme-variables.js:116 |
| `jme.variables.circular reference` | Circular variable reference in definition of <code>{{name}}</code> | Riferimento circolare alle variabili nella definizione di <code>{{name}}</code> | jme-variables.js:205 (+1) |
| `jme.variables.duplicate definition` | There is more than one definition of the variable <code>{{name}}</code>. | = en | question.js:817 |
| `jme.variables.empty definition` | Definition of variable <code>{{name}}</code> is empty. | La definizione della variabile <code>{{name}}</code> è vuota. | question.js:829 (+2) |
| `jme.variables.empty name` | A question variable has not been given a name. | = en | question.js:826 (+2) |
| `jme.variables.error computing dependency` | Error computing referenced variable <code>{{name}}</code> | = en | jme-variables.js:227 (+1) |
| `jme.variables.error evaluating variable` | Error evaluating variable {{name}}: {{-message}} | = en | jme-variables.js:242 (+1) |
| `jme.variables.error making function` | Error making function <code>{{name}}</code>: {{-message}} | = en | jme-variables.js:160 |
| `jme.variables.invalid function language` | The language <code>{{language}}</code> is not valid. | = en | jme-variables.js:157 |
| `jme.variables.question took too many runs to generate variables` | A valid set of question variables was not generated in time. | Non è stato generato in tempo un insieme valido di variabili per la domanda. | question.js:862 |
| `jme.variables.syntax error in function definition` | Syntax error in function definition | Errore di sintassi nella definizione della funzione | jme-variables.js:99 |
| `jme.variables.variable not defined` | Variable <code>{{name}}</code> is not defined. | La variabile <code>{{name}}</code> non è definita. | jme-builtins.js:1301 (+2) |
| `jme.vector.value not an array of numbers` | Tried to construct a vector using a value that is not an array of numbers. | = en | jme.js:3993 |
| `marking.apply marking script.script not found` | Marking script <code>{{name}}</code> not found | = en | marking.js:373 |
| `marking.apply.not a list` | The first argument to <code>apply</code> must be a list, and isn't | = en | marking.js:299 |
| `marking.note.error evaluating note` | Error evaluating note <code>{{name}}</code> - {{-message}} | = en | marking.js:558 |
| `math.choose.empty selection` | Empty selection given to random function | = en | math.js:1865 (+1) |
| `math.combinations.complex` | Can't compute combinations of complex numbers | = en | math.js:1928 |
| `math.combinations.k less than zero` | Can't compute combinations: k is less than zero | Non posso calcolare le combinazioni: k è più piccolo di zero | math.js:1936 |
| `math.combinations.n less than k` | Can't compute combinations: n is less than k | Non posso calcolare le combinazioni: n è più piccolo di k | math.js:1939 |
| `math.combinations.n less than zero` | Can't compute combinations: n is less than zero | Non posso calcolare le combinazioni: n è più piccolo di zero | math.js:1933 |
| `math.gcf.complex` | Can't compute GCF of complex numbers | Non posso calcolare l'MCD di numeri complessi | math.js:1989 |
| `math.lcm.complex` | Can't compute LCM of complex numbers | Non posso calcolare l'mcm di numeri complessi | math.js:2040 (+1) |
| `math.niceNumber.undefined` | Was expecting a number, but got <code>undefined</code> | = en | math.js:763 (+3) |
| `math.order complex numbers` | Can't order complex numbers | = en | math.js:451 (+11) |
| `math.permutations.complex` | Can't compute permutations of complex numbers | = en | math.js:1953 |
| `math.permutations.k less than zero` | Can't compute permutations: k is less than zero | Non posso calcolare le permutazioni: k è più piccolo di zero | math.js:1961 |
| `math.permutations.n less than k` | Can't compute permutations: n is less than k | Non posso calcolare le permutazioni: n è più piccolo di k | math.js:1964 |
| `math.permutations.n less than zero` | Can't compute permutations: n is less than zero | Non posso calcolare le permutazioni: n è più piccolo di zero | math.js:1958 |
| `math.precround.complex` | Can't round to a complex number of decimal places | Non posso arrotondare a un numero complesso di cifre decimali | math.js:1162 |
| `math.random_integer_partition.invalid k` | The size of the partition must be between 1 and {{n}}. | = en | math.js:1088 |
| `math.rangeToList.zero step size` | Can't convert a range with step size zero to a list. | = en | math.js:2104 |
| `math.real interval.invalid string` | The string <code>{{str}}</code> is not a valid interval definition. | = en | math.js:3862 |
| `math.shuffle_together.lists not all the same length` | Not all lists are the same length. | = en | math.js:1071 |
| `math.siground.complex` | Can't round to a complex number of sig figs | Non posso arrotondare a un numero complesso di cifre significative | math.js:1272 |
| `math.toNearest.complex` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | math.js:1749 |
| `matrixmath.abs.non-square` | Can't compute the determinant of a matrix which isn't square. | Non posso calcolare il determinante di una matrice non quadrata. | math.js:3262 |
| `matrixmath.abs.too big` | Sorry, can't compute the determinant of a matrix bigger than 3x3 yet. | Mi dispiace, non so ancora calcolare il determinante di una matrice più grande di 3x3. | math.js:3278 |
| `matrixmath.mul.different sizes` | Can't multiply matrices of different sizes. | Non posso moltiplicare matrici di dimensioni diverse. | math.js:3322 |
| `matrixmath.not invertible` | This operation only works on an invertible matrix. | = en | math.js:3568 |
| `matrixmath.not square` | This operation only works on a square matrix. | = en | math.js:3540 (+1) |
| `maximum value` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | parts/numberentry.js:185 |
| `minimum value` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | parts/numberentry.js:179 |
| `part` | part | parte | util.js:1318 |
| `part.error` | {{path}}: {{-message}} | = en | part.js:793 |
| `part.gapfill.cyclic adaptive marking` | There is a cycle in the adaptive marking for this part: <strong>{{name1}}</strong> relies on <strong>{{name2}}</strong>, which eventually relies on <strong>{{name1}}</strong>. | = en | parts/gapfill.js:215 |
| `part.jme.answer missing` | Correct answer is missing | Manca la risposta corretta | parts/jme.js:49 (+1) |
| `part.jme.answer too long` | Your answer is too long. | La tua risposta è troppo lunga. | parts/jme.js:87 |
| `part.jme.answer too short` | Your answer is too short. | La tua risposta è troppo corta. | parts/jme.js:95 |
| `part.jme.invalid value generator expression` | Invalid value generator expression for variable <code>{{name}}</code>: {{-message}} | = en | parts/jme.js:377 |
| `part.marking.adaptive marking use condition not a boolean` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | part.js:1618 |
| `part.marking.adaptive variable replacement does not satisfy condition` | Your answer to <strong>{{name}}</strong> was not used because it did not satisfy the condition. | = en | part.js:1133 |
| `part.marking.adaptive variable replacement does not satisfy condition message` | Your answer to <strong>{{name}}</strong> was not used: {{message}} | = en | part.js:1133 |
| `part.marking.adaptive variable replacement refers to nothing` | This part contains an invalid variable replacement for adaptive marking. | = en | part.js:465 |
| `part.marking.adaptive variable replacement refers to self` | This part refers to itself in a variable replacement for adaptive marking. | = en | part.js:462 |
| `part.marking.correct` | Your answer is correct. | La tua risposta è corretta. | marking.js:136 (+1) |
| `part.marking.counts towards objective` | This part counts towards the objective <strong>“{{objective}}”</strong>. | = en | part.js:1243 |
| `part.marking.did not answer` | You did not answer this question. | Non hai risposto a questa domanda. | part.js:1280 |
| `part.marking.error in adaptive marking` | There was an error in the adaptive marking for this part. Please report this. {{-message}} | = en | part.js:1164 |
| `part.marking.error in marking script` | There was an error in this part's marking algorithm. Please report this. {{-message}} | = en | part.js:1919 (+1) |
| `part.marking.incorrect` | Your answer is incorrect. | La tua risposta non è corretta. | marking.js:148 (+1) |
| `part.marking.maximum scaled down` | The maximum you can score for this part is <strong>{{count,niceNumber}}</strong> $t(mark). Your scores will be scaled down accordingly. | = en | part.js:1300 |
| `part.marking.maximum score applied` | The maximum score for this part is <strong>{{score,niceNumber}}</strong>. | = en | part.js:985 (+1) |
| `part.marking.minimum score applied` | The minimum score for this part is <strong>{{score,niceNumber}}</strong>. | Il punteggio minimo per questa parte è <strong>{{score,niceNumber}}</strong>. | part.js:982 |
| `part.marking.missing required note` | The marking algorithm does not define the note <code>{{note}}</code> | = en | part.js:504 |
| `part.marking.no result after replacement` | This part could not be marked using your answers to previous parts. | Non si è potuto attribuire punteggio a questa parte utilizzando le tue risposte alle parti precedenti. | part.js:1262 |
| `part.marking.not submitted` | No answer submitted. | Non hai inviato una risposta. | part.js:1360 |
| `part.marking.nothing entered` | You did not enter an answer. | Non hai inserito una risposta. | marking.js:411 |
| `part.marking.parameter already in scope` | There is a variable named <code>{{name}}</code>, which is also the name of a marking parameter. Please rename the variable. | = en | part.js:1970 |
| `part.marking.resubmit because of variable replacement` | This part's marking depends on your answers to other parts, which you have changed. Save your answer to this part again to update your score. | Il voto di questa parte dipende dalle tue risposte alle altre parti, che hai cambiato. Invia di nuovo questa parte per aggiornare il tuo punteggio. | part.js:1379 |
| `part.marking.revealed steps` | You revealed the steps. | Hai mostrato i passaggi. | part.js:1303 |
| `part.marking.steps change` | You were awarded <strong>{{count,niceNumber}}</strong> $t(mark) for your answers to the steps. | = en | part.js:960 |
| `part.marking.steps no matter` | Because you received full marks for the part, your answers to the steps aren't counted. | Poiché hai avuto il punteggio pieno per la parte, le tue risposte ai passaggi non vengono contate. | part.js:956 |
| `part.marking.uncaught error` | Error when marking: {{-message}} | Errore nel valutare: {{-message}} | part.js:1259 |
| `part.marking.used variable replacements` | This part was marked using your answers to previous parts. | Questa parte è stata valutata usando le tue risposte alle parti precedenti. | part.js:1118 (+1) |
| `part.marking.variable replacement part not answered` | You must answer {{part}} first. | Devi rispondere prima a {{part}}. | part.js:1646 |
| `part.mcq.choices missing` | Definition of choices is missing | Manca la definizione delle scelte | parts/multipleresponse.js:77 |
| `part.mcq.marking matrix string empty` | The custom marking matrix expression is empty. | = en | parts/multipleresponse.js:209 |
| `part.mcq.matrix cell empty` | Part {{part}} marking matrix cell ({{row}},{{column}}) is empty | = en | parts/multipleresponse.js:639 |
| `part.mcq.matrix jme error` | Part {{part}} marking matrix cell ({{row}},{{column}}) gives a JME error: {{-error}} | = en | parts/multipleresponse.js:644 |
| `part.mcq.matrix not a list` | Marking matrix, defined by JME expression, is not a list but it should be. | = en | parts/multipleresponse.js:614 |
| `part.mcq.matrix not a number` | Part {{part}} marking matrix cell ({{row}},{{column}}) does not evaluate to a number | = en | parts/multipleresponse.js:647 |
| `part.mcq.matrix wrong size` | Marking matrix is the wrong size. | = en | parts/multipleresponse.js:620 (+1) |
| `part.mcq.options def not a list` | The expression defining the {{properties}} is not a list. | L'espressione che definisce le {{properties}} non è una lista. | parts/multipleresponse.js:112 (+2) |
| `part.missing type attribute` | {{part}}: Missing part type attribute | {{part}}: Manca l'attributo del tipo di parte | part.js:67 (+1) |
| `part.numberentry.display answer wrong type` | The display answer for this part is a value of type <code>{{got_type}}</code>, but should be a <code>{{want_type}}</code>. | = en | parts/numberentry.js:231 |
| `part.numberentry.negative decimal places` | This part is set up to round the student's answer to a negative number of decimal places, which has no meaning. | Questa parte è impostata per arrotondare la risposta dello studente a un numero negativo di cifre decimali, che non ha senso. | parts/numberentry.js:172 |
| `part.numberentry.zero sig fig` | This part is set up to round the student's answer to zero significant figures, which has no meaning. | Questa parte è impostata per arrotondare la risposta dello studente a zero cifre significative, il che non ha senso. | parts/numberentry.js:169 |
| `part.patternmatch.display answer missing` | Display answer is missing | = en | parts/patternmatch.js:40 |
| `part.setting not present` | Property '{{property}}' not set | Proprietà '{{property}}' non impostata | parts/numberentry.js:179 (+3) |
| `part.unknown type` | {{part}}: Unrecognised part type {{type}} | {{part}}: Tipo di parte {{type}} non riconosciuto | part.js:141 |
| `question.error` | Question {{number}}: {{-message}} | Domanda {{number}}: {{-message}} | question.js:259 |
| `question.error creating question` | Error while creating question {{number}}: {{-message}} | Errore nella creazione della domanda {{number}}: {{-message}} | question.js:35 (+1) |
| `question.explore.no parts defined` | There are no parts defined in this question. | = en | question.js:304 |
| `question.no such part` | Can't find part {{path}}. | Non trovo la parte {{path}} | question.js:1210 |
| `question.preamble.error` | Error in preamble: {{-message}} | Errore nel preambolo: {{-message}} | question.js:1192 |
| `question.required extension not available` | This question requires the extension <code>{{-extension}}</code> but it is not available. | = en | question.js:664 |
| `question.show steps` | Show steps | Mostra i passaggi | part.js:359 |
| `question.unsubmitted changes` | You have made a change to your answer but not submitted it. Please check your answer and then press the <strong>Save answer</strong> button. | Hai fatto un cambiamento alla tua risposta ma non l'hai inviato. Per favore controlla la risposta e poi premi il bottone <strong>Invia risposta</strong> | question.js:1340 |
| `ruleset.circular reference` | Circular reference in definition of ruleset <code>{{name}}</code> | = en | jme-variables.js:545 |
| `ruleset.set not defined` | Ruleset {{name}} has not been defined | L'insieme di regole {{name}} non è stato definito | jme-variables.js:550 |
| `step` | step | passaggio | part.js:594 (+1) |
| `util.equality not defined for type` | Equality not defined for type {{type}} | = en | util.js:182 |
| `util.permutations.r bigger than n` | *(assente dal catalogo — fallback = chiave)* | *(assente dal catalogo — fallback = chiave)* | util.js:1250 |
| `util.product.non list` | Passed a non-list to <code>Numbas.util.product</code> | = en | util.js:1084 (+1) |
| `variable.error in variable definition` | Error in definition of variable <code>{{name}}</code> | Errore nella definizione della variabile <code>{{name}}</code> | question.js:834 |
| `vectormath.cross.matrix too big` | Can't calculate cross product of a matrix which isn't $1 \times N$ or $N \times 1$. | = en | math.js:3000 (+1) |
| `vectormath.cross.not 3d` | Can only take the cross product of 3-dimensional vectors. | = en | math.js:3016 |
| `vectormath.dot.matrix too big` | Can't calculate dot product of a matrix which isn't $1 \times N$ or $N \times 1$. | = en | math.js:2957 (+1) |

## 6. Infrastruttura di test upstream

### `tests/headless.mjs` (15 righe)

```js
import { JSDOM } from 'jsdom';
import { QUnit } from 'qunit';
import './numbas-runtime.js';
import './locales.js';
import './jme/jme-tests.mjs';
import './parts/part-tests.mjs';

const { window } = (new JSDOM(''));
global.window = window;
global.document = window.document;
global.QUnit = QUnit;
QUnit.config.notrycatch = true;

Numbas.queueScript('base',[],function() {});
Numbas.queueScript('qunit',[],function() {});
```

`package.json` (`tests/`) definisce `"test": "qunit headless.mjs"` (con
dipendenze `jsdom ^20.0.0` e devDependency `qunit ^2.19.1`). Il modulo
`numbas.js` (compilato dentro `numbas-runtime.js`) rileva l'assenza di
`window` e fa `window = global.window = global` (numbas.js:17-22) **prima**
che `headless.mjs` assegni la vera `window` di jsdom — l'assegnazione jsdom
a `global.window`/`global.document` avviene *dopo* l'import (side-effect)
di `numbas-runtime.js`, quindi serve solo alle parti che consultano `document`
più tardi (es. `util.js`, parti display), non al bootstrap di `Numbas`.
Le righe finali **ri-registrano** gli script `'base'` e `'qunit'` con
`Numbas.queueScript` — che (`numbas.js:181-201`) permette la ri-registrazione
di uno script già in coda, sovrascrivendo `fdeps`/`callback`. Questo è
**necessario**: `start-exam.js` (compilato dentro `numbas-runtime.js`)
dichiara `queueScript('base', ['localisation','seedrandom','knockout'], ...)`
(riga 15) — ma `knockout` non è mai caricato nel bundle di test, quindi senza
il override `'base'` non si risolverebbe mai e tutti i moduli che dipendono
da `'base'` (quasi tutti) resterebbero bloccati.

### `tests/numbas-runtime.js` (build)

Prodotto dal target Make `tests/numbas-runtime.js` (Makefile:33-38), che
concatena, con un header di commento, **tutti** questi file (in quest'ordine,
verificato dal commento in testa al file compilato):
`numbas.js`, `localisation.js`, `util.js`, `math.js`, `unicode-mappings.js`,
`jme-rules.js`, `jme.js`, `jme-builtins.js`, `jme-display.js`, `jme-notations.js`,
`jme-variables.js`, `jme-calculus.js`, `schedule.js`, `controls.js`,
`exam-to-xml.js`, `part.js`, `question.js`, `exam.js`, `diagnostic.js`,
`download.js`, `marking.js`, `json.js`, `timing.js`, `start-exam.js`,
`numbas.js` (di nuovo, per gli script del tema), `scorm-storage.js`,
`storage.js`, `xml.js`, `SCORM_API_wrapper.js`, `evaluate-settings.js`,
`csv.js`, più le librerie terze `i18next/i18next.js`, `decimal/decimal.js`,
`parsel/parsel.js`, `seedrandom/seedrandom.js`, più tutti i file di
`runtime/scripts/parts/*.js` (`PART_SOURCES`, wildcard) e
`themes/default/files/scripts/answer-widgets.js`. Il file risultante è
**1.609.367 byte, 40.189 righe**, inizia con `"use strict";` (Makefile:36).
**Non include** i cataloghi di localizzazione (compilati separatamente in
`tests/locales.js`) né gli script di correzione (`tests/marking_scripts.js`)
né gli script diagnostici (`tests/diagnostic_scripts.js`) né alcuna
estensione — tutti target Make distinti (Makefile:68-131). Il global `Numbas`
viene creato da `numbas.js` (dentro il bundle) su `globalThis`/`global`/`window`
se non esiste già (`numbas.js:17-25`: `if(!_globalThis.Numbas){ _globalThis.Numbas={} }`).

**Fondamentale per l'oracolo**: la marcatura di default di *ogni* tipo di
parte builtin dipende da `Numbas.raw_marking_scripts` (definito solo da
`tests/marking_scripts.js`, non incluso in `numbas-runtime.js`) — verificato
su tutti i `baseMarkingScript` dei tipi in ambito: `parts/gapfill.js:140`,
`parts/jme.js:200`, `parts/multipleresponse.js:501`, `parts/numberentry.js:96`,
`parts/patternmatch.js:75` fanno tutti `new Numbas.marking.MarkingScript(Numbas.raw_marking_scripts.<tipo>, ...)`.
**Senza `tests/marking_scripts.js` caricato, la correzione di qualunque parte
di questi tipi fallisce** (script sorgente `undefined` passato al costruttore
di `MarkingScript`). `Numbas.diagnostic.load_scripts()` invece è sicuro anche
senza `tests/diagnostic_scripts.js` (`for...in undefined` non lancia,
`diagnostic.js:6-10`) — non serve per l'oracolo.

### Come i test referenziano `Numbas`

Sia `jme-tests.mjs` che `part-tests.mjs` sono avvolti in
`Numbas.queueScript('jme_tests'/'part_tests', [...deps], function(){...})`
(jme-tests.mjs:3, part-tests.mjs:6) — quindi girano **dentro** il sistema di
moduli di Numbas, non come import ES normali (a parte l'unico
`import doc_tests from './doc-tests.mjs'` in cima a jme-tests.mjs, che è puro
dato JSON, non codice-Numbas). Accedono a `Numbas.jme.builtinScope` per
valutare espressioni globali (es. `Numbas.jme.builtinScope.evaluate(example.in)`,
jme-tests.mjs:2971) e a `Numbas.createQuestionFromJSON`/`Numbas.createPartFromJSON`
per costruire domande/parti dai JSON inline nei test.

### Helper in cima a `jme-tests.mjs` (righe 1-63)

```js
import doc_tests from './doc-tests.mjs';

Numbas.queueScript('jme_tests',['qunit','jme','jme-rules','jme-display','jme-calculus','jme-notations', 'localisation','schedule'],function() {
    var QUnit;

    Numbas.locale.set_preferred_locale('en-GB');
    Numbas.locale.init();

    try {
        var QUnit = global.QUnit;
    } catch(e) {
        QUnit = window.QUnit;
    }

    var jme = Numbas.jme;
    var math = Numbas.math;
    var types = jme.types;
    var tokenise = jme.tokenise;

    function raisesNumbasError(assert, fn,error,description) { ... }   // riga 19
    function closeEqual(assert, value,expect,message) { ... }           // riga 23
    function deepCloseEqual(assert, value,expect,message) { ... }       // riga 32
    function remove_pos(tree) { ... }                                   // riga 43
    function treesEqual(assert, a, b, message) { ... }                  // riga 52
    function tokWithPos(tok,pos) { ... }                                // riga 60
```

`raisesNumbasError` verifica `e.originalMessage == error` (matcher standard
per testare gli errori Numbas, utile anche per i test differenziali).
`closeEqual`/`deepCloseEqual` arrotondano con `Numbas.math.precround(x,10)`
prima del confronto (per tollerare l'instabilità in virgola mobile).

### Helper in cima a `part-tests.mjs` (righe 1-157, selezione)

```js
import '../marking_scripts.js';
import '../diagnostic_scripts.js';
import {with_scorm, SCORM_API} from './scorm_api.mjs';
import {unit_test_exam, unit_test_questions} from './part_unit_tests.mjs';

Numbas.queueScript('part_tests',[...],function() {
    ...
    Numbas.locale.set_preferred_locale('en-GB');
    Numbas.locale.init();
    Numbas.diagnostic.load_scripts();                       // riga 21

    var createPartFromJSON = function(data){ return Numbas.createPartFromJSON(0, data, 'p0', null, null); };  // riga 23

    async function mark_part(p, answer, scope) {             // righe 53-65
        scope = scope || p.getScope();
        p.storeAnswer(answer);
        p.setStudentAnswer();
        var res = p.mark(scope);
        if(p.waiting_for_pre_submit) { await p.waiting_for_pre_submit; res = p.mark(scope); }
        return res.finalised_result;
    }

    function submit_part(p) { ... }                          // righe 67-72, wrappa p.submit() in una Promise su 'post-submit'

    function question_test(name,data,test_fn,error_fn,num_assertions) {   // righe 157-181
        QUnit.test(name, async function(assert) {
            var done = assert.async();
            var q = Numbas.createQuestionFromJSON(data, 0);
            q.generateVariables();
            q.signals.on('ready').then(async function() {
                await test_fn(assert,q);
                done();
            }).catch(...);
        });
    }
```

`question_test` è **esattamente** il pattern sincrono-friendly da riprodurre
nel port: crea la domanda, chiama `generateVariables()`, attende `'ready'`.

### `doc-tests.mjs` e `make_tests_from_docs.py`

`tests/jme/doc-tests.mjs` (6209 righe, `export default [...]`) è generato dal
target Make `tests/jme/doc-tests.mjs: $(NUMBAS_EDITOR_PATH)/docs/jme-reference.rst`
(Makefile:149-152): `cat jme-reference.rst | python tests/jme/make_tests_from_docs.py >> $@`.
**Sorgente**: il file reStructuredText `docs/jme-reference.rst` del repository
**dell'editor Numbas** (`../editor`, non in questo clone — dipendenza esterna),
che documenta ogni funzione JME con `.. jme:function::` (direttiva custom
registrata riga 83 dello script Python) e liste di esempi `input → output`.
Lo script (232 righe) usa `docutils` per parsare l'RST, estrae per ogni
sezione un `{name, fns:[{name, keywords, noexamples, calling_patterns, examples:[{in,out}]}]}`
e stampa `json.dumps(...)` su stdout. Il conteggio dei blocchi di test:
`doc_tests` contiene le sezioni della documentazione JME (es. "Anonymous
functions", "Arithmetic", ...); ogni funzione con `examples.length>0` diventa
un `QUnit.test` in `jme-tests.mjs:2966-2981` (`doc_tests.forEach(section =>
section.fns.forEach(fn => { if(fn.examples.length) QUnit.test(fn.name, ...) }))`).
`jme-tests.mjs:2867-2934` ha anche un test di "Coverage" che verifica che ogni
funzione builtin sia documentata (e viceversa) confrontando
`Numbas.jme.builtinScope.allFunctions()` con i nomi trovati in `doc_tests`.

### `tests/marking_scripts.js` e `tests/locales.js`

`tests/marking_scripts.js` (16 righe) — generato da Makefile:68-73 dai 6 file
`marking_scripts/*.jme` (810 righe totali: `gapfill.jme` 79, `jme.jme` 293,
`matrixentry.jme` 144, `multipleresponse.jme` 127, `numberentry.jme` 117,
`patternmatch.jme` 50), ciascuno incapsulato come stringa JSON-escaped in
`Numbas.raw_marking_scripts.<nomefile>` (`Numbas.queueScript('marking_scripts',
['marking'], function(){ Numbas.raw_marking_scripts = {...} })`).

`tests/locales.js` (11.057 righe) — generato da Makefile:105-129 da tutti i
file `locales/*.json` (incluso `en-GB.json`/`it-IT.json`), incapsulati in
`Numbas.queueScript('localisation-resources', ['i18next'], function(){
Numbas.locale = {preferred_locale:"en-GB", resources: { "<lingua-minuscola>":
{translation: <contenuto del json>}, ... }} })`.

### Recipe per l'harness oracolo (`packages/engine/oracle/` + `test/differential/`)

**File da copiare in `packages/engine/oracle/`** (con header di licenza
Apache, git-tracked, solo dev): `numbas-runtime.js` (1,6 MB), `locales.js`
(11.057 righe — o solo il sottoinsieme `en-gb`/`it-it` se si vuole ridurre
la dimensione, ma la spec dice di copiarlo intero) e **`marking_scripts.js`**
(16 righe — **mancante nella bozza della spec, necessario per correggere
qualunque parte**, vedi sopra). `diagnostic_scripts.js` non serve (fuori
ambito, e sicuro da omettere). Tutti e tre sono generati da `make runtime
marking_scripts locales` nel repo upstream — vanno rigenerati solo se si
aggiorna il commit di riferimento.

**Come caricarli in Node + jsdom da un test Vitest**:

```ts
// packages/engine/test/differential/oracle.ts
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('');
(globalThis as any).window = window;
(globalThis as any).document = window.document;

await import('../../oracle/numbas-runtime.js');   // side-effect: crea globalThis.Numbas
await import('../../oracle/locales.js');           // side-effect: Numbas.locale.resources
await import('../../oracle/marking_scripts.js');   // side-effect: Numbas.raw_marking_scripts

const Numbas = (globalThis as any).Numbas;

// stub 'base' (dipende da 'knockout', mai caricato) come in tests/headless.mjs:14
Numbas.queueScript('base', [], function () {});

Numbas.locale.set_preferred_locale('en-GB');   // o 'it-IT'
Numbas.locale.init();

export function oracleQuestion(json: object, seed: string) {
    // Il runtime upstream non semina Math.random per domanda: si usa la
    // funzione JME seedrandom(seed, expr) (jme-builtins.js:2958-2970) che
    // monkey-patcha Math.random con Math.seedrandom (pacchetto npm
    // 'seedrandom', incluso nel bundle come THIRD_PARTY_SOURCES) solo per la
    // durata di `expr`. Per riprodurre l'intera generazione della domanda
    // sotto lo stesso seed, va avvolta l'intera generazione:
    (globalThis as any).Math.seedrandom(seed);
    const q = Numbas.createQuestionFromJSON(json, 0);
    q.generateVariables();
    return q.signals.on('ready').then(() => q);
}
```

**Firma di `Numbas.createQuestionFromJSON`** (question.js:51):
`(data: object, number: number, exam?: Exam, group?: QuestionGroup, scope?: Scope, store?: BlankStorage, loading?: boolean) => Question`.
Per l'oracolo, `number=0` e tutto il resto `undefined` bastano (verificato:
`part-tests.mjs:163` fa esattamente `Numbas.createQuestionFromJSON(data, 0)`).
**Non serve nessuno stub di `display`/`store`**: `finaliseLoad` controlla
`if(Numbas.display && q.exam && q.exam.display)` (890) prima di creare un
`QuestionDisplay`, e tutte le chiamate a `this.display &&`/`this.store &&`
sono già guardate — con `exam`/`store` `undefined` questi rami sono no-op.
Marcare/correggere una parte per il confronto differenziale:
`p.storeAnswer(answer); p.setStudentAnswer(); const res = p.mark(scope);`
(pattern di `mark_part`, part-tests.mjs:53-65), oppure `p.submit()` seguito
da lettura di `p.credit`/`p.markingFeedback`.

## 7. Da non portare

| righe (question.js) | cosa | motivo |
|---|---|---|
| 17-38 | `Numbas.createQuestionFromXML` | percorso XML, fuori ambito (decisione spec: solo JSON) |
| 262-424 | `loadFromXML` | idem, usa `Numbas.xml.*` (compilatore Python `.exam`) |
| 460-472 | `createExtraPartFromXML` | idem |
| 890-892, 901-903, 915-917 | hook `Numbas.display`/`QuestionDisplay` in `finaliseLoad` | display/DOM, fuori ambito (nessuna dipendenza da `window`/`document`) |
| 474-483 (parz.) | `setCurrentPart` → `this.display.currentPart(...)` | display |
| 935-1070 | `resume()` (storage) | dipende da `Numbas.storage`/SCORM, fuori ambito nel motore puro — ma **la sua *forma dati* va riusata** per `QuestionState` (§9) |
| 1169-1177 | `leave()` | display (`this.display.leave()`) |
| 1332-1345 | `leavingDirtyQuestion()` | display (`this.exam.display.root_element.showAlert`) |
| 1409-1431 (parz.) | `submit()` → `this.store.questionSubmitted(this)` | storage hook, da sostituire con la propria persistenza |
| 1432-1447 (parz.) | `updateScore()` → `display.showScore()`/`store.saveQuestion()` | display/storage |
| 1448-1465 | `onHTMLAttached`/`onVariablesGenerated` | display (deprecati anche upstream) |
| — (intero file) | `runtime/scripts/schedule.js` | il sistema `Numbas.schedule` a code/Promise (`calls`, `lifts`, `SignalBox`, `EventBox`, `Scheduler`) serve solo a orchestrare caricamento asincrono e barra di progresso; il port è sincrono (decisione spec, `loadQuestion(...): Question` non-Promise) |
| 1215-1235 | `getObjective`/`getPenalty` | solo `partsMode:'explore'` — **da valutare** se in ambito (vedi §10, non escluso esplicitamente dalla spec) |
| `diagnostic_scripts.js`, `diagnostic.js` | modalità diagnostica dell'esame | esplicitamente fuori ambito (non-obiettivi della spec: "modalità diagnostica") |
| `storage.js`, `scorm-storage.js` | persistenza SCORM | fuori ambito (non-obiettivi: "storage") — solo la *forma* dei dati serve da riferimento |

## 8. Punti delicati

- **Caricamento asincrono via signals (question.js:772-918, schedule.js:162-296)**:
  l'intera orchestrazione si basa su `Promise.all` interni a `SignalBox.on`.
  Un port sincrono deve rimpiazzare il grafo di eventi con una sequenza di
  chiamate dirette **nello stesso ordine di dipendenza**: preamble → costanti
  → funzioni → rulesets → `variablesTodo` → generazione variabili (ciclo
  `variablesTest`) → finalizzazione scope → creazione parti → punteggio
  iniziale. L'ordine dei rami "in parallelo" upstream (es. costanti e
  funzioni, che non dipendono l'una dall'altra) non è garantito dalle
  Promise native (dipende dall'ordine di risoluzione dei microtask) — nel
  port sincrono va scelto un ordine deterministico esplicito (si consiglia:
  costanti, poi funzioni, poi rulesets, come nel codice sorgente).
- **`preamble.js` è JavaScript arbitrario** (question.js:1183-1201, eseguito
  con `new Function(['question'], this.preamble.js)` — equivalente a `eval`,
  con accesso completo all'oggetto `question` mutabile, quindi allo `scope`
  e a `Numbas` globale). **Raccomandazione**: non supportarlo nel port (se
  `preamble.js` non è vuoto dopo `trim()`, sollevare un errore esplicito
  "preambolo JS non supportato" invece di eseguirlo silenziosamente o
  ignorarlo) — eseguire JS arbitrario lato server (per ricalcolare un
  punteggio, decisione 5 della spec) è un rischio di sicurezza che la spec
  non discute esplicitamente; va deciso (vedi §10).
- **`functions` con `language:'javascript'` e `type:'promise'`**
  (jme-variables.js:87-127, esempio verbatim in §2) — il formato JSON
  supporta funzioni JS **asincrone** che restituiscono `TPromise`
  (`jme-variables.js:308-312`: `if(jme.isType(value,'promise')) { ... value =
  jme.wrapValue(await promise) }`). L'intera generazione delle variabili
  (`makeVariablesPromise`) è `async` **proprio per supportare questo caso**.
  Il port, essendo sincrono (API `loadQuestion(...): Question`, non
  `Promise<Question>`), **non può supportarlo**: va rifiutato esplicitamente
  (funzione con `language==='javascript' && type==='promise'` ⇒ errore in
  fase di caricamento) piuttosto che bloccarsi o dare risultati diversi
  dall'oracolo.
- **Ordine di generazione delle variabili vs `variablesTest`**
  (question.js:809-867, jme-variables.js:191-245/256-321/343-398/410-469):
  la funzione `todo` è costruita iterando `q.variableDefinitions` che è
  **esattamente** `Object.values(variables)` nell'ordine di inserimento delle
  chiavi del JSON (question.js:621 — **la chiave esterna dell'oggetto
  `variables` non conta**, solo l'ordine con cui appare). Per ogni variabile
  "top level" senza dipendenze reciproche, l'ordine di valutazione (e quindi
  di consumo di `Math.random`) è l'ordine di inserimento nel JSON; per
  variabili con dipendenze, `computeVariable`/`computeVariablePromise` fa una
  DFS post-order (valuta prima le dipendenze non ancora calcolate,
  `jme-variables.js:216-231`) **usando l'array `v.vars` calcolato da
  `findvars` in fase di parsing**, il cui ordine dipende dall'ordine di
  comparsa dei nomi nell'espressione. Se `variablesTest.condition` non è
  soddisfatta, **l'intero scope viene ricreato e rigenerato da capo**
  (question.js:854-860: `scope = new jme.Scope([q.scope])` dentro il
  `while`), consumando altra casualità ad ogni tentativo fallito — un port
  deve riprodurre esattamente questo per essere bit-identico all'oracolo a
  parità di seed.
- **`jme.compile('')` ritorna `null`** (jme.js:2451-2465) — con
  `variablesTest.condition === ''` (default, ctor riga 96), il ciclo
  `while` gira **esattamente una volta** (`if(condition)` è falso quando
  `condition` è `null`, quindi `conditionSatisfied` resta `true` dal default
  a riga 845 di question.js). Un porting naive che trattasse la stringa
  vuota come "sempre vera dopo valutazione" invece che "nessuna condizione,
  nessuna valutazione" introdurrebbe una chiamata JME spuria.
- **Gestione errori** (`Numbas.Error`, numbas.js:78-89): il costruttore fa
  sempre `R.apply(e, [message, args])` — cioè **ogni** errore Numbas passa
  per la localizzazione, anche quelli mai chiamati con `R(...)` letterale
  (vedi §5). `Question.prototype.error`/`Part.prototype.error`
  (question.js:249-260, part.js:782-794) evitano il doppio wrapping
  controllando `originalError.originalMessages[0] == 'question.error'`/`'part.error'`
  — un porting dell'oggetto errore deve riprodurre questa catena
  (`originalMessage`, `originalMessages[]`, `originalError`) se il test
  differenziale confronta i testi d'errore con l'oracolo.
- **Scope a strati** (builtin → domanda → parte): `Numbas.jme.builtinScope`
  (jme-builtins.js:41) è la radice; `Question` la estende con le scope delle
  estensioni (question.js:660-671, `addExtensionScopes`), poi con funzioni
  (802: `q.scope = new jme.Scope([q.scope, {functions: functions}])`), poi
  con le variabili generate (869-870: `q.scope = new jme.Scope([q.scope]);
  q.scope.flatten()`). Ogni `Part.makeScope(parentScope)` (part.js:1050-1065)
  crea un nuovo scope figlio di `parentPart.getScope()` (se è un gap/step)
  o `question.scope`, con in più la variabile `part_path`. Un gap/step ha
  quindi 4 livelli di scope annidati (builtin → domanda → parte padre →
  gap/step).
- **`extensions` a livello domanda** (question.js:508-513, 647-671): se il
  JSON dichiara estensioni e queste non sono registrate in
  `Numbas.extensions`, `addExtensionScopes` lancia
  `question.required extension not available` (664). Il port non ha un
  meccanismo di estensioni: si raccomanda di fallire esplicitamente se
  `extensions.length>0` (fail-fast) piuttosto che ignorare silenziosamente
  (una domanda che usa funzioni fornite da un'estensione fallirebbe più
  avanti, in modo più confuso, durante la valutazione JME).
- **`Numbas.raw_marking_scripts` è un prerequisito silenzioso**: senza
  `tests/marking_scripts.js` (o l'equivalente porting di `marking_scripts/*.jme`),
  qualunque parte builtin (`numberentry`, `jme`, `multipleresponse`,
  `patternmatch`, `gapfill`, `matrixentry`) non ha un algoritmo di
  correzione di default — vedi §6.
- **`customName`/`hasCustomName`**: nel path JSON, `q.hasCustomName` **non
  viene mai impostato** da `loadFromJSON` (a differenza del path XML,
  question.js:280-283). Se il port espone `hasCustomName`/logica di
  visualizzazione del nome, va calcolata esplicitamente da `customName`.

## 9. Proposta TypeScript

`packages/engine/src/question/` (ognuno ≤1000 righe, upstream question.js
solo-JSON è ~700 righe utili una volta tolti XML/display/storage):

| file | contenuto | mappa da (question.js, salvo indicato) |
|---|---|---|
| `load.ts` | `loadQuestion(json, opts): Question` — parsing dei campi (§2), costruzione scope (costanti → funzioni → rulesets), orchestrazione sincrona dei passi di `finaliseLoad` (esclusa generazione variabili) | 495-645 (`loadFromJSON`) + 772-808 (blocchi costanti/funzioni/rulesets di `finaliseLoad`) |
| `variables.ts` | costruzione di `variablesTodo` (nomi, alberi, dipendenze) e ciclo `variablesTest` (chiama i primitivi sincroni di `variables/` per la generazione vera e propria) | 809-889 |
| `parts.ts` | istanziazione delle parti da JSON (`createPartFromJSON` dispatch), `addPart`/`allParts`/`getPart`/`partDictionary`, back-reference per adaptive marking | 673-723, 689-710, 1202-1213 |
| `scoring.ts` | `calculateScore`/`updateScore`/`validate`/`isDirty`/`submit` | 1291-1447 (esclusi gli hook display/storage) |
| `state.ts` | `toState()`/`restoreQuestion()` — sostituisce `resume()` upstream con un modello più semplice (vedi sotto) | 935-1070 (come riferimento della forma dati, non del codice) + storage.js:405-530 |
| `question.ts` | classe/factory pubblica `Question`, `regenerate(seed)` (nessun equivalente diretto upstream, va scritto ex novo — §3 punto 5), `revealAnswer`, `getAdvice`, `lock` | 1266-1290, 1237-1265, 61-105 |
| `errors.ts` | classe di errore equivalente a `Numbas.Error` + `.error()` di Question/Part, con chiavi del proprio `i18n/` | numbas.js:78-89, question.js:249-260 |

`packages/engine/src/i18n/{it,en}.ts`: `export const en: Record<string,string> = {...}` /
`export const it: Record<string,string> = {...}`, con `R(key: string, params?: Record<string,string|number>): string`
che fa una sostituzione `{{param}}` semplice (senza `$t()`/pluralizzazione
`_plural`/escape HTML differenziato — funzionalità di i18next non necessarie
dato che i messaggi sono scritti da zero, decisione 7 della spec). Solo un
sottoinsieme delle 174 chiavi upstream serve davvero (quelle dei moduli
effettivamente portati: niente XML/display/storage/explore se esclusi);
si raccomanda di **non** copiare le chiavi 1:1 ma scrivere chiavi proprie
più corte, mantenendo un commento `// upstream: <chiave originale>` dove il
messaggio corrisponde 1:1 a uno upstream (utile per i test differenziali sui
messaggi di errore).

**`QuestionState` (derivato da `storage.js:405-530`, semplificato)**:
poiché il port genera le variabili in modo deterministico da un seed
esplicito (decisione 5 della spec) — a differenza di upstream, che deve
salvare i valori delle variabili non deterministiche perché `Math.random`
non è seminato per domanda (storage.js:445, vedi §3 punto 8) — **lo stato
non ha bisogno di persistere i valori delle variabili**: basta il seed.
Proposta:

```ts
interface QuestionState {
  seed: string;
  answered: boolean;
  submitted: number;
  adviceDisplayed: boolean;
  revealed: boolean;
  score: number;
  marks: number;
  parts: PartState[];
}

interface PartState {
  path: string;               // "p0", "p0g1", "p0s0"
  answered: boolean;
  score: number;
  marks: number;
  answer?: Answer;            // ultima risposta inviata, tipizzata per tipo di parte (vedi API pubblica)
  stepsShown?: boolean;
  gaps?: PartState[];
  steps?: PartState[];
}
```

`restoreQuestion(json, state, opts)` = `loadQuestion(json, {seed: state.seed, ...opts})`
poi, per ogni `PartState` con `answered`, richiama `part.submit(answer)` (che
per contratto dell'API pubblica è idempotente) per ricostruire
`credit`/`feedback`, infine applica i flag di livello domanda
(`revealed`⇒`revealAnswer()`, `adviceDisplayed`⇒`getAdvice()`). Questo è
**più semplice** del meccanismo upstream (che deve gestire promesse di
sottomissione in ordine per via delle sostituzioni di variabile adattive,
question.js:985-1049) perché nel port sincrono non ci sono `Promise` da
sequenziare — ma l'ordine di `submit()` per le parti con
`variableReplacements` (adaptive marking) va comunque rispettato: prima le
parti "sorgente", poi quelle che le referenziano (stesso ordine imposto
upstream da `part_submit_promises`/`replacement_promises`, question.js:1004-1033).
Va deciso se conservare comunque uno snapshot delle variabili generate (solo
per il confronto nel differential harness, non per la correttezza) — vedi §10.

## 10. Domande aperte

1. **`partsMode:'explore'` è in ambito?** La spec non lo esclude
   esplicitamente nei non-obiettivi (che parlano di "esame", non di
   "domanda in modalità explore"), ma nemmeno lo include nella decisione 3
   (che elenca solo i *tipi di parte*). `getObjective`/`getPenalty`
   (question.js:1215-1235), il ramo `'explore'` di `calculateScore`/`validate`
   (1363-1401/1303-1315) e `addExtraPart`/`createExtraPartFromJSON`
   (426-458/673-687) sono una feature strutturale della domanda, non di una
   parte — se esclusa, va tolta anche dal formato JSON supportato
   (`partsMode`, `objectives`, `penalties`, `maxMarks`, `showAllParts`).
2. **`preamble.js` (JS arbitrario)**: non supportato per default per motivi
   di sicurezza (§8) — ma se il corpus SAVINT (creato dall'editor
   sotto-progetto 5) non lo usa mai, si può anche decidere di non
   implementarlo nemmeno come "errore esplicito" e lasciare che il
   validatore dell'editor lo impedisca a monte. Da verificare sul corpus.
3. **`extensions`/funzioni JS custom (`language:'javascript'`)**: idem,
   dipende se il corpus le usa. Le funzioni JME custom (`language:'jme'`,
   non-`promise`) sono invece semplici da portare (compilano ed eseguono
   come qualunque altra espressione JME).
4. **Snapshot delle variabili in `QuestionState`**: solo per debug/harness
   differenziale, o mai? Se mai, il differential harness deve rigenerare
   dal seed e confrontare `unwrappedVariables` (question.js:880-884) invece
   di leggerle dallo stato salvato.
5. **Dimensione di `tests/locales.js` nell'oracolo** (11.057 righe, tutte le
   ~19 lingue): si può ridurre copiando solo `en-gb`/`it-it` per
   velocizzare il caricamento nei test, dato che `Numbas.locale.resources`
   è letto interamente da `localisation-resources` (localisation.js:1) — va
   verificato che nessun altro modulo iteri su tutte le lingue disponibili
   assumendone la presenza.
6. **`jme.compile` sulla stringa vuota per `functions`/`rulesets` vuoti**:
   comportamento già chiaro (§8), ma da confermare con un test
   differenziale dedicato appena `variables/` (task 6) è portato.
7. **Versione di `seedrandom`** da fissare nel `package.json` del port
   (decisione 5 della spec dice "stesso ARC4 del vendor upstream") —
   verificare la versione esatta vendorizzata in
   `runtime/scripts/seedrandom/seedrandom.js` (non letto in questo
   inventario, fuori ambito ma rilevante per la parità del seed).
