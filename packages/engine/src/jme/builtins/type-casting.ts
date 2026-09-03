/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:1814-1913 — tema `type_casting`: 6 nomi, 8 firme.
//
// `isa` è PIGRA (riga 1847): deve poter dire "questo è un nome" senza
// valutarlo. `string(expression, ...)` e `latex(expression, ...)` producono
// solo stringhe, ma passano dal modulo di visualizzazione (Task 5) attraverso
// `displayHooks`: senza quello lanciano `jme.subvars.display not available`.

import * as math from "../../math";
import { JmeError } from "../errors";
import type { Scope } from "../scope";
import {
  TBool,
  TExpression,
  TInt,
  TList,
  TMatrix,
  TNum,
  TRational,
  TSet,
  TString,
  TVector,
  type Token,
  type Tree,
} from "../tokens";
import { isType } from "../evaluate";
import { collectRuleset } from "../rules-ruleset";
import { displayHooks } from "../subvars";
import { add, get_notation, pushLazy } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

// jme-builtins.js:1882-1886, 1898-1902 — le flag di visualizzazione ricavate
// dall'argomento opzionale (una stringa o una lista di stringhe).
/** Le flag del ruleset descritto dall'argomento, o `{}` se manca. */
function flagsFromArg(arg: Token | undefined, scope: Scope): Record<string, boolean> {
  if (!arg || arg.type === "nothing") {
    return {};
  }
  const rules = (arg as { value: string | TString[] }).value;
  const spec = Array.isArray(rules) ? rules.map((x) => x.value) : rules;
  return collectRuleset(spec, scope.allRulesets()).flags;
}

/** Registra il tema `type_casting` (jme-builtins.js:1816-1911). */
export function registerTypeCasting(scope: Scope): void {
  // 1816-1823
  add(scope, "int", [TNum], TInt, (n: number) => n);
  add(scope, "rational", [TNum], TRational, (n: number) => {
    const r = math.rationalApproximation(n);
    return new math.Fraction(r[0], r[1]);
  });

  // 1824-1847
  add(scope, "isa", ["?", TString], TBool, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      let tok: Token = (trees[0] as Tree).tok;
      const kind = (s.evaluate(trees[1] as Tree) as TString).value;
      if (tok.type == "name") {
        const c = s.getConstant(tok.name);
        if (c) {
          tok = c.value;
        }
      }
      if (tok.type == "name" && s.getVariable(tok.name) == undefined) {
        return new TBool(kind == "name");
      }
      tok = s.evaluate(trees[0] as Tree) as Token;
      let match: boolean;
      if (kind == "complex") {
        match = (isType(tok, "number") && math.isComplex((tok as TNum).value)) || false;
      } else {
        match = isType(tok, kind);
      }
      return new TBool(match);
    },
  });
  pushLazy("isa");

  // 1848-1878
  add(scope, "list", [TSet], TList, (set: Token[]) => {
    const l: Token[] = [];
    for (let i = 0; i < set.length; i++) {
      l.push(set[i] as Token);
    }
    return l;
  });
  // cast da vettore a lista
  add(scope, "list", [TVector], TList, null, {
    evaluate: (args) => {
      const vector = toks(args)[0] as TVector;
      return new TList(vector.value.map((n) => new TNum(n as number)));
    },
  });
  // cast da matrice a lista di liste
  add(scope, "list", [TMatrix], TList, null, {
    evaluate: (args) => {
      const matrix = (toks(args)[0] as TMatrix).value;
      const value: Token[] = [];
      for (let i = 0; i < matrix.rows; i++) {
        const row = new TList((matrix[i] as math.NumbasNumber[]).map((n) => new TNum(n as number)));
        value.push(row);
      }
      return new TList(value);
    },
  });

  // 1879-1894
  add(scope, "string", [TExpression, "[string or list of string]", "[string]"], TString, null, {
    evaluate: (args, s) => {
      const flags = flagsFromArg(toks(args)[1], s);
      let notation_name = "standard";
      const notationArg = toks(args)[2];
      if (notationArg && notationArg.type != "nothing") {
        notation_name = (notationArg as TString).value;
      }
      const notation = get_notation(notation_name);
      return new TString(notation.treeToJME((toks(args)[0] as TExpression).tree as Tree, flags, s));
    },
  });

  // 1895-1911
  add(scope, "latex", [TExpression, "[string or list of string]"], TString, null, {
    evaluate: (args, s) => {
      const expr = toks(args)[0] as TExpression;
      const flags = flagsFromArg(toks(args)[1], s);
      if (!displayHooks.texify) {
        throw new JmeError("jme.subvars.display not available", { op: "texify" });
      }
      const tex = displayHooks.texify(expr.tree as Tree, flags, s);
      const str = new TString(tex);
      str.latex = true;
      str.display_latex = true;
      return str;
    },
  });
}
