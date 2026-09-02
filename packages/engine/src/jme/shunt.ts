/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:2038-2441 — l'algoritmo shunting-yard: `shunt_open_bracket`,
// `shunt_close_bracket`, `shunt_type_actions`, `addoutput`, `shunt`.
//
// Upstream sono metodi di `Parser`; qui sono funzioni libere che prendono il
// parser come primo argomento, e `Parser` le richiama. La divisione tiene
// parser.ts sotto le 1000 righe e non cambia nulla a runtime: `Parser` importa
// questo file, questo file importa `Parser` solo come tipo.

import { JmeError } from "./errors";
import { TDict, TFunc, TList, TName, TPunc, type Token, type Tree } from "./tokens";
import { isFunction, isOp } from "./evaluate";
import type { Parser } from "./parser";

/** Una voce della lista di output dello shunting-yard: l'albero costruito e
 * l'altezza dello stack quando è stato prodotto (serve a `addoutput` per
 * sapere quali sottoalberi appartengono all'operazione corrente). */
export interface OutputEntry {
  tree: Tree;
  stack_length: number;
}

// jme.js:2038-2041
/** Comportamento comune a tutte le parentesi aperte. */
export function shunt_open_bracket(p: Parser, tok: Token): void {
  addstack(p, tok);
  p.numvars.push(0);
}

// jme.js:2049-2068
/** Comportamento comune a tutte le parentesi chiuse; ritorna il numero di
 * espressioni separate da virgola fra le parentesi. */
export function shunt_close_bracket(p: Parser, opener: string, _tok: Token): number {
  while (p.stack.length > 0 && (p.stack[p.stack.length - 1] as Token).type !== opener) {
    addoutput(p, popstack(p));
  }
  if (!p.stack.length) {
    throw new JmeError("jme.shunt.no left bracket");
  }

  // via la parentesi aperta
  popstack(p);

  // quante espressioni ci sono fra le parentesi
  const prev = p.tokens[p.i - 1] as Token;
  if (prev.type !== "," && prev.type !== opener) {
    (p.numvars as number[])[p.numvars.length - 1] = (p.numvars[p.numvars.length - 1] as number) + 1;
  }
  return p.numvars.pop() as number;
}

// jme.js:2070-2224 — un gestore per tipo di token.
/** I gestori dello shunting-yard, per tipo di token. */
export const shunt_type_actions: Record<string, (p: Parser, tok: Token) => void> = {
  number(p, tok) {
    addoutput(p, tok);
  },
  integer(p, tok) {
    addoutput(p, tok);
  },
  string(p, tok) {
    addoutput(p, tok);
  },
  boolean(p, tok) {
    addoutput(p, tok);
  },
  name(p, tok) {
    const i = p.i;
    // se è seguito da una parentesi aperta, è un'applicazione di funzione
    if (i < p.tokens.length - 1 && (p.tokens[i + 1] as Token).type === "(") {
      const name = p.funcSynonym((tok as TName).nameWithoutAnnotation);
      const ntok = new TFunc(name, (tok as TName).annotation);
      ntok.pos = tok.pos;
      addstack(p, ntok);
    } else {
      // altrimenti è una variabile
      addoutput(p, tok);
    }
  },
  ","(p) {
    if (p.is_opening_bracket(p.tokens.at(p.i - 1))) {
      throw new JmeError("jme.shunt.expected argument before comma");
    }
    // fine dell'espressione di un argomento: si scaricano sull'output tutte
    // le sue operazioni
    while (p.stack.length > 0 && !p.is_opening_bracket(p.stack[p.stack.length - 1])) {
      addoutput(p, popstack(p));
    }
    (p.numvars as number[])[p.numvars.length - 1] = (p.numvars[p.numvars.length - 1] as number) + 1;
    if (!p.stack.length) {
      throw new JmeError("jme.shunt.no left bracket in function");
    }
  },
  op(p, tok) {
    const last_output = p.output[p.output.length - 1];
    if (
      (tok as { name: string }).name === "*" &&
      last_output?.tree.tok.type === "lambda" &&
      !last_output.tree.args
    ) {
      addstack(p, pop_output(p).tok);
      p.numvars.push(0);
      return;
    }

    if (!(tok as { prefix: boolean }).prefix) {
      const o1 = p.getPrecedence((tok as { name: string }).name);
      // finché in cima allo stack ci sono operatori di precedenza minore, li
      // si scarica sull'output: vanno calcolati prima di questo. Gli
      // operatori associativi a sinistra scaricano anche quelli di
      // precedenza uguale.
      const should_pop = (): boolean => {
        if (p.stack.length === 0) {
          return false;
        }
        const prev = p.stack[p.stack.length - 1] as Token;
        if (
          prev.type === "op" &&
          (o1 > p.getPrecedence(prev.name) ||
            (!p.isRightAssociative((tok as { name: string }).name) && o1 === p.getPrecedence(prev.name)))
        ) {
          return true;
        }
        if (prev.type === "keypair" && prev.pairmode === "match") {
          return true;
        }
        return false;
      };
      while (should_pop()) {
        addoutput(p, popstack(p));
      }
    }
    addstack(p, tok);
  },

  "{"(p, tok) {
    shunt_open_bracket(p, tok);
  },

  "}"(p, tok) {
    shunt_close_bracket(p, "{", tok);
  },

  "["(p, tok) {
    shunt_open_bracket(p, tok);

    const i = p.i;
    const tokens = p.tokens;
    const last_token = i === 0 ? null : (tokens[i - 1] as Token).type;
    if (
      i === 0 ||
      p.is_opening_bracket(tokens.at(i - 1)) ||
      last_token === "," ||
      last_token === "op" ||
      last_token === "keypair" ||
      last_token === "lambda"
    ) {
      p.listmode.push("new");
    } else {
      p.listmode.push("index");
    }
  },
  "]"(p, tok) {
    const n = shunt_close_bracket(p, "[", tok);

    switch (p.listmode.pop()) {
      case "new": {
        const ntok = new TList(n);
        ntok.pos = tok.pos;
        addoutput(p, ntok);
        break;
      }
      case "index": {
        const f = new TFunc("listval");
        f.pos = tok.pos;
        f.vars = 2;
        addoutput(p, f);
        break;
      }
    }
  },
  "("(p, tok) {
    shunt_open_bracket(p, tok);
  },
  ")"(p) {
    const n = shunt_close_bracket(p, "(", new TPunc(")"));

    const top = p.stack[p.stack.length - 1];
    // se è una chiamata di funzione, in cima allo stack c'è il nome della
    // funzione, da togliere
    if (
      (p.stack.length > 0 && top?.type === "function") ||
      (top?.type === "lambda" &&
        top.names !== undefined &&
        (p.i === p.tokens.length - 1 || !isOp(p.tokens[p.i + 1] as Token, "*")))
    ) {
      const f = popstack(p) as TFunc;
      f.vars = n;
      addoutput(p, f);
      // se invece è la lista dei nomi degli argomenti di una funzione
      // anonima, la si aggancia al token lambda che segue
    } else if (p.i < p.tokens.length - 1 && (p.tokens[p.i + 1] as Token).type === "lambda") {
      const names = p.output.splice(p.output.length - n, n).map((o) => o.tree);
      const lambda = p.tokens[p.i + 1] as Token & { set_names(n: Tree[]): void; vars: number };
      lambda.set_names(names);
      lambda.vars = 1;
    } else if (p.output.length) {
      (p.output[p.output.length - 1] as OutputEntry).tree.bracketed = true;
    }
  },
  keypair(p, tok) {
    let pairmode: "dict" | "match" | null = null;
    for (let i = p.stack.length - 1; i >= 0; i--) {
      const s = p.stack[i] as Token;
      if (s.type === "[" || isFunction(s, "dict")) {
        pairmode = "dict";
        break;
      } else if (isOp(s, ";")) {
        pairmode = "match";
        break;
      } else if (s.type === "(" && (p.stack.length === 1 || !isFunction(p.stack[i - 1] as Token, "dict"))) {
        break;
      }
    }
    if (pairmode === null) {
      throw new JmeError("jme.shunt.keypair in wrong place");
    }
    (tok as { pairmode?: "dict" | "match" }).pairmode = pairmode;
    addstack(p, tok);
  },
  lambda(p, tok) {
    addstack(p, tok);
  },
};

// jme.js:2228-2357
/** Mette un token nell'output, raccogliendo i suoi argomenti dalla coda
 * dell'output stesso e applicando le riscritture (relazioni incatenate,
 * operatori negati, dizionari, lambda, pipe). */
export function addoutput(p: Parser, tok: Token): void {
  if (tok.vars !== undefined) {
    let i = 0;
    while (i < tok.vars && p.output.length - i - 1 >= 0) {
      const { stack_length } = p.output[p.output.length - i - 1] as OutputEntry;
      if (stack_length < p.stack.length) {
        break;
      }
      i += 1;
    }
    if (i < tok.vars) {
      // non ci sono abbastanza termini per questa operazione
      if (!p.options.addMissingArguments) {
        throw new JmeError("jme.shunt.not enough arguments", {
          op: (tok as { name?: string }).name ?? tok.type,
        });
      } else {
        for (; i < tok.vars; i++) {
          const tvar = new TName("?");
          tvar.added_missing = true;
          push_output(p, { tok: tvar });
        }
      }
    }

    let thing: Tree = {
      tok: tok,
      args: p.output.splice(p.output.length - tok.vars, tok.vars).map((o) => o.tree),
    };

    if (tok.type === "lambda") {
      if (tok.expr === undefined) {
        if (tok.names === undefined) {
          tok.set_names([(thing.args as Tree[])[0] as Tree]);
        }
        tok.set_expr((thing.args as Tree[])[tok.vars - 1] as Tree);
        thing = { tok: tok };
      }
    }

    if (tok.type === "list") {
      // se è una lista di coppie chiave-valore, è in realtà un dizionario
      let mode: string | null = null;
      const args = thing.args as Tree[];
      for (let j = 0; j < args.length; j++) {
        const argmode = (args[j] as Tree).tok.type === "keypair" ? "dictionary" : "list";
        if (j > 0 && argmode !== mode) {
          throw new JmeError("jme.shunt.list mixed argument types", { mode: String(mode), argmode: argmode });
        }
        mode = argmode;
      }
      if (mode === "dictionary") {
        thing.tok = new TDict();
      }
    }
    if (tok.type === "op" && p.isRelation(tok.name)) {
      // riscrive le relazioni incatenate: `a<b<c` diventa `a<b and b<c`
      const args = thing.args as Tree[];
      const lhs = args[0] as Tree;
      let ltop = lhs;

      while (isOp(ltop.tok, "and")) {
        ltop = (ltop.args as Tree[])[1] as Tree;
      }

      let lbottom = ltop;
      while (lbottom.tok.type === "op" && p.isRelation(lbottom.tok.name)) {
        lbottom = (lbottom.args as Tree[])[1] as Tree;
      }

      const rhs = args[1] as Tree;
      let rtop = rhs;

      while (isOp(rtop.tok, "and")) {
        rtop = (rtop.args as Tree[])[0] as Tree;
      }

      let rbottom = rtop;
      while (rbottom.tok.type === "op" && p.isRelation(rbottom.tok.name)) {
        rbottom = (rbottom.args as Tree[])[0] as Tree;
      }

      /** Un nodo binario con il token e i due argomenti dati. */
      function bin(t: Token, l: Tree, r: Tree): Tree {
        if (!t.pos) {
          t.pos = l.tok.pos;
        }
        return { tok: t, args: [l, r] };
      }

      if (lbottom !== ltop) {
        if (rbottom !== rtop) {
          thing = bin(p.op("and"), bin(p.op("and"), lhs, bin(tok, lbottom, rbottom)), rhs);
        } else {
          thing = bin(p.op("and"), lhs, bin(tok, lbottom, rhs));
        }
      } else if (rbottom !== rtop) {
        thing = bin(p.op("and"), bin(tok, lhs, rbottom), rhs);
      }
    }
    if (thing.tok.type === "op" && thing.tok.negated) {
      thing.tok.negated = false;
      thing = { tok: p.op("not", false, true), args: [thing] };
    }
    if (thing.tok.type === "op" && thing.tok.name === "|>") {
      const args = thing.args as Tree[];
      const right = args[1] as Tree;
      if (right.tok.type === "lambda") {
        thing = { tok: right.tok, args: [args[0] as Tree] };
      } else if (right.args === undefined) {
        throw new JmeError("jme.shunt.pipe right hand takes no arguments");
      } else {
        thing = { tok: right.tok, args: [args[0] as Tree].concat(right.args) };
      }
    }

    if (thing.tok.type === "lambda") {
      thing.tok.vars = (thing.tok.names as Tree[]).length;
    }
    push_output(p, thing);
  } else {
    push_output(p, { tok: tok });
  }
}

// jme.js:2362-2364
/** Aggiunge un albero in coda all'output. */
export function push_output(p: Parser, tree: Tree): void {
  p.output.push({ tree, stack_length: p.stack.length });
}

// jme.js:2366-2369
/** Toglie l'ultimo albero dall'output. */
export function pop_output(p: Parser): Tree {
  return (p.output.pop() as OutputEntry).tree;
}

// jme.js:2371-2373
/** Mette un token sullo stack. */
export function addstack(p: Parser, tok: Token): void {
  p.stack.push(tok);
}

// jme.js:2375-2378
/** Toglie un token dallo stack. */
export function popstack(p: Parser): Token {
  return p.stack.pop() as Token;
}

// jme.js:2387-2441
/** Trasforma una lista di token in un albero sintattico, con l'algoritmo
 * shunting-yard. */
export function shunt(p: Parser, tokens: Token[]): Tree {
  p.tokens = tokens;
  p.output = [];
  p.stack = [];
  p.numvars = [];
  p.listmode = [];

  const type_actions = shunt_type_actions;

  for (p.i = 0; p.i < tokens.length; p.i++) {
    const tok = tokens[p.i] as Token;
    const action = type_actions[tok.type];
    if (action) {
      action(p, tok);
    }
  }

  // tutto quel che resta sullo stack va nell'output
  while (p.stack.length) {
    const x = p.stack[p.stack.length - 1] as Token;
    if (x.type === "(") {
      if (!p.options.closeMissingBrackets) {
        throw new JmeError("jme.shunt.no right bracket");
      } else {
        (type_actions[")"] as (q: Parser, tok: Token) => void)(p, new TPunc(")"));
      }
    } else if (x.type === "[") {
      if (!p.options.closeMissingBrackets) {
        throw new JmeError("jme.shunt.no right square bracket");
      } else {
        (type_actions["]"] as (q: Parser, tok: Token) => void)(p, new TPunc("]"));
      }
    } else {
      popstack(p);
      addoutput(p, x);
    }
  }
  if (p.listmode.length > 0) {
    throw new JmeError("jme.shunt.no right square bracket");
  }
  if (p.output.length > 1) {
    throw new JmeError("jme.shunt.missing operator");
  }
  return (p.output[0] as OutputEntry).tree;
}

