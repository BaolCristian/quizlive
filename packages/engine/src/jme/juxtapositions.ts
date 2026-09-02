/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:3320-3620 — `Scope.prototype.expandJuxtapositions`, il riscrittore
// di albero che trasforma le giustapposizioni di nomi in prodotti o in
// composizioni di funzione. Non è integrato nel parser: va invocato
// esplicitamente su quel che scrive lo studente. Sta in un file suo per non
// portare scope.ts oltre le 1000 righe.

import { TFunc, TName, getNameInfo, type Token, type Tree } from "./tokens";
import { isOp } from "./evaluate";
import { funcSynonyms, normaliseName } from "./tokenizer";
import type { Scope } from "./scope";

/** Le opzioni di `expandJuxtapositions` (jme.js:3306-3312).
 *
 * Se si passa un oggetto parziale, le opzioni non indicate valgono `false`:
 * upstream i default si applicano solo quando l'oggetto manca del tutto. */
export interface JuxtapositionOptions {
  /** Impone nomi di variabile di una lettera: `xy` diventa `x*y`. */
  singleLetterVariables?: boolean;
  /** Riscrive come prodotti le applicazioni di funzioni non definite:
   * `x(y)` diventa `x*y` se `x` non è una funzione dello scope. */
  noUnknownFunctions?: boolean;
  /** Riscrive come composizione i nomi di funzione giustapposti:
   * `lnabs(x)` e `ln abs(x)` diventano entrambi `ln(abs(x))`. */
  implicitFunctionComposition?: boolean;
  /** Normalizza i pedici dei nomi. */
  normaliseSubscripts?: boolean;
}

const default_options: JuxtapositionOptions = {
  singleLetterVariables: true,
  noUnknownFunctions: true,
  implicitFunctionComposition: true,
  normaliseSubscripts: true,
};

// jme.js:3320-3621
/** Riscrive le giustapposizioni di nomi in prodotti o composizioni. */
export function expandJuxtapositions(
  scope: Scope,
  tree: Tree,
  options?: JuxtapositionOptions | null,
): Tree {
  if (!tree) {
    return tree;
  }
  const opts: JuxtapositionOptions = options || default_options;

  if (
    !(
      opts.singleLetterVariables ||
      opts.noUnknownFunctions ||
      opts.implicitFunctionComposition ||
      opts.normaliseSubscripts
    )
  ) {
    return tree;
  }

  /** Un token funzione con il nome dato, applicando i sinonimi. */
  function tfunc(name: string): TFunc {
    return new TFunc(scope.parser.funcSynonym(name));
  }

  /** I nomi di tutte le funzioni definite lungo la catena degli scope. */
  function get_function_names(): Record<string, boolean> {
    const defined_names: Record<string, boolean> = {};
    let s: Scope | undefined = scope;
    while (s) {
      for (const name of Object.keys(s.functions)) {
        defined_names[normaliseName(name, scope)] = true;
      }
      for (const name of Object.keys(funcSynonyms)) {
        defined_names[normaliseName(name, scope)] = true;
      }
      if (s.parser.funcSynonyms) {
        for (const name of Object.keys(s.parser.funcSynonyms)) {
          defined_names[normaliseName(name, scope)] = true;
        }
      }
      s = s.parent;
    }
    return defined_names;
  }

  const tok = tree.tok;

  // `ln abs(x)` (cioè `ln * abs(x)` dopo la moltiplicazione implicita) diventa
  // `ln(abs(x))`.
  if (
    opts.implicitFunctionComposition &&
    isOp(tok, "*") &&
    ((tree.args as Tree[])[1] as Tree).tok.type === "function"
  ) {
    let search = true;
    const defined_names = get_function_names();
    while (search) {
      if (!isOp(tree.tok, "*")) {
        break;
      }
      search = false;
      let c = (tree.args as Tree[])[0] as Tree;
      while (isOp(c.tok, "*")) {
        c = (c.args as Tree[])[1] as Tree;
      }
      if (c.tok.type === "name" && defined_names[normaliseName(c.tok.name, scope)]) {
        search = true;
        const composed_fn: Tree = { tok: tfunc(c.tok.name), args: [(tree.args as Tree[])[1] as Tree] };
        (composed_fn.tok as TFunc).vars = 1;
        if (c === (tree.args as Tree[])[0]) {
          tree = composed_fn;
        } else {
          /** Toglie il moltiplicando `c` da una moltiplicazione n-aria. */
          const remove_multiplicand = (t: Tree): Tree => {
            if ((t.args as Tree[])[1] === c) {
              return (t.args as Tree[])[0] as Tree;
            }
            return { tok: t.tok, args: [(t.args as Tree[])[0] as Tree, remove_multiplicand((t.args as Tree[])[1] as Tree)] };
          };
          tree = {
            tok: tree.tok,
            args: [remove_multiplicand((tree.args as Tree[])[0] as Tree), composed_fn],
          };
        }
      }
    }
  }

  let oargs: Tree[] | undefined;
  if (tree.args) {
    oargs = tree.args;
    tree = {
      tok: tree.tok,
      args: tree.args.map((arg) => expandJuxtapositions(scope, arg, options)),
    };
  }

  /** Normalizza i pedici di un token nome, se richiesto. */
  function normaliseSubscripts(t: TName): TName {
    if (!opts.normaliseSubscripts) {
      return t;
    }
    return scope.normaliseSubscripts(t);
  }

  const type_handlers: Record<string, () => Tree> = {
    // jme.js:3434-3461 — spezza un nome lungo in un prodotto di nomi di una
    // lettera, con un algoritmo goloso da destra a sinistra.
    name: () => {
      const name_tok = tok as TName;
      if (opts.singleLetterVariables && name_tok.nameInfo.letterLength > 1) {
        const bits: TName[] = [];
        let s = name_tok.nameWithoutAnnotation;
        let annotation = name_tok.annotation;
        while (s.length) {
          let i = s.length;
          while (i > 1) {
            const info = getNameInfo(s.slice(0, i));
            if (info.letterLength === 1 && (!info.subscript || !info.subscript.match(/.[a-zA-Z]$/))) {
              break;
            }
            i -= 1;
          }
          const ntok = normaliseSubscripts(
            annotation ? new TName(s.slice(0, i), annotation) : new TName(s.slice(0, i)),
          );
          bits.push(ntok);
          annotation = undefined;
          s = s.slice(i);
        }
        let out: Tree = { tok: bits[0] as TName };
        for (let i = 1; i < bits.length; i++) {
          out = { tok: scope.parser.op("*"), args: [out, { tok: bits[i] as TName }] };
        }
        return out;
      } else {
        return { tok: normaliseSubscripts(name_tok) };
      }
    },
    // jme.js:3462-3512 — spezza il nome di una funzione sconosciuta cercando i
    // punti di taglio più lunghi che sono nomi di funzione noti.
    function: () => {
      if (opts.noUnknownFunctions) {
        const defined_names = get_function_names();
        const name = (tok as TFunc).name;
        let breaks = [name.length];
        for (let i = name.length - 1; i >= 0; i--) {
          for (let j = 0; j < breaks.length; j++) {
            const sub = normaliseName(name.slice(i, breaks[j] as number), scope);
            if (sub.length > 0 && defined_names[sub]) {
              breaks = breaks.slice(0, j + 1);
              breaks.push(i);
            }
          }
        }
        const bits: string[] = [];
        let remainder: string;
        if (opts.implicitFunctionComposition) {
          breaks.reverse();
          for (let i = 0; i < breaks.length - 1; i++) {
            bits.push(name.slice(breaks[i] as number, breaks[i + 1] as number));
          }
          remainder = name.slice(0, breaks[0] as number);
        } else {
          if (breaks.length > 1) {
            bits.push(name.slice(breaks[1] as number, breaks[0] as number));
          }
          remainder = name.slice(0, breaks[1] as number);
        }
        if (!bits.length) {
          if ((tree.args as Tree[]).length === 1) {
            const arg = (tree.args as Tree[])[0] as Tree;
            arg.bracketed = true;
            return {
              tok: scope.parser.op("*"),
              args: [expandJuxtapositions(scope, { tok: new TName(name) }, options), arg],
            };
          }
        } else {
          let args = tree.args as Tree[];
          for (let i = bits.length - 1; i >= 0; i--) {
            tree = { tok: tfunc(bits[i] as string), args: args };
            (tree.tok as TFunc).vars = 1;
            args = [tree];
          }

          // quel che resta a sinistra è moltiplicazione per variabili
          if (remainder.length) {
            const left = expandJuxtapositions(scope, { tok: new TName(remainder) }, options);
            tree = { tok: scope.parser.op("*"), args: [left, tree] };
          }
        }
      }
      return tree;
    },
    // jme.js:3513-3613 — se l'operatore ha precedenza minore di `*`, bisogna
    // estrarre il moltiplicando più a sinistra/destra dall'albero già
    // riscritto.
    op: () => {
      const mult_precedence = scope.parser.getPrecedence("*");
      const op_precedence = scope.parser.getPrecedence((tok as { name: string }).name);

      /** In un albero come `((x*y)*z)*w` ritorna `[x, (y*z)*w]`. */
      function extract_leftmost(t: Tree): [Tree, Tree?] {
        if (!t.bracketed && isOp(t.tok, "*")) {
          const bits = extract_leftmost((t.args as Tree[])[0] as Tree);
          const leftmost = bits[0];
          const rest = bits[1];
          if (rest) {
            return [leftmost, { tok: t.tok, args: [rest, (t.args as Tree[])[1] as Tree] }];
          }
          return [leftmost, (t.args as Tree[])[1] as Tree];
        }
        return [t];
      }
      /** In un albero come `x*(y*(z*w))` ritorna `[w, x*(y*z)]`. */
      function extract_rightmost(t: Tree): [Tree, Tree?] {
        if (!t.bracketed && isOp(t.tok, "*")) {
          const bits = extract_rightmost((t.args as Tree[])[1] as Tree);
          const rightmost = bits[0];
          const rest = bits[1];
          if (rest) {
            return [rightmost, { tok: t.tok, args: [(t.args as Tree[])[0] as Tree, rest] }];
          }
          return [rightmost, (t.args as Tree[])[0] as Tree];
        }
        return [t];
      }

      /** L'i-esimo argomento è stato riscritto in una moltiplicazione? */
      function arg_was_rewritten(i: number): boolean {
        const o = (oargs as Tree[])[i] as Tree;
        return (
          !o.bracketed &&
          (o.tok.type === "name" || o.tok.type === "function") &&
          isOp(((tree.args as Tree[])[i] as Tree).tok, "*")
        );
      }

      const args = tree.args as Tree[];
      if (args.length === 1) {
        if ((tok as { postfix: boolean }).postfix) {
          if (arg_was_rewritten(0)) {
            const bits = extract_rightmost(args[0] as Tree);
            return {
              tok: scope.parser.op("*"),
              args: [bits[1] as Tree, { tok: tok, args: [bits[0]] }],
            };
          }
        }
      } else if (args.length === 2) {
        if (op_precedence < mult_precedence) {
          let lrest: Tree | undefined, l: Tree, r: Tree, rrest: Tree | undefined;
          if (arg_was_rewritten(0)) {
            const lbits = extract_rightmost(args[0] as Tree);
            l = lbits[0];
            lrest = lbits[1];
          } else {
            l = args[0] as Tree;
          }
          if (arg_was_rewritten(1)) {
            const rbits = extract_leftmost(args[1] as Tree);
            r = rbits[0];
            rrest = rbits[1];
          } else {
            r = args[1] as Tree;
          }
          tree = { tok: tok, args: [l, r] };
          if (lrest) {
            tree = { tok: scope.parser.op("*"), args: [lrest, tree] };
          }
          if (rrest) {
            tree = { tok: scope.parser.op("*"), args: [tree, rrest] };
          }
        }
      }
      return tree;
    },
  };

  const handler = type_handlers[(tok as Token).type];
  if (handler) {
    return handler();
  }
  return tree;
}
