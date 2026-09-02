/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:1177-1245 (regex e riconoscitori di token), 1450-1642 (tabelle di
// precedenza, sinonimi, associatività), 1782-2036 (metodi di normalizzazione e
// `tokenise`), 69-77 (`jme.normaliseName`).
//
// Questo file è una FOGLIA del grafo dei moduli: importa solo `unicode.ts`.
// È una scelta necessaria, non estetica — parser.ts costruisce `standardParser`
// a livello di modulo leggendo queste tabelle, e il grafo di `jme/` è circolare
// (tokens.ts → parser.ts → questo file). Se questo file importasse tokens.ts,
// entrare dal tokenizer farebbe valutare parser.ts prima che le tabelle
// esistano, e `new Parser()` fallirebbe. Per lo stesso motivo la classe
// `Parser` e i riconoscitori di token stanno in parser.ts.

import * as unicode from "./unicode";
import type { Parser } from "./parser";
import type { Token } from "./tokens";

// jme.js:69-77 — normalizzazione dipendente dallo scope, applicata DOPO il
// parsing. Da non confondere con `Tokeniser.normaliseName`, che è lessicale.
/** Normalizza un nome per la ricerca nello scope: minuscolo se lo scope non è
 * sensibile alle maiuscole. */
export function normaliseName(name: string, settings?: { caseSensitive?: boolean }): string {
  if (!settings?.caseSensitive) {
    name = name.toLowerCase();
  }
  return name;
}

/** Le opzioni di un parser (jme.js:1162-1167). Nessuna delle due influenza la
 * fase lessicale: entrambe sono lette solo dallo shunting-yard. */
export interface TokeniserOptions {
  /** Ignora silenziosamente le parentesi chiuse mancanti. */
  closeMissingBrackets?: boolean;
  /** Inserisce `?` al posto degli argomenti mancanti. */
  addMissingArguments?: boolean;
}

/** Opzioni di un operatore (jme.js:119-126). */
export interface OperatorOptions {
  synonyms?: string[];
  precedence?: number;
  commutative?: boolean;
  rightAssociative?: boolean;
}

// ---------------------------------------------------------------------------
// Tabelle globali. Upstream sono campi di istanza di `Parser` ri-esportati
// come `jme.precedence`, `jme.opSynonyms`, ... a partire dallo `standardParser`
// (jme.js:4420-4511): le tabelle globali SONO quelle dello standardParser, e
// `getSetting` le consulta come secondo livello per gli altri parser.
// Qui valgono lo stesso: parser.ts fa adottare questi stessi oggetti allo
// `standardParser`.
// ---------------------------------------------------------------------------

// jme.js:1184
/** Gli operatori binari riconosciuti dal tokenizer. */
export const ops: string[] = [
  "not",
  "and",
  "or",
  "xor",
  "nand",
  "nor",
  "implies",
  "isa",
  "except",
  "in",
  "for:",
  "of:",
  "where:",
  "divides",
  "as",
  "..",
  "#",
  "<=",
  ">=",
  "<>",
  "&&",
  "||",
  "|",
  "*",
  "+",
  "-",
  "/",
  "^",
  "<",
  ">",
  "=",
  "!",
  "&",
  "|>",
].concat(Object.keys(unicode.symbols));

// jme.js:1450-1457
/** Alcuni nomi indicano un'operazione diversa quando sono usati come prefisso. */
export const prefixForm: Record<string, string> = {
  "+": "+u",
  "-": "-u",
  "/": "/u",
  "!": "not",
  not: "not",
  sqrt: "sqrt",
};

// jme.js:1464-1466
/** Alcuni nomi indicano un'operazione diversa quando sono usati come suffisso. */
export const postfixForm: Record<string, string> = {
  "!": "fact",
};

// jme.js:1473-1481
/** Arità delle operazioni; il default per tutte le altre è 2. */
export const arity: Record<string, number> = {
  "!": 1,
  not: 1,
  fact: 1,
  "+u": 1,
  "-u": 1,
  "/u": 1,
  sqrt: 1,
};

// jme.js:1488-1523
/** Precedenza degli operatori: valore più basso = valutato per primo. */
export const precedence: Record<string, number> = {
  ";": 0,
  fact: 1,
  not: 1,
  sqrt: 1,
  "+u": 2.5,
  "-u": 2.5,
  "/u": 2.5,
  "^": 2,
  "*": 3,
  "/": 3,
  "+": 4,
  "-": 4,
  "|": 5,
  "..": 5,
  "#": 6,
  except: 6.5,
  in: 6.5,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  "<>": 8,
  "=": 8,
  isa: 9,
  and: 11,
  nand: 11,
  or: 12,
  nor: 12,
  xor: 13,
  implies: 14,
  "of:": 48,
  "where:": 49,
  "for:": 50,
  ":": 100,
};

// jme.js:1530-1538
/** Le operazioni che sono relazioni (e quindi si concatenano: `a<b<c`). */
export const relations: Record<string, boolean> = {
  "<": true,
  ">": true,
  "<=": true,
  ">=": true,
  "=": true,
  "<>": true,
  in: true,
};

// jme.js:1545-1554
/** Le operazioni commutative. */
export const commutative: Record<string, boolean> = {
  "*": true,
  "+": true,
  and: true,
  or: true,
  nand: true,
  nor: true,
  "=": true,
  xor: true,
};

// jme.js:1561-1569
/** Le operazioni associative, cioè `(a∘b)∘c = a∘(b∘c)`. Nota: `=` è
 * commutativo ma NON associativo. */
export const associative: Record<string, boolean> = {
  "*": true,
  "+": true,
  and: true,
  or: true,
  nand: true,
  nor: true,
  xor: true,
};

// jme.js:1576-1583
/** Sinonimi dei nomi di funzione. */
export const funcSynonyms: Record<string, string> = {
  sqr: "sqrt",
  gcf: "gcd",
  sgn: "sign",
  len: "abs",
  length: "abs",
  dec: "decimal",
};

// jme.js:1591-1608
/** Sinonimi dei nomi di operatore. */
export const opSynonyms: Record<string, string> = {
  "&": "and",
  "&&": "and",
  divides: "|",
  "||": "or",
  "÷": "/",
  "×": "*",
  "∈": "in",
  "∧": "and",
  "∨": "or",
  "¬": "not",
  "⟹": "implies",
  "≠": "<>",
  "≥": ">=",
  "≤": "<=",
  "ˆ": "^",
  identical: "=",
};

/** Alias di `opSynonyms`, con il nome usato dal brief. */
export const synonyms = opSynonyms;

// jme.js:1615-1621
/** Le operazioni associative a destra. */
export const rightAssociative: Record<string, boolean> = {
  "^": true,
  "+u": true,
  "-u": true,
  "/u": true,
  "for:": true,
};

// jme.js:4395-4400
/** Operazioni binarie che hanno un'equivalente scritta al contrario. */
export const converseOps: Record<string, string> = {
  "<": ">",
  ">": "<",
  "<=": ">=",
  ">=": "<=",
};

// jme.js:1857-1864
/** Dai tag descrittivi di `unicode.letters` alle annotazioni JME. */
export const unicode_annotations: Record<string, string> = {
  FRAKTUR: "frak",
  "BLACK-LETTER": "frak",
  "DOUBLE-STRUCK": "bb",
  MONOSPACE: "tt",
  SCRIPT: "cal",
  BOLD: "bf",
};

// jme.js:1190-1193
/** `[caratteri normali, caratteri in apice]`, nello stesso ordine. */
export const superscript_replacements: [string, string] = [
  Object.values(unicode.superscripts).join(""),
  Object.keys(unicode.superscripts).join(""),
];

// jme.js:1199-1238
/** Le espressioni regolari con cui il tokenizer riconosce i token. */
export function default_re(): Record<string, RegExp> {
  return {
    re_bool: /^(true|false)(?![a-zA-Z_0-9'])/i,
    re_integer: /^\p{Nd}+(?!\.|\p{Nd})/u,
    re_number: /^\p{Nd}+(?:\.\p{Nd}+)?/u,
    re_name: new RegExp(
      "^" +
        "((?:(?:[\\p{Ll}\\p{Lu}\\p{Lo}\\p{Lt}]+):)*)" + // annotazioni
        "(" + // il nome vero e proprio
        "(?:" +
        "\\$?" + // eventuale dollaro iniziale
        "[\\p{Ll}\\p{Lu}\\p{Lo}\\p{Lt}_\\p{Pc}]" + // almeno una lettera o underscore
        "[\\p{Ll}\\p{Lu}\\p{Lo}\\p{Lt}\\p{Nl}\\p{Nd}_\\p{Pc}]*" + // lettere, cifre, underscore
        "[" +
        Object.keys(unicode.subscripts).join("") +
        "]*" + // caratteri in pedice
        "'*" + // apici
        ")" +
        "|" +
        "\\?\\??" + // uno o due punti interrogativi
        "|" +
        "[π∞]" + // simboli speciali usati come nome
        ")",
      "iu",
    ),
    // non riconosce l'intera stringa, solo il delimitatore di apertura: il
    // resto lo trova `parse`, per evitare il backtracking.
    re_string: /^("""|'''|['"])/,
    re_comment: /^\/\/.*?(?:\n|$)/,
    re_keypair: /^:/,
    re_lambda: /^(?:->|→)/u,
    re_subscript_character: new RegExp("[" + Object.keys(unicode.subscripts).join("") + "]+$", "u"),
    re_math_letter: new RegExp("^[" + Object.keys(unicode.letters).join("") + "]", "u"),
    re_strip_whitespace: /^(?:\p{White_Space}|(?:&nbsp;))+/u,
    re_punctuation: /^(?!["'.])([,[\]\p{Ps}\p{Pe}])/u,
  };
}

/** Le regex del tokenizer standard (ricostruite da `make_re`). */
export const re: Record<string, RegExp> = default_re();
/** Quel che `parse` restituisce al ciclo di `tokenise`. */
export interface TokeniserMatch {
  tokens: Token[];
  start: number;
  end: number;
}

/** Un riconoscitore di token: la regex (o il nome di una regex di `re`) e la
 * funzione che costruisce i token corrispondenti. */
export interface TokeniserType {
  re: string | RegExp;
  parse(
    this: Parser,
    result: RegExpMatchArray,
    tokens: Token[],
    expr: string,
    pos: number,
  ): TokeniserMatch | undefined;
}

/** Le tabelle che un tokenizer consulta. */
export interface TokeniserTables {
  ops: string[];
  re: Record<string, RegExp>;
  prefixForm: Record<string, string>;
  postfixForm: Record<string, string>;
  arity: Record<string, number>;
  precedence: Record<string, number>;
  relations: Record<string, boolean>;
  commutative: Record<string, boolean>;
  associative: Record<string, boolean>;
  funcSynonyms: Record<string, string>;
  opSynonyms: Record<string, string>;
  rightAssociative: Record<string, boolean>;
}

/** Le tabelle globali, cioè quelle dello `standardParser` (jme.js:4420-4511). */
export const globalTables: TokeniserTables = {
  ops,
  re,
  prefixForm,
  postfixForm,
  arity,
  precedence,
  relations,
  commutative,
  associative,
  funcSynonyms,
  opSynonyms,
  rightAssociative,
};

// Istantanea delle tabelle com'erano al caricamento del modulo: un nuovo
// `Parser` parte da qui e non dalle tabelle globali, che nel frattempo
// possono aver ricevuto operatori aggiunti allo `standardParser` (upstream i
// campi di classe sono rivalutati a ogni costruzione, quindi partono sempre
// dai letterali di jme.js).
/** Le tabelle come sono definite qui: `new Parser()` parte da queste. */
export const initialTables: TokeniserTables = {
  ops: ops.slice(),
  re: default_re(),
  prefixForm: { ...prefixForm },
  postfixForm: { ...postfixForm },
  arity: { ...arity },
  precedence: { ...precedence },
  relations: { ...relations },
  commutative: { ...commutative },
  associative: { ...associative },
  funcSynonyms: { ...funcSynonyms },
  opSynonyms: { ...opSynonyms },
  rightAssociative: { ...rightAssociative },
};

/**
 * La parte lessicale di `Numbas.jme.Parser` (jme.js:1177-2036).
 */

/** I riconoscitori di token globali, cioè quelli dello `standardParser`.
 * L'array è riempito da parser.ts, che è l'unico a poter costruire i token. */
export const globalTokeniserTypes: TokeniserType[] = [];

/** Quel che `adoptGlobalTables` sa modificare. */
export interface AdoptTarget extends TokeniserTables {
  tokeniser_types: TokeniserType[];
  make_re(): void;
}

/** Fa sì che il parser dato usi le tabelle globali invece delle proprie copie.
 * Upstream lo `standardParser` e il namespace `jme` condividono gli stessi
 * oggetti (jme.js:4420-4511): è così che un operatore aggiunto allo
 * standardParser diventa visibile agli altri parser tramite `getSetting`. */
export function adoptGlobalTables(target: AdoptTarget): void {
  target.ops = globalTables.ops;
  target.re = globalTables.re;
  target.tokeniser_types = globalTokeniserTypes;
  target.prefixForm = globalTables.prefixForm;
  target.postfixForm = globalTables.postfixForm;
  target.arity = globalTables.arity;
  target.precedence = globalTables.precedence;
  target.relations = globalTables.relations;
  target.commutative = globalTables.commutative;
  target.associative = globalTables.associative;
  target.funcSynonyms = globalTables.funcSynonyms;
  target.opSynonyms = globalTables.opSynonyms;
  target.rightAssociative = globalTables.rightAssociative;
  target.make_re();
}
