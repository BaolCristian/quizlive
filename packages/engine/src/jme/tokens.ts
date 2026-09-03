/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:3623-4407 — i 24 tipi di token JME, `registerType`, `getNameInfo`.
// Le classi hanno la stessa forma upstream: un campo `type` letterale, un
// campo `value` (dove previsto) e una tabella `casts` sul prototipo. L'ORDINE
// delle chiavi di `casts` decide quale overload vince in
// `Scope.matchFunctionToArguments` (inventario §7.9), quindi le tabelle sono
// oggetti letterali e non `Map`.

import * as math from "../math";
import { JmeError } from "./errors";
import { greek } from "./unicode";
import { copy_tree } from "./util";

// Import usati solo dentro i corpi delle funzioni: il grafo dei moduli è
// circolare come lo era il namespace `Numbas.jme` upstream, ma nessuno di
// questi simboli è letto durante la valutazione dei moduli.
import { compile } from "./parser";
import { unwrapSubexpression, castArgumentsToSignature } from "./evaluate";
import { FuncObj, signature, type Signature } from "./funcobj";
import { Scope } from "./scope";

/** Un albero sintattico JME (jme.js:43-47). `bracketed` è impostato dallo
 * shunting-yard sui nodi che erano fra parentesi nel sorgente. */
export interface Tree {
  tok: Token;
  args?: Tree[];
  bracketed?: boolean;
}

/** Una funzione di coercizione automatica fra tipi di token. */
export type CastFn = (tok: Token) => Token;
/** La tabella `casts` di un tipo: tipo di destinazione → funzione di cast. */
export type Casts = Record<string, CastFn>;

/** I nomi dei tipi di token. `"punc"` non è un tipo registrato: i token di
 * punteggiatura hanno come `type` il carattere stesso (jme.js:4339-4341). */
export type TokenType =
  | "nothing"
  | "number"
  | "integer"
  | "rational"
  | "decimal"
  | "interval"
  | "string"
  | "boolean"
  | "list"
  | "keypair"
  | "dict"
  | "set"
  | "vector"
  | "matrix"
  | "range"
  | "name"
  | "function"
  | "op"
  | "lambda"
  | "punc"
  | "promise"
  | "expression"
  | "scope"
  | "html";

/** Proprietà comuni a tutti i token. Sono dichiarate con `declare` perché
 * upstream non le inizializza mai nel costruttore: esistono solo quando
 * qualcuno le assegna, e i confronti struttrali dei test contano su questo. */
export abstract class TokenBase {
  /** Posizione del token nell'espressione sorgente, impostata dal tokenizer. */
  declare pos?: number | undefined;
  /** Impedisce a `substituteTree` di sostituire questo nodo (variabili legate). */
  declare bound?: boolean;
  /** Tabella dei cast automatici, messa sul prototipo da `registerType`. */
  declare casts?: Casts | undefined;
  /** Arità: quanti argomenti raccogliere dall'output durante lo shunting-yard. */
  declare vars?: number;
}

/** Un token JME. */
export type Token =
  | TNothing
  | TNum
  | TInt
  | TRational
  | TDecimal
  | TInterval
  | TString
  | TBool
  | THTML
  | TList
  | TKeyPair
  | TDict
  | TSet
  | TVector
  | TMatrix
  | TRange
  | TName
  | TFunc
  | TOp
  | TLambda
  | TPunc
  | TPromise
  | TExpression
  | TScope;

/** Costruttore di un token, come lo accettano `funcObj` e `parse_signature`. */
export type TokenConstructor = (new (...args: never[]) => Token) & {
  prototype: { type: string; casts?: Casts | undefined };
};

// jme.js:3631 — `var types = jme.types = {}`.
/** Registro dei tipi di token, per nome. L'ordine di inserimento è quello di
 * registrazione upstream e conta per `mutually_compatible_type`. */
export const types: Record<string, TokenConstructor> = {};

// jme.js:3633-3640
/** Registra un tipo di token, impostandone `type` e `casts` sul prototipo. */
export function registerType(constructor: unknown, name: string, casts?: Casts): void {
  if (types[name]) {
    throw new JmeError("jme.type.type already registered", { type: name });
  }
  const cons = constructor as TokenConstructor;
  types[name] = cons;
  const proto = cons.prototype as { type: string; casts?: Casts | undefined };
  proto.type = name;
  proto.casts = casts;
}

/** Tipizza una tabella di cast scritta per un tipo specifico. Serve solo a non
 * ripetere il narrowing dentro ogni funzione di cast: a runtime è l'oggetto
 * letterale che si passa a `registerType`, con lo stesso ordine di chiavi. */
function castTable<T extends Token>(o: Record<string, (tok: T) => Token>): Casts {
  return o as unknown as Casts;
}

// jme.js:3648-3649
/** Il valore "niente": segnaposto per gli argomenti opzionali mancanti. */
export class TNothing extends TokenBase {
  readonly type = "nothing";
}
registerType(TNothing, "nothing");

// jme.js:3664-3685
/** Numero in virgola mobile (o complesso, nella forma `{re,im,complex:true}`). */
export class TNum extends TokenBase {
  readonly type = "number";
  declare value: math.NumbasNumber;
  /** Il valore con cui il token è stato costruito: se è una stringa evita la
   * perdita di precisione nella conversione a `decimal`. */
  declare originalValue?: string | number | math.Complex | undefined;
  /** `"dp"` o `"sigfig"`: com'è espressa la precisione nota del numero. */
  declare precisionType?: "dp" | "sigfig" | undefined;
  /** Quante cifre di precisione ha il numero. */
  declare precision?: number | undefined;

  constructor(num?: number | string | math.Complex) {
    super();
    if (num === undefined) {
      return;
    }
    this.originalValue = num;
    switch (typeof num) {
      case "object":
        if (math.isComplex(num)) {
          this.value = num;
        } else {
          throw new JmeError("jme.tokenise.number.object not complex");
        }
        break;
      case "number":
        this.value = num;
        break;
      case "string":
        this.value = parseFloat(num);
        break;
    }
    // upstream (jme.js:3684) ripete l'assegnazione dopo lo switch: è questa a
    // vincere, e converte con `parseFloat` anche i number.
    this.value = math.isComplex(num) ? num : parseFloat(num as string);
  }
}

// jme.js:3694-3726
/** Converte un numero (eventualmente complesso) in `ComplexDecimal`, tenendo
 * conto della precisione dichiarata. */
export function number_to_decimal(
  n: math.NumbasNumber,
  precisionType?: "dp" | "sigfig",
  precision?: number,
): math.ComplexDecimal {
  let dp = 15;
  if (precisionType === "dp" && precision !== undefined && isFinite(precision)) {
    dp = precision;
    dp = Math.min(dp, precision);
  }
  let re: string, im: string;

  /** Arrotonda al livello di precisione richiesto. */
  function round(x: number): string {
    switch (precisionType) {
      case "sigfig":
        return x.toPrecision(precision);
      default:
        return x.toFixed(Math.max(0, dp));
    }
  }
  if (math.isComplex(n)) {
    re = round(n.re);
    im = round(n.im);
  } else {
    // upstream: se il valore originale in forma di stringa è conservato, si usa
    // quello per non perdere precisione nel parsing float.
    const original = (n as unknown as { originalValue?: string }).originalValue;
    if (original) {
      return new math.ComplexDecimal(new math.Decimal(original));
    }
    re = round(Number(n));
    im = "0";
  }
  return new math.ComplexDecimal(new math.Decimal(re), new math.Decimal(im));
}

registerType(
  TNum,
  "number",
  castTable<TNum>({
    decimal: (n) => new TDecimal(number_to_decimal(n.value, n.precisionType, n.precision)),
  }),
);

// jme.js:3738-3752 — unico tipo il cui valore è memorizzato come BigInt.
/** Intero esatto. `value` è il numero JS corrispondente, `bigValue` il BigInt. */
export class TInt extends TokenBase {
  readonly type = "integer";
  /** Il valore esatto. */
  declare bigValue: bigint;
  declare originalValue?: string | number | bigint | undefined;

  constructor(num: number | string | bigint) {
    super();
    this.value = num;
    this.originalValue = num;
  }

  get value(): number {
    return Number(this.bigValue);
  }
  set value(num: number | string | bigint) {
    if (!(typeof num === "bigint" || isNaN(num as number))) {
      num = math.ensure_bigint(num);
    }
    this.bigValue = num as bigint;
  }
}
registerType(
  TInt,
  "integer",
  castTable<TInt>({
    rational: (n) => new TRational(new math.Fraction(n.value, 1)),
    number: (n) => {
      const t = new TNum(n.value);
      // upstream (jme.js:3762) scrive `t.originalValue = this.originalValue`,
      // ma `this` in un cast è la tabella `casts`, non il token: il valore era
      // sempre `undefined`. Qui si prende dal token, come dice il commento
      // upstream (vedi DIVERGENCES.md).
      t.originalValue = n.originalValue as string | number | undefined;
      return t;
    },
    // decisione 5 del brief: la conversione intero↔decimal passa da stringa.
    decimal: (n) => new TDecimal(new math.Decimal(String(n.value))),
  }),
);

// jme.js:3771-3773
/** Numero razionale esatto. */
export class TRational extends TokenBase {
  readonly type = "rational";
  value: math.Fraction;
  constructor(value: math.Fraction) {
    super();
    this.value = value;
  }
}
registerType(
  TRational,
  "rational",
  castTable<TRational>({
    decimal: (n) =>
      new TDecimal(new math.Decimal(String(n.value.numerator)).dividedBy(new math.Decimal(String(n.value.denominator)))),
    // upstream: divisione in virgola mobile, quindi NON esatta.
    number: (n) => new TNum(Number(n.value.numerator) / Number(n.value.denominator)),
  }),
);

// jme.js:3793-3798
/** Numero decimale ad alta precisione (decimal.js), eventualmente complesso. */
export class TDecimal extends TokenBase {
  readonly type = "decimal";
  value: math.ComplexDecimal;
  constructor(value: math.ComplexDecimal | math.Decimal) {
    super();
    this.value =
      value instanceof math.Decimal ? new math.ComplexDecimal(value, new math.Decimal(0)) : (value as math.ComplexDecimal);
  }
}

// jme.js:3805-3811
/** Converte un `ComplexDecimal` nel numero JS corrispondente. */
export function decimal_to_number(n: math.ComplexDecimal): math.NumbasNumber {
  if (n.im.isZero()) {
    return n.re.toNumber();
  }
  return { complex: true, re: n.re.toNumber(), im: n.im.toNumber() };
}

registerType(
  TDecimal,
  "decimal",
  castTable<TDecimal>({
    number: (n) => new TNum(decimal_to_number(n.value) as number),
  }),
);

// jme.js:3830-3833
/** Unione di intervalli reali. */
export class TInterval extends TokenBase {
  readonly type = "interval";
  value: math.RealIntervalUnion;
  constructor(value: math.RealIntervalUnion) {
    super();
    this.value = value;
  }
}
registerType(TInterval, "interval");

// jme.js:3848-3850
/** Stringa di testo. */
export class TString extends TokenBase {
  readonly type = "string";
  value: string;
  /** La stringa è codice LaTeX da mostrare com'è in modo matematico. */
  declare latex?: boolean;
  /** La stringa va resa come LaTeX quando è sostituita in testo semplice. */
  declare display_latex?: boolean;
  /** Se vero, `subvars` non viene applicata quando il token è valutato. */
  declare safe?: boolean;
  /** Se vero, la stringa è codice JME e la sostituzione usa la semantica JME. */
  declare subjme?: boolean;
  constructor(s: string) {
    super();
    this.value = s;
  }
}
registerType(TString, "string");

// jme.js:3862-3864
/** Valore booleano. */
export class TBool extends TokenBase {
  readonly type = "boolean";
  value: boolean;
  constructor(b: boolean) {
    super();
    this.value = b;
  }
}
registerType(TBool, "boolean");

// jme.js:3879-3901 — upstream costruisce elementi del DOM; qui il tipo resta
// opaco (decisione 3 del brief): il valore è la sorgente HTML come stringa e
// non si tocca `document`.
/** Frammento di HTML, come stringa opaca. */
export class THTML extends TokenBase {
  readonly type = "html";
  value: string;
  constructor(html: string) {
    super();
    if (typeof html !== "string") {
      throw new JmeError("jme.thtml.not html");
    }
    this.value = html;
  }
  /** Upstream legge l'attributo `data-interactive` dagli elementi del DOM; qui
   * lo si cerca nella sorgente, e in assenza si assume interattivo. */
  isInteractive(): boolean {
    return !/data-interactive\s*=\s*["']false["']/.test(this.value);
  }
}
registerType(THTML, "html");

// jme.js:3913-3925
/** Lista di token. `value` è indefinito finché la lista non è valutata: lo
 * shunting-yard costruisce la lista sapendo solo quanti elementi ha. */
export class TList extends TokenBase {
  readonly type = "list";
  declare value?: Token[];
  declare vars: number;
  constructor(value?: number | Token[]) {
    super();
    switch (typeof value) {
      case "number":
        this.vars = value;
        break;
      case "object":
        this.value = value as Token[];
        this.vars = (value as Token[]).length;
        break;
      default:
        this.vars = 0;
    }
  }
}
registerType(TList, "list");

// jme.js:3936-3942
/** Coppia chiave-valore: nodo intermedio dello shunting-yard per costruire un
 * dizionario o un pattern di corrispondenza. */
export class TKeyPair extends TokenBase {
  readonly type = "keypair";
  key: string;
  declare vars: number;
  /** `"dict"` o `"match"`: com'è stata interpretata dallo shunting-yard. */
  declare pairmode?: "dict" | "match";
  constructor(key: string) {
    super();
    this.key = key;
    this.vars = 1;
  }
}
registerType(TKeyPair, "keypair");

// jme.js:3953-3955
/** Dizionario: mappa stringhe a token. */
export class TDict extends TokenBase {
  readonly type = "dict";
  declare value?: Record<string, Token>;
  constructor(value?: Record<string, Token>) {
    super();
    if (value !== undefined) {
      this.value = value;
    }
  }
}
registerType(TDict, "dict");

// jme.js:3967-3978
/** Insieme: una collezione senza duplicati (il costruttore lo assume). */
export class TSet extends TokenBase {
  readonly type = "set";
  value: Token[];
  constructor(value: Token[]) {
    super();
    this.value = value;
  }
}
registerType(
  TSet,
  "set",
  castTable<TSet>({
    list: (s) => new TList(s.value),
  }),
);

// jme.js:3989-4010
/** Vettore di numeri (eventualmente complessi). */
export class TVector extends TokenBase {
  readonly type = "vector";
  value: math.NumbasNumber[];
  declare precisionType?: "dp" | "sigfig" | undefined;
  declare precision?: number | undefined;
  constructor(value: math.NumbasNumber[]) {
    super();
    if (!(Array.isArray(value) && value.every((e) => typeof e === "number" || math.isComplex(e)))) {
      throw new JmeError("jme.vector.value not an array of numbers");
    }
    this.value = value;
  }
}
registerType(
  TVector,
  "vector",
  castTable<TVector>({
    list: (v) =>
      new TList(
        v.value.map((n) => {
          const t = new TNum(n as number);
          t.precisionType = v.precisionType;
          t.precision = v.precision;
          return t;
        }),
      ),
  }),
);

// jme.js:4021-4052
/** Matrice: array di righe con `rows`/`columns` sull'array esterno. */
export class TMatrix extends TokenBase {
  readonly type = "matrix";
  value: math.Matrix;
  declare precisionType?: "dp" | "sigfig" | undefined;
  declare precision?: number | undefined;
  constructor(value: math.Matrix) {
    super();
    this.value = value;
    if (
      value.rows === undefined ||
      value.columns === undefined ||
      !(
        Array.isArray(value) &&
        value.every((row) => Array.isArray(row) && row.every((n) => typeof n === "number" || math.isComplex(n)))
      )
    ) {
      throw new JmeError("jme.matrix.value not the right type");
    }
    if (value.length !== value.rows) {
      throw new JmeError("jme.matrix.reports bad size");
    }
    if (value.rows > 0 && (value[0] as math.NumbasNumber[]).length !== value.columns) {
      throw new JmeError("jme.matrix.reports bad size");
    }
  }
}
registerType(
  TMatrix,
  "matrix",
  castTable<TMatrix>({
    list: (m) =>
      new TList(
        m.value.map((r) => {
          const t = new TVector(r);
          t.precisionType = m.precisionType;
          t.precision = m.precision;
          return t;
        }),
      ),
  }),
);

// jme.js:4067-4086
/** Intervallo di valori numerici `[inizio, fine, passo]`. */
export class TRange extends TokenBase {
  readonly type = "range";
  declare value?: math.Range;
  declare start?: number;
  declare end?: number;
  declare step?: number;
  declare size?: number;
  constructor(range?: math.Range) {
    super();
    if (range !== undefined) {
      this.value = range;
      this.start = range[0];
      this.end = range[1];
      this.step = range[2];
      this.size = Math.floor((this.end - this.start) / this.step);
    }
  }
}
registerType(
  TRange,
  "range",
  castTable<TRange>({
    list: (r) => new TList(math.rangeToList(r.value as math.Range).map((n) => new TNum(n))),
  }),
);

/** Le proprietà lessicali di un nome di variabile, per la visualizzazione e
 * per `expandJuxtapositions` (jme.js:4088-4098). */
export interface NameInfo {
  /** La parte "lettere" del nome, senza pedici né apici. */
  root: string;
  /** Quante lettere ha la radice: per una lettera greca è 1. */
  letterLength: number;
  isGreek: boolean;
  isLong: boolean;
  subscript: string;
  subscriptGreek: boolean;
  primes: string;
}

// jme.js:4100
/** Riconosce un nome che è una lettera greca. */
export const re_greek = new RegExp("^(?:" + Object.values(greek).join("|") + ")$");

// jme.js:4108-4146
/** Analizza un nome di variabile: radice, pedice, apici, lettera greca. */
export function getNameInfo(name: string): NameInfo {
  const nameInfo: NameInfo = {
    root: name,
    letterLength: name.length,
    isGreek: false,
    isLong: false,
    subscript: "",
    subscriptGreek: false,
    primes: "",
  };
  const re_math_variable =
    /^([^_]*[\p{Ll}\p{Lu}\p{Lo}\p{Lt}])(?:([\p{Nl}\p{Nd}]+)|_([\p{Nl}\p{Nd}]+)|_([^'_]+))?('+)?$/u;

  const m = name.match(re_math_variable);
  if (m) {
    nameInfo.root = m[1] as string;
    nameInfo.letterLength = nameInfo.root.length;
    if (nameInfo.root.match(re_greek)) {
      nameInfo.isGreek = true;
      nameInfo.letterLength = 1;
    }
    nameInfo.subscript = m[2] ?? m[3] ?? m[4] ?? "";
    if (nameInfo.subscript && nameInfo.subscript.match(re_greek)) {
      nameInfo.subscriptGreek = true;
    } else if (
      nameInfo.subscript &&
      !nameInfo.subscript.match(/^[\p{Nl}\p{Nd}]*$/u) &&
      nameInfo.subscript.length > 2
    ) {
      nameInfo.letterLength += nameInfo.subscript.length;
    }
    nameInfo.primes = m[5] ?? "";
  }
  if (!m || nameInfo.letterLength > 1) {
    nameInfo.root = name;
    nameInfo.subscript = "";
    nameInfo.subscriptGreek = false;
    nameInfo.primes = "";
    nameInfo.letterLength = name.length;
  }
  nameInfo.isLong = nameInfo.letterLength > 1 || nameInfo.root.startsWith("_");

  return nameInfo;
}

// jme.js:4161-4171
/** Nome di variabile, con le eventuali annotazioni. */
export class TName extends TokenBase {
  readonly type = "name";
  name: string;
  nameWithoutAnnotation: string;
  value: string;
  declare annotation?: string[] | undefined;
  nameInfo: NameInfo;
  /** Impostato da `Scope.evaluate` sui nomi che non sono legati a un valore. */
  declare unboundName?: boolean;
  /** Impostato dallo shunting-yard sui `?` inseriti da `addMissingArguments`. */
  declare added_missing?: boolean;
  constructor(name: string, annotation?: string[]) {
    super();
    if (annotation !== undefined) {
      this.annotation = annotation;
    }
    this.name = name;
    this.nameWithoutAnnotation = name;
    if (this.annotation && this.annotation.length) {
      this.name = this.annotation.join(":") + ":" + this.name;
    }
    this.value = this.name;
    this.nameInfo = getNameInfo(this.nameWithoutAnnotation);
  }
}
registerType(TName, "name");

// jme.js:4186-4198
/** Applicazione di funzione. `vars` è l'arità, riempita dallo shunting-yard. */
export class TFunc extends TokenBase {
  readonly type = "function";
  name: string;
  nameWithoutAnnotation: string;
  declare annotation?: string[] | undefined;
  nameInfo: NameInfo;
  declare vars: number;
  constructor(name: string, annotation?: string[]) {
    super();
    this.name = name;
    if (annotation !== undefined) {
      this.annotation = annotation;
    }
    this.nameWithoutAnnotation = name;
    if (this.annotation && this.annotation.length) {
      this.name = this.annotation.join(":") + ":" + this.name;
    }
    this.nameInfo = getNameInfo(this.nameWithoutAnnotation);
    this.vars = 0;
  }
}
registerType(TFunc, "function");

// jme.js:4220-4229
/** Operatore unario o binario. */
export class TOp extends TokenBase {
  readonly type = "op";
  name: string;
  postfix: boolean;
  prefix: boolean;
  declare vars: number;
  commutative: boolean;
  associative: boolean;
  negated: boolean;
  constructor(
    op: string,
    postfix?: boolean,
    prefix?: boolean,
    arity?: number,
    commutative?: boolean,
    associative?: boolean,
    negated?: boolean,
  ) {
    super();
    this.name = op;
    this.postfix = postfix || false;
    this.prefix = prefix || false;
    this.vars = arity || 2;
    this.commutative = commutative || false;
    this.associative = associative || false;
    this.negated = negated || false;
  }
}
registerType(TOp, "op");

// jme.js:4236-4329
/** Funzione anonima: `x -> x+1`, `(x,y) -> x*y`, `[a,b] -> a+b`. */
export class TLambda extends TokenBase {
  readonly type = "lambda";
  /** Specifica degli argomenti: ogni voce è un nome o una lista (annidabile). */
  declare names?: Tree[];
  /** Il corpo della funzione. */
  declare expr?: Tree;
  /** Tutti i nomi legati dagli argomenti, appiattiti. */
  declare all_names?: string[];
  /** Il `FuncObj` costruito da `set_expr`, che fa il destructuring e valuta. */
  declare fn?: FuncObj;
  declare vars: number;

  constructor(names?: Tree[], expr?: Tree) {
    super();
    this.vars = 2;
    if (names !== undefined) {
      this.set_names(names);
    }
    if (expr !== undefined) {
      this.set_expr(expr);
    }
  }

  evaluate(args: Token[], scope: Scope): Token {
    return (this.fn as FuncObj).evaluate(args, scope);
  }

  /** Imposta i nomi degli argomenti. */
  set_names(names: Tree[]): void {
    this.names = names;
  }

  /** Costruisce la firma della funzione a partire dai nomi degli argomenti, e
   * riempie `all_names`. */
  make_signature(): Signature[] {
    const all_names: string[] = [];

    /** La firma di un singolo argomento. */
    function make_signature(name: Tree): Signature {
      if (name.tok.type === "name") {
        all_names.push(name.tok.name);
        return signature.anything();
      } else if (name.tok.type === "list") {
        const items = (name.args ?? []).map(make_signature);
        items.push(signature.multiple(signature.anything()));
        return signature.list(...items);
      } else {
        throw new JmeError("jme.typecheck.wrong names for anonymous function", { names_type: name.tok.type });
      }
    }

    const sig = (this.names as Tree[]).map(make_signature);
    this.all_names = all_names;
    return sig;
  }

  /** Imposta il corpo della funzione: i nomi degli argomenti devono essere già
   * stati impostati. */
  set_expr(expr: Tree): void {
    // il `FuncObj` costruito qui chiude su questo token, non su `this` al
    // momento della chiamata
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const lambda = this;
    this.expr = expr;

    const sig = this.make_signature();

    this.fn = new FuncObj("", sig, "?", null, {
      evaluate: function (args, scope) {
        const nscope = new Scope([scope]);
        const matched = (lambda.fn as FuncObj).intype(args as Token[]);
        if (!matched) {
          throw new JmeError("jme.typecheck.wrong arguments for anonymous function");
        }
        const castargs = castArgumentsToSignature(matched, args as Token[]);

        if (castargs.length < args.length) {
          throw new JmeError("jme.typecheck.wrong arguments for anonymous function");
        }

        /** Lega i valori ai nomi degli argomenti, anche annidati in liste. */
        function assign_names(name: Tree, arg: Token): void {
          if (name.tok.type === "name") {
            nscope.setVariable(name.tok.name, arg);
          } else if (name.tok.type === "list") {
            (name.args ?? []).forEach((lname, i) => assign_names(lname, (arg as TList).value?.[i] as Token));
          }
        }
        (lambda.names as Tree[]).forEach((name, i) => assign_names(name, castargs[i] as Token));

        // il corpo della lambda è un albero, quindi la valutazione non è nulla
        return nscope.evaluate(copy_tree(lambda.expr as Tree)) as Token;
      },
    });
  }
}
registerType(TLambda, "lambda");

/** I caratteri di punteggiatura prodotti dal tokenizer. Il tokenizer può in
 * teoria produrre altre parentesi Unicode non normalizzate (`re_punctuation`
 * accetta ogni `\p{Ps}`/`\p{Pe}`); sono tipizzate qui perché `type` resti un
 * discriminante letterale per l'unione `Token`. */
export type PuncType = "(" | ")" | "[" | "]" | "{" | "}" | ",";

// jme.js:4339-4341 — NON registrato con `registerType`: è un token puramente
// sintattico, consumato durante lo shunting-yard.
/** Token di punteggiatura: il suo `type` è il carattere stesso. */
export class TPunc extends TokenBase {
  readonly type: PuncType;
  constructor(kind: string) {
    super();
    this.type = kind as PuncType;
  }
}

// jme.js:4351-4354
/** Una Promise JS, come token: supporto alle funzioni asincrone. */
export class TPromise extends TokenBase {
  readonly type = "promise";
  promise: Promise<unknown>;
  constructor(promise: Promise<unknown>) {
    super();
    this.promise = promise;
  }
}
registerType(TPromise, "promise");

// jme.js:4364-4373
/** Una espressione JME, come token. */
export class TExpression extends TokenBase {
  readonly type = "expression";
  declare tree: Tree | null;
  constructor(tree: string | Tree | null) {
    super();
    let t: Tree | null = typeof tree === "string" ? compile(tree) : tree;
    if (t) {
      t = unwrapSubexpression(t);
    }
    this.tree = t;
  }
}
registerType(TExpression, "expression");

// jme.js:4384-4387
/** Uno scope di valutazione, come token. */
export class TScope extends TokenBase {
  readonly type = "scope";
  scope: Scope;
  constructor(scope: Scope) {
    super();
    this.scope = scope;
  }
}
registerType(TScope, "scope");
