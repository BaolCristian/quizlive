
# Inventario: display LaTeX/JME, notazioni, unicode, variabili

Fonte: clone upstream Numbas, commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5` (2026-08-26), in
`/private/tmp/claude-502/.../scratchpad/numbas`. File analizzati:

| file | righe |
|---|---|
| `runtime/scripts/jme-display.js` | 2479 |
| `runtime/scripts/jme-notations.js` | 424 |
| `runtime/scripts/unicode-mappings.js` | 5 (una riga dati di 59.441 caratteri) |
| `runtime/scripts/jme-variables.js` | 1208 |

Tutti i riferimenti a riga sono su questo commit. Dove il codice chiama funzioni di
`jme.js`, `math.js`, `util.js`, `jme-rules.js` queste sono citate ma **non** fanno
parte dell'inventario di queste 4 file: appartengono ai task 1-4 del piano di porting.

## 1. Scopo dei file

**jme-display.js** — Contiene i due "renderer" che trasformano un albero sintattico
JME (`Numbas.jme.tree`) in una stringa d'uscita: `texify`/`Texifier` produce LaTeX,
`treeToJME`/`JMEifier` produce di nuovo JME (usato per mostrare l'espressione
semplificata). Entrambi condividono una classe base `JMEDisplayer` che gestisce
costanti (π, e, unità immaginaria, infinito) lette dallo scope. Contiene anche le
regole di bracketing/precedenza per la resa testuale e le funzioni `simplify*` che
compilano+semplificano+renderizzano in un colpo solo. Nessun accesso al DOM.

**jme-notations.js** — Definisce varianti sintattiche del parser/serializzatore JME
("Notation"): quale sottoclasse di `Parser` e di `JMEifier` usare per interpretare
sintassi alternative (teoria degli insiemi, parentesi quadre per raggruppare, logica
booleana con `+`/`*`, prodotto scalare `<a,b>`, intervalli `[a,b)`, pattern matching).
**Non contiene** stili di formattazione numerica locale (`plain`, `en`, `si-en`, `eu`,
`si-fr`, `plain-eu`, `scientific`): quelli vivono in `util.js`
(`Numbas.util.numberNotationStyles`, riga 1460) e in `math.js` (`niceNumber`,
`niceDecimal`), vedi §3 nota importante.

**unicode-mappings.js** — Tabella dati statica (1591 voci, nessuna logica) che mappa
caratteri Unicode matematici (lettere corsivo/grassetto/fraktur/doppio-barrato,
lettere greche, apici/pedici, simboli operatori, punteggiatura, parentesi alternative)
alle forme ASCII/JME equivalenti. Serve solo in fase di **tokenizzazione** dell'input
(`jme.js`), non in fase di display.

**jme-variables.js** — Motore di generazione delle variabili di domanda: valuta un
dizionario `{nome: albero_JME}` rispettando le dipendenze (ordinamento topologico
pigro, non esplicito), rileva riferimenti circolari e nomi non definiti, gestisce
l'assegnazione multipla (`a,b := [1,2]`), i ruleset e le costanti con nome, e infine
la sostituzione di variabili dentro il DOM/HTML (`DOMcontentsubvars`) e dentro
stringhe generiche (`DOMsubvars`). Contiene sia una versione sincrona (`computeVariable`,
`makeVariables`) sia una a promesse (`computeVariablePromise`, `makeVariablesPromise`)
per supportare funzioni JME asincrone.

## 2. jme-display.js

### 2.1 Layout

| riga inizio | riga fine | cosa contiene |
|---|---|---|
| 1-24 | header Apache, `Numbas.queueScript`, alias `math`/`jme`/`util`, costanti `Decimal` (`D1`, `Dm1`, `DPI`) |
| 26-149 | oggetto pubblico `jme.display` (API di alto livello: `exprToLaTeX`, `treeToLaTeX`, `simplifyExpression`, `simplify`, `simplifyTree`, `subvars`) |
| 151-165 | `number_options(tok)` — estrae `precisionType`/`precision`/`store_precision` da un token |
| 167-185 | `string_options(tok)` — estrae `latex`/`safe` da un token stringa |
| 187 | import distruttivo `{isComplex, isNegative, hasRealPart, conjugate, negated}` da `jme` |
| 189-274 | helper di fabbrica per TeX: `infixTex`, `nullaryTex`, `funcTex`, `patternName`, `texUnaryAdditionOrMinus` |
| 276-625 | **`texOps`** — dizionario operatore/funzione → funzione che produce TeX (91 chiavi, v. §2.3) |
| 627-647 | `overbraceTex`, `unaryPatternTex` (helper per pattern-matching) |
| 649-693 | **`texNameAnnotations`** — dizionario annotazione nome → trasformazione TeX (v. §2.3) |
| 695-716 | `propertyAnnotation`, `texPatternName` (helper) |
| 705-707 | alias `verb`→`verbatim`, `v`→`vector`, `m`→`matrix` su `texNameAnnotations` |
| 718-727 | **`specialNames`** — `$z`, `$n`, `$v` → TeX per nomi speciali di pattern-matching |
| 729-842 | **`typeToTeX`** — dizionario tipo di token → funzione TeX (19 chiavi, v. §2.3) |
| 843-858 | `flatten(tree, op)` — appiattisce catene di uno stesso operatore associativo (es. `((1*2)*3)*4`) |
| 860-886 | typedef JSDoc `displayer_settings` (v. §2.2) |
| 888-892 | costruttore `JMEDisplayer(settings, scope)` |
| 893-1046 | `JMEDisplayer.prototype`: `getConstants` (legge π/e/i/∞ dallo scope), `render` (astratto), `complex_number`/`rational_number`/`real_number`/`number` (astratti/dispatch), `complex_decimal`/`rational_decimal`/`real_decimal`/`decimal` (astratti/dispatch) |
| 1048-1630 | classe **`Texifier`** (estende `JMEDisplayer`), v. §2.4 |
| 1632-1648 | funzione factory `texify(tree, settings, scope)` |
| 1650-1889 | **`typeToJME`** — dizionario tipo di token → funzione JME (21 chiavi, v. §2.3) |
| 1891-1911 | `jme.display.registerType(type, renderers)` — registra un tipo custom con renderer `tex`/`jme`/`displayString` |
| 1913-1930 | **`jmeFunctions`** — override per 3 funzioni (`dict`, `fact`, `listval`) quando renderizzate come JME |
| 1932-1957 | typedef `jme_display_settings` + funzione factory `treeToJME(tree, settings, scope)` |
| 1958-1979 | **`opBrackets`** — tabella di bracketing esplicita per il JME-ifier (v. §2.5) |
| 1981-1996 | **`jmeOpSymbols`** — simboli JME per operatori che non sono il loro stesso nome (v. §2.3) |
| 1998-2333 | classe **`JMEifier`** (estende `JMEDisplayer`), v. §2.4 |
| 2336-2447 | `align_text_blocks(header, items)` — utility ASCII-art per allineare blocchi di testo sotto un'intestazione |
| 2449-2471 | `tree_diagram(tree)` — disegna un albero JME come diagramma ASCII (usa `align_text_blocks`) |
| 2473-2479 | alias di compatibilità: `jme.display.{Rule,getTerms,matchTree,matchExpression,simplificationRules,compileRules}` = gli omonimi di `jme.rules` |

### 2.2 Opzioni dei due renderer

**`displayer_settings`** (JSDoc righe 860-876, usato da `texify`/`Texifier` e letto via
`this.settings.X`) — proprietà, riga di uso principale:

| chiave | significato | dove è letta |
|---|---|---|
| `fractionnumbers` | mostra tutti i numeri come frazioni | `number`/`decimal` dispatch, riga 988, 1041 |
| `rowvector` | vettori in riga anziché colonna | `texVector`, riga 1405 |
| `alwaystimes` | forza sempre il simbolo di moltiplicazione | `texOps['*']`, riga 306 |
| `mixedfractions` | frazioni improprie come numeri misti (es. `3 3/4`) | `rational_number`/`rational_decimal`, righe 1197, 1259 |
| `flatfractions` | frazioni in linea (`a/b` con `\middle/`) invece di `\frac` | `texOps['/']` (344), `diff`/`partialdiff` (452+), `rational_number`/`rational_decimal` (1200, 1262) |
| `barematrices` | matrici senza parentesi tonde | `typeToTeX.matrix` (806), `texOps.matrix` (578) |
| `nicenumber` | passa il numero per `Numbas.math.niceNumber` | usato solo lato JME-ifier (`real_number`, riga 2220); lato TeX il valore di default (`true`) è implicito |
| `noscientificnumbers` | non usare mai la notazione scientifica | ogni `*_number`/`*_decimal`, soglia `out.length > 20` |
| `accuracy` | accuratezza per `Numbas.math.rationalApproximation` | `rational_number` (JME-ifier, riga 2181) |
| `timesdot` | usa `\cdot` invece di `\times` | `texTimesSymbol`, riga 1463 |
| `timesspace` | usa uno spazio (`\,`) invece di `\times` | `texTimesSymbol`, riga 1465 |
| `matrixcommas` | forza/nega virgole tra celle di matrice | `texVector` (1406), `texMatrix` (1449) |
| `store_precision` | (non nel typedef ma letto) mantiene precisione/tipo di arrotondamento nel numero renderizzato | `real_number` (JME-ifier, riga 2227) |
| `plaindecimal` | (JME-ifier) rende `dec("...")` come numero nudo, non avvolto | `decimal` (JME-ifier, riga 2316) |
| `scope` | scope JME da cui leggere costanti/rulesets | passato al costruttore `Texifier`/`JMEifier` |

Queste flag sono le stesse di `Numbas.jme.rules.displayFlags` (jme-rules.js righe
1946-1956: `fractionnumbers, rowvector, alwaystimes, mixedfractions, flatfractions,
barematrices, timesdot, timesspace, noscientificnumbers`), che sono i default (tutti
`undefined`) usati da un `Ruleset` per riempire `settings` quando lo si costruisce da
un flag-set di semplificazione (jme-rules.js riga 1979-1982).

**`jme_display_settings`** (JSDoc righe 1932-1942, per `treeToJME`/`JMEifier`):

| chiave | significato |
|---|---|
| `fractionnumbers` | come sopra |
| `niceNumber`/`nicenumber` | passa per `Numbas.math.niceNumber` (se `false`, stringa grezza `n+''`) |
| `wrapexpressions` | avvolge i token `TExpression` in `expression("...")` |
| `store_precision` | mantiene la precisione/tipo di arrotondamento (`imprecise(...)`/`with_precision(...)`) |
| `ignorestringattributes` | non avvolgere le stringhe in `safe(...)`/`latex(...)` |
| `matrixcommas` | come sopra |
| `accuracy` | come sopra |
| `plaindecimal` | come sopra |

### 2.3 Tabelle operatore/funzione → output

**`texOps`** (righe 281-625, 91 chiavi). Elenco completo con riga di inizio della
voce:

`#`(282) `not`(285) `+u`(286) `-u`(287) `^`(288) `*`(300) `/`(342) `+`(349) `-`(357)
`dot`(370) `cross`(371) `transpose`(372) `..`(379) `except`(380) `<`(381) `>`(382)
`<=`(383) `>=`(384) `<>`(385) `=`(386) `and`(387) `or`(388) `nand`(389) `nor`(390)
`xor`(391) `implies`(392) `in`(393) `|`(394) `decimal`(395) `abs`(405) `sqrt`(420)
`exp`(423) `fact`(430) `ceil`(437) `floor`(440) `int`(443) `defint`(446) `diff`(449)
`partialdiff`(465) `sub`(481) `sup`(484) `limit`(487) `mod`(490) `perm`(493)
`comb`(496) `root`(499) `if`(508) `switch`(516) `gcd`(517) `lcm`(518) `trunc`(519)
`fract`(520) `degrees`(521) `radians`(522) `round`(523) `sign`(524) `random`(525)
`max`(526) `min`(527) `precround`(528) `siground`(529) `award`(530) `hour24`(531)
`hour`(532) `ampm`(533) `minute`(534) `second`(535) `msecond`(536) `dayofweek`(537)
`sin`(538) `cos`(539) `tan`(540) `sec`(541) `cot`(542) `cosec`(543) `arccos`(544)
`arcsin`(545) `arctan`(546) `cosh`(547) `sinh`(548) `tanh`(549) `coth`(550)
`cosech`(551) `sech`(552) `arcsinh`(553) `arccosh`(554) `arctanh`(555) `ln`(556)
`log`(563) `vector`(567) `rowvector`(570) `matrix`(577) `listval`(580) `set`(583)
`` `+- ``(595) `` `*/ ``(596) `` `| ``(597) `` `& ``(598) `` `! ``(599) `` `where ``(600)
`` `@ ``(601) `` `? ``(602) `` `* ``(603) `` `+ ``(604) `` `: ``(605) `;`(606) `;=`(609)
`m_uses`(612) `m_type`(613) `m_exactly`(614) `m_commutative`(615) `m_noncommutative`(616)
`m_associative`(617) `m_nonassociative`(618) `m_strictplus`(619) `m_gather`(620)
`m_nogather`(621) `m_func`(622) `m_op`(623) `m_numeric`(624).

Nota: `texOps` è condiviso da `texOp` (operatori infissi/prefissi/postfissi) **e** da
`texFunction` (righe 1557-1572): se una funzione ha lo stesso nome di una chiave in
`texOps` (es. `sin`, `abs`, `log`), quella viene usata invece della resa generica
`\operatorname{name} \left ( args \right )`.

**`texNameAnnotations`** (righe 654-693, 21 chiavi + 3 alias): `verbatim`(655)
`op`(658) `vector`(661) `unit`(664) `dot`(667) `matrix`(670) `diff`(673)
`degrees`(676) `bb`(679) `complex`(682) `imaginary`(683) `real`(684) `positive`(685)
`nonnegative`(686) `negative`(687) `integer`(688) `decimal`(689) `rational`(690)
`nonone`(691) `nonzero`(692); alias `verb`(705)→`verbatim`, `v`(706)→`vector`,
`m`(707)→`matrix`.

**`typeToTeX`** (righe 742-842, 19 chiavi): `nothing`(743) `integer`(746)
`rational`(749) `decimal`(752) `number`(755) `string`(758) `boolean`(769)
`range`(772) `list`(775) `keypair`(784) `dict`(788) `vector`(799) `matrix`(804)
`name`(811) `op`(818) `function`(821) `set`(824) `expression`(831) `lambda`(834).

**`typeToJME`** (righe 1655-1889, 21 chiavi): `nothing`(1656) `integer`(1659)
`rational`(1662) `decimal`(1672) `number`(1675) `name`(1678) `string`(1681)
`html`(1684) `boolean`(1688) `range`(1691) `list`(1694) `keypair`(1707) `dict`(1715)
`vector`(1730) `matrix`(1736) `function`(1746) `op`(1756, la più complessa: gestisce
bracketing implicito, v. §2.5) `set`(1848) `interval`(1854) `expression`(1865)
`lambda`(1872) `scope`(1886).

**`jmeFunctions`** (righe 1918-1930, 3 chiavi — override quando renderizzati come
JME anziché con la resa generica `name(args)`): `dict`(1919, riusa
`typeToJME.dict`), `fact`(1920, `n!` o `(expr)!`), `listval`(1927, `a[i]`).

**`jmeOpSymbols`** (righe 1989-1996, 6 chiavi — simbolo scritto quando l'operatore
non coincide col proprio nome): `+u`→`'+'`, `-u`→`'-'`, `not`→`'not '`,
`fact`→`'!'`, `+`→`' + '`, `-`→`' - '`. Per tutti gli altri operatori binari con
`op.length>1` il simbolo diventa `' '+op+' '` (riga 1805-1808); altrimenti `op` nudo.

### 2.4 Le due classi renderer

**`Texifier`** (estende `JMEDisplayer`, righe 1053-1630). Metodi propri:
`render(tree)`(1057, appiattisce `*` annidati, poi dispatcha per `tok.type` via
`typeToTeX`), `complex_number(n,options)`(1101), `complex_decimal(n,options)`(1142),
`rational_number(n,options)`(1183), `rational_decimal(n,options)`(1245),
`real_number(n,options)`(1307), `real_decimal(n,options)`(1350),
`texVector(v,options)`(1392), `texMatrix(m,parens,options)`(1422),
`texTimesSymbol()`(1462), `texName(tok,longNameMacro)`(1480), `texConstant(tree)`(1532),
`texOp(tree,tok,texArgs)`(1551), `texFunction(tree,tok,texArgs)`(1557),
`texifyWouldBracketOpArg(tree,i)`(1580), `texifyOpArg(tree,texArgs,i)`(1620). Alla
fine (1629-1630) `Texifier.prototype.typeToTeX = jme.display.typeToTeX` e
`.texOps = jme.display.texOps` (aggancio ai dizionari condivisi, permette override
per sottoclassi come nelle `Notation`).

**`JMEifier`** (estende `JMEDisplayer`, righe 2003-2333). Metodi propri:
`render(tree)`(2007), `constant(tree)`(2037), `string(s,options)`(2056),
`complex_number(n,options)`(2073), `niceNumber(n,options)`(2113, inietta simboli
locali di π/i/∞ nello scope prima di chiamare `Numbas.math.niceNumber`),
`niceDecimal(n,options)`(2136, come sopra ma chiama `math.niceComplexDecimal`),
`rational_number(n,options)`(2162), `real_number(n,options)`(2210),
`decimal(n,options)`(2283). Alla fine (2331-2333):
`JMEifier.prototype.{typeToJME,jmeOpSymbols,jmeFunctions}` agganciati ai dizionari
condivisi.

### 2.5 Formattazione dei numeri

Percorso comune per **tutte** le varianti (`rational_number`/`real_number` ×
`Texifier`/`JMEifier` × versione `Decimal`): 1) se lo scope ha una costante `pi`
riconosciuta e `math.piDegree(n) > 0`, il numero viene diviso per `π^grado` e alla
fine si riattacca il simbolo della costante (`^{grado}` se >1); 2) si chiama
`Numbas.math.niceNumber`/`niceDecimal` (fuori scope, in `math.js:830`/`940`) con
`{...options, syntax:'latex'}` (solo Texifier) o `{style:'plain'}` (JMEifier); 3) se
la stringa risultante supera **20 caratteri** e `noscientificnumbers` non è
impostato, si passa alla notazione scientifica via
`Numbas.math.parseScientific(n.toExponential(), false)` (math.js:1207), producendo
`significand \times 10^{exponent}` (LaTeX) o `significand*10^(exponent)` (JME); 4)
solo per i "rational" si prova prima `Numbas.math.rationalApproximation` (math.js:2151)
e si sceglie tra intero, frazione semplice (`\frac{a}{b}` / `a/b`) o mista
(`mixedfractions`).

**Complessi**: `complex_number`/`complex_decimal` compongono `re` e `im` gestendo i
casi speciali `im==0` (solo parte reale), `re==0` (solo parte immaginaria, con `i`
nudo se `|im|==1`), segno di `im` (usa ` - ` invece di ` + -`). L'unità immaginaria
usata è quella definita nello scope se presente (`common_constants.imaginary_unit`),
altrimenti `\sqrt{-1}` (TeX) / `sqrt(-1)` (JME).

**Precisione**: `number_options(tok)` (riga 156) porta `precisionType`/`precision`
dal token fino a `Numbas.math.niceNumber`; per interi/razionali `store_precision`
viene forzato a `false`. Lato JME-ifier, se `store_precision` è vero e non c'è
`nicenumber`, il numero viene avvolto in `imprecise(...)` o
`with_precision(n, precision, precisionType)` (righe 2228-2234) — vedi test
`'tokens with precision'` in jme-tests.mjs:2284.

### 2.6 Bracketing

- `jme.precedence` (definito in `jme.js:1488-1521`, alias `jme.precedence =
  jme.standardParser.precedence` a `jme.js:4448`) e `jme.commutative`
  (`jme.js:4501`) sono le tabelle di precedenza/commutatività usate sia dal parser
  sia dal display.
- **Lato TeX** — `texifyWouldBracketOpArg(tree, i)` (riga 1580): mette parentesi se
  1) l'argomento è un'operazione con precedenza più alta (valore numerico
  maggiore = lega più debole, quindi va tra parentesi), o precedenza uguale con
  `i>0` e operatore padre non commutativo, o è un'unaria negativa/positiva in un
  contesto con precedenza `<=` quella di `*`; 2) è un numero complesso non puramente
  reale/immaginario dentro `*`, `-u` o base di `^`; 3) è un numero razionale non
  intero come base di `^` con `fractionnumbers` attivo. `texifyOpArg` (riga 1620)
  applica `\left ( ... \right )` quando (1) è vero.
- **Lato JME** — `opBrackets` (righe 1966-1979) è una tabella esplicita per
  operatore: per ciascun operatore, un array di 1 o 2 dizionari (uno per posizione
  argomento sinistra/destra) che mappano l'operatore-figlio a `true`/`false`/assente
  (assente = usa l'euristica generale). La logica che la consulta è dentro
  `typeToJME.op` (righe 1756-1847): determina `arg_op` (l'operatore implicito
  dell'argomento, inferendo anche i casi impliciti — un numero complesso `a+bi`
  implica `+`/`-`, un numero reso con `*`/`/` nella sua stringa implica quella
  operazione) e poi decide `bracketArg` da `opBrackets[op][j][arg_op]`.
- **Moltiplicazione implicita** — `texOps['*']` (righe 300-341) e
  `typeToJME.op` caso `'*'` (righe 1821-1840) decidono se scrivere il simbolo di
  moltiplicazione (`\times`/`\cdot`/spazio in TeX, `*` in JME) con un'euristica a
  cascata di ~9 condizioni (numero-nome, cifra-cifra, nome_lungo·nome_lungo,
  fattoriale adiacente, numero·`i`, ecc. — v. §9 per i casi limite).

### 2.7 Superficie pubblica `Numbas.jme.display.*`

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `exprToLaTeX` | `(expr, ruleset, scope, parser) → TeX` | 36 | compila+semplifica+texifica una stringa JME | usa ruleset di default `simplificationRules.basic` |
| `treeToLaTeX` | `(tree, ruleset, scope) → TeX` | 59 | come sopra ma parte da un albero già compilato | |
| `simplifyExpression` | `(expr, ruleset, scope, notation) → JME` | 84 | compila+semplifica+ri-serializza come JME | `notation` di default `jme.notations.standard` |
| `simplify` | `(expr, ruleset, scope, notation) → tree` | 104 | compila+semplifica, ritorna l'albero | |
| `simplifyTree` | `(exprTree, ruleset, scope, allowUnbound, notation) → tree` | 131 | applica solo la semplificazione (delega a `ruleset.simplify`) | |
| `subvars` | `(expr, scope, notation) → tree` | 144 | delega a `notation.subvars` (jme-notations.js:71) | |
| `number_options` | `(tok) → niceNumber_settings` | 156 | | |
| `string_options` | `(tok) → {latex,safe}` | 180 | | |
| `texOps` | dizionario | 281 | v. §2.3 | |
| `texNameAnnotations` | dizionario | 654 | v. §2.3 | |
| `specialNames` | dizionario | 723 | v. §2.3 | |
| `typeToTeX` | dizionario | 742 | v. §2.3 | |
| `JMEDisplayer` | classe | 888 | base comune | astratta (metodi vuoti) |
| `Texifier` | classe | 1053 | v. §2.4 | |
| `texify` | `(tree, settings, scope) → TeX` | 1645 | istanzia `Texifier` e chiama `.render` | |
| `typeToJME` | dizionario | 1655 | v. §2.3 | |
| `registerType` | `(type, renderers) → void` | 1900 | estende `typeToTeX`/`typeToJME`/`jme.typeToDisplayString` per un tipo custom | |
| `jmeFunctions` | dizionario | 1918 | v. §2.3 | |
| `treeToJME` | `(tree, settings, scope) → JME` | 1954 | istanzia `JMEifier` e chiama `.render` | |
| `opBrackets` | dizionario | 1966 | v. §2.6 | |
| `jmeOpSymbols` | dizionario | 1989 | v. §2.3 | |
| `JMEifier` | classe | 2003 | v. §2.4 | |
| `align_text_blocks` | `(header, items) → string` | 2342 | ASCII-art, usato solo da `tree_diagram` | debug/CLI, non essenziale |
| `tree_diagram` | `(tree) → string` | 2454 | diagramma ad albero ASCII | debug/CLI, non essenziale |
| `Rule`,`getTerms`,`matchTree`,`matchExpression`,`simplificationRules`,`compileRules` | — | 2476 | alias di compatibilità verso `jme.rules.*` | non riesportare nel port: puntano a `rules.ts` |

## 3. jme-notations.js

**Nota importante**: contrariamente a quanto suggerito dal nome, questo file **non**
contiene gli stili di formattazione numerica locale (`plain`, `en`, `si-en`, `eu`,
`si-fr`, `plain-eu`, `scientific`, `ch`, `in`). Quelli sono
`Numbas.util.numberNotationStyles` in `util.js:1460-1571` (oggetto con `re` +
`format.plain`/`format.latex` per stile) e le funzioni che li usano,
`Numbas.util.{matchNotationStyle,cleanNumber,formatNumberNotation,parseDecimal,
parseNumber,isNumber}` in `util.js` (righe 546-660 e seguenti) e
`Numbas.math.{niceNumber,niceDecimal,niceComplexDecimal}` (`math.js:830,910,940`)
che accettano `options.style`. Il test `'Number notation styles'`
(jme-tests.mjs:2315-2430, dentro il modulo QUnit `'Display'`) esercita esattamente
queste funzioni di `util.js`/`math.js`, non `jme-notations.js`. Nel port questi stili
appartengono al modulo `math/` (task 1 del piano), non a `notations.ts`.

`jme-notations.js` definisce invece **notazioni sintattiche alternative** per il
parser/serializzatore JME: ciascuna è una sottoclasse di `Notation` che sostituisce
`Parser` e/o `JMEifier`.

### 3.1 Classe base `Notation` (righe 21-115)

Campi/metodi: `Parser = jme.Parser`(22), `JMEifier = jme.display.JMEifier`(24),
`name = 'Standard'`(30), `subvars_delimiters = ['{','}']`(36),
`treeToJME(tree,settings,scope)`(47, istanzia `this.JMEifier` e chiama `.render`),
`compile(expr)`(59, istanzia `this.Parser` e chiama `.compile`),
`subvars(expr,scope)`(71-113, sostituzione di variabili in una stringa JME:
usa `Numbas.util.splitbrackets` con i delimitatori della notazione, valuta ogni
blocco tra parentesi con `scope.evaluate`, lo reinserisce come chiamata fittizia
`texify_simplify_subvar(indice)` e infine sostituisce ricorsivamente questi
segnaposto nell'albero compilato con `replace_subvars` — **stringa/albero puro,
nessun DOM**).

### 3.2 Sottoclassi (public surface `jme.notations.*`, righe 414-422)

| chiave registro | classe | riga classe | cosa cambia | dipendenze |
|---|---|---|---|---|
| `standard` | `Notation` (istanza diretta) | 415 | nessuna, è il parser/serializzatore di base | `jme.Parser`, `jme.display.JMEifier` |
| `set_theory` | `SetNotation` | 122-170 | `{1,2,3}` = insieme; `\|` a precedenza 200 per `{x in R \| x > 2}`; `JMEifier` override per `set`/`fact`→ rendering `{...}` | `jme.Parser`, `jme.standardParser.{precedence,shunt_type_actions}` |
| `square_brackets_grouping` | `SquareBracketsNotation` | 174-212 | `[...]` raggruppa come `(...)` invece di indicizzare; ridefinisce il tokenizzatore di punteggiatura per inferire moltiplicazione implicita prima di `[`/`(` | `jme.standardParser.tokeniser_types` |
| `boolean_logic` | `BooleanNotation` | 216-232 | `+`↔`or`, `*`↔`and` (sinonimi bidirezionali sia nel parser sia nel JME-ifier) | `jme.standardParser.opSynonyms` |
| `vector_shorthand` | `VectorShorthandNotation` | 238-319 | `<a,b>` = `dot(a,b)`; `(1,2)` da solo = `vector(1,2)`; ridefinisce token bracket `<`/`>` e regex di punteggiatura Unicode | `jme.standardParser.{ops,re}` |
| `real_interval` | `RealIntervalNotation` | 324-402 | `[a,b]`/`(a,b)` = `interval(a,b,includes_start,includes_end)`, unione con `union(...)` per intervalli multipli | logica di parsing custom (`find_opening_bracket`, `shunt_interval`) |
| `pattern_matching` | `PatternNotation` | 404-408 | usa `jme.rules.PatternParser` invece del parser standard | `jme.rules.PatternParser` (fuori scope, in `jme-rules.js`) |

Ogni notazione, quando ridefinisce `JMEifier`, lo fa con `class extends
jme.display.JMEifier` e sovrascrive solo `typeToJME`/`jmeFunctions`/`jmeOpSymbols`
per le proprie chiavi via `Object.assign({}, ParentClass.prototype.X, {...})` — un
pattern di **override selettivo su dizionario**, non su tutta la classe.

## 4. unicode-mappings.js

### 4.1 Forma dei dati

Il file è un'unica assegnazione `Numbas.unicode_mappings = {...}` (riga 4, 59.441
caratteri) con 7 chiavi di primo livello, tutte oggetti (non array):

| categoria | # voci | forma valore | esempio |
|---|---|---|---|
| `greek` | 66 | `string` (nome ASCII della lettera) | `"Α": "Alpha"` |
| `subscripts` | 37 | `string` (carattere base) | `"ᵢ": "i"` |
| `superscripts` | 17 | `string` (cifra/carattere base) | `"²": "2"` |
| `letters` | 1124 | `[string, string[]]` — `[lettera base, lista annotazioni]` | `"𝐀": ["A", ["BOLD"]]` |
| `symbols` | 269 | `[string, string[]]` — `[simbolo/operatore JME, annotazioni]` | `"×": ["*", []]` |
| `punctuation` | 56 | `[string, string[]]` | `"·": ["*", []]` |
| `brackets` | 22 | `[string, string[]]` — `[parentesi ASCII equivalente, annotazioni]` | `"⟦": ["[", []]` |

Totale 1591 voci. Il vocabolario delle annotazioni usate in `letters`/`symbols`/
`punctuation`/`brackets` è chiuso a 28 valori: `ACUTE, BLACK-LETTER, BOLD, CIRCLE,
CLOSED, CURLY, DOT, DOTLESS, DOUBLE, DOUBLE-STRUCK, DOWNWARDS, FRAKTUR, INITIAL,
ITALIC, LOOPED, MONOSPACE, OPEN, RELATION, REVERSE, RING, SANS-SERIF, SCRIPT,
SLOPING, SQUARE, STRETCHED, TAILED, THREE-DIMENSIONAL, TRIPLE, UPWARDS`. Alcune
lettere hanno più di un'annotazione (es. `𝑨` → `["A", ["BOLD","ITALIC"]]`).

Generato da uno script esterno (commento riga 2: `github.com/numbas/unicode-math-
normalization`), non manutenuto a mano.

### 4.2 Consumo

`unicode-mappings.js` **non è referenziato né da `jme-display.js` né da
`jme-notations.js`** (verificato via grep, zero occorrenze). È usato **solo** da
`jme.js`, esclusivamente lato tokenizzatore/parser (input), non lato display
(output):

| uso | file:riga | come |
|---|---|---|
| lista operatori | `jme.js:1184` | `ops = [...].concat(Object.keys(unicode_mappings.symbols))` |
| apici | `jme.js:1191-1192` | `superscript_replacements` — sostituisce cifre in apice con cifre normali prima del parsing di `x²` |
| regex nome pedice | `jme.js:1211` | pedici Unicode ammessi in coda a un nome |
| regex carattere pedice | `jme.js:1229` | `re_subscript_character` |
| regex lettera matematica | `jme.js:1233` | `re_math_letter` (usata da `normaliseName`) |
| `unicode_annotations` | `jme.js:1855-1863` | mappa 6 annotazioni Unicode (`FRAKTUR`,`BLACK-LETTER`,`DOUBLE-STRUCK`,`MONOSPACE`,`SCRIPT`,`BOLD`) alle annotazioni JME (`frak`,`bb`,`tt`,`cal`,`bf`) |
| `Parser.prototype.normaliseName(name)` | `jme.js:1873-1900` | consuma `letters` (sostituisce lettere matematiche con base+annotazioni), `greek` (sostituisce nomi greci), `subscripts` |
| `Parser.prototype.normaliseNumber(literal)` | `jme.js:1910-1912` | solo `.normalize('NFKD')`, non usa la tabella |
| `Parser.prototype.normalisePunctuation(c)` | `jme.js:1919-1923` | consuma `brackets` |
| `Parser.prototype.normaliseOp(op)` | `jme.js:1932-1938` | consuma `symbols` |
| `jme.re_greek` | `jme.js:4100` | `RegExp` costruita da `Object.values(unicode_mappings.greek)`, usata da `jme.getNameInfo` (`jme.js:4108-4143`) per riconoscere se il "root" di un nome è greco → **questo è l'unico ponte indiretto verso `jme-display.js`**: `Texifier.texName` (riga 1510-1514) legge `nameInfo.isGreek` per anteporre `\` al nome in TeX. `punctuation` non risulta usato da nessuna parte nel runtime attuale (probabile dato riservato per usi futuri/compilatore XML). |

### 4.3 Porting consigliato

Dato che è **puro dato statico** (nessuna funzione, nessuna logica condizionale) e
serve solo al tokenizzatore (`jme/tokenizer.ts` o `parser.ts`, non `display.ts`), la
raccomandazione è: **file dati JSON** (`unicode.json` o costanti generate) più un
piccolo modulo TS `unicode.ts` con tipi:

```ts
export type UnicodeAnnotation = 'ACUTE' | 'BOLD' | ... ; // 28 valori chiusi
export type UnicodeMapEntry = [string, UnicodeAnnotation[]];
export interface UnicodeMappings {
  greek: Record<string, string>;
  subscripts: Record<string, string>;
  superscripts: Record<string, string>;
  letters: Record<string, UnicodeMapEntry>;
  symbols: Record<string, UnicodeMapEntry>;
  punctuation: Record<string, UnicodeMapEntry>;
  brackets: Record<string, UnicodeMapEntry>;
}
```
Non è necessario portarlo come "TS constants" scritte a mano (1591 voci): meglio
generare il JSON una volta dal file upstream (es. con lo stesso script
`node -e` usato per l'ispezione in questo inventario) e versionarlo come asset dati,
mantenendo la possibilità di rigenerarlo se l'upstream aggiorna la tabella. Va
importato solo dal modulo tokenizer del pacchetto `jme/`, **non** da `display.ts`.

## 5. jme-variables.js

### 5.1 Layout

| riga inizio | riga fine | cosa contiene |
|---|---|---|
| 1-21 | header Apache, `Numbas.queueScript`, alias `jme`/`util` |
| 24-40 | typedef JSDoc `variable_data_dict`, `func_data` |
| 42 | `const symbol_promises = Symbol("promises")` — chiave privata per lo stato delle promesse in sospeso dentro `todo` |
| 44-786 | oggetto pubblico **`jme.variables`** (v. §5.2 per il dettaglio dei membri) |
| 787-793 | typedef `note_definition` |
| 795 | `re_note` — regex che spacca `nome (descrizione): espressione` |
| 797-836 | classe **`ScriptNote`** — una nota di uno script di correzione (`name`, `description`, `expr`, `tree`, `vars`); usata da `marking.js` (fuori scope) |
| 838-939 | **`note_script_constructor(construct_scope, process_result, compute_note)`** — factory che produce una classe `Script` per interpretare script di note (es. `marking_scripts/*.jme`); `Script` ha `evaluate`/`evaluate_note`, delega a `jme.variables.makeVariables`/`remakeVariables` |
| 941-953 | costruttore **`DOMcontentsubber(scope)`** — `IGNORE_TAGS = ['iframe','script','style']` |
| 954-1207 | `DOMcontentsubber.prototype`: `subvars`(960), `sub_element`(979), `sub_text`(1061), `findvars`(1093), `findvars_element`(1109), `findvars_text`(1159) — **tutto DOM-dipendente**, v. §5.4 |
| 1208 | chiusura `queueScript` |

### 5.2 Superficie pubblica `Numbas.jme.variables.*`

| nome | firma | riga | descrizione |
|---|---|---|---|
| `makeJMEFunction` | `(fn, scope) → Function` | 51-86 | crea una funzione JME custom (`fn.definition` in JME) che valuta gli argomenti in un nuovo scope figlio |
| `makeJavascriptFunction` | `(fn, withEnv) → Function` | 87-134 | crea una funzione custom scritta in JavaScript, con `new Function(paramNames, fn.definition)` |
| `makeFunction` | `(def, scope, withEnv) → funcObj` | 135-171 | dispatcha su `def.language` (`'jme'`/`'javascript'`), costruisce un `jme.funcObj` |
| `makeFunctions` | `(tmpFunctions, scope, withEnv) → Object<funcObj>` | 172-182 | applica `makeFunction` a una lista, indicizza per nome |
| `computeVariable` | `(name, todo, scope, path, computeFn) → token` | 191-245 | valuta ricorsivamente una variabile e le sue dipendenze (sincrono); v. §5.3 |
| `computeVariablePromise` | `(name, todo, scope, path, computeFn) → Promise<token>` | 256-321 | come sopra, versione `async`, gestisce token `TPromise` (funzioni JME asincrone) e cache delle promesse in corso via `todo[symbol_promises]` |
| `splitVariableNames` | `(s) → string[]` | 328-332 | spacca `"a, b, c"` per l'assegnazione multipla/destrutturante |
| `makeVariables` | `(todo, scope, condition, computeFn, targets) → {variables, conditionSatisfied, scope}` | 343-398 | valuta un intero dizionario di variabili, gestendo nomi multipli (`$multi_N`); valuta `condition` **una sola volta** (non è un ciclo, v. §5.3) |
| `makeVariablesPromise` | `(todo, scope, condition, computeFn, targets) → Promise<{...}>` | 410-469 | equivalente a promesse di `makeVariables` |
| `remakeVariables` | `(todo, changed_variables, scope, computeFn, targets) → Scope` | 482-526 | ricalcola solo le variabili dipendenti da quelle cambiate (usa `variableDependants`) |
| `computeRuleset` | `(name, todo, scope, path) → Ruleset` | 536-563 | valuta ricorsivamente un ruleset e le sue dipendenze, con rilevamento cicli |
| `makeRulesets` | `(todo, scope) → Object<Ruleset>` | 570-576 | applica `computeRuleset` a tutte le chiavi |
| `makeConstants` | `(definitions, scope, enabled) → string[]` | 585-605 | aggiunge costanti con nome allo scope, rispettando `enabled` |
| `variableDependants` | `(todo, ancestors, scope) → todo-subset` | 613-687 | dato un elenco di nomi "antenati", ritorna il sotto-dizionario delle variabili che ne dipendono (diretta o transitivamente) |
| `DOMcontentsubvars` | `(element, scope) → Element` | 697-700 | **DOM** — istanzia `DOMcontentsubber` e sostituisce variabili in un elemento e figli |
| `DOMsubvars` | `(str, scope, doc) → Array<Array<Node>>` | 708-784 | **misto**: la logica di split/valutazione (righe 708-774) è stringa pura; la conversione finale HTML→nodi DOM (righe 775-782, `document.createElement`) è DOM-dipendente |
| `ScriptNote` | classe | 812-836 | v. §5.1 |
| `note_script_constructor` | `(construct_scope, process_result, compute_note) → ScriptClass` | 846-938 | v. §5.1 |
| `DOMcontentsubber` | classe | 948-1207 | v. §5.1, tutta DOM |

### 5.3 Algoritmo di generazione/ordinamento e casi d'errore

Non c'è un ordinamento topologico esplicito precalcolato: la risoluzione delle
dipendenze è **pigra e ricorsiva**, guidata da `computeVariable`/
`computeVariablePromise`:

1. `makeVariables(todo, scope, condition, computeFn, targets)` (riga 343) prima
   normalizza `todo` espandendo le assegnazioni multiple (`"a,b": {...}` diventa una
   variabile sintetica `$multi_N` più proiezioni `a := $multi_N[0]`, `b :=
   $multi_N[1]`, righe 344-373).
2. Se c'è una `condition`, calcola le variabili da cui dipende
   (`jme.findvars(condition,[],scope)`) e le forza a essere calcolate (righe
   378-381), poi valuta la condizione **una sola volta** (riga 382) e la scrive in
   `conditionSatisfied`.
3. Se la condizione è soddisfatta (o non c'è), calcola i `targets` (default: tutte
   le chiavi di `todo`), uno per uno, tramite `computeFn` (default `computeVariable`).
4. `computeVariable(name, todo, scope, path, computeFn)` (riga 191): se il valore è
   già nello scope lo ritorna; altrimenti, per ciascun nome in `todo[name].vars`
   (l'elenco di variabili da cui `name` dipende, calcolato altrove da
   `jme.findvars` sull'albero — non in questo file) non ancora nello scope, chiama
   ricorsivamente `computeFn` con `path` esteso in testa (`newpath.splice(0,0,name)`,
   riga 220); poi valuta `jme.evaluate(v.tree, scope)` e scrive il risultato nello
   scope.

**Casi d'errore** (tutti `Numbas.Error`, con `originalMessage`):

| errore | condizione | riga |
|---|---|---|
| `jme.variables.empty name` | `name == ''` | 202, 273 |
| `jme.variables.circular reference` | `path.contains(name)` — il nome è già in corso di valutazione più in alto nella catena | 205, 276 |
| `jme.variables.variable not defined` | `todo[name] === undefined` e non è nemmeno una costante dello scope | 213, 284 |
| `jme.variables.error computing dependency` | eccezione (diversa da circular/not-defined) propagata dal calcolo di una dipendenza | 227, 298 |
| `jme.variables.empty definition` | `!v.tree` | 233, 304 |
| `jme.variables.error evaluating variable` | eccezione durante `jme.evaluate(v.tree,scope)` | 242, 318 |
| `ruleset.circular reference` / `ruleset.set not defined` | equivalenti per `computeRuleset` | 545, 550 |

**Il ciclo "genera finché la condizione non è soddisfatta" con `maxRuns` NON è in
questo file**: `jme.variables.makeVariables`/`makeVariablesPromise` valutano la
condizione **una volta sola** per chiamata. Il retry loop (`variablesTest.condition`
+ `variablesTest.maxRuns`, default 10, clampato a `[1, 1000000]`) vive in
`question.js:842-864` — ad ogni iterazione crea un **nuovo `Scope` figlio**, imposta
`variable_generation_run_number` (un `TNum` col numero del tentativo, disponibile
alle definizioni JME) e richiama `jme.variables.makeVariablesPromise(q.variablesTodo,
scope, condition)`; se dopo `maxRuns` tentativi la condizione non è mai vera, errore
`jme.variables.question took too many runs to generate variables`
(`question.js:858`). Esiste anche un costrutto JME **omonimo ma indipendente**, la
funzione builtin `satisfy(names, definitions, conditions, maxRuns=100)`
(`jme-builtins.js:2225-2267`), che fa lo stesso retry ma *dentro* una singola
espressione JME (non nel motore di generazione delle variabili di domanda). Il port
deve replicare la struttura a due livelli: un modulo `variables/` con
`makeVariables` "un solo tentativo" (questo file) e un chiamante a livello domanda
col ciclo `maxRuns` (fuori scope qui, appartiene al modulo `question/`, task 9).

### 5.4 DOM vs puro

**DOM-dipendente** (da NON portare 1:1, v. §7): `jme.variables.DOMcontentsubvars`
(697-700), l'intera classe `DOMcontentsubber` (948-1207: `subvars`, `sub_element` —
usa `element.tagName`, `element.attributes`, `window.location`,
`element.ownerDocument`, ecc. —, `sub_text`, `findvars`, `findvars_element`,
`findvars_text`), e la coda di `DOMsubvars` (righe 775-782: `document.createElement`
+ `innerHTML` + `doc.importNode`).

**Puro** (stringhe/alberi, portabile 1:1): tutto il resto di `jme.variables.*`
(§5.2 tranne le 3 voci DOM sopra), `ScriptNote`, `note_script_constructor`. In
particolare la parte "logica" di `DOMsubvars` (righe 708-774: split con
`util.splitbrackets`, compilazione+valutazione di ogni blocco `{expr}`,
`doToken(token)` che decide come serializzare ogni tipo di token — HTML, stringa,
lista, altro via `jme.tokenToDisplayString`) è pura e va isolata dal wrapping DOM
finale nel port.

## 6. Dipendenze e globali

Chiamate verso namespace/funzioni **fuori** dai 4 file, con righe rappresentative
(non esaustive per le funzioni molto usate come `jme.isType`/`jme.isOp`):

| namespace/funzione | file:riga chiamante | usato per |
|---|---|---|
| `Numbas.jme.evaluate` | jme-variables.js:236,307 | valutare l'albero di una variabile nello scope |
| `Numbas.jme.findvars` | jme-variables.js:378,453; jme-display.js (indiretto, non chiamato qui) | dipendenze di una condizione/nota |
| `Numbas.jme.compile` | jme-variables.js:366,433,753(jme.js),831 | ri-parsing di espressioni sintetiche (proiezioni multi-assegnazione, note) |
| `Numbas.jme.castToType`, `Numbas.jme.isType`, `Numbas.jme.isOp` | pervasivo in jme-display.js (es. righe 267,295,318...) e jme-variables.js (238,314) | dispatch su tipo/operatore |
| `Numbas.jme.normaliseName` | jme-display.js:1552,1558; jme-variables.js:600,679 | normalizzazione nomi (case-insensitive/scope-dependent) |
| `Numbas.jme.getNameInfo` (via `tok.nameInfo`) | jme-display.js:1510 | struttura nome (radice, pedice, greco, apici) per `texName` |
| `Numbas.jme.precedence`, `Numbas.jme.commutative` | jme-display.js:1581,1598 (via `jme.precedence`) | bracketing |
| `Numbas.jme.unwrapSubexpression` | jme-display.js:1073; jme-notations.js:84 | "spacchetta" un token `TExpression` prima del render |
| `Numbas.jme.escape`/`unescape` | jme-display.js:2059 (JMEifier.string) | escaping stringhe JME |
| `Numbas.jme.types.*` (`TNum`,`TDecimal`,`TList`,`TKeyPair`,`TFunc`,`TBool`,`TPunc`...) | pervasivo | costruzione/tipo dei token |
| `Numbas.jme.rules.displayFlags`, `Ruleset`, `Rule`, `PatternParser`, `collectRuleset` | jme-display.js:2476 (alias); jme-notations.js:407 (PatternParser); jme-variables.js:560,573 (collectRuleset) | semplificazione/ruleset (fuori scope, task 3) |
| `Numbas.math.niceNumber`, `niceDecimal`, `niceComplexDecimal` | jme-display.js: es. 1188,1250,1312,2113,2136 | formattazione numerica (fuori scope, task 1) |
| `Numbas.math.rationalApproximation`, `piDegree`, `parseScientific`, `unscientific`, `countDP`, `mod` | jme-display.js: es. 1193,1185,1190,2223,400,1198 | v. §2.5 (fuori scope, task 1) |
| `Numbas.util.extend_object`, `extend`, `splitbrackets`, `contentsplitbrackets` | jme-display.js:47,67,90,1053,2003; jme-notations.js:73; jme-variables.js:710,1063,1163 | v. §7 (fuori scope, task 1) |
| `Numbas.locale.default_list_separator` | jme-display.js: 10 occorrenze, es. 231,590,782,1406 | separatore di lista localizzato nel LaTeX/JME renderizzato |
| `Numbas.locale.default_number_notation`, `set_preferred_locale` | non nei 4 file direttamente, ma letti da `math.niceNumber`/`niceDecimal` (math.js) che jme-display.js chiama | v. test `'Localise number representation'` |
| `R(...)` | jme-display.js: 2 occorrenze (1088,2033 — messaggi errore `'jme.display.unknown token type'`); jme-variables.js: 2 occorrenze indirette (i messaggi d'errore sono passati come `originalMessage` a `new Numbas.Error(...)`, es. righe 202,205,213...) | localizzazione messaggi d'errore (i18next in originale → dizionario nostro `it`/`en`, v. spec §Localizzazione) |
| `Math.random` | **nessuna occorrenza diretta** nei 4 file | v. §9 — il random è consumato dentro `jme.evaluate` quando l'albero di una variabile contiene funzioni builtin come `random`, `rannum`, `shuffle` (definite in `jme-builtins.js`/`math.js`, fuori scope) |
| DOM (`document`, `window`) | solo in jme-variables.js: `document.createElement`/`createTextNode` (righe 709(util.js, fuori),777,1079), `window.location` (988), `element.*` pervasivo in `DOMcontentsubber` | v. §5.4, §7 |
| `MathJax` | **nessun riferimento diretto** nei 4 file; un commento in jme.js:403 ("Substitute into TeX? Normally this is left to MathJax") indica che la sostituzione `\var{}`/`\simplify{}` dentro ambienti matematici è normalmente demandata a un'estensione MathJax caricata altrove (fuori da questi 4 file e fuori da `runtime/scripts/`) | v. §7 |
| `$` (jQuery) | nessun riferimento nei 4 file | — |

## 7. Da non portare

- **`Numbas.jme.variables.DOMcontentsubvars`** (jme-variables.js:697-700) e l'intera
  classe **`DOMcontentsubber`** (948-1207): manipolano `Element`/`Node` del DOM
  reale (`tagName`, `attributes`, `childNodes`, `ownerDocument`,
  `parentElement.insertBefore/removeChild`, `window.location`, gestione `<img
  src=".svg">`→`<object>`, `<object>` con `contentDocument`, attributo
  `data-jme-visible` per mostrare/nascondere nodi). Motivo: il pacchetto engine non
  deve toccare `document`/`window` (vincolo esplicito della spec). Il player
  (sotto-progetto 3, React) farà la propria sostituzione HTML lato client, o si userà
  un parser HTML server-side se serve pre-renderizzare — decisione fuori da questo
  inventario.
- **Coda DOM di `DOMsubvars`** (jme-variables.js righe 775-782): solo la
  conversione finale stringa→nodi (`document.createElement('div'); d.innerHTML=...;
  doc.importNode(...)`) è da scartare; la parte di calcolo (righe 708-774) è da
  portare (v. sotto).
- **`align_text_blocks`/`tree_diagram`** (jme-display.js:2342-2471): utility di
  debug per stampare un albero JME come diagramma ASCII in console. Non è display
  matematico, non serve al player né al motore di correzione. Da scartare (o
  portare solo se richiesto per debug interno, bassa priorità).
- **Alias di compatibilità `jme.display.{Rule,getTerms,matchTree,matchExpression,
  simplificationRules,compileRules}`** (jme-display.js:2476-2478): sono solo
  puntatori a `jme.rules.*` per retrocompatibilità storica; nel port questi nomi
  vivono direttamente in `rules.ts` e non vanno duplicati in `display.ts`.
- **`PatternNotation`/pattern-matching helpers in `texOps`** (voci `` `+- ``,
  `` `*/ ``, `` `| ``, ecc., righe 595-624, e `SetNotation`/`PatternNotation` in
  jme-notations.js): servono a visualizzare **pattern di ricerca** (usati
  dall'editor/autore di domande per il pattern-matching in `jme-rules.js`), non a
  visualizzare espressioni di domande. Bassa priorità: portare solo se il motore di
  correzione (task 7, `marking.js`) userà pattern-matching visualizzato all'utente;
  altrimenti rinviare.
- **`jme.notations.pattern_matching`** dipende da `jme.rules.PatternParser`, fuori
  scope per la prima versione (il pattern-matching serve al motore di
  semplificazione/marking, task 3/7, non al rendering di domande).

**Sostituzione `{expr}` e `\var{}`/`\simplify{}` senza DOM**: l'obiettivo del port
(statement/adviceHtml con LaTeX in `\( \)`/`\[ \]`, spec righe 138-139) è raggiunto
riusando la parte **già stringa-pura** dell'upstream, che vive in `jme.js` (non nei 4
file di questo inventario, ma è il pezzo mancante da citare esplicitamente):

- **`Numbas.util.splitbrackets(str, lb, rb, nestlb, nestrb)`** (`util.js:932-969`) —
  spacca una stringa alternando testo/contenuto-tra-parentesi, gestendo parentesi
  annidate e stringhe JME letterali dentro le parentesi. Usata sia da
  `jme.subvars` sia da `Notation.prototype.subvars`.
- **`Numbas.jme.subvars(str, scope, display)`** (`jme.js:553-586`) — sostituisce
  `{expr}` dentro una stringa **non-matematica** (es. testo semplice), puro.
- **`Numbas.util.contentsplitbrackets(txt, re_end)`** (`util.js:1619-…`) — spacca un
  testo in blocchi `[testo normale, delimitatore-apertura, TeX, delimitatore-
  chiusura, ...]` riconoscendo `$...$`, `\(...\)`, `\[...\]`, `\begin{env}...\end{env}`;
  puro, nessun DOM.
- **`Numbas.jme.contentsubvars(str, scope, sub_tex)`** (`jme.js:399-434`) — usa
  `contentsplitbrackets` per isolare i blocchi di matematica, poi (se
  `sub_tex=true`) chiama **`Numbas.jme.texsplit(s)`** (`jme.js:443-…`) per trovare
  i comandi `\var[...]{...}` e `\simplify[...]{...}` dentro ciascun blocco TeX, e li
  sostituisce **direttamente**: caso `'var'` valuta l'espressione e chiama
  `jme.display.texify` (il renderer di questo inventario!); caso `'simplify'`
  sostituisce le variabili con `jme.subvars` e chiama `jme.display.exprToLaTeX`.
  Questa è **esattamente** la funzione da portare come alternativa
  string-based a MathJax: nel commento originale (`jme.js:403`) si dice che
  normalmente questo lavoro "è lasciato a MathJax" (che intercetta `\var{}` come
  macro lato client), ma `contentsubvars` con `sub_tex=true` fa lo stesso lavoro
  offline, senza DOM né MathJax.
- Per il port: una funzione `subvars(html: string, scope: Scope): string` in
  `packages/engine` deve replicare `jme.contentsubvars(str, scope, true)`
  (compilando in TS `splitbrackets`, `contentsplitbrackets`, `texsplit`, e
  chiamando i nuovi `subvars`/`texify`/`exprToLaTeX` di `display.ts`), producendo
  HTML con blocchi matematici già pronti per KaTeX/MathJax **client-side per il
  solo rendering finale**, non per la sostituzione delle variabili.

## 8. Test upstream

Entrambi i file di test sono ESM (`tests/jme/jme-tests.mjs`, 2983 righe;
`tests/jme/doc-tests.mjs`, 6209 righe, dati puri — un array esportato di sezioni →
funzioni → esempi). `jme-tests.mjs` importa `doc_tests` da `doc-tests.mjs` e genera
dinamicamente un modulo/test per ciascuna funzione documentata con esempi (righe
2966-2982).

### 8.1 Moduli QUnit rilevanti per questi 4 file

| modulo | righe | # `QUnit.test` | copre |
|---|---|---|---|
| `Subvars` | 66-139 | 6: `splitbrackets`(67), `contentsplitbrackets`(80), `subvars`(83), `findvars`(95), `findvars in HTML`(120), `util`(129) | `util.splitbrackets`/`contentsplitbrackets`, `jme.subvars`, `jme.findvars` (incl. dentro `\var{}`/`\simplify{}`), `DOMcontentsubber.findvars` |
| `Built-in notations` | 2018-2031 | 5 (generati da un loop su `notation_tests`, righe 1992-2016: `set_theory`, `square_brackets_grouping`, `boolean_logic`, `vector_shorthand`, `real_interval` — **`pattern_matching` non testato qui**) | `jme.notations.*`: `compile` + `treeToJME` per ciascuna notazione, confronto con l'albero standard via `treesEqual` (helper riga 54) e con la stringa JME attesa via `assert.equal` |
| `Display` | 2234-2831 | 17: `niceNumber`(2236) `niceDecimal`(2253) `niceComplexDecimal`(2267) `tokens with precision`(2284) `Number notation styles`(2315, **in realtà testa `util.js`/`math.js`, non `jme-display.js`**) `subvars`(2432) `token to display string`(2437) `tree to JME`(2458, il più grande: ~140 righe, copre bracketing/segno/scientific/frazioni/pattern) `Simplify surds`(2600) `brackets involving subtraction`(2610) `localisation doesn't affect treeToJME`(2618) `Localise number representation`(2627) `large product`(2650) `texName`(2657) `texify`(2693) `expression to LaTeX`(2732, il secondo più grande: ~90 righe, copre quasi tutti i casi di bracketing/moltiplicazione implicita) `Tree to LaTeX`(2826) | `jme.display.{texify,treeToJME,exprToLaTeX,treeToLaTeX,simplifyExpression}`, `Texifier`, `JMEifier` |
| `Promises` | 2832-2865 | 1: `makeVariablesPromise`(2833) | `jme.variables.makeVariablesPromise` con una funzione builtin asincrona custom (`wait`, basata su `TPromise`+`setTimeout`), verifica che una dipendenza promessa sia risolta una sola volta anche se referenziata più volte |
| `Documentation` | 2866-2965 | 2: `Coverage`(2867), `Random flag set properly`(2950) | copertura incrociata `doc-tests.mjs` ↔ funzioni builtin definite (non specifico ai 4 file, ma esercita `jme.display.treeToJME` per confrontare l'output) |
| `Docs: <sezione>` (dinamico) | 2966-2982 | 245 (una per funzione builtin con esempi, su 280 funzioni totali documentate in 25 sezioni; 540 asserzioni di esempio totali) | per ogni esempio `{in, out}`, valuta `in` nello scope builtin e confronta `treeToJME(risultato, {ignorestringattributes:true, wrapexpressions:true})` con `out` **dopo aver rimosso tutti gli spazi bianchi** (`clean = s => s.replace(/\s/g,'')`, riga 2974-2976) |

Totale nel file: 11 `QUnit.module(...)`, 111 `QUnit.test(...)` statici (più i 245
generati dinamicamente da `doc-tests.mjs` = 356 test totali contando anche i moduli
non relativi a questi 4 file, es. `Compiling`, `Evaluating`, `Scopes`,
`Pattern-matching`, `Real intervals`).

### 8.2 Come sono confrontati gli output

- **LaTeX** (`exprToLaTeX`, `texify`, `treeToLaTeX`): confronto **stringa esatta**
  con `assert.equal` (nessuna normalizzazione — spazi, `\left ( `/`\right )` con
  spazi interni fanno parte del contratto, v. es. `jme-tests.mjs:2743-2761`). Il
  piano del sotto-progetto stesso (spec riga 84-85, "Non-obiettivi") dichiara di
  **non** puntare alla compatibilità byte-per-byte col LaTeX originale — quindi
  questi test upstream vanno tradotti come riferimento/oracolo per i test
  differenziali (con normalizzazione degli spazi, come da spec riga 210), non
  come asserzioni stringa-esatta 1:1 nei test unitari del port.
- **JME** (`treeToJME`, `simplifyExpression`): anch'esso confronto stringa esatta
  via `assert.equal` nei test statici di `jme-tests.mjs`; nei test generati da
  `doc-tests.mjs` invece il confronto **rimuove tutti gli spazi bianchi** prima di
  confrontare (righe 2974-2977), perché l'output di `treeToJME` per una stessa
  espressione può variare nella spaziatura a seconda del contesto (moltiplicazione
  implicita, ecc.) mentre la sostanza (token e ordine) deve combaciare.
- **Alberi** (`Built-in notations`): confronto **strutturale**, non stringa, via
  l'helper `treesEqual(assert,a,b,message)` (righe 54-59) che ignora `pos` e
  `bracketed` e confronta ricorsivamente `tok.type`/`tok.name`/arità.

## 9. Punti delicati

- **Soglia di notazione scientifica arbitraria (`out.length > 20`)** — ripetuta
  identica in 6 punti (righe 1189, 1251, 1313, 1356, 2177, 2246): se la
  rappresentazione "nice" supera 20 caratteri e `noscientificnumbers` non è
  attivo, si passa a notazione scientifica. È un valore magico duplicato: nel port
  va estratto in una costante condivisa, e i test differenziali devono verificare
  che la soglia scatti esattamente sugli stessi input (es. `10000000000000000000000000.0`
  → notazione scientifica, test `jme-tests.mjs:2484,2739`).
- **Sottrazione e numeri complessi**: `texOps['-']` (riga 357) e
  `typeToJME.op` caso `'-'` (righe 1816-1820) hanno un caso speciale: se il
  secondo operando è un numero complesso con parte reale (`hasRealPart`), si
  **coniuga** (`conjugate`) e si stampa con `-` invece di `+` (es. `a - (2+3i)`
  invece di `a + (2-3i)`... attenzione, verificare il verso esatto sul codice,
  righe 358-361: coniuga `b` e stampa `texArgs[0] - texb`). Un naive port che
  semplicemente stampasse `a + (-b)` romperebbe i test `'expression to LaTeX'`
  (es. `exprToLaTeX('3+(-2)')` vs sottrazione tra complessi).
- **Unaria +/- davanti a un complesso**: `texUnaryAdditionOrMinus` (righe 251-274)
  intercetta il caso in cui l'argomento sia già un numero complesso e nega
  direttamente `re`/`im` invece di anteporre il simbolo e mettere parentesi — questo
  evita `-（2+3i)` a favore di `-2-3i` renderizzato come nuovo numero.
- **Moltiplicazione implicita**: l'euristica in `texOps['*']` (righe 300-341, TeX)
  e in `typeToJME.op` caso `'*'` (righe 1821-1840, JME) **non sono la stessa
  euristica** — usano condizioni diverse (il TeX ha ~9 casi con priorità dichiarata
  nell'ordine del codice, il JME ne ha una versione più semplice basata su
  `bracketed[]` e se l'argomento è un `name`/numero). Un port che condivida
  un'unica funzione "serve il simbolo?" tra i due renderer romperà casi come
  `x * xy` (TeX: `\times`, riga 2756) vs `2*3*(-4)` (JME: nessun simbolo tra `2` e
  `3`, ma serve tra `3` e `(-4)`, righe 2557-2558).
- **`\times` vs `\cdot` vs spazio**: `texTimesSymbol()` (riga 1462) è controllato da
  `settings.timesdot`/`timesspace`, indipendente da `alwaystimes` (che decide *se*
  mostrare il simbolo, non *quale*). Attenzione a non confondere i due flag nel
  port.
- **Frazioni**: 3 modalità indipendenti e componibili — `fractionnumbers` (frazione
  vs decimale), `mixedfractions` (frazione impropria come `3 \frac{1}{4}`, solo se
  `fractionnumbers` è vero), `flatfractions` (frazione in linea con `\middle/`
  invece di `\frac{}{}`, si applica anche a `diff`/`partialdiff`, non solo a `/`
  e ai numeri). I test `mixedfrac(...)` (righe 2700-2704) e `flatFractions`
  (righe 2781-2782) vanno riprodotti esattamente.
- **π e altre costanti "scalate"**: `common_constants.pi` non è necessariamente lo
  scope-`pi` standard — può essere un'altra costante con `piDegree(n)==1` a meno di
  un fattore di scala (`scale = n/Math.PI`, riga 920). Il rendering di un numero
  come multiplo di π (righe 1216-1233 ecc.) usa questa scala. Se il port cambia il
  meccanismo di costanti dello scope, questa logica va rifatta con attenzione (vedi
  test `'2 * pi'` righe 2767 e la gestione di costanti custom via `scope.getConstant`).
- **Precisione/`with_precision`**: la resa JME di un numero con precisione
  memorizzata (`store_precision`) produce `imprecise(x)` o
  `with_precision(x, precision, precisionType)` — sono **funzioni JME reali** che
  il parser deve poter rileggere; il port deve garantire che
  `packages/engine` implementi anche queste 2 funzioni builtin (task 4, fuori
  scope qui, ma referenziato da `treeToJME`).
- **Input Unicode → nomi**: `Parser.normaliseName` (jme.js:1873-1900) applica in
  **ordine preciso**: 1) sostituzione lettere matematiche (`re_math_letter`,
  consuma da sinistra, accumula annotazioni), 2) sostituzione lettere greche
  (`Object.entries(greek)`, sostituzione testuale — **l'ordine di iterazione delle
  chiavi conta** se una lettera greca fosse sottostringa di un'altra, verificare in
  porting che l'ordine delle chiavi in JSON/Map sia preservato), 3) sostituzione
  pedici. Un port che processi questi passi in un ordine diverso può produrre nomi
  diversi per lo stesso simbolo Unicode.
- **Determinismo della generazione variabili e `Math.random`**: nessuno dei 4 file
  chiama `Math.random` direttamente. Il consumo avviene **dentro
  `jme.evaluate(v.tree, scope)`** (jme-variables.js:236/307), quando l'albero
  contiene funzioni builtin come `random(...)`/`rannum(...)`/`shuffle(...)`
  (definite in `jme-builtins.js`/`math.js`, fuori scope). Perché il generatore
  iniettato riproduca esattamente gli stessi valori dell'oracolo a parità di seed,
  **l'ordine delle chiamate** deve essere identico, e quest'ordine è determinato da:
  1. l'ordine di iterazione di `Object.keys(todo)` in `makeVariables` (righe
     347, 386) — in JS l'ordine delle chiavi stringa di un oggetto è l'ordine di
     inserimento; il port deve usare una struttura dati (`Map`, o oggetto) con la
     **stessa garanzia d'ordine** e popolata nello stesso ordine in cui il JSON di
     domanda elenca le variabili;
  2. l'ordine ricorsivo di risoluzione delle dipendenze dentro `computeVariable`
     (righe 216-231): per ogni variabile, le dipendenze sono visitate
     nell'ordine dell'array `v.vars` (prodotto da `jme.findvars` sull'albero,
     fuori scope qui — ma l'ordine di quell'array conta);
  3. dentro una singola espressione, l'ordine di valutazione degli argomenti in
     `jme.evaluate` (fuori scope, ma tipicamente sinistra-destra);
  4. il ciclo esterno `maxRuns` in `question.js` (§5.3): ad ogni tentativo fallito
     si **ricomincia da zero** con un nuovo scope, quindi anche i tentativi falliti
     consumano draw dal generatore — il port deve consumare lo stesso numero di
     draw per tentativo fallito, non "riavvolgere" il generatore.
  Conclusione: il port **non** deve riordinare `Object.keys`/l'iterazione delle
  variabili per "pulizia" (es. ordine alfabetico, o dipendenze-prima) — deve
  preservare l'ordine di inserimento derivato dal JSON di domanda, esattamente
  come fa l'originale, altrimenti il test differenziale sui valori delle variabili
  a parità di seed fallirà pur essendo l'algoritmo "logicamente" equivalente.
- **`variable_generation_run_number`**: variabile iniettata da `question.js` a ogni
  tentativo (fuori da questi 4 file, ma rilevante: se una definizione di variabile
  la referenzia, il numero di draw da `Math.random` può cambiare tra un tentativo e
  l'altro in modo dipendente dal valore stesso — comportamento da preservare
  esattamente).
- **`nicenumber`/`niceNumber` come opzione vs come metodo**: `settings.nicenumber`
  (booleano, disattiva `Numbas.math.niceNumber`) non va confuso con il metodo
  `JMEifier.prototype.niceNumber` (riga 2113, un wrapper che inietta i simboli
  locali di scope prima di chiamare `Numbas.math.niceNumber`) né con
  `Numbas.math.niceNumber` stesso (fuori scope, task 1). Tre entità diverse con
  nomi quasi identici — rischio concreto di confusione nel port.
- **Rounding in display vs valore**: il display non arrotonda mai il valore
  sottostante per conto proprio se non tramite `precround`/`siground` **già
  applicati a monte** (i.e. sono funzioni JME, non passaggi del renderer); il
  renderer si limita a rispettare `precisionType`/`precision` già presenti sul
  token (v. `number_options`). Non introdurre arrotondamenti impliciti nel port.

## 10. Proposta di suddivisione TypeScript

Mappatura upstream → target (righe upstream indicative, non esatte 1:1 per via
della riorganizzazione in classi/moduli più piccoli):

| upstream:righe | target file | contenuto portato |
|---|---|---|
| jme-display.js:26-149 (API `jme.display.*` di alto livello) | `packages/engine/src/jme/display.ts` | `exprToLaTeX`, `treeToLaTeX`, `simplifyExpression`, `simplify`, `simplifyTree`, `subvars` — ma `simplify*` dipendono da `rules.ts` (task 3), quindi qui solo firme + delega |
| jme-display.js:151-858 (helper texOps/typeToTeX/texNameAnnotations/specialNames) | `packages/engine/src/jme/display.ts` (o `display-tex-ops.ts` se supera 1000 righe da solo) | dizionari statici, come `Record<string, TexOpHandler>` |
| jme-display.js:860-1046 (`JMEDisplayer`) | `packages/engine/src/jme/display.ts` | classe base astratta `Displayer<TOut>` (generica sull'output) o due classi separate senza gerarchia condivisa se TS rende scomoda l'ereditarietà con campi-dizionario sovrascrivibili |
| jme-display.js:1048-1648 (`Texifier`, `texify`) | `packages/engine/src/jme/display.ts` | `export function texify(tree: JmeTree, settings: DisplayerSettings, scope: Scope): string` |
| jme-display.js:1650-1996 (`typeToJME`, `jmeFunctions`, `opBrackets`, `jmeOpSymbols`) | `packages/engine/src/jme/display.ts` | dizionari statici |
| jme-display.js:1998-2333 (`JMEifier`, `treeToJME`) | `packages/engine/src/jme/display.ts` | `export function treeToJME(tree: JmeTree, settings: JmeDisplaySettings, scope: Scope): string` |
| jme-display.js:2336-2479 (`align_text_blocks`, `tree_diagram`, alias compat) | **non portato** | v. §7 |
| jme-notations.js (intero) | `packages/engine/src/jme/notations.ts` | classe base `Notation` + le sottoclassi effettivamente necessarie (probabilmente solo `standard` per la v1 — le altre notazioni sintattiche sono editor-facing, da valutare se servono al motore di correzione) |
| unicode-mappings.js (dato) | `packages/engine/src/jme/unicode.ts` + asset JSON generato | v. §4.3 — consumato solo dal tokenizer (`tokenizer.ts`, task 2), **non** da `display.ts` |
| jme-variables.js:44-786 (`jme.variables.*` esclusi i DOM) | `packages/engine/src/variables/index.ts` (o spezzato: `generate.ts` per `computeVariable`/`makeVariables`, `functions.ts` per `makeFunction`/`makeFunctions`, `rulesets.ts` per `computeRuleset`/`makeRulesets`, `constants.ts` per `makeConstants`, `dependants.ts` per `variableDependants`) | logica pura di generazione |
| jme-variables.js:708-774 (parte pura di `DOMsubvars`) | `packages/engine/src/variables/subvars.ts` | `export function subvars(html: string, scope: Scope): SubvarsResult[]` — ritorna una rappresentazione intermedia (stringa/segnaposto) invece di nodi DOM, che il chiamante (question/statementHtml) assembla in stringa HTML finale |
| jme-variables.js:788-939 (`ScriptNote`, `note_script_constructor`) | `packages/engine/src/marking/notes.ts` (task 7, non qui) | rinviato |
| jme-variables.js:948-1207 (`DOMcontentsubber`) | **non portato** | v. §7 — sostituito da una funzione string-based equivalente basata su `jme.contentsubvars`/`texsplit` (v. §7), da collocare in `packages/engine/src/variables/subvars.ts` insieme a `subvars` |
| jme.js:399-586 (`contentsubvars`, `texsplit`, `subvars`) — **non uno dei 4 file, ma necessario** | `packages/engine/src/variables/subvars.ts` | building block string-based per `\var{}`/`\simplify{}`, da portare insieme al task 6 anche se upstream vive in jme.js (task 2) |

Segnature esportate proposte (indicative, da rifinire nel piano di implementazione):

```ts
// jme/display.ts
export function texify(tree: JmeTree, opts: DisplayerSettings, scope: Scope): string;
export function treeToJME(tree: JmeTree, opts: JmeDisplaySettings, scope: Scope): string;
export function exprToLaTeX(expr: string, ruleset: RulesetLike, scope: Scope, parser?: Parser): string;

// jme/notations.ts
export class Notation { compile(expr: string): JmeTree; treeToJME(tree, settings, scope): string; subvars(expr: string, scope: Scope): JmeTree; }
export const notations: Record<string, Notation>;

// jme/unicode.ts
export const unicodeMappings: UnicodeMappings; // v. §4.3

// variables/generate.ts
export interface VariableDef { tree: JmeTree; vars: string[]; names?: string[]; originalName?: string }
export function computeVariable(name: string, todo: Record<string, VariableDef>, scope: Scope, path?: string[]): Token;
export function makeVariables(
  todo: Record<string, VariableDef>,
  scope: Scope,
  condition: JmeTree | null,
  rng: RandomGenerator,     // v. sotto — iniettato, non usato direttamente qui
  targets?: string[]
): { variables: Record<string, Token>; conditionSatisfied: boolean; scope: Scope };

// variables/subvars.ts
export function subvars(html: string, scope: Scope): string; // equivalente a jme.contentsubvars(str, scope, true), string-based
```

**Come si inietta `rng`**: nessuna delle funzioni di `jme-variables.js` chiama
`Math.random` direttamente (§9) — il random è raggiunto solo attraverso
`jme.evaluate` quando valuta funzioni builtin casuali. Quindi `rng` **non** passa
come parametro esplicito attraverso `computeVariable`/`makeVariables`: va iniettato
più in basso, nello `Scope`/nel contesto di valutazione JME (`evaluate.ts`, task 2)
da cui le funzioni builtin `random`/`rannum`/`shuffle`/`seedrandom` (task 4,
`jme-builtins.js`) lo leggono. Il modulo `variables/` di questo inventario deve
solo garantire — come discusso in §9 — che **l'ordine** delle chiamate a
`jme.evaluate` (quindi al generatore) sia deterministico e identico all'originale;
la sorgente di casualità stessa è responsabilità di `math/`+`jme/builtins/` (task 1
e 4). Il ciclo con `maxRuns` (question.js, task 9) è il punto dove il seed per
tentativo viene derivato (es. `seed + ':' + runNumber` o simile — da decidere nel
piano del task 9) e passato allo `Scope` prima di chiamare `makeVariables`.

## 11. Domande aperte

1. **`jme.notations` non-`standard` servono al motore?** Le notazioni
   `set_theory`/`square_brackets_grouping`/`boolean_logic`/`vector_shorthand`/
   `real_interval`/`pattern_matching` sono usate dall'**editor** Numbas per offrire
   sintassi alternative in input; non risulta (dai 4 file analizzati) che siano
   necessarie per interpretare il JSON di domanda prodotto dall'editor standard.
   Da verificare nei part-tests/question fixtures se qualche domanda le referenzia
   esplicitamente (`notation` nei metadati della domanda?) prima di decidere se
   portarle tutte o solo `standard`.
2. **`punctuation` in unicode-mappings.js è morto codice?** Non risulta consumato
   da nessun file JS del runtime (verificato con grep su tutto `runtime/scripts/`).
   Potrebbe essere usato dal compilatore XML/editor Python (fuori scope, spec
   riga 14-15) o essere davvero non utilizzato. Da decidere se portarlo comunque
   (costa poco, è dato) o ometterlo.
3. **Dove va `Numbas.util.numberNotationStyles`?** È referenziato pesantemente dai
   test del modulo `Display` (`Number notation styles`, jme-tests.mjs:2315) ma
   appartiene a `util.js`/`math.js` (task 1). Va assicurato che il piano del task 1
   copra esplicitamente questa tabella (7 stili: `plain`, `en`, `si-en`, `si-fr`,
   `eu`, `plain-eu`, `ch`, `in`, più lo stile virtuale `scientific`), altrimenti
   `display.ts` (che dipende da `Numbas.math.niceNumber`) non avrà il building
   block necessario.
4. **Import ciclico `jme.contentsubvars` ↔ `jme.display.texify`**: in upstream
   `jme.js:contentsubvars` chiama `jme.display.texify`/`exprToLaTeX` (jme.js →
   jme-display.js), mentre concettualmente la sostituzione `\var{}` è "a monte" del
   rendering. Nel port, se `subvars.ts` (variables/) importa da `jme/display.ts`,
   verificare che non si crei un ciclo con `jme/evaluate.ts` (che a sua volta serve
   a `variables/generate.ts`). Probabile soluzione: `subvars.ts` vive in
   `variables/` ma importa solo da `jme/display.ts` e `jme/scope.ts`, mai il
   contrario — da confermare quando si disegna il grafo di dipendenze reale del
   pacchetto.
5. **`registerType` (jme-display.js:1900) serve nel port?** È un punto di
   estensione per tipi custom (usato per registrare `tex`/`jme`/`displayString` di
   nuovi tipi di token). Se il port non prevede tipi di token estensibili da
   plugin/tema (la spec non ne parla), può essere omesso o reso interno (i tipi
   sono fissi e noti a compile-time in TS, quindi si può semplicemente aggiungere
   una entry al dizionario statico invece di un registro dinamico).
6. **Precisione di `store_precision`/`imprecise`/`with_precision` in JME**: queste
   funzioni builtin (referenziate da `treeToJME` ma definite altrove) devono
   esistere nel `builtins/` del port (task 4) prima che i test di `display.ts` su
   "tokens with precision" possano passare — da segnalare nel piano di
   dipendenze tra task 4 e task 5.
