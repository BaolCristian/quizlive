# Inventario porting: jme-rules.js, jme-calculus.js, jme-builtins.js

Sorgente: clone upstream Numbas, commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5` (2026-08-26).
File analizzati:
- `runtime/scripts/jme-rules.js` — 2294 righe
- `runtime/scripts/jme-calculus.js` — 180 righe
- `runtime/scripts/jme-builtins.js` — 3825 righe
- Test: `tests/jme/jme-tests.mjs` (2983 righe), `tests/jme/doc-tests.mjs` (6209 righe, generato)

Target di destinazione (da `docs/superpowers/specs/2026-09-02-esercizi-02-motore-design.md`,
sezione Architettura): `packages/engine/src/jme/rules.ts` (eventualmente 2 file),
`packages/engine/src/jme/calculus.ts`, `packages/engine/src/jme/builtins/*.ts` (uno per tema).
Vincolo del design doc: nessun file sopra le 1000 righe, nessun accesso a `window`/`document`/`fetch`,
generatore casuale iniettato e seminato con l'algoritmo `seedrandom` (stesso ARC4 del vendor).

Tutti i numeri di riga citati sono relativi ai file upstream sopra elencati, non al codice TypeScript
futuro.

---

## 1. Scopo dei file

### `jme-rules.js`
Motore di pattern-matching sugli alberi sintattici JME (`Numbas.jme.tree`) e libreria delle regole di
semplificazione algebrica. Definisce un linguaggio di pattern con propria sintassi (estensione del
parser JME standard: quantificatori, cattura di nomi, alternanza, condizioni) tramite la classe
`PatternParser`, la classe `Rule` (pattern → risultato con condizioni opzionali) e `Ruleset` (insieme
di `Rule` con un metodo `simplify` che applica le regole a punto fisso). In coda al file c'è il
catalogo dei rule-set di semplificazione predefiniti (`basic`, `collectNumbers`, `trig`, ecc.),
compilati una sola volta al caricamento dello script. Nessuna dipendenza da `Math.random` o dal DOM:
è codice puro basato su alberi.

### `jme-calculus.js`
Modulo di differenziazione simbolica (180 righe, il più piccolo dei tre). Espone
`Numbas.jme.calculus.differentiate(tree, x, scope)`: applica ricorsivamente una tabella di derivate
note (`calculus.derivatives`, funzioni di una variabile) e una lista di 11 regole di riscrittura
(`differentiation_rules`, espresse come pattern `jme.rules.Rule` con un pseudo-operatore `$diff` che
viene espanso ricorsivamente). Dipende direttamente da `jme-rules.js` (classe `Rule`) e usa
`jme.rules.simplificationRules.basic` per normalizzare l'albero prima di derivare. Nessuna casualità,
nessun DOM.

### `jme-builtins.js`
Il file più grande (3825 righe): registra tutte le funzioni e gli operatori nativi del linguaggio JME
nello `Numbas.jme.builtinScope` globale, organizzati in 29 "function set" tematici (aritmetica,
trigonometria, algebra lineare, liste, stringhe, insiemi, intervalli, casualità, controllo di flusso,
HTML, ecc.). Definisce anche le costanti built-in (`pi`, `e`, `i`, `infinity`, `NaN`, `j`) e popola il
registro `Numbas.jme.lazyOps` per gli operatori/funzioni che ricevono argomenti non valutati (if,
switch, let, map, ...). Dipende da `Numbas.math`, `Numbas.util`, `jme.rules`, `jme.calculus`,
`jme.variables`, `jme.display`, dal DOM (tema `html` e due firme di `scientificnumberhtml`), da
`Math.random`/`Math.seedrandom` e dalla funzione di localizzazione globale `R()`.

---

## 2. `jme-rules.js`

### 2.1 Tabella di layout

| riga inizio | riga fine | cosa contiene |
|---|---|---|
| 1 | 10 | `Numbas.queueScript`, alias locali `math`/`jme`/`util`, `jme.rules = {}` |
| 12 | 27 | JSDoc typedef `matchTree_options` |
| 29 | 44 | `parse_options(str)` — converte la stringa di opzioni (es. `'acgs'`) in oggetto |
| 46 | 59 | `extend_options(a, b)` — merge di due `matchTree_options` |
| 65 | 150 | classe `Rule` (costruttore + prototype: `toString`, `get_options`, `match`, `matchAll`, `replace`, `replaceAll`) |
| 152 | 193 | JSDoc typedef `getTerms_options`/`term`; `quantifier_combo` (tabella di composizione quantificatori annidati) |
| 195 | 263 | classe `Term` — analizza un nodo per estrarne nome/i catturati, quantificatore, valore di default |
| 270 | 297 | `nonStrictReplacements`, `nonStrictCanonicalOps`, `insertUnaryMinus` (riscritture `a-b`→`a+(-b)`, `a/b`→`a*(/b)` in modalità non-strict) |
| 298 | 337 | `unwrapCapture(tree)` — rimuove `;`/`;=` in testa a un albero |
| 338 | 455 | `getTerms(tree, op, options, calculate_minimum)` — spezza un albero in una lista di `Term` per un operatore (n-ario, associativo/commutativo) |
| 456 | 483 | `preserve_match(m, exprTree)` — garantisce che il match includa sempre `_match` (l'intero sottoalbero) |
| 484 | 536 | `matchTree(ruleTree, exprTree, options)` — dispatcher centrale per tipo di token (name/function/op/list/altro), gestisce anche le costanti di scope e gli operatori `;`/`;=` in testa |
| 537 | 633 | `number_conditions` — 11 predicati usati dalle annotazioni di `$n` |
| 634 | 676 | `specialMatchNames` (`?`, `$n`, `$v`, `$z`) + `matchName` |
| 677 | 733 | `setMatchOptions`, `matchAnywhere` (usata da `m_anywhere`) |
| 734 | 771 | `specialMatchFunctions` (`m_uses`, `m_exactly`, `m_commutative`, ..., `m_anywhere`) + `matchFunction` |
| 772 | 836 | `matchGenericFunction`, `matchGenericOp` (per `m_func`/`m_op`), inizio `specialMatchOps` |
| 837 | 900 | `specialMatchOps` (11 operatori pattern) + `matchOp` |
| 901 | 952 | `matchWhere` (condizione `` `where ``), `matchMacro` (sostituzione `` `@ ``) |
| 953 | 1013 | `matchOrdinaryFunction` — matcha applicazioni di funzione ordinarie usando `matchTermSequence` sugli argomenti |
| 1014 | 1073 | `matchList`, `matchToken` (match esatto per token letterali), `quantifier_limits` |
| 1074 | 1151 | `resolveName`, `findCapturedNames`, `removeUnaryDivision` |
| 1152 | 1217 | `matchOrdinaryOp` — matcha applicazioni di operatori binari/n-ari (usa `getTerms` + `matchTermSequence`) |
| 1218 | 1392 | `matchTermSequence` — allinea i termini della regola a quelli dell'espressione, gestisce `;=` (nomi identificati) |
| 1393 | 1573 | `findSequenceMatch` — automa greedy con backtracking per l'allineamento sequenza-pattern (il cuore combinatorio del matcher) |
| 1574 | 1722 | `matchAny` (`` `\| ``), `matchDefault` (`` `: ``), `extractLeadingMinus`, `matchOptionalPrefix` (`` `+- ``, `` `*/ ``), `matchNot` (`` `! ``), `matchUses` (`m_uses`), `matchType` (`m_type`), `matchAnd` (`` `& ``) |
| 1723 | 1757 | `matchAllTree` (trova tutti i match in un albero), `mergeMatches` |
| 1758 | 1833 | `applyPostReplacement` (espande `eval(...)`, `m_listval`, rimuove `nothing` residui), `transform` (applica una `Rule`) |
| 1834 | 1849 | `transformAll` (applica `transform` ricorsivamente a tutto l'albero) |
| 1850 | 1905 | classe `PatternParser extends jme.Parser` — aggiunge il token `$xxx`, i quantificatori/operatori del linguaggio pattern, `expand_pattern` (espande `$n:rational` in `integer:$n/integer:$n\`?`) |
| 1906 | 1926 | `jme.rules.PatternParser`, istanza singleton `patternParser`, `jme.rules.matchExpression` (wrapper stringa→albero→match) |
| 1927 | 1978 | (continuazione `matchExpression`) `displayFlags` — 9 flag di rendering ereditate dai Ruleset |
| 1979 | 2050 | classe `Ruleset` (costruttore, `flagSet`, `simplify` — loop a punto fisso con rilevamento cicli) |
| 2051 | 2108 | `collectRuleset(set, scopeSets)` — compone un Ruleset da una stringa CSV o array di nomi/oggetti, gestendo negazione `!nome` e flag |
| 2109 | 2232 | `simplificationRules` — dizionario letterale con 22 rule-set (vedi §2.4) |
| 2233 | 2264 | `conflictingSimplificationRules` — 6 rule-set opzionali che confliggono con quelli di base |
| 2265 | 2273 | `compileRules(rules, name)` — converte `[pattern, opzioni, risultato]` in `Rule` + `Ruleset` |
| 2274 | 2293 | bootstrap: compila tutti i rule-set, sostituisce le costanti `i`/`pi` nei pattern/risultati, costruisce il rule-set sintetico `all`, assegna `jme.rules.simplificationRules` |
| 2294 | 2294 | chiusura `queueScript` |

### 2.2 Il linguaggio di pattern-matching

Il parser dei pattern (`PatternParser`, righe 1850-1905) estende il parser JME standard con:

**Token speciale** (riga 1852-1861): un regex `/^\$[a-zA-Z_]+/` riconosce nomi che iniziano con `$`
(es. `$n`, `$v`, `$z`) come `TName` — **solo ASCII**, non supporta nomi unicode dopo il `$`.

**Operatori del linguaggio pattern** (righe 1863-1877), tutti con precedenza molto alta (1000000) o
molto bassa (0.5) per non interferire con la grammatica JME normale:

| token | tipo | precedenza | riga | significato |
|---|---|---|---|---|
| `` `? `` | postfisso | 0.5 | 1863 | quantificatore: 0 o 1 volte |
| `` `* `` | postfisso | 0.5 | 1864 | quantificatore: 0 o più volte |
| `` `+ `` | postfisso | 0.5 | 1865 | quantificatore: 1 o più volte |
| `` `! `` | prefisso | 0.5 | 1867 | negazione (non deve matchare) |
| `` `+- `` | prefisso | 0.5 | 1868 | segno unario opzionale (`-u`/`+u`) |
| `` `*/ `` | prefisso | 0.5 | 1869 | divisione unaria opzionale (`/u`) |
| `;` | binario | 0.5 | 1871 | cattura: assegna il sottoalbero sinistro al nome destro |
| `;=` | binario | 0.5 | 1872 | cattura "identificata": come `;`, ma tutte le catture con lo stesso nome nel match devono essere strutturalmente uguali (`jme.compareTrees`) |
| `` `\| `` | binario | 1000000 | 1873 | alternanza (primo che matcha vince) |
| `` `: `` | binario | 1000000 | 1874 | valore di default se il termine è assente in una sequenza |
| `` `& `` | binario | 100000 | 1875 | congiunzione (tutti i pattern devono matchare) |
| `` `where `` | binario | 1000000 | 1876 | condizione JME post-match (valutata nello scope con i nomi catturati) |
| `` `@ `` | binario, right-assoc | 1000000 | 1877 | macro: sostituisce sotto-pattern con nome prima di matchare |

**Nomi speciali** (`specialMatchNames`, righe 634-666):

| nome | riga | comportamento |
|---|---|---|
| `?` | 635-637 | matcha qualsiasi sottoalbero, senza catturare nulla |
| `$n` | 638-654 | matcha un token numero; se annotato (`condizione:$n`) verifica le `number_conditions` |
| `$v` | 655-660 | matcha solo un token di tipo `name` |
| `$z` | 661-663 | non matcha mai (usato per forzare quantificatore `0`, cioè "il termine non compare") |

Annotazioni valide su `$n` (`number_conditions`, righe 537-626, sintassi `annotazione:$n` — riusa la
sintassi generale di annotazione dei nomi JME): `complex`, `imaginary`, `real`, `positive`,
`nonnegative`, `negative`, `integer`, `decimal`, `rational` (quest'ultima viene **espansa dal parser**
in `integer:$n/integer:$n\`?`, riga 1893-1895, non è un vero predicato), `nonzero`, `nonone`.

**Funzioni speciali `m_*`** (`specialMatchFunctions`, righe 734-753):

| funzione | riga | comportamento |
|---|---|---|
| `m_uses(nomi...)` | 736-739 | l'espressione deve usare tutti i nomi liberi elencati |
| `m_exactly(pattern)` | 740 | forza `allowOtherTerms:false` |
| `m_commutative(pattern)` | 741 | forza `commutative:true` |
| `m_noncommutative(pattern)` | 742 | forza `commutative:false` |
| `m_associative(pattern)` | 743 | forza `associative:true` |
| `m_nonassociative(pattern)` | 744 | forza `associative:false` |
| `m_strictinverse(pattern)` | 745 | forza `strictInverse:true` |
| `m_gather(pattern)` | 746 | forza `gatherList:false` |
| `m_nogather(pattern)` | 747 | forza `gatherList:true` |
| `m_type(nome_tipo)` | 748-750 | il token in cima deve avere quel `.type` |
| `m_func(nome_pattern, args_pattern)` | 751-753 | matcha una funzione qualsiasi il cui nome (come stringa) e i cui argomenti (come lista) soddisfano i due pattern |
| `m_op(nome_pattern, args_pattern)` | (da `matchGenericOp`, 815-829) | come `m_func` ma per operatori |
| `m_anywhere(pattern)` | 730-733/770 | matcha se il pattern compare in un punto qualsiasi dell'albero (ricerca in profondità) |
| `m_listval(lista, n)` | (usata solo in `applyPostReplacement`, riga 1778) | non è un matcher ma un helper lato-risultato: estrae l'n-esimo elemento |

Nota: `m_strictinverse` è l'unico nome reale; il test upstream `jme-tests.mjs:2103` usa
`m_strictplus(?+?)` che **non esiste** in `specialMatchFunctions` — l'assert passa comunque perché
`matchOrdinaryFunction` cerca semplicemente una funzione letterale chiamata `m_strictplus` nell'
espressione (che non c'è mai). Vedi §8.

**Operatori speciali `` ` `` (`specialMatchOps`, righe 837-870)**: uno per ciascuno dei token della
tabella sopra (`` `?  `* `+ `\| `: `+- `*/ `! `& `where `@ ``), ognuno dispatcha alla funzione
corrispondente (`matchTree` ricorsivo per i quantificatori — la logica di ripetizione vive in
`getTerms`/`matchTermSequence`, non qui).

### 2.3 Classe `Rule` e `Ruleset`

`Rule` (righe 65-150): costruttore `Rule(pattern, result, options, name)`. `pattern` e `result` sono
stringhe JME compilate rispettivamente con `patternParser.compile` e `jme.compile` normale. `options`
può essere una stringa di lettere (`parse_options`, riga 29-37: `c`=commutative, `a`=associative,
`g`=allowOtherTerms, `l`=gatherList, `s`=strictInverse) o un oggetto `matchTree_options` già
strutturato. Metodi: `match(exprTree, scope)`, `matchAll`, `replace` (applica `transform` una volta),
`replaceAll` (applica `transformAll`, ricorsivo su tutto l'albero).

`Ruleset` (righe 1979-2050): wrapper attorno a un array di `Rule` più un dizionario di `flags`
(ereditati da `displayFlags`, righe 1946-1978: `fractionnumbers`, `rowvector`, `alwaystimes`,
`mixedfractions`, `flatfractions`, `barematrices`, `timesdot`, `timesspace`,
`noscientificnumbers`). Il metodo `simplify(exprTree, scope, notation)` (righe 1990-2035) è il loop
principale di semplificazione: vedi §8 per la logica di terminazione. `collectRuleset` (righe
2051-2108) compone un `Ruleset` da una specifica stringa/array, gestendo la sintassi `!nome` per
sottrarre regole e riconoscendo i nomi dei flag come alternativa ai nomi dei rule-set.

### 2.4 Rule-set di semplificazione predefiniti

Tutti compilati da `compileRules` (righe 2265-2273) a partire da array letterali
`[pattern, opzioni, risultato]` o `[pattern, [condizioni...], risultato]` (forma legacy, solo nel
blocco commentato). Le colonne "pattern → risultato" sono le stringhe JME esatte; "opz." è la stringa
di `parse_options`.

**`jme.rules.simplificationRules`** (dizionario sorgente, righe 2109-2232) — 22 rule-set:

| rule-set | righe | # regole | pattern → risultato (opz.) |
|---|---|---|---|
| `basic` | 2110-2125 | 14 | `negative:$n;x`→`-eval(-x)` (); `+(?;x)`→`x` (s); `?;x+(-?;y)`→`x-y` (ags); `?;x-(-?;y)`→`x+y` (ags); `-(-?;x)`→`x` (s); `(-?;x)/?;y`→`-(x/y)` (s); `?;x/(-?;y)`→`-(x/y)` (); `-(\`!complex:$n);x*(-?;y)`→`x*y` (asg); ``\`!-? `& (-(real:$n/real:$n\`? `\| imaginary:$n `\| \`!$n);x)*?\`+;y``→`-(x*y)` (sgc); `imaginary:$n;z*?;y \`where im(z)<0`→`-(eval(-z)*y)` (acsg); `-(?;a+?\`+;b)`→`-a-b` (); `?;a+(-?;b-?;c)`→`a-b-c` (); `?;a+(-?;b+?;c)`→`a-b+c` (); `?;a/?;b/?;c`→`a/(b*c)` () |
| `collectComplex` | 2126-2130 | 3 | `-complex:negative:$n;x`→`eval(-x)` (); `(\`+- real:$n);x+(\`+- imaginary:$n);y`→`eval(x+y)` (cg); `$n;n*i`→`eval(n*i)` (acsg) |
| `unitFactor` | 2131-2133 | 1 | `1*(\`!(/?));x`→`x` (acgs) |
| `unitPower` | 2134-2136 | 1 | `?;x^1`→`x` () |
| `unitDenominator` | 2137-2139 | 1 | `?;x/1`→`x` () |
| `zeroFactor` | 2140-2143 | 2 | `?;x*0`→`0` (acg); `0/?;x`→`0` () |
| `zeroTerm` | 2144-2146 | 1 | `(\`+-0)+(\`+-?);x`→`x` (acg) |
| `zeroPower` | 2147-2149 | 1 | `?;x^0`→`1` () |
| `powerPower` | 2150-2152 | 1 | ``(?;x^$n;a)^$n;b `where abs(a*b)<infinity``→`x^eval(a*b)` () |
| `noLeadingMinus` | 2153-2156 | 2 | `-?;x+?;y`→`y-x` (s); `-0`→`0` () |
| `collectNumbers` | 2157-2162 | 4 | `$n;a*(1/?;b)`→`a/b` (ags); `(\`+-$n);n1+(\`+-$n)\`+;n2 \`where abs(n1+n2)<infinity`→`eval(n1+n2)` (acg); `$n;n*$n;m \`where abs(n*m)<infinity`→`eval(n*m)` (acg); `(\`!$n)\`+;x*real:$n;n*((\`!$n)\`* `\| $z);y`→`n*x*y` (ags) |
| `simplifyFractions` | 2163-2168 | 4 | `($n;n*(?\`* `: 1);top)/($n;m*(?\`* `: 1);bottom) \`where gcd_without_pi_or_i(n,m)>1`→`(eval(n/gcd(...))*top)/(eval(m/gcd(...))*bottom)` (acg); `imaginary:$n;n/imaginary:$n;m`→`eval(n/i)/eval(m/i)` (); `?;=a/?;=a`→`1` (acg); `?;a/(?;b/?;c*?\`*;rest)`→`(a*c)/(b*rest)` (acg) |
| `zeroBase` | 2169-2171 | 1 | `0^?;x`→`0` () |
| `constantsFirst` | 2172-2174 | 1 | `(\`!\`+-$n);x*(real:$n/real:$n\`?);n`→`n*x` (asg) |
| `sqrtProduct` | 2175-2177 | 1 | `sqrt(?;x)*sqrt(?;y)`→`sqrt(x*y)` (agc) |
| `sqrtDivision` | 2178-2180 | 1 | `sqrt(?;x)/sqrt(?;y)`→`sqrt(x/y)` (agc) |
| `sqrtSquare` | 2181-2185 | 3 | `sqrt(?;x^2)`→`x` (); `sqrt(?;x)^2`→`x` (); ``sqrt(integer:$n;n) `where isint(sqrt(n))``→`eval(sqrt(n))` () |
| `trig` | 2186-2193 | 6 | `sin($n;n) \`where isint(2*n/pi)`→`eval(sin(n))` (); `cos($n;n) \`where isint(2*n/pi)`→`eval(cos(n))` (); `tan($n;n) \`where isint(n/pi)`→`0` (); `cosh(0)`→`1` (); `sinh(0)`→`0` (); `tanh(0)`→`0` () |
| `otherNumbers` | 2194-2196 | 1 | `(\`+-$n);n^$n;m \`where abs(n^m)<infinity`→`eval(n^m)` () |
| `cancelTerms` | 2197-2199 | 1 | macro `` ["term": `!$n] `@ (m_exactly(...) + m_exactly(...)) ``→`eval(n+m)*x` (acg) — collassa `n*x + m*x` in `eval(n+m)*x` gestendo anche `-x` come `-1*x` |
| `cancelFactors` | 2200-2203 | 2 | `?;=x^(? `: 1);n*?;=x^(? `: 1);m`→`x^(m+n)` (acg); `?;=x^(? `: 1);n/?;=x^(? `: 1);m`→`x^(n-m)` (acg) |
| `collectLikeFractions` | 2204-2206 | 1 | `(?\`+);a/?;=d+\`+-(?\`+);b/?;=d`→`(a+b)/d` (acg) |

Dopo `collectLikeFractions` (righe 2207-2227) c'è un **blocco di commento JS `/* ... */`** con 17
regole bozza per "cancellare potenze con la stessa base" (`canonical_compare`-based) — **codice morto,
mai eseguito**, va scartato o riproposto come TODO nel port.

**`conflictingSimplificationRules`** (righe 2233-2256) — 6 rule-set che **non entrano in `all`** e
vanno richiesti esplicitamente (confliggono con le regole di base, es. `canonicalOrder` con
`noLeadingMinus`):

| rule-set | righe | # regole | pattern → risultato (opz.) |
|---|---|---|---|
| `canonicalOrder` | 2235-2238 | 2 | `(\`+-?);x+(\`+-?);y \`where canonical_compare(x,y)=1`→`y+x` (ag); `?;x*?;y \`where canonical_compare(x,y)=-1`→`y*x` (ag) |
| `expandBrackets` | 2239-2242 | 2 | `(?;x+((\`+-?)\`+);y)*?;z`→`x*z+y*z` (ag); `?;x*(?;y+((\`+-?)\`+);z)`→`x*y+x*z` (ag) |
| `noDivision` | 2243-2245 | 1 | `?;top/(?;base^(?\`? `: 1);degree)`→`top*base^(-degree)` () |
| `rationalDenominators` | 2246-2248 | 1 | `?;a/(sqrt(?;surd)*?\`*;rest)`→`(a*sqrt(surd))/(surd*rest)` (acg) |
| `reduceSurds` | 2249-2252 | 2 | ``sqrt((\`+-$n);n*(?\`* `: 1);rest) `where abs(largest_square_factor(n))>1``→`eval(sqrt(...))*sqrt(...)` (acg); `sqrt((?;a)^(\`+-$n;n)*(?\`* `: 1);rest) \`where abs(n)>1`→`a^eval(trunc(n/2))*sqrt(a^eval(mod(n,2))*rest)` (acg) |
| `collectIntegerFactors` | 2253-2255 | 1 | `` `+-$n;a1*?;b1+`+-$n;a2*?`?;b2 `where abs(a1)>0 and abs(a2)>0 and gcd(a1,a2)>1``→`eval(gcd(a1,a2))*(...)` (acg) |

**Rule-set sintetico `all`** (riga 2288-2291): concatenazione di **tutte e sole** le regole dei 22
rule-set di `simplificationRules` (NON include i 6 `conflictingSimplificationRules`). Totale regole
attive: 53 in `simplificationRules` + 9 in `conflictingSimplificationRules` = **62 regole**, in
**29 rule-set con nome** (22 + 6 + `all`).

Ogni nome viene registrato sia con il case originale sia in minuscolo
(`jme.normaliseRulesetName` = `toLowerCase`, `jme.js:65-67`), riga 2278-2279: doppia chiave nello
stesso dizionario che punta allo stesso oggetto `Ruleset`.

Le regole vengono ri-sostituite (riga 2280-2285) in uno `subscope` locale che definisce le costanti
`i` e `pi` come numeri concreti, prima di essere assegnate a `jme.rules.simplificationRules` (riga
2293) — quindi i pattern/risultati compilati non contengono più i nomi `i`/`pi` come variabili libere
ma come literal numerici.

### 2.5 Superficie pubblica `Numbas.jme.rules.*`

| membro | riga | tipo |
|---|---|---|
| `extend_options` | 46 | funzione |
| `Rule` | 77 | classe |
| `Term` | 195 | classe |
| `getTerms` | 338 | funzione |
| `matchTree` | 484 | funzione |
| `number_conditions` | 537 | dizionario di predicati |
| `specialMatchNames` | 634 | dizionario di funzioni |
| `specialMatchFunctions` | 734 | dizionario di funzioni |
| `specialMatchOps` | 837 | dizionario di funzioni |
| `findCapturedNames` | 1108 | funzione |
| `findSequenceMatch` | 1393 | funzione |
| `extractLeadingMinus` | 1603 | funzione |
| `matchAllTree` | 1723 | funzione |
| `applyPostReplacement` | 1758 | funzione |
| `transform` | 1801 | funzione |
| `transformAll` | 1834 | funzione |
| `PatternParser` | 1850/1906 | classe |
| `patternParser` | 1913 | istanza singleton di `PatternParser` |
| `matchExpression` | 1927 | funzione (wrapper stringa→match) |
| `displayFlags` | 1946 | dizionario di default (9 flag `undefined`) |
| `Ruleset` | 1979 | classe |
| `collectRuleset` | 2051 | funzione |
| `simplificationRules` | 2109→2293 | dizionario `{nome: Ruleset}`, 29 chiavi effettive dopo il bootstrap |
| `compileRules` | 2265 | funzione |

Non esportate (interne al modulo, chiuse nella IIFE di `queueScript`): `parse_options`,
`quantifier_combo`, `nonStrictReplacements`, `nonStrictCanonicalOps`, `insertUnaryMinus`,
`unwrapCapture`, `preserve_match`, `matchName`, `setMatchOptions`, `matchAnywhere`, `matchFunction`,
`matchGenericFunction`, `matchGenericOp`, `matchOp`, `matchWhere`, `matchMacro`,
`matchOrdinaryFunction`, `matchList`, `matchToken`, `quantifier_limits`, `resolveName`,
`removeUnaryDivision`, `matchOrdinaryOp`, `matchTermSequence`, `matchAny`, `matchDefault`,
`matchOptionalPrefix`, `matchNot`, `matchUses`, `matchType`, `matchAnd`, `mergeMatches`,
`conflictingSimplificationRules`.

---

## 3. `jme-calculus.js`

Superficie pubblica: `Numbas.jme.calculus = {}` (riga 11), popolato con:

| membro | riga | tipo | note |
|---|---|---|---|
| `differentiation_rules` | 13-34 | `Array<Rule>` | 11 pattern (`[pattern, risultato]`, opzioni fisse `'acgs'`), compilati con `new jme.rules.Rule(...)` |
| `derivatives` | 42-65 | `Object<string, tree>` | 21 derivate note (sin, cos, e, ln, log, tan, cosec, sec, cot, arcsin, arccos, arctan, cosh, sinh, tanh, sech, cosech, coth, arccosh, arcsinh, arctanh, sqrt), ognuna compilata da stringa (`jme.compile`, riga 67-69) espressa in funzione di una variabile `x` |
| `distributing_derivatives` | 77-82 | `Object<string, true>` | `vector`, `matrix`, `rowvector` — funzioni su cui la derivata si distribuisce sugli argomenti |
| `differentiate(tree, x, scope)` | 93-178 | funzione | punto di ingresso |

Pattern di `differentiation_rules` (righe 14-24, tutti con opzioni `acgs`):

| pattern | risultato |
|---|---|
| `rational:$n` | `0` |
| `?;a+?\`+;b` | `$diff(a)+$diff(b)` |
| `?;a-?\`+;b` | `$diff(a)-$diff(b)` |
| `+?;a` | `$diff(a)` |
| `-?;a` | `-$diff(a)` |
| `?;u/?;v` | `(v*$diff(u)-u*$diff(v))/v^2` |
| `?;u*?;v\`+` | `u*$diff(v)+v*$diff(u)` |
| `e^?;p` | `$diff(p)*e^p` |
| `exp(?;p)` | `$diff(p)*exp(p)` |
| `(\`+-rational:$n);a^?;b` | `ln(a)*$diff(b)*a^b` |
| `?;a^(\`+-rational:$n);p` | `p*$diff(a)*a^(p-1)` |

Algoritmo (`differentiate`, righe 93-178): una funzione ricorsiva `base_differentiate(tree)` (righe
134-173) gestisce nell'ordine: numeri→0, nomi→1 se `== x` altrimenti 0, liste (distribuisce o azzera),
espressioni annidate (`tree.tok.type=='expression'`, spacchetta), operatori/funzioni unarie che hanno
una voce in `calculus.derivatives` (applica la regola della catena tramite `function_derivative_rule`,
riga 84: `m_func(?;f,?;a)` → `$diff(m_listval(a,0))*standard_derivative(f,m_listval(a,0))`, poi
`apply_diff` sostituisce `standard_derivative(nome,arg)` con la derivata nota valutata in `arg` via
sostituzione di scope), funzioni che si distribuiscono (`distributing_derivatives`), e infine prova
in ordine le 11 `differentiation_rules`. Se nulla matcha, lancia
`Numbas.Error("jme.calculus.unknown derivative")`. Prima di derivare, l'intero albero viene
semplificato con `jme.rules.simplificationRules.basic.simplify(tree, scope)` (riga 175).

`$diff(...)` non è una vera funzione JME: è un marcatore che `apply_diff` (righe 99-115) intercetta e
sostituisce ricorsivamente con `base_differentiate` del suo argomento — un trampolino per esprimere le
regole di riscrittura sopra in termini di "deriva ricorsivamente questo pezzo".

Dipendenze: `jme.compile`, `jme.isFunction`, `jme.isType`, `jme.castToType`, `jme.substituteTree`,
`jme.rules.Rule`, `jme.rules.simplificationRules.basic` (da `jme-rules.js`), `jme.display.treeToJME`
(solo nel messaggio di errore finale, riga 172 — unica dipendenza da `jme-display.js`, evitabile).
Nessun uso di `Math.random`, nessun DOM.

---

## 4. `jme-builtins.js`

### 4.1 Meccanismo di registrazione

Un'unica API, non ce ne sono altre nel file (verificato: nessun `newBuiltin`/`funcObj` diretto fuori
da questo meccanismo):

```js
function builtin_function_set() {
    const set = new jme.FunctionSet(...arguments);   // jme.js:2491-2557
    builtinScope.addFunctionSet(set);                 // jme.js:2726-2729
    return set;
}
builtin_function_set({name, description}, (set) => {
    set.add_function(name, intype, outcons, fn, options);   // jme.js:2524-2531 → new jme.funcObj(...)
    ...
});
```
`FunctionSet.add_function` (`jme.js:2524-2531`) crea un `jme.funcObj(name, intype, outcons, fn,
options)` (`jme.js:4558` — namespace `jme.js`, non uno dei tre file in scope, ma è il contratto che il
port deve riprodurre) e lo aggiunge sia al set sia, tramite `addFunctionSet`, allo scope globale
`builtinScope` (`jme-builtins.js:41`). `intype` è un array di costruttori di tipo (`TNum`, `TString`,
...), stringhe `'?'`/`'*?'`/`'[tipo]'`, o funzioni prodotte dagli helper `jme.signature.*` (`sig.*`,
`jme.js:5855+`): `sig.listof`, `sig.optional`, `sig.type`, `sig.multiple`, `sig.sequence`, `sig.or`,
`sig.dict`, `sig.anything`, `sig.list` — tutti usati in `jme-builtins.js`. `outcons` è il costruttore
del tipo di ritorno (o `'?'` per "qualunque tipo"). `fn` è la funzione JS pura (auto-valutante gli
argomenti) oppure `null` quando serve un `evaluate` personalizzato in `options` (per dispatch dinamico
sul tipo di ritorno, per funzioni lazy che devono valutare gli argomenti a mano, o per accedere allo
`scope`). `options.random` (bool) e `options.unwrapValues` sono i due flag rilevanti per il port.

I 21 costruttori di tipo usati (riga 29, destrutturati da `Numbas.jme.types`): `TNum`, `TInt`,
`TRational`, `TDecimal`, `TString`, `TBool`, `THTML`, `TList`, `TDict`, `TMatrix`, `TName`, `TRange`,
`TInterval`, `TSet`, `TVector`, `TExpression`, `TScope`, `TOp`, `TFunc`, `TLambda`, `TPromise`.

### 4.2 Tabella di layout (29 temi)

Ogni tema è un blocco `builtin_function_set({name: '...', description: '...'}, (set) => {...})`.
Attenzione: 5 blocchi (`rounding`, `number_theory`, `comparison`, `linear_algebra`, `booleans`) hanno
un'indentazione di 4 spazi residua da un refactor — sono comunque chiamate a livello di modulo, non
annidate semanticamente dentro `trigonometry`.

| tema | righe | # `add_function` | commento di sezione |
|---|---|---|---|
| `arithmetic` | 87-180 | 35 | `/*-- Arithmetic */` (86) |
| `complex_numbers` | 182-191 | 5 | `/*-- Trig, exponentials and roots */` (181) |
| `exponentials` | 192-215 | 11 | — |
| `trigonometry` | 216-275 | 34 | — |
| `rounding` | 281-423 | 38 | `/*-- Rounding */` (277) |
| `number_theory` | 425-528 | 29 | — |
| `comparison` | 531-566 | 13 | — |
| `linear_algebra` | 569-859 | 59 | — |
| `booleans` | 878-966 | 7 | `/*-- Booleans */` (876) |
| `set_theory` | 968-1018 | 10 | `/*-- Sets */` (967) |
| `intervals` | 1020-1091 | 21 | `/*-- Real intervals */` (1019) |
| `number_ranges` | 1108-1192 | 8 | `/*-- Ranges */` (1093) |
| `lists` | 1195-1547 | 40 | `/*-- Lists */` (1194) |
| `dictionaries` | 1550-1659 | 12 | `/*-- Dictionaries */` (1549) |
| `strings` | 1662-1812 | 31 | `/*-- Strings */` (1661) |
| `type_casting` | 1815-1913 | 8 | `/*-- Type casting */` (1814) |
| `number_parsing` | 1916-2152 | 42 | `/*-- Parsing numbers */` (1915) |
| `precision` | 2155-2192 | 12 | `/*-- Testing precision */` (2154) |
| `json` | 2195-2210 | 2 | `/*-- JSON */` (2194) |
| `jme` | 2213-2636 | 40 | `/*-- JME */` (2212) |
| `pattern_matching` | 2639-2766 | 7 | `/*-- Pattern matching */` (2638) |
| `html` | 2769-2924 | 9 | `/*-- HTML */` (2768) |
| `randomisation` | 2927-3012 | 9 | `/*-- Random */` (2926) |
| `control_flow` | 3015-3224 | 6 | `/*-- Control flow */` (3014) |
| `comprehensions` | 3227-3750 | 10 | `/*-- Map, reduce, comprehensions */` (3226) |
| `calculus` | 3753-3766 | 1 | `/*-- Calculus */` (3752) |
| `marking` | 3769-3782 | 2 | `/*-- Marking */` (3768) |
| `http` | 3785-3812 | 2 | — |
| `promises` | 3815-3824 | 1 | — |

Somma: **504 registrazioni** (`set.add_function(...)`) → **274 nomi distinti** globalmente (una
funzione con più overload, es. `+`, compare più volte). Estratte programmaticamente con uno script
Python che bilancia le parentesi di ogni chiamata (non un semplice grep, per gestire corpi multi-riga
e `sig.listof(sig.type(...))` annidati); verificate a campione a mano.

Costanti built-in (`Numbas.jme.builtin_constants`, righe 47-54, registrate via
`Numbas.jme.variables.makeConstants` riga 57):

| nome | valore | tex | note |
|---|---|---|---|
| `e` | `Math.E` | `e` | |
| `pi` | `Math.PI` | `\pi` | |
| `i` | `math.complex(0,1)` | `i` | |
| `infinity`, `infty` | `Infinity` | `\infty` | due alias per lo stesso valore |
| `NaN` | `NaN` | `\texttt{NaN}` | |
| `j` | `math.complex(0,1)` | `j` | `enabled: false` di default (alias ingegneristico di `i`, disattivabile/attivabile) |

Più la costante di scope `nothing` (`TNothing`, riga 42, fuori dall'array `builtin_constants`).

### 4.3 `jme.lazyOps` — operatori/funzioni lazy

`jme.lazyOps` è definito vuoto in `jme.js:4471` e popolato **solo** da `jme-builtins.js` con 32
`push`: `and`, `or`, `implies`, `nand`, `nor` (958-962, tema `booleans`), `repeat` (1294, `lists`),
`dict` (1599, `dictionaries`), `safe` (1707, `strings`), `isa` (1847, `type_casting`), `decimal`
(2137, `number_parsing`), `satisfy` (2273, `jme`), `isset` (2291), `unset` (2305), `expression`
(2372), `exec` (2431), `canonical_compare` (2528), `scope_case_sensitive` (2552), `seedrandom` (2973,
`randomisation`), `if`, `switch`, `let`, `assert`, `try` (3036-3185, `control_flow`), `|>` (3218),
`map`, `for:`, `filter`, `iterate`, `iterate_until`, `foldl`, `take` (3297-3705, `comprehensions`),
`diff` (3764, `calculus`).

Semantica: per queste 32 chiavi, il valutatore (`jme.js` — non in scope, ma il contratto da
riprodurre) passa alla funzione gli **alberi non valutati** degli argomenti invece dei token valutati;
la funzione stessa decide se/quando chiamare `scope.evaluate(args[i])`. Tutte queste 32 funzioni hanno
di conseguenza un `options.evaluate` custom (mai un `fn` semplice). **Non tutte** le funzioni con
`evaluate` custom sono lazy — vedi §8 (es. `ceil`/`floor`/`round`/`ordinamento (sort, ...)` hanno un
`evaluate` custom ma ricevono argomenti già valutati, serve solo per il dispatch sul tipo di ritorno).

13 di queste registrano anche un gestore in `jme.findvarsOps` (dizionario in `jme.js:4815`, popolato
qui) perché legano nomi locali che il walker delle variabili libere deve escludere: `safe` (1708),
`render` (1720), `satisfy` (2274), `isset` (2292), `let` (3104), `try` (3186), `|>` (3219), `map`
(3298), `for:` (3435), `filter` (3524), `iterate` (3562), `iterate_until` (3614), `foldl` (3659),
`take` (3706) — 14 registrazioni in tutto (elenco sopra ne conta 14, non 13; correzione).

`jme.isDeterministicOps` (dizionario in `jme.js:4823`) riceve **una sola** registrazione da
`jme-builtins.js`: `seedrandom` (riga 2974) — dichiara che il primo argomento (il seed) è comunque
deterministico anche se l'espressione complessiva non lo è.

### 4.4 Catalogo completo dei builtin, per tema

Legenda note: **LAZY** = nome presente in `jme.lazyOps` (comportamento lazy globale, vale per *tutti*
gli overload di quel nome); `custom-eval` = ha un `options.evaluate` personalizzato ma **non** è lazy
(riceve argomenti già valutati); `unwrap` = `options.unwrapValues` (gli argomenti arrivano come valori
JS grezzi, non token); `random` = `options.random:true` (marcata casuale ai fini di
`jme.isRandom`/coverage test); `DOM` = costruisce nodi `document.createElement(...)`; `display` /
`calculus` / `rules` = chiama rispettivamente `jme.display.*`, `jme.calculus.*`,
`jme.rules.*`/`jme.collectRuleset`; `Math.random-direct` = tocca `Math.random`/`Math.seedrandom`
direttamente (non tramite `Numbas.math`). Righe = riga della singola chiamata `set.add_function`.

#### arithmetic (righe 89-175, 8 nomi, 35 firme)

| nome | firme (tipi → ritorno) @riga | note |
|---|---|---|
| `+u` | `[TNum]→TNum` @89; `[TInt]→TInt` @101; `[TRational]→TRational` @116; `[TDecimal]→TDecimal` @142 | |
| `-u` | `[TNum]→TNum` @92; `[TInt]→TInt` @104; `[TRational]→TRational` @119; `[TDecimal]→TDecimal` @145 | |
| `+` | `[TNum,TNum]→TNum` @93; `[TInt,TInt]→TInt` @105; `[TRational,TRational]→TRational` @122; `[TDecimal,TDecimal]→TDecimal` @148; `[TNum,TDecimal]→TDecimal` @151 | |
| `-` | `[TNum,TNum]→TNum` @94; `[TInt,TInt]→TInt` @106; `[TRational,TRational]→TRational` @125; `[TDecimal,TDecimal]→TDecimal` @154; `[TNum,TDecimal]→TDecimal` @157 | |
| `*` | `[TNum,TNum]→TNum` @95; `[TInt,TInt]→TInt` @107; `[TRational,TRational]→TRational` @128; `[TRational,TNum]→TNum` @131; `[TDecimal,TDecimal]→TDecimal` @160 | |
| `/` | `[TNum,TNum]→TNum` @96; `[TInt,TInt]→TRational` @108; `[TRational,TRational]→TRational` @134; `[TDecimal,TDecimal]→TDecimal` @163; `[TNum,TDecimal]→TDecimal` @166 | |
| `^` | `[TNum,TNum]→TNum` @97; `[TInt,TInt]→TInt` @111; `[TRational,TInt]→TRational` @137; `[TDecimal,TDecimal]→TDecimal` @172; `[TInt,TDecimal]→TDecimal` @175 | |
| `abs` | `[TNum]→TNum` @98; `[TDecimal]→TDecimal` @169 | |

#### complex_numbers (righe 183-187, 4 nomi, 5 firme)

| nome | firme @riga | note |
|---|---|---|
| `arg` | `[TNum]→TNum` @183; `[TDecimal]→TDecimal` @187 | |
| `re` | `[TNum]→TNum` @184 | |
| `im` | `[TNum]→TNum` @185 | |
| `conj` | `[TNum]→TNum` @186 | |

#### exponentials (righe 193-211, 5 nomi, 11 firme)

| nome | firme @riga | note |
|---|---|---|
| `sqrt` | `[TNum]→TNum` @193; `[TDecimal]→TDecimal` @211 | |
| `ln` | `[TNum]→TNum` @194; `[TDecimal]→TDecimal` @208 | |
| `log` | `[TNum]→TNum` @195; `[TNum,TNum]→TNum` @196; `[TDecimal]→TDecimal` @197; `[TDecimal,TDecimal]→TDecimal` @200 | |
| `exp` | `[TNum]→TNum` @203; `[TDecimal]→TDecimal` @205 | |
| `gamma` | `[TNum]→TNum` @204 | |

#### trigonometry (righe 217-274, 21 nomi, 34 firme)

| nome | firme @riga | note |
|---|---|---|
| `sin` | `[TNum]→TNum` @217; `[TDecimal]→TDecimal` @271 | |
| `cos` | `[TNum]→TNum` @218; `[TDecimal]→TDecimal` @238 | |
| `tan` | `[TNum]→TNum` @219; `[TDecimal]→TDecimal` @274 | |
| `cosec` | `[TNum]→TNum` @220 | |
| `sec` | `[TNum]→TNum` @221 | |
| `cot` | `[TNum]→TNum` @222 | |
| `arcsin` | `[TNum]→TNum` @223; `[TDecimal]→TDecimal` @262 | |
| `arccos` | `[TNum]→TNum` @224; `[TDecimal]→TDecimal` @250 | |
| `arctan` | `[TNum]→TNum` @225; `[TDecimal]→TDecimal` @265 | |
| `sinh` | `[TNum]→TNum` @226; `[TDecimal]→TDecimal` @244 | |
| `cosh` | `[TNum]→TNum` @227; `[TDecimal]→TDecimal` @241 | |
| `tanh` | `[TNum]→TNum` @228; `[TDecimal]→TDecimal` @247 | |
| `cosech` | `[TNum]→TNum` @229 | |
| `sech` | `[TNum]→TNum` @230 | |
| `coth` | `[TNum]→TNum` @231 | |
| `arcsinh` | `[TNum]→TNum` @232; `[TDecimal]→TDecimal` @256 | |
| `arccosh` | `[TNum]→TNum` @233; `[TDecimal]→TDecimal` @253 | |
| `arctanh` | `[TNum]→TNum` @234; `[TDecimal]→TDecimal` @259 | |
| `atan2` | `[TNum,TNum]→TNum` @235; `[TDecimal,TDecimal]→TDecimal` @268 | |
| `degrees` | `[TNum]→TNum` @236 | |
| `radians` | `[TNum]→TNum` @237 | |

#### rounding (righe 282-400, 11 nomi, 38 firme)

| nome | firme @riga | note |
|---|---|---|
| `ceil` | `[TNum]→TNum` @282; `[TRational]→TInt` @357; `[TDecimal]→TDecimal` @364 | custom-eval |
| `floor` | `[TNum]→TNum` @292; `[TRational]→TInt` @354; `[TDecimal]→TDecimal` @367 | custom-eval |
| `round` | `[TNum]→TNum` @302; `[TDecimal]→TDecimal` @370 | custom-eval |
| `tonearest` | `[TNum,TNum]→TNum` @312; `[TDecimal,TDecimal]→TDecimal` @381 | |
| `trunc` | `[TNum]→TNum` @313; `[TNum,TNum]→TNum` @314; `[TRational]→TInt` @351; `[TDecimal]→TDecimal` @384 | |
| `fract` | `[TNum]→TNum` @315; `[TRational]→TRational` @360; `[TDecimal]→TDecimal` @387 | |
| `sign` | `[TNum]→TNum` @316 | |
| `max` | `[TNum,TNum]→TNum` @317; `[TRange]→TNum` @322; `[list numeri]→TNum` @328; `[TInt,TInt]→TInt` @336; `[list interi]→TInt` @338; `[TRational,TRational]→TRational` @340; `[list razionali]→TRational` @342; `[TDecimal,TDecimal]→TDecimal` @374; `[list decimali]→TDecimal` @375 | unwrap |
| `min` | speculare a `max` @318,325,332,337,339,341,345,373,378 | unwrap |
| `clamp` | `[TNum,TNum,TNum]→TNum` @319 | |
| `precround`/`siground` | generati da helper `function_with_precision_info` (righe 396-419: `TNum`+`TMatrix`+`TVector`+`TDecimal`, 6 firme totali) | unwrap; **non contate nella riga 400 sopra, vedi nota** |

Nota: la riga `name @400` nella tabella grezza è il corpo generico di
`function_with_precision_info(name, fn, type, precisionType)` (righe 391-400), invocato 6 volte
(righe 402-419) per registrare `precround`/`siground` su `TNum`/`TMatrix`/`TVector`/`TDecimal` — non
un builtin chiamato letteralmente `name`. Vanno contate come 6 registrazioni aggiuntive (già incluse
nel totale di 38 per il tema, ma il nome effettivo è `precround`/`siground`, non `name`).

#### number_theory (righe 426-520, 15 nomi, 29 firme)

| nome | firme @riga | note |
|---|---|---|
| `rational_approximation` | `[TNum]→TList` @426; `[TNum,TNum]→TList` @431 | |
| `factorise` | `[TNum]→TList` @436 | |
| `largest_square_factor` | `[TNum]→TInt` @442; `[TInt]→TInt` @453 | |
| `divisors` | `[TNum]→TList` @443; `[TInt]→TList` @454 | |
| `proper_divisors` | `[TNum]→TList` @448; `[TInt]→TList` @459 | |
| `fact` | `[TNum]→TNum` @465; `[TInt]→TInt` @470 | |
| `mod` | `[TNum,TNum]→TNum` @466; `[TInt,TInt]→TInt` @519; `[TDecimal,TDecimal]→TDecimal` @520 | |
| `perm` | `[TNum,TNum]→TNum` @467; `[TInt,TInt]→TInt` @472 | |
| `comb` | `[TNum,TNum]→TNum` @468; `[TInt,TInt]→TInt` @473 | |
| `\|` (divide) | `[TInt,TInt]→TBool` @471; `[TNum,TNum]→TBool` @518 | operatore binario "divide esattamente" |
| `root` | `[TNum,TNum]→TNum` @475 | |
| `gcd` | `[TNum,TNum]→TNum` @476; `[TInt,TInt]→TInt` @477 | unwrap |
| `gcd_without_pi_or_i` | `[TNum,TNum]→TNum` @480 | usato dalle regole `simplifyFractions` |
| `coprime` | `[TNum,TNum]→TBool` @491 | |
| `lcm` | `[*numeri]→TNum` @492; `[*interi]→TInt` @493; `[list interi]→TInt` @496; `[list numeri]→TNum` @507 | unwrap |

#### comparison (righe 532-562, 7 nomi, 13 firme)

| nome | firme @riga | note |
|---|---|---|
| `<` | `[TNum,TNum]→TBool` @532; `[TDecimal,TDecimal]→TBool` @556 | |
| `>` | `[TNum,TNum]→TBool` @533; `[TDecimal,TDecimal]→TBool` @547 | |
| `<=` | `[TNum,TNum]→TBool` @534; `[TDecimal,TDecimal]→TBool` @559; `[TDecimal,TNum]→TBool` @562 | |
| `>=` | `[TNum,TNum]→TBool` @535; `[TDecimal,TDecimal]→TBool` @550; `[TDecimal,TNum]→TBool` @553 | |
| `<>` | `['?','?']→TBool` @536 | custom-eval (uguaglianza polimorfica) |
| `=` | `['?','?']→TBool` @541 | custom-eval |
| `isclose` | `[TNum,TNum,num?,num?]→TBool` @546 | |

#### linear_algebra (righe 570-856, 30 nomi, 59 firme)

| nome | firme @riga | note |
|---|---|---|
| `+u`/`-u` | `[TVector]→TVector`, `[TMatrix]→TMatrix` @570,573,577,578 | |
| `+`/`-` | `[TVector,TVector]→TVector`, `[TMatrix,TMatrix]→TMatrix` @579-582 | |
| `*` | `[TNum,TVector]`,`[TVector,TNum]`,`[TMatrix,TVector]`,`[TNum,TMatrix]`,`[TMatrix,TNum]`,`[TMatrix,TMatrix]`,`[TVector,TMatrix]` @583-593 | 7 overload |
| `/` | `[TMatrix,TNum]→TMatrix` @594; `[TVector,TNum]→TVector` @597 | |
| `dot` | `TVector×TVector`,`TMatrix×TVector`,`TVector×TMatrix`,`TMatrix×TMatrix`→`TNum` @600-603 | |
| `cross` | come `dot` ma →`TVector` @604-607 | |
| `det` | `[TMatrix]→TNum` @608 | |
| `numrows` | `[TMatrix]→TNum` @609 **e** @632 (duplicato, vedi §8) | |
| `numcolumns` | `[TMatrix]→TNum` @612 **e** @635 (duplicato) | |
| `angle` | `[TVector,TVector]→TNum` @615 | |
| `transpose` | `[TVector]→TMatrix` @616; `[TMatrix]→TMatrix` @617; `[list of list]→TList` @618 | custom-eval (3ª firma) |
| `is_zero` | `[TVector]→TBool` @629 | |
| `id` | `[TNum]→TMatrix` @630 | |
| `sum_cells` | `[TMatrix]→TNum` @631 | |
| `combine_vertically`/`stack` | `[TMatrix,TMatrix]→TMatrix` @638,641 | alias |
| `combine_horizontally`/`augment` | `[TMatrix,TMatrix]→TMatrix` @644,647 | alias |
| `combine_diagonally` | `[TMatrix,TMatrix]→TMatrix` @650 | |
| `lu_decomposition` | `[TMatrix]→TList` @653 | custom-eval |
| `gauss_jordan_elimination` | `[TMatrix]→TMatrix` @661 | |
| `inverse` | `[TMatrix]→TMatrix` @663 | |
| `is_scalar_multiple` | `[TVector,TVector,num?,num?]→TBool` @664 | |
| `abs` | `[TVector]→TNum` @665 | |
| `listval` | `[TVector,TNum]→TNum` @666; `[TVector,TRange]→TVector` @673; `[TMatrix,TNum]→TVector` @686; `[TMatrix,TRange]→TMatrix` @693 | custom-eval |
| `vector` | `[*numeri]→TVector` @705; `[list numeri]→TVector` @719 | custom-eval |
| `matrix` | `[list vettori]` @734; `[list of list numeri]` @759; `[list numeri]` @788; `[*list numeri]` @815 →`TMatrix` | custom-eval, 4 firme |
| `rowvector` | `[*numeri]→TMatrix` @838; `[list numeri]→TMatrix` @856 | custom-eval |

#### booleans (righe 879-946, 7 nomi, 7 firme)

| nome | firma @riga | note |
|---|---|---|
| `and` | `[TBool,TBool]→TBool` @879 | **LAZY** — se il primo è un `set`, delega a intersezione insiemi |
| `not` | `[TBool]→TBool` @897 | |
| `or` | `[TBool,TBool]→TBool` @900 | **LAZY** — se il primo è un `set`, delega a unione |
| `xor` | `[TBool,TBool]→TBool` @918 | |
| `implies` | `[TBool,TBool]→TBool` @922 | **LAZY** |
| `nand` | `[TBool,TBool]→TBool` @934 | **LAZY** |
| `nor` | `[TBool,TBool]→TBool` @946 | **LAZY** |

#### set_theory (righe 969-1011, 8 nomi, 10 firme)

| nome | firme @riga | note |
|---|---|---|
| `set` | `[TList]→TSet` @969; `[TRange]→TSet` @974; `[*?]→TSet` @980 | custom-eval |
| `union` | `[TSet,TSet]→TSet` @985 | custom-eval |
| `intersection` | `[TSet,TSet]→TSet` @990 | custom-eval |
| `or` | `[TSet,TSet]→TSet` @995 | **LAZY** (stesso nome globale di `booleans`/`intervals`) |
| `and` | `[TSet,TSet]→TSet` @1000 | **LAZY** |
| `-` | `[TSet,TSet]→TSet` @1005 | custom-eval (differenza insiemistica) |
| `abs` | `[TSet]→TNum` @1010 | |
| `in` | `['?',TSet]→TBool` @1011 | custom-eval |

#### intervals (righe 1021-1086, 19 nomi, 21 firme)

| nome | firme @riga | note |
|---|---|---|
| `interval` | `[num,num,bool?,bool?]→TInterval` @1021 | |
| `union` | `[*interval]→TInterval` @1025; `[list interval]→TInterval` @1034 | custom-eval |
| `+`/`or` | `[TInterval,TInterval]→TInterval` @1045,1046 | `or` **LAZY** |
| `intersection` | `[*interval]`/`[list interval]→TInterval` @1048,1057 | custom-eval |
| `*`/`and` | `[TInterval,TInterval]→TInterval` @1068,1069 | `and` **LAZY** |
| `complement`/`not` | `[TInterval]→TInterval` @1071,1072 | alias |
| `difference`/`-`/`except` | `[TInterval,TInterval]→TInterval` @1074,1075,1076 | alias |
| `start`/`end` | `[TInterval]→TNum` @1078,1079 | |
| `open_start`/`open_end`/`closed_start`/`closed_end` | `[TInterval]→TBool` @1081-1084 | |
| `components` | `[TInterval]→TList` @1086 | |

#### number_ranges (righe 1109-1188, 5 nomi, 8 firme)

| nome | firme @riga | note |
|---|---|---|
| `..` | `[TNum,TNum]→TRange` @1109 | operatore range |
| `#` | `[TRange,TNum]→TRange` @1110 | imposta il passo |
| `in` | `[TNum,TRange]→TBool` @1111 | |
| `except` | `[TRange,TRange]`,`[TRange,list numeri]`,`[TRange,TNum]`,`[TList,TRange]→TList` @1129,1150,1165,1178 | 4 overload |
| `abs` | `[TRange]→TNum` @1188 | lunghezza del range |

#### lists (righe 1196-1525, 26 nomi, 40 firme)

| nome | firme @riga | note |
|---|---|---|
| `+` | `[TList,TList]`,`[TList,'?']→TList` @1196,1202 | custom-eval |
| `list` | `[TRange]→TList` @1209 | |
| `except` | `[TList,TList]`,`[TList,'?']→TList` @1215,1220 | custom-eval |
| `distinct` | `[TList]→TList` @1225 | custom-eval |
| `in` | `['?',TList]→TBool` @1230 | custom-eval |
| `abs` | `[TList]→TNum` @1235 | lunghezza |
| `sum` | numeri/interi/decimali/razionali/`TVector` @1238-1256 (5 firme) | unwrap |
| `prod` | come `sum` @1258-1276 (5 firme) | unwrap |
| `reorder` | `[TList,list numeri]→TList` @1277 | |
| `repeat` | `['?',TNum]→TList` @1284 | **LAZY** |
| `listval` | `[TList,TNum]→'?'` @1295; `[TList,TRange]→TList` @1313 | custom-eval |
| `flatten` | `[list of list]→TList` @1335 | custom-eval |
| `groups_of` | `[TList,TNum]→TList` @1344 | custom-eval |
| `enumerate` | `[TList]→TList` @1361 | |
| `sort` | `[TList]→TList` @1366 | custom-eval |
| `sort_by` | `[TNum,list liste]`,`[TString,list dict]→TList` @1374,1386 | custom-eval |
| `sort_destinations` | `[TList]→TList` @1398 | custom-eval |
| `group_by` | `[TNum,list liste]`,`[TString,list dict]→TList` @1418,1442 | custom-eval |
| `reverse` | `[TList]→TList` @1466 | custom-eval |
| `indices` | `[TList,'?']→TList` @1473 | custom-eval |
| `product` | `[*list]`,`[TList,TNum]→TList` @1486,1494 | prodotto cartesiano / potenza |
| `zip` | `[*list]→TList` @1500 | |
| `combinations` | `[TList,TNum]→TList` @1507 | |
| `combinations_with_replacement` | `[TList,TNum]→TList` @1513 | |
| `permutations` | `[TList,TNum]→TList` @1519 | |
| `frequencies` | `[TList]→[TList]` @1525 | custom-eval |

#### dictionaries (righe 1568-1655, 10 nomi, 12 firme)

| nome | firme @riga | note |
|---|---|---|
| `+` | `[TDict,TDict]→TDict` @1568 | |
| `merge` | `[*dict]`,`[list dict]→TDict` @1570,1571 | |
| `dict` | `[*keypair]→TDict` @1572 | **LAZY** |
| `keys` | `[TDict]→TList` @1600 | |
| `values` | `[TDict]`,`[TDict,list string]→TList` @1607,1614 | |
| `items` | `[TDict]→TList` @1623 | custom-eval |
| `listval` | `[TDict,TString]→'?'` @1632 | custom-eval |
| `get` | `[TDict,TString,'?']→'?'` @1642 | custom-eval |
| `in` | `[TString,TDict]→TBool` @1652 | |
| `abs` | `[TDict]→TNum` @1655 | |

#### strings (righe 1666-1808, 25 nomi, 31 firme)

| nome | firme @riga | note |
|---|---|---|
| `+` | `[TString,'?']`,`['?',TString]→TString` @1666,1667 | |
| `formatstring` | `[TString,TList]→TString` @1668 | custom-eval |
| `unpercent` | `[TString]→TNum` @1677 | |
| `letterordinal` | `[TNum]→TString` @1678 | |
| `latex` | `[TString]→TString` @1679 | custom-eval (marca la stringa come LaTeX "safe") |
| `safe` | `[TString]→TString` @1688 | **LAZY** — disattiva la sostituzione di variabili `{...}` nella stringa |
| `render` | `[TString,dict?]→TString` @1712 | custom-eval |
| `capitalise`/`upper`/`lower` | `[TString]→TString` @1730,1733,1736 | |
| `pluralise` | `[TNum,TString,TString]→TString` @1739 | |
| `join` | `[TList,TString]→TString` @1742 | custom-eval |
| `split` | `[TString,TString]→TList` @1751 | |
| `trim` | `[TString]→TString` @1756 | |
| `currency` | `[TNum,TString,TString]→TString` @1759 | |
| `separateThousands` | `[TNum,TString]→TString` @1760 | |
| `listval` | `[TString,TNum]`,`[TString,TRange]→TString` @1761,1764 | |
| `in` | `[TString,TString]→TBool` @1767 | substring |
| `lpad`/`rpad` | `[TString,TNum,TString]→TString` @1770,1771 | |
| `match_regex` | `[TString,TString]`,`[TString,TString,TString]→TList` @1772,1777 | unwrap |
| `split_regex` | `[TString,TString]`,`[TString,TString,TString]→TList` @1783,1788 | |
| `replace_regex` | `[TString×3]`,`[TString×4]→TString` @1794,1798 | |
| `abs` | `[TString]→TNum` @1802 | lunghezza |
| `translate` | `[TString]`,`[TString,TDict]→TString` @1805,1808 | unwrap; **dipende da `R()` globale (i18next)** |

#### type_casting (righe 1816-1895, 6 nomi, 8 firme)

| nome | firme @riga | note |
|---|---|---|
| `int` | `[TNum]→TInt` @1816 | |
| `rational` | `[TNum]→TRational` @1819 | |
| `isa` | `['?',TString]→TBool` @1824 | **LAZY** |
| `list` | `[TSet]`,`[TVector]`,`[TMatrix]→TList` @1848,1856,1866 | custom-eval |
| `string` | `[TExpression,fmt?,fmt?]→TString` @1879 | custom-eval, rules (via `jme.collectRuleset`/notazioni) |
| `latex` | `[TExpression,fmt?]→TString` @1895 | custom-eval, display, rules — **producibile come stringa pura**, non serve DOM |

#### number_parsing (righe 1917-2144, 24 nomi, 42 firme)

| nome | firme @riga | note |
|---|---|---|
| `dpformat` | 3 firme @1917-1923 | |
| `sigformat` | 3 firme @1926-1932 | |
| `formatnumber` | 2 firme @1935,1938 | |
| `string` | `[TNum]` @1941; `[TInt]` @2080; `[TRational]` @2081; `[TDecimal]` @2084 →`TString` | 4 firme (nome condiviso col tema `jme`) |
| `parsenumber` | 2 firme @1942,1945 | unwrap |
| `parsenumber_or_fraction` | 3 firme @1948-1954 | unwrap |
| `with_precision` | `[TNum,num-o-nothing,string-o-nothing]→TNum` @1958 | custom-eval |
| `imprecise` | `[TNum]→TNum` @1980 | custom-eval |
| `parsedecimal` | 2 firme @1991,1994 | unwrap |
| `parsedecimal_or_fraction` | 3 firme @1997-2003 | unwrap |
| `tobinary`/`tooctal`/`tohexadecimal` | `[TInt]→TString` @2007,2010,2013 | unwrap |
| `tobase` | `[TInt,TInt]→TString` @2016 | unwrap |
| `frombinary`/`fromoctal`/`fromhexadecimal` | `[TString]→TInt` @2019,2022,2025 | |
| `frombase` | `[TString,TInt]→TInt` @2028 | |
| `scientificnumberlatex` | `[TNum]`,`[TDecimal]→TString` @2032,2046 | custom-eval |
| `scientificnumberhtml` | `[TDecimal]`,`[TNum]→THTML` @2057,2064 | **DOM** (`document.createElement('span')`) |
| `matchnumber` | `[TString,list string]→TList` @2074 | unwrap |
| `cleannumber` | `[TString,list string?]→TString` @2078 | unwrap |
| `isbool` | `[TString]→TBool` @2079 | |
| `decimal` | `[TNum]` @2085; `[TRational]` @2138; `[TString]` @2144 →`TDecimal` | **LAZY**, unwrap (solo 3ª firma) |

#### precision (righe 2156-2188, 8 nomi, 12 firme)

| nome | firme @riga | note |
|---|---|---|
| `togivenprecision` | `[TString,TString,TNum,TBool]→TBool` @2156 | |
| `togivenprecision_scientific` | `[TString,TString,TNum]→TBool` @2157 | |
| `withintolerance` | `[TNum,TNum,TNum]→TBool` @2158 | |
| `countdp` | `[TString]`,`[TDecimal]→TNum/TInt` @2159,2162 | |
| `countsigfigs` | `[TString]`,`[TDecimal]→TNum/TInt` @2165,2188 | |
| `isint` | `[TDecimal]`,`[TNum]→TBool` @2169,2172 | |
| `isnan` | `[TDecimal]`,`[TNum]→TBool` @2176,2182 | |
| `iszero` | `[TDecimal]→TBool` @2179 | |

#### json (righe 2196-2202, 2 nomi, 2 firme)

| nome | firma @riga | note |
|---|---|---|
| `json_decode` | `[TString]→'?'` @2196 | custom-eval |
| `json_encode` | `['?']→TString` @2202 | custom-eval |

#### jme (righe 2214-2625, 33 nomi, 40 firme)

| nome | firme @riga | note |
|---|---|---|
| `jme_string` | `['?']→TString` @2214 | custom-eval, display |
| `satisfy` | `[TList,TList,TList,TNum]→TList` @2259 | **LAZY** (genera variabili finché una condizione è vera, max 100 tentativi) |
| `isset` | `[TName]→TBool` @2285 | **LAZY** |
| `unset` | `[TDict,'?']→'?'` @2298 | **LAZY** |
| `parse` | `[TString]`,`[TString,TString]→TExpression` @2307,2311 | |
| `expand_juxtapositions` | `[TExpression,scope?,dict?]→TExpression` @2315 | custom-eval |
| `normalise_subscripts` | `[TString]→TString` @2324 | custom-eval |
| `expression` | `[TString]→TExpression` @2331 | **LAZY** |
| `args` | `[TExpression]→TList` @2373 | custom-eval |
| `as` | `['?',TString]→'?'` @2383 | custom-eval (cast esplicito) |
| `type` | `[TExpression]`,`['?']→TString` @2389,2394 | custom-eval |
| `name` | `[TString]→TName` @2399 | |
| `string` | `[TName]→TString` @2402 | (nome condiviso con `number_parsing`) |
| `op` | `[TString]→TOp` @2405 | |
| `function` | `[TString]→TFunc` @2408 | |
| `exec` | `[funzione-o-operatore,TList]→TExpression` @2411 | **LAZY** |
| `simplify` | `[TExpression,TString]`,`[TExpression,TList]`,`[TString,TString]→TExpression` @2433,2440,2449 | custom-eval, display, rules |
| `eval` | `[TExpression]`,`[TExpression,TDict]`,`[TExpression,TScope]`,`[TExpression,TScope,TDict]→'?'` @2454,2460,2561,2569 | custom-eval |
| `findvars` | `[TExpression]→TList` @2466 | custom-eval |
| `definedvariables` | `[]→TList` @2474 | custom-eval |
| `infer_variable_types` | `[TExpression]→TDict` @2482 | custom-eval |
| `infer_type` | `[TExpression]→TString` @2493 | custom-eval |
| `make_variables` | `[dict-di-expression,range?]→TDict` @2500 | custom-eval — chiama `jme.variables.makeVariables` |
| `canonical_compare` | `['?','?']→TNum` @2522 | **LAZY** |
| `numerical_compare` | `[TExpression,TExpression]→TBool` @2530 | custom-eval |
| `debug_log` | `['?','?']→'?'` @2538 | custom-eval (`console.log`) |
| `scope_case_sensitive` | `['?',TBool]→'?'` @2545 | **LAZY** |
| `scope` | `[]→TScope` @2555 | custom-eval |
| `case_sensitive` | `[TScope,TBool]→TScope` @2578 | custom-eval |
| `set_variables` | `[TScope,TDict]→TScope` @2587 | custom-eval |
| `add_function_sets` | `[TScope,list string]→TScope` @2599 | custom-eval |
| `add_functions` | `[TScope,list string]→TScope` @2611 | custom-eval |
| `remove_functions` | `[TScope,list string]→TScope` @2625 | custom-eval |

#### pattern_matching (righe 2668-2750, 4 nomi, 7 firme)

| nome | firme @riga | note |
|---|---|---|
| `match` | `[TExpression,TString]`,`[TExpression,TString,TString]→TDict` @2668,2676 | custom-eval — usa `jme.rules.Rule#match` |
| `matches` | `[TExpression,TString]`,`[...,TString]→TBool` @2700,2708 | custom-eval |
| `replace` | `[TString,TString,TExpression]`,`[...,TString]→TExpression` @2732,2741 | custom-eval — `jme.rules.Rule#replaceAll` |
| `substitute` | `[TDict,TExpression]→TExpression` @2750 | custom-eval |

#### html (righe 2770-2918, 7 nomi, 9 firme) — **fuori scope, vedi §6**

| nome | firme @riga | note |
|---|---|---|
| `html` | `[TString]→THTML` @2770 | custom-eval, DOM, `jme.variables.DOMcontentsubber` |
| `isnonemptyhtml` | `[TString]→TBool` @2785 | pura (nessun DOM) |
| `image` | `[TString,num?,num?]→THTML` @2788 | custom-eval, DOM |
| `escape_html` | `[TString]→TString` @2810 | DOM (usa `<p>` per escapare, ma output è stringa) |
| `table` | 3 overload @2829,2865,2893 →`THTML` | custom-eval, DOM |
| `max_width`/`max_height` | `[TNum,THTML]→THTML` @2913,2918 | manipola `style` di un nodo |

#### randomisation (righe 2928-3006, 7 nomi, 9 firme)

| nome | firme @riga | note |
|---|---|---|
| `random` | `[TRange]→TNum` @2928; `[TList]→'?'` @2937; `[*?]→'?'` @2943 | custom-eval, random |
| `weighted_random` | `[list di coppie valore-peso]→'?'` @2949 | custom-eval, random |
| `seedrandom` | `['?','?']→'?'` @2959 | **LAZY**, Math.random-direct — sostituisce temporaneamente `Math.random` globale, poi la ripristina in un `finally` |
| `deal` | `[TNum]→TList` @2978 | random |
| `shuffle` | `[TList]→TList` @2988 | random |
| `shuffle_together` | `[list di list]→TList` @2996 | random |
| `random_integer_partition` | `[TNum,TNum]→TList` @3006 | random |

#### control_flow (righe 3016-3213, 6 nomi, 6 firme)

| nome | firma @riga | note |
|---|---|---|
| `if` | `[TBool,'?','?']→'?'` @3016 | **LAZY** |
| `switch` | `[coppie(bool,qualsiasi)...,default]→'?'` @3037 | **LAZY** |
| `let` | `[dict-o-coppie(nome,valore),'?']→TList` @3060 | **LAZY** |
| `assert` | `[TBool,'?']→'?'` @3162 | **LAZY** |
| `try` | `['?',TName,'?']→'?'` @3173 | **LAZY** — cattura l'errore e lo lega al nome |
| `\|>` | `['?','?']→'?'` @3213 | **LAZY** — operatore pipe |

#### comprehensions (righe 3276-3746, 10 nomi, 10 firme)

| nome | firma @riga | note |
|---|---|---|
| `map` | `['?',TName,'?']→TList` @3276 | **LAZY** |
| `for:` | `['?',TName,'?']→TList` @3306 | **LAZY** (sintassi `for: expr of: list`) |
| `filter` | `['?',TName,'?']→TList` @3503 | **LAZY** |
| `iterate` | `['?',TName,'?',TNum]→TList` @3544 | **LAZY** |
| `iterate_until` | `['?',TName,'?','?',num?]→TList` @3583 | **LAZY** |
| `foldl` | `['?',TName,TName,'?',TList]→'?'` @3643 | **LAZY** |
| `take` | `[TNum,'?',TName,'?']→TList` @3682 | **LAZY** |
| `separate` | `[TList,TLambda]→TList` @3717 | custom-eval (partiziona una lista secondo un predicato lambda) |
| `all` | `[list bool]→TBool` @3743 | |
| `some` | `[list bool]→TBool` @3746 | |

#### calculus (riga 3754, 1 nome, 1 firma)

| nome | firma @riga | note |
|---|---|---|
| `diff` | `[TExpression,string]→TExpression` @3754 | **LAZY**, calculus, display, rules — unico punto in cui `jme-builtins.js` chiama `jme.calculus.differentiate` |

#### marking (righe 3770-3774, 2 nomi, 2 firme)

| nome | firma @riga | note |
|---|---|---|
| `award` | `[TNum,TBool]→TNum` @3770 | |
| `resultsequal` | `['?','?',TString,TNum]→TBool` @3774 | custom-eval — usa `jme.checkingFunctions`/`jme.resultsEqual` (in `marking.js`, fuori scope qui) |

#### http (righe 3801-3807, 2 nomi, 2 firme) — **fuori scope, vedi §6**

| nome | firma @riga | note |
|---|---|---|
| `fetch_text` | `[string]→TPromise` @3801 | custom-eval, usa `fetch()` globale |
| `fetch_json` | `[string]→TPromise` @3807 | custom-eval, usa `fetch()` globale |

#### promises (riga 3816, 1 nome, 1 firma)

| nome | firma @riga | note |
|---|---|---|
| `then` | `[promise,lambda]→TPromise` @3816 | custom-eval — incatena una lambda JME su una `TPromise` |

---

## 5. Dipendenze e globali

| dipendenza | usata in | righe (esempi) |
|---|---|---|
| `Numbas.math` (`math.js`, fuori scope) | tutti e tre i file | `jme-rules.js`: `math.re/im/positive/nonnegative/negative/countDP/eq/complex` (552-625, 2277); `jme-builtins.js`: quasi ogni firma `TNum` (es. `math.add/sub/mul/div/pow/sin/cos/...`), `math.random/choose/deal/shuffle/weighted_random` (2930-3011) |
| `Numbas.util` | `jme-rules.js`, `jme-builtins.js` | `jme-rules.js`: `util.isInt` (595), `util.copyobj` (909, 2052), `util.eq` (1069), `util.extend_object` (1747, 1981, 2066, 2083); `jme-builtins.js`: `util.matchNotationStyle`, `util.cleanNumber`, `util.isBool`, `util.isNonemptyHTML`, `util.parseNumber` (2073-2079, 2785) |
| `Numbas.jme.rules.*` | `jme-calculus.js` (Rule, simplify), `jme-builtins.js` | `jme-builtins.js:41` (`builtinScope` iniziale = `simplificationRules`); `2436,2443` (`collectRuleset` in `simplify`); `2650,2695,2728` (`new jme.rules.Rule` in `match`/`matches`/`replace`); `1879,1895` (tema `type_casting`, per notazioni) |
| `Numbas.jme.calculus.*` | `jme-builtins.js:3758` | unica chiamata: `jme.calculus.differentiate(expr, name, scope)` nel builtin `diff` |
| `Numbas.jme.display.*` | `jme-builtins.js` | `jme.display.texify` (1904), `jme.display.treeToJME` (2215), `jme.display.simplifyTree` (2437,2446,3760), `jme.display.simplify` (2451) — **7 punti di dipendenza da un modulo non ancora in scope in questo batch** |
| `Numbas.jme.variables.*` | `jme-builtins.js` | `makeConstants` (57, avvio costanti), `makeVariables` (2513, dentro `make_variables`), `DOMcontentsubber` (2774, 2801 — solo tema `html`) |
| `Math.random` / `Math.seedrandom` | `jme-builtins.js` (diretto), `math.js` (indiretto, fuori scope) | diretto: 2962-2968 (`seedrandom`, salva/ripristina `Math.random`); indiretto: `math.js:1002,1818,1830,1863,1876,1885` — `math.random`, `math.choose`, `math.weighted_random`, il generatore di `deal`/`shuffle` passano tutti da `Math.random()` di `math.js`, non da un generatore iniettato. **Il design doc ha già deciso di iniettare un generatore seminato (`seedrandom` npm) nello scope — va rispettato anche dai wrapper `Numbas.math` nel port, non solo dai builtin di `randomisation`** |
| `R()` (localizzazione, `localisation.js`, fuori scope) | `jme-builtins.js:1806,1809` | builtin `translate` (tema `strings`) — dipende da i18next tramite `Numbas.locale`; il design doc sostituisce i18next con un dizionario `it`/`en` proprio, quindi questo builtin va ricablato |
| DOM (`document.createElement`, ecc.) | `jme-builtins.js` | tema `html` (2772-2905), `scientificnumberhtml` (2059,2069, tema `number_parsing`) — vedi §6 |
| `fetch()` globale | `jme-builtins.js:3792` (tema `http`) | rete, fuori scope per un motore puro |
| `console.log` | `jme-builtins.js` (`debug_log`, ~2540) | side-effect minore, portabile |

`jme-rules.js` **non** tocca `Math.random`, DOM o `R()` — è puro. `jme-calculus.js` idem, tranne un
riferimento a `jme.display.treeToJME` solo dentro un messaggio d'errore (riga 172), facilmente
sostituibile con un formattatore locale o rimandato al chiamante.

---

## 6. Da non portare (o da riscrivere come stringhe pure)

| builtin/codice | motivo | alternativa |
|---|---|---|
| `html(str)` (2770-2784) | costruisce nodi DOM reali, usa `DOMcontentsubber` per interpolare variabili dentro l'HTML | fuori scope per il motore headless; se serve, produrre solo la stringa HTML con le variabili sostituite (senza `document`), da renderizzare lato player (sotto-progetto 3) |
| `image(url, w, h)` (2788-2809) | crea `<img>`/`<object>` DOM | fuori scope; il player genera il tag a partire dai parametri |
| `escape_html(str)` (2810-2813) | usa `document.createElement('p')` per fare l'escaping, ma il risultato è comunque solo testo | **portabile come funzione pura** (basta una funzione di escaping HTML scritta a mano, es. sostituzione di `&<>"'`) |
| `table(...)` × 3 overload (2829-2911) | costruisce `<table>` DOM | fuori scope; producibile invece come struttura dati (righe/colonne) o come stringa HTML statica senza DOM |
| `max_width`/`max_height` (2913-2921) | manipolano `.style` di un nodo THTML esistente | dipende dal tipo `THTML`: se `THTML` diventa "stringa HTML" nel port, questi diventano manipolazione di stringhe/attributi |
| `scientificnumberhtml` × 2 (2057-2070, tema `number_parsing`) | usa `document.createElement('span')` solo per produrre `innerHTML` | **portabile come stringa pura**: la logica (formattazione scientifica) non ha bisogno del DOM, va solo tolto il wrapping in `<span>` |
| `fetch_text`/`fetch_json` (3792-3812, tema `http`) | I/O di rete (`fetch()` globale) | fuori scope per un motore che deve girare anche lato server in modo deterministico e senza rete durante la correzione; se richiesto in futuro, iniettare un client HTTP esplicito invece di `fetch()` globale |
| `then` (3816-3824, tema `promises`) | ha senso solo se esistono `TPromise` prodotte da `http`; se si scarta `http`, `promises` non ha più consumatori | valutare se scartare insieme a `http`, oppure tenerlo per un futuro uso "iniettabile" di promesse esterne |
| `translate` (1805-1810) | dipende da `R()`/i18next globale | ricablare sul dizionario `it`/`en` proprio del motore (decisione 7 del design doc); la firma JME (`translate(str)`, `translate(str, dict)`) resta identica |

Tutto il resto di `jme-builtins.js` (495 delle 504 registrazioni) è **puro** (nessun DOM, nessuna rete)
e portabile direttamente, incluso `latex(expr)` e `string(expr, ...)` (tema `type_casting`, righe
1879-1913) che producono solo stringhe/LaTeX pur dipendendo da `jme.display`/`jme.rules`.
`isnonemptyhtml` (2785-2787) è pura nonostante viva nel tema `html` (ispeziona una stringa, non crea
nodi).

`jme-rules.js` e `jme-calculus.js` sono **interamente portabili**: nessuna funzione al loro interno
tocca DOM, rete o `Math.random`.

---

## 7. Test upstream

### 7.1 `tests/jme/jme-tests.mjs` (2983 righe, QUnit)

Moduli QUnit (`QUnit.module(...)`) e relativi `QUnit.test`. Elenco completo dei moduli, con quelli
rilevanti per i tre file marcati **★**:

| modulo | righe (inizio) | # test | rilevanza |
|---|---|---|---|
| `Subvars` | 66 | 7 | jme-variables, fuori scope qui |
| `Compiling` | 140 | 21 | parser JME base |
| `Evaluating` | 457 | 45+ | ★ contiene `Number functions`, `Number theory/combinatorics`, `Rounding`, `Random numbers`, `Trigonometry`, `Vector and Matrix operations`, `Gauss-jordan elimination`, `Range operations`, `List operations`, `Dictionaries`, `Branching`, `Repetition`, `Boolean operations`, `isRandom`, `isDeterministic`, `HTML`, `Calculus`, `Sub-expressions` — copre quasi tutti i temi builtin |
| `Real intervals` | 1640 | 8 | ★ tema `intervals` |
| `Scopes` | 1856 | 8 | `Rulesets` (1935) tocca `jme.rules.simplificationRules` |
| `Built-in notations` | 2018 | N (dinamico, 1 per notazione) | fuori scope (jme-notations) |
| `Pattern-matching` | 2032 | 2 | ★ `matchExpression` (2033-2208, **~90 assert** sui matcher `?`,`$n`,`$v`,`$z`, `m_*`, quantificatori, `` `\| ``, `` `: ``, `` `+- ``, `` `! ``, `` `& ``, `` `where ``, `` `@ ``, nomi catturati, nomi identificati); `replace` (2209-2233, 6 assert su `Rule#replace`/`replaceAll`) |
| `Display` | 2234 | 20+ | ★ `Simplify surds` (2600), `brackets involving subtraction` (2610) esercitano direttamente `simplifyExpression`/i rule-set |
| `Promises` | 2832 | 1 | tema `promises` |
| `Documentation` | 2866 | 2 | ★ `Coverage` (2867-2935): verifica che ogni builtin registrato in `builtinScope.allFunctions()` sia documentato in `doc-tests.mjs` e viceversa, e che nessuna funzione abbia `random` ambiguo tra i suoi overload; `Random flag set properly` (2950-2965): ogni funzione documentata senza esempi deve avere `random:true` su almeno un overload |
| `Docs: <sezione>` × 25 | 2967-2983 (generati in loop) | 1 test per funzione documentata, con N assert (1 per esempio) | ★★ vedi §7.2 |

Helper locali rilevanti: `matchExpression`/`matchTree`/`matchCapturedNames` (wrapper attorno a
`jme.rules.matchExpression`/`Rule#match`, dentro il test 'matchExpression'), `replace`/`replaceAll`
(wrapper attorno a `Rule#replace`/`replaceAll`), `raisesNumbasError`, `closeEqual`/`deepCloseEqual`
(arrotondano a 10 decimali prima del confronto — utile per i test differenziali del port).

Test `Calculus` (righe 1578-1607, dentro `Evaluating`): 20 assert su `diff(expression("..."), "x")`
via `jme.display.treeToJME` — è il test upstream più diretto su `jme-calculus.js`.

Dipendenze dei test da moduli non ancora in scope: `jme-display.js` (per `treeToJME`,
`simplifyExpression`, `texify`), `jme-notations.js` (per `Built-in notations`), `localisation.js`
(per `Numbas.locale`). Il file importa anche `qunit`, `jme`, `jme-rules`, `jme-display`,
`jme-calculus`, `jme-notations`, `localisation`, `schedule` (riga 3).

### 7.2 `tests/jme/doc-tests.mjs` (6209 righe, generato — non scritto a mano)

Generato dal Makefile (`Makefile:149-151`):
```
tests/jme/doc-tests.mjs: $(NUMBAS_EDITOR_PATH)/docs/jme-reference.rst
    @echo "export default" > $@
    @cat $^ | python tests/jme/make_tests_from_docs.py >> $@
```
`tests/jme/make_tests_from_docs.py` (232 righe, presente in questo clone) usa `docutils` per
interpretare un file **reStructuredText** (`jme-reference.rst`, che vive nel repo separato
`numbas-editor`, **non presente in questo clone**) contenente direttive custom `.. jme:function::`
(opzioni `:op:`, `:keywords:`, `:noexamples:`) con dentro liste di esempi nella forma
`` `espressione` → `risultato` `` (il carattere `→` è il marcatore che il parser riconosce). Il parser
raggruppa le funzioni per sezione RST (titoli `===`) ed emette un array JSON (con `export default`
anteposto per farne un modulo ESM) di oggetti `{name, fns: [{name, keywords, noexamples,
calling_patterns, examples: [{in, out}]}]}`.

Struttura effettiva (verificata parsando il file): **25 sezioni**, **280 voci-funzione** (con
ripetizioni tra sezioni per funzioni documentate più volte, es. overload logici diversi), **540
esempi** totali (ognuno diventa un'asserzione `assert.equal` in `jme-tests.mjs`). 29 funzioni sono
marcate `noexamples:true` (niente test, tipicamente perché usano `random`); 6 funzioni hanno 0 esempi
senza essere marcate `noexamples` (bordo tollerato dal test `Coverage`/`Random flag set properly` se
hanno comunque `random:true` su un overload).

Conteggio per sezione (nome, # funzioni, # esempi):

| sezione | # funzioni | # esempi |
|---|---|---|
| Anonymous functions | 1 | 3 |
| Arithmetic | 6 | 17 |
| Number operations | 50 | 102 |
| Trigonometry | 19 | 37 |
| Number theory | 20 | 39 |
| Vector and matrix arithmetic | 20 | 26 |
| Strings | 27 | 51 |
| Logic | 15 | 48 |
| Collections | 3 | 9 |
| Ranges | 3 | 1 |
| Lists | 34 | 77 |
| Dictionaries | 7 | 12 |
| Sets | 4 | 8 |
| Intervals | 10 | 18 |
| Randomisation | 8 | 4 |
| Control flow | 6 | 10 |
| HTML | 7 | 3 |
| JSON | 2 | 2 |
| Sub-expressions | 22 | 51 |
| Calculus | 1 | 3 |
| Asynchronous functions | 3 | 0 |
| Pattern-matching sub-expressions | 3 | 8 |
| Identifying data types | 5 | 11 |
| Inspecting the evaluation scope | 3 | 0 |
| Debugging tools | 1 | 0 |

Come vengono eseguiti (`jme-tests.mjs:2966-2983`): per ogni sezione, `QUnit.module('Docs: '+nome)`;
per ogni funzione con almeno un esempio, `QUnit.test(fn.name, ...)` valuta `example.in` contro
`Numbas.jme.builtinScope`, converte il risultato in JME testuale con `jme.display.treeToJME` e lo
confronta (dopo aver rimosso gli spazi) con `example.out`. **Per il port, questi 540 casi sono il modo
più economico per ottenere una batteria di regression test sui builtin**: si può rigenerare
`doc-tests.mjs` una volta (serve accesso al repo `numbas-editor` per `jme-reference.rst`, oppure
copiare il file già generato qui presente) e tradurre il loop in Vitest, sostituendo
`Numbas.jme.builtinScope`/`treeToJME` con le funzioni equivalenti del port.

---

## 8. Punti delicati

1. **Ordine e terminazione dell'applicazione delle regole** (`Ruleset.simplify`,
   `jme-rules.js:1990-2035`). Ad ogni iterazione del `while(changed)`: prima si semplificano
   ricorsivamente **tutti i figli** (anche se non cambiano, vengono ri-visitati ad ogni iterazione
   esterna — costo potenzialmente O(regole × profondità²) su alberi grandi), poi si scorrono le
   regole **nell'ordine in cui compaiono nel `Ruleset.rules`** (che è l'ordine di concatenazione dei
   rule-set richiesti, a sua volta l'ordine delle chiavi di `simplificationRules`/
   `conflictingSimplificationRules`) e si applica la **prima** che produce un cambiamento (`break`),
   poi si ricomincia dall'inizio dell'array ad ogni cambiamento. Rilevamento cicli: solo dopo 100
   iterazioni (`depth > 100`, riga 2022) si inizia a tracciare le stringhe JME già viste (`seen`) e si
   lancia un errore se una si ripete — quindi un ciclo di regole che genera alberi sempre diversi (ma
   non convergenti) non verrebbe mai rilevato prima di un numero enorme di iterazioni. Un port ingenuo
   che cambia l'ordine delle regole (es. le mette in una `Map` non ordinata) **cambia il risultato
   della semplificazione**, non solo le prestazioni.

2. **`collectRuleset` include `'basic'` solo quando l'input è una stringa** (`jme-rules.js:2062-2065`
   vs. `2065-2068`): `set.splice(0, 0, 'basic')` avviene **solo** nel branch `typeof(set) == 'string'`.
   Se il chiamante passa un array o un `Ruleset` già costruito, `basic` **non** viene aggiunto
   automaticamente. Questo asimmetria va riprodotta esattamente, altrimenti `simplify(expr, 'trig')`
   (stringa, include `basic`) e `simplify(expr, ['trig'])` (array, non include `basic`) darebbero
   risultati diversi nel port rispetto all'originale.

3. **Nomi dei rule-set vs. nomi dei flag di display condividono lo stesso spazio dei nomi**
   (`collectRuleset`, riga 2073: `if(name in displayFlags) { flags[name] = !neg; }`). Una stringa
   come `'all,fractionnumbers'` è valida e mescola un rule-set con un flag di visualizzazione; il
   prefisso `!` nega sia rule-set (rimuove le regole) sia flag (li imposta a `false`).

4. **Il rule-set sintetico `all` non include i 6 `conflictingSimplificationRules`**
   (`jme-rules.js:2288-2291` concatena solo `simplificationRules`). Un utente che vuole
   `expandBrackets` o `canonicalOrder` deve nominarli esplicitamente (es. `'all,expandBrackets'`) —
   comportamento intenzionale da preservare, non un bug da "correggere" nel port.

5. **Blocco di 17 regole commentate dopo `collectLikeFractions`** (`jme-rules.js:2207-2227`, dentro
   `/* ... */`): codice morto (cancellazione di potenze a base uguale in una divisione). Da NON
   portare come regole attive; eventualmente riproporlo come TODO se in futuro serve una
   semplificazione più aggressiva delle potenze.

6. **`findSequenceMatch` è un piccolo motore di regex custom con backtracking**
   (`jme-rules.js:1393-1573`): gestisce quantificatori (`0,1,`?`,`*`,`+``) su una sequenza di
   "termini" (operandi di un operatore associativo, o argomenti di una funzione), con matching greedy
   che preferisce i termini precedenti del pattern, backtracking esplicito via lo stato `capture`
   (array parallelo agli elementi di input, `-1` per "termine ignorato"), e un branch dedicato per la
   modalità commutativa (`options.commutative`, azzera `pc` ad ogni avanzamento) vs. non commutativa.
   È la parte più delicata da riportare 1:1 in TypeScript: qualsiasi riscrittura "più pulita" con
   regex reali o algoritmi greedy senza backtracking rischia di **non far passare più i test upstream
   su `` `* ``/`` `+ ``/`` `?  `` combinati con `allowOtherTerms`**. Consigliato: portare la macchina a
   stati così com'è, riga per riga, prima di ottimizzare.

7. **Cattura `;=` (nomi identificati)**: due occorrenze catturate con lo stesso nome tramite `;=`
   devono essere strutturalmente uguali (`jme.compareTrees(e1,e2)==0`, usato in
   `matchTermSequence.constraint_ok`, righe 1264-1281). La regola `simplifyFractions`
   (`'?;=a / ?;=a'`, riga 2166) e `cancelTerms`/`cancelFactors` (righe 2198-2202) dipendono da questo
   per riconoscere "stessa base"/"stesso denominatore". `jme.compareTrees` vive in `jme.js` (fuori
   scope di questo batch, ma è una dipendenza obbligata per `rules.ts`).

8. **`m_strictplus` nel test upstream non esiste come matcher speciale**
   (`jme-tests.mjs:2103`; l'unico "strict" reale è `m_strictinverse`, `jme-rules.js:745`). L'assert
   `notOk(matchExpression('m_strictplus(?+?)','x-y'))` passa **per un motivo sbagliato**: essendo
   `m_strictplus` un nome di funzione qualunque, `matchOrdinaryFunction` cerca semplicemente una
   funzione letteralmente chiamata `m_strictplus` in `x-y`, che ovviamente non c'è. Se il port dei
   test copia questa asserzione, continuerà a passare "per caso" — va segnalato come typo upstream, da
   non "correggere" silenziosamente cambiando la semantica del test (o va corretto e discusso con
   l'owner del piano).

9. **Overload resolution (in `jme.js`, non in questi 3 file, ma un contratto che i builtin
   presuppongono)**: `Scope.matchFunctionToArguments` (`jme.js:2876-3006`) sceglie tra i candidati
   nell'**ordine di registrazione** (`getFunction`, `jme.js:2839-2858`, ordine di `push`); ritorna
   subito al primo match **esatto** (`exactType`, riga 2996-2998), altrimenti tiene il "migliore"
   finora ma **non sostituisce a parità** (`compare_matches(...) == -1`, riga 2980) — quindi **a
   parità di punteggio vince il primo registrato**. Conseguenza concreta trovata in
   `jme-builtins.js`: `numrows`/`numcolumns` sono registrati **due volte** con firma identica
   `[TMatrix]→TNum` (righe 609/632 e 612/635) — la seconda registrazione (quella che usa
   `matrixmath.numrows`/`matrixmath.numcolumns`) è **codice morto**, mai raggiunta. Il port deve
   riprodurre "primo registrato vince i pareggi" per non alterare silenziosamente quale
   implementazione gira quando ci sono ambiguità reali altrove nel catalogo.

10. **Laziness vs. "custom evaluate" non lazy**: 32 nomi sono davvero lazy (`jme.lazyOps`, vedi §4.3);
    molti altri (es. `ceil`/`floor`/`round`, `sort`, `distinct`, `listval`, `transpose` 3ª firma,
    `matrix`/`vector`/`rowvector`, `json_decode`/`json_encode`, ecc. — 96 delle 314 righe della
    tabella §4.4 hanno `custom-eval` senza `LAZY`) hanno solo un `options.evaluate` personalizzato ma
    **ricevono argomenti già valutati**: serve per dispatch dinamico sul tipo di ritorno (es. `ceil`
    restituisce `TInt` o `TNum` a seconda che il risultato sia complesso) o per accedere allo `scope`
    senza bisogno di rimandare la valutazione. Il port deve distinguere chiaramente questi due casi
    nella firma TypeScript (`fn: (args: Value[]) => Value` vs. `fn: (argTrees: Tree[], scope: Scope)
    => Value`), altrimenti si rischia di rendere lazy funzioni che non lo sono (rompendo l'ordine di
    valutazione atteso da altri builtin che le compongono) o viceversa.

11. **`findvarsOps`/`isDeterministicOps`** (righe elencate in §4.3) sono side-effect su registri
    globali definiti in `jme.js` (fuori scope), popolati da `jme-builtins.js` al caricamento del
    modulo. 14 builtin che legano nomi locali (`let`, `map`, `for:`, `filter`, `iterate`,
    `iterate_until`, `foldl`, `take`, `|>`, `try`, `satisfy`, `isset`, `safe`, `render`) hanno bisogno
    di un gestore custom per il calcolo delle variabili libere, altrimenti `jme.variables` (il modulo
    che ordina la generazione delle variabili di una domanda, sotto-progetto adiacente) tratterebbe il
    nome legato come una dipendenza esterna. Nel port, va deciso se questi registri restano side-effect
    globali (fedele all'originale, ma con tutti i problemi di un singleton condiviso) o diventano parte
    esplicita della firma di `registerBuiltins`.

12. **Casualità**: `Numbas.math` (fuori scope, in `math.js`) chiama `Math.random()` direttamente in
    almeno 5 punti (`math.js:1002,1818,1830,1863,1885`) usati da `random`, `deal`, `shuffle`,
    `weighted_random`. Il design doc ha già deciso di iniettare un generatore seminato con l'algoritmo
    `seedrandom` (stesso pacchetto npm usato dal builtin `seedrandom` upstream) nello scope della
    domanda — ma **questo richiede che anche `Numbas.math`** (portato in un batch precedente,
    `packages/engine/src/math/`) esponga le sue funzioni random come prendenti un generatore esplicito
    invece di chiamare `Math.random()` globale. Se `math/` è già stato portato con
    firma non iniettabile, i builtin di `randomisation` (§4.4) non possono rispettare il requisito di
    determinismo per-seed. Il builtin `seedrandom` stesso (2959-2977) fa un pattern particolare —
    sostituisce `Math.random` globale, esegue, ripristina in un `finally` — che **non ha senso** in
    un'architettura a generatore iniettato: va ripensato come "esegui l'espressione con un generatore
    temporaneo seminato", non come monkey-patching globale.

13. **Nomi unicode**: il token speciale `$xxx` del `PatternParser` è vincolato a
    `/^\$[a-zA-Z_]+/` (`jme-rules.js:1852-1861`, solo ASCII dopo il `$`), mentre i nomi JME ordinari
    (fuori scope qui, in `jme.js`) supportano lettere greche e subscript unicode
    (`normaliseSubscripts`, `jme.js:3291+`). Il matching per nome (`matchName`,
    `jme-rules.js:677-692`) delega comunque a `jme.normaliseName(nome, scope)` per il confronto
    case-insensitive — comportamento da riprodurre esattamente nel modulo `tokenizer`/`scope` del
    port, non reinventare qui.

14. **`expandBrackets`/`collectNumbers` non "confluiscono" da sole**: `expandBrackets`
    (`conflictingSimplificationRules`, righe 2240-2241) espande `(x+y)*z` in `x*z+y*z` ma **non** è
    nella lista `all`; se un chiamante lo attiva insieme a `collectNumbers`/`basic` può ottenere
    espansioni ripetute se il termine espanso ricontiene somme — mitigato dal loop a punto fisso di
    `simplify`, ma il costo cresce rapidamente con l'annidamento (nessun caching tra iterazioni
    esterne, vedi punto 1).

15. **`translate` builtin** dipende da `R()` (i18next) tramite `Numbas.locale`; il design doc sostituisce
    i18next con un dizionario proprio — la funzione `translate(str)`/`translate(str, params)` va
    ricablata sul nuovo meccanismo di i18n del motore, mantenendo la stessa firma JME (altrimenti le
    domande esistenti che la usano si rompono).

---

## 9. Proposta di suddivisione TypeScript

Vincolo del design doc: nessun file sopra le 1000 righe. `jme-rules.js` (2294 righe) e
`jme-builtins.js` (3825 righe) vanno spezzati; `jme-calculus.js` (180 righe) no.

### `packages/engine/src/jme/rules.ts` + `rules-simplify.ts`

| upstream:righe | target | contenuto |
|---|---|---|
| `jme-rules.js:1-1849` | `rules.ts` | `parse_options`, `extend_options`, `Rule`, `Term`, `getTerms`, `matchTree` e tutti i matcher (`matchName`, `matchFunction`, `matchOp`, `matchList`, `matchToken`, `matchOrdinaryFunction`, `matchOrdinaryOp`, `matchTermSequence`, `findSequenceMatch`, `matchAny`/`matchDefault`/`matchNot`/`matchAnd`/`matchWhere`/`matchMacro`/`matchUses`/`matchType`, `matchAllTree`, `mergeMatches`, `applyPostReplacement`, `transform`, `transformAll`) — **~1850 righe, ancora sopra i 1000: da spezzare ulteriormente** in `rules-match.ts` (tutto il matching, righe 1-1757 upstream) e `rules-transform.ts` (righe 1758-1849, `applyPostReplacement`/`transform`/`transformAll`) |
| `jme-rules.js:1850-1945` | `rules-parser.ts` | classe `PatternParser`, istanza `patternParser`, `matchExpression` — dipende dal `Parser`/tokenizer del port (`jme/parser.ts`) |
| `jme-rules.js:1946-2108` | `rules-ruleset.ts` | `displayFlags`, classe `Ruleset` (incluso `simplify`), `collectRuleset` |
| `jme-rules.js:2109-2294` | `rules-simplify.ts` | `simplificationRules`, `conflictingSimplificationRules`, `compileRules`, bootstrap — dati puri, nessuna logica: può restare un unico file anche oltre 500 righe di dati letterali (le regole sono ~62, non migliaia) |

Firme TypeScript proposte:
```ts
export interface MatchTreeOptions {
  commutative?: boolean; associative?: boolean; allowOtherTerms?: boolean;
  gatherList?: boolean; strictInverse?: boolean; scope?: Scope;
}
export type PatternMatch = Record<string, Tree> | false;

export class Rule {
  constructor(pattern: string, result: string | null, options?: string | MatchTreeOptions, name?: string);
  match(exprTree: Tree, scope: Scope): PatternMatch;
  matchAll(exprTree: Tree, scope: Scope): PatternMatch[];
  replace(exprTree: Tree, scope: Scope): { expression: Tree; changed: boolean };
  replaceAll(exprTree: Tree, scope: Scope): { expression: Tree; changed: boolean };
}

export function matchTree(ruleTree: Tree, exprTree: Tree, options: MatchTreeOptions): PatternMatch;
export function matchExpression(pattern: string, expr: string, options?: Partial<MatchTreeOptions>): PatternMatch;

export class Ruleset {
  constructor(rules: Rule[], flags?: Record<string, boolean>);
  simplify(exprTree: Tree, scope: Scope): Tree;
}
export function collectRuleset(set: string | (string | Ruleset)[], scopeSets: Record<string, Ruleset>): Ruleset;
export function simplify(exprTree: Tree, ruleset: string | Ruleset, scope: Scope): Tree;   // wrapper equivalente a jme.display.simplifyTree, ma senza dipendenza da display.ts (solo albero → albero)

export const simplificationRules: Record<string, Ruleset>;   // 'basic', 'unitFactor', ..., 'all', + 6 conflicting-on-demand
```

### `packages/engine/src/jme/calculus.ts`

Diretto: `jme-calculus.js` intero (180 righe) → `calculus.ts`, nessuno split necessario.

```ts
export const derivatives: Record<string, Tree>;
export const distributingDerivatives: Record<string, true>;
export function differentiate(tree: Tree, x: string, scope: Scope): Tree;
```
Dipendenze da import: `Rule`/`Ruleset` da `rules.ts` (`simplificationRules.basic`), niente da
`display.ts` (rimuovere la dipendenza residua da `jme.display.treeToJME` nel messaggio d'errore,
riga 172 — usare solo il nome funzione/variabile nell'errore, o iniettare un formattatore).

### `packages/engine/src/jme/builtins/*.ts`

Un file per tema (29 temi → 26 file utili dopo aver scartato `html`/`http`/`promises` o ridotti a
stub minimi):

| upstream:righe | target file | note |
|---|---|---|
| 87-180 | `builtins/arithmetic.ts` | |
| 182-215 | `builtins/complex-exponentials.ts` | uniti (16 firme totali, sotto la soglia) |
| 216-275 | `builtins/trigonometry.ts` | |
| 281-423 | `builtins/rounding.ts` | |
| 425-528 | `builtins/number-theory.ts` | |
| 531-566 | `builtins/comparison.ts` | |
| 569-859 | `builtins/linear-algebra.ts` | 59 firme, ~290 righe upstream: sotto i 1000, un solo file |
| 878-966 | `builtins/booleans.ts` | |
| 968-1091 | `builtins/sets-intervals.ts` | uniti (`set_theory`+`intervals`, 31 firme) |
| 1108-1192 | `builtins/ranges.ts` | |
| 1195-1547 | `builtins/lists.ts` | |
| 1550-1659 | `builtins/dictionaries.ts` | |
| 1662-1812 | `builtins/strings.ts` | `translate` ricablato su `i18n/` proprio |
| 1815-1913 | `builtins/type-casting.ts` | dipende da `rules.ts`/`display.ts` |
| 1916-2210 | `builtins/number-parsing.ts` | `scientificnumberhtml` riscritto come funzione stringa pura (niente DOM); include anche `precision`/`json` (uniti, 16 firme) |
| 2213-2636 | `builtins/jme-introspection.ts` | tema `jme`: dipende da `rules.ts`, `display.ts`, `calculus.ts`, `variables/` (per `make_variables`) |
| 2639-2766 | `builtins/pattern-matching.ts` | dipende da `rules.ts` |
| 2769-2924 | **non portato** (o `builtins/html.stub.ts` con solo `isnonemptyhtml`/`escape_html` puri) | vedi §6 |
| 2927-3012 | `builtins/randomisation.ts` | riscritto per generatore iniettato (vedi punto 12 §8), non monkey-patch di `Math.random` |
| 3015-3224 | `builtins/control-flow.ts` | |
| 3227-3750 | `builtins/comprehensions.ts` | |
| 3753-3766 | `builtins/calculus.ts` (builtin `diff`, non il modulo `calculus.ts` di §"calculus") — meglio rinominare in `builtins/differentiation.ts` per evitare confusione col modulo omonimo | dipende da `calculus.ts`, `rules.ts`, `display.ts` |
| 3769-3782 | `builtins/marking.ts` | dipende da `marking/` (batch successivo) per `checkingFunctions`/`resultsEqual` — da stubare o rimandare |
| 3785-3824 | **non portato** (`http`, `promises`) | vedi §6, salvo decisione futura di iniettare un client HTTP |

Firma di aggregazione proposta (un unico entry-point che lo scope/engine chiama):
```ts
export interface BuiltinsOptions {
  rng: RandomGenerator;          // iniettato, seminato per tentativo (seedrandom)
  i18n: (key: string, params?: Record<string, unknown>) => string;   // sostituisce R()
}
export function registerBuiltins(scope: Scope, options: BuiltinsOptions): void;
// internamente: registerArithmetic(scope); registerTrigonometry(scope); ...; registerRandomisation(scope, options.rng); registerStrings(scope, options.i18n); ...
```
Ogni `builtins/<tema>.ts` esporta una funzione `register<Tema>(scope: Scope): void` (o con parametri
extra solo dove serve `rng`/`i18n`/altre dipendenze), chiamata da `builtins/index.ts`.

### File NON portati in questo batch (dipendenze verso moduli successivi nella roadmap)

`display.ts`, `notations.ts`, `unicode.ts` (task 5), `variables/` (task 6) sono dipendenze di alcuni
builtin del tema `jme`/`type_casting`/`calculus` — nella sequenza di porting (task 3 prima di task 4,
poi task 5), questi builtin andranno scritti con import che punteranno a moduli non ancora esistenti
al momento del task 4: va deciso se procedere con stub/interfacce minime (consigliato, per non
bloccare l'ordine dei task) o anticipare porzioni di `display.ts`.

---

## 10. Domande aperte

1. **`math/` (task 1) espone già un generatore casuale iniettabile?** Se `Numbas.math.random`,
   `math.choose`, `math.deal`, `math.shuffle`, `math.weighted_random` sono già stati portati con una
   firma che accetta un RNG esplicito, i builtin di `randomisation.ts` possono chiamarli direttamente;
   altrimenti il task 4 deve prima tornare indietro e correggere `math/`.

2. **`THTML` come tipo**: il port lo rappresenta come stringa HTML pre-renderizzata, o si scarta del
   tutto il tema `html` e il tipo `THTML` non esiste nel port? Impatta `scientificnumberhtml`
   (tema `number_parsing`) e la firma di `max_width`/`max_height`.

3. **`http`/`promises` (temi interi)**: si scartano definitivamente (nessuna domanda delle superiori
   userebbe `fetch_text`/`fetch_json`), o si tengono con un client iniettato per un uso futuro (es.
   contenuti dinamici)? Se si scartano, anche `TPromise` come tipo del linguaggio JME può essere
   omesso dal port di `jme/types.ts` (batch precedente), semplificando la firma di `then`.

4. **`marking` (builtin `resultsequal`)**: dipende da `jme.checkingFunctions`/`jme.resultsEqual`,
   definiti in `marking.js` (task 7, molto più avanti nella roadmap). Va stubato in task 4 con
   un'implementazione minima (es. solo confronto `=`) e completato in task 7, o rimandato del tutto a
   task 7 (lasciando `builtins/marking.ts` vuoto/non registrato fino ad allora)?

5. **Verbatim dei messaggi di errore**: molti builtin lanciano `Numbas.Error('jme.func.xxx....',
   {...})` con chiavi che puntano a un dizionario di localizzazione upstream (fuori scope, sostituito
   da `i18n/` proprio). Il port deve enumerare tutte le chiavi di errore usate nei tre file (non
   ancora fatto in questo inventario — richiederebbe un grep dedicato di `Numbas.Error(` nei tre file,
   ~40+ occorrenze) e produrre le traduzioni it/en corrispondenti prima o durante il task 4?

6. **Duplicazione `numrows`/`numcolumns`** (§8, punto 9): si riproduce fedelmente il "codice morto"
   upstream (due registrazioni identiche, la seconda irraggiungibile) o si pulisce nel port
   mantenendo una sola implementazione? Innocuo dal punto di vista del comportamento osservabile, ma
   va deciso come politica generale per l'intero porting (fedeltà byte-per-byte del comportamento vs.
   pulizia del codice) — il design doc non lo specifica esplicitamente per questo tipo di duplicazione
   innocua (diverso dai casi di "Compatibilità byte per byte" citati nei Non-obiettivi, che riguardano
   il LaTeX).

7. **Rigenerare `doc-tests.mjs`**: il generatore (`make_tests_from_docs.py`) richiede
   `jme-reference.rst` dal repo `numbas-editor`, non presente in questo clone. Il file già generato
   (`tests/jme/doc-tests.mjs`, 6209 righe) può essere copiato così com'è come fixture di test per il
   port (540 esempi), ma se in futuro serve rigenerarlo (es. per allinearsi a una versione più recente
   della documentazione upstream) serve clonare anche `numbas-editor` — da annotare come dipendenza
   opzionale di sviluppo.

8. **`jme-tests.mjs` non è ancora stato tradotto modulo per modulo**: questo inventario copre solo i
   moduli rilevanti per rules/calculus/builtins; l'inventario dei moduli `Compiling`/`Scopes`/
   `Built-in notations` (rilevanti per `jme.js` base, task 2) è fuori dal perimetro di questo
   documento — verificare che esista (o vada prodotto) un inventario equivalente per quel batch.
