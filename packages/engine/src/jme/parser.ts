/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:1177-2466 — la classe `Parser`: i riconoscitori di token
// (1245-1443), i metodi di normalizzazione e `tokenise` (1782-2036), e i
// metodi dello shunting-yard, che delegano alle funzioni libere di shunt.ts
// (2038-2441). Più i wrapper del namespace (115-183, 282-326) e lo
// `standardParser` (4408-4409).
//
// Le tabelle di operatori stanno in tokenizer.ts, che è una foglia del grafo
// dei moduli: `new Parser()` gira a livello di modulo e deve poterle leggere
// qualunque sia il punto di ingresso (vedi il commento in testa a
// tokenizer.ts).

import * as math from "../math";
import { JmeError } from "./errors";
import { TBool, TInt, TKeyPair, TLambda, TName, TNum, TOp, TPunc, TString, type Token, type Tree } from "./tokens";
import * as unicode from "./unicode";
import { mergeUnique, unescape } from "./util";
import {
  adoptGlobalTables,
  default_re,
  globalTables,
  globalTokeniserTypes,
  initialTables,
  normaliseName,
  superscript_replacements,
  unicode_annotations,
  type OperatorOptions,
  type TokeniserTables,
  type TokeniserType,
  type TokeniserOptions,
} from "./tokenizer";
import * as shuntyard from "./shunt";
import type { OutputEntry } from "./shunt";

// jme.js:1245-1443 — l'ordine conta: `re_integer` prima di `re_number` perché
// un intero non deve essere riconosciuto come float, e la moltiplicazione
// implicita è cablata dentro ogni `parse` (numeri, nomi, parentesi aperte),
// non è una fase separata.
/** I riconoscitori di token, nell'ordine in cui vengono provati. */
export function default_tokeniser_types(): TokeniserType[] {
  return [
    {
      re: "re_strip_whitespace",
      parse(result, _tokens, _expr, pos) {
        return { tokens: [], start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_comment",
      parse(result, _tokens, _expr, pos) {
        return { tokens: [], start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_integer",
      parse(result, tokens, _expr, pos) {
        const literal = this.normaliseNumber(result[0] as string);
        const token = new TInt(literal);
        const new_tokens: Token[] = [token];
        if (tokens.length > 0) {
          const prev = tokens[tokens.length - 1] as Token;
          // parentesi chiusa, nome o operatore postfisso seguiti da un numero:
          // moltiplicazione implicita.
          if (is_type(prev, ")") || is_type(prev, "name") || (prev.type === "op" && prev.postfix)) {
            new_tokens.splice(0, 0, this.op("*"));
          }
        }
        return { tokens: new_tokens, start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_number",
      parse(result, tokens, _expr, pos) {
        const literal = this.normaliseNumber(result[0] as string);
        const token = new TNum(literal);
        token.precisionType = "dp";
        token.precision = math.countDP(literal);
        const new_tokens: Token[] = [token];
        if (tokens.length > 0) {
          const prev = tokens[tokens.length - 1] as Token;
          if (is_type(prev, ")") || is_type(prev, "name") || (prev.type === "op" && prev.postfix)) {
            new_tokens.splice(0, 0, this.op("*"));
          }
        }
        return { tokens: new_tokens, start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_bool",
      parse(result, _tokens, _expr, pos) {
        const token = new TBool(math.parseBool(result[0]));
        return { tokens: [token], start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_lambda",
      parse(result, _tokens, _expr, pos) {
        const token = new TLambda();
        return { tokens: [token], start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_op",
      parse(result, tokens, _expr, pos) {
        const matched_name = result[0] as string;
        let name = this.normaliseOp(matched_name);
        const m = name.match(/^not (\w+)$/);
        let negated = false;
        if (m) {
          name = m[1] as string;
          negated = true;
        }
        let postfix = false;
        let prefix = false;
        name = this.opSynonym(name);
        const nt = tokens.length ? (tokens[tokens.length - 1] as Token) : undefined;
        if (
          tokens.length === 0 ||
          this.is_opening_bracket(nt as Token) ||
          (nt as Token).type === "," ||
          (nt as Token).type === "lambda" ||
          ((nt as Token).type === "op" && !(nt as TOp).postfix) ||
          (nt as Token).type === "keypair"
        ) {
          const pf = this.getPrefixForm(name);
          if (pf !== undefined) {
            name = pf;
            prefix = true;
          }
        } else {
          const pf = this.getPostfixForm(name);
          if (pf !== undefined) {
            name = pf;
            postfix = true;
          }
        }
        const token = this.op(name, postfix, prefix, negated);
        return { tokens: [token], start: pos, end: pos + matched_name.length };
      },
    },
    {
      re: "re_name",
      parse(result, tokens, _expr, pos) {
        const { name, annotations } = this.normaliseName(result[2] as string);
        const prefix_annotation = result[1] ? (result[1] as string).split(":").slice(0, -1) : null;
        const annotation =
          prefix_annotation === null
            ? annotations.length
              ? annotations
              : null
            : prefix_annotation.concat(annotations);
        const token = annotation ? new TName(name, annotation) : new TName(name);
        const new_tokens: Token[] = [token];
        if (tokens.length > 0) {
          const prev = tokens[tokens.length - 1] as Token;
          // numero, parentesi chiusa, nome od operatore postfisso seguiti da un
          // nome (es. `3y`): moltiplicazione implicita.
          if (
            is_type(prev, "number") ||
            is_type(prev, "name") ||
            is_type(prev, ")") ||
            (prev.type === "op" && prev.postfix)
          ) {
            new_tokens.splice(0, 0, this.op("*"));
          }
        }
        return { tokens: new_tokens, start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_string",
      parse(result, _tokens, expr, pos) {
        const delimiter = result[0] as string;
        let i = pos + delimiter.length;

        /** La posizione della prima `s` in `str`, o `Infinity` se non c'è. */
        function next(s: string, str: string): number {
          const index = str.indexOf(s);
          return index < 0 ? Infinity : index;
        }

        while (i < expr.length) {
          i = i + Math.min(next("\\", expr.slice(i)), next(delimiter, expr.slice(i)));
          if (i === Infinity) {
            break;
          }
          if (expr[i] === "\\") {
            i += 2;
            continue;
          }
          if (expr.slice(i, i + delimiter.length) === delimiter) {
            break;
          }
          i += 1;
        }

        if (i >= expr.length) {
          return undefined; // nessuna corrispondenza
        }

        const str = expr.slice(pos + delimiter.length, i);
        const token = new TString(unescape(str));
        return { tokens: [token], start: pos, end: i + delimiter.length };
      },
    },
    {
      re: "re_superscript",
      parse(result, _tokens, _expr, pos) {
        const normals = superscript_replacements[0];
        const supers = superscript_replacements[1];
        const n = (result[0] as string).replace(/./g, (d) => normals[supers.indexOf(d)] as string);
        const otokens = this.tokenise(n);
        return {
          tokens: ([this.op("^"), new TPunc("(")] as Token[]).concat(otokens).concat([new TPunc(")")]),
          start: pos,
          end: pos + (result[0] as string).length,
        };
      },
    },
    {
      re: "re_punctuation",
      parse(result, tokens, _expr, pos) {
        const c = this.normalisePunctuation(result[0] as string);
        const new_tokens: Token[] = [new TPunc(c)];
        if (c === "(" && tokens.length > 0) {
          const prev = tokens[tokens.length - 1] as Token;
          // numero, parentesi chiusa od operatore postfisso seguiti da una
          // parentesi aperta: moltiplicazione implicita.
          if (is_type(prev, "number") || is_type(prev, ")") || (prev.type === "op" && prev.postfix)) {
            new_tokens.splice(0, 0, this.op("*"));
          }
        }
        return { tokens: new_tokens, start: pos, end: pos + (result[0] as string).length };
      },
    },
    {
      re: "re_keypair",
      parse(result, tokens, _expr, pos) {
        const prev = tokens.length ? (tokens[tokens.length - 1] as Token) : undefined;
        if (tokens.length === 0 || !(prev?.type === "string" || prev?.type === "name")) {
          throw new JmeError("jme.tokenise.keypair key not a string", { type: String(prev?.type) });
        }
        const token = new TKeyPair((tokens.pop() as TString | TName).value);
        return { tokens: [token], start: pos, end: pos + (result[0] as string).length };
      },
    },
  ];
}

// Copia locale di `jme.isType` (jme.js:730-741): il tokenizer la usa per la
// moltiplicazione implicita. Vive qui e non in evaluate.ts perché serve prima
// che il resto del motore sia caricato, ed è la sola forma "solo tipo".
/** Il token è del tipo dato, o convertibile a quel tipo? */
function is_type(tok: Token | undefined, type: string): boolean {
  if (!tok) {
    return false;
  }
  if (tok.type === type) {
    return true;
  }
  if (tok.casts) {
    return tok.casts[type] !== undefined;
  }
  return false;
}

export class Parser implements TokeniserTables {
  /** Le opzioni del parser. */
  options: Required<TokeniserOptions>;
  ops: string[];
  superscript_replacements: [string, string];
  re: Record<string, RegExp>;
  tokeniser_types: TokeniserType[];
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
  unicode_annotations: Record<string, string>;

  // Stato dello shunting-yard, valorizzato da `shunt()`.
  /** I token dell'espressione in corso di analisi. */
  declare tokens: Token[];
  /** La lista di output dello shunting-yard. */
  declare output: OutputEntry[];
  /** Lo stack degli operatori. */
  declare stack: Token[];
  /** Quanti argomenti sono stati visti a ogni livello di parentesi. */
  declare numvars: number[];
  /** Se ogni `[` aperta introduce una lista nuova o un accesso per indice. */
  declare listmode: Array<"new" | "index">;
  /** L'indice del token in esame. */
  declare i: number;

  // jme.js:1623-1635
  constructor(options?: TokeniserOptions) {
    this.options = { closeMissingBrackets: false, addMissingArguments: false, ...(options ?? {}) };
    // upstream ogni `Parser` ha una copia propria di tutte le tabelle (sono
    // campi di classe, rivalutati per ogni istanza).
    this.ops = initialTables.ops.slice();
    this.superscript_replacements = [superscript_replacements[0], superscript_replacements[1]];
    this.re = default_re();
    this.tokeniser_types = default_tokeniser_types();
    this.prefixForm = { ...initialTables.prefixForm };
    this.postfixForm = { ...initialTables.postfixForm };
    this.arity = { ...initialTables.arity };
    this.precedence = { ...initialTables.precedence };
    this.relations = { ...initialTables.relations };
    this.commutative = { ...initialTables.commutative };
    this.associative = { ...initialTables.associative };
    this.funcSynonyms = { ...initialTables.funcSynonyms };
    this.opSynonyms = { ...initialTables.opSynonyms };
    this.rightAssociative = { ...initialTables.rightAssociative };
    this.unicode_annotations = { ...unicode_annotations };
    this.make_re();
  }

  // jme.js:1644-1652 — due livelli: prima le tabelle di questo parser, poi
  // quelle globali.
  /** Il valore di `name` nella tabella `setting`, o `undefined`. */
  getSetting<K extends keyof TokeniserTables>(setting: K, name: string): unknown {
    const local = this[setting] as unknown as Record<string, unknown> | undefined;
    if (local && name in local) {
      return local[name];
    }
    const global = globalTables[setting] as unknown as Record<string, unknown> | undefined;
    if (global && name in global) {
      return global[name];
    }
    return undefined;
  }

  // jme.js:1668-1670
  /** La forma prefissa dell'operatore, se c'è. */
  getPrefixForm(name: string): string | undefined {
    return this.getSetting("prefixForm", name) as string | undefined;
  }

  // jme.js:1677-1679
  /** La forma suffissa dell'operatore, se c'è. */
  getPostfixForm(name: string): string | undefined {
    return this.getSetting("postfixForm", name) as string | undefined;
  }

  // jme.js:1686-1688
  /** L'arità dell'operatore: 2 se non è dichiarata. */
  getArity(name: string): number {
    return (this.getSetting("arity", name) as number | undefined) || 2;
  }

  // jme.js:1695-1697
  /** La precedenza dell'operatore. */
  getPrecedence(name: string): number {
    return this.getSetting("precedence", name) as number;
  }

  // jme.js:1704-1706
  /** L'operatore è una relazione? */
  isRelation(name: string): boolean {
    return (this.getSetting("relations", name) as boolean | undefined) || false;
  }

  // jme.js:1713-1715
  /** L'operatore è commutativo? */
  isCommutative(name: string): boolean {
    return (this.getSetting("commutative", name) as boolean | undefined) || false;
  }

  // jme.js:1722-1724
  /** L'operatore è associativo? */
  isAssociative(name: string): boolean {
    return (this.getSetting("associative", name) as boolean | undefined) || false;
  }

  // jme.js:1731-1733
  /** L'operatore è associativo a destra? */
  isRightAssociative(name: string): boolean {
    return (this.getSetting("rightAssociative", name) as boolean | undefined) || false;
  }

  // jme.js:1741-1743
  /** Il sinonimo del nome di funzione, o il nome stesso. */
  funcSynonym(name: string): string {
    return (this.getSetting("funcSynonyms", name) as string | undefined) || name;
  }

  // jme.js:1751-1753
  /** Il sinonimo del nome di operatore, o il nome stesso. */
  opSynonym(name: string): string {
    return (this.getSetting("opSynonyms", name) as string | undefined) || name;
  }

  // jme.js:1760-1780
  /** Imposta le proprietà di un operatore. */
  setOperatorProperties(name: string, options?: OperatorOptions): void {
    if (!options) {
      return;
    }
    if ("precedence" in options && options.precedence !== undefined) {
      this.precedence[name] = options.precedence;
    }
    if ("synonyms" in options && options.synonyms) {
      options.synonyms.forEach((synonym) => {
        // upstream usa `this.opSynonym(synonym) === undefined`, che non è mai
        // vero (`opSynonym` ritorna il nome stesso quando non trova nulla):
        // portato con lo stesso effetto, cioè nessun sinonimo aggiunto se il
        // nome è già un sinonimo noto.
        if (this.opSynonyms[synonym] === undefined) {
          this.opSynonyms[synonym] = name;
        }
      });
    }
    if (options.rightAssociative) {
      this.rightAssociative[name] = true;
    }
    if (options.commutative) {
      this.commutative[name] = true;
    }
  }

  // jme.js:1782-1784
  /** Aggiunge un riconoscitore di token in testa alla catena (quindi con
   * priorità più alta di quelli standard). */
  addTokenType(re: string | RegExp, parse: TokeniserType["parse"]): void {
    this.tokeniser_types.splice(0, 0, { re, parse });
  }

  // jme.js:1793-1799
  /** Aggiunge un operatore al parser. */
  addOperator(name: string): void {
    if (this.ops.includes(name)) {
      return;
    }
    this.ops.push(name);
    this.make_re();
  }

  // jme.js:1806-1809
  /** Aggiunge un operatore binario. */
  addBinaryOperator(name: string, options?: OperatorOptions): void {
    this.addOperator(name);
    this.setOperatorProperties(name, options);
  }

  // jme.js:1817-1823
  /** Aggiunge un operatore prefisso; `alt` è il nome con cui viene
   * interpretato (es. `!` → `not`). */
  addPrefixOperator(name: string, alt?: string, options?: OperatorOptions): void {
    this.addOperator(name);
    alt = alt || name;
    this.prefixForm[name] = alt;
    this.arity[alt] = 1;
    this.setOperatorProperties(alt, options);
  }

  // jme.js:1831-1837
  /** Aggiunge un operatore suffisso. */
  addPostfixOperator(name: string, alt?: string, options?: OperatorOptions): void {
    this.addOperator(name);
    alt = alt || name;
    this.postfixForm[name] = alt;
    this.arity[alt] = 1;
    this.setOperatorProperties(alt, options);
  }

  // jme.js:1847-1853
  /** Costruisce un token operatore con arità, commutatività e associatività
   * risolte dalle tabelle. */
  op(name: string, postfix?: boolean, prefix?: boolean, negated?: boolean): TOp {
    const a = this.getArity(name);
    const isCommutative = a > 1 && this.isCommutative(name);
    const isAssociative = a > 1 && this.isAssociative(name);
    return new TOp(name, postfix, prefix, a, isCommutative, isAssociative, negated);
  }

  // jme.js:1873-1903 — normalizzazione LESSICALE del nome: lettere matematiche
  // Unicode, greco, pedici. Da non confondere con `normaliseName` a livello di
  // modulo, che è il case folding dipendente dallo scope.
  /** Normalizza un nome, restituendo il nome ASCII e le annotazioni di stile. */
  normaliseName(name: string): { name: string; annotations: string[] } {
    let annotations: string[] = [];

    if (name.match(/^[a-zA-Z0-9_']*$/)) {
      return { name, annotations };
    }

    name = name.replace(/\p{Pc}/gu, (c) => c.normalize("NFKD"));

    let math_prefix = "";
    let m = name.match(this.re.re_math_letter as RegExp);
    while (m) {
      const letter = m[0];
      const [c, anns] = unicode.letters[letter] as [string, string[]];
      name = name.slice(letter.length);
      annotations = mergeUnique(annotations, anns);
      math_prefix += c;
      m = name.match(this.re.re_math_letter as RegExp);
    }
    annotations = annotations
      .map((a) => this.unicode_annotations[a])
      .filter((a): a is string => a !== undefined);
    name = math_prefix + name;

    for (const [k, v] of Object.entries(unicode.greek)) {
      name = name.replaceAll(k, v);
    }

    name = name.replace(this.re.re_subscript_character as RegExp, (matched) =>
      (name.match(/_/) ? "" : "_") +
      matched
        .split("")
        .map((c) => unicode.subscripts[c])
        .join(""),
    );

    return { name, annotations };
  }

  // jme.js:1910-1912
  /** Normalizza un letterale numerico con la forma Unicode NFKD. */
  normaliseNumber(literal: string): string {
    return literal.normalize("NFKD");
  }

  // jme.js:1919-1925
  /** Normalizza un carattere di punteggiatura, riportando le parentesi Unicode
   * alternative a quelle ASCII. */
  normalisePunctuation(c: string): string {
    c = c.normalize("NFKD");
    const b = unicode.brackets[c];
    if (b) {
      c = b[0];
    }
    return c;
  }

  // jme.js:1932-1938
  /** Normalizza un nome o simbolo di operatore. */
  normaliseOp(op: string): string {
    op = op.replace(/\p{Pd}/gu, "-");
    const s = unicode.symbols[op];
    if (s) {
      op = s[0];
    }
    return normaliseName(op, this.options as unknown as { caseSensitive?: boolean });
  }

  // jme.js:1945-1947
  /** Il token è una parentesi aperta (`(`, `[`, ...)? */
  is_opening_bracket(tok: Token | undefined): boolean {
    return tok !== undefined && /^\p{Ps}$/u.test(tok.type);
  }

  // jme.js:1954-1956
  /** Il token è una parentesi chiusa? */
  is_closing_bracket(tok: Token | undefined): boolean {
    return tok !== undefined && /^\p{Pe}$/u.test(tok.type);
  }

  // jme.js:1963-1991
  /** Ricostruisce `re_op` e `re_superscript` a partire da `ops`. */
  make_re(): void {
    /** Ordina i simboli per lunghezza decrescente (così `<=` vince su `<`) e
     * protegge i caratteri speciali delle regex. */
    function clean_ops(list: string[]): string[] {
      return list
        .slice()
        .sort()
        .reverse()
        .map((op) => op.replace(/[.?*+^$[\]\\(){}|]/g, "\\$&"));
    }
    const word_ops = clean_ops(this.ops.filter((o) => o.match(/[a-zA-Z0-9_']$/)));
    const other_ops = clean_ops(this.ops.filter((o) => !o.match(/[a-zA-Z0-9_']$/)));
    const any_op_bits: string[] = [];
    if (word_ops.length) {
      any_op_bits.push("(?:" + word_ops.join("|") + ")(?![a-zA-Z0-9_'])");
    }
    if (other_ops.length) {
      any_op_bits.push("(?:" + other_ops.join("|") + ")");
    }
    this.re.re_op = new RegExp("^(?:" + any_op_bits.join("|") + "|\\p{Pd})", "iu");
    this.re.re_superscript = new RegExp("^[" + this.superscript_replacements[1] + "]+", "u");
  }

  // jme.js:1999-2032
  /** Trasforma un'espressione nella lista dei suoi token, inserendo i simboli
   * di moltiplicazione impliciti. */
  tokenise(expr: string): Token[] {
    if (!expr) {
      return [];
    }
    expr = String(expr);
    let pos = 0;
    const tokens: Token[] = [];
    while (pos < expr.length) {
      let got = false;
      for (let i = 0; i < this.tokeniser_types.length; i++) {
        const tt = this.tokeniser_types[i] as TokeniserType;
        const regex = tt.re instanceof RegExp ? tt.re : (this.re[tt.re] as RegExp);
        const m = expr.slice(pos).match(regex);
        if (m) {
          const result = tt.parse.call(this, m, tokens, expr, pos);
          if (!result) {
            continue;
          }
          result.tokens.forEach((t) => {
            t.pos = result.start;
          });
          pos = result.end;
          tokens.push(...result.tokens);
          got = true;
          break;
        }
      }
      if (!got && pos < expr.length) {
        const nearby = expr.slice(Math.max(0, pos), pos + 5);
        throw new JmeError("jme.tokenise.invalid near", { expression: expr, position: pos, nearby: nearby });
      }
    }
    return tokens;
  }

  // jme.js:2038-2441 — lo shunting-yard vero e proprio sta in shunt.ts.
  /** Comportamento comune a tutte le parentesi aperte. */
  shunt_open_bracket(tok: Token): void {
    shuntyard.shunt_open_bracket(this, tok);
  }
  /** Comportamento comune a tutte le parentesi chiuse. */
  shunt_close_bracket(opener: string, tok: Token): number {
    return shuntyard.shunt_close_bracket(this, opener, tok);
  }
  /** I gestori dello shunting-yard, per tipo di token. */
  get shunt_type_actions(): Record<string, (p: Parser, tok: Token) => void> {
    return shuntyard.shunt_type_actions;
  }
  /** Mette un token nell'output, raccogliendone gli argomenti. */
  addoutput(tok: Token): void {
    shuntyard.addoutput(this, tok);
  }
  /** Aggiunge un albero in coda all'output. */
  push_output(tree: Tree): void {
    shuntyard.push_output(this, tree);
  }
  /** Toglie l'ultimo albero dall'output. */
  pop_output(): Tree {
    return shuntyard.pop_output(this);
  }
  /** Mette un token sullo stack. */
  addstack(tok: Token): void {
    shuntyard.addstack(this, tok);
  }
  /** Toglie un token dallo stack. */
  popstack(): Token {
    return shuntyard.popstack(this);
  }
  /** Trasforma una lista di token in un albero sintattico. */
  shunt(tokens: Token[]): Tree {
    return shuntyard.shunt(this, tokens);
  }

  // jme.js:2451-2465
  /** Compila un'espressione in un albero sintattico: `tokenise` più `shunt`.
   * Una stringa vuota dà `null`. */
  compile(expr: string): Tree | null {
    expr = String(expr);
    if (!expr.trim().length) {
      return null;
    }
    const tokens = this.tokenise(expr);
    return this.shunt(tokens);
  }
}

// I riconoscitori globali sono quelli di default: `adoptGlobalTables` li fa
// condividere allo `standardParser`, così `addTokenType` su quest'ultimo li
// aggiunge anche per gli altri.
globalTokeniserTypes.push(...default_tokeniser_types());

// jme.js:4408-4409
/** Il parser usato da tutte le funzioni libere di questo modulo. */
export const standardParser = new Parser();
// Le tabelle dello standardParser sono le tabelle globali (jme.js:4420-4511):
// così un operatore aggiunto qui è visto anche dagli altri parser tramite
// `getSetting`, e dal `tokenise` libero di tokenizer.ts.
adoptGlobalTables(standardParser);
standardParser.addBinaryOperator(";", { precedence: 0 });

// jme.js:164-173
/** Spezza un'espressione nei suoi token, con il parser standard.
 *
 * `options` è accettato per simmetria con `Parser`, ma non ha effetto: sia
 * `closeMissingBrackets` sia `addMissingArguments` sono lette solo dallo
 * shunting-yard. */
export function tokenise(expr: string, _options?: TokeniserOptions): Token[] {
  return standardParser.tokenise(expr);
}

// jme.js:115-117
/** Compila un'espressione con il parser standard. */
export function compile(expr: string): Tree | null {
  return standardParser.compile(expr);
}

// jme.js:174-176
/** Trasforma una lista di token in un albero, con il parser standard. */
export function shunt(tokens: Token[]): Tree {
  return standardParser.shunt(tokens);
}

// jme.js:133-155
/** Aggiunge un operatore binario al parser standard. */
export function addBinaryOperator(name: string, options?: OperatorOptions): void {
  standardParser.addBinaryOperator(name, options);
}
/** Aggiunge un operatore prefisso al parser standard. */
export function addPrefixOperator(name: string, alt?: string, options?: OperatorOptions): void {
  standardParser.addPrefixOperator(name, alt, options);
}
/** Aggiunge un operatore suffisso al parser standard. */
export function addPostfixOperator(name: string, alt?: string, options?: OperatorOptions): void {
  standardParser.addPostfixOperator(name, alt, options);
}

// jme.js:282-326
/** Compila una lista di espressioni separate da virgole di primo livello.
 *
 * Upstream ritorna `null` per una stringa vuota; qui ritorna una lista vuota,
 * perché il tipo di ritorno è `Tree[]` (vedi DIVERGENCES.md). */
export function compileList(expr: string): Tree[] {
  expr = String(expr);
  if (!expr.trim().length) {
    return [];
  }
  const tokens = standardParser.tokenise(expr);
  const bits: Token[][] = [];
  const brackets: Token[] = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    switch ((tokens[i] as Token).type) {
      case "(":
      case "[":
        brackets.push(tokens[i] as Token);
        break;
      case ")":
        if (!brackets.length || (brackets.pop() as Token).type !== "(") {
          throw new JmeError("jme.compile list.mismatched bracket");
        }
        break;
      case "]":
        if (!brackets.length || (brackets.pop() as Token).type !== "[") {
          throw new JmeError("jme.compile list.mismatched bracket");
        }
        break;
      case ",":
        if (brackets.length === 0) {
          bits.push(tokens.slice(start, i));
          start = i + 1;
        }
        break;
    }
  }
  if (brackets.length) {
    throw new JmeError("jme.compile list.missing right bracket");
  }
  bits.push(tokens.slice(start));
  return bits.map((b) => standardParser.shunt(b));
}

