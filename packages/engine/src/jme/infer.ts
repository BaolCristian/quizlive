/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:5280-5608 (inferenza di tipo: `inferVariableTypes`,
// `enumerate_signatures`, `mutually_compatible_type`,
// `find_valid_assignments`, `inferTreeType`, `inferExpressionType`,
// `fast_casters`) e 5633-5814 (`makeFast`).

import * as math from "../math";
import { JmeError } from "./errors";
import {
  number_to_decimal,
  decimal_to_number,
  types,
  type Token,
  type Tree,
} from "./tokens";
import { sig_remove_missing, type Signature, type SignatureResult } from "./funcobj";
import { castToType, isTypeCompatible, substituteTree, unwrapValue } from "./evaluate";
import { normaliseName } from "./tokenizer";
import { lazyOps, type CallSignature, type ConstantDefinition, type Scope } from "./scope";

/** Un albero annotato dai tipi inferiti (jme.js:5505-5509). */
export interface InferredTree {
  tok: Token;
  args?: InferredTree[];
  /** Il tipo inferito per questo sottoalbero. */
  inferred_type?: string;
  /** La definizione di funzione che verrebbe usata, per op e function. */
  matched_function?: CallSignature | null;
  /** La costante a cui il nome si riferisce, se è una costante. */
  constant?: ConstantDefinition | undefined;
  /** Il nome normalizzato, per i nomi di variabile. */
  normalised_name?: string;
}

/** L'assegnazione di tipo trovata per una variabile libera. */
export interface TypeAssignment {
  type: string;
  casts: Record<string, boolean>;
}

// jme.js:5291-5370
/** Enumera tutte le liste di `n` nomi di tipo che la firma può accettare. */
export function enumerate_signatures(sig: Signature, n: number): Array<Array<string | undefined>> {
  let out: Array<Array<string | undefined>>;
  switch (sig.kind) {
    case "multiple":
      if (n === 0) {
        return [[]];
      } else {
        const o: Array<Array<string | undefined>> = [];
        for (let i = 1; i <= n; i++) {
          const subs = enumerate_signatures(sig.signature as Signature, i);
          const rest = enumerate_signatures(sig, n - i);
          subs.forEach((s) => {
            for (const r of rest) {
              o.push(s.concat(r));
            }
          });
        }
        return o;
      }
    case "optional":
      if (n === 0) {
        return [[]];
      }
      return enumerate_signatures(sig.signature as Signature, n);
    case "label":
      return enumerate_signatures(sig.signature as Signature, n);
    case "sequence": {
      const sigs = sig.signatures as Signature[];
      const partitions = math.integer_partitions(n, sigs.length);
      out = [];
      partitions.forEach((p) => {
        const bits = sigs.map((s, i) => enumerate_signatures(s, p[i] as number));
        let o: Array<Array<string | undefined>> = [[]];
        for (const bit of bits) {
          const no: Array<Array<string | undefined>> = [];
          for (const a of o) {
            for (const b of bit) {
              no.push(a.concat(b));
            }
          }
          o = no;
        }
        out = out.concat(o);
      });
      return out;
    }
    case "or":
      out = [];
      for (const s of sig.signatures as Signature[]) {
        out = out.concat(enumerate_signatures(s, n));
      }
      return out;
    case "type":
      return n === 1 ? [[sig.type as string]] : [];
    case "anything":
      return n === 1 ? [[undefined]] : [];
    case "list":
      return n === 1 ? [["list"]] : [];
    case "dict":
      return n === 1 ? [["dict"]] : [];
    default:
      return [];
  }
}

// jme.js:5377-5402
/** Un tipo convertibile in tutti quelli dati, preferendo `number` e `decimal`. */
export function mutually_compatible_type(typeNames: Array<string | undefined>): string | undefined {
  const preferred_types = ["number", "decimal"];
  /** Il tipo `x` è convertibile in tutti i tipi cercati? */
  function mutually_compatible(x: string): boolean {
    const casts = (types[x] as { prototype: { casts?: Record<string, unknown> } }).prototype.casts || {};
    return typeNames.every((t) => t === x || (t !== undefined && casts[t]));
  }
  for (let i = 0; i < preferred_types.length; i++) {
    const type = preferred_types[i] as string;
    if (mutually_compatible(type)) {
      return type;
    }
  }
  for (const x of Object.keys(types)) {
    if (mutually_compatible(x)) {
      return x;
    }
  }
  return undefined;
}

// jme.js:5413-5502 — ricerca golosa: non fa backtracking oltre la prima
// definizione di funzione che va bene (`return options[0].sub_assignments`).
/** Un'assegnazione di tipi alle variabili libere che rende valutabile
 * l'espressione, o `false` se non ne esiste una. */
export function find_valid_assignments(
  tree: Tree,
  scope: Scope,
  assignments?: Record<string, TypeAssignment>,
  outtype?: string,
): Record<string, TypeAssignment> | false {
  if (assignments === undefined) {
    assignments = {};
  }
  switch (tree.tok.type) {
    case "op":
    case "function": {
      let fns = scope.getFunction(tree.tok.name);
      if (outtype !== undefined) {
        fns = fns.filter((fn) => fn.outtype === "?" || fn.outtype === outtype);
      }
      for (const fn of fns) {
        // per ogni definizione, si enumerano i tipi di ingresso che accetta, e
        // per ognuno si controlla se gli argomenti possono produrlo.
        let options = enumerate_signatures(fn.intype, (tree.args ?? []).length).map((arg_types) => ({
          arg_types,
          sub_assignments: assignments as Record<string, TypeAssignment> | false,
        }));
        if (options.length === 0) {
          continue;
        }
        (tree.args ?? []).forEach((arg, i) => {
          options = options
            .map(({ arg_types, sub_assignments }) => {
              const arg_type = arg_types[i];
              const arg_assignments = find_valid_assignments(
                arg,
                scope,
                sub_assignments as Record<string, TypeAssignment>,
                arg_type,
              );
              return { arg_types, sub_assignments: arg_assignments };
            })
            .filter(({ sub_assignments }) => sub_assignments !== false);
        });
        if (options.length > 0) {
          return (options[0] as { sub_assignments: Record<string, TypeAssignment> }).sub_assignments;
        }
      }
      return false;
    }
    case "name": {
      const name = normaliseName(tree.tok.name, scope);
      if (scope.getConstant(name)) {
        return assignments;
      }
      // upstream confronta `assignments[name] === outtype`, cioè un oggetto con
      // una stringa: è sempre falso. Portato com'è.
      if (outtype === undefined || (assignments[name] as unknown) === outtype) {
        return assignments;
      } else if (assignments[name] !== undefined && (assignments[name] as TypeAssignment).type !== outtype) {
        // il nome è già assegnato ma non al tipo richiesto: si cerca un tipo
        // compatibile con questo uso e con tutti i precedenti.
        const type = mutually_compatible_type(Object.keys((assignments[name] as TypeAssignment).casts));
        if (type) {
          assignments = math.copyobj(assignments, true);
          (assignments[name] as TypeAssignment).casts[outtype] = true;
          (assignments[name] as TypeAssignment).type = type;
          return assignments;
        }
        return false;
      } else {
        // il nome non è ancora assegnato: gli si dà il tipo richiesto
        assignments = math.copyobj(assignments, true);
        const casts: Record<string, boolean> = {};
        casts[outtype] = true;
        assignments[name] = { type: outtype, casts: casts };
        return assignments;
      }
    }
    // tutti gli altri tipi di token: devono essere compatibili col tipo
    // richiesto, o il tipo richiesto non deve importare.
    default: {
      if (outtype && !isTypeCompatible(tree.tok.type, outtype)) {
        return false;
      }
      if (!tree.args) {
        return assignments;
      }
      for (const arg of tree.args) {
        const next = find_valid_assignments(arg, scope, assignments, undefined);
        if (next === false) {
          return false;
        }
        assignments = next;
      }
      return assignments;
    }
  }
}

// jme.js:5280-5283
/** I tipi che si possono assegnare alle variabili libere dell'espressione. */
export function inferVariableTypes(tree: Tree, scope: Scope): Record<string, string> {
  const annotated_assignments = find_valid_assignments(tree, scope);
  if (annotated_assignments === false) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(annotated_assignments).map(([name, assignment]) => [name, assignment.type]),
  );
}

// jme.js:5511-5573
/** Annota ogni nodo dell'albero con il tipo inferito e, per le applicazioni di
 * funzione, con la definizione che verrebbe usata. */
export function inferTreeType(tree: Tree, scope: Scope): InferredTree {
  const assignments = inferVariableTypes(tree, scope) as unknown as Record<string, Token>;

  /** Un token finto del tipo dato, contro cui far girare il typechecker. */
  function fake_token(type: string | undefined): Token {
    const tok = { type: type } as unknown as Token;
    const cons = type !== undefined ? types[type] : undefined;
    if (cons) {
      Object.setPrototypeOf(tok, cons.prototype);
    }
    return tok;
  }
  for (const [name, assignment] of Object.entries(assignments)) {
    assignments[name] = fake_token(assignment as unknown as string);
  }

  /** Il tipo inferito per un sottoalbero. */
  function infer_type(t: Tree): InferredTree {
    const tok = t.tok;
    switch (tok.type) {
      case "name": {
        const normalised_name = normaliseName(tok.name, scope);
        const assignment = assignments[normalised_name];
        let constant: ConstantDefinition | undefined;
        let inferred_type: string | undefined;
        if (assignment) {
          inferred_type = assignment.type;
        } else {
          constant = scope.getConstant(tok.name);
          if (constant) {
            inferred_type = constant.value.type;
          }
        }
        return {
          tok,
          inferred_type,
          constant,
          normalised_name,
        } as InferredTree;
      }
      case "op":
      case "function": {
        const op = normaliseName(tok.name, scope);
        if (lazyOps.indexOf(op) >= 0) {
          return { tok, inferred_type: (scope.getFunction(op)[0] as { outtype: string }).outtype };
        } else {
          const iargs: InferredTree[] = [];
          const eargs: Token[] = [];
          const args = t.args ?? [];
          for (let i = 0; i < args.length; i++) {
            const iarg = infer_type(args[i] as Tree);
            eargs.push(fake_token(iarg.inferred_type));
            iargs.push(iarg);
          }
          const matched_function = scope.matchFunctionToArguments(tok, eargs);
          const inferred_type = matched_function ? matched_function.fn.outtype : "?";
          return { tok, args: iargs, inferred_type, matched_function };
        }
      }
      default:
        return { tok, inferred_type: tok.type };
    }
  }

  return infer_type(tree);
}

// jme.js:5582-5585
/** Il tipo inferito per l'intera espressione. */
export function inferExpressionType(tree: Tree, scope: Scope): string | undefined {
  return inferTreeType(tree, scope).inferred_type;
}

// jme.js:5592-5608 — un sottoinsieme di `casts` che lavora sui valori JS
// grezzi invece che sui token, usato solo da `makeFast`.
/** Cast "veloci" fra i tipi numerici, senza costruire token. */
export const fast_casters: Record<string, Record<string, (v: never) => unknown>> = {
  number: {
    decimal: ((n: math.NumbasNumber) => number_to_decimal(n)) as (v: never) => unknown,
  },
  integer: {
    rational: ((n: number) => new math.Fraction(n, 1)) as (v: never) => unknown,
    number: ((n: number) => n) as (v: never) => unknown,
    decimal: ((n: number) => new math.ComplexDecimal(new math.Decimal(String(n)))) as (v: never) => unknown,
  },
  rational: {
    decimal: ((r: math.Fraction) =>
      new math.ComplexDecimal(
        new math.Decimal(String(r.numerator)).dividedBy(new math.Decimal(String(r.denominator))),
      )) as (v: never) => unknown,
    number: ((r: math.Fraction) => r.numerator / r.denominator) as (v: never) => unknown,
  },
  decimal: {
    number: ((n: math.ComplexDecimal) => decimal_to_number(n)) as (v: never) => unknown,
  },
};

/** Una funzione "veloce" prodotta da `makeFast`. */
export type FastFunction = ((...args: never[]) => unknown) & { uses_maps?: boolean };

// jme.js:5633-5814
/**
 * Compila un albero in una funzione JavaScript diretta, assumendo che gli
 * argomenti abbiano sempre lo stesso tipo e che tutte le operazioni abbiano
 * un'implementazione nativa non pigra.
 *
 * Le funzioni di controllo del flusso (`if`, `switch`, ...) sono pigre e non
 * si possono usare qui, come non si possono usare le funzioni che lavorano sui
 * token invece che sui valori.
 *
 * Dare i nomi degli argomenti rende la funzione molto più veloce; con più di
 * cinque variabili libere o cinque argomenti si passa a una via più lenta.
 */
export function makeFast(tree: Tree, scope: Scope, names?: string[]): FastFunction {
  const given_names = names !== undefined;

  /** La funzione veloce che valuta il sottoalbero dato. */
  function fast_eval(t: InferredTree): FastFunction {
    switch (t.tok.type) {
      case "name": {
        if (t.constant) {
          const constant = unwrapValue(t.constant.value);
          return function () {
            return constant;
          };
        }
        const name = t.normalised_name as string;
        if (given_names) {
          const i = (names as string[]).indexOf(name);
          return function (...args: never[]) {
            return args[i];
          };
        } else {
          return function (params: never) {
            return (params as unknown as Record<string, unknown>)[name];
          };
        }
      }
      case "function":
      case "op": {
        const args = (t.args ?? []).map((t2) => fast_eval(t2));
        const fn = t.matched_function && t.matched_function.fn && t.matched_function.fn.fn;
        if (!fn) {
          throw new JmeError("jme.makeFast.no fast definition of function", {
            name: (t.tok as { name: string }).name,
          });
        }
        if (given_names) {
          if ((names as string[]).length > 5 || args.length > 5) {
            return function (...fargs: never[]) {
              return (fn as (...a: never[]) => unknown)(
                ...(args.map((f) => f(...fargs)) as never[]),
              );
            };
          }
          const sig = sig_remove_missing((t.matched_function as CallSignature).signature as SignatureResult);

          /** Avvolge una funzione veloce perché converta il risultato nel tipo
           * richiesto. */
          function make_caster(f: FastFunction, from_type: string, to_type: string): FastFunction {
            const fast_cast = fast_casters[from_type] && fast_casters[from_type]?.[to_type];
            const caster = (types[from_type] as { prototype: { casts?: Record<string, (t: Token) => Token> } })
              .prototype.casts?.[to_type];
            if (fast_cast) {
              return function (...params: never[]) {
                const res = f(...params);
                return (fast_cast as (v: unknown) => unknown)(res);
              };
            } else if (caster) {
              return function (...params: never[]) {
                const res = f(...params);
                const tok = new (types[from_type] as unknown as new (v: unknown) => Token)(res);
                const otok = caster.call(tok, tok);
                return unwrapValue(otok);
              };
            } else {
              return function (...params: never[]) {
                const res = f(...params);
                const tok = new (types[from_type] as unknown as new (v: unknown) => Token)(res);
                const otok = castToType(tok, to_type);
                return unwrapValue(otok);
              };
            }
          }
          for (let i = 0; i < args.length; i++) {
            const from_type = (t.args as InferredTree[])[i]?.inferred_type as string;
            const to_type = (sig[i] as { type?: string })?.type as string;
            if (to_type !== from_type) {
              args[i] = make_caster(args[i] as FastFunction, from_type, to_type);
            }
          }
          const call = fn as (...a: unknown[]) => unknown;
          return function (...params: never[]) {
            return call(...args.map((f) => f(...params)));
          };
        } else {
          const f: FastFunction = function (params: never) {
            const eargs = args.map((g) => g(params));
            return (fn as (...a: unknown[]) => unknown)(...eargs);
          };
          f.uses_maps = true;
          // upstream (jme.js:5771-5776) dimentica il `return`: senza nomi
          // `makeFast` produce `undefined` e poi lancia. Qui la funzione viene
          // restituita (vedi DIVERGENCES.md).
          return f;
        }
      }
      default: {
        const value = unwrapValue(t.tok);
        return function () {
          return value;
        };
      }
    }
  }

  const subbed_tree = substituteTree(tree, scope, true, true);

  /** Sostituisce gli interi con numeri, per evitare cast a razionali. */
  function replace_integers(t: Tree): Tree {
    if (t.tok.type === "integer") {
      return { tok: castToType(t.tok, "number") };
    }
    if (t.args) {
      t.args = t.args.map((a) => replace_integers(a));
    }
    return t;
  }

  // `tree` non è nullo, quindi nemmeno la sua sostituzione
  const typed_tree = inferTreeType(replace_integers(subbed_tree as Tree), scope);

  const f = fast_eval(typed_tree);

  const name = (tree.tok as { name?: string }).name;
  if (name) {
    Object.defineProperty(f, "name", { value: name });
  }

  return f;
}
