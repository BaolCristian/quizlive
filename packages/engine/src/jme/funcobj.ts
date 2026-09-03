/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:4520-4658 (`funcObj`), 5821-5825 (`sig_remove_missing`), 5855-6010
// (i costruttori di firma), 6041-6278 (`parse_signature`, `describe_signature`).

import { JmeError } from "./errors";
import type { Token, TokenConstructor, Tree } from "./tokens";
import type { Scope } from "./scope";
import { isType, castToType, unwrapValue, wrapValue, type UnwrapValueOptions } from "./evaluate";

/** Informazioni su un argomento riconosciuto da un controllore di firma
 * (jme.js:5840-5848). */
export interface SignatureResultArgument {
  /** Il tipo a cui va convertito l'argomento. */
  type?: string;
  /** Argomento opzionale non fornito. */
  missing?: boolean;
  /** Argomento riconosciuto da `anything()`: non conta nel confronto fra firme. */
  nonspecific?: boolean;
  /** Etichetta assegnata da `label()`. */
  name?: string;
  /** Per liste e dizionari: la descrizione degli elementi. */
  items?: SignatureResult | Record<string, SignatureResultArgument>;
}

/** La lista degli argomenti riconosciuti da un controllore di firma. */
export type SignatureResult = SignatureResultArgument[];

/** Un controllore di firma: prende una lista di token e ritorna la
 * descrizione degli argomenti riconosciuti, oppure `false`. */
export interface Signature {
  (args: Token[]): SignatureResult | false;
  /** Il genere di firma: `"type"`, `"anything"`, `"multiple"`, ... */
  kind: string;
  type?: string;
  signature?: Signature;
  signatures?: Signature[];
}

/** Quel che si può passare come tipo di argomento a `FuncObj`: una stringa
 * nella grammatica delle firme, un costruttore di token, o una `Signature`. */
export type SignatureInput = string | Signature | TokenConstructor;

// jme.js:5821-5825
/** Toglie dal risultato di una firma gli argomenti opzionali non forniti. */
export function sig_remove_missing(items: SignatureResult): SignatureResult {
  return items.filter((d) => !d.missing);
}

// jme.js:5855-6010
/** I costruttori dei controllori di firma. */
export const signature = {
  /** Etichetta ogni argomento riconosciuto da `sig` con `name`. */
  label(name: string, sig: Signature): Signature {
    const f = function (args: Token[]) {
      const result = sig(args);
      if (!result) {
        return false;
      }
      result.forEach((r) => {
        r.name = name;
      });
      return result;
    } as Signature;
    f.kind = "label";
    f.signature = sig;
    return f;
  },
  /** Un argomento di tipo qualunque. */
  anything(): Signature {
    const f = function (args: Token[]) {
      return args.length > 0 ? [{ type: (args[0] as Token).type, nonspecific: true }] : false;
    } as Signature;
    f.kind = "anything";
    return f;
  },
  /** Un argomento del tipo dato, o convertibile a quel tipo. */
  type(type: string): Signature {
    const f = function (args: Token[]) {
      if (args.length === 0) {
        return false;
      }
      const first = args[0] as Token;
      if (first.type !== type) {
        const casts = first.casts;
        if (!casts || !casts[type]) {
          return false;
        }
      }
      return [{ type: type }];
    } as Signature;
    f.kind = "type";
    f.type = type;
    return f;
  },
  /** Zero o più argomenti che soddisfano `sig`. Non fallisce mai. */
  multiple(sig: Signature): Signature {
    const f = function (args: Token[]) {
      let got: SignatureResult = [];
      for (;;) {
        const match = sig(args);
        if (match === false) {
          break;
        }
        args = args.slice(match.length);
        got = got.concat(match);
        if (match.length === 0) {
          break;
        }
      }
      return got;
    } as Signature;
    f.kind = "multiple";
    f.signature = sig;
    return f;
  },
  /** Un argomento opzionale: se manca produce `[{missing: true}]`. */
  optional(sig: Signature): Signature {
    const f = function (args: Token[]) {
      const match = sig(args);
      if (match) {
        return match;
      }
      return [{ missing: true }];
    } as Signature;
    f.kind = "optional";
    f.signature = sig;
    return f;
  },
  /** Gli argomenti descritti da `sigs`, in sequenza. */
  sequence(...bits: Signature[]): Signature {
    const f = function (args: Token[]) {
      let match: SignatureResult = [];
      for (let i = 0; i < bits.length; i++) {
        const bitmatch = (bits[i] as Signature)(args);
        if (bitmatch === false) {
          return false;
        }
        match = match.concat(bitmatch);
        args = args.slice(sig_remove_missing(bitmatch).length);
      }
      return match;
    } as Signature;
    f.kind = "sequence";
    f.signatures = bits;
    return f;
  },
  /** Una lista il cui contenuto soddisfa `sigs` in sequenza. */
  list(...bits: Signature[]): Signature {
    const seq = signature.sequence(...bits);
    const f = function (args: Token[]) {
      if (args.length === 0) {
        return false;
      }
      const first = args[0] as Token;
      if (!isType(first, "list")) {
        return false;
      }
      const arg = castToType(first, "list") as { value?: Token[] };
      const value = arg.value ?? [];
      const items = seq(value);
      if (items === false || items.length < value.length) {
        return false;
      }
      return [{ type: "list", items: items }];
    } as Signature;
    f.kind = "list";
    f.signatures = bits;
    return f;
  },
  /** Una lista di elementi che soddisfano tutti `sig`. */
  listof(sig: Signature): Signature {
    return signature.list(signature.multiple(sig));
  },
  /** Un dizionario i cui valori soddisfano tutti `sig`. */
  dict(sig: Signature): Signature {
    const f = function (args: Token[]) {
      if (args.length === 0) {
        return false;
      }
      const first = args[0] as Token;
      if (!isType(first, "dict")) {
        return false;
      }
      const items: Record<string, SignatureResultArgument> = {};
      const entries = Object.entries((first as { value?: Record<string, Token> }).value ?? {});
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i] as [string, Token];
        const m = sig([value]);
        if (m === false) {
          return false;
        }
        items[key] = m[0] as SignatureResultArgument;
      }
      return [{ type: "dict", items: items }];
    } as Signature;
    f.kind = "dict";
    f.signature = sig;
    return f;
  },
  /** La prima delle firme date che riesce. */
  or(...bits: Signature[]): Signature {
    const f = function (args: Token[]) {
      for (let i = 0; i < bits.length; i++) {
        const m = (bits[i] as Signature)(args);
        if (m !== false) {
          return m;
        }
      }
      return false;
    } as Signature;
    f.kind = "or";
    f.signatures = bits;
    return f;
  },
};

// jme.js:6041-6257
/** Compila una descrizione di firma.
 *
 * Grammatica (con spazi liberi fra i token):
 * ```
 * SIGNATURE = MULTIPLE | OPTIONAL | EITHER | SINGLE
 * MULTIPLE  = "*" SINGLE
 * OPTIONAL  = "[" SIGNATURE "]"
 * EITHER    = SINGLE "or" SINGLE
 * SINGLE    = BRACKETED | LISTOF | DICTOF | ANY | TYPE
 * BRACKETED = "(" SIGNATURE ")"
 * LISTOF    = "list of" SIGNATURE
 * DICTOF    = "dict of" SIGNATURE
 * ANY       = "?"
 * TYPE      = \w+
 * ```
 */
export function parseSignature(sig: SignatureInput): Signature {
  type Match = [Signature, number] | undefined;

  /** La posizione del primo carattere non-spazio dopo `pos`. */
  function strip_space(str: string, pos: number): number {
    const leading_space = str.slice(pos).match(/^\s*/) as RegExpMatchArray;
    return pos + (leading_space[0] as string).length;
  }

  /** Riconosce esattamente il token letterale dato. */
  function literal(token: string) {
    return function (str: string, pos: number): [string, number] | undefined {
      pos = strip_space(str, pos);
      if (str.slice(pos, token.length + pos) === token) {
        return [token, pos + token.length];
      }
      return undefined;
    };
  }

  /** Una descrizione di tipo: multipla, opzionale, alternativa o singola. */
  function parse_expr(str: string, pos?: number): Match {
    pos = strip_space(str, pos ?? 0);
    return multiple(str, pos) || optional(str, pos) || either(str, pos) || plain_expr(str, pos);
  }
  /** Un singolo argomento o un'espressione fra parentesi. */
  function plain_expr(str: string, pos: number): Match {
    return bracketed(str, pos) || listof(str, pos) || dictof(str, pos) || any(str, pos) || type(str, pos);
  }
  /** `"*" EXPR`. */
  function multiple(str: string, pos: number): Match {
    const star = literal("*")(str, pos);
    if (!star) {
      return undefined;
    }
    pos = star[1];
    const expr = plain_expr(str, pos);
    if (!expr) {
      return undefined;
    }
    return [signature.multiple(expr[0]), expr[1]];
  }
  /** `"[" EXPR "]"`. */
  function optional(str: string, pos: number): Match {
    const open = literal("[")(str, pos);
    if (!open) {
      return undefined;
    }
    pos = open[1];
    const expr = parse_expr(str, pos);
    if (!expr) {
      return undefined;
    }
    pos = expr[1];
    const end = literal("]")(str, pos);
    if (!end) {
      return undefined;
    }
    return [signature.optional(expr[0]), end[1]];
  }
  /** `"(" EXPR ")"`. */
  function bracketed(str: string, pos: number): Match {
    const open = literal("(")(str, pos);
    if (!open) {
      return undefined;
    }
    pos = open[1];
    const expr = parse_expr(str, pos);
    if (!expr) {
      return undefined;
    }
    pos = expr[1];
    const end = literal(")")(str, pos);
    if (!pos || !end) {
      return undefined;
    }
    return [expr[0], end[1]];
  }
  /** `"list of" EXPR`. */
  function listof(str: string, pos: number): Match {
    const start = literal("list of")(str, pos);
    if (!start) {
      return undefined;
    }
    pos = start[1];
    const expr = parse_expr(str, pos);
    if (!expr) {
      return undefined;
    }
    return [signature.listof(expr[0]), expr[1]];
  }
  /** `"dict of" EXPR`. */
  function dictof(str: string, pos: number): Match {
    const start = literal("dict of")(str, pos);
    if (!start) {
      return undefined;
    }
    pos = start[1];
    const expr = parse_expr(str, pos);
    if (!expr) {
      return undefined;
    }
    return [signature.dict(expr[0]), expr[1]];
  }
  /** `EXPR "or" EXPR`. */
  function either(str: string, pos: number): Match {
    const expr1 = plain_expr(str, pos);
    if (!expr1) {
      return undefined;
    }
    pos = expr1[1];
    const middle = literal("or")(str, pos);
    if (!middle) {
      return undefined;
    }
    pos = middle[1];
    const expr2 = plain_expr(str, pos);
    if (!expr2) {
      return undefined;
    }
    return [signature.or(expr1[0], expr2[0]), expr2[1]];
  }
  /** `"?"`. */
  function any(str: string, pos: number): Match {
    pos = strip_space(str, pos);
    const m = literal("?")(str, pos);
    if (!m) {
      return undefined;
    }
    return [signature.anything(), m[1]];
  }
  /** Il nome di un tipo di dato. */
  function type(str: string, pos: number): Match {
    pos = strip_space(str, pos);
    const m = str.slice(pos).match(/^\w+/);
    if (!m) {
      return undefined;
    }
    const name = m[0];
    return [signature.type(name), pos + name.length];
  }

  if (typeof sig === "function") {
    const asSignature = sig as Signature;
    if (asSignature.kind !== undefined) {
      return asSignature;
    }
    return signature.type((sig as TokenConstructor).prototype.type);
  } else {
    const m = parse_expr(sig);
    if (!m) {
      throw new JmeError("jme.parse signature.invalid signature string", { str: sig });
    }
    return m[0];
  }
}

// jme.js:6259-6278
/** Descrizione leggibile di una firma, per messaggi e documentazione. */
export function describeSignature(sig: Signature): string {
  switch (sig.kind) {
    case "sequence":
      return (sig.signatures as Signature[]).map(describeSignature).join(", ");
    case "anything":
      return "?";
    case "type":
      return sig.type as string;
    case "multiple":
      return describeSignature(sig.signature as Signature) + "*";
    case "optional":
      return "[" + describeSignature(sig.signature as Signature) + "]";
    case "list":
      return "list of (" + (sig.signatures as Signature[]).map(describeSignature) + ")";
    case "dict":
      return "dict of " + describeSignature(sig.signature as Signature);
    case "or":
      return (sig.signatures as Signature[]).map(describeSignature).join(" or ");
    default:
      return "";
  }
}

/** Opzioni del costruttore di `FuncObj` (jme.js:4536-4542). */
export interface FuncObjOptions {
  /** Descrizione leggibile di quel che fa la funzione. */
  description?: string;
  /** Controllo custom degli argomenti. */
  typecheck?: (args: Token[]) => boolean;
  /** Valutazione custom: le funzioni pigre ricevono alberi, non token. */
  evaluate?: (args: Token[] | Tree[], scope: Scope) => Token;
  /** Spacchetta gli argomenti in valori JS grezzi prima di passarli a `fn`. */
  unwrapValues?: boolean | UnwrapValueOptions;
  /** La funzione può comportarsi in modo casuale? `undefined` esplicito vuol
   * dire "non si sa" (jme-builtins.js:2458): `isRandom` deve guardare
   * l'espressione, non la definizione. */
  random?: boolean | undefined;
  /** Il risultato è codice LaTeX. */
  latex?: boolean;
  /** La funzione è pigra: valuta lei i suoi argomenti. */
  lazy?: boolean;
  /** Segnala che la definizione non viene dai builtin (usato dai test upstream). */
  nobuiltin?: boolean;
}

// jme.js:4544 — contatore globale degli id, per l'ordinamento stabile delle
// definizioni quando si fondono liste di funzioni di scope diversi.
let funcObjAcc = 0;

// jme.js:4558-4662
/** Una definizione di funzione JME: sa dire se può essere applicata a una lista
 * di argomenti e sa valutarla in uno scope. */
export class FuncObj {
  /** Identificatore globalmente unico, usato per ordinare le definizioni. */
  readonly id: number;
  options: FuncObjOptions;
  name: string;
  description: string;
  /** Controlla gli argomenti contro la firma della funzione. */
  intype: Signature;
  /** Il tipo del risultato, o `"?"` se non è noto. */
  outtype: string;
  outcons: TokenConstructor | "?";
  /** Il corpo JavaScript della funzione. */
  fn: ((...args: never[]) => unknown) | null;
  /** La funzione si comporta in modo casuale? `undefined` = non dichiarato. */
  random: boolean | undefined;
  /** Il linguaggio con cui è definita, per le funzioni create da una domanda. */
  declare language?: string;
  /** Il corpo, per le funzioni definite in JME. */
  declare tree?: Tree;

  /** La funzione può essere chiamata con questi argomenti? */
  typecheck: (args: Token[]) => boolean;

  constructor(
    name: string,
    intype: SignatureInput[],
    outcons: TokenConstructor | "?",
    fn: ((...args: never[]) => unknown) | null,
    options?: FuncObjOptions,
  ) {
    this.id = funcObjAcc++;
    options = this.options = options || {};
    this.name = name;
    this.description = options.description || "";
    this.intype = signature.sequence(...intype.map(parseSignature));
    if (typeof outcons === "function") {
      this.outtype = outcons.prototype.type;
    } else {
      this.outtype = "?";
    }
    this.outcons = outcons;
    this.fn = fn;
    this.random = options.random;

    const check_signature = this.intype;
    if (options.typecheck) {
      this.typecheck = options.typecheck;
    } else {
      this.typecheck = function (variables: Token[]) {
        const match = check_signature(variables);
        return match !== false && sig_remove_missing(match).length === variables.length;
      };
    }
    if (options.evaluate) {
      this.evaluate = options.evaluate;
    }
  }

  /** Valuta la funzione sugli argomenti dati, nello scope dato. */
  evaluate(args: Token[] | Tree[], _scope: Scope): Token {
    const options = this.options;
    const nargs: unknown[] = [];
    for (let i = 0; i < args.length; i++) {
      if (options.unwrapValues) {
        nargs.push(
          unwrapValue(
            args[i] as Token,
            typeof options.unwrapValues === "object" ? options.unwrapValues : undefined,
          ),
        );
      } else {
        nargs.push((args[i] as { value?: unknown }).value);
      }
    }
    const raw = (this.fn as (...a: unknown[]) => unknown)(...nargs);
    let result: Token;
    if (options.unwrapValues) {
      const wrapped = wrapValue(raw);
      result = (wrapped as { type?: string }).type ? wrapped : this.construct(wrapped);
    } else {
      result = this.construct(raw);
    }
    if (options.latex) {
      (result as { latex?: boolean }).latex = true;
    }
    return result;
  }

  /** Costruisce il token di uscita con `outcons`. */
  private construct(value: unknown): Token {
    const cons = this.outcons;
    if (typeof cons !== "function") {
      // upstream fa `new this.outcons(result)` senza controlli: con outtype
      // `'?'` e nessun `options.evaluate` sarebbe un TypeError.
      throw new JmeError("jme.typecheck.no right type definition", { op: this.name });
    }
    return new (cons as unknown as new (v: unknown) => Token)(value);
  }
}
