/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:2212-2636 — tema `jme`: 33 nomi, 40 firme. Il file è
// spezzato in due metà per restare sotto le 1000 righe:
//   - qui: 2214-2452 (`jme_string`, `satisfy`, `isset`, `unset`, `parse`,
//     `expand_juxtapositions`, `normalise_subscripts`, `expression`, `args`,
//     `as`, `type`, `name`, `string`, `op`, `function`, `exec`, `simplify`);
//   - `jme-introspection-2.ts`: 2453-2636 (`eval`, `findvars`,
//     `definedvariables`, le inferenze di tipo, i confronti e le funzioni che
//     costruiscono uno `scope`).
//
// `make_variables` (2500-2521) NON è registrato qui: dipende da
// `jme.variables.makeVariables`, che arriva col Task 6, ed è quel task a
// registrarlo.
//
// Sei funzioni sono PIGRE (`satisfy`, `isset`, `unset`, `expression`, `exec`,
// più `canonical_compare` e `scope_case_sensitive` nella seconda metà).

import { JmeError } from "../errors";
import { Scope, type Scope as ScopeType } from "../scope";
import {
  TBool,
  TDict,
  TExpression,
  TFunc,
  TList,
  TName,
  TNum,
  TOp,
  TString,
  type Token,
  type Tree,
} from "../tokens";
import { castToType, findvars, findvarsOps, isType, substituteTreeOps, unwrapValue } from "../evaluate";
import { compile } from "../parser";
import { collectRuleset } from "../rules-ruleset";
import { simplify } from "../rules";
import { displayHooks } from "../subvars";
import { mergeUnique } from "../util";
import { add, get_notation, pushLazy, sig } from "./registry";
import { registerJmeScopes } from "./jme-introspection-2";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

// jme-builtins.js:2219-2258
/** Valuta le definizioni date finché tutte le condizioni non sono
 * soddisfatte, al massimo `maxRuns` volte. */
function satisfy(
  names: string[],
  definitions: Tree[],
  conditions: Tree[],
  scope: ScopeType,
  maxRuns?: number,
): Record<string, Token> {
  maxRuns = maxRuns === undefined ? 100 : maxRuns;
  if (definitions.length != names.length) {
    throw new JmeError("jme.func.satisfy.wrong number of definitions");
  }
  let satisfied = false;
  let runs = 0;
  let variables: Record<string, Token> = {};
  while (runs < maxRuns && !satisfied) {
    runs += 1;
    variables = {};
    for (let i = 0; i < names.length; i++) {
      variables[names[i] as string] = scope.evaluate(definitions[i] as Tree) as Token;
    }
    const nscope = new Scope([scope, { variables: variables }]);
    satisfied = true;
    for (let i = 0; i < conditions.length; i++) {
      const ok = nscope.evaluate(conditions[i] as Tree) as Token;
      if (ok.type != "boolean") {
        throw new JmeError("jme.func.satisfy.condition not a boolean");
      }
      if (!ok.value) {
        satisfied = false;
        break;
      }
    }
  }
  if (!satisfied) {
    throw new JmeError("jme.func.satisfy.took too many runs");
  }
  return variables;
}

/** Registra il tema `jme` (jme-builtins.js:2214-2636), senza
 * `make_variables`. */
export function registerJmeIntrospection(scope: ScopeType): void {
  // 2214-2217 — la forma JME di un token qualunque (serve il Task 5).
  add(scope, "jme_string", ["?"], TString, null, {
    evaluate: (args, s) => {
      if (!displayHooks.treeToJME) {
        throw new JmeError("jme.subvars.display not available", { op: "treeToJME" });
      }
      return new TString(displayHooks.treeToJME({ tok: toks(args)[0] as Token }, {}, s));
    },
  });

  // 2259-2284
  add(scope, "satisfy", [TList, TList, TList, TNum], TList, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const names = ((trees[0] as Tree).args as Tree[]).map((t) => (t.tok as TName).name);
      const definitions = (trees[1] as Tree).args as Tree[];
      const conditions = (trees[2] as Tree).args as Tree[];
      const maxRuns = trees.length > 3 ? ((s.evaluate(trees[3] as Tree) as TNum).value as number) : 100;
      const variables = satisfy(names, definitions, conditions, s, maxRuns);
      return new TList(names.map((name) => variables[name] as Token));
    },
  });
  pushLazy("satisfy");
  findvarsOps["satisfy"] = function (tree, boundvars, s) {
    const args = tree.args as Tree[];
    const names = ((args[0] as Tree).args as Tree[]).map((t) => (t.tok as TName).name);
    // upstream: `boundvars.concat(0, 0, names)` — i due zeri finiscono
    // davvero nella lista dei nomi legati, ma nessun nome JME è `0`, quindi
    // non cambiano il risultato. Portati com'è.
    const bound = boundvars.concat([0 as unknown as string, 0 as unknown as string], names);
    let vars: string[] = [];
    for (let i = 1; i < args.length; i++) {
      vars = mergeUnique(vars, findvars(args[i] as Tree, bound, s));
    }
    return vars;
  };

  // 2285-2306
  add(scope, "isset", [TName], TBool, null, {
    evaluate: (args, s) => {
      const name = (((args as Tree[])[0] as Tree).tok as TName).name;
      return new TBool(name in s.variables);
    },
  });
  pushLazy("isset");
  findvarsOps["isset"] = function (_tree, boundvars) {
    return boundvars;
  };
  substituteTreeOps["isset"] = function () {
    // upstream ritorna l'albero senza sostituire nulla: il nome di `isset`
    // non deve essere rimpiazzato dal suo valore.
  };

  // 2298-2306
  add(scope, "unset", [TDict, "?"], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const defs = unwrapValue(s.evaluate(trees[0] as Tree) as Token) as {
        variables?: string[];
        functions?: string[];
        rulesets?: string[];
      };
      const nscope = s.unset(defs);
      return nscope.evaluate(trees[1] as Tree) as Token;
    },
  });
  pushLazy("unset");

  // 2307-2314
  add(scope, "parse", [TString], TExpression, (str: string) => compile(str));
  add(scope, "parse", [TString, TString], TExpression, (str: string, notation_name: string) =>
    get_notation(notation_name).compile(str),
  );

  // 2315-2323
  add(
    scope,
    "expand_juxtapositions",
    [TExpression, sig.optional(sig.type("scope")), sig.optional(sig.type("dict"))],
    TExpression,
    null,
    {
      evaluate: (args, s) => {
        const tree = (toks(args)[0] as TExpression).tree as Tree;
        const argTok = toks(args)[1] as { scope?: ScopeType } | undefined;
        const argscope = argTok?.scope ?? s;
        const optionsTok = toks(args)[2];
        const options =
          optionsTok && optionsTok.type !== "nothing"
            ? (unwrapValue(optionsTok) as Record<string, boolean>)
            : undefined;
        return new TExpression(argscope.expandJuxtapositions(tree, options));
      },
    },
  );

  // 2324-2330
  add(scope, "normalise_subscripts", [TString], TString, null, {
    evaluate: (args, s) => {
      const tok = new TName((toks(args)[0] as TString).value);
      return new TString(s.normaliseSubscripts(tok).name);
    },
  });

  // 2331-2372 — costruisce un'espressione dalla stringa, sostituendo nelle
  // stringhe interne con la semantica JME (`subjme`).
  //
  // upstream salva e ripristina `Numbas.locale.default_number_notation`,
  // forzandola a `['plain']` durante la valutazione: qui la notazione
  // predefinita è già `plain` (math/format.ts), quindi il giro non serve.
  add(scope, "expression", [TString], TExpression, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];

      /** Marca `subjme` tutte le stringhe non sicure dell'albero. */
      function sub_strings(tree: Tree): Tree {
        if (isType(tree.tok, "string") && !(tree.tok as TString).safe) {
          const tok = new TString((tree.tok as TString).value);
          tok.subjme = true;
          return { tok: tok };
        } else if (tree.args) {
          return { tok: tree.tok, args: tree.args.map(sub_strings) };
        } else {
          return tree;
        }
      }

      const arg = sub_strings(trees[0] as Tree);
      let str = s.evaluate(arg) as Token;
      if (!isType(str, "string")) {
        throw new JmeError("jme.typecheck.no right type definition", { op: "expression" });
      }
      str = castToType(str, "string");

      const jme_notation_name =
        trees.length > 1 ? (castToType(s.evaluate(trees[1] as Tree) as Token, "string") as TString).value : "standard";
      const jme_notation = get_notation(jme_notation_name);

      return new TExpression(jme_notation.compile((str as TString).value));
    },
  });
  pushLazy("expression");

  // 2373-2382
  add(scope, "args", [TExpression], TList, null, {
    evaluate: (args) => {
      const tree = (toks(args)[0] as TExpression).tree as Tree;
      if (!tree.args) {
        return new TList([]);
      }
      return new TList(tree.args.map((t) => new TExpression(t)));
    },
  });

  // 2383-2398
  add(scope, "as", ["?", TString], "?", null, {
    evaluate: (args) => {
      const target = (toks(args)[1] as TString).value;
      return castToType(toks(args)[0] as Token, target);
    },
  });
  add(scope, "type", [TExpression], TString, null, {
    evaluate: (args) => new TString(((toks(args)[0] as TExpression).tree as Tree).tok.type),
  });
  add(scope, "type", ["?"], TString, null, {
    evaluate: (args) => new TString((toks(args)[0] as Token).type),
  });

  // 2399-2410
  add(scope, "name", [TString], TName, (name: string) => name);
  add(scope, "string", [TName], TString, (name: string) => name);
  add(scope, "op", [TString], TOp, (name: string) => name);
  add(scope, "function", [TString], TFunc, (name: string) => name);

  // 2411-2431
  add(scope, "exec", [sig.or(sig.type("function"), sig.type("op")), TList], TExpression, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      let tok: Token;
      if ((trees[0] as Tree).args) {
        tok = s.evaluate(trees[0] as Tree) as Token;
      } else {
        tok = (trees[0] as Tree).tok;
      }
      const list = s.evaluate(trees[1] as Tree) as TList;
      const eargs = (list.value ?? []).map((a) => {
        if (a.type != "expression") {
          return { tok: a } as Tree;
        } else {
          return (a as TExpression).tree as Tree;
        }
      });
      (tok as { vars?: number }).vars = eargs.length;
      return new TExpression({ tok: tok, args: eargs });
    },
  });
  pushLazy("exec");

  // 2433-2452 — le tre firme di `simplify`. upstream chiama
  // `jme.display.simplifyTree`/`simplify`, che sugli alberi coincide con
  // `jme.rules.simplify` del Task 3.
  add(scope, "simplify", [TExpression, TString], TExpression, null, {
    evaluate: (args, s) => {
      const tree = (toks(args)[0] as TExpression).tree as Tree;
      const ruleset = collectRuleset((toks(args)[1] as TString).value, s.allRulesets());
      return new TExpression(simplify(tree, ruleset, s));
    },
  });
  add(scope, "simplify", [TExpression, TList], TExpression, null, {
    evaluate: (args, s) => {
      const tree = (toks(args)[0] as TExpression).tree as Tree;
      const ruleset = collectRuleset(
        ((toks(args)[1] as TList).value ?? []).map((x) => (x as TString).value),
        s.allRulesets(),
      );
      return new TExpression(simplify(tree, ruleset, s));
    },
  });
  add(scope, "simplify", [TString, TString], TExpression, null, {
    evaluate: (args, s) => {
      // upstream: `jme.display.simplify(expr, ruleset, scope)` compila la
      // stringa e poi applica le regole.
      const tree = compile((toks(args)[0] as TString).value);
      const ruleset = collectRuleset((toks(args)[1] as TString).value, s.allRulesets());
      return new TExpression(tree ? simplify(tree, ruleset, s) : null);
    },
  });

  registerJmeScopes(scope);
}
