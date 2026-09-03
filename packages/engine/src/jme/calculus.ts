/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-calculus.js (180 righe) — derivazione simbolica.
//
// L'unica dipendenza upstream dal modulo di visualizzazione è il messaggio
// d'errore finale (`jme.display.treeToJME(tree)`, riga 172): qui si usa il
// nome della funzione o dell'operatore che non si sa derivare, così il modulo
// resta indipendente da `display` (decisione 6 del brief, DIVERGENCES.md).

import { JmeError } from "./errors";
import { castToType, isFunction, isType, substituteTree } from "./evaluate";
import { compile } from "./parser";
import type { Ruleset } from "./rules-ruleset";
import { simplificationRules } from "./rules-simplify";
import { Rule } from "./rules-transform";
import { Scope } from "./scope";
import { TList, TNum, type TName, type Token, type Tree } from "./tokens";

// jme-calculus.js:13-24 — tutte con opzioni `acgs`.
const differentiation_rules_source: Array<[string, string]> = [
  ["rational:$n", "0"],
  ["?;a + ?`+;b", "$diff(a) + $diff(b)"],
  ["?;a - ?`+;b", "$diff(a) - $diff(b)"],
  ["+?;a", "$diff(a)"],
  ["-?;a", "-$diff(a)"],
  ["?;u / ?;v", "(v*$diff(u) - u*$diff(v))/v^2"],
  ["?;u * ?;v`+", "u*$diff(v) + v*$diff(u)"],
  ["e^?;p", "$diff(p)*e^p"],
  ["exp(?;p)", "$diff(p)*exp(p)"],
  ["(`+-rational:$n);a ^ ?;b", "ln(a) * $diff(b) * a^b"],
  ["?;a^(`+-rational:$n);p", "p*$diff(a)*a^(p-1)"],
];

// jme-calculus.js:32-34
/** Le regole di riscrittura per derivare i pezzi di un'espressione.
 *
 * Le occorrenze della funzione `$diff` nel risultato vengono derivate
 * ricorsivamente rispetto alla stessa variabile. */
export const differentiationRules: Rule[] = differentiation_rules_source.map((r) => new Rule(r[0], r[1], "acgs"));

// jme-calculus.js:42-65
/** Le derivate note delle funzioni di una variabile: `differentiate`
 * sostituisce `x` con l'argomento della funzione e applica la regola della
 * catena. */
const derivatives_source: Record<string, string> = {
  cos: "-sin(x)",
  sin: "cos(x)",
  e: "e^x",
  ln: "1/x",
  log: "1/(ln(10)*x)",
  tan: "sec(x)^2",
  cosec: "-cosec(x)*cot(x)",
  sec: "sec(x)*tan(x)",
  cot: "-cosec(x)^2",
  arcsin: "1/sqrt(1-x^2)",
  arccos: "-1/sqrt(1-x^2)",
  arctan: "1/(1+x^2)",
  cosh: "sinh(x)",
  sinh: "cosh(x)",
  tanh: "sech(x)^2",
  sech: "-sech(x)*tanh(x)",
  cosech: "-cosech(x)*coth(x)",
  coth: "-cosech(x)^2",
  arccosh: "1/sqrt(x^2-1)",
  arcsinh: "1/sqrt(x^2+1)",
  arctanh: "1/(1-x^2)",
  sqrt: "1/(2*sqrt(x))",
};

// jme-calculus.js:67-69
/** Le derivate note, compilate. */
export const derivatives: Record<string, Tree> = {};
for (const [name, expr] of Object.entries(derivatives_source)) {
  derivatives[name] = compile(expr) as Tree;
}

// jme-calculus.js:77-82
/** Le funzioni su cui la derivata si distribuisce:
 * `d/dx f(a, b, ...) = f(da/dx, db/dx, ...)`. */
export const distributingDerivatives: Record<string, true> = {
  vector: true,
  matrix: true,
  rowvector: true,
};

// jme-calculus.js:84
const function_derivative_rule = new Rule(
  "m_func(?;f,?;a)",
  "$diff(m_listval(a,0))*standard_derivative(f,m_listval(a,0))",
);

// jme-calculus.js:93-178
/** Deriva l'espressione rispetto alla variabile col nome dato. */
export function differentiate(tree: Tree, x: string, scope: Scope): Tree {
  // jme-calculus.js:99-115
  /** Espande i marcatori `$diff` e `standard_derivative` lasciati dalle
   * regole di riscrittura. */
  function apply_diff(t: Tree): Tree {
    if (isFunction(t.tok, "$diff")) {
      return base_differentiate((t.args as Tree[])[0] as Tree);
    } else if (isFunction(t.tok, "standard_derivative")) {
      const name = ((t.args as Tree[])[0] as Tree).tok as { value: string };
      const derivative = derivatives[name.value] as Tree;
      const arg = apply_diff((t.args as Tree[])[1] as Tree);
      const argScope = new Scope({ variables: { x: arg as unknown as Token } });
      return substituteTree(derivative, argScope) as Tree;
    }
    if (t.args) {
      return { tok: t.tok, args: t.args.map(apply_diff) };
    }
    return t;
  }

  // jme-calculus.js:122-125
  /** Deriva tutti gli argomenti senza guardare il token in cima. */
  function distribute_differentiation(t: Tree): Tree {
    return { tok: t.tok, args: (t.args as Tree[]).map(base_differentiate) };
  }

  // jme-calculus.js:134-173
  /** Deriva l'albero: prima si guarda il tipo del token in cima, poi si
   * provano le regole di derivazione. */
  function base_differentiate(t: Tree): Tree {
    const tok = t.tok;

    if (isType(tok, "number")) {
      return { tok: new TNum(0) };
    } else if (isType(tok, "name")) {
      const nameTok = castToType(tok, "name") as TName;
      return { tok: new TNum(nameTok.name === x ? 1 : 0) };
    } else if (isType(tok, "list")) {
      const listTok = castToType(tok, "list") as TList;
      if (t.args) {
        return distribute_differentiation(t);
      } else {
        return { tok: new TList((listTok.value as Token[]).map(() => new TNum(0))) };
      }
    } else if (isType(tok, "expression")) {
      const exprTok = castToType(tok, "expression") as { tree: Tree };
      return base_differentiate(exprTok.tree);
    } else if (isType(tok, "op") || isType(tok, "function")) {
      const name = (tok as { name: string }).name;
      if ((t.args as Tree[]).length === 1 && name in derivatives) {
        const res = function_derivative_rule.replace(t, scope);
        return apply_diff(res.expression);
      }
      if (distributingDerivatives[name]) {
        return distribute_differentiation(t);
      }
    }

    for (let i = 0; i < differentiationRules.length; i++) {
      const result = (differentiationRules[i] as Rule).replace(t, scope);
      if (result.changed) {
        return apply_diff(result.expression);
      }
    }

    throw new JmeError("jme.calculus.unknown derivative", {
      tree: (t.tok as { name?: string }).name ?? t.tok.type,
    });
  }

  tree = (simplificationRules["basic"] as Ruleset).simplify(tree, scope);

  return base_differentiate(tree);
}
