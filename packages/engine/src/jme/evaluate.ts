/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:214-281 (`substituteTree`, `evaluate`), 595-1159 (spacchettamento,
// coercizione di tipo, predicati sui token, `isDeterministic`/`isRandom`,
// `isMonomial`, `castArgumentsToSignature`), 4807-4823 (i registri di hook),
// 4834-4923 (`findvars`, `findvars_args`).

import * as math from "../math";
import { JmeError } from "./errors";
import {
  TDict,
  TInt,
  TList,
  TMatrix,
  TName,
  TNum,
  TNothing,
  TRange,
  TSet,
  TString,
  TVector,
  TDecimal,
  TRational,
  TBool,
  types,
  type Token,
  type Tree,
} from "./tokens";
import type { SignatureResult, SignatureResultArgument } from "./funcobj";
import { compile } from "./parser";
import { normaliseName } from "./tokenizer";
import { getBuiltinScope, type Scope } from "./scope";
import { mergeUnique } from "./util";
import { texsplit } from "./subvars";

/** Opzioni di `unwrapValue` (jme.js:589-593). */
export interface UnwrapValueOptions {
  /** Ritorna i valori `integer` come `bigint` invece che come `number`. */
  bigInts?: boolean;
}

/** Una descrizione di tipo per `castToType`: il tipo della collezione più,
 * eventualmente, il tipo dei suoi elementi. */
export interface TypeDescription {
  type?: string;
  items?: SignatureResult | Record<string, SignatureResultArgument>;
  all_items?: string | TypeDescription;
  missing?: boolean;
}

// jme.js:4807 — riempiti dai builtin (Task 4) per `let`, `map`, `filter`, ...
/** Comportamento custom di `substituteTree` per funzioni specifiche. */
export const substituteTreeOps: Record<
  string,
  (tree: Tree, scope: Scope, allowUnbound: boolean, unwrapExpressions?: boolean) => void
> = {};

// jme.js:4815
/** Comportamento custom di `findvars` per funzioni che legano nomi. */
export const findvarsOps: Record<string, (tree: Tree, boundvars: string[], scope: Scope) => string[]> = {};

// jme.js:4823
/** Comportamento custom di `isDeterministic` per funzioni specifiche. */
export const isDeterministicOps: Record<string, (tree: Tree, scope: Scope) => boolean> = {};

// jme.js:214-262
/** Sostituisce nell'albero i valori delle variabili definite nello scope. */
export function substituteTree(
  tree: Tree | null | undefined,
  scope: Scope,
  allowUnbound?: boolean,
  unwrapExpressions?: boolean,
): Tree | null {
  if (!tree) {
    return null;
  }
  if (tree.tok.bound) {
    return tree;
  }
  if (tree.args === undefined) {
    if (tree.tok.type === "name") {
      const name = normaliseName(tree.tok.name, scope);
      const v = scope.getVariable(name);
      if (v === undefined) {
        const c = scope.getConstant(name);
        if (c) {
          return { tok: c.value };
        }
        if (allowUnbound) {
          return { tok: new TName(tree.tok.nameWithoutAnnotation, tree.tok.annotation) };
        } else {
          throw new JmeError("jme.substituteTree.undefined variable", { name: name });
        }
      } else {
        // upstream: una variabile può contenere direttamente un albero
        // (`{tok, args}`) invece di un token.
        const asTree = v as unknown as Tree;
        if (asTree.tok) {
          return asTree;
        } else if (unwrapExpressions) {
          return unwrapSubexpression({ tok: v });
        } else {
          return { tok: v };
        }
      }
    } else {
      return tree;
    }
  } else if ((tree.tok.type === "function" || tree.tok.type === "op") && tree.tok.name in substituteTreeOps) {
    const name = tree.tok.name;
    const out: Tree = { tok: tree.tok, args: tree.args.slice() };
    (substituteTreeOps[name] as (t: Tree, s: Scope, a: boolean, u?: boolean) => void)(
      out,
      scope,
      allowUnbound ?? false,
      unwrapExpressions,
    );
    return out;
  } else {
    const out: Tree = { tok: tree.tok, args: tree.args.slice() };
    const args = out.args as Tree[];
    for (let i = 0; i < args.length; i++) {
      // gli argomenti di un nodo esistono sempre: `substituteTree` ritorna
      // `null` solo se l'albero che riceve è nullo.
      args[i] = substituteTree(args[i], scope, allowUnbound, unwrapExpressions) as Tree;
    }
    return out;
  }
}

// jme.js:269-274
/** Valuta un albero (o un'espressione) nello scope dato. Ritorna `null` se
 * l'espressione è vuota, come `Scope.evaluate`. */
export function evaluate(tree: Tree | string, scope: Scope): Token | null {
  if (!scope) {
    throw new JmeError("jme.evaluate.no scope given");
  }
  return scope.evaluate(tree);
}

// jme.js:595-616
/** Spacchetta un token in un valore JavaScript grezzo. */
export function unwrapValue(v: Token, options?: UnwrapValueOptions): unknown {
  switch (v.type) {
    case "list":
      return (v.value ?? []).map((x) => unwrapValue(x, options));
    case "dict": {
      const o: Record<string, unknown> = {};
      Object.keys(v.value ?? {}).forEach((key) => {
        o[key] = unwrapValue((v.value as Record<string, Token>)[key] as Token, options);
      });
      return o;
    }
    case "name":
      return v.name;
    case "integer":
      return options?.bigInts ? v.bigValue : v.value;
    case "expression":
      return v.tree;
    case "nothing":
      return undefined;
    default:
      return (v as { value?: unknown }).value;
  }
}

// jme.js:625-631
/** Se il nodo è un `TExpression`, ne ritorna l'albero, ricorsivamente. */
export function unwrapSubexpression(tree: Tree): Tree {
  if (tree.tok.type === "expression") {
    return unwrapSubexpression(tree.tok.tree as Tree);
  }
  return tree;
}

// jme.js:638-662
/** Marca un token come "sicuro", così `subvars` non lo tocca in valutazione. */
export function makeSafe(t: Token): Token {
  if (!t) {
    return t;
  }
  switch (t.type) {
    case "string": {
      t.safe = true;
      const t2 = new TString(t.value);
      if (t.latex !== undefined) {
        t2.latex = t.latex;
      }
      t2.safe = true;
      return t2;
    }
    case "list":
      return new TList((t.value ?? []).map(makeSafe));
    case "dict": {
      const o: Record<string, Token> = {};
      for (const [k, v] of Object.entries(t.value ?? {})) {
        o[k] = makeSafe(v);
      }
      return new TDict(o);
    }
    default:
      return t;
  }
}

// jme.js:670-723
/** Impacchetta un valore JavaScript grezzo in un token JME.
 *
 * `null` e `undefined` diventano la stringa vuota, non `nothing`: upstream lo
 * segnala come scelta discutibile (`CONTROVERSIAL!`, jme.js:711) ma i builtin
 * ci contano. */
export function wrapValue(v: unknown, typeHint?: string): Token {
  switch (typeof v) {
    case "bigint":
      return new TInt(v);
    case "number":
      return new TNum(v);
    case "string": {
      const s = new TString(v);
      s.safe = true;
      return s;
    }
    case "boolean":
      return new TBool(v);
    default:
      switch (typeHint) {
        case "html":
          return v as Token;
        default:
          if (Array.isArray(v)) {
            // non si può astrarre: alcuni tipi vogliono gli elementi già
            // impacchettati, altri no.
            switch (typeHint) {
              case "matrix":
                return new TMatrix(v as unknown as math.Matrix);
              case "vector":
                return new TVector(v as math.NumbasNumber[]);
              case "range":
                return new TRange(v as unknown as math.Range);
              case "set":
                return new TSet(v.map((x) => wrapValue(x)));
              default:
                return new TList(v.map((x) => wrapValue(x)));
            }
          } else if (v instanceof math.ComplexDecimal) {
            return new TDecimal(v);
          } else if (math.isComplex(v)) {
            return new TNum(v);
          } else if (v instanceof math.Decimal) {
            return new TDecimal(v);
          } else if (v instanceof math.Fraction) {
            return new TRational(v);
          } else if (v === null || v === undefined) {
            return new TString("");
          } else if (
            typeof v === "object" &&
            (typeHint === "dict" || (v as { type?: unknown }).type === undefined)
          ) {
            const o: Record<string, Token> = {};
            Object.keys(v).forEach((key) => {
              o[key] = wrapValue((v as Record<string, unknown>)[key], typeHint);
            });
            return new TDict(o);
          }
          return v as Token;
      }
  }
}

// jme.js:730-741
/** Il token è del tipo dato, o convertibile a quel tipo? */
export function isType(tok: Token | undefined, type: string): boolean {
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

// jme.js:751-801
/** Converte un token nel tipo dato, se possibile. `type` può essere una
 * descrizione con il tipo degli elementi, per liste e dizionari. */
export function castToType(tok: Token, type: string | TypeDescription): Token {
  let typeDescription: TypeDescription = {};
  if (typeof type === "object") {
    typeDescription = type;
    type = typeDescription.type as string;
  }
  let ntok: Token;
  if (tok.type !== type) {
    if (!tok.casts || !tok.casts[type]) {
      throw new JmeError("jme.type.no cast method", { from: tok.type, to: type });
    }
    ntok = (tok.casts[type] as (t: Token) => Token)(tok);
  } else {
    ntok = tok;
  }
  if (type === "dict") {
    const dict = ntok as TDict;
    // upstream (jme.js:766-777): il nuovo `TDict` riceve LO STESSO oggetto
    // `value` del token di partenza, e la conversione degli elementi lo muta.
    // Chi aveva in mano il dizionario originale se lo ritrova con i valori
    // convertiti — è il comportamento su cui contano i builtin che ricevono un
    // dizionario tipizzato via `castArgumentsToSignature`. Il ramo `list` qui
    // sotto invece costruisce un array nuovo, sempre come upstream.
    if (typeDescription.items) {
      ntok = new TDict(dict.value);
      const nvalue = (ntok as TDict).value as Record<string, Token>;
      for (const [k, v] of Object.entries(typeDescription.items as Record<string, SignatureResultArgument>)) {
        nvalue[k] = castToType(nvalue[k] as Token, v as TypeDescription);
      }
    } else if (typeDescription.all_items) {
      ntok = new TDict(dict.value);
      const nvalue = (ntok as TDict).value as Record<string, Token>;
      for (const x of Object.keys(nvalue)) {
        nvalue[x] = castToType(nvalue[x] as Token, typeDescription.all_items as TypeDescription);
      }
    }
  }
  if (type === "list") {
    const list = ntok as TList;
    let nvalue: Token[];
    if (typeDescription.items) {
      const items = typeDescription.items as SignatureResult;
      nvalue = [];
      let j = 0;
      for (let i = 0; i < items.length; i++) {
        if ((items[i] as SignatureResultArgument).missing) {
          nvalue.push(new TNothing());
          continue;
        }
        const item = (list.value as Token[])[j] as Token;
        nvalue.push(castToType(item, items[i] as TypeDescription));
        j += 1;
      }
      ntok = new TList(nvalue);
    } else if (typeDescription.all_items) {
      nvalue = (list.value ?? []).map((item) => castToType(item, typeDescription.all_items as TypeDescription));
      ntok = new TList(nvalue);
    }
  }
  return ntok;
}

// jme.js:809-818
/** Il tipo `a` può essere convertito automaticamente nel tipo `b`? */
export function isTypeCompatible(a: string, b: string | undefined): boolean {
  if (b === undefined) {
    return true;
  }
  if (a === b) {
    return true;
  }
  const ta = types[a];
  return Boolean(ta && ta.prototype && ta.prototype.casts && ta.prototype.casts[b]);
}

// jme.js:825-856 — un solo salto: nessuna ricerca in ampiezza.
/** Un tipo in cui si possono convertire sia `a` sia `b`, se esiste. */
export function findCompatibleType(a: string, b: string): string | undefined {
  const ca = types[a];
  const cb = types[b];
  if (ca === undefined || cb === undefined) {
    return undefined;
  }
  const pa = ca.prototype;
  const pb = cb.prototype;
  if (pa.type === pb.type) {
    return pa.type;
  }
  if (pa.casts) {
    if (pa.casts[pb.type]) {
      return pb.type;
    }
    if (pb.casts) {
      if (pb.casts[pa.type]) {
        return pa.type;
      }
      for (const x of Object.keys(pa.casts)) {
        if (pb.casts[x]) {
          return x;
        }
      }
    }
  } else if (pb.casts) {
    if (pb.casts[pa.type]) {
      return pa.type;
    }
  }
  return undefined;
}

// jme.js:863-865
/** Il token è un numero complesso con parte immaginaria non nulla? */
export function isComplex(tok: Token): boolean {
  return (
    (tok.type === "number" && math.isComplex(tok.value) && tok.value.im !== 0) ||
    (tok.type === "decimal" && !tok.value.isReal())
  );
}

// jme.js:872-884
/** Il token è un numero negativo? */
export function isNegative(tok: Token): boolean {
  if (!isType(tok, "number")) {
    return false;
  }
  if (isComplex(tok)) {
    return false;
  }
  if (tok.type === "decimal") {
    return tok.value.re.isNegative();
  }
  const n = castToType(tok, "number") as TNum;
  return (n.value as number) < 0;
}

// jme.js:891-900
/** Il token è un numero con parte reale non nulla? */
export function hasRealPart(tok: Token): boolean {
  switch (tok.type) {
    case "number":
      return !math.isComplex(tok.value) || tok.value.re !== 0;
    case "decimal":
      return !tok.value.re.isZero();
    default:
      return hasRealPart(castToType(tok, "number"));
  }
}

// jme.js:907-916
/** Il coniugato del token, assumendo che sia un numero. */
export function conjugate(tok: Token): math.NumbasNumber {
  switch (tok.type) {
    case "number":
      return math.conjugate(tok.value);
    case "decimal":
      return tok.value.conjugate().toComplexNumber();
    default:
      return conjugate(castToType(tok, "number"));
  }
}

// jme.js:923-933
/** L'opposto del token, assumendo che sia un numero. */
export function negated(tok: Token): math.NumbasNumber {
  switch (tok.type) {
    case "number":
      return math.negate(tok.value);
    case "decimal":
      return tok.value.negated().toComplexNumber();
    default:
      return negated(castToType(tok, "number"));
  }
}

// jme.js:942-964
/** Il token è l'operatore con il nome dato? */
export function isOp(tok: Token, op: string): boolean {
  return tok.type === "op" && tok.name === op;
}
/** Il token è il nome dato? */
export function isName(tok: Token, name: string): boolean {
  return tok.type === "name" && tok.name === name;
}
/** Il token è la funzione con il nome dato? */
export function isFunction(tok: Token, name: string): boolean {
  return tok.type === "function" && tok.name === name;
}

// jme.js:978-1032
/** L'espressione si comporta in modo deterministico?
 *
 * Non è il contrario di `isRandom`: esiste una terza possibilità "non si sa",
 * per cui entrambe ritornano `false`. */
export function isDeterministic(expr: Tree, scope: Scope): boolean {
  switch (expr.tok.type) {
    case "op":
    case "function": {
      // un'applicazione di funzione è deterministica se la definizione è
      // marcata come non casuale e tutti gli argomenti sono deterministici
      const op = normaliseName(expr.tok.name, scope);
      const custom = isDeterministicOps[op];
      if (custom) {
        return custom(expr, scope);
      }
      const fns = scope.getFunction(op);
      if (!fns || fns.length === 0) {
        return false;
      }
      if (fns.some((fn) => fn.random !== false)) {
        return false;
      }
      const args = expr.args ?? [];
      for (let i = 0; i < args.length; i++) {
        if (op === "safe" && (args[i] as Tree).tok.type === "string") {
          continue;
        }
        if (!isDeterministic(args[i] as Tree, scope)) {
          return false;
        }
      }
      return true;
    }
    case "string": {
      if (expr.tok.safe) {
        return true;
      }
      const bits = math.splitbrackets(expr.tok.value, "{", "}", "(", ")");
      for (let i = 1; i < bits.length; i += 2) {
        let subexpr: Tree | null;
        try {
          subexpr = compile(bits[i] as string);
        } catch {
          continue;
        }
        if (subexpr && !isDeterministic(subexpr, scope)) {
          return false;
        }
      }
      return true;
    }
    case "lambda":
      return isDeterministic(expr.tok.expr as Tree, scope);
    default: {
      if (!expr.args) {
        return true;
      }
      for (let i = 0; i < expr.args.length; i++) {
        if (!isDeterministic(expr.args[i] as Tree, scope)) {
          return false;
        }
      }
      return true;
    }
  }
}

// jme.js:1042-1093 — effetto collaterale voluto: memoizza `fn.random` sulle
// funzioni definite in JME, per non ricorrere all'infinito su una funzione che
// richiama sé stessa.
/** L'espressione può comportarsi in modo casuale? */
export function isRandom(expr: Tree, scope: Scope): boolean {
  switch (expr.tok.type) {
    case "op":
    case "function": {
      const op = normaliseName(expr.tok.name, scope);
      const fns = scope.getFunction(op);
      if (fns) {
        for (let i = 0; i < fns.length; i++) {
          const fn = fns[i];
          if (fn && fn.random === undefined && fn.language === "jme") {
            fn.random = false;
            fn.random = isRandom(fn.tree as Tree, scope);
          }
          if (fn && fn.random) {
            return true;
          }
        }
      }
      const args = expr.args ?? [];
      for (let i = 0; i < args.length; i++) {
        if (isRandom(args[i] as Tree, scope)) {
          return true;
        }
      }
      return false;
    }
    case "string": {
      const bits = math.splitbrackets(expr.tok.value, "{", "}", "(", ")");
      for (let i = 1; i < bits.length; i += 2) {
        let subexpr: Tree | null;
        try {
          subexpr = compile(bits[i] as string);
        } catch {
          continue;
        }
        if (subexpr && isRandom(subexpr, scope)) {
          return true;
        }
      }
      return false;
    }
    case "lambda":
      return isRandom(expr.tok.expr as Tree, scope);
    default: {
      if (!expr.args) {
        return false;
      }
      for (let i = 0; i < expr.args.length; i++) {
        if (isRandom(expr.args[i] as Tree, scope)) {
          return true;
        }
      }
      return false;
    }
  }
}

/** Un monomio, cioè `x^n` o `m*x^n`, scomposto nei suoi pezzi. */
export interface Monomial {
  base: Tree;
  degree: Tree;
  coefficient: Tree;
}

// jme.js:1101-1133
/** Se l'albero è un monomio, ne ritorna base, grado e coefficiente. */
export function isMonomial(tree: Tree): Monomial | false {
  /** Toglie i meno unari in cima all'albero. */
  function unwrapUnaryMinus(t: Tree): Tree {
    while (isOp(t.tok, "-u")) {
      t = (t.args as Tree[])[0] as Tree;
    }
    return t;
  }
  let coefficient: Tree;
  if (isOp(tree.tok, "*")) {
    if (!isType(unwrapUnaryMinus((tree.args as Tree[])[0] as Tree).tok, "number")) {
      return false;
    }
    coefficient = (tree.args as Tree[])[0] as Tree;
    tree = (tree.args as Tree[])[1] as Tree;
  } else if (isOp(tree.tok, "-u")) {
    coefficient = { tok: new TNum(-1) };
    tree = (tree.args as Tree[])[0] as Tree;
  } else {
    coefficient = { tok: new TNum(1) };
  }
  if (tree.tok.type === "name") {
    return { base: tree, degree: { tok: new TInt(1) }, coefficient: coefficient };
  }
  if (
    isOp(tree.tok, "^") &&
    isType(((tree.args as Tree[])[0] as Tree).tok, "name") &&
    isType(unwrapUnaryMinus((tree.args as Tree[])[1] as Tree).tok, "number")
  ) {
    return {
      base: (tree.args as Tree[])[0] as Tree,
      degree: (tree.args as Tree[])[1] as Tree,
      coefficient: coefficient,
    };
  }
  return false;
}

// jme.js:1142-1159
/** Converte gli argomenti nei tipi richiesti da una firma, inserendo
 * `nothing` al posto degli argomenti opzionali mancanti. */
export function castArgumentsToSignature(sig: SignatureResult, args: Token[]): Token[] {
  const castargs: Token[] = [];
  let j = 0;
  for (let i = 0; i < sig.length; i++) {
    if ((sig[i] as SignatureResultArgument).missing) {
      castargs.push(new TNothing());
      continue;
    }
    const arg = args[j] as Token;
    if (sig[i]) {
      castargs.push(castToType(arg, sig[i] as TypeDescription));
    } else {
      castargs.push(arg);
    }
    j += 1;
  }
  return castargs;
}

// jme.js:4834-4910
/** I nomi delle variabili libere usate nell'albero. */
export function findvars(tree: Tree | null | undefined, boundvars?: string[], scope?: Scope): string[] {
  if (!scope) {
    scope = getBuiltinScope();
  }
  if (boundvars === undefined) {
    boundvars = [];
  }
  if (!tree) {
    return [];
  }
  if ((tree.tok.type === "function" || tree.tok.type === "op") && tree.tok.name in findvarsOps) {
    return (findvarsOps[tree.tok.name] as (t: Tree, b: string[], s: Scope) => string[])(tree, boundvars, scope);
  }
  if (tree.args === undefined) {
    switch (tree.tok.type) {
      case "name": {
        const name = normaliseName(tree.tok.name, scope);
        if (!boundvars.includes(name) && !scope.getConstant(name)) {
          return [name];
        }
        return [];
      }
      case "string": {
        if (tree.tok.safe) {
          return [];
        }
        const bits = math.contentsplitbrackets(tree.tok.value);
        let out: string[] = [];
        for (let i = 0; i < bits.length; i += 4) {
          const plain = bits[i] as string;
          const sbits = math.splitbrackets(plain, "{", "}", "(", ")");
          for (let k = 1; k <= sbits.length - 1; k += 2) {
            const tree2 = scope.parser.compile(sbits[k] as string);
            out = mergeUnique(out, findvars(tree2, boundvars, scope));
          }
          if (i <= bits.length - 3) {
            const tex = bits[i + 2] as string;
            const tbits = texsplit(tex);
            for (let j = 0; j < tbits.length; j += 4) {
              const cmd = tbits[j + 1];
              const expr = tbits[j + 3] as string;
              switch (cmd) {
                case "var": {
                  const tree2 = scope.parser.compile(expr);
                  out = mergeUnique(out, findvars(tree2, boundvars, scope));
                  break;
                }
                case "simplify": {
                  const ssbits = math.splitbrackets(expr, "{", "}", "(", ")");
                  for (let k = 1; k < ssbits.length - 1; k += 2) {
                    const tree2 = scope.parser.compile(ssbits[k] as string);
                    out = mergeUnique(out, findvars(tree2, boundvars, scope));
                  }
                  break;
                }
              }
            }
          }
        }
        return out;
      }
      case "lambda": {
        const mapped_boundvars = boundvars.concat(
          (tree.tok.all_names ?? []).map((name) => normaliseName(name, scope as Scope)),
        );
        return findvars(tree.tok.expr as Tree, mapped_boundvars, scope);
      }
      default:
        return [];
    }
  } else {
    const argvars = findvars_args(tree.args, boundvars, scope);
    if (tree.tok.type === "function") {
      const fn_name = normaliseName(tree.tok.name, scope);
      if (!boundvars.includes(fn_name) && scope.getFunction(fn_name).length === 0) {
        argvars.push(fn_name);
      }
    }
    return argvars;
  }
}

// jme.js:4921-4923
/** I nomi delle variabili libere usate in una lista di alberi. */
export function findvars_args(trees: Tree[], boundvars: string[], scope: Scope): string[] {
  return trees.reduce<string[]>((vars, tree) => mergeUnique(vars, findvars(tree, boundvars, scope)), []);
}
