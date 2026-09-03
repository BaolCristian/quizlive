// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Sub-expressions` (jme-tests.mjs:1608-1624) e `resultsequal`
// (894-898) del modulo QUnit `Evaluating`, più la copertura dei temi
// `jme` (jme-builtins.js:2213-2636, senza `make_variables`),
// `pattern_matching` (2639-2766), `calculus` (3753-3766) e `marking`
// (3769-3782).
//
// RIATTIVATI DAL TASK 5 (ora i ganci `displayHooks` sono riempiti):
//   - `String from any type` (683-687): `jme_string` chiama `treeToJME`.
//   - i tre assert di `Sub-expressions` che sostituiscono dentro la stringa
//     di `expression` (`expression("2{b}cos(x)")`, `expression("t*{f}")`,
//     `expression("t*({f})")`) e l'ultimo (`Numbas.jme.display.subvars`).
//
// ANCORA FUORI:
//   - `Calculus` (1578-1607) è tradotto per intero in jme-calculus.test.ts;
//     qui resta la verifica numerica del builtin `diff`.
//   - `parse(str, notation)` solo nel ramo d'errore, perché le notazioni
//     alternative (`jme-notations.js`) non sono portate (vedi
//     DIVERGENCES.md).

import { describe, it, expect } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import { unwrapValue } from "../../src/jme/evaluate";
import { compile } from "../../src/jme/parser";
import { Scope } from "../../src/jme/scope";
import { TExpression, TScope, type Token, type Tree } from "../../src/jme/tokens";
import { closeEqual, deepCloseEqual } from "./math-helpers";
import { raisesJmeError, treesEqual } from "./jme-helpers";
import { subvars as displaySubvars } from "../../src/jme/display";

/** Valuta nello scope dei builtin. */
function ev(expr: string, variables?: Record<string, unknown>): Token {
  const v = builtinScope.evaluate(expr, variables);
  expect(v, `${expr} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** Il valore grezzo del token. */
function val(t: Token): unknown {
  return (t as { value?: unknown }).value;
}

/** L'albero di un token `expression`. */
function tree(t: Token): Tree {
  return (t as TExpression).tree as Tree;
}

describe("Evaluating > Sub-expressions", () => {
  it("exec, expression e la sostituzione nelle stringhe", () => {
    const scope = new Scope([builtinScope]);
    const fn = scope.evaluate('function("sin")') as Token;
    scope.setVariable("fn", fn);
    const res = scope.evaluate("exec(fn,[1])") as Token;
    treesEqual(tree(res), compile("sin(1)") as Tree, 'fn=function("sin"); exec(fn,[1])');

    treesEqual(tree(scope.evaluate('expression("x+1")') as Token), compile("x+1") as Tree, "expression senza graffe");

    // jme-tests.mjs:1614-1623 — riattivati dal Task 5: la sostituzione dentro
    // la stringa di `expression` passa da `displayHooks.treeToJME`.
    const expr = scope.evaluate('expression("2{b}cos(x)")', { b: scope.evaluate("-2") as Token }) as Token;
    treesEqual(tree(expr), compile("2*(-2)*cos(x)") as Tree, "sostituzione dentro le stringhe di expression");

    const target = compile("t*(2t+5)") as Tree;
    scope.setVariable("f", builtinScope.evaluate('expression("2t+5")') as Token);
    treesEqual(
      tree(scope.evaluate('expression("t*{f}")') as Token),
      target,
      "sostituzione in expression senza parentesi",
    );
    treesEqual(
      tree(scope.evaluate('expression("t*({f})")') as Token),
      target,
      "sostituzione in expression con parentesi",
    );
    treesEqual(displaySubvars("t*({f})", scope), target, "jme.display.subvars");
  });

  // jme-tests.mjs:683-687 — `String from any type`, rimandato dal Task 4b
  // perché `jme_string` chiama `treeToJME`.
  it("String from any type", () => {
    expect(val(ev("jme_string(1)")), "jme_string(1)").toBe("1");
    expect(val(ev('jme_string(expression("x+y"))')), 'jme_string(expression("x+y"))').toBe("x + y");
    expect(val(ev("jme_string(vector(1,2,3))")), "jme_string(vector(1,2,3))").toBe("vector(1,2,3)");
  });

  it("parse, args, type, name, op e function", () => {
    treesEqual(tree(ev('parse("1+2")')), compile("1+2") as Tree, "parse");
    raisesJmeError(
      () => ev('parse("1+2","set_theory")'),
      "jme.func.parse.no notation",
      "le notazioni alternative non sono portate",
    );
    deepCloseEqual(
      (val(ev('args(expression("f(1,2)"))')) as Token[]).map((t) => (tree(t).tok as { value?: unknown }).value),
      [1, 2],
      "args",
    );
    expect(val(ev('type(expression("x+1"))')), "type di un'espressione").toBe("op");
    expect(val(ev("type(1)")), "type di un numero").toBe("integer");
    expect(ev('name("x")').type, "name").toBe("name");
    expect(val(ev("string(x)")), "string di un nome").toBe("x");
    expect(ev('op("+")').type, "op").toBe("op");
    expect(ev('function("sin")').type, "function").toBe("function");
    expect(ev('1 as "number"').type, "as converte il tipo").toBe("number");
  });

  it("eval, findvars, definedvariables e le inferenze di tipo", () => {
    closeEqual(val(ev('eval(expression("1+2"))')), 3, "eval");
    closeEqual(val(ev('eval(expression("x+2"), ["x": 1])')), 3, "eval con un dizionario di variabili");
    deepCloseEqual(unwrapValue(ev('findvars(expression("x+y"))')), ["x", "y"], "findvars");
    deepCloseEqual(unwrapValue(ev("definedvariables()")), [], "definedvariables in uno scope senza variabili");
    deepCloseEqual(
      unwrapValue(ev('infer_variable_types(expression("x+1"))')),
      { x: "number" },
      "infer_variable_types",
    );
    expect(val(ev('infer_type(expression("x+1"))')), "infer_type").toBe("number");
  });

  it("isset, unset e satisfy", () => {
    const scope = new Scope([builtinScope, { variables: { x: builtinScope.evaluate("1") as Token } }]);
    expect(val(scope.evaluate("isset(x)") as Token), "isset su una variabile definita").toBe(true);
    expect(val(scope.evaluate("isset(zzz)") as Token), "isset su una variabile non definita").toBe(false);
    closeEqual(val(scope.evaluate('unset(["variables": ["x"]], isset(x))') as Token), false, "unset");

    deepCloseEqual(
      (val(ev("satisfy([a],[1],[a=1])")) as Token[]).map((t) => val(t)),
      [1],
      "satisfy con una condizione subito vera",
    );
    raisesJmeError(
      () => ev("satisfy([a],[1],[a=2],3)"),
      "jme.func.satisfy.took too many runs",
      "satisfy che non converge",
    );
    raisesJmeError(
      () => ev("satisfy([a,b],[1],[true])"),
      "jme.func.satisfy.wrong number of definitions",
      "satisfy con un numero di definizioni sbagliato",
    );
    raisesJmeError(
      () => ev('satisfy([a],[1],["no"])'),
      "jme.func.satisfy.condition not a boolean",
      "satisfy con una condizione non booleana",
    );
  });

  it("canonical_compare, numerical_compare e scope_case_sensitive", () => {
    closeEqual(val(ev("canonical_compare(x,x)")), 0, "canonical_compare di due alberi uguali");
    expect(val(ev("canonical_compare(x,y)")) !== 0, "canonical_compare di due alberi diversi").toBe(true);
    expect(val(ev('numerical_compare(expression("x+x"), expression("2x"))')), "numerical_compare").toBe(true);
    expect(
      val(ev('numerical_compare(expression("x+x"), expression("3x"))')),
      "numerical_compare di espressioni diverse",
    ).toBe(false);
    expect(val(ev("scope_case_sensitive(1+1, true)")), "scope_case_sensitive valuta nel nuovo scope").toBe(2);
  });

  it("expand_juxtapositions e normalise_subscripts", () => {
    treesEqual(
      tree(ev('expand_juxtapositions(expression("xy"))')),
      compile("x*y") as Tree,
      "expand_juxtapositions",
    );
    expect(val(ev('normalise_subscripts("x_1")')), "normalise_subscripts").toBe("x_1");
  });

  it("simplify sugli alberi", () => {
    // `basic` da solo non toglie il fattore 1: la regola `unitFactor` è un
    // insieme a parte, incluso in `all` (jme-rules.js:2288).
    treesEqual(tree(ev('simplify(expression("1*x"), "all")')), compile("x") as Tree, "simplify con una stringa");
    treesEqual(
      tree(ev('simplify(expression("1*x"), ["all"])')),
      compile("x") as Tree,
      "simplify con una lista di insiemi",
    );
    treesEqual(tree(ev('simplify("1*x", "all")')), compile("x") as Tree, "simplify di una stringa");
  });

  it("le funzioni che costruiscono uno scope", () => {
    // `scope()`, `eval(expr, scope)`, `add_functions`, `add_function_sets` e
    // `remove_functions` sono verificati dal modulo `Scopes`
    // (jme-scopes.test.ts, `Scope JME functions`): qui restano le firme che
    // quel test non tocca.
    const withVars = (ev('set_variables(scope(), ["x": 1])') as TScope).scope;
    closeEqual(val(withVars.getVariable("x") as Token), 1, "set_variables");
    expect((ev("case_sensitive(scope(), true)") as TScope).scope.caseSensitive, "case_sensitive").toBe(true);
    closeEqual(val(ev('eval(expression("x"), scope() |> set_variables(["x": 2]))')), 2, "eval con scope e variabili");
    closeEqual(
      val(ev('eval(expression("x+1"), scope() |> add_function_sets(["arithmetic"]), ["x": 1])')),
      2,
      "eval con scope e dizionario",
    );
  });
});

describe("Evaluating > Pattern matching", () => {
  it("match, matches, replace e substitute", () => {
    const m = unwrapValue(ev('match(expression("x+1"), "?;a + ?;b")')) as {
      match: boolean;
      groups: Record<string, Tree>;
    };
    expect(m.match, "match riuscito").toBe(true);
    treesEqual(m.groups["a"] as Tree, compile("x") as Tree, "il gruppo a");
    treesEqual(m.groups["b"] as Tree, compile("1") as Tree, "il gruppo b");
    expect((unwrapValue(ev('match(expression("x"), "?;a + ?;b")')) as { match: boolean }).match, "match fallito").toBe(
      false,
    );
    expect(val(ev('matches(expression("x+1"), "?+?")')), "matches").toBe(true);
    expect(val(ev('matches(expression("x"), "?+?")')), "matches fallito").toBe(false);
    expect(val(ev('matches(expression("x+1"), "?+?", "ac")')), "matches con opzioni").toBe(true);
    treesEqual(
      tree(ev('replace("?;a+?;b", "b+a", expression("x+1"))')),
      compile("1+x") as Tree,
      "replace",
    );
    treesEqual(
      tree(ev('substitute(["x": expression("y")], expression("x+1"))')),
      compile("y+1") as Tree,
      "substitute",
    );
  });
});

describe("Evaluating > Calculus e marking", () => {
  it("diff deriva e semplifica", () => {
    // il confronto è numerico: la tabella upstream di `Calculus`
    // (jme-tests.mjs:1578-1607), che legge il risultato con `treeToJME`, è
    // tradotta in jme-calculus.test.ts.
    closeEqual(val(ev('eval(diff(expression("x^2"),"x"), ["x": 3])')), 6, 'diff(x^2, "x") in x=3');
    closeEqual(val(ev('eval(diff(expression("x"),"x"))')), 1, 'diff(x, "x")');
    closeEqual(val(ev('eval(diff(expression("x"),"y"))')), 0, 'diff(x, "y")');
    closeEqual(val(ev('eval(diff(expression("sin(x)"),"x"), ["x": 0])')), 1, 'diff(sin(x), "x") in x=0');
  });

  it("award e resultsequal", () => {
    closeEqual(val(ev("award(5,true)")), 5, "award(5,true)");
    closeEqual(val(ev("award(5,false)")), 0, "award(5,false)");
    expect(
      val(ev('resultsequal(dec("0.00001"),dec("0.00002"),"absdiff",0.001)')),
      'resultsequal(dec("0.00001"),dec("0.00002"),"absdiff",0.001)',
    ).toBe(true);
    expect(
      val(ev('resultsequal(dec("0.1"),dec("0.2"),"absdiff",0.001)')),
      'resultsequal(dec("0.1"),dec("0.2"),"absdiff",0.001)',
    ).toBe(false);
  });
});
