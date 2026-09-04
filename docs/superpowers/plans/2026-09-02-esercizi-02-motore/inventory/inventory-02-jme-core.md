# Inventario di porting — `runtime/scripts/jme.js` (Numbas, commit `0f0ea33`)

Sorgente: `/private/tmp/claude-502/-Users-cristianvirgili-NetBeansProjects-kahoot/9724ea9f-4f12-427e-be14-3bc54e2176a6/scratchpad/numbas` (clone read-only, commit `0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5`), file `runtime/scripts/jme.js`, 6281 righe.

Target: `packages/engine/src/jme/{tokenizer,parser,types,scope,evaluate}.ts` (vedi
`docs/superpowers/specs/2026-09-02-esercizi-02-motore-design.md`, sezione
"Architettura"). Questo documento è la mappa riga-per-riga usata per portare
il modulo senza dover rileggere l'intero sorgente.

---

## 1. Scopo del file e layout interno

`jme.js` contiene due `Numbas.queueScript` consecutivi:

- **`'jme'`** (righe 17-25): wrapper leggero che, quando `jme-base`,
  `jme-builtins`, `jme-rules` e `unicode-mappings` sono già caricati, copia
  `displayFlags`, `Ruleset`, `collectRuleset` da `Numbas.jme.rules` su
  `Numbas.jme` per compatibilità storica. **Non contiene logica da portare**
  a parte il fatto che documenta la dipendenza da `jme-rules`.
- **`'jme-base'`** (righe 26-6281): il corpo vero e proprio — tokenizer,
  parser Pratt/shunting-yard, 24 tipi di token, `Scope`, `funcObj`,
  valutazione, sostituzione, confronto di alberi, inferenza di tipo,
  signature. Dichiara dipendenze solo da `['base', 'math', 'util']` ma **usa
  in pratica anche `jme.rules.*`, `jme.display.*`, `jme.builtinScope` e
  `jme.function_sets`** definiti altrove (vedi §4 — dipendenza "morbida", non
  dichiarata, verificata a runtime).

Mappa in ordine di apparizione:

| riga inizio | riga fine | cosa contiene |
|---|---|---|
| 1 | 16 | Header di licenza Apache 2.0 |
| 17 | 25 | `Numbas.queueScript('jme', [...])` — copia retrocompatibile `jme.rules.{displayFlags,Ruleset,collectRuleset}` → `jme` |
| 26 | 28 | `Numbas.queueScript('jme-base', ['base','math','util'], ...)`; alias locali `util`, `math` |
| 29 | 63 | JSDoc typedef: `JME`, `TeX`, `Numbas.jme.tree`, `Numbas.jme.call_signature`, `Numbas.jme.constant_definition` |
| 64 | 1160 | `var jme = Numbas.jme = {...}` — namespace statico (funzioni free-standing), vedi sotto |
| 65 | 68 | `normaliseRulesetName` |
| 69 | 84 | `normaliseName` (case-insensitive di default) |
| 85 | 100 | `escape` |
| 101 | 114 | `copy_tree` (shallow copy che preserva i token, ricrea solo i nodi `{tok,args}`) |
| 115 | 132 | `compile` — wrapper su `jme.standardParser.compile` |
| 133 | 163 | `addBinaryOperator` / `addPrefixOperator` / `addPostfixOperator` — wrapper su `jme.standardParser.*` |
| 164 | 173 | `tokenise` — wrapper su `jme.standardParser.tokenise` |
| 174 | 183 | `shunt` — wrapper su `jme.standardParser.shunt` |
| 184 | 213 | `unescape` |
| 214 | 268 | `substituteTree` — sostituzione di variabili/costanti in un albero, con hook `substituteTreeOps` per funzioni speciali |
| 269 | 281 | `evaluate` — thin wrapper: `scope.evaluate(tree)` |
| 282 | 345 | `compileList` — spezza un'espressione con virgole di primo livello in più alberi |
| 346 | 405 | `compare` — confronto strutturale per campionamento casuale di variabili (usato dai marking script per confrontare risposta/risposta corretta) |
| 406 | 442 | `contentsubvars` — sostituzione di variabili in un blocco di testo con delimitatori TeX (dipende da `jme.display`, `jme.collectRuleset`) — **fuori scope, §5** |
| 443 | 536 | `texsplit` (parsing di `\var{}`/`\simplify{}` in TeX) + `typeToDisplayString` (number/integer/rational/decimal/string/html) — **fuori scope, §5** (usa `jme.display.*`, `window.jQuery`) |
| 537 | 552 | `tokenToDisplayString` |
| 553 | 594 | `subvars` — sostituzione di variabili in stringa semplice (non TeX); dipende da `jme.display.treeToJME` |
| 595 | 624 | `unwrapValue` — token JME → valore JS grezzo |
| 625 | 637 | `unwrapSubexpression` — spacchetta ricorsivamente `TExpression` |
| 638 | 669 | `makeSafe` — marca stringhe/liste/dict come "safe" (non soggette a `subvars`) |
| 670 | 729 | `wrapValue` — valore JS grezzo → token JME (dispatcha su `typeof`/`Array.isArray`/istanza) |
| 730 | 750 | `isType` |
| 751 | 808 | `castToType` — casting con supporto a descrizioni annidate per `list`/`dict` (`items`/`all_items`/`missing`) |
| 809 | 824 | `isTypeCompatible` |
| 825 | 862 | `findCompatibleType` — cerca un tipo comune fra due, consultando `casts` |
| 863 | 871 | `isComplex` |
| 872 | 890 | `isNegative` |
| 891 | 906 | `hasRealPart` |
| 907 | 922 | `conjugate` |
| 923 | 941 | `negated` |
| 942 | 977 | `isOp` / `isName` / `isFunction` |
| 978 | 1041 | `isDeterministic` — ricorsivo su op/function/string(interpolazioni)/lambda, usa `isDeterministicOps` e `scope.getFunction(op).some(fn => fn.random !== false)` |
| 1042 | 1100 | `isRandom` — come sopra ma per "potrebbe essere casuale"; effetto collaterale: **memoizza `fn.random`** sulla funzione JME-definita (mutazione!) |
| 1101 | 1141 | `isMonomial` — riconosce `x^n` / `m*x^n` (usato da `compareTrees`) |
| 1142 | 1159 | `castArgumentsToSignature` |
| 1160 | 1160 | chiusura `};` del namespace statico |
| 1161 | 1176 | JSDoc `Numbas.jme.parser_options` + docblock classe `Parser` |
| 1177 | 2466 | `class Parser { ... }` — tokenizer + shunting-yard, vedi sub-tabella sotto |
| 2467 | 2467 | `jme.Parser = Parser;` |
| 2469 | 2469 | `var fnSort = util.sortBy('id');` (usato per ordinare `funcObj` per `id` quando si fondono liste di funzioni di scope diversi) |
| 2470 | 2490 | JSDoc `scope_deletions`, `function_set_options` |
| 2491 | 2556 | `class FunctionSet` — insieme nominato di `funcObj`, con `add_function`, `absorb(...sets)`, `static union` |
| 2557 | 2557 | `Numbas.jme.FunctionSet = FunctionSet;` |
| 2558 | 2575 | Docblock classe `Scope` |
| 2576 | 2632 | `var Scope = jme.Scope = function(scopes) {...}` — costruttore: merge di `[parent, extras]`, inizializza `constants/variables/function_sets/functions/_resolved_functions/rulesets/deleted` |
| 2637 | 3621 | `Scope.prototype = {...}` — vedi sub-tabella sotto |
| 3622 | 3622 | chiusura `};` di `Scope.prototype` |
| 3623 | 3630 | JSDoc `Numbas.jme.token`, namespace `Numbas.jme.types` |
| 3631 | 3631 | `var types = jme.types = {}` |
| 3633 | 3639 | `jme.registerType(constructor, name, casts)` |
| 3648 | 3663 | `TNothing` |
| 3664 | 3693 | `TNum` |
| 3694 | 3727 | `number_to_decimal(n, precisionType, precision)` — funzione libera di supporto |
| 3728 | 3737 | `jme.registerType(TNum, 'number', {decimal: ...})` |
| 3738 | 3752 | `TInt` (backed by `bigValue`/BigInt, getter/setter su `value`) |
| 3753 | 3770 | cast registration `TInt` → rational/number/decimal |
| 3771 | 3773 | `TRational` |
| 3774 | 3792 | cast registration `TRational` → decimal/number |
| 3793 | 3804 | `TDecimal` |
| 3805 | 3812 | `decimal_to_number(n)` |
| 3813 | 3829 | cast registration `TDecimal` → number |
| 3830 | 3847 | `TInterval` (nessun cast) |
| 3848 | 3861 | `TString` |
| 3862 | 3878 | `TBool` |
| 3879 | 3900 | `THTML` (+ `isInteractive`) — **DOM, fuori scope, §5** |
| 3913 | 3935 | `TList` |
| 3936 | 3952 | `TKeyPair` |
| 3953 | 3966 | `TDict` |
| 3967 | 3988 | `TSet` (cast → list) |
| 3989 | 4020 | `TVector` (cast → list) |
| 4021 | 4066 | `TMatrix` (cast → list) |
| 4067 | 4099 | `TRange` (cast → list) |
| 4100 | 4107 | `jme.re_greek` |
| 4108 | 4147 | `getNameInfo(name)` — analisi lessicale di un nome (radice/lunghezza-lettere/greco/pedice/apici) usata per la visualizzazione e per `expandJuxtapositions` |
| 4161 | 4185 | `TName` |
| 4186 | 4219 | `TFunc` |
| 4220 | 4235 | `TOp` |
| 4236 | 4338 | `TLambda` (+ `set_names`, `make_signature`, `set_expr` — costruisce un `funcObj` interno) |
| 4339 | 4341 | `TPunc` |
| 4351 | 4364 | `TPromise` |
| 4364 | 4383 | `TExpression` |
| 4384 | 4394 | `TScope` |
| 4395 | 4407 | `jme.converseOps` |
| 4408 | 4409 | `jme.standardParser = new jme.Parser(); jme.standardParser.addBinaryOperator(';', {precedence:0});` |
| 4420 | 4519 | Alias di retrocompatibilità: `jme.arity/prefixForm/postfixForm/precedence/opSynonyms/funcSynonyms/lazyOps(=[])/rightAssociative/relations/commutative/associative/re` → puntano a `jme.standardParser.*` |
| 4520 | 4543 | JSDoc `typecheck_fn`, `evaluate_fn`, `funcObj_options` |
| 4544 | 4544 | `var funcObjAcc = 0;` |
| 4558 | 4658 | `jme.funcObj = function(name, intype, outcons, fn, options) {...}` |
| 4671 | 4688 | `randoms(varnames, min, max, times)` |
| 4689 | 4697 | `varnamesAgree(array1, array2)` |
| 4712 | 4791 | `jme.checkingFunctions` — `absdiff`/`reldiff`/`dp`/`sigfig` |
| 4807 | 4807 | `jme.substituteTreeOps = {}` |
| 4815 | 4815 | `jme.findvarsOps = {}` |
| 4823 | 4823 | `jme.isDeterministicOps = {}` |
| 4834 | 4920 | `jme.findvars(tree, boundvars, scope)` |
| 4921 | 4935 | `jme.findvars_args(trees, boundvars, scope)` |
| 4936 | 4998 | `jme.resultsEqual(r1, r2, checkingFunction, checkingAccuracy, scope)` |
| 5010 | 5035 | `jme.varsUsed(tree)` |
| 5036 | 5045 | `compareTokensByValue` |
| 5046 | 5067 | `jme.tokenComparisons` |
| 5068 | 5094 | `jme.compareTokens(a,b)` |
| 5095 | 5116 | `jme.sortTokensBy(fn)` |
| 5117 | 5157 | `jme.treesSame(a,b,scope)` |
| 5158 | 5279 | `jme.compareTrees(a,b)` — ordinamento canonico (monomi, tipo, nome funzione) |
| 5280 | 5290 | `jme.inferVariableTypes(tree, scope)` |
| 5291 | 5370 | `enumerate_signatures(sig, n)` (+ export `jme.enumerate_signatures`) |
| 5377 | 5403 | `mutually_compatible_type(types)` (+ export) |
| 5413 | 5510 | `find_valid_assignments(tree, scope, assignments, outtype)` (+ export `jme.find_valid_assignments`) |
| 5511 | 5581 | `jme.inferTreeType(tree, scope)` |
| 5582 | 5591 | `jme.inferExpressionType(tree, scope)` |
| 5592 | 5608 | `jme.fast_casters` |
| 5633 | 5820 | `jme.makeFast(tree, scope, names)` — compilatore verso funzione JS "veloce" per un sottoinsieme non-lazy di JME |
| 5821 | 5828 | `sig_remove_missing(items)` |
| 5829 | 5854 | JSDoc `signature`, `signature_result`, `signature_result_argument` |
| 5855 | 6010 | `jme.signature` — costruttori: `label/anything/type/multiple/optional/sequence/list/listof/dict/or` |
| 6011 | 6040 | JSDoc `signature_grammar_match` + grammatica di `parse_signature` |
| 6041 | 6258 | `jme.parse_signature(sig)` — parser ricorsivo-discendente per stringhe di signature (`"list of number"`, `"*number"`, `"[string]"`, `"number or string"`...) |
| 6259 | 6280 | `jme.describe_signature(sig)` |
| 6281 | 6281 | `});` — chiusura callback `'jme-base'` |

### 1a. `class Parser` (righe 1177-2466) — dettaglio

| riga | contenuto |
|---|---|
| 1178 | campo `options` (dichiarazione, valorizzato nel costruttore) |
| 1184 | campo `ops` — lista operatori binari (36 letterali + tutti i simboli unicode di `Numbas.unicode_mappings.symbols`) |
| 1191-1195 | campo `superscript_replacements` |
| 1199-1234 | campo `re` — regex del tokenizer: `re_bool, re_integer, re_number, re_name, re_string, re_comment, re_keypair, re_lambda, re_subscript_character, re_math_letter, re_strip_whitespace, re_punctuation` (usano `\p{...}` Unicode property escapes, flag `u`) |
| 1245-1440 | campo `tokeniser_types` — array ordinato di `{re, parse(result,tokens,expr,pos)}`: `re_strip_whitespace, re_comment, re_integer, re_number, re_bool, re_lambda, re_op, re_name, re_string, re_superscript, re_punctuation, re_keypair` (12 entry; `addTokenType` inserisce in testa) |
| 1450-1463 | campo `prefixForm` — `{'+':'+u','-':'-u','/':'/u','!':'not','not':'not','sqrt':'sqrt'}` |
| 1464-1472 | campo `postfixForm` — `{'!':'fact'}` |
| 1473-1487 | campo `arity` — `{'!':1,'not':1,'fact':1,'+u':1,'-u':1,'/u':1,'sqrt':1}` (arità di default per binari = 2, gestita in `getArity`) |
| 1488-1521 | campo `precedence` — vedi tabella §3 |
| 1530-1538 | campo `relations` — `<,>,<=,>=,=,<>,in` |
| 1545-1553 | campo `commutative` — `*,+,and,or,nand,nor,=,xor` |
| 1561-1568 | campo `associative` — `*,+,and,or,nand,nor,xor` |
| 1576-1583 | campo `funcSynonyms` — `sqr→sqrt, gcf→gcd, sgn→sign, len/length→abs, dec→decimal` |
| 1591-1606 | campo `opSynonyms` — `&,&&→and; divides→\|; \|\|→or; ÷→/; ×→*; ∈→in; ∧→and; ∨→or; ¬→not; ⟹→implies; ≠→<>; ≥→>=; ≤→<=; ˆ→^; identical→=` |
| 1615-1621 | campo `rightAssociative` — `^, +u, -u, /u, for:` |
| 1623-1625 | `constructor(options)` — merge con `option_defaults`, chiama `make_re()` |
| 1632-1635 | campo `option_defaults` — `{closeMissingBrackets:false, addMissingArguments:false}` |
| 1644-1652 | `getSetting(setting,name)` — cerca prima su `this[setting]`, poi su `jme[setting]` (i due livelli locale/globale) |
| 1659-2036 | getter/normalizzatori: `getConstant, getPrefixForm, getPostfixForm, getArity, getPrecedence, isRelation, isCommutative, isAssociative, isRightAssociative, funcSynonym, opSynonym, setOperatorProperties, addTokenType, addOperator, addBinaryOperator, addPrefixOperator, addPostfixOperator, op, unicode_annotations(campo, riga 1857), normaliseName, normaliseNumber, normalisePunctuation, normaliseOp, is_opening_bracket, is_closing_bracket, make_re, tokenise` |
| 2038-2049 | `shunt_open_bracket(tok)` / `shunt_close_bracket(opener, tok)` |
| 2070-2227 | campo `shunt_type_actions` — handler per tipo di token durante lo shunting-yard: `number, integer, string, boolean, name, ',' , op, '{', '}', '[', ']', '(', ')', keypair, lambda` |
| 2228-2361 | `addoutput(tok)` — collega gli argomenti, riscrive relazioni incatenate (`a<b<c`), operatori negati, dict-vs-list, lambda, pipe `\|>` |
| 2362-2366 | `push_output(tree)` / `pop_output()` |
| 2371-2375 | `addstack(tok)` / `popstack()` |
| 2387-2450 | `shunt(tokens)` — ciclo principale + gestione bracket non chiusi (`closeMissingBrackets`) |
| 2451-2465 | `compile(expr)` — `tokenise` + `shunt` |

### 1b. `Scope.prototype` (righe 2637-3621) — dettaglio

Vedi §3 "Scope" per firme e descrizioni; qui solo l'ordine:
`clone(2648), setDeleted(2667), setConstant(2681), setVariable(2697),
addFunction(2707), addFunctionSet(2726), addRuleset(2738),
deleteConstant(2746), deleteVariable(2755), deleteFunction(2767),
deleteRuleset(2775), resolve(2785), getConstant(2804), isConstant(2813),
getVariable(2831), getFunction(2839), getFunctionSet(2866),
matchFunctionToArguments(2876-3012, con helper interni type_difference e
compare_matches), getRuleset(3013), setRuleset(3021), collect(3031),
allConstants(3055), allVariables(3062), allRulesets(3069), allFunctions(3076),
allFunctionSets(3103), flatten(3111), unset(3121), evaluate(3148-3290),
normaliseSubscripts(3291), expandJuxtapositions(3320-3620)`.

---

## 2. Tipi di token (24 — `jme.types.T*`)

Tutti registrati via `jme.registerType(Constructor, typeString, casts?)` che
imposta `Constructor.prototype.type` e `Constructor.prototype.casts`. Il
campo `casts` è la fonte di verità per la coercizione automatica: usato da
`isType` (730), `castToType` (751), `isTypeCompatible` (809),
`findCompatibleType` (825), `jme.signature.type` (5878).

| tipo | campi principali | costruttore | `type` | riga | comportamenti speciali |
|---|---|---|---|---|---|
| `TNothing` | — | `()` | `nothing` | 3648 | valore placeholder per argomenti opzionali mancanti (v. `castArgumentsToSignature`, `TNothing` inserito quando `signature[i].missing`) |
| `TNum` | `value` (number \| `{complex:true,re,im}`), `originalValue`, `precisionType?` (`'dp'`\|`'sigfig'`), `precision?` | `(num)` | `number` | 3664 | numeri complessi come oggetto plain `{re,im,complex:true}`, non classe; cast → `decimal` (3728) tramite `number_to_decimal`, che usa `precisionType`/`precision` per arrotondare o, se presente, `originalValue` per evitare perdita di precisione nel parsing float |
| `TInt` | `bigValue` (BigInt, storage reale), `value` (getter/setter che converte da/a BigInt via `math.ensure_bigint`), `originalValue` | `(num)` | `integer` | 3738 | **unico tipo backed da BigInt**; cast → `rational`(3757), `number`(3762, preserva `originalValue`), `decimal`(3766) |
| `TRational` | `value` (`math.Fraction`) | `(value)` | `rational` | 3771 | cast → `decimal`(3775), `number`(3782, `numerator/denominator` — divisione JS in virgola mobile, **non esatta**) |
| `TDecimal` | `value` (`math.ComplexDecimal`, wrappa `decimal.js`) | `(value: ComplexDecimal \| Decimal)` | `decimal` | 3793 | se passato un `Decimal` grezzo, avvolto in `ComplexDecimal` con parte immaginaria zero; cast → `number`(3813) via `decimal_to_number` |
| `TInterval` | `value` (`math.RealIntervalUnion`) | `(value)` | `interval` | 3830 | nessun cast registrato |
| `TString` | `value`, `latex?`, `display_latex?`, `safe?`, `subjme?` | `(s)` | `string` | 3848 | `safe=true` disabilita `subvars` in valutazione (v. `Scope.evaluate`, 3193-3210); `subjme=true` usa semantica JME invece che testo semplice nella sostituzione |
| `TBool` | `value` | `(b)` | `boolean` | 3862 | — |
| `THTML` | `value` (`Element[]`), `html` | `(html)` | `html` | 3879 | **DOM-dependent** (`document.createElement`), `isInteractive()` legge `data-interactive` — fuori scope, §5 |
| `TList` | `value?` (array di token, può essere `undefined` finché non valutato), `vars` (lunghezza) | `(value: number \| array)` | `list` | 3913 | costruito "vuoto" con solo `vars` durante lo shunting quando il contenuto verrà valutato lazily |
| `TKeyPair` | `key` (string), `vars=1` (via prototype) | `(key)` | `keypair` | 3936 | nodo intermedio usato solo durante `shunt`/`addoutput` per costruire `TDict` o pattern-match (`;`) |
| `TDict` | `value?` (`Object<token>`) | `(value)` | `dict` | 3953 | — |
| `TSet` | `value` (array, assunto senza duplicati) | `(value)` | `set` | 3967 | cast → `list`(3975) |
| `TVector` | `value` (array di number \| complex) | `(value)` | `vector` | 3989 | costruttore **valida** che ogni elemento sia number o `.complex`, altrimenti `Numbas.Error('jme.vector.value not an array of numbers')`; cast → `list`(4000, preserva `precisionType`/`precision` per elemento) |
| `TMatrix` | `value` (array di righe, con `.rows`/`.columns`) | `(value)` | `matrix` | 4021 | valida forma (`value.rows`, `value.columns`, ogni riga array di number/complex), lancia `Numbas.Error('jme.matrix.value not the right type')` o `'jme.matrix.reports bad size'`; cast → `list` di `TVector` (4043) |
| `TRange` | `value` (`[start,end,step]`), `start`, `end`, `step`, `size` (`Math.floor((end-start)/step)`) | `(range)` | `range` | 4067 | cast → `list`(4083) via `math.rangeToList` |
| `TName` | `name` (con prefisso annotazioni), `nameWithoutAnnotation`, `value`(=`name`), `annotation?` (array), `nameInfo` (da `getNameInfo`) | `(name, annotation?)` | `name` | 4161 | — |
| `TFunc` | `name`, `nameWithoutAnnotation`, `annotation?`, `nameInfo`, `vars=0` (prototype) | `(name, annotation?)` | `function` | 4186 | `vars` sovrascritto durante `shunt`/`addoutput` con l'arità reale |
| `TOp` | `name`, `postfix`, `prefix`, `vars` (arità, default 2), `commutative`, `associative`, `negated` | `(op, postfix, prefix, arity, commutative, associative, negated)` | `op` | 4220 | — |
| `TLambda` | `names` (alberi di pattern argomento), `expr`, `all_names` (flat), `fn` (`funcObj` interno creato da `set_expr`), `vars=2` poi sovrascritto | `(names?, expr?)` | `lambda` | 4236 | vedi §7 "Lambda" — costruisce un `funcObj` runtime che fa destructuring degli argomenti (anche pattern-lista `[a,b] -> a+b`) e chiama `nscope.evaluate(jme.copy_tree(lambda.expr))` |
| `TPunc` | `type` (il carattere stesso, es. `'('`) | `(kind)` | *dinamico* (`kind`) | 4339 | **non registrato con `jme.registerType`** — token puramente sintattico, consumato durante `shunt`, mai presente nell'output finale |
| `TPromise` | `promise` (`Promise`) | `(promise)` | `promise` | 4351 | supporto a funzioni asincrone JME |
| `TExpression` | `tree` (`Numbas.jme.tree`) | `(tree: string \| tree)` | `expression` | 4364 | se stringa, compila con `jme.compile`; se l'albero risultante è già un `TExpression`, lo spacchetta con `jme.unwrapSubexpression` (evita nesting) |
| `TScope` | `scope` (`Numbas.jme.Scope`) | `(scope)` | `scope` | 4384 | — |

**Coercizione automatica — meccanismo generale** (righe 730-862, 3633-3639):
`Constructor.prototype.casts = {targetType: (tok) => Token}`. Grafo di cast
esplicito (non transitivo salvo passi doppi già cablati a mano):
`integer → {rational, number, decimal}`, `number → {decimal}`,
`rational → {decimal, number}`, `decimal → {number}`, `set → {list}`,
`vector → {list}`, `matrix → {list}`, `range → {list}`. `findCompatibleType`
(825-862) cerca un tipo raggiungibile da entrambi i lati (un solo salto:
`a.casts[b.type]`, `b.casts[a.type]`, o intersezione dei due dizionari di
cast) — **non fa BFS multi-hop**.

---

## 3. Superficie pubblica

Tabella completa di `Numbas.jme.*` più i membri di `Parser`/`Scope`/`funcObj`.
Colonne: `nome | firma | riga | descrizione | note`.

### 3.1 Tokenizer (dentro `class Parser`, righe 1177-2466 salvo dove indicato)

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `Parser.re` | campo, dizionario di `RegExp` | 1199 | regex sorgente per ogni classe di token | usa `\p{Ll}\p{Lu}\p{Lo}\p{Lt}` ecc. (Unicode property escapes, richiede target ES2018+/flag `u`) |
| `Parser.tokeniser_types` | campo, array `{re,parse}` | 1245 | catena di riconoscitori provati in ordine | `addTokenType` fa `splice(0,0,...)`: i tipi aggiunti dopo hanno **priorità più alta** |
| `Parser.make_re()` | `(): void` | 1963 (assoluta, vedi §1a) | ricostruisce `re.re_op` e `re.re_superscript` da `ops` | va richiamato dopo ogni `addOperator` |
| `Parser.tokenise(expr)` | `(expr: JME): token[]` | 1999 | ciclo principale: prova ogni `tokeniser_types[i]` in ordine su `expr.slice(pos)` | errore `'jme.tokenise.invalid near'` se nessun match |
| `Parser.addTokenType(re, parse)` | `(re, parse): void` | 1782 | inserisce un riconoscitore custom in testa | usato da estensioni esterne (non in jme.js) |
| `jme.tokenise(expr)` | `(expr): token[]` | 164 | wrapper su `jme.standardParser.tokenise` | |
| `jme.re` | campo | 4519 | alias retrocompatibile di `jme.standardParser.re` | |
| `jme.unescape(str)` | `(str): string` | 184 | inverso di `jme.escape` | gestisce `\n`, `\{`, `\}`, altrove droppa il backslash |
| `jme.escape(str)` | `(str): string` | 85 | escapa `\`,`{`,`}`,`\n`,`"`,`'` per re-includere in sorgente JME | |

### 3.2 Parser / operatori — tabelle di precedenza e associatività

Tutte definite come campi-classe di `Parser` (istanziati per `jme.standardParser`); esposte anche come alias retrocompatibili `jme.precedence` ecc. (4448-4519).

**Precedenza** (riga 1488-1521; valore più basso = valutato per primo):

| operatore | valore | operatore | valore |
|---|---|---|---|
| `;` | 0 | `<>`, `=` | 8 |
| `fact`, `not`, `sqrt` | 1 | `isa` | 9 |
| `+u`, `-u`, `/u` | 2.5 | `and`, `nand` | 11 |
| `^` | 2 | `or`, `nor` | 12 |
| `*`, `/` | 3 | `xor` | 13 |
| `+`, `-` | 4 | `implies` | 14 |
| `\|`, `..` | 5 | `of:` | 48 |
| `#` | 6 | `where:` | 49 |
| `except`, `in` | 6.5 | `for:` | 50 |
| `<`,`>`,`<=`,`>=` | 7 | `:` | 100 |

**Relazioni** (1530): `< > <= >= = <> in` → `true`.
**Commutative** (1545): `* + and or nand nor = xor`.
**Associative** (1561): `* + and or nand nor xor` (nota: `=` è commutativo ma
**non** associativo).
**Right-associative** (1615): `^ +u -u /u for:`.
**`funcSynonyms`** (1576): `sqr→sqrt, gcf→gcd, sgn→sign, len→abs, length→abs, dec→decimal`.
**`opSynonyms`** (1591): `& →and, &&→and, divides→|, ||→or, ÷→/, ×→*, ∈→in, ∧→and, ∨→or, ¬→not, ⟹→implies, ≠→<>, ≥→>=, ≤→<=, ˆ→^, identical→=`.
**`prefixForm`** (1450): `+→+u, -→-u, /→/u, !→not, not→not, sqrt→sqrt`.
**`postfixForm`** (1464): `!→fact`.
**`arity`** (1473, default 2 per tutto il resto): `! not fact +u -u /u sqrt → 1`.

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `Parser.getPrecedence/isRelation/isCommutative/isAssociative/isRightAssociative/getArity/getPrefixForm/getPostfixForm/funcSynonym/opSynonym` | `(name): value` | 1686-1751 | accessori che delegano a `getSetting` | `getSetting` cerca prima su `this[setting]` (parser locale), poi su `jme[setting]` (globale, righe 1644-1652) |
| `Parser.setOperatorProperties(name, options)` | `(name, {precedence?,synonyms?,rightAssociative?,commutative?}): void` | 1760 | usato da `addBinaryOperator`/`addPrefixOperator`/`addPostfixOperator` | i sinonimi vengono aggiunti solo se non già definiti |
| `Parser.addOperator(name)` | `(name): void` | 1793 | `ops.push(name)` + `make_re()` se non già presente | |
| `Parser.addBinaryOperator(name, options)` | `(name, operatorOptions?): void` | 1806 | | anche `jme.addBinaryOperator` (133) delega a `jme.standardParser` |
| `Parser.addPrefixOperator(name, alt?, options?)` | `(name, alt?, operatorOptions?): void` | 1817 | `alt` è il nome "interpretato" (es. `!`→`not`) | anche `jme.addPrefixOperator` (143) |
| `Parser.addPostfixOperator(name, alt?, options?)` | `(name, alt?, operatorOptions?): void` | 1831 | | anche `jme.addPostfixOperator` (153) |
| `Parser.op(name, postfix?, prefix?, negated?)` | `(...): TOp` | 1847 | costruisce un `TOp` con arità/commutatività/associatività risolte | |
| `Parser.normaliseName(name)` | `(name): {name, annotations}` | 1873 | gestisce lettere matematiche unicode (𝔸, 𝕒, ...), pedici, apici, greco | usa `Numbas.unicode_mappings.letters/greek/subscripts` |
| `Parser.normaliseNumber(literal)` | `(literal): string` | 1910 | `literal.normalize('NFKD')` | |
| `Parser.normalisePunctuation(c)` | `(c): string` | 1919 | normalizza parentesi unicode a ASCII via `Numbas.unicode_mappings.brackets` | |
| `Parser.normaliseOp(op)` | `(op): string` | 1932 | normalizza trattini unicode a `-`, poi simboli via `Numbas.unicode_mappings.symbols` | |
| `Parser.is_opening_bracket/is_closing_bracket(tok)` | `(tok): boolean` | 1945/1954 | test su `tok.type.match(/^\p{Ps}$/u)` / `\p{Pe}` (categorie Unicode "punteggiatura apertura/chiusura") | supporta parentesi alternative (es. `⟨⟩`) |
| `Parser.shunt(tokens)` | `(token[]): tree` | 2387 | algoritmo shunting-yard completo | vedi §7 |
| `Parser.shunt_open_bracket/shunt_close_bracket` | | 2038/2049 | gestione generica bracket | |
| `Parser.shunt_type_actions` | campo, dizionario `{tokenType: handler}` | 2070 | dispatch per tipo durante `shunt` | chiavi: `number, integer, string, boolean, name, ',', op, {, }, [, ], (, ), keypair, lambda` |
| `Parser.addoutput(tok)` | `(tok): void` | 2228 | raccoglie argomenti dall'output, gestisce lambda/dict/relazioni-incatenate/negazione/pipe | vedi §7 |
| `Parser.push_output/pop_output/addstack/popstack` | | 2362-2375 | manipolazione stack/output grezzi | |
| `Parser.compile(expr)` | `(expr: JME): tree \| null \| undefined` | 2451 | `tokenise` + `shunt`; stringa vuota → `null` | |
| `jme.compile(expr)` | `(expr): tree` | 115 | wrapper | |
| `jme.compileList(expr)` | `(expr): tree[]` | 282 | spezza su virgole top-level rispettando bracket | errori `'jme.compile list.mismatched bracket'`, `'.missing right bracket'` |
| `jme.shunt(tokens)` | `(tokens): tree` | 174 | wrapper | |
| `jme.converseOps` | campo | 4395 | `{'<':'>', '>':'<', '<=':'>=', '>=':'<='}` | usato altrove (jme-rules/jme-display) per riscrivere relazioni |
| `jme.copy_tree(tree)` | `(tree): tree` | 101 | copia shallow che riusa i `tok` | |

### 3.3 Scope

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `Scope(scopes?)` | costruttore, `scopes: undefined \| Scope \| [Scope, extras]` | 2576 | inizializza `constants/variables/function_sets/functions/_resolved_functions/rulesets/deleted`; se `scopes[0]` non ha `.evaluate`, è trattato come `extras` puro (nessun parent) | `this.question = scopes[0].question \|\| this.question` — proprietà opzionale usata dal resto del runtime (non in scope Task 2) |
| `Scope.prototype.clone()` | `(): Scope` | 2648 | copia con `structuredClone(this.deleted)` | |
| `Scope.prototype.setDeleted(collection, name, deleted?)` | `(collection, name, deleted=true): void` | 2667 | | |
| `Scope.prototype.setConstant(name, data)` | `(name, {value, tex?}): void` | 2681 | normalizza il nome, marca non-deleted | |
| `Scope.prototype.setVariable(name, value)` | `(name, token): void` | 2697 | | |
| `Scope.prototype.addFunction(fn)` | `(funcObj): funcObj` | 2707 | evita duplicati per identità, invalida `_resolved_functions` cache | |
| `Scope.prototype.addFunctionSet(set)` | `(FunctionSet): void` | 2726 | | |
| `Scope.prototype.addRuleset(name, set)` | `(name, Ruleset): void` | 2738 | | |
| `Scope.prototype.deleteConstant/deleteVariable/deleteFunction/deleteRuleset` | `(name, options?): void` | 2746-2782 | `deleteVariable` per default cancella anche la costante omonima (`options.delete_constant !== false`) | |
| `Scope.prototype.resolve(collection, name)` | `(collection, name): any` | 2785 | risale la catena `parent`, si ferma se trova `deleted[collection][name]===true` **prima** di controllare i valori locali | ordine: check-deleted → check-value → risali |
| `Scope.prototype.getConstant/getVariable/getRuleset/getFunctionSet` | `(name): value` | 2804/2831/3013/2866 | wrapper su `resolve` | |
| `Scope.prototype.isConstant(value)` | `(token): constant_definition \| undefined` | 2813 | confronta per valore (`util.eq`) su tutte le costanti non cancellate, risale al parent | |
| `Scope.prototype.getFunction(name)` | `(name): funcObj[]` | 2839 | applica `jme.funcSynonyms`, **cache** in `_resolved_functions`, fonde con `Array.prototype.merge` (ordina/deduplica per `id`) risalendo la catena; si ferma se il nome è marcato `deleted` a un livello | |
| `Scope.prototype.matchFunctionToArguments(tok, args)` | `(token, token[]): {fn,signature} \| null` | 2876 | risolve overload: prova `fn.typecheck(args)` per ogni candidato, preferisce match esatto (`exactType`), altrimenti sceglie il "più specifico" con `compare_matches` (confronta le liste dei cast disponibili) | throw se nessuna funzione definita, con suggerimento `'... maybe implicit multiplication'` se togliendo la prima lettera esiste una funzione |
| `Scope.prototype.setRuleset(name, rules)` | `(name, Ruleset[]): void` | 3021 | |
| `Scope.prototype.collect(collection)` | `(collection): Record<string,any>` | 3031 | fonde l'intera catena rispettando `deleted` | usato da `allConstants/allVariables/allRulesets/allFunctionSets` |
| `Scope.prototype.allFunctions()` | `(): Record<string,funcObj[]>` | 3076 | come `collect` ma fonde array di `funcObj` (non sovrascrive) | |
| `Scope.prototype.flatten()` | `(): void` | 3111 | **muta** `this.variables`/`this.rulesets` appiattendo tutta la catena — hack di retrocompatibilità, solo per lo scope di domanda | |
| `Scope.prototype.unset(defs)` | `(defs: {variables?,functions?,rulesets?}): Scope` | 3121 | crea un child-scope con quei nomi marcati `deleted` | |
| `Scope.prototype.evaluate(expr, variables?, noSubstitution?)` | `(JME\|tree, Record<string,any>?, boolean?): token` | 3148 | valutatore principale ad albero, vedi §3.5 | |
| `Scope.prototype.normaliseSubscripts(tok: TName)` | `(TName): TName` | 3291 | ricostruisce il nome canonico da `getNameInfo` | salta se il nome è una costante |
| `Scope.prototype.expandJuxtapositions(tree, options?)` | `(tree, {singleLetterVariables,noUnknownFunctions,implicitFunctionComposition,normaliseSubscripts}?): tree` | 3320 | riscrive `xy`→`x*y`, `x(y)`→`x*y` se `x` non è funzione nota, `lnabs(x)`→`ln(abs(x))` | vedi §7, **non chiamato internamente da nessun'altra funzione di jme.js** (va invocato esplicitamente da chi fa input studente) |
| `Scope.prototype.parser` | campo, default `jme.standardParser` | 2637(decl.)/2578(assegnato nel costr.) | | ereditato dal parent se presente |

### 3.4 Function objects (`funcObj`) e signature

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `jme.funcObj(name, intype, outcons, fn, options?)` | costruttore | 4558 | `intype: Array<string\|Function\|jme.signature>` mappato con `jme.parse_signature`; `id` incrementale globale (`funcObjAcc`) usato per ordinamento stabile | |
| `.intype` | `(args: token[]): signature_result \| false` | 4593 | è `jme.signature.sequence(...intype.map(parse_signature))` | |
| `.outtype` | `string \| '?'` | 4600 | da `outcons.prototype.type` se `outcons` è funzione | |
| `.typecheck(args)` | `(token[]): boolean` | 4614 | default: `intype(args) !== false && sig_remove_missing(match).length === args.length` | overridabile via `options.typecheck` |
| `.evaluate(args, scope)` | `(token[], Scope): token` | 4628 | default: se `options.unwrapValues`, spacchetta con `jme.unwrapValue`, altrimenti passa `.value`; richiama `this.fn`, poi rewrappa con `new this.outcons(result)` o `jme.wrapValue` | overridabile via `options.evaluate` — così fanno le funzioni **lazy** (v. `jme.lazyOps`) e `TLambda.fn` |
| `.random` | `boolean \| undefined` | 4658 | da `options.random`; usato da `isDeterministic`/`isRandom` | |
| `jme.FunctionSet` | classe | 2491 | `.functions[]`, `.name`, `.description`, `add_function(...)`, `absorb(...sets)`, `static union(options, sets)` | side-effect nel costruttore: `Numbas.jme.function_sets[name] = this` — **richiede che `jme.function_sets` esista già** (inizializzato in `jme-builtins.js:59`, non in questo file, §4) |
| `jme.signature.label(name, sig)` | `(name,sig): signature` | 5856 | tagga con `.name` ogni item del match | usato per riferirsi ad argomenti per nome (debug/introspezione) |
| `jme.signature.anything()` | `(): signature` | 5871 | match 1 argomento di qualunque tipo, `nonspecific:true` | |
| `jme.signature.type(type)` | `(type): signature` | 5878 | match se `args[0].type===type` o `args[0].casts[type]` | |
| `jme.signature.multiple(sig)` | `(sig): signature` | 5895 | applica `sig` ripetutamente finché matcha | 0 match → array vuoto (mai `false`) |
| `jme.signature.optional(sig)` | `(sig): signature` | 5915 | se `sig` non matcha, produce `[{missing:true}]` invece di fallire | |
| `jme.signature.sequence(...sigs)` | `(...sigs): signature` | 5928 | concatena, avanzando `args` di `sig_remove_missing(bitmatch).length` a ogni passo | |
| `jme.signature.list(...sigs)` | `(...sigs): signature` | 5946 | richiede `args[0]` di tipo `list` (o castabile), applica `sequence(...sigs)` sul **contenuto** della lista | fallisce se `items.length < arg.value.length` (non tutti gli elementi consumati) |
| `jme.signature.listof(sig)` | `(sig): signature` | 5967 | `list(multiple(sig))` | |
| `jme.signature.dict(sig)` | `(sig): signature` | 5970 | richiede `args[0]` di tipo `dict`, applica `sig` a ogni valore | |
| `jme.signature.or(...sigs)` | `(...sigs): signature` | 5995 | primo match che riesce | |
| `jme.parse_signature(sig)` | `(string \| Function \| signature): signature` | 6041 | parser ricorsivo-discendente, grammatica in JSDoc righe 6018-6031 | se `sig` è già una `signature` (`.kind !== undefined`) la ritorna; se è un costruttore token, `jme.signature.type(sig.prototype.type)` |
| `jme.describe_signature(sig)` | `(signature): string` | 6259 | pretty-print della grammatica (`'number, string*'`, `'[list of ?]'`...) | usato per messaggi di errore/documentazione, non per logica |
| `sig_remove_missing(items)` | `(signature_result): signature_result` | 5821 | filtra via gli item `{missing:true}` | funzione privata ma referenziata da `funcObj.typecheck`, `matchFunctionToArguments`, `jme.signature.list/sequence`, `makeFast` |
| `enumerate_signatures(sig, n)` / `jme.enumerate_signatures` | `(signature, n): string[][]` | 5291/5370 | enumera tutte le liste di `n` nomi-di-tipo che una signature può accettare (usa `math.integer_partitions`) | usato solo da `find_valid_assignments` |

### 3.5 Evaluation

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `jme.evaluate(tree, scope)` | `(tree\|string, Scope): token` | 269 | throw `'jme.evaluate.no scope given'` se `!scope`; delega a `scope.evaluate` | |
| `Scope.prototype.evaluate(expr, variables?, noSubstitution?)` | vedi 3.3 | 3148 | switch su `tok.type`: `number/boolean/range` → identità; `list/dict` non ancora valutati → valuta ricorsivamente gli argomenti; `string` con `{` non-safe → `contentsubvars`/`jme.display.subvars`; `name` → `getVariable` o `getConstant` o `TName` con `.unboundName=true`; `op/function` → se in `jme.lazyOps` chiama `fn.evaluate(tree.args, scope)` **senza pre-valutare gli argomenti**, altrimenti valuta tutti gli `eargs`, controlla se il nome è una variabile-lambda in scope, altrimenti `matchFunctionToArguments` + `castArgumentsToSignature` + `fn.evaluate(castargs, scope)`; `lambda` senza `tree.args` (lambda letterale non ancora applicata) → clona/rinomina scope e ri-sostituisce il corpo | vedi §7 per i dettagli delicati (lazy ops, unbound name, cattura lambda) |
| `jme.lazyOps` | `string[]` (inizializzato `[]`) | 4471 | popolato da `jme-builtins.js` (funzioni come `if`, `and`, `or`, `switch`, ecc. — **non in questo file**) | l'array è condiviso per riferimento: chi ci aggiunge nomi lo fa mutando questo stesso array |
| `jme.makeFast(tree, scope, names?)` | `(tree, Scope, string[]?): Function` | 5633 | compila un sottoinsieme (solo funzioni non-lazy con "fast definition", cioè `fn.fn` nativo JS) in una funzione JS diretta, con cast automatici tra tipi inferiti (`fast_casters`) | limite: >5 argomenti liberi o >5 argomenti per operazione → fallback più lento; throw `'jme.makeFast.no fast definition of function'` |
| `jme.fast_casters` | dizionario | 5592 | cast "veloci" (su valori JS grezzi, non token) fra `number/integer/rational/decimal` | sottoinsieme di `casts`, usato solo da `makeFast` |
| `jme.inferTreeType(tree, scope)` | `(tree, Scope): tree annotato` | 5511 | annota ogni nodo con `inferred_type` e (per op/function) `matched_function` | usato da `makeFast` |
| `jme.inferExpressionType(tree, scope)` | `(tree, Scope): string` | 5582 | `inferTreeType(tree,scope).inferred_type` | |
| `jme.inferVariableTypes(tree, scope)` | `(tree, Scope): Record<string,string>` | 5280 | wrapper su `find_valid_assignments`, estrae solo `.type` | |
| `find_valid_assignments(tree, scope, assignments?, outtype?)` / `jme.find_valid_assignments` | `(...): Record<string,{type,casts}> \| false` | 5413/5503 | ricerca (greedy, non backtracking completo oltre il primo `fn` che matcha) di un'assegnazione di tipi alle variabili libere compatibile con almeno una definizione di ogni funzione usata | commento esplicito nel codice: **non generale**, sceglie sempre la prima opzione (`return options[0].sub_assignments`) |
| `mutually_compatible_type(types)` / `jme.mutually_compatible_type` | `(string[]): string \| undefined` | 5377/5403 | trova un tipo castabile a tutti i tipi dati, preferendo `number`/`decimal` | |
| `jme.checkingFunctions` | dizionario `{absdiff,reldiff,dp,sigfig}` | 4712 | funzioni di tolleranza numerica, usate da `resultsEqual`/`compare` | tutte hanno un ramo `math.isComplexDecimal` per `Decimal`/`ComplexDecimal` |
| `jme.resultsEqual(r1, r2, checkingFunction, checkingAccuracy, scope)` | `(token, token, Function, number, Scope): boolean` | 4936 | cast al tipo compatibile, poi confronto ricorsivo per `vector/matrix/list`, altrimenti `checkingFunction` sui valori (con branch complessi) o `util.eq` di fallback | |
| `jme.compare(tree1, tree2, settings?, scope)` | `(tree,tree,compare_settings?,Scope): boolean` | 346 | campiona `vsetRangePoints` assegnazioni casuali (via `randoms`) delle variabili libere comuni e valuta entrambe le espressioni, contando i fallimenti contro `failureRate` | **usa `Numbas.math.randomrange` → dipendenza dal generatore casuale iniettabile**, `try/catch` generico → `false` su qualunque eccezione (silenzia errori di compilazione/tipo) |
| `randoms(varnames, min, max, times)` | `(string[], number, number, number): Record<string,TNum>[]` | 4671 | `times *= varnames.length \|\| 1` | funzione privata, solo per `compare` |
| `varnamesAgree(array1, array2)` | `(string[], string[]): boolean` | 4689 | ogni nome (che non inizia con `$`) di `array1` deve stare in `array2` | |

### 3.6 Sostituzione e utility sugli alberi

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `jme.substituteTree(tree, scope, allowUnbound?, unwrapExpressions?)` | `(tree, Scope, boolean?, boolean?): tree` | 214 | ricorsivo; per nomi: `getVariable`→sostituisce, altrimenti `getConstant`, altrimenti (`allowUnbound`) mantiene `TName`, altrimenti throw `'jme.substituteTree.undefined variable'`; per `function`/`op` il cui nome è in `substituteTreeOps`, delega a quell'hook | `tree.tok.bound===true` blocca la sostituzione su quel nodo (usato per proteggere variabili legate da lambda/quantificatori) |
| `jme.substituteTreeOps` | dizionario, inizialmente `{}` | 4807 | popolato altrove (jme-builtins, per `diff`, quantificatori ecc.) | |
| `jme.findvars(tree, boundvars?, scope?)` | `(tree, string[]?, Scope?): string[]` | 4834 | trova variabili libere; casi speciali per `string` (interpolazioni `{...}` e comandi TeX `\var`/`\simplify`, via `texsplit`) e `lambda` (aggiunge `tok.all_names` a `boundvars`) | default `scope = jme.builtinScope` se omesso — **dipendenza forward non dichiarata**, §4 |
| `jme.findvarsOps` | dizionario, inizialmente `{}` | 4815 | hook per funzioni con binding custom (quantificatori) | |
| `jme.findvars_args(trees, boundvars, scope)` | `(tree[], string[], Scope): string[]` | 4921 | `reduce` con `.merge` su ogni albero | |
| `jme.isDeterministicOps` / `jme.isDeterministic` | dizionario / `(tree, Scope): boolean` | 4823 / 978 | vedi §1 | |
| `jme.isRandom(tree, scope)` | `(tree, Scope): boolean` | 1042 | vedi §1 — **muta** `fn.random` per funzioni definite in JME (memoization) | |
| `jme.varsUsed(tree)` | `(tree): string[]` | 5010 | DFS con duplicati, ignora `findvarsOps` (a differenza di `findvars`) | usato da `compareTrees` |
| `jme.treesSame(a, b, scope)` | `(tree, tree, Scope): boolean` | 5117 | uguaglianza strutturale esatta (stessa arità/struttura, poi `util.eq` sui token foglia dopo cast al tipo compatibile) | |
| `jme.compareTrees(a, b)` | `(tree, tree): -1\|0\|1` | 5158 | ordinamento canonico: 1) lista `varsUsed` (lessicografica, più lunga prima se prefisso), 2) monomi prima del resto, 3) per monomi: base, poi grado decrescente, poi coefficiente, 4) tipo (`op`/`function` prima), 5) potenze (`^`, `*(^)`, `/(^)`) prima, 6) nome operatore/funzione, 7) ricorsione sugli argomenti, 8) valore numerico | gestisce `-u` come segno separato (`sign_a`/`sign_b`) confrontato solo come ultimo spareggio |
| `compareTokensByValue` / `jme.compareTokensByValue` | `(token, token): -1\|0\|1` | 5036 | confronto JS `>`/`<` su `.value` | |
| `jme.tokenComparisons` | dizionario `{number,integer,rational,string,boolean}` | 5046 | | |
| `jme.compareTokens(a, b)` | `(token, token): -1\|0\|1` | 5068 | usa `tokenComparisons` se stesso tipo/tipo compatibile, altrimenti `compareTrees` | |
| `jme.sortTokensBy(fn)` | `(fn: token=>token): Comparator` | 5095 | genera una funzione di confronto che applica `fn` prima di `compareTokens`; `undefined` ordinato per ultimo | |

### 3.7 Type coercion / misc

| nome | firma | riga | descrizione | note |
|---|---|---|---|---|
| `jme.isType(tok, type)` | `(token, string): boolean` | 730 | uguale o castabile | |
| `jme.castToType(tok, type)` | `(token, string \| TypeDescription): token` | 751 | supporta `TypeDescription = {type, items?, all_items?}` per `list`/`dict` annidati | throw `'jme.type.no cast method'` se non castabile |
| `jme.isTypeCompatible(a, b)` | `(string, string|undefined): boolean` | 809 | `b===undefined` → sempre `true` | |
| `jme.findCompatibleType(a, b)` | `(string, string): string \| undefined` | 825 | vedi §2 | |
| `jme.isComplex/isNegative/hasRealPart/conjugate/negated(tok)` | `(token): boolean\|token` | 863/872/891/907/923 | operano su `number`/`decimal`, altrimenti castano ricorsivamente a `number` | |
| `jme.isOp/isName/isFunction(tok, name)` | `(token, string): boolean` | 942/952/962 | | |
| `jme.isMonomial(tree)` | `(tree): {base,degree,coefficient} \| false` | 1101 | | usato solo da `compareTrees` |
| `jme.castArgumentsToSignature(signature, args)` | `(signature_result, token[]): token[]` | 1142 | inserisce `TNothing` per slot `missing`, altrimenti `castToType` | |
| `jme.wrapValue(v, typeHint?)` | `(any, string?): token` | 670 | dispatch su `typeof`/`Array.isArray`/`instanceof`; **`null`/`undefined` → `TString('')`** (commento `CONTROVERSIAL!` nel sorgente) | |
| `jme.unwrapValue(v, options?)` | `(token, {bigInts?}?): any` | 595 | `integer` → number salvo `options.bigInts` (allora BigInt); `expression` → `.tree` (non ri-testualizzato); `nothing` → `undefined` | |
| `jme.unwrapSubexpression(tree)` | `(tree): tree` | 625 | | |
| `jme.makeSafe(t)` | `(token): token` | 638 | ricorsivo su `list`/`dict` | |
| `jme.getNameInfo(name)` | `(string): name_info` | 4108 | | vedi §1, tabella |
| `jme.re_greek` | `RegExp` | 4100 | | |
| `jme.registerType(constructor, name, casts?)` | `(Function, string, Record<string,Function>?): void` | 3633 | throw `'jme.type.type already registered'` se doppio | |
| `jme.types` | `Record<string, Constructor>` | 3631 | | |
| `jme.standardParser` | `Parser` | 4408 | istanza singleton usata da tutti i wrapper `jme.*` | |
| `jme.Parser` | classe | 2467 | | |
| `jme.Scope` | costruttore | 2576 | | |
| `jme.FunctionSet` | classe | 2491 | | |
| `jme.funcObj` | costruttore | 4558 | | |
| `jme.normaliseName(name, settings?)` | `(string, {caseSensitive?}?): string` | 69 | **diverso da `Parser.normaliseName`** — questo è case-folding post-parsing, l'altro è normalizzazione lessicale unicode pre-parsing | nome ambiguo: due funzioni omonime a livelli diversi (namespace vs classe) |
| `jme.normaliseRulesetName(name)` | `(string): string` | 65 | `.toLowerCase()` | |
| `jme.contentsubvars/texsplit/typeToDisplayString/tokenToDisplayString/subvars` | — | 406-594 | **fuori scope core**, §5 (dipendono da `jme.display`) | |

---

## 4. Dipendenze e globali

**Dichiarate** (`Numbas.queueScript('jme-base', ['base','math','util'], ...)`, riga 26):
- `Numbas.util` → alias `util` (riga 27). Usato: `extend_object, sortBy,
  contentsplitbrackets, splitbrackets, parseBool, eq, copyobj`.
- `Numbas.math` → alias `math` (riga 28). Usato: `countDP, ComplexDecimal,
  Fraction, conjugate, negate, abs, sub, mul, leq, eq, precround, siground,
  integer_partitions, rangeToList, randomrange, ensure_bigint, ensure_decimal,
  isComplexDecimal, RealIntervalUnion`. **`math.randomrange` è l'unico punto
  in cui la casualità entra in `jme.js`** (usato solo da `randoms`, riga
  4671, a supporto di `jme.compare`) — nessun `Math.random()` diretto in
  questo file (verificato via grep).
- `Decimal` — variabile globale (da `decimal.js`, vendor terzo secondo il
  design doc), usata direttamente (non tramite `Numbas.math`) alle righe
  3720, 3725, 3766, 3779, 3795, 5602.

**Non dichiarate ma usate (dipendenze "morbide" verificate solo a runtime,
tramite l'ordine di caricamento degli script, non tramite `queueScript`
deps)**:
- `Numbas.unicode_mappings.{symbols,superscripts,subscripts,letters,greek,brackets}`
  — 15 usi, righe 1184-4147 e nel `Parser` — modulo `unicode-mappings.js`
  (dichiarato dipendenza del wrapper `'jme'` esterno, riga 17, **non** di
  `'jme-base'`).
- `jme.rules.collectRuleset` — chiamato in `contentsubvars` (riga ~423) come
  `jme.collectRuleset`, alias copiato dal wrapper `'jme'` (riga 17-24) da
  `jme.rules.collectRuleset`, definito in `jme-rules.js`.
- `jme.display.{texify, exprToLaTeX, treeToJME, subvars, JMEifier,
  number_options}` — righe 422, 427, 502-514, 541, 575-579, 3201. Il modulo
  `jme-display.js` dipende a sua volta da `'jme'` (il wrapper composito, che
  include `jme-base`+`jme-builtins`+`jme-rules`), quindi **jme-base chiama
  in avanti un modulo che carica *dopo* di esso nel grafo delle dipendenze
  dichiarate** — funziona solo perché a runtime, quando queste funzioni sono
  effettivamente *invocate* (non quando lo script è *valutato*), tutti gli
  script sono già stati eseguiti.
- `jme.builtinScope` — riga 4836 (`jme.findvars`, usato come default se
  `scope` non è passato) e riga 5624 (solo in un commento di esempio JSDoc
  per `makeFast`). Inizializzato in `jme-builtins.js:41`.
- `Numbas.jme.function_sets` — la classe `FunctionSet` (riga 2491, in questo
  file) scrive su `Numbas.jme.function_sets[name]` nel costruttore, ma
  l'oggetto contenitore è inizializzato in `jme-builtins.js:59`
  (`Numbas.jme.function_sets = {}`), **non in jme.js**. Costruire una
  `FunctionSet` prima che `jme-builtins.js` sia eseguito lancerebbe
  `TypeError` (`Cannot set properties of undefined`).
- `window.jQuery` (riga 522, dentro `typeToDisplayString.html`) e
  `document.createElement` (riga 3883, dentro `THTML`) — **DOM**, §5.

**Grafo di caricamento upstream** (da `queueScript`, per riferimento):
```
jme-base     ← base, math, util
jme-rules    ← base, math, jme-base, util
jme-calculus ← jme-base, jme-rules
jme-variables← base, jme-base, util
jme-builtins ← jme-base, jme-rules, jme-calculus, jme-variables, seedrandom
jme          ← jme-base, jme-builtins, jme-rules, unicode-mappings   (wrapper di compatibilità)
jme-display  ← base, math, jme, util, jme-rules
jme-notations← jme, jme-display, jme-rules
```
Nota: `jme-rules.js` dipende da `jme-base` (dichiarato), quindi non c'è
ciclo *dichiarato*; il ciclo è solo nelle chiamate *runtime* di jme-base
verso simboli di `jme.rules`/`jme.display`/`jme.builtinScope`/
`jme.function_sets` che non sono nel suo elenco di dipendenze dirette.

**Prototipi globali estesi da `util.js`** (non da questo file, ma usati
pervasivamente in esso — vedi §7):
- `Array.prototype.contains(it)` — 3 usi in jme.js (es. `this.ops.contains(name)`, riga 1794).
- `Array.prototype.merge(arr, sortfn?)` — 7 usi (`getFunction`, `allFunctions`, `findvars`, ecc.) — unione con dedup+sort, **non** semplice concat.
- `String.prototype.contains(it)` — 1 uso (`value.contains('{')` in `Scope.prototype.evaluate`, riga ~3203).
- `Array.prototype.at(-1)` — nativo ES2022, usato ovunque nello shunting-yard per leggere la cima dello stack senza `pop`.

**`MathJax`**: unica occorrenza è un commento JSDoc (riga 403, "Normally this
is left to MathJax") — nessuna dipendenza reale dal file.

**`R()` (i18next)**: **zero usi diretti in `jme.js`**. Le stringhe passate a
`new Numbas.Error(key, args)` sono chiavi, non messaggi: la localizzazione
(`R()`) avviene dentro `Numbas.Error` stesso (`runtime/scripts/numbas.js:82`,
fuori da questo file). I test asseriscono su `e.originalMessage` (la chiave
non tradotta), quindi **la porta di `jme.js` non dipende da i18n** — solo il
dizionario `it/en` del design doc deve contenere le 36 chiavi elencate in
§7.

---

## 5. Da non portare

| righe | cosa | perché |
|---|---|---|
| 406-442 | `jme.contentsubvars` | Sostituzione di variabili in blocchi di testo/TeX con delimitatori `$...$`/`\[...\]`; chiama `jme.display.texify`/`exprToLaTeX` e `jme.collectRuleset`. Logica di **rendering testo domanda**, non del motore JME — appartiene semmai a `question/` o `marking/` (task 7/9), non a `jme/`. |
| 443-497 | `jme.texsplit` | Parsing di comandi TeX `\var{}`/`\simplify{}`; usato solo da `contentsubvars`/`findvars` (per string-interpolation) — legato al display, non alla valutazione JME pura. Se il porter lo vuole per riprodurre `findvars` su stringhe con TeX, va isolato come utility di testo, non nel core `jme/`. |
| 498-536 | `jme.typeToDisplayString` (in particolare il branch `'html'`, riga 519-527) | Usa `window.jQuery`, `Numbas.jme.display.JMEifier` — **DOM + display**, entrambi fuori scope (Non-obiettivi: "nessun componente... nessun accesso a `window`, `document`"). |
| 537-552 | `jme.tokenToDisplayString` | Dipende da `jme.display.treeToJME` — sposta a `display.ts` (task 5). |
| 553-594 | `jme.subvars` | Dipende da `jme.display.treeToJME`; usato da `Scope.prototype.evaluate` per stringhe con `subjme` — quindi **non del tutto rimovibile**: la valutazione di stringhe con `{expr}` richiede una qualche sostituzione testuale. Il porter deve decidere se re-implementarla in `evaluate.ts` con una dipendenza *interna* verso `display.ts` (rompendo l'ordine "task 2 prima di task 5") o se rinviare il supporto a stringhe interpolate a dopo il task 5. Segnalato anche in §9. |
| 3879-3900 | `THTML` (tipo `html`) | Costruttore chiama `document.createElement('div')`, manipola `elem.childNodes`/`innerHTML`. **DOM diretto** — non portabile in un motore headless. Il tipo `'html'` può restare come stub/no-op (valore opaco) o essere del tutto omesso dai 24 tipi se nessuna funzione builtin nello scope lo produce prima del rendering finale (da verificare al task 4). |
| 519-527 (dentro 498-536) | branch `window.jQuery` | vedi sopra. |
| 3883 | `document.createElement` | vedi sopra. |
| tutta la sezione "Parser" per quanto riguarda XML | — | *(nessuna presenza in jme.js — l'XML/compilatore Python vive in `xml.js`/`exam-to-xml.js`, non referenziato da questo file; menzionato qui solo per confermare l'assenza, coerente coi Non-obiettivi del design doc)* |

**Non "da non portare" ma da portare altrove** (per chiarezza — non sono
DOM/XML, ma non sono strutturalmente parte di tokenizer/parser/types/scope/
evaluate):
- `jme.compare` (346-405) — usato dai marking script legacy per confronto
  campionato; probabilmente da riportare in `marking/` (task 7) più che in
  `jme/evaluate.ts`, ma **usa solo API core** (`findvars`, `scope.evaluate`,
  `resultsEqual`, `randoms`) quindi può restare in `jme/` senza violare i
  vincoli di modulo: valutare in fase di implementazione.
- `jme.makeFast` (5633-5820) — ottimizzazione performance, non necessaria
  per la correttezza; il design doc non lo cita esplicitamente. Può essere
  rinviato (non è testato se non nel test `'Make fast'`, riga 1625 di
  jme-tests.mjs) senza bloccare gli altri task, purché quel singolo test
  upstream venga marcato "rinviato" invece che tradotto.

---

## 6. Test upstream

### 6.1 `tests/jme/jme-tests.mjs` (2983 righe totali)

Setup comune (righe 1-64): il file dichiara
`Numbas.queueScript('jme_tests', ['qunit','jme','jme-rules','jme-display','jme-calculus','jme-notations','localisation','schedule'], ...)`
— **l'intero file richiede l'intero stack caricato** (inclusi builtins,
display, calculus, notations) prima che un solo test parta. Elenco helper
condivisi: `raisesNumbasError(assert,fn,error,description)` (verifica
`e.originalMessage`), `closeEqual`/`deepCloseEqual` (arrotondano a 10 dp
prima di confrontare), `remove_pos(tree)` (strip `pos`/`bracketed` per
confronto strutturale), `treesEqual(assert,a,b,message)` (confronto
strutturale tipo/nome/arità, non valore), `tokWithPos(tok,pos)`.

| modulo QUnit | righe | `QUnit.test` | helper usati | dipendenze da moduli successivi |
|---|---|---|---|---|
| `Subvars` | 66-139 | 6 | `assert.deepEqual` diretto | `subvars`/`findvars` con interpolazione TeX → richiede `contentsubvars`/`texsplit`; alcuni test chiamano `jme.display` indirettamente tramite `subvars`. **Parzialmente Task 2** (findvars puro), **parzialmente Task 5** (subvars su TeX). |
| `Compiling` | 140-456 | 20 | `raisesNumbasError`, `treesEqual`, `remove_pos`, `tokWithPos` | Perlopiù **Task 2 puro**: test su `tokenise`/`shunt`/`compile` che confrontano solo la *struttura* dell'albero (non valori valutati) — es. `'Booleans'`, `'Numbers'`, `'Names'`, `'Operators'`, `'Punctuation'`, `'Implicit multiplication'`, `'Chained relations'`, `'Pipe operator'`, `'Expand juxtapositions'` (quest'ultimo chiama `scope.expandJuxtapositions`, richiede solo uno scope vuoto). `'Invalid expressions'` e `'missing brackets and args'` testano solo `Numbas.Error`. **Nessuna dipendenza reale da builtins** — ottimo set per Task 2. |
| `Evaluating` | 457-1639 | 45 | `closeEqual`, `deepCloseEqual`, helper locali per-test | **Modulo misto**: `'jme.typecheck'`, `'jme.findCompatibleType'`, `'Number-like types'`, `'jme.enumerate_signatures'`, `'jme.inferVariableTypes'`, `'jme.inferExpressionType'`, `'Safe strings'`, `'Annotations'`, `'wrapValue'`, `'isRandom'`, `'isDeterministic'`, `'Sub-expressions'` testano meccanismi **core** ma quasi tutti valutano espressioni reali (`scope.evaluate("1+1")`) — **richiedono operatori aritmetici registrati come `funcObj`, che in Numbas sono definiti in `jme-builtins.js`, non in `jme.js`**. Praticamente ogni test che chiama `evaluate`/`Numbas.jme.builtinScope.evaluate` con un'espressione che usa `+`, `sqrt`, `if`, ecc. **non passerà finché Task 4 non è portato**, a meno che il porter costruisca uno scope di test con `funcObj` minimi ad-hoc solo per esercitare `Scope.evaluate`/`matchFunctionToArguments`/`castArgumentsToSignature` (consigliato per Task 2, vedi §9). `'Arithmetic'`, `'Trigonometry'`, `'Vector and Matrix operations'`, `'Number theory/combinatorics'`, `'Rounding'`, `'Currency'`, `'Random numbers'`, `'Exponentials'`, `'Calculus'`, `'Gauss-jordan elimination'`, `'Range operations'`, `'List operations'`, `'Dictionaries'`, `'Branching'`, `'Repetition'` sono **test di funzioni builtin travestiti da test di evaluate** → rinviare a Task 4. `'Make fast'` (1625) → vedi §5. |
| `Real intervals` | 1640-1855 | 8 | costruzione diretta `new Numbas.math.RealInterval(...)` | **Task 1** (math.js) per `'Constructor'`; gli altri test (`'Pairwise intersection'`, `'union'`, `'Complement'`, `'Difference'`, `'Union/Intersection/Complement of unions'`) valutano espressioni JME con notazione intervallo (`[0..2]`) e funzioni come `intersection`/`union` → builtin, **Task 4**. Il tipo `TInterval` (Task 2) è coinvolto solo come contenitore. |
| `Scopes` | 1856-2017 | 8 | `assert.ok/equal/deepEqual` | **Task 2 puro** per meccanica pura di scope: `'Variables'`, `'Functions'`, `'Function sets'`, `'Custom parser'`, `'Constants'`, `'unset'`. `'Rulesets'` richiede `jme.rules.Ruleset`/`collectRuleset` → Task 3. `'Scope JME functions'` (1914) valuta espressioni reali → dipende da builtin minimi o da funzioni ad-hoc definite nel test stesso (da verificare leggendo il test). |
| `Built-in notations` | 2018-2031 | 1 (loop dinamico su notazioni) | — | **Task 5** (`jme-notations.js`) interamente. |
| `Pattern-matching` | 2032-2233 | 2 | — | **Task 3** (`jme.rules.matchExpression`, `jme.rules.replace`) interamente. |
| `Display` | 2234-2831 | 17 | — | **Task 5** (`jme.display.*`) interamente: `niceNumber`, `niceDecimal`, notazioni numeriche, `treeToJME`, `texify`, `exprToLaTeX`. |
| `Promises` | 2832-2865 | 1 | `async function(assert)` | `makeVariablesPromise` è di `jme-variables.js` → **Task 6**, non Task 2. |
| `Documentation` → `Coverage` | 2866-2949 | 1 | — | Verifica che ogni funzione builtin documentata in `doc-tests.mjs` esista in `Numbas.jme.builtinScope` → **richiede Task 4 completo**. |
| `Documentation` → `Random flag set properly` | 2950-2966 | 1 | — | Verifica `fn.random` su builtin → **Task 4**. |
| `Docs: <sezione>` (generato dal loop righe 2967-2983 su `doc_tests`) | 2967-2983 (codice generatore) | genera **25 moduli × 280 test totali** (uno per funzione builtin documentata con esempi) | `Numbas.jme.builtinScope.evaluate` + `jme.display.treeToJME` | **Richiede Task 4 (builtin) e Task 5 (display) insieme** — nessuno di questi passa prima. |

### 6.2 `tests/jme/doc-tests.mjs` (6209 righe)

Non contiene codice QUnit: è un **export di dati** (`export default [...]`),
un array di 25 sezioni (`Anonymous functions, Arithmetic, Number operations,
Trigonometry, Number theory, Vector and matrix arithmetic, Strings, Logic,
Collections, Ranges, Lists, Dictionaries, Sets, Intervals, Randomisation,
Control flow, HTML, JSON, Sub-expressions, Calculus, Asynchronous functions,
Pattern-matching sub-expressions, Identifying data types, Inspecting the
evaluation scope, Debugging tools`), 280 funzioni documentate, 540 esempi
`{in, out}` generati dalla documentazione ufficiale Numbas. Consumato solo
dal loop di `jme-tests.mjs` righe 2967-2983 (vedi sopra). **Nessun test qui
è eseguibile prima che Task 4 e Task 5 siano entrambi completi.**

### 6.3 Riepilogo per il porter

- **Sicuramente portabili a Task 2** (nessuna dipendenza da builtins/rules/display): tutto `Compiling` (20 test), la maggior parte di `Scopes` (7/8 test) esclusi Rulesets, e i test di meccanismo puro dentro `Evaluating` (`jme.typecheck`, `jme.findCompatibleType`, `Number-like types`, `jme.enumerate_signatures`, `jme.inferVariableTypes`, `jme.inferExpressionType`, `wrapValue`, `Safe strings`, `Annotations`) — stimati **~30-35 `QUnit.test`** su 108 nel file, il resto richiede almeno Task 3/4/5.
- Il criterio di accettazione del design doc ("test di parsing e valutazione")
  per Task 2 va quindi interpretato come: **tutti i test di parsing** +
  **i test di valutazione che il porter può rendere indipendenti da
  builtins scrivendo `funcObj` minimi di supporto** (es. un `+` giocattolo
  per testare `matchFunctionToArguments`), non l'intero modulo `Evaluating`
  copiato 1:1.

---

## 7. Punti delicati

1. **Tokenizer: ordine dei riconoscitori e multiplicazione implicita.**
   `tokeniser_types` (1245-1440) è provato **in ordine**; `re_integer` prima
   di `re_number` (un intero non deve matchare come float). Ogni riconoscitore
   di `number/integer/name/(` **inserisce autonomamente un `TOp('*')`** se il
   token precedente lo richiede (`)`, `name`, operatore postfisso) — la
   moltiplicazione implicita **non è una fase separata**, è cablata dentro
   ogni `parse()` (righe 1284, 1300, 1420, 1436). Un port che sposti questa
   logica in una fase post-tokenizzazione separata deve riprodurre
   esattamente le stesse condizioni (`isType(prev,')')`,
   `isType(prev,'name')`, `prev.type=='op' && prev.postfix`) per ciascun
   caso, altrimenti casi limite come `3!2` o `)2` divergono.

2. **Operatori Unicode e regex `\p{...}`.** `re_name`/`re_op`/`re_punctuation`
   usano Unicode property escapes (`\p{Ll}`, `\p{Nd}`, `\p{Ps}`, `\p{Pd}`,
   flag `u`) — supportati nativamente da JS moderno/Node, **da verificare**
   che `decimal.js`/il target TS non richieda transpiling che li rompa
   (target ES2022 nel design doc, ok). `make_re()` (righe ~1963-1998, dentro
   `class Parser`) **ricostruisce** `re_op` ordinando gli operatori per
   lunghezza decrescente (`sort().reverse()`) per evitare che un operatore
   corto (es. `<`) matchi prima di uno lungo che lo contiene come prefisso
   (es. `<=`) — un bug qui rompe silenziosamente il parsing di operatori
   composti.

3. **Shunting-yard non standard: `shunt_type_actions` + `addoutput`.** Non è
   un semplice shunting-yard da manuale:
   - Le **relazioni incatenate** (`a<b<c`) sono riscritte in `and` durante
     `addoutput` (righe ~2280-2320), camminando l'albero già costruito per
     trovare l'estremo sinistro/destro della catena — un caso limite è
     quando `a<b<c` è già parte di un `and` più grande.
   - Gli **operatori negati** (`not in`, tokenizzati con `negated=true`,
     righe 1421-1424) sono riscritti in un nodo `not` wrappante durante
     `addoutput` (righe ~2340-2344), **dopo** aver raccolto gli argomenti.
   - L'operatore **pipe `|>`** (righe ~2345-2360) riscrive `a |> f` in
     `f(a)` o, se il lato destro è una lambda, applica la lambda — gestito
     interamente in `addoutput`, non nel parser.
   - Le **liste di keypair diventano dizionari**: `addoutput` per `tok.type
     == 'list'` controlla se *tutti* gli argomenti sono `keypair` (righe
     ~2253-2265) — misto lista/dict è un errore esplicito
     (`'jme.shunt.list mixed argument types'`).
   - Le **lambda** (`x -> expr`, `(x,y) -> expr`, `[a,b] -> a+b`) si
     costruiscono in due passi: la lista di nomi si accumula come token
     `TList`/argomenti sullo stack, poi quando si incontra `->`
     (`shunt_type_actions.op`, riga ~2107-2111, caso speciale
     `tok.name=='*' && output.at(-1).tree.tok.type=='lambda'`) e infine
     `')'` (righe ~2189-2193) collega i nomi al token lambda già sullo
     stack. **Fragile**: dipende dall'ordine esatto in cui `(`, i nomi, `)`
     e `->` arrivano nello shunt.

4. **`TInt` è backed da `BigInt`**, non da `number` — `TInt.value` è un
   getter/setter (righe 3743-3751) che converte avanti e indietro con
   `math.ensure_bigint`. Un porter che tratti `TInt` come `TNum` con solo
   `Number.isInteger()` perderebbe precisione su interi grandi (> 2^53).
   `TInt → number` (cast, riga 3762) **preserva `originalValue`** per non
   perdere la stringa originale se poi ri-castato a `decimal`. `TNum` invece
   non ha mai BigInt: rappresenta i complessi come oggetto plain
   `{re,im,complex:true}` (mai una classe) — **due rappresentazioni diverse
   di "numero"** convivono (`TNum.value` può essere `number` o
   `{re,im,complex}`; `TDecimal.value` è sempre `math.ComplexDecimal`).
   `number_to_decimal` (3694-3727) ha un ramo che usa `n.originalValue` **se
   presente** per evitare l'arrotondamento float→string→Decimal — questo
   comportamento è invocato solo quando il chiamante passa l'intero token
   `TNum` (non solo `.value`), quindi la firma va preservata con attenzione.

5. **Valutazione lazy (`jme.lazyOps`).** L'array è vuoto in questo file
   (riga 4471) e viene popolato altrove (`if`, `and`, `or`, `switch`, `map`,
   quantificatori...). `Scope.prototype.evaluate` (riga ~3225) controlla
   `jme.lazyOps.indexOf(op) >= 0` **prima** di valutare gli argomenti: se
   vero, passa `tree.args` (alberi, non token) a `fn.evaluate`, che decide
   *lui* quando/se valutare ciascun ramo (es. `if` non valuta il ramo non
   scelto). Un port che valuti sempre tutti gli argomenti prima di
   dispatchare romperebbe `if`/cortocircuito booleano e renderebbe possibile
   ricorsione infinita in funzioni definite ricorsivamente via `if`.

6. **Catena di scope e `deleted`.** `resolve()` (2785-2803) implementa
   *shadowing con cancellazione esplicita*: un nome può essere presente nel
   parent ma "cancellato" in un child (`setDeleted`), nel qual caso
   `resolve` ritorna `undefined` **senza continuare a risalire oltre quel
   livello** — ma la funzione continua comunque il loop `while(scope)`
   risalendo, quindi se il *parent del parent* ridefinisce lo stesso nome
   **non-cancellato**, quel valore *non* viene visto (il primo controllo
   `deleted` fa `return undefined` immediato). `getFunction` (2839-2864) ha
   una semantica leggermente diversa: **si ferma del tutto** (`break`) al
   primo livello con `deleted.functions[name]` invece di ritornare subito
   — poi ritorna quel che ha accumulato finora (che può essere vuoto).
   `deleteVariable` cancella *anche* la costante omonima per default
   (`options.delete_constant !== false`, riga 2760) — comportamento
   implicito facile da perdere in un port.

7. **`expandJuxtapositions` (3320-3620) è un riscrittore di albero
   separato, non integrato nel parser.** Va chiamato esplicitamente
   (`scope.expandJuxtapositions(tree, options)`) — **nessuna chiamata
   interna a `jme.js` lo invoca**; probabilmente lo chiama `jme-variables.js`
   o `part.js` sull'input dello studente. Riscrive: nomi lunghi non annotati
   in prodotti di variabili singole (`xy` → `x*y`, algoritmo goloso
   right-to-left su `getNameInfo`, righe 3436-3459); funzioni sconosciute
   allo scope in prodotti (`x(y)` → `x*y` se `x` non è funzione nota, con
   ricerca del break-point più lungo che è un prefisso di un nome di
   funzione noto, righe 3462-3499); composizione di funzione implicita
   (`lnabs(x)` → `ln(abs(x))`, `ln abs(x)` → `ln(abs(x))`, righe 3367-3402).
   **Interagisce con la precedenza**: se un operatore ha precedenza minore
   di `*`, il riscrittore deve "estrarre" il moltiplicando più a
   sinistra/destra attraverso l'albero già parsato (`extract_leftmost`/
   `extract_rightmost`, righe 3522-3551) — logica delicata con molti casi
   limite annidati (postfix, arità 1 vs 2).

8. **`null`/`nothing`**: **non esiste un valore `null` di JME** — `TNothing`
   (tipo `nothing`) è l'unico "vuoto" esplicito, usato solo per argomenti
   opzionali mancanti (`castArgumentsToSignature`) o come costante
   `nothing` (registrata in `jme-builtins.js`, non qui). `jme.wrapValue`
   mappa **sia `null` sia `undefined` JS** a `TString('')` (riga 715-717,
   commentato `CONTROVERSIAL!` nel sorgente) — **non** a `TNothing`. Un
   porter che "razionalizzi" questo comportamento mappando `null`→`TNothing`
   romperebbe la compatibilità con `jme-builtins.js` che si aspetta stringhe
   vuote da funzioni JS che ritornano `undefined`.

9. **Risoluzione overload (`matchFunctionToArguments`, 2876-3012).** Non è
   "primo match vince": prima cerca un **match esatto** (`exactType`, tipi
   di tutti gli argomenti letteralmente uguali, ricorsivo dentro liste
   tipate), e solo se non c'è lo trova usa `compare_matches` per scegliere
   il candidato "più specifico" fra quelli che matchano via cast,
   confrontando posizione per posizione la distanza nel dizionario `casts`
   di ogni argomento (righe 2932-2960: `Object.keys(args[i].casts).indexOf`
   — **l'ordine delle chiavi nell'oggetto `casts` passato a
   `jme.registerType` conta** per decidere quale overload vince quando più
   di uno è candidato via cast). Un port che usi `Map`/`Set` invece di
   object literal per `casts` deve preservare l'ordine di inserimento.

10. **Errori: `Numbas.Error` non è in questo file.** `jme.js` lancia sempre
    `new Numbas.Error(key, argsObj?, originalError?)` con `key` = stringa
    puntata tipo `'jme.shunt.no left bracket'`; la classe stessa (che
    traduce `key` con `R()`) vive in `runtime/scripts/numbas.js:82-95`. **36
    chiavi distinte** usate in jme.js (42 siti di `new Numbas.Error(...)`,
    alcune chiavi ripetute in punti diversi):
    ```
    jme.compile list.mismatched bracket
    jme.compile list.missing right bracket
    jme.evaluate.no scope given
    jme.makeFast.no fast definition of function
    jme.matrix.reports bad size
    jme.matrix.value not the right type
    jme.parse signature.invalid signature string
    jme.shunt.expected argument before comma
    jme.shunt.keypair in wrong place
    jme.shunt.list mixed argument types
    jme.shunt.missing operator
    jme.shunt.no left bracket
    jme.shunt.no left bracket in function
    jme.shunt.no right bracket
    jme.shunt.no right square bracket
    jme.shunt.not enough arguments
    jme.shunt.pipe right hand takes no arguments
    jme.substituteTree.undefined variable
    jme.subvars.error compiling
    jme.subvars.null substitution
    jme.texsubvars.missing parameter
    jme.texsubvars.no right brace
    jme.texsubvars.no right bracket
    jme.thtml.not html
    jme.tokenise.invalid near
    jme.tokenise.keypair key not a string
    jme.tokenise.number.object not complex
    jme.type.no cast method
    jme.type.type already registered
    jme.typecheck.function maybe implicit multiplication
    jme.typecheck.function not defined
    jme.typecheck.no right type definition
    jme.typecheck.no right type unbound name
    jme.typecheck.op not defined
    jme.typecheck.wrong arguments for anonymous function
    jme.typecheck.wrong names for anonymous function
    jme.vector.value not an array of numbers
    ```
    I test upstream verificano `e.originalMessage == 'quella chiave'`
    (helper `raisesNumbasError`, jme-tests.mjs riga 19-21) — **non** il testo
    tradotto — quindi il porter deve solo garantire che una classe di errore
    equivalente esponga la stessa chiave stabile (es. `error.code` o
    `error.messageKey`), il messaggio it/en può essere scritto liberamente
    (decisione 7 del design doc).

11. **Ricorsione**: nessun controllo esplicito di profondità in `jme.js`
    (né in `Scope.evaluate`, né in `substituteTree`, né in `compareTrees`).
    Uno stack overflow su espressioni molto annidate o su funzioni JME
    ricorsive senza base case è un `RangeError` nativo, non un
    `Numbas.Error` — comportamento **da preservare o da esplicitamente
    migliorare** (nota per §9, non è specificato nel design doc).

12. **`isRandom` muta lo stato (`fn.random`, riga ~1067-1069)** — effetto
    collaterale su un oggetto condiviso (`funcObj`) per memoizzare il
    risultato e prevenire ricorsione infinita quando una funzione richiama
    se stessa. Un port funzionale "puro" deve comunque riprodurre questa
    memoizzazione (con `random = false` provvisorio prima della ricorsione)
    per evitare stack overflow su funzioni mutuamente ricorsive.

13. **Prototipi globali monkey-patched** (`Array.prototype.contains/merge`,
    `String.prototype.contains`) — usati pervasivamente in `jme.js` (10 siti
    totali) e definiti in `util.js`, non in questo file. Il port TS **non
    deve estendere i prototipi nativi**; ogni sito va sostituito con
    `.includes()` (per `contains`) e con una funzione libera
    `mergeUnique(a, b, sortfn?)` con la stessa semantica esatta (unione +
    sort + dedup, non concat) documentata in §4.

14. **`Scope.prototype.evaluate`, caso `string`** (righe ~3193-3210):
    valutare una stringa **non-safe** che contiene `{` triggera sostituzione
    di variabili (`jme.contentsubvars` o, se `tok.subjme`,
    `jme.display.subvars`+`jme.display.treeToJME`) — cioè **la valutazione
    di un singolo token stringa può a sua volta compilare e valutare
    sotto-espressioni JME**, con una dipendenza diretta (non opzionale) da
    `jme.display` per il ramo `subjme`. Questo è il punto di maggior
    tensione con l'architettura a task del design doc (evaluate.ts, Task 2,
    dipenderebbe da display.ts, Task 5) — va isolato/rinviato con cura
    (vedi §9).

---

## 8. Proposta di suddivisione TypeScript

Vincolo: nessun file oltre le 1000 righe. `jme.js` (6281 righe, meno le
sezioni "da non portare" di §5, ~200 righe) si spezza in **5 file** come da
design doc, con questa mappatura di provenienza:

| file target | righe sorgente (`jme.js`) | contenuto | stima righe TS |
|---|---|---|---|
| `packages/engine/src/jme/types.ts` | 3623-4407, 4544-4658, 5821-6280, 2470-2490, 1161-1176, 4520-4543 | I 24 tipi token (`TNothing`…`TScope`, esclusa `THTML` o ridotta a stub), `registerType`, `getNameInfo`, `funcObj`, `signature` builders, `parse_signature`, `describe_signature`, `converseOps`, typedef `Token`/`Tree`/`Signature` | ~950 |
| `packages/engine/src/jme/tokenizer.ts` | 1177-1245 (campi regex/tokeniser_types), 1782-2036 (metodi tokenizer/normalizzazione), 1450-1642 (tabelle precedenza/synonyms come dati esportati) | `re_*`, `tokeniser_types`, `tokenise()`, `make_re()`, normalizzatori (`normaliseName/Number/Punctuation/Op`), tabelle operatori | ~700 |
| `packages/engine/src/jme/parser.ts` | 2038-2466 (shunt/addoutput/compile), 64-183 (wrapper `compile/tokenise/shunt`), 282-345 (`compileList`) | `shunt()`, `addoutput()`, `shunt_type_actions`, `compile()`, `compileList()`, classe/factory `Parser` | ~650 |
| `packages/engine/src/jme/scope.ts` | 2491-2557 (`FunctionSet`), 2576-3621 (`Scope`) | `Scope`, `FunctionSet`, `matchFunctionToArguments`, `expandJuxtapositions` | ~1000 (**al limite — valutare se spostare `expandJuxtapositions` in un file separato `jme/juxtapositions.ts`, ~300 righe, per stare sotto quota**) |
| `packages/engine/src/jme/evaluate.ts` | 214-281 (`substituteTree`/`evaluate` wrapper), 3148-3290 (`Scope.evaluate`, spostato qui o richiamato da scope.ts), 4671-4998 (`checkingFunctions`, `resultsEqual`, `randoms`), 5010-5279 (`varsUsed`, `compareTokens*`, `treesSame`, `compareTrees`), 5280-5608 (inferenza tipi, `makeFast`), 4807-4936 (`findvars`, hook dictionaries), 730-1159 (coercizione: `isType/castToType/wrapValue/unwrapValue/isComplex/...`) | Valutazione, confronto, coercizione, inferenza tipi, `findvars`, `compareTrees` | ~950 (**al limite — `makeFast` (190 righe) e l'inferenza tipi (300 righe) sono buoni candidati per un file separato `jme/infer.ts` se si sfora**) |

Non portati in nessun file (vedi §5): 406-594 (contentsubvars/texsplit/
typeToDisplayString/tokenToDisplayString/subvars — rinviati a display.ts o
a un futuro `text-substitution.ts`), 3879-3900 (THTML).

`jme.compare` (346-405) proposto in `evaluate.ts` (usa solo API core) ma
segnalato come possibile candidato per `marking/` — decisione al momento
dell'implementazione.

### Firme TypeScript proposte (bozza, da rifinire in fase di implementazione)

```ts
// types.ts
export type TokenType =
  | 'nothing' | 'number' | 'integer' | 'rational' | 'decimal' | 'interval'
  | 'string' | 'boolean' | 'list' | 'keypair' | 'dict' | 'set' | 'vector'
  | 'matrix' | 'range' | 'name' | 'function' | 'op' | 'lambda' | 'punc'
  | 'promise' | 'expression' | 'scope';
  // 'html' intenzionalmente omesso o come tipo opaco separato

export interface TokenBase {
  readonly type: TokenType;
  casts?: Record<string, (tok: Token) => Token>;
  pos?: number;
  bracketed?: boolean;
  bound?: boolean;
}
export type Token = TNum | TInt | TRational | TDecimal | /* … */ TScope;

export interface Tree {
  tok: Token;
  args?: Tree[];
}

export interface FuncObjOptions {
  description?: string;
  typecheck?: (args: Token[]) => boolean;
  evaluate?: (args: Token[] | Tree[], scope: Scope) => Token;
  unwrapValues?: boolean | object;
  random?: boolean;
  latex?: boolean;
}
export class FuncObj {
  readonly id: number;
  constructor(
    name: string,
    intype: Array<string | Signature | (new (...a: any[]) => Token)>,
    outcons: (new (...a: any[]) => Token) | '?',
    fn: ((...args: any[]) => any) | null,
    options?: FuncObjOptions,
  );
  intype(args: Token[]): SignatureResult | false;
  typecheck(args: Token[]): boolean;
  evaluate(args: Token[] | Tree[], scope: Scope): Token;
}

export type Signature = ((args: Token[]) => SignatureResult | false) & { kind: string };
export type SignatureResult = Array<{ type?: string; missing?: boolean; nonspecific?: boolean; items?: SignatureResult | Record<string, any> }>;

// tokenizer.ts
export interface TokeniserOptions { closeMissingBrackets?: boolean; addMissingArguments?: boolean }
export function tokenise(expr: string, options?: TokeniserOptions): Token[];

// parser.ts
export interface ParserOptions extends TokeniserOptions {}
export class Parser {
  constructor(options?: ParserOptions);
  tokenise(expr: string): Token[];
  shunt(tokens: Token[]): Tree;
  compile(expr: string): Tree | null | undefined;
  addBinaryOperator(name: string, options?: OperatorOptions): void;
  addPrefixOperator(name: string, alt?: string, options?: OperatorOptions): void;
  addPostfixOperator(name: string, alt?: string, options?: OperatorOptions): void;
}
export function compile(expr: string): Tree | null | undefined;
export function compileList(expr: string): Tree[] | null;

// scope.ts
export interface ScopeExtras {
  variables?: Record<string, Token>;
  constants?: Record<string, { value: Token; tex?: string }>;
  functions?: Record<string, FuncObj[]>;
  function_sets?: Record<string, FunctionSet>;
  rulesets?: Record<string, unknown>; // Ruleset dal Task 3
  caseSensitive?: boolean;
}
export class Scope {
  constructor(parentOrExtras?: Scope | [Scope, ScopeExtras] | ScopeExtras);
  clone(): Scope;
  setVariable(name: string, value: Token): void;
  getVariable(name: string): Token | undefined;
  deleteVariable(name: string, options?: { delete_constant?: boolean }): void;
  addFunction(fn: FuncObj): FuncObj;
  getFunction(name: string): FuncObj[];
  matchFunctionToArguments(tok: Token, args: Token[]): { fn: FuncObj; signature: SignatureResult } | null;
  evaluate(expr: string | Tree, variables?: Record<string, Token | unknown>, noSubstitution?: boolean): Token;
  expandJuxtapositions(tree: Tree, options?: JuxtapositionOptions): Tree;
}

// evaluate.ts
export function evaluate(tree: Tree | string, scope: Scope): Token;
export function substituteTree(tree: Tree, scope: Scope, allowUnbound?: boolean, unwrapExpressions?: boolean): Tree;
export function compareTrees(a: Tree, b: Tree): -1 | 0 | 1;
export function findvars(tree: Tree, boundvars?: string[], scope?: Scope): string[];
export function isType(tok: Token, type: string): boolean;
export function castToType(tok: Token, type: string | TypeDescription): Token;
export function wrapValue(v: unknown, typeHint?: string): Token;
export function unwrapValue(v: Token, options?: { bigInts?: boolean }): unknown;
```

---

## 9. Domande aperte

1. **Stringhe con interpolazione JME (`{expr}`) dentro `Scope.evaluate`**
   (§7.14): la valutazione di un `TString` non-safe con `{` dipende da
   `contentsubvars`/`jme.display.subvars`, cioè da `display.ts` (Task 5).
   Si porta questo ramo in Task 2 con una dipendenza *interna* anticipata
   verso una versione minima di `treeToJME` (solo quanto serve a
   ri-testualizzare un valore), oppure si rinvia il supporto a stringhe
   interpolate — e quindi il test `'Subvars'`/parte di `'Compiling' →
   String'` — fino a dopo Task 5? Il design doc non lo specifica.

2. **`jme.compare`** (§5): resta in `jme/evaluate.ts` (usa solo API core) o
   si sposta in `marking/` dato che il suo unico consumatore upstream è la
   logica di marking legacy? Decide impatto sul limite di 1000 righe di
   `evaluate.ts` (§8).

3. **Tipo `html`/`THTML`**: lo si omette del tutto dai 24 tipi (nessuna
   funzione builtin in ambito lo produce, da verificare a Task 4), o lo si
   mantiene come tipo opaco senza logica DOM (solo `{type:'html', value:
   string}`) per compatibilità con funzioni builtin che eventualmente lo
   richiedono nella firma?

4. **`jme.makeFast`** (§5): il design doc non lo cita. È un'ottimizzazione
   di performance (compilazione JIT-like per valutazioni ripetute, es.
   generazione di variabili casuali su intervalli). Va portato in Task 2
   (rischio: +190 righe, +dipendenza da `inferTreeType`) o rinviato a
   un'ottimizzazione successiva, marcando il test `'Make fast'` (jme-tests.mjs
   riga 1625) come rinviato?

5. **BigInt per `TInt`** (§7.4): TypeScript supporta nativamente `bigint`;
   confermare che `decimal.js` 10.x (dipendenza scelta nel design doc)
   interopera bene con `bigint` nativo per le conversioni `TInt ↔ TDecimal`
   (oggi fatte passando per `Decimal` costruito da stringa, riga 3766).

6. **Ordine delle chiavi in `casts`** (§7.9): `matchFunctionToArguments`
   dipende dall'ordine di inserimento delle chiavi dell'oggetto `casts` per
   decidere overload ambigui. Se il port usa oggetti letterali TS (che
   preservano l'ordine per chiavi stringa, per spec ECMAScript) il
   comportamento è preservato automaticamente — **da verificare con un test
   diretto** (nessuna azione di design necessaria, ma da annotare come
   assunzione verificata nei test di Task 2).

7. **Limite di profondità di ricorsione** (§7.11): il design doc non lo
   menziona. Si introduce un limite esplicito (miglioramento voluto, da
   documentare in `DIVERGENCES.md` per coerenza con la decisione 5 del
   design doc sul random iniettato) o si lascia che Node/browser sollevino
   `RangeError` nativamente come fa l'originale?

8. **`Scope.question`** (riga 2589: `this.question = scopes[0].question ||
   this.question`): proprietà usata dal resto del runtime (question.js,
   part.js) per riferirsi alla domanda proprietaria dello scope. Il design
   doc non menziona `Scope` come portatore di riferimenti a `Question` —
   va tenuta come proprietà opzionale generica (`unknown`) in `scope.ts`
   per non creare una dipendenza circolare `jme/ → question/`, rinviando
   il collegamento reale a `question.ts` (Task 9)?

9. **`jme.function_sets` globale** (§4): nell'originale è uno stato
   *globale mutabile* (`Numbas.jme.function_sets`), popolato da
   `jme-builtins.js`. Nel port, senza namespace globale (decisione 1 del
   design doc), `FunctionSet` deve scrivere dove? Un registro passato
   esplicitamente, o si abbandona questo side-channel (nessun consumatore
   di `jme.function_sets` è stato verificato dentro `jme.js` stesso — solo
   scrittura, mai lettura in questo file) rendendolo un dettaglio
   implementativo locale a `builtins/` (Task 4)?
