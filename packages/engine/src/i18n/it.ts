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
  "jme.display.simplifyTree.stuck in a loop":
    "La semplificazione di {expr} è entrata in un ciclo: le regole si annullano a vicenda",
  "jme.evaluate.no scope given": "Per valutare un'espressione serve uno scope",
  "jme.makeFast.no fast definition of function":
    "La funzione {name} non ha una definizione utilizzabile in forma veloce",
  "jme.matchTree.group name not a name":
    "Il nome di un gruppo catturato deve essere un nome o una coppia chiave-valore",
  "jme.matchTree.match macro first argument not a dictionary":
    "Il primo argomento di `@ deve essere un dizionario di sotto-pattern",
  "jme.matrix.reports bad size": "La matrice dichiara una dimensione diversa da quella reale",
  "jme.matrix.value not the right type": "Valore di tipo sbagliato nella costruzione di una matrice",
  "jme.parse signature.invalid signature string": "Firma di funzione non valida: {str}",
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
  "jme.typecheck.function maybe implicit multiplication":
    "La funzione {name} non è definita: forse intendevi {first}*{possibleOp}(...)?",
  "jme.typecheck.function not defined":
    "La funzione {op} non è definita: {op} è una variabile e intendevi {suggestion}*(...)?",
  "jme.typecheck.no right type definition": "Nessuna definizione di {op} adatta a questi tipi di argomento",
  "jme.typecheck.no right type unbound name": "La variabile {name} non è definita",
  "jme.typecheck.op not defined": "L'operazione {op} non è definita",
  "jme.typecheck.wrong arguments for anonymous function":
    "Numero di argomenti sbagliato per questa funzione anonima",
  "jme.typecheck.wrong names for anonymous function":
    "Nomi di argomento non validi per una funzione anonima: {names_type}",
  "jme.vector.value not an array of numbers": "Un vettore va costruito da un array di numeri",
  "util.equality not defined for type": "Uguaglianza non definita per il tipo {type}",
};
