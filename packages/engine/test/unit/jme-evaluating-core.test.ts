// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione dei test di meccanismo del modulo QUnit `Evaluating`
// (tests/jme/jme-tests.mjs:457-1639): `jme.typecheck` (487),
// `jme.findCompatibleType` (493), `Number-like types` (505),
// `jme.enumerate_signatures` (560), `jme.inferVariableTypes` (565),
// `jme.inferExpressionType` (583), `Safe strings` (631), `Annotations` (839),
// `wrapValue` (1502), `isRandom` (1513), `isDeterministic` (1539),
// `Sub-expressions` (1608), `Make fast` (1625).
//
// Dove upstream valuta espressioni con funzioni builtin si usa `makeToyScope()`
// (che avvolge `math/`) e si sostituisce la funzione builtin con quella
// equivalente dello scope giocattolo. Le `assert` che non si possono rendere
// indipendenti dai builtin sono COPERTE DAL TASK 4, e sono:
//   - `Number-like types`: tutto quel che riguarda i tipi prodotti
//     dall'aritmetica esatta (`1^1` intero, `1/2` razionale, `1+dec(1)`
//     decimale, `1..5 except 2..3`, `vector([1,dec(1),1/2])`, `isnan`), perché
//     dipende dalle definizioni di `+`, `/`, `^`, `except` dei builtin.
//   - `jme.inferVariableTypes`/`jme.inferExpressionType`: i casi con `det`,
//     `cross`, `dot`, `vector`, `log`, `random`, `id`, `countdp`, `gcd`,
//     `transpose`.
//   - `Safe strings`: la funzione `safe` (qui si prova direttamente
//     `makeSafe`, che è quel che `safe` chiama).
//   - `Annotations`: `dot:x=x` e `dot:bar:x=bar:dot:x`, che chiedono un `=`
//     definito su `?,?`.
//   - `Sub-expressions`: `function("sin")`, `exec`, `expression("2{b}cos(x)")`
//     e `jme.display.subvars` (quest'ultimo è del Task 5).

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { FuncObj, parseSignature, signature } from "../../src/jme/funcobj";
import { Scope } from "../../src/jme/scope";
import { compile } from "../../src/jme/parser";
import { enumerate_signatures, inferExpressionType, inferVariableTypes, makeFast } from "../../src/jme/infer";
import {
  castToType,
  findCompatibleType,
  findvars,
  isDeterministic,
  isRandom,
  makeSafe,
  unwrapSubexpression,
  substituteTree,
  unwrapValue,
  wrapValue,
} from "../../src/jme/evaluate";
import { treesSame } from "../../src/jme/compare";
import {
  TDict,
  TExpression,
  TInt,
  TList,
  TName,
  TNum,
  TString,
  type Token,
  type Tree,
} from "../../src/jme/tokens";
import { closeEqual } from "./math-helpers";
import { makeToyScope, raisesJmeError, treesEqual } from "./jme-helpers";

/** Un albero compilato, con la certezza che non sia `null`. */
function c(expr: string): Tree {
  return compile(expr) as Tree;
}

/** Uno scope giocattolo con una funzione dichiarata casuale, `rnd`. */
function scopeWithRandom(): Scope {
  const scope = makeToyScope();
  scope.addFunction(
    new FuncObj("rnd", ["?", "?"], TNum, (() => 0.5) as (...a: never[]) => unknown, { random: true }),
  );
  return scope;
}

describe("Evaluating (meccanismo)", () => {
  it("jme.typecheck", () => {
    const scope = makeToyScope();
    raisesJmeError(() => scope.evaluate("x()"), "jme.typecheck.function not defined", "funzione non definita: x()");
    raisesJmeError(
      () => new Scope().evaluate("x+y"),
      "jme.typecheck.op not defined",
      "operatore non definito in uno scope vuoto: x+y",
    );
    // upstream: `gcd(2)`; qui `abs` è la funzione a un argomento dello scope
    // giocattolo, chiamata con due.
    raisesJmeError(
      () => scope.evaluate("abs(1,2)"),
      "jme.typecheck.no right type definition",
      "nessuna definizione adatta: abs(1,2)",
    );
    // jme.js:2880-2887: se togliendo la prima lettera resta una funzione nota,
    // il messaggio suggerisce la moltiplicazione implicita.
    raisesJmeError(
      () => scope.evaluate("xabs(1)"),
      "jme.typecheck.function maybe implicit multiplication",
      "xabs(1)",
    );
  });

  it("jme.findCompatibleType", () => {
    expect(findCompatibleType("number", "number"), "number,number -> number").toBe("number");
    expect(findCompatibleType("integer", "number"), "integer,number -> number").toBe("number");
    expect(findCompatibleType("number", "integer"), "number,integer -> number").toBe("number");
    expect(findCompatibleType("integer", "integer"), "integer,integer -> integer").toBe("integer");
    expect(findCompatibleType("number", "decimal"), "number,decimal -> decimal").toBe("decimal");
    expect(findCompatibleType("integer", "decimal"), "integer,decimal -> decimal").toBe("decimal");
    expect(findCompatibleType("number", "string"), "number,string -> undefined").toBeUndefined();
  });

  it("Number-like types", () => {
    const scope = makeToyScope();
    expect(scope.evaluate("1").type, "1 è un intero").toBe("integer");
    expect(scope.evaluate("1.0").type, "1.0 è un number").toBe("number");
    expect(scope.evaluate("true").type, "true è un boolean").toBe("boolean");
    expect(scope.evaluate('"a"').type, '"a" è una stringa').toBe("string");

    // jme.js:3694-3726: un `number` con precisione dichiarata si converte in
    // `decimal` arrotondato a quella precisione.
    const n = new TNum(33 / 2572780);
    n.value = (n.value as number) - Math.pow(10, -17);
    n.precisionType = "dp";
    n.precision = 17;
    const dn = (castToType(n, "decimal") as { value: math.ComplexDecimal }).value;
    expect(dn + "", "il number a 17 dp diventa un decimal a 17 dp").toBe("0.00001282659224651");

    // la precisione può essere negativa (la parte "numero" lo consente): la
    // conversione non deve lanciare.
    const big = new TNum(Math.PI * Math.pow(10, 20));
    big.precisionType = "dp";
    big.precision = -30;
    expect(String((castToType(big, "decimal") as { value: math.ComplexDecimal }).value)).toBe(
      "314159265358979334144",
    );
  });

  it("jme.enumerate_signatures", () => {
    const sig = parseSignature("number or decimal");
    expect(enumerate_signatures(sig, 1)).toEqual([["number"], ["decimal"]]);
    expect(enumerate_signatures(signature.type("number"), 2), "una firma singola non accetta 2 argomenti").toEqual(
      [],
    );
    expect(enumerate_signatures(parseSignature("*number"), 2)).toEqual([["number", "number"]]);
    expect(enumerate_signatures(parseSignature("?"), 1)).toEqual([[undefined]]);
    expect(enumerate_signatures(parseSignature("list of number"), 1)).toEqual([["list"]]);
  });

  it("jme.inferVariableTypes", () => {
    const scope = makeToyScope();
    /** I tipi inferiti per le variabili libere dell'espressione. */
    function infer(expr: string): Record<string, string> {
      return inferVariableTypes(c(expr), scope);
    }
    expect(infer("x"), "x non dice nulla").toEqual({});
    expect(infer("1"), "1 non dice nulla").toEqual({});
    expect(infer("x+x"), "x+x dà x number").toEqual({ x: "number" });
    expect(infer("x+abs(x)"), "x+abs(x) dà x number").toEqual({ x: "number" });
    expect(infer("x<1"), "x<1 dà x number").toEqual({ x: "number" });
    expect(infer("x+y"), "x+y dà x e y number").toEqual({ x: "number", y: "number" });
  });

  it("jme.inferExpressionType", () => {
    const scope = makeToyScope();
    scope.setConstant("pi", { value: new TNum(Math.PI) });
    /** Il tipo inferito per l'espressione. */
    function infer(expr: string): string | undefined {
      return inferExpressionType(c(expr), scope);
    }
    expect(infer("1"), "1 dà integer").toBe("integer");
    expect(infer("pi"), "pi dà number").toBe("number");
    expect(infer("a*pi"), "a*pi dà number").toBe("number");
    expect(infer("x<1"), "x<1 dà boolean").toBe("boolean");
  });

  it("Safe strings", () => {
    // jme.js:638-662 — `makeSafe` è quel che la funzione builtin `safe` chiama.
    const s = makeSafe(new TString("a")) as TString;
    expect(s.value).toBe("a");
    expect(s.safe, 'safe("a") è marcata come sicura').toBe(true);
    expect((makeSafe(s) as TString).safe, "safe(safe(...)) resta sicura").toBe(true);

    const list = makeSafe(new TList([new TString("a"), new TString("b")])) as TList;
    expect(((list.value as Token[])[0] as TString).safe, "la marcatura scende negli elementi").toBe(true);
    const dict = makeSafe(new TDict({ k: new TString("a") })) as TDict;
    expect(((dict.value as Record<string, Token>)["k"] as TString).safe).toBe(true);

    // una stringa sicura non viene sostituita in valutazione (jme.js:3197-3213)
    const scope = makeToyScope();
    const safeString = new TString("{1+1}");
    safeString.safe = true;
    expect((scope.evaluate({ tok: safeString }) as TString).value).toBe("{1+1}");
  });

  it("Annotations", () => {
    const scope = makeToyScope();
    // le annotazioni fanno parte del nome: `dot:x` e `x` sono variabili diverse
    const tok = c("dot:x").tok as TName;
    expect(tok.annotation, "l'annotazione è conservata").toEqual(["dot"]);
    expect(tok.name).toBe("dot:x");
    expect(tok.nameWithoutAnnotation).toBe("x");
    expect(findvars(c("dot:x+x"), [], scope).sort(), "dot:x e x sono nomi distinti").toEqual(["dot:x", "x"]);

    const nested = c("dot:bar:x").tok as TName;
    expect(nested.annotation).toEqual(["dot", "bar"]);
    expect(nested.name).toBe("dot:bar:x");

    // upstream: `dot:sin(1)` non è definita; qui la funzione dello scope
    // giocattolo è `abs`.
    raisesJmeError(() => scope.evaluate("dot:abs(1)"), "jme.typecheck.function not defined", "dot:abs(1)");
  });

  it("wrapValue", () => {
    const m = [[0]] as unknown as math.Matrix;
    m.rows = 1;
    m.columns = 1;
    expect(wrapValue(m).type, "wrapValue su una lista senza suggerimento dà una lista").toBe("list");
    expect(wrapValue(m, "matrix").type, "wrapValue con suggerimento matrix").toBe("matrix");
    expect(wrapValue(null).type, "wrapValue su null dà la stringa vuota").toBe("string");
    expect((wrapValue(null) as TString).value).toBe("");
    expect(wrapValue(undefined).type, "wrapValue su undefined dà la stringa vuota").toBe("string");
    expect(wrapValue({ a: 1 }).type, "wrapValue su un oggetto dà un dizionario").toBe("dict");
    expect(wrapValue(new TList(1)).type, "wrapValue su un token lo lascia com'è").toBe("list");
    expect(wrapValue(1n).type, "wrapValue su un bigint dà un intero").toBe("integer");
    expect(wrapValue([1, 2], "set").type, "wrapValue con suggerimento set").toBe("set");
    expect(wrapValue(true).type).toBe("boolean");

    // unwrapValue è l'inverso (jme.js:595-616)
    expect(unwrapValue(new TInt(3)), "integer si spacchetta in un number").toBe(3);
    expect(unwrapValue(new TInt(3), { bigInts: true }), "con bigInts si spacchetta in un bigint").toBe(3n);
    expect(unwrapValue(new TName("x")), "un nome si spacchetta nel suo nome").toBe("x");
    expect(unwrapValue(wrapValue([1, 2]))).toEqual([1, 2]);
  });

  it("isRandom", () => {
    const scope = scopeWithRandom();
    /** `isRandom` sull'espressione data. */
    function check(expr: string, expected: boolean): void {
      expect(isRandom(c(expr), scope), expr).toBe(expected);
    }
    check("1", false);
    check("rnd(1,2)", true);
    check("1+rnd(3,4)", true);
    check("[1]", false);
    check("[rnd(1,2)]", true);
    check('["A":1]', false);
    check('["A":rnd(1,2)]', true);
    check("f(rnd(1,2))", true);
    check('"{rnd(1,2)}"', true);
    check('"{rnd(1,2}"', false);
    check("a -> 1", false);
    check("a -> rnd(a,0)", true);
    check("map(a -> rnd(a..2a), 0..3)", true);

    const s = makeToyScope();
    const fn = new FuncObj("fn", ["?"], TNum, (() => 1) as (...a: never[]) => unknown);
    s.addFunction(fn);
    expect(isRandom(c("fn(1)"), s), "una funzione senza random esplicito non è casuale").toBe(false);
    fn.random = true;
    expect(isRandom(c("fn(1)"), s), "una funzione con random esplicito è casuale").toBe(true);
  });

  it("isDeterministic", () => {
    const scope = scopeWithRandom();
    scope.addFunction(
      new FuncObj("safe", ["?"], TString, ((s: string) => s) as (...a: never[]) => unknown, { random: false }),
    );
    /** `isDeterministic` sull'espressione data. */
    function check(expr: string, expected: boolean): void {
      expect(isDeterministic(c(expr), scope), expr).toBe(expected);
    }
    check("1", true);
    check("1+2", true);
    check("rnd(1,2)", false);
    check("1+rnd(3,4)", false);
    check("[1]", true);
    check("[rnd(1,2)]", false);
    check('["A":1]', true);
    check('["A":rnd(1,2)]', false);
    check("f(rnd(1,2))", false);
    check("f(3)", false);
    check('"{rnd(1,2)}"', false);
    check('"{rnd(1,2}"', true);
    check('"{a} then {rnd(1,2)}"', false);
    check('"{a} then {b}"', true);
    check('safe("queste graffe vuote: {}")', true);
    check("a -> 1", true);
    check("a -> rnd(a,0)", false);
    check("map(a -> rnd(a..2a), 0..3)", false);

    const s1 = makeToyScope();
    s1.addFunction(new FuncObj("fn", ["?"], TNum, (() => 1) as (...a: never[]) => unknown));
    expect(
      isDeterministic(c("fn(1)"), s1),
      "una funzione senza random esplicito non è deterministica",
    ).toBe(false);

    const s2 = makeToyScope();
    s2.addFunction(
      new FuncObj("fn", ["?"], TNum, (() => 1) as (...a: never[]) => unknown, { random: false }),
    );
    expect(isDeterministic(c("fn(1)"), s2), "con random:false è deterministica").toBe(true);
  });

  it("Sub-expressions", () => {
    const scope = makeToyScope();
    // jme.js:4364-4373: un `TExpression` costruito da una stringa la compila,
    // e spacchetta le sotto-espressioni annidate.
    const e = new TExpression("1+2");
    treesEqual(e.tree as Tree, c("1+2"), 'expression("1+2")');
    const nested = new TExpression({ tok: new TExpression("1+2") });
    treesEqual(nested.tree as Tree, c("1+2"), "le espressioni annidate si spacchettano");
    expect(unwrapSubexpression({ tok: new TExpression("x") }).tok.type).toBe("name");

    // un token `expression` si valuta in sé stesso (jme.js:3280-3281, ramo
    // di default): è l'albero che contiene a essere valutato altrove.
    const exprTok = new TExpression("2*b");
    expect(scope.evaluate({ tok: exprTok }), "un'espressione si valuta in sé stessa").toBe(exprTok);
    const withVar = new Scope([scope, { variables: { b: new TNum(-2) } }]);
    expect(
      (withVar.evaluate(exprTok.tree as Tree) as TNum).value,
      "le variabili si sostituiscono nell'albero dell'espressione",
    ).toBe(-4);
    // jme.js:238-240: con `unwrapExpressions` la sostituzione spacchetta il
    // token `expression` invece di lasciarlo dentro l'albero.
    const holder = new Scope([scope, { variables: { f: new TExpression("2*t+5") } }]);
    treesEqual(
      substituteTree(c("t*f"), holder, true, true),
      c("t*(2*t+5)"),
      "sostituire un'espressione dentro un albero",
    );

    expect(treesSame(c("1+2"), c("1+2"), scope), "treesSame su alberi uguali").toBe(true);
    expect(treesSame(c("1+2"), c("1+3"), scope), "treesSame su alberi diversi").toBe(false);
  });

  it("Make fast", () => {
    const scope = makeToyScope();
    scope.setVariable("a", scope.evaluate("5"));

    const f1 = makeFast(c("x^2"), scope, ["x"]);
    closeEqual(f1(2 as never), 4, "x^2 con x=2");
    closeEqual(f1(1.5 as never), 9 / 4, "x^2 con x=1.5");

    const f2 = makeFast(c("x+a"), scope, ["x"]);
    closeEqual(f2(2 as never), 7, "x+a con x=2");

    const f3 = makeFast(c("(1/2)x"), makeToyScope(), ["x"]);
    expect(f3(1 as never), "i numeri razionali funzionano").toBeTruthy();

    // jme.js:5666-5668: una funzione senza definizione nativa non si può
    // compilare in forma veloce.
    const lazyScope = makeToyScope();
    raisesJmeError(
      () => makeFast(c("if(x<1,1,2)"), lazyScope, ["x"]),
      "jme.makeFast.no fast definition of function",
      "if è pigra",
    );
  });
});
