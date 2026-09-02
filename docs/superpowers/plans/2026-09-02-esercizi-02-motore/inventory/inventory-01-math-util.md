# Inventario di porting — `util.js` + `math.js` (Numbas runtime)

Sorgente: clone upstream `numbas/Numbas`, commit `0f0ea33`, file:
`runtime/scripts/util.js` (1778 righe) e `runtime/scripts/math.js` (4077 righe).
Letti per intero riga per riga; tutti i numeri di riga sotto sono verificati con
`grep -n`/lettura diretta sul commit indicato.

Convenzione tipi: dove il JSDoc upstream usa `{number}`, il file stesso avverte
(math.js:91-92) che il tipo copre in realtà `number | complex` (oggetto
`{re,im,complex:true}`), e in molti punti anche `bigint` o `Decimal`. Nella
colonna "firma" uso `number` come nell'originale ma la colonna "note" segnala
dove il ramo `bigint`/`complex`/`Decimal` è effettivo, così chi porta il codice
sa dove serve un tipo unione o un overload.

## 1. Scopo dei file

**`util.js`** — funzioni di convenienza generiche (non specifiche di JME):
confronto/uguaglianza di token JME, parsing e formattazione di numeri in stili
di notazione internazionali (inglese, europeo, svizzero, indiano, scientifico),
manipolazione di stringhe (padding, slug, escaping HTML), combinatoria su
liste (prodotto cartesiano, combinazioni, permutazioni, zip), utility per i
nomi delle parti (`nicePartName`) e alcuni shim/polyfill su prototipi nativi.
Dipende da `math` (per `niceRealNumber`, `precround`, `unscientific`), da
`parsel` (parsing di selettori CSS, solo per temi) e in un punto da `Numbas.jme`.

**`math.js`** — cuore matematico del runtime: aritmetica che tratta in modo
uniforme numeri reali, complessi (oggetti letterali `{re,im,complex:true}`) e
`bigint`; arrotondamento e formattazione (`precround`, `siground`,
`niceNumber`, `niceDecimal`); generazione di numeri casuali con `Math.random`
(non seminato); teoria dei numeri (fattoriali, gcd/lcm, fattorizzazione,
partizioni); una classe `Fraction` a precisione arbitraria (basata su
`BigInt`); una classe `ComplexDecimal` basata su `decimal.js`; i namespace
`Numbas.vectormath`, `Numbas.matrixmath`, `Numbas.setmath`; e le classi
`RealInterval`/`RealIntervalUnion` per gli intervalli reali (usate da
`resultsequal`/pattern-matching). Configura `Decimal.set(...)` come effetto
collaterale al caricamento del modulo (math.js:23-28).

## 2. Superficie pubblica

### 2.1 `util.js` — `Numbas.util`

#### Namespace/OOP e copie

| nome | firma (parametri → ritorno) | riga | descrizione | note |
|---|---|---|---|---|
| `document_ready` | `(fn: Function) → void` | 21 | esegue `fn` quando `document.readyState=='complete'` | **DOM puro** (`document`), fuori ambito |
| `extend` | `(a: Function, b: Function, extendMethods: boolean) → Function` | 42 | crea un costruttore che chiama `a` poi `b`, unendo i prototipi | usato per "ereditarietà" stile pre-ES6 |
| `extend_object` | `(destination: object, ...sources: object[]) → object` | 71 | merge shallow, salta valori `undefined` (sostituto di `jQuery.extend`) | usa `arguments`, `Object.hasOwn` |
| `deep_extend_object` | `(destination: object, ...sources: object[]) → object` | 86 | merge ricorsivo per chiavi con valore oggetto in comune | ricorsivo, usa `arguments` |
| `copyarray` | `(arr: Array, deep: boolean) → Array` | 111 | clona un array; se `deep`, clona anche gli elementi | chiama `copyobj` |
| `copyobj` | `(obj: object, deep: boolean) → object` | 126 | clona un oggetto/array in base a `typeof`; ricorsivo se `deep` | switch su `typeof`, usa `.length!==undefined` per capire se è array |
| `copyinto` | `(src: object, dest: object) → void` | 154 | copia in `dest` solo le chiavi di `src` non già presenti | muta `dest` |

#### Uguaglianza di token JME

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `eq` | `(a: jme.token, b: jme.token, scope: jme.Scope) → boolean` | 169 | uguaglianza generica fra due **token JME** (`{type,value}`), con coercizione di tipo tramite `Numbas.jme.findCompatibleType`/`castToType` | **dipende da `Numbas.jme`** (findCompatibleType, castToType) — non porta a valori JS grezzi, opera su token tipizzati |
| `equalityTests` | `Record<string, (a,b,scope)→boolean>` (dizionario) | 191 | test di uguaglianza per tipo di token: `boolean, dict, expression, function, html, keypair, list, matrix, name, nothing, number, integer, rational, decimal, op, range, set, string, vector, interval` | `expression`→`Numbas.jme.treesSame`; `name`→`Numbas.jme.normaliseName`; `matrix`→`Numbas.matrixmath.eq`; `set`→`Numbas.setmath.eq`; `vector`→`Numbas.vectormath.eq`; `html`→confronta `outerHTML` (**DOM**) |
| `neq` | `(a: jme.token, b: jme.token, scope: jme.Scope) → boolean` | 281 | negazione di `eq` | |
| `objects_equal` | `(a: any, b: any) → boolean` | 295 | uguaglianza profonda di valori JS grezzi (non token) | ricorsivo, gestisce array e oggetti semplici |
| `arraysEqual` | `(a: Array, b: Array) → boolean` | 324 | array uguali elemento per elemento (ricorsivo su array annidati) | usa `objects_equal` |
| `except` | `(list: jme.types.TList, exclude: jme.types.TList, scope: jme.Scope) → Array` | 354 | filtra da `list` i valori presenti in `exclude`, per uguaglianza token | dipende da `eq` |
| `distinct` | `(list: Array, scope: jme.Scope) → Array` | 371 | rimuove i duplicati (per uguaglianza token) preservando l'ordine | O(n²), dipende da `eq` |
| `contains` | `(list: Array, value: jme.token, scope: jme.Scope) → boolean` | 397 | `value` è nella lista (per uguaglianza token)? | dipende da `eq` |

#### Predicati di tipo/parsing numerico

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `isInt` | `(i: any) → boolean` | 410 | `typeof i=='bigint'` oppure `parseInt(i,10)==i` | coercizione debole (`==`) |
| `isFloat` | `(f: any) → boolean` | 418 | `parseFloat(f)==f` | coercizione debole |
| `isFraction` | `(s: string) → boolean` | 426 | verifica il pattern `re_fraction` | |
| `isNumber` | `(n: number\|string, allowFractions: boolean, styles: string\|string[], strictStyle: boolean) → boolean` | 441 | è un numero valido, "infinity" o (se richiesto) una frazione, opzionalmente secondo uno stile di notazione | chiama `cleanNumber` |
| `wrapListIndex` | `(n: number, size: number) → number` | 464 | indice negativo → `n+size` (stile Python) | |
| `isBool` | `(b: any) → boolean` | 475 | booleano letterale o stringa `false/true/yes/no` (case-insensitive) | |
| `isNonemptyHTML` | `(html: string) → boolean` | 490 | il testo estratto da un frammento HTML è non vuoto (o contiene `img/iframe/object`) | **ha un ramo DOM** (`document.createElement`) e un ramo regex senza DOM (riga 499) — per il porting usare solo il ramo regex |
| `parseBool` | `(b: any) → boolean` | 507 | `true`/`'true'`/`'yes'` → `true`, resto → `false` | |
| `re_fraction` | `RegExp` (costante) | 518 | `/^\s*(-?)\s*(\d+)\s*\/\s*(-?)\s*(\d+)\s*/` | |

#### Formattazione/parsing di numeri in stili internazionali

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `standardNumberFormatter` | `(thousands: string, decimal_mark: string, separate_decimal?: boolean) → (integer: string, decimal: string)=>string` | 528 | fabbrica di formattatori "migliaia+decimali" | funzione di ordine superiore, usata per costruire `numberNotationStyles` |
| `matchNotationStyle` | `(s: string, styles: string\|string[], strictStyle?: boolean, mustMatchAll?: boolean) → {matched: string, cleaned: string}` | 556 | trova quale stile (tra quelli passati) combacia meglio con l'inizio di `s` | logica di "best match" per lunghezza combaciata |
| `cleanNumber` | `(s: string, styles?: string\|string[], strictStyle?: boolean) → string` | 622 | rimuove punteggiatura di stile e riscrive con `.` come separatore decimale | wrapper su `matchNotationStyle` |
| `formatNumberNotation` | `(s: string, style_name: string, syntax?: 'plain'\|'latex') → string` | 634 | formatta una stringa "pulita" (`-123.45`) nello stile scelto | throw se `syntax` non esiste per lo stile |
| `parseDecimal` | `(s: string, allowFractions: boolean, styles?: string\|string[], strictStyle?: boolean) → Decimal` | 658 | come `parseNumber` ma restituisce un `Decimal` | **richiede `Decimal`** (da math.js) |
| `parseNumber` | `(s: string, allowFractions: boolean, styles?: string\|string[], strictStyle?: boolean) → number` | 682 | parsa un numero (anche "infinity"/frazione) secondo lo stile | |
| `parseInt` | `(s: string, base: number) → number` | 707 | parseInt in base arbitraria, ma **NaN se ci sono caratteri non validi** (a differenza del built-in) | ombreggia il nome `parseInt` globale all'interno del modulo |
| `parseFraction` | `(s: string, mustMatchAll?: boolean) → {numerator:number, denominator:number}\|undefined` | 731 | interi o frazioni `a/b` | |
| `re_jme_string` | `RegExp` (costante) | 1449 (assegnato fuori dal literal, riga 1449) | riconosce token stringa JME (`"…"`, `'…'`, `"""…"""`, `'''…'''`) | usato da `splitbrackets` |
| `numberNotationStyles` | `Record<string, {re?: RegExp, clean?: Function, format: {plain: Function, latex: Function}}>` | 1460 | tabella stili: `plain, en, si-en, si-fr, eu, plain-eu, ch, in, scientific` | vedi §6 "Punti delicati" per le regex; `scientific.clean` chiama `Numbas.math.unscientific` |
| `contentsplitbrackets` | `(txt: string, re_end?: RegExp) → string[]` | 1619 (assegnata come `util.contentsplitbrackets =`, fuori dal literal) | divide un testo per delimitatori TeX (`$…$`, `\(…\)`, `\[…\]`, `\begin{env}…\end{env}`) | usa variabili di modulo private `endDelimiters` (1599) e `re_startMaths` (1605), non esposte su `util` |

#### Stringhe

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `slugify` | `(str: string) → string` | 749 | tiene solo lettere/cifre/trattini, collassa spazi in `-` | |
| `lpad` | `(s: string, n: number, p: string) → string` | 764 | padding a sinistra fino a lunghezza `n` col carattere `p` | |
| `rpad` | `(s: string, n: number, p: string) → string` | 779 | padding a destra | |
| `formatString` | `(str: string, ...values: string[]) → string` | 796 | sostituisce `%s` in sequenza con gli argomenti extra | |
| `formatTime` | `(t: Date) → string` | 807 | `"Www Mmm dd yyyy HH:MM:SS"` | non risulta usata altrove nel runtime |
| `currency` | `(n: number, prefix: string, suffix: string) → string` | 824 | formatta un importo (es. `currency(5.3,'£','p')` → `'£5.30'`) con regole di arrotondamento su centesimi | chiama `Numbas.math.niceRealNumber` |
| `separateThousands` | `(n: number\|string, separator: string) → string` | 854 | inserisce `separator` ogni 3 cifre nella parte intera | chiama `Numbas.math.niceRealNumber` se `n` è un `number` |
| `unPercent` | `(s: string) → number` | 888 | rimuove `%` e divide per 100 | |
| `pluralise` | `(n: number, singular: string, plural: string) → string` | 900 | `n∈{-1,1}` (dopo arrotondamento a 10 dp) → singolare, altrimenti plurale | chiama `Numbas.math.precround` |
| `capitalise` | `(str: string) → string` | 913 | maiuscola sulla prima lettera minuscola | |
| `splitbrackets` | `(str: string, lb: string, rb: string, nestlb?: string, nestrb?: string) → string[]` | 932 | divide una stringa per parentesi bilanciate, sostituendo le parentesi annidate con `nestlb`/`nestrb`; ignora le parentesi dentro stringhe JME | usa `re_jme_string`; automa a stati esplicito con `bits`/`depth` |
| `escapeHTML` | `(str: string) → string` | 1022 | escape di `& < > " '` | |
| `sortBy` | `(props: string\|string[]) → (a,b)=>number` | 1036 | fabbrica un comparatore che ordina per una o più proprietà | |
| `hashCode` | `(str: string) → string` | 1060 | hash stile `String.hashCode` di Java, con prefisso `'0'`/`'1'` per segno | |
| `caselessCompare` | `(a: string, b: string) → boolean` | 1392 | confronto case-insensitive con `localeCompare(..., {sensitivity:'accent'})` | non risulta usata altrove nel runtime |

#### Liste/combinatoria

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `product` | `(lists: Array[]) → Array[]` | 1082 | prodotto cartesiano di N liste | throw se un elemento non è array; ritorna `[]` se una lista è vuota |
| `cartesian_power` | `(l: Array, n: number) → Array[]` | 1129 | prodotto cartesiano di `l` con se stessa `n` volte | |
| `zip` | `(lists: Array[]) → Array[]` | 1150 | trasposizione tipo Python `zip`, si ferma alla lista più corta | |
| `combinations` | `(list: Array, r: number) → Array[]` | 1176 | combinazioni di `r` elementi senza ripetizione | **limite hardcoded**: si ferma dopo 1000 iterazioni (`steps<1000`), quindi può restituire un risultato incompleto per combinatorie grandi |
| `combinations_with_replacement` | `(list: Array, r: number) → Array[]` | 1210 | come sopra ma con ripetizione | nessun limite di iterazioni (asimmetria rispetto a `combinations`) |
| `permutations` | `(list: Array, r: number) → Array[]` | 1244 | tutte le permutazioni di `r` elementi scelti da `list` (algoritmo ispirato a Python `itertools`) | throw se `r>n` |
| `letterOrdinal` | `(n: number) → string` | 1293 | `0,1,2,...`→`a,b,...,z,aa,ab,...` | |

#### Utility "parte" e varie

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `nicePartName` | `(path: string) → string` | 1315 | nome leggibile di una parte da un path tipo `p0g1a2` | **usa `R()`** (i18next: chiavi `'part'`, `'step'`, `'gap'`, `'alternative'`); usato da `part.js` (in ambito, task 8) |
| `debounce` | `(frequency: number) → (fn: Function)=>void` | 1336 | fabbrica un debounce basato su `setTimeout`/`Date` | usato solo da `part.js` per l'autosave UI; non essenziale al motore puro |
| `b64encode` | `(arrayBuffer: ArrayBuffer) → string` | 1365 | base64 via `btoa` | usa `btoa` (globale browser/Node≥18); non risulta usata altrove nel runtime incluso |
| `b64decode` | `(encoded: string) → ArrayBuffer` | 1374 | base64 → `ArrayBuffer` via `atob` | usa `atob`; non risulta usata altrove |
| `prefix_css_selectors` | `(style: Element, prefix: string) → void` | 1401 | riscrive un `<style>` aggiungendo un prefisso a ogni selettore, usando `parsel` | **DOM puro** (`CSSStyleRule`, `style.sheet`), non chiamata da nessun altro file in `runtime/scripts/` — solo temi |

#### Effetti collaterali a livello di modulo (non sulla namespace `util`)

| voce | riga | descrizione | note |
|---|---|---|---|
| `Array.prototype.indexOf` (polyfill condizionale) | 1673-1682 | shim IE-era | irrilevante per Node/browser moderni, **da non portare** |
| `String.prototype.contains` | 1684-1688 | shim | idem |
| `Array.prototype.contains` | 1689-1693 | shim | idem |
| `Array.prototype.merge` | 1695-1725 | merge+dedup con sort, muta ricevente tramite `concat`+`sort`+`splice` | patch di prototipo nativo — **da non portare** nella forma attuale (mai chiamato altrove nel runtime incluso: nessun match per `.merge(` su `Array.prototype` fuori da questo file) |
| `Object.values`/`Object.entries` (polyfill IIFE) | 1727-1748 | shim ES2017 | irrilevante oggi, **da non portare** |
| `Date.prototype.toISOString` (polyfill condizionale) | 1750-1776 | shim | irrilevante oggi, **da non portare** |

### 2.2 `math.js` — `Numbas.math`, `Numbas.vectormath`, `Numbas.matrixmath`, `Numbas.setmath`

Costante di modulo non esposta: `MAX_FLOAT_PRECISION = 17` (riga 21) — limite
massimo di cifre decimali usato da `precround`/`niceRealNumber`.
Effetto collaterale al caricamento: `Decimal.set({precision:40, modulo:
Decimal.EUCLID, toExpPos:1000, toExpNeg:-1000})` (righe 23-28) — muta la
configurazione **globale** della classe `Decimal` importata.

#### Numeri: helper e conversioni

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `ensure_bigint` | `(num: number\|string\|bigint) → bigint` | 71 (var), esposta come `math.ensure_bigint` a 81 | converte a `BigInt`, con fallback `BigInt(Math.round(num))` se la conversione diretta fallisce (es. da float non intero) | funzione di modulo, non solo campo namespace |
| `re_scientificNumber` | `RegExp` (costante) | 88 | riconosce numeri in notazione scientifica | |
| `complex` | `(re: number, im: number) → number\|complex` | 97 | costruisce `{re,im,complex:true}`; se `im` è falsy ritorna semplicemente `re` (**un "complesso" con parte immaginaria 0 è quindi indistinguibile da un numero reale in molti punti**) | vedi §6 |
| `complexToString` | `(this: complex) → string` | 111 | `toString` installato su ogni oggetto complesso, delega a `niceNumber` | assegnato come proprietà `toString` di ogni valore complesso creato da `complex()` |
| `negate` | `(n: number) → number` | 119 | `-n`, gestisce il ramo complesso | |
| `conjugate` | `(n: number) → number` | 131 | coniugato complesso (`n` se reale) | |
| `add` | `(a: number, b: number) → number` | 144 | somma con dispatch su `.complex` | |
| `sub` | `(a: number, b: number) → number` | 165 | sottrazione | |
| `mul` | `(a: number, b: number) → number` | 186 | moltiplicazione (incl. complesso×complesso) | |
| `div` | `(a: number, b: number) → number` | 207 | divisione (incl. complesso, con normalizzazione `q=b.re²+b.im²`) | divisione per zero complesso non gestita esplicitamente → `NaN`/`Infinity` impliciti |
| `pow` | `(a: number, b: number) → number` | 230 | elevamento a potenza: ramo `bigint**bigint`, ramo binomiale per `complex^intPiccolo`, ramo generale complesso via `exp/log`, caso speciale `a==Math.E` | logica più intricata del file: 4 rami distinti, vedi §6 |
| `binomialCoefficients` | `(n: number) → number[]` | 283 | riga n-esima del triangolo di Pascal | usata da `pow` per potenze intere piccole di complessi |
| `mod` | `(a: number, b: number) → number` | 297 | modulo sempre positivo; `NaN` se `b===0n`; `a` se `b==Infinity` | attenzione al branch `b===0n` (solo bigint), non copre `b===0` float — vedi §6 |
| `root` | `(a: number, b: number) → number` | 313 | radice b-esima, con caso speciale per radici dispari di reali negativi | dipende da `div`/`pow` di modulo (variabili locali `div`) |
| `sqrt` | `(n: number) → number` | 324 | radice quadrata (complessa se `n<0`) | |
| `log` | `(n: number) → number` | 339 | logaritmo naturale (complesso se `n<0`) | |
| `exp` | `(n: number) → number` | 355 | `e^n` | |
| `abs` | `(n: number) → number` | 367 | modulo/valore assoluto; ramo `bigint` dedicato | |
| `arg` | `(n: number) → number` | 387 | argomento (fase) di un complesso | |
| `re` | `(n: number) → number` | 399 | parte reale | |
| `im` | `(n: number) → number` | 411 | parte immaginaria (0 se reale) | |

#### Confronti e ordinamento

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `positive` | `(n: number) → boolean` | 423 | reale e `>0` | |
| `negative` | `(n: number) → boolean` | 431 | reale e `<0` | |
| `nonnegative` | `(n: number) → boolean` | 439 | `!negative(n)` | |
| `lt` | `(a: number, b: number) → boolean` | 449 | throw su complessi | |
| `gt` | `(a: number, b: number) → boolean` | 462 | throw su complessi | |
| `leq` | `(a: number, b: number) → boolean` | 475 | throw su complessi | |
| `geq` | `(a: number, b: number) → boolean` | 488 | throw su complessi | |
| `eq` | `(a: number, b: number) → boolean` | 500 | uguaglianza numerica; per reali usa `==` oppure `isclose` (tranne se entrambi `bigint`); `NaN==NaN` è **vero** qui | vedi §6, comportamento non-IEEE voluto e testato |
| `isclose` | `(a: number, b: number, rel_tol=1e-15, abs_tol=1e-15) → boolean` | 527 | uguaglianza a tolleranza (relativa+assoluta), gestisce ±Infinity | algoritmo alla `math.isclose` di Python |
| `is_scalar_multiple` | `(u: number[], v: number[], rel_tol?, abs_tol?) → boolean` | 553 | `u` è multiplo scalare di `v`? | testato direttamente (non via JME) |
| `max` | `(a: number, b: number) → number` | 598 | throw su complessi; ramo bigint | |
| `listmax` | `(numbers: number[], maxfn=math.max) → number\|undefined` | 614 | riduzione con `maxfn` | |
| `min` | `(a: number, b: number) → number` | 632 | come `max` | |
| `listmin` | `(numbers: number[], minfn=math.min) → number\|undefined` | 648 | riduzione | |
| `neq` | `(a: number, b: number) → boolean` | 666 | `!eq(a,b)` | |

#### Precisione, arrotondamento, formattazione

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `piDegree` | `(n: number, allowFractions=true) → number` | 676 | il più grande `k` tale che `n=a·π^k` con `a` intero, o `1` per `π/k` | usato da `niceNumber` per mostrare `pi`/`pi^2`; soglie euristiche `1e4`/`1e-8`/`1e-10` |
| `addDigits` | `(n: string, digits: number) → string` | 705 | aggiunge `digits` zeri dopo il punto decimale (gestisce notazione `e`) | manipolazione di stringhe, non aritmetica |
| `toExponential` | `(n: number) → string` | 726 | notazione esponenziale; ramo `bigint` fatto a mano (`Number.prototype.toExponential` non esiste per bigint) | |
| `niceRealNumber` | `(n: number, options?: niceNumber_settings) → string` | 760 | formatta un reale (non complesso) secondo `precisionType` (`sigfig`/`dp`), `style`, con fallback a 10dp se non specificato | dipende da `Numbas.locale.default_number_notation[0]` (**globale da `localisation.js`**, fuori ambito) quando `options.style` è assente |
| `niceNumber` | `(n: number, options?: niceNumber_settings) → string` | 830 | come sopra ma gestisce anche i complessi e i multipli di π/costante-cerchio | chiama `niceRealNumber` e `piDegree` |
| `niceComplexDecimal` | `(n: ComplexDecimal, options?) → string` | 910 | formattazione di `ComplexDecimal` | chiama `niceDecimal` |
| `niceDecimal` | `(n: Decimal, options?) → string` | 940 | formattazione di `Decimal` (`toFixed`/`toPrecision`/`toExponential`/`toString` a seconda di `precisionType`) | dipende da `Numbas.locale.default_number_notation[0]` come `niceRealNumber` |
| `numberToDecimal` | `(x: number) → Decimal` | 981 | converte un JS number a `Decimal`; casi speciali `Math.PI`→`Decimal.acos(-1)`, `Math.E`→`Decimal(1).exp()` per maggiore precisione | ramo complesso → `ComplexDecimal` |
| `precround` | `(a: number, b: number) → number` | 1160 | arrotonda a `b` cifre decimali con correzioni ad hoc per errori di floating point (soglie `1e-9`) | **funzione più delicata del file**, vedi §6; throw se `b` è complesso |
| `parseScientific` | `(str: string, parse=true) → {significand, exponent}` | 1207 | estrae significando/esponente da una stringa in notazione scientifica | |
| `unscientific` | `(str: string) → string` | 1225 | converte una stringa in notazione scientifica in notazione posizionale piena (`1.23e-5`→`0.0000123`) | manipolazione di stringhe di cifre, niente floating point |
| `siground` | `(a: number, b: number) → number` | 1270 | arrotonda a `b` cifre significative (`toPrecision`) | throw se `b` è complesso; ramo complesso ricorsivo |
| `countDP` | `(n: number\|string) → number` | 1288 | conta le cifre decimali nella rappresentazione stringa | gestisce notazione `e` |
| `countSigFigs` | `(n: number\|string, max?: boolean) → number` | 1307 | conta le cifre significative; `max=true` è più permissivo sugli zeri finali di interi | 2 regex complesse leggermente diverse per `max` true/false |
| `toGivenPrecision` | `(n: number\|string, precisionType: 'dp'\|'sigfig'\|'none', precision: number, strictPrecision: boolean) → boolean` | 1329 | `n` è già scritto con la precisione richiesta? | caso speciale per numeri come `2070` (3 o 4 sig.fig.) |
| `toGivenPrecisionScientific` | `(n: number\|string, precisionType, precision) → boolean` | 1366 (sintassi ES6 shorthand, non `function:`) | come sopra ma per notazione scientifica (guarda solo il significando) | |
| `withinTolerance` | `(a: number, b: number, tolerance: number) → boolean` | 1384 | `a∈[b-tolerance, b+tolerance]`; se `tolerance==0` usa `eq` | ricorsivo sul ramo complesso |

#### Casuale (usa `Math.random` — punto chiave per l'iniezione)

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `randomint` | `(n: number) → number` | 1001 | intero uniforme in `[0,n-1]` | **usa `Math.random()` direttamente** |
| `deal` | `(N: number) → number[]` | 1009 | permutazione casuale di `[0..N-1]` (algoritmo Fisher-Yates via `randomint`) | dipende da `randomint` → da `Math.random` |
| `shuffle` | `(list: Array) → Array` | 1022 | mescola una lista (nuova copia) | dipende da `deal` |
| `inverse` | `(l: number[]) → number[]` | 1037 | inversa di una permutazione | pura, non casuale nonostante il contesto |
| `reorder` | `(list: Array, order: number[]) → Array` | 1052 | riordina `list` secondo `order` | pura |
| `shuffle_together` | `(lists: Array[]) → Array[]` | 1064 | applica la stessa permutazione casuale a più liste della stessa lunghezza | dipende da `deal` |
| `random_integer_partition` | `(n: number, k: number) → number[]` | 1086 | partizione casuale di `n` in `k` parti positive | **usa `Math.random()`** (via `randomint`) |
| `integer_partitions` | `(n: number, k: number) → number[][]` | 1123 | **tutte** le partizioni ordinate di `n` in `k` parti (non casuale) | ricorsivo, nome simile a `random_integer_partition` ma deterministico — occhio a non confonderle nel porting |
| `range` | `(n: number) → number[]` | 1146 | `[0,1,...,n-1]` | pura |
| `randomrange` | `(min: number, max: number) → number` | 1817 | reale uniforme in `[min,max]` | **usa `Math.random()` direttamente** |
| `random` | `(range: range) → number` | 1830 | valore casuale in un intervallo `[min,max,step]`; se `step==0` delega a `randomrange` | dipende da `randomrange`/`rangeSize` |
| `except` (su range) | `(range: number[], exclude: number[]) → number[]` | 1845 | filtra `range` togliendo i valori di `exclude` (per `math.eq`) | **nome duplicato**: esiste sia `util.except` (liste di token) sia `math.except` (liste di numeri) — namespace diversi ma stesso nome, attenzione nel porting a moduli separati |
| `choose` | `(selection: Array) → any` | 1863 | elemento casuale della lista | **usa `Math.random()`** (via `randomrange`); throw se lista vuota |
| `weighted_random` | `(list: Array<[any, number]>) → any` | 1876 | scelta pesata; throw se somma pesi `<=0` | **usa `Math.random()` direttamente** |

#### Trigonometria/esponenziali/iperboliche

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `factorial` | `(n: number) → bigint\|number` | 1403 | `n!` esatto come `bigint` per interi `≥0`; altrimenti `Gamma(n+1)` | ramo intero e ramo gamma hanno **tipi di ritorno diversi** (`bigint` vs `number`/`complex`) |
| `gamma` | `(n: number) → number` | 1424 | approssimazione di Lanczos (g=7, 9 coefficienti), con riflessione per `Re(n)<0.5` | costanti magiche hardcoded; ricorsivo (riflessione) |
| `log10` | `(n: number) → number` | 1454 | `log(n)*Math.LOG10E` | |
| `log_base` | `(n: number, b: number) → number` | 1463 | `log(n)/log(b)` | |
| `radians` | `(x: number) → number` | 1472 | gradi→radianti | |
| `degrees` | `(x: number) → number` | 1481 | radianti→gradi | |
| `cos`,`sin`,`tan` | `(x: number) → number` | 1489, 1501, 1513 | trig. reale/complessa | |
| `cosec`,`sec`,`cot` | `(x: number) → number` | 1525, 1533, 1541 | reciproche di sin/cos/tan | |
| `arcsin`,`arccos`,`arctan` | `(x: number) → number` | 1549, 1564, 1582 | inverse trig., con ramo complesso per `|x|>1` | `arccos` normalizza il segno del risultato (righe 1568-1571) |
| `atan2` | `(y: number, x: number) → number` | 1597 | usa solo le parti reali se gli argomenti sono complessi | comportamento "silenzioso" sul ramo complesso — vedi §6 |
| `sinh`,`cosh`,`tanh` | `(x: number) → number` | 1611, 1623, 1635 | iperboliche | |
| `cosech`,`sech`,`coth` | `(x: number) → number` | 1643, 1651, 1659 | reciproche iperboliche | |
| `arcsinh`,`arccosh`,`arctanh` | `(x: number) → number` | 1667, 1679, 1691 | inverse iperboliche | |

#### Arrotondamento a interi/troncamento

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `ceil` | `(x: number) → number` | 1705 | complesso: arrotonda re/im indipendentemente | |
| `floor` | `(x: number) → number` | 1719 | idem | |
| `round` | `(x: number) → number` | 1733 | idem (usa `Math.round`, quindi `.5`→arrotonda verso `+∞`) | |
| `toNearest` | `(x: number, a: number) → number` | 1747 | arrotonda al multiplo più vicino di `a`; `NaN` se `a==0`; throw se `a` complesso | |
| `trunc` | `(x: number, p=0) → number` | 1769 | tronca (non arrotonda) a `p` cifre decimali | |
| `fract` | `(x: number) → number` | 1786 | parte frazionaria (`x - trunc(x)`) | |
| `sign` | `(x: number) → number` | 1797 | `-1,0,1`; sul complesso, segno di re/im indipendentemente | |

#### Teoria dei numeri / combinatoria

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `productRange` | `(a: number, b: number) → number\|bigint` | 1905 | prodotto degli interi in `[a,b]` (`a!/b!` circa) | ritorna `bigint` solo se **entrambi** gli argomenti erano già `bigint` |
| `combinations` (nCk) | `(n: number, k: number) → number\|bigint` | 1926 | coefficiente binomiale; throw su complessi/negativi/`n<k` | usa `bigint` internamente |
| `permutations` (nPk) | `(n: number, k: number) → number\|bigint` | 1951 | disposizioni; stessi throw di `combinations` | **stesso nome** di `util.permutations` ma firma/semantica diversa (namespace diversi) |
| `divides` | `(a: number, b: number) → boolean` | 1974 | `a` divide `b`? falso se non interi o complessi | |
| `gcd` (alias `gcf`) | `(a: number, b: number) → number\|bigint` | 1987, alias riga 2354 | MCD; `1n` se non interi finiti | **bug potenziale**: `math.lcm` chiama `math.gcf(a,b)` (righe 2051, 2060) ma `gcf` è solo un alias tardivo (`math.gcf = math.gcd` a riga 2354, definito **dopo** l'oggetto letterale) — funziona per closure ma è fragile all'ordine di definizione, vedi §6 |
| `coprime` | `(a: number, b: number) → boolean` | 2020 | `gcd(a,b)==1`; `true` se non interi/complessi (comportamento permissivo, diverso da `divides`) | |
| `lcm` | `(...args: number[]) → number\|bigint` | 2033 | mcm, supporta 0, 1, 2 o N argomenti (`arguments.length`) | firma variadica reale, non solo 2 argomenti |
| `defineRange` | `(a: number, b: number) → range` | 2071 | crea `[a,b,1]` (usa solo `.re` se complessi) | |
| `rangeSteps` | `(range: range, step: number) → range` | 2086 | cambia il passo di un range | |
| `rangeToDecimalList` | `(range: range) → Decimal[]` | 2098 | enumera un range come `Decimal[]` (evita errori di accumulo in floating point) | **richiede `Decimal`**; throw se `step==0` |
| `rangeToList` | `(range: range) → number[]` | 2127 | come sopra convertito a `number[]` | delega a `rangeToDecimalList` |
| `rangeSize` | `(range: range) → number` | 2135 | numero di elementi del range | usa floating point diretto (non `Decimal`), asimmetrico rispetto a `rangeToList` |
| `rationalApproximation` | `(n: number, accuracy=15) → [number, number]` | 2151 | approssimazione razionale via frazioni continue (porting di `frap.c` di David Eppstein, pubblico dominio) | funzione interna `rat_to_limit`; loop con `limit` crescente fino a `1e11` |
| `primes` | `number[]` (costante, 999 elementi) | 2214 | i "primi 1000 numeri primi" | **contiene un baco upstream**: `7207` e `7211` sono concatenati in un unico elemento `72077211` per una virgola mancante nel sorgente → l'array ha **999 elementi invece di 1000** e non è ordinato in quel punto. Vedi §6, verificato con script Node |
| `primes_bigints` | `bigint[]` (costante, 999 elementi) | 2215 | come sopra in `bigint` | **stesso baco** (`72077211n`) |
| `divisors` | `(n: number) → bigint[]` | 2222 | tutti i divisori di `n` (incl. 1 e n) | usa `factorise`+`primes_bigints` |
| `proper_divisors` | `(n: number) → bigint[]` | 2247 | divisori propri (esclude `n`) | assume che `divisors` restituisca `n` come ultimo elemento |
| `factorise` | `(n: number) → number[]\|bigint[]` | 2257 | esponenti dei fattori primi di `n` (rispetto a `primes_bigints`, quindi **limitato ai numeri con fattori primi ≤7919**, causa il baco su 7207/7211) | tipo di ritorno dipende da `typeof n` in ingresso |
| `largest_square_factor` | `(n: number) → number\|bigint` | 2290 | il più grande fattore quadrato perfetto di `n` | dipende da `factorise` |
| `sum` | `(list: number[]) → number\|bigint` | 2313 | somma; parte da `0n` e passa a `number` al primo elemento non-bigint | tipo di ritorno dipende dal contenuto della lista, non dichiarabile staticamente in TS senza generics/union |
| `prod` | `(list: number[]) → number\|bigint` | 2336 | prodotto, stessa logica di coercizione di `sum` | |

#### Classe `Fraction` (`Numbas.math.Fraction`)

Rappresentazione a precisione arbitraria basata su due `bigint`
(`bigNumerator`/`bigDenominator`); `numerator`/`denominator` sono **getter/setter**
che convertono a/da `Number` (righe 2398-2409) — perdita di precisione silenziosa
se i bigint superano `Number.MAX_SAFE_INTEGER`.

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `Fraction` (costruttore) | `new Fraction(numerator: number\|bigint, denominator?: number\|bigint=1n)` | 2374 | normalizza segno (denominatore sempre `≥0`); se numeratore/denominatore sono `number` non interi, li raddoppia iterativamente finché non lo sono (`*=2` in loop) | il loop di raddoppio (righe 2380-2384) può non terminare per input non finiti — vedi §6 |
| `.numerator` / `.denominator` | getter/setter `number` | 2398-2409 | proxy su `bigNumerator`/`bigDenominator` | |
| `.toString` | `() → string` | 2411 | `"n"` o `"n/d"` | |
| `.toFloat` | `() → number` | 2418 | `Number(num)/Number(den)` | |
| `.toDecimal` | `() → Decimal` | 2421 | idem ma con `Decimal`, quindi via `Number` (doppia conversione, non a precisione piena) | **richiede `Decimal`** |
| `.reduce` | `() → void` (muta `this`) | 2424 | riduce ai minimi termini (gcd) | no-op se denominatore `0n` |
| `.reduced` | `() → Fraction` | 2441 | copia ridotta | |
| `.add`,`.subtract`,`.multiply`,`.divide` | `(b: Fraction\|number) → Fraction` | 2446, 2462, 2478, 2488 | operazioni aritmetiche, accettano anche `number` (convertito con `Fraction.fromFloat`) | ritornano sempre una nuova `Fraction` ridotta |
| `.reciprocal` | `() → Fraction` | 2498 | scambia num/den | |
| `.negate` | `() → Fraction` | 2501 | nega il numeratore | |
| `.equals`,`.lt`,`.gt`,`.leq`,`.geq` | `(b: Fraction) → boolean` | 2504, 2507, 2510, 2513, 2516 | confronto via sottrazione | |
| `.pow` | `(n: number\|bigint) → Fraction` | 2519 | potenza intera (anche negativa, inverte num/den) | |
| `.trunc`,`.floor`,`.ceil` | `() → number` | 2526, 2532, 2536 | arrotondamento a intero JS `number` | |
| `.fract` | `() → Fraction` | 2540 | parte frazionaria come `Fraction` | |
| `.is_zero`,`.is_one` | `() → boolean` | 2543, 2546 | | |
| `Fraction.zero`,`Fraction.one` | `Fraction` (costanti statiche) | 2550-2551 | | |
| `Fraction.fromFloat` | `(n: number) → Fraction` | 2552 | via `rationalApproximation` | |
| `Fraction.fromDecimal` | `(n: Decimal, accuracy=1e15) → Fraction` | 2556 | via `Decimal.prototype.toFraction` | **richiede `Decimal`** |
| `Fraction.common_denominator` | `(fractions: Fraction[]) → Fraction[]` | 2561 | riscrive tutte sullo stesso denominatore (mcm) | |
| `Fraction.min`,`Fraction.max` | `(...fractions: Fraction[]) → Fraction` | 2571, 2584 | variadiche via `arguments` | |

#### Classe `ComplexDecimal` (`Numbas.math.ComplexDecimal`) e `ensure_decimal`

Complesso a componenti `Decimal` (per aritmetica a precisione arbitraria su
numeri complessi, usata dal tipo JME `decimal`).

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `ensure_decimal` | `(n: number\|Decimal\|ComplexDecimal) → ComplexDecimal` | 2604 | coercizione a `ComplexDecimal` | **richiede `Decimal`** |
| `isComplexDecimal` | `(n: any) → boolean` | 2621 | `n instanceof ComplexDecimal` | |
| `ComplexDecimal` (costruttore) | `new ComplexDecimal(re: Decimal, im?: Decimal=Decimal(0))` | 2634 | | |
| `.toString` | `() → string` | 2642 | `"re"` o `"re + im i"` | |
| `.toNumber` | `() → number` | 2653 | solo parte reale (**perde la parte immaginaria senza avviso**) | vedi §6 |
| `.toComplexNumber` | `() → number\|complex` | 2657 | converte al formato "complesso JS" (`{re,im,complex:true}`) usato dal resto di `math.js` | ponte fra i due sistemi di numeri complessi del file |
| `.isReal` | `() → boolean` | 2665 | `im.isZero()` | |
| `.equals` | `(b) → boolean` | 2669 | | |
| `.lessThan`,`.lessThanOrEqualTo`,`.greaterThan`,`.greaterThanOrEqualTo` | `(b) → boolean` | 2674, 2682, 2690, 2698 | throw `math.order complex numbers` se `this` o `b` non sono reali | |
| `.negated`,`.conjugate` | `() → ComplexDecimal` | 2706, 2710 | | |
| `.plus`,`.minus`,`.times`,`.dividedBy` | `(b) → ComplexDecimal` | 2714, 2719, 2723, 2730 | `.dividedBy` per `b==0` ritorna `NaN+0i` invece di lanciare | |
| `.pow` | `(b: ComplexDecimal) → ComplexDecimal` | 2741 | casi speciali per basi/esponenti reali, altrimenti formula generale via `atan2`/`ln`/`exp` | usa `Decimal.atan2/exp/ln/cos/sin` **statici** |
| `.squareRoot` | `() → ComplexDecimal` | 2757 | | |
| `.reciprocal` | `() → ComplexDecimal` | 2771 | | |
| `.absoluteValue` | `() → ComplexDecimal` | 2776 | ritorna un `ComplexDecimal` **reale** (non uno scalare `Decimal`) | firma "sorprendente": il modulo di un complesso è ancora incapsulato in `ComplexDecimal` |
| `.argument` | `() → ComplexDecimal` | 2780 | idem, reale | |
| `.ln`,`.exp` | `() → ComplexDecimal` | 2784, 2788 | | |
| `.isInt`,`.isNaN`,`.isZero`,`.isOne` | `() → boolean` | 2793, 2797, 2801, 2805 | | |
| `.round` | `() → ComplexDecimal` | 2809 | | |
| `.toDecimalPlaces`,`.toFixed`,`.toNearest`,`.toPrecision`,`.toSignificantDigits` | `(n) → ComplexDecimal\|string` | 2813, 2817, 2828, 2832, 2843 | `.toFixed`/`.toPrecision` ritornano `string`, gli altri `ComplexDecimal` | firme miste, occhio nel tipare in TS |
| `ComplexDecimal.min`,`ComplexDecimal.max` | `(a,b) → ComplexDecimal` | 2848, 2854 | throw se non reali | |

#### `Numbas.vectormath` (namespace separato)

Convenzione: le operazioni sono "permissive" sulle dimensioni — riempiono con
zeri quando due vettori non hanno la stessa lunghezza.

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `negate` | `(v: vector) → vector` | 2880 | | |
| `add` | `(a: vector, b: vector) → vector` | 2891 | somma con zero-padding sul più corto | |
| `sub` | `(a: vector, b: vector) → vector` | 2907 | idem | |
| `mul` | `(k: number, v: vector) → vector` | 2924 | scalare × vettore | |
| `div` | `(v: vector, k: number) → vector` | 2935 | vettore / scalare | |
| `dot` | `(a: vector\|matrix, b: vector\|matrix) → number` | 2947 | prodotto scalare; accetta anche matrici `1×N`/`N×1` (le converte a vettore) | throw `vectormath.dot.matrix too big` se la matrice non è riducibile a vettore |
| `cross` | `(a: vector\|matrix, b: vector\|matrix) → vector` | 2990 | prodotto vettoriale 3D | throw se non 3D o matrice non riducibile |
| `abs_squared` | `(a: vector) → number` | 3029 | somma dei quadrati | |
| `abs` | `(a: vector) → number` | 3039 | norma euclidea | |
| `angle` | `(a: vector, b: vector) → number` | 3050 | angolo fra vettori (radianti), `0` se uno ha lunghezza 0 | |
| `eq` | `(a: vector, b: vector) → boolean` | 3066 | con zero-padding | |
| `neq` | `(a: vector, b: vector) → boolean` | 3083 | | |
| `matrixmul` | `(m: matrix, v: vector) → vector` | 3092 | matrice × vettore (colonna) | |
| `vectormatrixmul` | `(v: vector, m: matrix) → vector` | 3106 | vettore (riga) × matrice | |
| `map` | `(v: vector, fn: Function) → vector` | 3121 | | |
| `precround` | `(v: vector, dp: number) → vector` | 3130 | applica `math.precround` a ogni componente | |
| `siground` | `(v: vector, sf: number) → vector` | 3141 | idem con `math.siground` | |
| `transpose` | `(v: vector) → matrix` | 3151 | vettore → matrice riga `1×N` | imposta `.rows`/`.columns` sull'array risultato (vedi §6) |
| `toMatrix` | `(v: vector) → matrix` | 3162 | vettore → matrice colonna `N×1` | |
| `is_zero` | `(v: vector) → boolean` | 3176 | tutte le componenti `==0` | |

#### `Numbas.matrixmath` (namespace separato)

Le matrici sono `Array<Array<number>>` con proprietà extra `.rows`/`.columns`
attaccate all'array esterno (non un tipo dedicato) — vedi §6.

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `negate` | `(m: matrix) → matrix` | 3201 | | |
| `add` | `(a: matrix, b: matrix) → matrix` | 3218 | zero-padding fino a `max(rows)×max(columns)` | |
| `sub` | `(a: matrix, b: matrix) → matrix` | 3239 | idem | |
| `abs` (determinante) | `(m: matrix) → number` | 3260 | determinante, **solo fino a 3×3** | throw `matrixmath.abs.non-square`/`.too big` |
| `scalarmul` | `(k: number, m: matrix) → matrix` | 3287 | | |
| `scalardiv` | `(m: matrix, k: number) → matrix` | 3303 | | |
| `mul` | `(a: matrix, b: matrix) → matrix` | 3320 | prodotto righe×colonne, `O(n³)` | throw se dimensioni incompatibili |
| `eq` | `(a: matrix, b: matrix) → boolean` | 3346 | con zero-padding | |
| `neq` | `(a: matrix, b: matrix) → boolean` | 3367 | | |
| `id` | `(n: number) → matrix` | 3375 | matrice identità `n×n` | |
| `transpose` | `(m: matrix) → matrix` | 3392 | | |
| `sum_cells` | `(m: matrix) → number` | 3411 | somma di tutte le celle | usa `+=` diretto (non `math.add`) → **non gestisce celle complesse correttamente** |
| `numrows`,`numcolumns` | `(m: matrix) → number` | 3425, 3433 | leggono `.rows`/`.columns` | |
| `combine_vertically`,`combine_horizontally`,`combine_diagonally` | `(m1: matrix, m2: matrix) → matrix` | 3442, 3461, 3480 | compongono due matrici (con zero-padding) | testate esplicitamente anche per "non mutare l'input" |
| `map` | `(m: matrix, fn: Function) → matrix` | 3500 | | |
| `precround`,`siground` | `(m: matrix, dp\|sf: number) → matrix` | 3515, 3527 | | |
| `lu_decomposition` | `(m: matrix) → [matrix, matrix]` | 3538 | decomposizione LU (senza pivoting) | throw `matrixmath.not invertible` se un pivot è 0 — **nessun partial pivoting**, instabile numericamente su input che lo richiederebbero |
| `fraction_matrix` | `(matrix: matrix) → fraction_matrix` | 3582 | converte celle a `Fraction` | |
| `unfraction_matrix` | `(matrix: fraction_matrix) → matrix` | 3598 | converte celle a `number` (float, non `Fraction.toFloat()`) | uso diretto `c.numerator/c.denominator`, possibile perdita di precisione su numeratori grandi (vedi note su getter `Fraction`) |
| `row_echelon_form` | `(matrix: fraction_matrix) → fraction_matrix` | 3614 | riduzione a scala per righe, esatta (via `Fraction`) | muta l'array `matrix` in ingresso (swap/riscrittura righe in place) |
| `reduced_row_echelon_form` | `(matrix: fraction_matrix) → fraction_matrix` | 3682 | riduzione a scala ridotta | chiama `row_echelon_form`, poi muta ulteriormente |
| `gauss_jordan_elimination` | `(matrix: matrix) → matrix` | 3725 | `unfraction_matrix(reduced_row_echelon_form(fraction_matrix(matrix)))` | testata direttamente (non via JME) |
| `inverse` | `(m: matrix) → matrix` | 3734 | via matrice aumentata + Gauss-Jordan | throw `matrixmath.not square` |

#### `Numbas.setmath` (namespace separato)

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `contains` | `(set: set, element: any, scope: jme.Scope) → boolean` | 3767 | **dipende da `Numbas.util.eq`** (uguaglianza di token) | vedi nota di dipendenza incrociata in §3 |
| `union` | `(a: set, b: set, scope) → set` | 3782 | | |
| `intersection` | `(a: set, b: set, scope) → set` | 3798 | | |
| `eq` | `(a: set, b: set, scope) → boolean` | 3810 | uguali se stessa lunghezza e intersezione della stessa lunghezza | |
| `minus` | `(a: set, b: set, scope) → set` | 3820 | differenza insiemistica | |
| `size` | `(set: set) → number` | 3830 | | |

#### `RealInterval` / `RealIntervalUnion` (`Numbas.math.RealInterval`/`RealIntervalUnion`)

Classi ES6 (non oggetti letterali come il resto del file), usate da
`resultsequal`/pattern-matching JME. **Nessuna dipendenza da `Numbas.jme`** —
utilizzabili e testate in isolamento.

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `RealInterval` (costruttore) | `new RealInterval(start: number, end: number, includes_start: boolean, includes_end: boolean)` | 3836 | normalizza `start≤end` scambiando se serve; forza `includes_*=false` se l'estremo è infinito; collassa `includes_start=includes_end` se `start==end` | |
| `RealInterval.fromString` | `(str: string) → RealInterval` | 3858 | parsa `"[a .. b]"`/`"(a .. b)"` | throw `math.real interval.invalid string` |
| `RealInterval.singleton` | `(x: number) → RealInterval` | 3875 | intervallo `[x,x]` | |
| `.is_empty` | `() → boolean` | 3879 | | |
| `.contains` | `(x: number) → boolean` | 3883 | | |
| `.overlaps` | `(b: RealInterval) → boolean` | 3889 | | |
| `.equals` | `(b: RealInterval) → boolean` | 3893 | | |
| `.toString` | `() → string` | 3901 | | |
| `.complement` | `() → RealInterval[]` | 3918 | 0, 1 o 2 intervalli | |
| `.intersection` | `(b: RealInterval) → RealInterval` | 3933 | | |
| `.union` | `(b: RealInterval) → RealInterval[]` | 3952 | 1 o 2 intervalli | |
| `.difference` | `(b: RealInterval) → RealInterval[]` | 3978 | intersezione con il complemento di `b` | |
| `RealIntervalUnion` (costruttore) | `new RealIntervalUnion(intervals: RealInterval[])` | 3983 | filtra vuoti, ordina, fonde gli intervalli sovrapposti | logica di fusione con `splice` in loop annidato |
| `RealIntervalUnion.fromString` | `(str: string) → RealIntervalUnion` | 4027 | parsa una lista di intervalli separati da spazio | |
| `.toString` | `() → string` | 4023 | | |
| `.equals` | `(b) → boolean` | 4031 | | |
| `.union`,`.intersection`,`.difference` | `(b: RealIntervalUnion) → RealIntervalUnion` | 4035, 4039, 4059 | | |
| `.complement` | `() → RealIntervalUnion` | 4044 | | |
| `.components` | `() → RealIntervalUnion[]` | 4067 | ogni intervallo separato, incapsulato singolarmente | |

Assegnazioni finali: `Numbas.math.RealInterval = RealInterval` (4074),
`Numbas.math.RealIntervalUnion = RealIntervalUnion` (4075).

## 3. Dipendenze e globali

| dipendenza | usata in | righe (esempio) | note |
|---|---|---|---|
| `Numbas.jme.findCompatibleType`, `.castToType` | `util.js` (`eq`) | 171, 173-174 | **dipendenza in avanti verso jme.js (task 2)**: `util.eq`/`neq`/`equalityTests`/`except`/`distinct`/`contains` operano su *token JME* tipizzati, non su valori JS grezzi — semanticamente appartengono più a `jme/scope.ts` che a `math/`. Vedi §7 |
| `Numbas.jme.treesSame` | `util.js` (`equalityTests.expression`) | 214 | idem |
| `Numbas.jme.normaliseName` | `util.js` (`equalityTests.name`) | 237 | idem |
| `Numbas.jme.Scope` (tipo, in JSDoc) | `util.js`, `math.js` (setmath) | throughout | tipo di parametro passato a molte funzioni di uguaglianza, mai usato realmente all'interno di `util.js`/`math.js` (solo inoltrato) |
| `Numbas.matrixmath.eq`, `Numbas.vectormath.eq`, `Numbas.setmath.eq` | `util.js` (`equalityTests`) | 234, 267, 261 | interne a math.js, nessun problema di ordine (stesso file, ma modulo diverso — `setmath.contains` a sua volta richiama `util.eq`, vedi sotto: **dipendenza circolare `math.js` ⇄ `util.js`** dato che `util` dichiara `['base','math','parsel']` come dipendenze mentre `setmath.contains`/`.union`/... in `math.js` chiamano `Numbas.util.eq` |
| `Numbas.util.eq` | `math.js` (`setmath.contains/union/intersection/minus`) | 3769, 3785, 3800, 3822 | **dipendenza circolare**: `math.js` chiama `Numbas.util.eq`, ma `util.js` dichiara `math` come sua dipendenza (`queueScript('util',['base','math','parsel'],...)`, util.js:14) — nel runtime originale funziona perché tutto è risolto a runtime (closures), ma nel port TS va spezzato: `setmath` a valori grezzi non dovrebbe dipendere da un'uguaglianza di token JME |
| `R()` (i18next, da `localisation.js`) | `util.js` (`nicePartName`) | 1318, 1320, 1323, 1326 | funzione globale esposta da `Numbas.queueScript('localisation',...)`; sostituita dal dizionario it/en nostro (decisione 7 dello spec) |
| `Numbas.locale.default_number_notation` | `math.js` (`niceRealNumber`, `niceDecimal`) | 766, 774, 950, 954 | globale mutabile impostata da `localisation.js:54` (`Numbas.locale.set_preferred_locale(locale)`), dipende dalla lingua attiva (mappa `it-IT`→`plain-eu/eu/si-fr`, `en-GB`→`plain/en/si-en`, vedi `localisation.js:6-26`); nel port va passata come parametro esplicito con default, non letta da uno stato globale |
| `Numbas.Error` | entrambi | 68 occorrenze in math.js, 4 in util.js (contate con `grep -c`) | classe minimale (`numbas.js:82-96`) che localizza il messaggio con `R()` al momento del `throw`, tenendo `originalMessage`/`originalMessages` **non tradotti** — sono le chiavi (es. `'math.precround.complex'`) su cui i test (`raisesNumbasError`) fanno assert; vanno preservate esattamente come stringhe |
| `window`, `document` | `util.js` | 22, 25-26, 494-495 (`document_ready`, `isNonemptyHTML`) | **DOM**, fuori ambito salvo il ramo regex di fallback già presente in `isNonemptyHTML` (riga 499) |
| `CSSStyleRule`, `style.sheet` | `util.js` (`prefix_css_selectors`) | 1415, 1402 | **DOM**, fuori ambito (temi) |
| `parsel` | `util.js` (`prefix_css_selectors`) | 14 (dipendenza dichiarata), 1403, 1416, 1424 | unico uso di `parsel` nel file: `tokenize`/`stringify` di selettori CSS — **serve solo per `prefix_css_selectors`, cioè fuori ambito**; lo spec (§Contesto) chiedeva di verificarlo, risposta: non serve al motore |
| `Decimal` (globale, da `decimal/decimal.js`) | `math.js` | 23-28 e ~35 altri punti (`niceDecimal`, `numberToDecimal`, `rangeToDecimalList`, `Fraction.toDecimal/fromDecimal`, `ComplexDecimal`) | esposta come globale da `Numbas.queueScript('decimal',[],function(module){...})` tramite il meccanismo `RequireScript.script_loaded` (`numbas.js:139-157`: `module.exports` → `window[x]`/`global[x]`); nel port diventa l'import `import Decimal from 'decimal.js'` (npm, stessa major 10.x — decisione 6 dello spec) |
| `Math.random` | `math.js` | 1002, 1818, 1885 (`randomint`, `randomrange`, `weighted_random`) — più tutte le funzioni che le chiamano (`deal`→`shuffle`/`shuffle_together`, `random_integer_partition`, `random`, `choose`) | **unico punto da rendere iniettabile** per la decisione 5 dello spec (generatore seminato per tentativo); nessun uso di `seedrandom` in questi due file (confermato con grep — `seedrandom` non compare né in math.js né in util.js) |
| `Numbas.util.formatNumberNotation`, `Numbas.util.numberNotationStyles` | `math.js` (`niceRealNumber`, `niceDecimal`, dentro `numberNotationStyles.scientific.format`) | 817, 954, 970, 1591, 1594 | **dipendenza incrociata `math.js`→`util.js`** simmetrica a quella sopra (`util.js`→`math.js` per `precround`/`niceRealNumber`); i due file sono in pratica un unico modulo logico circolare nell'originale |
| `btoa`/`atob` | `util.js` (`b64encode`/`b64decode`) | 1366, 1375 | globali browser; disponibili anche in Node ≥ 16 come globalThis — non DOM in senso stretto, ma non usate da nessun altro file del runtime incluso |

## 4. Da non portare

| righe | cosa | motivo |
|---|---|---|
| util.js 21-31 (`document_ready`) | attende `document.readyState` | DOM-only, usato solo da `start-exam.js:190` (bootstrap dell'esame, fuori ambito) |
| util.js 494-497 (ramo `if(window.document)` dentro `isNonemptyHTML`) | crea un `<div>` e legge `textContent` | DOM-only; **il ramo alternativo (riga 499, regex) va tenuto** ed è sufficiente per l'uso da `jme-builtins.js:2786` |
| util.js 1401-1441 (`prefix_css_selectors`) | riscrive selettori CSS di un `<style>` con `parsel` | DOM-only (CSSOM), non chiamato da nessun modulo di dominio (solo temi); unico consumo di `parsel` nel file |
| util.js 1673-1682, 1684-1688, 1689-1693 | polyfill `Array.prototype.indexOf`/`String.prototype.contains`/`Array.prototype.contains` | shim per IE, irrilevanti su Node/ESM moderno |
| util.js 1695-1725 (`Array.prototype.merge`) | patch di prototipo nativo | mai chiamato da nessun altro file del runtime incluso; pattern "monkey-patch" da evitare in TS a prescindere |
| util.js 1727-1748 (`Object.values`/`Object.entries` polyfill) | shim ES2017 | Node/browser moderni li hanno nativamente |
| util.js 1750-1776 (`Date.prototype.toISOString` polyfill) | shim | idem |
| util.js 1365-1381 (`b64encode`/`b64decode`) | codifica base64 di `ArrayBuffer` | non usate da nessun consumatore incluso in `runtime/scripts/`; probabile uso solo da estensioni/storage non in ambito. Portare solo se un modulo futuro (fuori dai task 1-9) ne avrà bisogno |
| util.js 792-813 (`formatTime`), 1392-1394 (`caselessCompare`) | formattazione data, confronto case-insensitive | non usate altrove nel runtime incluso; basso rischio ma nessuna urgenza — includerle nel port "meccanicamente" ha costo quasi nullo, ma non sono bloccanti per nessun test noto |
| util.js 1336-1358 (`debounce`) | debounce basato su `setTimeout` | usato solo da `part.js:201` per l'autosalvataggio della UI (staged answer); è logica di interfaccia, non del motore di correzione — rimandabile al sotto-progetto player (3) insieme al resto dell'UI |
| math.js righe 23-28 (`Decimal.set(...)` globale) | configurazione statica della classe `Decimal` | da non portare *come side-effect a livello di import*: nel pacchetto TS va incapsulata (es. `Decimal.clone({...})` locale al modulo `math`) per non mutare una configurazione globale condivisa con eventuali altri usi di `decimal.js` nell'app ospite |

Non ci sono nel file blocchi XML/SCORM: `util.js`/`math.js` non toccano
`xml.js`/`SCORM_API_wrapper.js`/`scorm-storage.js` in alcun punto (nessun
`grep` positivo).

## 5. Test upstream

Header di `tests/jme/jme-tests.mjs` (righe 3-18): l'intero file è avvolto in
`Numbas.queueScript('jme_tests', ['qunit','jme','jme-rules','jme-display',
'jme-calculus','jme-notations','localisation','schedule'], function(){...})`
— **quindi l'intera suite carica jme.js e l'intera toolchain di display/rules
prima di eseguire un solo test**, anche quando il singolo `QUnit.test` chiama
solo `Numbas.math`/`Numbas.util`. Questo significa che per il task 1 non è
possibile riusare l'harness QUnit originale as-is: bisogna **estrarre** i
blocchi che non chiamano `evaluate()`/`Numbas.jme.*` e riscriverli come test
Vitest standalone, mentre i blocchi che passano per `Numbas.jme.builtinScope.evaluate(...)`
restano bloccati fino al task 2 (jme) + task 4 (jme-builtins, dove vivono le
funzioni JME `abs`, `gcd`, `precround`, `random`, `matrix`, ecc. che avvolgono
`Numbas.math.*`). Elenco helper usati: `closeEqual(assert,value,expect,message)`
e `deepCloseEqual(...)` (righe 24-38, arrotondano a 10dp con
`Numbas.math.precround` prima del confronto — **quindi anche l'harness di test
dipende da `math.precround` già funzionante**), `raisesNumbasError(assert,fn,error,message)`
(riga 19, verifica `e.originalMessage`).

| modulo QUnit | righe | `QUnit.test` | portabile ora (solo math/util)? | helper usati | dipendenze che bloccano il resto |
|---|---|---|---|---|---|
| `Subvars` | 66-139 | 7: `splitbrackets`(67), `contentsplitbrackets`(80), `subvars`(83), `findvars`(95), `findvars in HTML`(120), `util`(129) | **Parziale**: `splitbrackets`(67-79) e `util`(129-138, `separateThousands`) sono puro `Numbas.util`, portabili subito; `contentsplitbrackets`(80-82) usa `deepCloseEqual` ma solo su `util.contentsplitbrackets`, portabile; `subvars`/`findvars`/`findvars in HTML` dipendono da `Numbas.jme.subvars`/`findvars`/`Scope` e (per l'ultimo) dal **DOM** (`document.createElement`, riga 122) | `deepCloseEqual` | `subvars`/`findvars*` → jme.js (task 2) + DOM per l'ultimo test (fuori ambito comunque) |
| `Compiling` | 140-456 | ~20 (tokenizzazione JME) | **No** — tutta tokenizzazione/parsing JME (`tokenise`, `types.TNum`, ecc.) | — | jme.js task 2 in toto |
| `Evaluating` | 457-1639 | 46, tra cui `Numbas.math`(459), `Is scalar multiple`(960) portabili ora; **tutti gli altri** (`Number functions`, `Number theory/combinatorics`, `Ordering numbers`, `Rounding`, `Currency`, `Converting numbers to strings`, `Random numbers`, `Exponentials`, `Trigonometry`, `Vector and Matrix operations` in gran parte, `Range operations`, `List operations`, ecc.) passano per `evaluate(expr)` cioè `Numbas.jme.builtinScope.evaluate` | **2 su 46** portabili subito (`Numbas.math`: righe 459-472, solo `countSigFigs`/`eq`; `Is scalar multiple`: 960-1003, solo `Numbas.math.is_scalar_multiple`). `Vector and Matrix operations`(1251-1319) ha in coda (1309-1318) 3 assert dirette su `Numbas.matrixmath.combine_*` (non mutazione dell'input) portabili isolatamente. `Gauss-jordan elimination`(1321-1334) è **interamente** diretta su `Numbas.matrixmath.gauss_jordan_elimination`, portabile ora | `closeEqual`, `deepCloseEqual`, `raisesNumbasError`, `evaluate()` locale (righe 474-480, wrapper su `jme.evaluate`) | il resto richiede jme.js (parser/tipi, task 2) **e** jme-builtins.js (task 4, dove le funzioni JME come `gcd`, `perm`, `comb`, `random`, `matrix(...)`, `dec(...)` sono definite e delegano a `Numbas.math`/`ComplexDecimal`) |
| `Real intervals` | 1640-1855 | 8: `Constructor`(1641), `Pairwise intersection`(1674), `Pairwise union`(1700), `Complement`(1734), `Difference`(1755), `Union of unions`(1777), `Intersection of unions`(1792), `Complement of union`(1822) | **Sì, tutti e 8** — verificato (`grep` su `evaluate(\|jme\.` nell'intervallo: nessun risultato): costruiscono `Numbas.math.RealInterval`/`RealIntervalUnion` direttamente, nessuna chiamata a `evaluate`/`jme` | `deepCloseEqual` (solo per confrontare array di stringhe/valori) | nessuna — modulo indipendente da jme.js |
| `Scopes` | 1856-2017 | 8 (variabili/funzioni/scope JME) | **No** | — | jme.js task 2 |
| `Built-in notations` | 2018-2031 | N (uno per notazione, da `notation_tests`, generati dinamicamente) | **No** — usa `Numbas.jme.notations` | — | jme-notations.js (task 5) |
| `Pattern-matching` | 2032-2233 | 2: `matchExpression`(2033), `replace`(2209) | **No** | — | jme-rules.js (task 3) |
| `Display` | 2234-2831 | 15, tra cui `niceNumber`(2236), `niceDecimal`(2253), `niceComplexDecimal`(2267), `Number notation styles`(2315) portabili ora; `tokens with precision`(2284), `subvars`(2432), `token to display string`(2437), `tree to JME`(2458), ecc. dipendono da `Numbas.jme.display`/`builtinScope` | **4 su 15** portabili subito: `niceNumber`(2236-2251), `niceDecimal`(2253-2265), `niceComplexDecimal`(2267-2282) — puro `Numbas.math`; `Number notation styles`(2315-2431) — puro `Numbas.util.cleanNumber/parseNumber/isNumber` + `Numbas.math.niceNumber` (nessuna chiamata a `evaluate`, verificato leggendo il blocco per intero) | `assert.equal` diretti | il resto richiede jme-display.js (task 5) |
| `Promises` | 2832-2865 | 1 (`makeVariablesPromise`) | **No** | — | jme-variables.js (task 6) |
| `Documentation` | 2866-2983 (+ generati da `doc-tests.mjs` a runtime) | 2 statici (`Coverage`, `Random flag set properly`) + N generati per ogni funzione documentata | **No** | — | jme.js/jme-builtins.js (le funzioni testate sono quelle JME, non `Numbas.math` direttamente) |

`tests/jme/doc-tests.mjs` (6209 righe): non è un modulo QUnit ma un **array di
dati** (`export default [...]`, riga 1) — sezioni di documentazione con esempi
`{in, out}` di espressioni JME. Nessun riferimento diretto a `Numbas.math`/
`Numbas.util` (`grep -c` restituisce 0 su entrambi); i suoi dati sono
consumati dal blocco `Documentation`/`Docs: <section>` di `jme-tests.mjs`
(righe 2866-2983) tramite `evaluate()`, quindi utile solo a partire dal task 4
(jme-builtins) e in parte dal task 5 (display, per il confronto del LaTeX). Non
è quindi rilevante per il task 1, salvo come fonte di esempi numerici da
riusare più avanti.

**Riepilogo per il task 1** (criterio d'accettazione dello spec: "test `math`
e `util` di jme-tests"): i test estraibili e portabili **subito**, senza
aspettare jme.js, sono `Subvars>splitbrackets/contentsplitbrackets/util` (3
test), `Evaluating>Numbas.math/Is scalar multiple` (2 test) +
`Vector and Matrix operations` limitatamente a 1289-1318 + `Gauss-jordan
elimination` (1 test intero), `Real intervals` (8 test), `Display>niceNumber/
niceDecimal/niceComplexDecimal/Number notation styles` (4 test) — **totale
~18-19 `QUnit.test` su 122 dell'intero file** portabili come test Vitest puri
prima che jme.js esista. Tutti gli altri test che nominano funzioni JME
(`gcd(...)`, `precround(...)`, `random(...)`, ecc. come stringhe da valutare)
verificano `Numbas.math` solo indirettamente, attraverso i wrapper di
jme-builtins.js, e vanno riscritti come test diretti su `Numbas.math`/
`Numbas.util` per essere anticipati al task 1 (decisione da prendere: se
riscriverli ora chiamando direttamente le funzioni TS, o rimandarli al task 4
mantenendo fedeltà 1:1 con l'oracolo upstream).

## 6. Punti delicati

1. **`primes`/`primes_bigints` (math.js:2214-2215) contengono un baco
   upstream**: `7207` e `7211` sono concatenati in `72077211` (virgola
   mancante nel sorgente minificato a mano). Verificato con uno script Node
   che parsa l'array: **999 elementi invece di 1000, non ordinato**. Impatta
   `factorise`/`divisors`/`largest_square_factor` per numeri con un fattore
   primo tra 7207 e 7919 (tutti gli indici successivi sono scalati di uno).
   Decisione da prendere nel port: replicare il baco (fedeltà byte-per-byte
   con l'oracolo, coerente con la filosofia "si porta uguale" dello spec) o
   correggerlo e documentarlo in `DIVERGENCES.md`. Consigliato: **correggere**
   e annotare, perché nessun test upstream noto dipende da questo intervallo
   esatto di primi (nessun riferimento a "7207"/"7211" nei test).

2. **Tipizzazione a runtime "duck-typed" su quattro rappresentazioni
   numeriche diverse**: `number` JS, `{re,im,complex:true}` (letterale,
   *non* una classe — non c'è `instanceof`), `bigint`, `Decimal`/
   `ComplexDecimal`. Quasi ogni funzione di `math.js` fa `if(n.complex)` o
   `typeof n=='bigint'`. In TS questo richiede o un tipo unione discriminato
   esplicito (`type NumbasNumber = number | bigint | Complex`) con narrowing,
   o mantenere la stessa forma a runtime con type guard (`isComplex(n)`,
   `typeof n === 'bigint'`) — la seconda è più fedele ma meno "TypeScript
   idiomatico"; va deciso una volta per il modulo `math/` intero, non
   funzione per funzione, perché la scelta si propaga a `Fraction`/
   `ComplexDecimal`/`vectormath`/`matrixmath` che assumono la stessa
   convenzione (es. `mul` di `vectormath` a riga 2924 chiama `math.mul` senza
   sapere se l'elemento è complesso o bigint).

3. **`complex(re, im)` (math.js:97-104) non è un costruttore di classe**:
   se `im` è falsy ritorna semplicemente `re` (un `number` grezzo). Quindi
   "un numero complesso con parte immaginaria 0" **non esiste** come
   oggetto — è indistinguibile da un reale. Codice che si aspetta sempre
   `{complex:true}` da `math.add`/`math.mul` ecc. deve gestire anche il
   ritorno "collassato". Nel port, se si sceglie una classe `Complex`
   dedicata, va decisa la stessa semantica di collasso (o abbandonata
   esplicitamente, documentando la divergenza).

4. **`precround` (math.js:1160-1198) è la funzione più delicata del file**:
   corregge manualmente gli errori di floating point con soglie magiche
   (`1e-9`), calcola `d` con `Math.floor`/`Math.ceil` a seconda del segno
   della parte frazionaria, e ha un ramo speciale quando l'arrotondamento
   "trabocca" a un intero (`rounded_fracPart == be`). I test upstream
   (`jme-tests.mjs:1078-1093`) fissano casi limite molto specifici (es.
   `precround(237.55749999999998,3)==237.558` ma
   `precround(237.55748999999998,3)==237.557`) che una riscrittura "pulita"
   con `toFixed`/`Number.EPSILON` rischia di non replicare esattamente. **Va
   portata riga per riga, non riscritta**, e coperta dagli stessi identici
   casi di test.

5. **`math.eq` (500-517) considera `NaN==NaN` vero** ed usa `isclose` con
   tolleranza assoluta/relativa `1e-15` di default per i reali (tranne
   quando *entrambi* gli argomenti sono `bigint`, nel qual caso l'uguaglianza
   è esatta). Questo significa che l'uguaglianza "matematica" del motore non
   è l'uguaglianza IEEE 754 standard — coerente con l'uso didattico (arrotonda
   via gli errori di floating point) ma sorprendente se non documentato.
   Testato esplicitamente a `jme-tests.mjs:468-471`.

6. **`math.mod(a,b)` (297-306) gestisce `b===0n` (bigint) ma non `b===0`
   (number)**: `b = math.abs(b)` poi `if(b===0n) return NaN` — se `b` è `0`
   come `number` JS, il confronto `===0n` è `false` (i confronti stretti fra
   `number` e `bigint` sono sempre `false` in JS), quindi si cade nel calcolo
   `((a%0)+0)%0` che produce comunque `NaN` per altra via (divisione modulo
   zero → `NaN` nativamente). Il comportamento finale è corretto ma per
   ragioni diverse da quelle che il codice sembra suggerire — occhio a non
   "sistemare" il controllo `===0n` in `===0` pensando sia un refuso, perché
   cambierebbe il ramo preso (anche se non il risultato finale per questo
   caso). Testato a `jme-tests.mjs:900-901` (`mod(0,0)`, `mod(5,0)` → `NaN`).

7. **Alias tardivo `math.gcf = math.gcd` (math.js:2354)**, definito *dopo* la
   chiusura dell'oggetto letterale `math`, ma **usato dentro lo stesso oggetto
   letterale** da `lcm` (righe 2051, 2060: `math.gcf(a,b)`). Funziona perché
   JS risolve `math.gcf` al momento della *chiamata* di `lcm`, non alla
   definizione — ma è un esempio di dipendenza dall'ordine di esecuzione del
   modulo che va reso esplicito nel port (in TS, basta chiamare `gcd`
   direttamente e eliminare l'alias interno, mantenendo `gcf` solo come export
   pubblico se serve compatibilità nominale).

8. **Mutazione in-place mascherata da "matrice come array con proprietà
   extra"**: `matrix`/`vector` sono `Array` JS con `.rows`/`.columns`
   attaccati come proprietà arbitrarie (es. `matrixmath.id`, riga 3376-3377:
   `out.rows = out.columns = n`). Funzioni come `row_echelon_form`
   (matrixmath, 3614-3670) **mutano l'array in ingresso** (swap di righe con
   `matrix[row] = matrix[current_row]`), mentre altre come
   `combine_vertically` creano un nuovo array (testato esplicitamente a
   `jme-tests.mjs:1309-1318`, "input not mutated"). Il port deve rendere
   esplicita, funzione per funzione, quali mutano e quali no (idealmente: **
   nessuna** muta, in stile funzionale, ma questo è un cambiamento di
   comportamento da annotare in `DIVERGENCES.md` se una funzione dipendeva
   dalla mutazione altrove — verificato che `row_echelon_form`/
   `reduced_row_echelon_form` sono chiamate solo internamente da
   `gauss_jordan_elimination`, quindi la mutazione è "locale" e innocua da
   rimuovere).

9. **`Fraction` costruttore (2374-2396): loop di raddoppio potenzialmente
   infinito**. Se `numerator`/`denominator` sono `number` non interi, il
   costruttore fa `while(numerator%1!=0 || denominator%1!=0) { numerator*=2;
   denominator*=2; }` — per un input come `NaN` o un `number` la cui parte
   frazionaria non converge mai a 0 in floating point (raro ma non
   impossibile per certe rappresentazioni), il loop non termina. Da
   sostituire nel port con `rationalApproximation`/una conversione a bigint
   con limite di iterazioni esplicito.

10. **`ComplexDecimal.toNumber()` (2653-2655) scarta silenziosamente la parte
    immaginaria** (ritorna solo `this.re.toNumber()`). Nessun warning, nessun
    check `isReal()`. Un naive port che aggiunge un controllo "per
    correttezza" cambierebbe il comportamento osservabile — va portato
    identico (con eventualmente un commento `// upstream:`).

11. **`countSigFigs`/`toGivenPrecision` (math.js:1307-1349) usano regex molto
    dense** con gruppi di cattura multipli e un parametro `max` che cambia
    quale regex usare (1311 vs 1313, quasi identiche ma con quantificatori
    diversi su `0*`) — alto rischio di introdurre una differenza sottile
    riscrivendole "più leggibili". Portare le regex verbatim con commenti che
    spiegano ogni gruppo.

12. **`numberNotationStyles` (util.js:1460-1598)**: le regex per stile (es.
    `'in'` a riga 1543: `/^((?:\d{1,2}(?:,\d{2})*,\d{3})|\d{1,3})(\x2E\d+)?/`
    per il sistema di raggruppamento indiano 2-2-3) codificano regole
    culturali precise; lo stile `'scientific'` (1584-1597) ha un campo
    `clean` in più (non solo `re`+`format`) che nessun altro stile ha —
    l'interfaccia TS per uno "stile di notazione" deve avere `clean` opzionale,
    non obbligatorio.

13. **Ordine di definizione fra `util.js` e `math.js` è realmente
    circolare** (vedi §3): `util.eq` dipende (per i tipi `matrix`/`set`/
    `vector`) da `Numbas.matrixmath`/`setmath`/`vectormath` (in `math.js`);
    `Numbas.setmath.contains`/`union`/`intersection`/`minus` (in `math.js`)
    dipendono da `Numbas.util.eq`. Nel runtime originale, `Numbas.queueScript`
    risolve le dipendenze come Promise (`numbas.js:120-206`) quindi l'ordine
    concreto di *esecuzione* è `math` prima di `util` (dichiarato in
    `util.js:14`), ma le *chiamate* a runtime vanno nell'altro verso quando si
    esegue `setmath.contains(...)`. In TS con moduli ESM questo tipo di ciclo
    va spezzato esplicitamente: il modo più pulito è che `setmath` (valori
    grezzi) non usi affatto l'uguaglianza di token — usi `Object.is`/
    `deepEqual` di valori JS puri — e che l'uguaglianza *di token JME*
    (quella che oggi vive in `util.eq`) si sposti interamente in `jme/scope.ts`
    (task 2), lasciando in `math/` solo `objects_equal`/`arraysEqual` (che non
    hanno questo problema, operano su valori JS grezzi).

14. **Ricorsione**: `gamma` (1424-1448, riflessione per `Re(n)<0.5`),
    `integer_partitions` (1123-1140, ricorsione su `k`), `factorial` per `n`
    non interi (1403-1418, richiama `gamma`) sono ricorsive senza limite di
    profondità esplicito — per `integer_partitions` con `n`/`k` grandi la
    ricorsione è anche esponenziale in tempo (nessuna memoizzazione).

15. **Unicode**: non ci sono elaborazioni Unicode dirette in `util.js`/
    `math.js` (il tokenizzatore di nomi con apici Unicode, es.
    `jme-tests.mjs:174-175` `'𝟖𝟡🯳'`, vive in `jme.js`, fuori da questi due
    file). Unico punto di attenzione: `letterOrdinal` (util.js:1293-1309) e
    `hashCode` (1060-1076) operano su `charCodeAt`, quindi su unità UTF-16,
    non su code point — irrilevante per l'uso attuale (nomi generati dal
    motore stesso, sempre ASCII) ma da annotare se in futuro si passano
    stringhe arbitrarie.

## 7. Proposta di suddivisione TypeScript

Target: `packages/engine/src/math/`, ogni file ≤1000 righe, nessuna dipendenza
da DOM, `decimal.js` come import npm, generatore casuale iniettabile.

```
packages/engine/src/math/
  types.ts          — tipi condivisi: Complex, NumbasNumber, Fraction (tipo), Range, Matrix, Vector
  complex.ts         ← math.js:65-417 (helper bigint, aritmetica complessa/reale unificata)
  compare.ts          ← math.js:423-666 (positive/negative/lt/gt/leq/geq/eq/isclose/is_scalar_multiple/max/min + varianti "list")
  rounding.ts         ← math.js:676-821, 1160-1401 (piDegree, addDigits, toExponential, precround, siground,
                        countDP, countSigFigs, toGivenPrecision(Scientific), withinTolerance, parseScientific, unscientific)
  format.ts           ← math.js:760-981 (niceRealNumber, niceNumber, niceComplexDecimal, niceDecimal, numberToDecimal)
                        + util.js:513-747 (standardNumberFormatter, matchNotationStyle, cleanNumber,
                        formatNumberNotation, parseDecimal, parseNumber, parseInt, parseFraction, numberNotationStyles)
  trig.ts             ← math.js:1403-1697 (factorial, gamma, log10, log_base, radians/degrees, tutte le trig/iperboliche)
  integer-rounding.ts ← math.js:1705-1808 (ceil, floor, round, toNearest, trunc, fract, sign)
  number-theory.ts    ← math.js:1905-2352 (productRange, combinations, permutations, divides, gcd/coprime/lcm,
                        divisors, factorise, largest_square_factor, sum, prod, primes/primes_bigints — con
                        correzione del baco 7207/7211)
  ranges.ts           ← math.js:1146-1152, 2071-2210 (range, defineRange, rangeSteps, rangeToDecimalList,
                        rangeToList, rangeSize, rationalApproximation)
  random.ts           ← math.js:1001-1895 (randomint, deal, shuffle, inverse, reorder, shuffle_together,
                        random_integer_partition, random, except, choose, weighted_random) — **RNG iniettato**
  fraction.ts         ← math.js:2364-2596 (classe Fraction)
  complex-decimal.ts  ← math.js:2599-2861 (ensure_decimal, isComplexDecimal, classe ComplexDecimal)
  vector.ts           ← math.js:2874-3181 (Numbas.vectormath)
  matrix.ts           ← math.js:3195-3748 (Numbas.matrixmath)
  set.ts              ← math.js:3759-3834 (Numbas.setmath, MA su valori grezzi: eq via Object.is/deepEqual, non via token)
  real-interval.ts    ← math.js:3836-4076 (RealInterval, RealIntervalUnion)
  string-format.ts     ← util.js:749-1076 (slugify, lpad, rpad, formatString, formatTime, currency,
                        separateThousands, unPercent, pluralise, capitalise, splitbrackets, escapeHTML,
                        sortBy, hashCode, caselessCompare) + contentsplitbrackets (util.js:1619-1671)
  combinatorics.ts     ← util.js:1082-1309 (product, cartesian_power, zip, combinations,
                        combinations_with_replacement, permutations, letterOrdinal)
  predicates.ts        ← util.js:395-518 (isInt, isFloat, isFraction, isNumber, wrapListIndex, isBool,
                        isNonemptyHTML [solo ramo regex], parseBool, re_fraction) + copyarray/copyobj/copyinto/
                        objects_equal/arraysEqual (util.js:96-346, SOLO le funzioni che operano su valori grezzi,
                        non su token JME)
  index.ts             — re-export della superficie pubblica del modulo math/
```

Non portati in `math/`: `util.eq`/`neq`/`equalityTests`/`except`(lista di
token)/`distinct`/`contains` (token) → vanno in `jme/scope.ts` (task 2), dato
che operano su token JME tipizzati e dipendono da `findCompatibleType`/
`castToType`/`treesSame`/`normaliseName`. `util.nicePartName` → va in
`parts/` (task 8, unica consumatrice). `util.debounce` → eventualmente in un
futuro pacchetto UI (sotto-progetto 3), non nel motore. `document_ready`,
`isNonemptyHTML` (ramo DOM), `prefix_css_selectors`, i polyfill di prototipo,
`b64encode`/`b64decode` → non portati (§4).

### Firme principali proposte

```ts
// complex.ts
export type Complex = { re: number; im: number };
export type NumbasNumber = number | bigint | Complex;
export function isComplex(n: NumbasNumber): n is Complex;
export function complex(re: number, im: number): NumbasNumber; // collassa a `re` se im===0, come upstream
export function add(a: NumbasNumber, b: NumbasNumber): NumbasNumber;
export function mul(a: NumbasNumber, b: NumbasNumber): NumbasNumber;
export function pow(a: NumbasNumber, b: NumbasNumber): NumbasNumber;
// ... sub, div, negate, conjugate, abs, arg, re, im, sqrt, log, exp

// compare.ts
export function eq(a: NumbasNumber, b: NumbasNumber): boolean;   // NaN==NaN => true, isclose per i reali
export function isclose(a: NumbasNumber, b: NumbasNumber, relTol?: number, absTol?: number): boolean;

// rounding.ts
export function precround(a: NumbasNumber, b: number): NumbasNumber;
export function siground(a: NumbasNumber, b: number): NumbasNumber;
export function countDP(n: number | string): number;
export function countSigFigs(n: number | string, max?: boolean): number;

// random.ts — RNG iniettabile (decisione 5 dello spec)
export interface RandomSource { random(): number; } // sostituisce Math.random
export function randomint(n: number, rng: RandomSource): number;
export function randomrange(min: number, max: number, rng: RandomSource): number;
export function shuffle<T>(list: T[], rng: RandomSource): T[];
export function choose<T>(selection: T[], rng: RandomSource): T;
export function weighted_random<T>(list: [T, number][], rng: RandomSource): T | undefined;
// deal, shuffle_together, random_integer_partition, random(range) seguono lo stesso pattern:
// ultimo parametro `rng: RandomSource` in coda alla firma upstream.

// fraction.ts
export class Fraction {
  constructor(numerator: number | bigint, denominator?: number | bigint);
  readonly numerator: number;   // getter, come upstream
  readonly denominator: number;
  add(b: Fraction | number): Fraction;
  // ... resto dei metodi upstream, stessi nomi
  static fromFloat(n: number): Fraction;
  static fromDecimal(n: Decimal, accuracy?: number): Fraction;
}

// complex-decimal.ts
export class ComplexDecimal {
  constructor(re: Decimal, im?: Decimal);
  isReal(): boolean;
  toComplexNumber(): NumbasNumber;
  // ... resto identico
}

// set.ts — a differenza dell'upstream, eq su valori grezzi (niente scope/token)
export function contains<T>(set: T[], element: T, eqFn?: (a: T, b: T) => boolean): boolean;
export function union<T>(a: T[], b: T[], eqFn?: (a: T, b: T) => boolean): T[];
```

**Come si inietta il generatore casuale**: nell'originale, `Math.random` è
chiamato direttamente in tre punti primitivi (`randomint` math.js:1002,
`randomrange` math.js:1818, `weighted_random` math.js:1885); tutte le altre
funzioni "casuali" (`deal`, `shuffle`, `shuffle_together`,
`random_integer_partition`, `random(range)`, `choose`) sono casuali solo
*transitivamente*, chiamando queste tre. Nel port, `random.ts` esporta le
funzioni con un parametro esplicito `rng: RandomSource` (interfaccia con un
solo metodo `random(): number`, compatibile 1:1 con `Math.random`), e
`packages/engine` costruisce un `RandomSource` a partire dal pacchetto npm
`seedrandom` seminato con il seed del tentativo (decisione 5 dello spec) —
esattamente l'algoritmo ARC4 del vendor upstream (`runtime/scripts/seedrandom/
seedrandom.js`, 254 righe, non toccato da `math.js`/`util.js`: confermato che
`seedrandom` non compare in nessuno dei due file, quindi il task 1 non deve
portare nulla del generatore stesso, solo il punto di iniezione).

## 8. Domande aperte

1. **Fedeltà al baco `primes`/`primes_bigints`** (§6.1): correggere l'array a
   1000 elementi ordinati, o replicare il baco upstream per fedeltà totale
   all'oracolo nei test differenziali? Nessun test noto lo esercita
   direttamente, ma non è stato verificato l'intero corpus di domande
   pubbliche CC BY menzionato nello spec (non incluso in questo clone).

2. **Rappresentazione dei numeri complessi in TS**: oggetto letterale con
   collasso a `number` quando `im===0` (fedele all'originale, ma "innaturale"
   in TS: una funzione che dichiara `→ Complex` a volte ritorna `number`), o
   una classe sempre-complessa con metodo `.isReal()` (più pulito ma
   comportamento osservabile diverso, es. via `typeof`)? Impatta tutte le
   firme di `complex.ts`/`compare.ts`/`trig.ts`. Da decidere nel task 1 vero e
   proprio, non deducibile solo dall'inventario.

3. **Se estrarre subito i ~18-19 test QUnit "puri" identificati in §5** come
   test Vitest per il task 1, oppure aspettare e portare l'intera suite in
   blocco quando anche jme.js/jme-builtins.js saranno pronti (rischio:
   scrivere due volte gli stessi test, prima diretti su `Numbas.math`/
   `Numbas.util`, poi via `evaluate()`). Non risolvibile da questo inventario:
   è una scelta di processo per il piano di implementazione.

4. **`Numbas.locale.default_number_notation`** (globale mutabile impostato da
   `localisation.js`, fuori ambito): quale default usare in `math/` quando
   nessuno stile è specificato esplicitamente? Lo spec non lo dice; opzioni:
   hardcodare `'plain'` (nessuna punteggiatura), esporre un parametro
   `defaultStyle` sul modulo `format.ts` con default `'plain'`, o derivarlo
   dalla `locale` passata a `loadQuestion` (it→`plain-eu`, en→`plain`) per
   restare più vicino al comportamento upstream percepito dall'utente finale.

5. **`util.debounce`/`b64encode`/`b64decode`/`formatTime`/`caselessCompare`/
   `prefix_css_selectors`**: nessuno è chiamato da altri file dentro
   `runtime/scripts/` in questo clone, ma potrebbero essere usati da
   estensioni ufficiali Numbas (`extensions/`, non incluse in questo
   controllo) o da temi. Non è stato verificato l'intero repository upstream
   (solo `runtime/scripts/`), quindi non è certo al 100% che siano
   "morte" — vanno trattate come bassa priorità, non come da eliminare con
   certezza.

6. **Se `equalityTests`/`util.eq` (token JME) vadano davvero rimandati
   interamente al task 2 (jme/scope.ts)**, come proposto in §7, o se convenga
   comunque portarli nel task 1 come funzioni "stub" che il task 2 poi
   completa — la spec di progetto non entra in questo livello di dettaglio
   per il modulo `math/`, e la decisione ha impatto sull'ordine dei task 1/2.
