/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:3014-3224 — tema `control_flow`: 6 nomi, 6 firme, TUTTE
// pigre (`if`, `switch`, `let`, `assert`, `try`, `|>`). Ricevono gli alberi
// degli argomenti e decidono loro quali valutare.
//
// `let`, `try` e `|>` registrano anche un gestore in `jme.findvarsOps`
// (righe 3104, 3186, 3219) e `let` uno in `jme.substituteTreeOps` (3118),
// perché legano nomi che il walker delle variabili libere deve escludere.

import { JmeError } from "../errors";
import { errorMessageIn } from "../../errors";
import { signature as sig } from "../funcobj";
import { Scope, type Scope as ScopeType } from "../scope";
import { TBool, TList, TName, type Token, type Tree } from "../tokens";
import {
  castToType,
  evaluate,
  findvars,
  findvarsOps,
  isType,
  substituteTree,
  substituteTreeOps,
} from "../evaluate";
import { normaliseName } from "../tokenizer";
import { mergeUnique } from "../util";
import { add, pushLazy } from "./registry";

// jme-builtins.js:3054-3059 — la firma dei nomi legati da `let`.
const let_sig_names = sig.multiple(
  sig.or(
    sig.sequence(sig.type("name"), sig.anything()),
    sig.sequence(sig.listof(sig.type("name")), sig.anything()),
  ),
);
const let_signature = sig.or(sig.type("dict"), let_sig_names);

// jme-builtins.js:3193-3212
/** Riscrive `a |> b(...)` in `b(a, ...)`.
 *
 * upstream: l'operatore `|>` non compare quasi mai negli alberi compilati,
 * perché la riscrittura avviene già in fase di compilazione; la definizione
 * serve agli alberi costruiti a mano. */
function pipe_rewrite(args: Tree[]): Tree {
  const bargs = ((args[1] as Tree).args as Tree[]).slice();
  bargs.splice(0, 0, args[0] as Tree);
  return { tok: (args[1] as Tree).tok, args: bargs };
}

/** Registra il tema `control_flow` (jme-builtins.js:3016-3223). */
export function registerControlFlow(scope: ScopeType): void {
  // 3016-3036
  add(scope, "if", [TBool, "?", "?"], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      if (trees.length !== 3) {
        throw new JmeError("jme.typecheck.no right type definition", { op: "if" });
      }
      const tok = evaluate(trees[0] as Tree, s) as Token;
      let test: unknown;
      if (isType(tok, "boolean")) {
        test = (castToType(tok, "boolean") as TBool).value;
      } else {
        // upstream: se il test non è convertibile a booleano si usa la
        // "verità" JavaScript del suo valore. Dovrebbe essere un errore, ma
        // non si sa cosa dipenda da questo comportamento non documentato.
        test = (tok as { value?: unknown }).value;
      }
      if (test) {
        return evaluate(trees[1] as Tree, s) as Token;
      } else {
        return evaluate(trees[2] as Tree, s) as Token;
      }
    },
  });
  pushLazy("if");

  // 3037-3053
  add(scope, "switch", [sig.multiple(sig.sequence(sig.type("boolean"), sig.anything())), "?"], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      for (let i = 0; i < trees.length - 1; i += 2) {
        const result = (evaluate(trees[i] as Tree, s) as { value?: unknown }).value;
        if (result) {
          return evaluate(trees[i + 1] as Tree, s) as Token;
        }
      }
      if (trees.length % 2 == 1) {
        return evaluate(trees.at(-1) as Tree, s) as Token;
      } else {
        throw new JmeError("jme.func.switch.no default case");
      }
    },
  });
  pushLazy("switch");

  // 3060-3103
  add(scope, "let", [let_signature, "?"], TList, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const matched = let_signature(
        trees.map((a) => {
          if (a.tok.type == "list" && a.args) {
            return new TList(a.args.map((aa) => aa.tok));
          } else {
            return a.tok;
          }
        }),
      );
      if (!matched) {
        throw new JmeError("jme.typecheck.no right type definition", { op: "let" });
      }
      let lambda: Tree;
      let nscope: Scope;
      if ((matched[0] as { type?: string }).type == "dict") {
        const d = s.evaluate(trees[0] as Tree) as { value?: Record<string, Token> };
        const variables = d.value ?? {};
        lambda = trees[1] as Tree;
        nscope = new Scope([s, { variables: variables }]);
        return nscope.evaluate(lambda) as Token;
      } else {
        lambda = trees.at(-1) as Tree;
        nscope = new Scope([s]);
        for (let i = 0; i < trees.length - 1; i += 2) {
          const value = nscope.evaluate(trees[i + 1] as Tree) as Token;
          const nameTree = trees[i] as Tree;
          if (nameTree.tok.type == "name") {
            nscope.setVariable(nameTree.tok.name, value);
          } else if (nameTree.tok.type == "list") {
            const names = (nameTree.args as Tree[]).map((t) => (t.tok as TName).name);
            const values = (castToType(value, "list") as TList).value ?? [];
            for (let j = 0; j < names.length; j++) {
              nscope.setVariable(names[j] as string, values[j] as Token);
            }
          }
        }
        return nscope.evaluate(lambda) as Token;
      }
    },
  });
  pushLazy("let");
  findvarsOps["let"] = function (tree, boundvars, s) {
    let vars: string[] = [];
    boundvars = boundvars.slice();
    const args = tree.args as Tree[];
    for (let i = 0; i < args.length - 1; i += 2) {
      const arg = args[i] as Tree;
      switch (arg.tok.type) {
        case "name":
          boundvars.push(normaliseName(arg.tok.name, s));
          break;
        case "list":
          boundvars = boundvars.concat((arg.args as Tree[]).map((t) => (t.tok as TName).name));
          break;
        case "dict":
          (arg.args as Tree[]).forEach((kp) => {
            boundvars.push((kp.tok as { key: string }).key);
            vars = mergeUnique(vars, findvars((kp.args as Tree[])[0] as Tree, boundvars, s));
          });
          break;
      }
      vars = mergeUnique(vars, findvars(args[i + 1] as Tree, boundvars, s));
    }
    // le variabili usate nel corpo, escluse quelle assegnate da `let`
    vars = mergeUnique(vars, findvars(args.at(-1) as Tree, boundvars, s));
    return vars;
  };
  substituteTreeOps["let"] = function (tree, s, allowUnbound) {
    const nscope = new Scope([s]);
    const args = tree.args as Tree[];
    let names: string[];
    if ((args[0] as Tree).tok.type == "dict") {
      const d = args[0] as Tree;
      names = (d.args as Tree[]).map((da) => (da.tok as { key: string }).key);
      for (let i = 0; i < names.length; i++) {
        nscope.deleteVariable(names[i] as string);
      }
      d.args = (d.args as Tree[]).map((da) => substituteTree(da, nscope, allowUnbound) as Tree);
    } else {
      for (let i = 1; i < args.length - 1; i += 2) {
        const nameTree = args[i - 1] as Tree;
        switch (nameTree.tok.type) {
          case "name":
            nscope.deleteVariable(nameTree.tok.name);
            break;
          case "list":
            (nameTree.args as Tree[]).forEach((n) => {
              nscope.deleteVariable((n.tok as TName).name);
            });
            break;
        }
        args[i] = substituteTree(args[i] as Tree, nscope, allowUnbound) as Tree;
      }
    }
  };

  // 3162-3172
  add(scope, "assert", [TBool, "?"], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const result = (s.evaluate(trees[0] as Tree) as { value?: unknown }).value;
      if (!result) {
        return s.evaluate(trees[1] as Tree) as Token;
      } else {
        return new TBool(false);
      }
    },
  });
  pushLazy("assert");

  // 3173-3192 — cattura l'errore e ne lega il messaggio al nome dato.
  add(scope, "try", ["?", TName, "?"], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      try {
        return s.evaluate(trees[0] as Tree) as Token;
      } catch (e) {
        const variables: Record<string, unknown> = {};
        // il messaggio finisce in una variabile JME che gli script di
        // correzione incastonano in un testo tradotto (`jme.jme:36-37`,
        // `:208-209`): va reso nella lingua dello scope, non in quella
        // predefinita del processo con cui `JmeError` traduce al lancio.
        variables[((trees[1] as Tree).tok as TName).name] = errorMessageIn(e, s.locale);
        return s.evaluate(trees[2] as Tree, variables) as Token;
      }
    },
  });
  pushLazy("try");
  findvarsOps["try"] = function (tree, boundvars, s) {
    const args = tree.args as Tree[];
    const try_boundvars = boundvars.slice();
    try_boundvars.push(normaliseName(((args[1] as Tree).tok as TName).name, s));
    let vars = findvars(args[0] as Tree, boundvars, s);
    vars = mergeUnique(vars, findvars(args[2] as Tree, try_boundvars, s));
    return vars;
  };

  // 3213-3222
  add(scope, "|>", ["?", "?"], "?", null, {
    evaluate: (args, s) => s.evaluate(pipe_rewrite(args as Tree[])) as Token,
  });
  pushLazy("|>");
  findvarsOps["|>"] = function (tree, boundvars, s) {
    return findvars(pipe_rewrite(tree.args as Tree[]), boundvars, s);
  };
}
