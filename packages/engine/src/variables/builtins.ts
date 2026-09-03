/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:2500-2521 (tema `jme`) — il builtin `make_variables`,
// rinviato dal Task 4b (`builtins/jme-introspection-2.ts:2454-2465`) perché
// dipende da `jme.variables.makeVariables`, disponibile solo da qui.
//
// Non è avvolto in `functionSet(scope, {name:"jme",...}, ...)`: quell'insieme
// è già chiuso da `jme/builtins/jme-introspection.ts` (che lo registra da
// `jme/builtins/index.ts`) e `registry.ts` non espone un modo per riaprirlo
// dall'esterno senza sovrascriverlo. `make_variables` è quindi registrata
// direttamente sullo scope (raggiungibile, valutabile, presente in
// `scope.allFunctions()`), ma non compare in `scope.getFunctionSet("jme")`
// — un dettaglio che riguarda solo `add_function_sets`/l'editor (nessun test
// upstream lo esercita per questa funzione).

import { add, sig } from "../jme/builtins/registry";
import { findvars } from "../jme/evaluate";
import { Scope } from "../jme/scope";
import { TDict, TExpression, type Token, type Tree } from "../jme/tokens";
import { makeVariables, type VariablesTodo } from "./generate";

/** Registra `make_variables` sullo scope dato. */
export function registerVariablesBuiltins(scope: Scope): void {
  add(
    scope,
    "make_variables",
    [sig.dict(sig.type("expression")), sig.optional(sig.type("range"))],
    TDict,
    null,
    {
      evaluate: (rawArgs, callScope) => {
        const args = rawArgs as Token[];
        const s = new Scope([callScope]);
        const definitions = ((args[0] as TDict).value ?? {}) as Record<string, TExpression>;
        const vrangeTok = args[1];
        if (vrangeTok && vrangeTok.type !== "nothing") {
          s.setVariable("vrange", vrangeTok);
        }
        const todo: VariablesTodo = {};
        for (const [k, v] of Object.entries(definitions)) {
          s.deleteVariable(k);
          const tree: Tree | null = v.tree;
          const vars = findvars(tree, [], s);
          todo[k] = { tree: tree, vars: vars };
        }
        const result = makeVariables(todo, s);
        const out: Record<string, Token> = {};
        for (const [k, v] of Object.entries(result.variables)) {
          out[k] = v;
        }
        return new TDict(out);
      },
      // upstream (jme-builtins.js:2521): `random: undefined` — dipende dalle
      // definizioni valutate, non dalla chiamata stessa.
      random: undefined,
    },
  );
}
