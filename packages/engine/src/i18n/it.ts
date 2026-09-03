/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Messaggi italiani per le chiavi di errore lanciate da `jme/`. Le chiavi sono
// quelle upstream (`new Numbas.Error('<chiave>', ...)`, inventario §7.10: 36
// chiavi in jme.js) più `util.equality not defined for type` (util.js:178) e
// `jme.subvars.display not available`, che è nostra (decisione 1 del brief:
// i rami di `subvars` che servono `treeToJME`/`texify` passano da
// `displayHooks`, riempiti dal Task 5).
// I testi sono scritti da noi, non tradotti dai file upstream; i segnaposto
// sono nella forma `{nome}` (vedi `t()` in i18n/index.ts).

export const it: Record<string, string> = {
  "jme.calculus.unknown derivative": "Non si sa derivare {tree}",
  "jme.compile list.mismatched bracket": "Parentesi non corrispondenti nella lista di espressioni",
  "jme.compile list.missing right bracket": "Manca una parentesi chiusa nella lista di espressioni",
  "jme.display.collectRuleset.no sets": "Per comporre un insieme di regole serve la lista degli insiemi definiti",
  "jme.display.collectRuleset.set not defined": "L'insieme di regole {name} non è definito",
  "jme.display.unknown token type": "Non so rendere un token di tipo {type}",
  "jme.display.simplifyTree.stuck in a loop":
    "La semplificazione di {expr} è entrata in un ciclo: le regole si annullano a vicenda",
  "jme.evaluate.no scope given": "Per valutare un'espressione serve uno scope",
  "jme.func.except.continuous range": "Non si può usare `except` su un intervallo continuo (passo 0)",
  "jme.func.listval.invalid index": "Indice {index} fuori dalla lista, che ha {size} elementi",
  "jme.func.listval.key not in dict": "La chiave {key} non è nel dizionario",
  "jme.func.listval.not a list": "Si può indicizzare solo una lista",
  "jme.func.parse.no notation": "La notazione {notation_name} non esiste",
  "jme.func.satisfy.condition not a boolean": "Le condizioni di `satisfy` devono valere vero o falso",
  "jme.func.satisfy.took too many runs": "`satisfy` non ha trovato valori che soddisfano le condizioni",
  "jme.func.satisfy.wrong number of definitions": "`satisfy` vuole una definizione per ogni nome",
  "jme.func.switch.no default case": "Nessun caso di `switch` è vero e non c'è un caso predefinito",
  "jme.iterate_until.condition produced non-boolean": "La condizione di `iterate_until` ha prodotto {type} invece di un booleano",
  "jme.makeFast.no fast definition of function":
    "La funzione {name} non ha una definizione utilizzabile in forma veloce",
  "jme.map.matrix map returned non number": "Mappando su una matrice si devono produrre numeri",
  "jme.map.vector map returned non number": "Mappando su un vettore si devono produrre numeri",
  "jme.matchTree.group name not a name":
    "Il nome di un gruppo catturato deve essere un nome o una coppia chiave-valore",
  "jme.matchTree.match macro first argument not a dictionary":
    "Il primo argomento di `@ deve essere un dizionario di sotto-pattern",
  "jme.matrix.reports bad size": "La matrice dichiara una dimensione diversa da quella reale",
  "jme.matrix.value not the right type": "Valore di tipo sbagliato nella costruzione di una matrice",
  "jme.parse signature.invalid signature string": "Firma di funzione non valida: {str}",
  "jme.script.error parsing notes": "Errore nell'analisi delle note: {message}",
  "jme.script.note.compilation error": "Errore di compilazione nella nota {name}: {message}",
  "jme.script.note.empty expression": "La nota {name} non ha un'espressione",
  "jme.script.note.invalid definition": 'Definizione di nota non valida: "{source}".{hint}',
  "jme.script.note.invalid definition.description missing closing bracket":
    " Manca la parentesi chiusa della descrizione.",
  "jme.script.note.invalid definition.missing colon":
    " Manca il segno dei due punti che separa nome ed espressione.",
  "jme.shunt.expected argument before comma": "Manca un argomento prima della virgola",
  "jme.shunt.keypair in wrong place": "Coppia chiave-valore fuori posto: serve un dizionario o un pattern",
  "jme.shunt.list mixed argument types":
    "Non si possono mescolare elementi di lista ({mode}) e di dizionario ({argmode})",
  "jme.shunt.missing operator": "Manca un operatore: l'espressione non può essere valutata",
  "jme.shunt.no left bracket": "Manca la parentesi aperta",
  "jme.shunt.no left bracket in function": "Manca la parentesi aperta nell'applicazione di funzione",
  "jme.shunt.no right bracket": "Manca la parentesi chiusa",
  "jme.shunt.no right square bracket": "Manca la parentesi quadra chiusa che termina la lista",
  "jme.shunt.not enough arguments": "Argomenti insufficienti per l'operazione {op}",
  "jme.shunt.pipe right hand takes no arguments":
    "A destra dell'operatore pipe serve l'applicazione di una funzione",
  "jme.substituteTree.undefined variable": "Variabile non definita: {name}",
  "jme.subvars.error compiling": "{message} nell'espressione {expression}",
  "jme.subvars.null substitution": "Sostituzione vuota in {str}",
  "jme.subvars.display not available":
    "La sostituzione in {op} richiede il modulo di visualizzazione, non ancora caricato",
  "jme.texsubvars.missing parameter": "Manca il parametro in {op}: {parameter}",
  "jme.texsubvars.no right brace": "Manca la graffa chiusa in {op}",
  "jme.texsubvars.no right bracket": "Manca la quadra chiusa negli argomenti di {op}",
  "jme.thtml.not html": "Valore non HTML passato al costruttore del tipo html",
  "jme.tokenise.invalid near": "Espressione non valida: {expression}, alla posizione {position} vicino a {nearby}",
  "jme.tokenise.keypair key not a string": "La chiave di un dizionario deve essere una stringa, non {type}",
  "jme.tokenise.number.object not complex": "Oggetto non complesso passato al costruttore di un numero",
  "jme.tokenise.parser not ready": "Il parser standard non è ancora inizializzato",
  "jme.type.no cast method": "Conversione automatica non disponibile da {from} a {to}",
  "jme.type.type already registered": "Il tipo di dato {type} è già registrato",
  "jme.typecheck.for in name wrong type": "Il nome legato da `of:` deve essere un nome o una lista di nomi, non {type}",
  "jme.typecheck.function maybe implicit multiplication":
    "La funzione {name} non è definita: forse intendevi {first}*{possibleOp}(...)?",
  "jme.typecheck.function not defined":
    "La funzione {op} non è definita: {op} è una variabile e intendevi {suggestion}*(...)?",
  "jme.typecheck.map not on enumerable": "Non si può mappare su un valore di tipo {type}",
  "jme.typecheck.no right type definition": "Nessuna definizione di {op} adatta a questi tipi di argomento",
  "jme.typecheck.no right type unbound name": "La variabile {name} non è definita",
  "jme.typecheck.op not defined": "L'operazione {op} non è definita",
  "jme.typecheck.wrong arguments for anonymous function":
    "Numero di argomenti sbagliato per questa funzione anonima",
  "jme.typecheck.wrong names for anonymous function":
    "Nomi di argomento non validi per una funzione anonima: {names_type}",
  "jme.user javascript.error": "Errore nella funzione JavaScript {name}: {message}",
  "jme.user javascript.returned undefined": "La funzione JavaScript {name} non ha restituito un valore",
  "jme.variables.async function not supported": "La funzione {name} è asincrona: non è supportata",
  "jme.variables.circular reference": "Riferimento circolare nel calcolo di {name}",
  "jme.variables.empty definition": "La variabile {name} non ha una definizione",
  "jme.variables.empty name": "Il nome di una variabile non può essere vuoto",
  "jme.variables.error computing dependency": "Errore nel calcolo della dipendenza {name}: {message}",
  "jme.variables.error evaluating variable": "Errore nel valutare la variabile {name}: {message}",
  "jme.variables.error making function": "Errore nel creare la funzione {name}: {message}",
  "jme.variables.invalid function language": "Linguaggio di funzione non valido: {language}",
  "jme.variables.javascript function not allowed": "Le funzioni JavaScript non sono permesse qui ({name})",
  "jme.variables.syntax error in function definition": "Errore di sintassi nella definizione della funzione",
  "jme.variables.variable not defined": "La variabile {name} non è definita",
  "jme.vector.value not an array of numbers": "Un vettore va costruito da un array di numeri",
  // marking.js — le chiavi degli errori del motore di correzione. Le due
  // marcate "nostra" sostituiscono un `TypeError` upstream.
  "marking.apply.not a list": "Il primo argomento di `apply` deve essere una lista",
  "marking.no question in scope": "Non c'è nessuna domanda in cui cercare la parte {path}", // nostra
  "marking.note.error evaluating note": "Errore nel calcolo della nota {name}: {message}",
  "marking.state function outside marking script":
    "La funzione {name} si può usare solo dentro uno script di correzione", // nostra
  // I messaggi mostrati allo studente: quelli chiamati con `R()` da marking.js
  // e quelli chiamati con `translate(...)` dai 5 script `.jme` in ambito
  // (inventario 05 §6.4 e §6.5).
  "part.gapfill.error marking gap": "Errore nella correzione di {name}: {message}",
  "part.gapfill.feedback header": "<strong>{name}</strong>",
  "part.jme.answer invalid": "La tua risposta non è un'espressione matematica valida.<br/>{message}.",
  "part.jme.error checking numerically":
    "C'è stato un errore nella verifica numerica della tua risposta: {message}",
  "part.jme.marking.correct": "La tua risposta è numericamente corretta.",
  "part.jme.must-have bits": '<span class="monospace">{string}</span>',
  "part.jme.must-have one": "La tua risposta deve contenere: {strings}",
  "part.jme.must-have several": "La tua risposta deve contenere tutti questi elementi: {strings}",
  "part.jme.must-match.failed": "La tua risposta non è scritta nella forma richiesta.",
  "part.jme.must-match.warning": "La tua risposta non è scritta nella forma richiesta: {message}",
  "part.jme.not-allowed bits": '<span class="monospace">{string}</span>',
  "part.jme.not-allowed one": "La tua risposta non deve contenere: {strings}",
  "part.jme.not-allowed several": "La tua risposta non deve contenere nessuno di questi elementi: {strings}",
  "part.jme.unexpected variable name":
    "La tua risposta è stata interpretata usando il nome di variabile inatteso <code>{name}</code>.",
  "part.marking.correct": "La tua risposta è corretta.",
  "part.marking.incorrect": "La tua risposta non è corretta.",
  "part.marking.nothing entered": "Non hai inserito una risposta.",
  "part.marking.partially correct": "La tua risposta è parzialmente corretta.",
  "part.mcq.correct choice": "Hai scelto una risposta corretta.",
  "part.mcq.incorrect choice": "Hai scelto una risposta errata.",
  "part.mcq.wrong number of choices": "Hai scelto il numero sbagliato di opzioni.",
  "part.numberentry.answer invalid": "Non hai inserito un numero valido.",
  "part.numberentry.answer not reduced": "La tua risposta non è ridotta ai minimi termini.",
  "part.patternmatch.correct except case":
    "La tua risposta è corretta, a meno di maiuscole e minuscole.",
  "question.can not submit": "Non è possibile inviare la risposta: controlla se ci sono errori.",
  "ruleset.circular reference": "Riferimento circolare nell'insieme di regole {name}",
  "ruleset.set not defined": "L'insieme di regole {name} non è definito",
  "util.equality not defined for type": "Uguaglianza non definita per il tipo {type}",
};
