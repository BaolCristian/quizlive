// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit `Pattern-matching` di tests/jme/jme-tests.mjs
// (righe 2032-2233): i test `matchExpression` (2033-2208) e `replace`
// (2209-2233).
//
// Upstream lo scope è `Numbas.jme.builtinScope`; qui è `makePatternScope()`,
// che registra le costanti e le poche funzioni che i matcher valutano
// (il Task 4 porta i builtin veri).
//
// Due assert (2055-2056) verificano che `treeToJME` non perda le parentesi
// attorno agli operatori di pattern: si traducono nel Task 5, insieme al
// modulo di visualizzazione.

import { describe, expect, it } from "vitest";
import { compile } from "../../src/jme/parser";
import { isName, isOp } from "../../src/jme/evaluate";
import { Scope } from "../../src/jme/scope";
import type { TInt, Token, Tree } from "../../src/jme/tokens";
import type { PatternMatch } from "../../src/jme/rules-match";
import { matchExpression as matchExpressionRaw, patternParser } from "../../src/jme/rules-parser";
import { extendOptions, type MatchTreeOptions } from "../../src/jme/rules-terms";
import { Rule } from "../../src/jme/rules-transform";
import { treesSame } from "../../src/jme/compare";
import { evaluated, makePatternScope } from "./jme-helpers";

const scope = makePatternScope();

// jme-tests.mjs:2034-2036
/** `matchExpression` con lo scope di prova già impostato. */
function matchExpression(rule: string, expr: string, options?: MatchTreeOptions): PatternMatch {
  return matchExpressionRaw(rule, expr, extendOptions(options, { scope: scope }));
}

// jme-tests.mjs:2037-2040
/** Match di un pattern contro un albero già costruito. */
function matchTree(pattern: string, exprTree: Tree): PatternMatch {
  const r = new Rule(pattern, null);
  return r.match(exprTree, scope);
}

// jme-tests.mjs:2041-2051
/** Verifica che ogni nome catturato soddisfi il pattern indicato. */
function matchCapturedNames(
  pattern: string,
  namePatterns: Record<string, string>,
  expr: string,
  options?: MatchTreeOptions,
): boolean {
  const opts = extendOptions(options, { scope: scope });
  const m = matchExpression(pattern, expr, opts);
  if (m === false) {
    return false;
  }
  return Object.entries(namePatterns).every(([name, namePattern]) => {
    const r = new Rule(namePattern, null, opts);
    return r.match(m[name] as Tree, scope) !== false;
  });
}

/** Il token del solo valore di un'espressione, come albero. */
function tokTree(expr: string): Tree {
  return { tok: evaluated(scope, expr) };
}

describe("Pattern-matching > matchExpression", () => {
  it("riconosce i token del linguaggio dei pattern", () => {
    // jme-tests.mjs:2053-2054
    const tokens = patternParser.tokenise("`+-x");
    expect(isOp(tokens[0] as Token, "`+-"), "il primo token di `+-x è `+-").toBe(true);
  });

  it("nomi speciali", () => {
    // jme-tests.mjs:2058-2083
    expect(matchExpression("?", "x"), "? corrisponde a x").toBeTruthy();
    expect(matchExpression("?", "1+sin(x)"), "? corrisponde a 1+sin(x)").toBeTruthy();
    expect(matchExpression("?;x", "1"), "?;x corrisponde a 1").toBeTruthy();
    expect((matchExpression("?;x", "1") as Record<string, Tree>)["x"], "?;x cattura un gruppo x").toBeTruthy();
    expect(matchExpression("$n", "5"), "$n corrisponde a 5").toBeTruthy();
    expect(matchExpression("$n", "true"), "$n non corrisponde a true").toBe(false);
    expect(matchTree("complex:$n", tokTree("2+i")), "complex:$n corrisponde a 2+i").toBeTruthy();
    expect(matchExpression("complex:$n", "i"), "complex:$n corrisponde a i").toBeTruthy();
    expect(matchExpression("complex:$n", "2"), "complex:$n non corrisponde a 2").toBe(false);
    expect(matchExpression("imaginary:$n", "i"), "imaginary:$n corrisponde a i").toBeTruthy();
    expect(matchExpression("imaginary:$n", "2"), "imaginary:$n non corrisponde a 2").toBe(false);
    expect(matchTree("imaginary:$n", tokTree("2+i")), "imaginary:$n non corrisponde a 2+i").toBe(false);
    expect(matchExpression("real:$n", "2"), "real:$n corrisponde a 2").toBeTruthy();
    expect(matchExpression("real:$n", "i"), "real:$n non corrisponde a i").toBe(false);
    expect(matchExpression("positive:$n", "2"), "positive:$n corrisponde a 2").toBeTruthy();
    expect(matchTree("positive:$n", tokTree("-2")), "positive:$n non corrisponde a -2").toBe(false);
    expect(matchExpression("positive:$n", "i"), "positive:$n non corrisponde a i").toBe(false);
    expect(matchTree("negative:$n", tokTree("-2")), "negative:$n corrisponde a -2").toBeTruthy();
    expect(matchExpression("negative:$n", "5"), "negative:$n non corrisponde a 5").toBe(false);
    expect(matchExpression("nonnegative:$n", "0"), "nonnegative:$n corrisponde a 0").toBeTruthy();
    expect(matchExpression("nonnegative:$n", "15"), "nonnegative:$n corrisponde a 15").toBeTruthy();
    expect(matchExpression("nonnegative:$n", "i"), "nonnegative:$n corrisponde a i").toBeTruthy();
    expect(matchExpression("integer:$n", "5"), "integer:$n corrisponde a 5").toBeTruthy();
    expect(matchExpression("integer:$n", "1.5"), "integer:$n non corrisponde a 1.5").toBe(false);
    expect(matchExpression("$v", "x"), "$v corrisponde a x").toBeTruthy();
    expect(matchExpression("$v", "5"), "$v non corrisponde a 5").toBe(false);
    expect(matchExpression("?+$z", "x"), "?+$z corrisponde a x").toBeTruthy();
  });

  it("funzioni speciali m_*", () => {
    // jme-tests.mjs:2086-2126
    expect(matchExpression("sin(?)", "sin(5)"), "sin(?) corrisponde a sin(5)").toBeTruthy();
    expect(matchExpression("sin(0)", "0"), "sin(0) non corrisponde a 0").toBe(false);
    expect(matchExpression("m_uses(x,y)", "x+y"), "m_uses(x,y) corrisponde a x+y").toBeTruthy();
    expect(matchExpression("m_uses(x,y)", "x^2"), "m_uses(x,y) non corrisponde a x^2").toBe(false);
    expect(matchExpression("m_exactly(?+?)", "x+y"), "m_exactly(?+?) corrisponde a x+y").toBeTruthy();
    expect(
      matchExpression("m_exactly(?+?)", "x+y+z", { associative: true }),
      "m_exactly(?+?) non corrisponde a x+y+z",
    ).toBe(false);
    expect(
      matchExpression("m_commutative(1+2)", "2+1", { commutative: false }),
      "m_commutative(1+2) corrisponde a 2+1",
    ).toBeTruthy();
    expect(
      matchExpression("m_noncommutative(1+2)", "1+2", { commutative: true }),
      "m_noncommutative(1+2) corrisponde a 1+2",
    ).toBeTruthy();
    expect(
      matchExpression("m_noncommutative(1+2)", "2+1", { commutative: true }),
      "m_noncommutative(1+2) non corrisponde a 2+1",
    ).toBe(false);
    expect(
      matchExpression("m_noncommutative(1*2)+3", "3+1*2", { commutative: true }),
      "m_noncommutative(1*2)+3 corrisponde a 3+1*2",
    ).toBeTruthy();
    expect(
      matchExpression("m_noncommutative(1*2)+3", "3+2*1", { commutative: true }),
      "m_noncommutative(1*2)+3 non corrisponde a 3+2*1",
    ).toBe(false);
    expect(
      matchExpression("m_associative(1+2+3)", "1+2+3", { associative: false }),
      "m_associative(1+2+3) corrisponde a 1+2+3",
    ).toBeTruthy();
    expect(
      matchExpression("m_associative(1+2+3)", "3+2+1", { associative: false, commutative: false }),
      "m_associative(1+2+3) non corrisponde a 3+2+1",
    ).toBe(false);
    expect(
      matchExpression("m_nonassociative(1+2+3)", "(1+2)+3", { associative: true }),
      "m_nonassociative(1+2+3) corrisponde a (1+2)+3",
    ).toBeTruthy();
    expect(
      matchExpression("m_nonassociative(1+2+3)", "1+(2+3)", { associative: true }),
      "m_nonassociative(1+2+3) non corrisponde a 1+(2+3)",
    ).toBe(false);
    expect(
      matchExpression("m_nonassociative(1*2*3)+4+5", "(1*2)*3+(4+5)", { associative: true }),
      "m_nonassociative(1*2*3)+4+5 corrisponde a (1*2)*3+(4+5)",
    ).toBeTruthy();
    expect(matchExpression("?+?", "x-y"), "?+? corrisponde a x-y").toBeTruthy();
    // upstream: passa perché m_strictplus è un nome qualunque — non esiste fra
    // le `specialMatchFunctions` (l'unico "strict" vero è m_strictinverse), e
    // `matchOrdinaryFunction` cerca una funzione chiamata proprio così in x-y.
    expect(matchExpression("m_strictplus(?+?)", "x-y"), "m_strictplus(?+?) non corrisponde a x-y").toBe(false);
    expect(matchExpression('m_type("boolean")', "true"), 'm_type("boolean") corrisponde a true').toBeTruthy();
    expect(matchExpression('m_type("boolean")', "x=y"), 'm_type("boolean") non corrisponde a x=y').toBe(false);
    expect(
      matchExpression('m_func("sum",[$n`*])', "sum(1,2,3)"),
      'm_func("sum",[$n`*]) corrisponde a sum(1,2,3)',
    ).toBeTruthy();
    expect(
      matchExpression('m_func("sum",[$n`*])', "mean(1,2,3)"),
      'm_func("sum",[$n`*]) non corrisponde a mean(1,2,3)',
    ).toBe(false);
    expect(matchExpression('m_func("sum",[$n`*])', "sum(x)"), 'm_func("sum",[$n`*]) non corrisponde a sum(x)').toBe(
      false,
    );
    expect(matchExpression('m_op("+",[$n,x])', "1+x"), 'm_op("+",[$n,x]) corrisponde a 1+x').toBeTruthy();
    expect(matchExpression('m_op("+",[$n,x])', "1-x"), 'm_op("+",[$n,x]) non corrisponde a 1-x').toBe(false);
    expect(matchExpression('m_op("+",[$n,x])', "x+1"), 'm_op("+",[$n,x]) non corrisponde a x+1').toBe(false);
    expect(matchExpression("m_anywhere(?*?)", "x+2z"), "m_anywhere(?*?) corrisponde a x+2z").toBeTruthy();
    expect(matchExpression("m_anywhere(?*?)", "x+2"), "m_anywhere(?*?) non corrisponde a x+2").toBe(false);
    expect(matchExpression("m_anywhere(?/?)", "2x/y"), "m_anywhere(?/?) corrisponde a 2x/y").toBeTruthy();
    expect(matchExpression("f(?)", "f(x)"), "f(?) corrisponde a f(x)").toBeTruthy();
    expect(matchExpression("f(?)", "F(x)"), "f(?) corrisponde a F(x) senza distinzione di maiuscole").toBeTruthy();
    const s = new Scope([scope, { caseSensitive: true }]);
    expect(
      matchExpressionRaw("f(?)", "f(x)", { scope: s }),
      "f(?) corrisponde a f(x) con distinzione di maiuscole",
    ).toBeTruthy();
    expect(
      matchExpressionRaw("f(?)", "F(x)", { scope: s }),
      "f(?) non corrisponde a F(x) con distinzione di maiuscole",
    ).toBe(false);
  });

  it("operatori", () => {
    // jme-tests.mjs:2129-2183
    expect(matchExpression("x+y", "x+y"), "x+y corrisponde a x+y").toBeTruthy();
    expect(matchExpression("x+y", "y+x"), "x+y corrisponde a y+x (+ è commutativo)").toBeTruthy();
    expect(matchExpression("x-y", "y-x"), "x-y non corrisponde a y-x").toBe(false);
    expect(matchExpression("-?", "-2"), "-? corrisponde a -2").toBeTruthy();
    expect(matchExpression("-?", "0-2"), "-? non corrisponde a 0-2").toBe(false);

    expect(matchExpression("x+y`?", "x+y"), "x+y`? corrisponde a x+y").toBeTruthy();
    expect(matchExpression("x+y`?", "x"), "x+y`? corrisponde a x").toBeTruthy();
    expect(
      matchExpression("x+y`?", "x+y+y", { allowOtherTerms: false }),
      "x+y`? non corrisponde a x+y+y",
    ).toBe(false);

    expect(matchExpression("x+y`*", "x+y"), "x+y`* corrisponde a x+y").toBeTruthy();
    expect(matchExpression("x+y`*", "x"), "x+y`* corrisponde a x").toBeTruthy();
    expect(
      matchExpression("x+y`*", "x+y+y", { allowOtherTerms: false }),
      "x+y`* corrisponde a x+y+y",
    ).toBeTruthy();

    expect(matchExpression("x+y`+", "x+y"), "x+y`+ corrisponde a x+y").toBeTruthy();
    expect(matchExpression("x+y`+", "x"), "x+y`+ non corrisponde a x").toBe(false);
    expect(
      matchExpression("x+y`+", "x+y+y", { allowOtherTerms: false }),
      "x+y`+ corrisponde a x+y+y",
    ).toBeTruthy();

    expect(matchExpression("x `| y", "x"), "x `| y corrisponde a x").toBeTruthy();
    expect(matchExpression("x `| y", "y"), "x `| y corrisponde a y").toBeTruthy();
    expect(matchExpression("x `| y", "z"), "x `| y non corrisponde a z").toBe(false);

    expect(matchExpression("x+(y `: 1)", "x"), "x+(y `: 1) corrisponde a x").toBeTruthy();
    expect(matchExpression("x+(y `: 1)", "x+y"), "x+(y `: 1) corrisponde a x+y").toBeTruthy();
    expect(matchExpression("x+(y `: 1)", "x+z"), "x+(y `: 1) corrisponde a x+z").toBeTruthy();
    const rhs = (matchExpression("x+(y `: 1);rhs", "x+y") as Record<string, Tree>)["rhs"] as Tree;
    expect(isName(rhs.tok, "y"), "x+(y `: 1);rhs su x+y cattura rhs come y").toBe(true);
    const res = ((matchExpression("x+(y `: 1);rhs", "x") as Record<string, Tree>)["rhs"] as Tree).tok;
    expect(res.type === "integer" && (res as TInt).value === 1, "x+(y `: 1);rhs su x cattura rhs come 1").toBe(true);

    expect(matchExpression("`+- x", "x"), "`+- x corrisponde a x").toBeTruthy();
    expect(matchExpression("`+- x", "-x"), "`+- x corrisponde a -x").toBeTruthy();
    expect(matchExpression("x + (`+- y)", "x+y"), "x + (`+- y) corrisponde a x+y").toBeTruthy();
    expect(matchExpression("x + (`+- y)", "x-y"), "x + (`+- y) corrisponde a x-y").toBeTruthy();
    expect(matchExpression("x + y", "x-y"), "x + y non corrisponde a x-y").toBe(false);

    expect(matchExpression("`! x", "y"), "`! x corrisponde a y").toBeTruthy();
    expect(matchExpression("`! x", "x"), "`! x non corrisponde a x").toBe(false);
    expect(matchExpression("`! m_uses(x)", "y+sin(z)"), "`! m_uses(x) corrisponde a y+sin(z)").toBeTruthy();

    expect(
      matchExpression("m_uses(x) `& `! m_uses(y)", "x+z"),
      "m_uses(x) `& `! m_uses(y) corrisponde a x+z",
    ).toBeTruthy();
    expect(
      matchExpression("m_uses(x) `& `! m_uses(y)", "x+y"),
      "m_uses(x) `& `! m_uses(y) non corrisponde a x+y",
    ).toBe(false);

    expect(
      matchExpression("$n;x + $n;y `where x+y=4", "1+3"),
      "$n;x + $n;y `where x+y=4 corrisponde a 1+3",
    ).toBeTruthy();
    expect(
      matchExpression("$n;x + $n;y `where x+y=4", "0.5+3.5"),
      "$n;x + $n;y `where x+y=4 corrisponde a 0.5+3.5",
    ).toBeTruthy();
    expect(matchExpression("$n;x + $n;y `where x+y=4", "2+3"), "$n;x + $n;y `where x+y=4 non corrisponde a 2+3").toBe(
      false,
    );

    expect(
      matchExpression('["f": $n/$n] `@ f + f', "1/2 + 3/4"),
      '["f": $n/$n] `@ f + f corrisponde a 1/2 + 3/4',
    ).toBeTruthy();

    expect(
      matchExpression("$n`+/$n`?", "3pi/4", { allowOtherTerms: true, strictInverse: true }),
      "$n`+/$n`? non corrisponde a 3pi/4 con strictInverse",
    ).toBe(false);

    expect(
      matchExpression("((`*/ `+- $n)`*;x)*i", "-(1/2)*pi*i"),
      "gestisce il meno unario fra i fattori",
    ).toBeTruthy();

    expect(
      matchExpression("rational:$n * (x + y)", "1/4 * (x+y)", { allowOtherTerms: false }),
      "fattore razionale",
    ).toBeTruthy();
  });

  it("liste", () => {
    // jme-tests.mjs:2186-2193
    expect(matchExpression("[]", "[]"), "[] corrisponde a []").toBeTruthy();
    expect(matchExpression("[1,2,3]", "[1,2,3]"), "[1,2,3] corrisponde a [1,2,3]").toBeTruthy();
    expect(matchExpression("[1,2,3]", "[3,2,1]"), "[1,2,3] non corrisponde a [3,2,1]").toBe(false);
    expect(matchExpression("[1,2,3]", "[1,2]"), "[1,2,3] non corrisponde a [1,2]").toBe(false);
    expect(matchExpression("[$n`+]", "[1,2,3]"), "[$n`+] corrisponde a [1,2,3]").toBeTruthy();
    expect(matchExpression("[$n`+,3]", "[1,2,3]"), "[$n`+,3] corrisponde a [1,2,3]").toBeTruthy();
    expect(matchExpression("[$n`+,2]", "[1,2,3]"), "[$n`+,2] non corrisponde a [1,2,3]").toBe(false);
    expect(matchExpression("[$n`+,2`?]", "[1,2,3]"), "[$n`+,2`?] corrisponde a [1,2,3]").toBeTruthy();
  });

  it("gruppi con nome", () => {
    // jme-tests.mjs:2196-2204
    expect(matchCapturedNames("?;x", { x: "1" }, "1"), "?;x su 1 cattura x come 1").toBe(true);
    expect(
      matchCapturedNames("?;x", { x: "sin(pi+3)" }, "sin(pi+3)"),
      "?;x su sin(pi+3) cattura x come sin(pi+3)",
    ).toBe(true);
    expect(matchCapturedNames("?`+;x+?;y", { x: "1", y: "2" }, "1+2"), "?;x+?;y su 1+2 cattura x=1 e y=2").toBe(true);
    expect(matchCapturedNames("?`+;x+y", { x: "x+2" }, "x+2+y"), "?`+;x+y su x+2+y cattura x come x+2").toBe(true);
    expect(matchCapturedNames("?`+;x+y", { x: "x+2" }, "x+y+2"), "?`+;x+y su x+y+2 cattura x come x+2").toBe(true);
    expect(matchCapturedNames("2^(-?;x)", { x: "1" }, "2^-1"), "2^(-?;x) su 2^-1 cattura x come 1").toBe(true);
    expect(matchCapturedNames("sin(?;x)", { x: "1" }, "sin(1)"), "sin(?;x) su sin(1) cattura x come 1").toBe(true);
    expect(
      matchCapturedNames("f(?;x,?;x)", { x: "[1,2]" }, "f(1,2)"),
      "f(?;x,?;x) su f(1,2) cattura x come [1,2]",
    ).toBe(true);
  });

  it("nomi identificati", () => {
    // jme-tests.mjs:2207-2213
    expect(matchExpression("$n*?;=x + $n*?;=x", "2y+3y"), "$n*?;=x + $n*?;=x corrisponde a 2y+3y").toBeTruthy();
    expect(
      matchExpression("$n*?;=x + $n*?;=x", "2(x+1)+3(x+1)"),
      "$n*?;=x + $n*?;=x corrisponde a 2(x+1)+3(x+1)",
    ).toBeTruthy();
    expect(matchExpression("$n*?;=x + $n*?;=x", "2(x+1)+3z"), "$n*?;=x + $n*?;=x non corrisponde a 2(x+1)+3z").toBe(
      false,
    );

    expect(
      matchExpression("($n `| ?;=x)`* + $z", "1+x+x+2", { allowOtherTerms: false }),
      "($n `| ?;=x)`* + $z corrisponde a 1+x+x+2: un termine può non corrispondere a un nome identificato",
    ).toBeTruthy();
    expect(
      matchExpression("($n `| ?;=x)`* + $z", "1+x+y+2", { allowOtherTerms: false }),
      "($n `| ?;=x)`* + $z non corrisponde a 1+x+y+2",
    ).toBe(false);
  });
});

describe("Pattern-matching > replace", () => {
  // jme-tests.mjs:2210-2217
  /** Applica la regola una volta sola in cima all'albero. */
  function replace(pattern: string, repl: string, options: string, expr: string): { expression: Tree; changed: boolean } {
    const rule = new Rule(pattern, repl, options);
    return rule.replace(compile(expr) as Tree, scope);
  }
  /** Applica la regola ovunque nell'albero. */
  function replaceAll(
    pattern: string,
    repl: string,
    options: string,
    expr: string,
  ): { expression: Tree; changed: boolean } {
    const rule = new Rule(pattern, repl, options);
    return rule.replaceAll(compile(expr) as Tree, scope);
  }

  it("riscrive l'espressione quando la regola corrisponde", () => {
    // jme-tests.mjs:2219-2233 — upstream confronta `treeToJME(res.expression)`
    // con una stringa; qui il confronto è strutturale (il Task 5 porta
    // `treeToJME`).
    let res = replace("?;x+?;y", "x*y", "acg", "1+2");
    expect(res.changed, "1+2 cambia").toBe(true);
    expect(treesSame(res.expression, compile("1*2") as Tree, scope), "1+2 diventa 1*2").toBe(true);

    res = replace("?;x+?;y", "x*y", "acg", "1*2");
    expect(res.changed, "1*2 non cambia").toBe(false);

    res = replace("?;x*?;y", "x+y", "acg", "1*2+3*4");
    expect(res.changed, "replace non scende nei sottoalberi").toBe(false);

    res = replaceAll("?;x*?;y", "x+y", "acg", "1*2+3*4");
    expect(res.changed, "replaceAll cambia 1*2+3*4").toBe(true);
    expect(
      treesSame(res.expression, compile("(1+2)+(3+4)") as Tree, scope),
      "1*2+3*4 diventa (1+2)+(3+4)",
    ).toBe(true);
  });
});
