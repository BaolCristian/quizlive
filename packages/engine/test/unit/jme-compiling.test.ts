// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit `Compiling` di tests/jme/jme-tests.mjs:140-456
// (20 test). Le `assert` che valutano espressioni con funzioni builtin sono
// segnalate volta per volta: quelle sono coperte dal Task 4.

import { describe, it, expect } from "vitest";
import { compile, Parser, tokenise } from "../../src/jme/parser";
import { FuncObj } from "../../src/jme/funcobj";
import { Scope } from "../../src/jme/scope";
import { TBool, TInt, TName, TNum, TOp, TPunc, TString, type Token, type Tree } from "../../src/jme/tokens";
import { closeEqual } from "./math-helpers";
import { makeToyScope, raisesJmeError, tokWithPos, treesEqual } from "./jme-helpers";

/** Un albero compilato, con la certezza che non sia `null`. */
function c(expr: string): Tree {
  return compile(expr) as Tree;
}

describe("Compiling", () => {
  it("Booleans", () => {
    const t_true = new TBool(true);
    t_true.pos = 0;
    expect(tokenise("true")).toEqual([t_true]);
    expect(tokenise("TRUE")).toEqual([t_true]);
    expect(tokenise("True")).toEqual([t_true]);
    expect((tokenise("true")[0] as TBool).value).toBe(true);

    const t_false = new TBool(false);
    t_false.pos = 0;
    expect(tokenise("false")).toEqual([t_false]);
    expect(tokenise("FALSE")).toEqual([t_false]);
    expect(tokenise("False")).toEqual([t_false]);
    expect((tokenise("false")[0] as TBool).value).toBe(false);
  });

  it("Numbers", () => {
    /** Un letterale numerico dà un solo token, del tipo e valore attesi. */
    function checkNumber(str: string, expected: number): void {
      const n = tokenise(str);
      expect(n.length, `${str} è un solo token`).toBe(1);
      const tok = n[0] as Token;
      const expectedTok = /^\p{Nd}+(?!\.)/u.exec(str) ? new TInt(expected) : new TNum(expected);
      expect(tok.type, `${str} è di tipo ${expectedTok.type}`).toBe(expectedTok.type);
      closeEqual((tok as TNum).value, (expectedTok as TNum).value, `${str} ha il valore giusto`);
    }
    checkNumber("0", 0);
    checkNumber("0.0", 0);

    raisesJmeError(() => tokenise(".1"), "jme.tokenise.invalid near", "non valido: .1");

    checkNumber("1", 1);
    checkNumber("1.0023", 1.0023);

    checkNumber("𝟖𝟡🯳", 893);
    checkNumber("𝟚.０𝟭", 2.01);
  });

  it("Names", () => {
    /** Il token nome atteso per una stringa. */
    function name_token(str: string, annotation?: string[]): Token[] {
      return [tokWithPos(annotation ? new TName(str, annotation) : new TName(str), 0)];
    }
    const cases: Array<[string, string, string[]?]> = [
      ["x", "x"],
      ["arg123", "arg123"],
      ["a1b2", "a1b2"],
      ["X", "X"],
      ["xyz", "xyz"],
      ["$x", "$x"],
      ["f'''", "f'''"],
      ["_", "_"],
      ["a_1", "a_1"],
      ["in_code", "in_code"],
      ["äàß", "äàß"],
      ["ℂ", "C", ["bb"]],
      ["𝑵", "N", ["bf"]],
      ["𝔢", "e", ["frak"]],
      ["𝖫", "L"],
      ["𝙶", "G", ["tt"]],
      ["𝛤", "Gamma"],
      ["𝑓", "f"],
      ["Π", "Pi"],
      ["ζ", "zeta"],
      ["x_δ", "x_delta"],
      ["μx", "mux"],
      ["zᵢ", "z_i"],
      ["a_₇", "a_7"],
      ["𝞚", "Lambda", ["bf"]],
      ["ℵ", "alef"],
      ["ℜ", "R", ["frak"]],
      ["ℏ", "hbar"],
      ["x﹍1", "x_1"],
    ];
    cases.forEach(([str, name, annotations]) => {
      expect(tokenise(str), `${str} equivale a ${name}`).toEqual(name_token(name, annotations));
    });
  });

  it("Whitespace", () => {
    const one = new TInt(1);
    one.originalValue = "1";
    one.pos = 1;
    expect(tokenise(" 1")).toEqual([one]);

    const one2 = new TInt(1);
    one2.originalValue = "1";
    one2.pos = 0;
    expect(tokenise("1        ")).toEqual([one2]);

    expect(tokenise("a &nbsp; + b")).toEqual([
      tokWithPos(new TName("a"), 0),
      tokWithPos(new TOp("+", false, false, 2, true, true), 9),
      tokWithPos(new TName("b"), 11),
    ]);
  });

  it("Operators", () => {
    const cases: Array<[string, ConstructorParameters<typeof TOp>]> = [
      ["..", [".."]],
      ["#", ["#"]],
      ["<=", ["<="]],
      [">=", [">="]],
      ["<>", ["<>"]],
      ["&&", ["and", false, false, 2, true, true]],
      ["||", ["or", false, false, 2, true, true]],
      ["|", ["|"]],
      ["*", ["*", false, false, 2, true, true]],
      ["+", ["+u", false, true, 1]],
      ["-", ["-u", false, true, 1]],
      ["/", ["/u", false, true, 1]],
      ["^", ["^"]],
      ["<", ["<"]],
      [">", [">"]],
      ["=", ["=", false, false, 2, true]],
      ["!", ["not", false, true, 1]],
      ["not", ["not", false, true, 1]],
      ["and", ["and", false, false, 2, true, true]],
      ["or", ["or", false, false, 2, true, true]],
      ["isa", ["isa"]],
      ["except", ["except"]],
      ["¬", ["not", false, true, 1]],
      ["×", ["*", false, false, 2, true, true]],
      ["÷", ["/u", false, true, 1]],
      ["∈", ["in"]],
      ["∧", ["and", false, false, 2, true, true]],
      ["∨", ["or", false, false, 2, true, true]],
      ["∉", ["in", false, false, 2, false, false, true]],
      ["–", ["-u", false, true, 1, false, false]],
      ["—", ["-u", false, true, 1, false, false]],
      ["•", ["*", false, false, 2, true, true]],
    ];

    cases.forEach(([str, opargs]) => {
      expect(tokenise(str), str).toEqual([tokWithPos(new TOp(...opargs), 0)]);
    });
  });

  it("Punctuation", () => {
    expect(tokenise("(")).toEqual([tokWithPos(new TPunc("("), 0)]);
    expect(tokenise(")")).toEqual([tokWithPos(new TPunc(")"), 0)]);
    expect(tokenise(",")).toEqual([tokWithPos(new TPunc(","), 0)]);
    expect(tokenise("[")).toEqual([tokWithPos(new TPunc("["), 0)]);
    expect(tokenise("]")).toEqual([tokWithPos(new TPunc("]"), 0)]);
  });

  it("String", () => {
    expect(tokenise('"hi"')).toEqual([tokWithPos(new TString("hi"), 0)]);
    expect(tokenise("'hi'")).toEqual([tokWithPos(new TString("hi"), 0)]);
    expect(tokenise("'''hi'''")).toEqual([tokWithPos(new TString("hi"), 0)]);
    expect(tokenise('"""hi"""')).toEqual([tokWithPos(new TString("hi"), 0)]);
    expect(tokenise('""')).toEqual([tokWithPos(new TString(""), 0)]);
    expect(tokenise("''")).toEqual([tokWithPos(new TString(""), 0)]);

    expect(tokenise('"hi \\"Bob\\""')).toEqual([tokWithPos(new TString('hi "Bob"'), 0)]);
    expect(tokenise("'hi \\'Bob\\''")).toEqual([tokWithPos(new TString("hi 'Bob'"), 0)]);
    // le graffe protette restano protette, perché `subvars` le rilegge dopo
    expect(tokenise("'hi \\{Bob\\}'")).toEqual([tokWithPos(new TString("hi \\{Bob\\}"), 0)]);

    raisesJmeError(() => tokenise('"hi'), "jme.tokenise.invalid near", 'non valido: "hi');
    raisesJmeError(() => tokenise('hi"'), "jme.tokenise.invalid near", 'non valido: hi"');

    expect(tokenise('"hi \\n there"')).toEqual([tokWithPos(new TString("hi \n there"), 0)]);
    expect(tokenise('"hi \\\\n there"')).toEqual([tokWithPos(new TString("hi \\n there"), 0)]);
    expect(tokenise('"hi \\\\\\n there"')).toEqual([tokWithPos(new TString("hi \\\n there"), 0)]);

    let a = "a";
    for (let i = 0; i < 25; i++) {
      a = a + a;
    }
    expect((tokenise('"' + a + '"')[0] as TString).value, "stringa molto lunga").toBe(a);
  });

  it("Negated operator symbols", () => {
    treesEqual(c("x ∉ y"), c("not (x in y)"));
    treesEqual(c("2 ∤ 3"), c("not (2 | 3)"));
  });

  it("Superscript digits", () => {
    treesEqual(c("x^2"), c("x²"));
    treesEqual(c("x^72"), c("x⁷²"));
  });

  it("Superscript formulas", () => {
    treesEqual(c("x^(5+3)"), c("x⁵⁺³"));
    treesEqual(c("x^5+3"), c("x⁵+3"));
    treesEqual(c("x^(5+3)"), c("x⁽⁵⁺³⁾"));
    treesEqual(c("x^(55-3)"), c("x⁵⁵⁻³"));
    treesEqual(c("x^(55-(3)(5))"), c("x⁵⁵⁻⁽³⁾⁽⁵⁾"));
  });

  it("Superscript variables", () => {
    treesEqual(c("x^i"), c("xⁱ"));
    treesEqual(c("x^n"), c("xⁿ"));
  });

  it("Alternate parenthesis characters", () => {
    treesEqual(c("❨x+1﹚（y+2❫"), c("(x+1)(y+2)"));
  });

  it("Implicit multiplication", () => {
    treesEqual(c("x 5"), c("x*5"), "x 5");
    treesEqual(c("5x"), c("5*x"), "5x");
    treesEqual(c("x x"), c("x*x"), "x x");
    treesEqual(c("5(x+1)"), c("5*(x+1)"), "5(x+1)");
    treesEqual(c("(x+1)(x+2)"), c("(x+1)*(x+2)"), "(x+1)(x+2)");
    treesEqual(c("n!x"), c("(n!) * x"), "moltiplicazione implicita dopo un operatore postfisso");
  });

  it("Invalid expressions", () => {
    raisesJmeError(() => tokenise("x.1"), "jme.tokenise.invalid near", "non valido: x.1");
  });

  it("jme.shunt", () => {
    raisesJmeError(() => compile("x+"), "jme.shunt.not enough arguments", "argomenti insufficienti: x+");
    raisesJmeError(() => compile("!"), "jme.shunt.not enough arguments", "argomenti insufficienti: !");
    raisesJmeError(() => compile("f x,y"), "jme.shunt.no left bracket in function", "f x,y");
    raisesJmeError(() => compile("x]"), "jme.shunt.no left bracket", "x]");
    raisesJmeError(() => compile("x)"), "jme.shunt.no left bracket", "x)");
    raisesJmeError(() => compile("(x"), "jme.shunt.no right bracket", "(x");
    raisesJmeError(() => compile("[x,y"), "jme.shunt.no right square bracket", "[x,y");
    raisesJmeError(() => compile("1 2 3"), "jme.shunt.missing operator", "1 2 3");
    raisesJmeError(() => compile('["a":1,2]'), "jme.shunt.list mixed argument types", '["a":1,2]');
    raisesJmeError(() => compile('[2,"a":1]'), "jme.shunt.list mixed argument types", '[2,"a":1]');
    treesEqual(c("[1,2,]"), c("[1,2]"), "virgola finale in una lista");
    treesEqual(c('["a":1, "b": 2,]'), c('["a":1, "b": 2]'), "virgola finale in un dizionario");
    expect(c('q(1,["a":1,])'), "virgola finale in un dizionario come secondo argomento").toBeTruthy();
    raisesJmeError(() => compile("f(,)"), "jme.shunt.expected argument before comma");
    expect((c("true AND true").tok as TOp).name, "i nomi degli operatori non distinguono le maiuscole").toBe("and");
  });

  it("missing brackets and args", () => {
    const parser = new Parser({ closeMissingBrackets: true, addMissingArguments: true });
    const tree = parser.compile("1+(2-") as Tree;
    treesEqual(tree, c("1 + (2 - ?)"));
  });

  it("Chained relations", () => {
    /** L'espressione a sinistra si riscrive in quella a destra. */
    function assert_rewritten(from: string, to: string, description?: string): void {
      treesEqual(c(from), c(to), description || from);
    }
    assert_rewritten("a<b<c", "a<b and b<c");
    assert_rewritten("a<b=c>d", "a<b and b=c and c>d");
    assert_rewritten("a=b<c", "a=b and b<c");
    assert_rewritten("a in b in c", "a in b and b in c");
    assert_rewritten("a < b <= c > d >= f", "a<b and b <= c and c > d and d >= f");
  });

  it("Pipe operator", () => {
    // upstream verifica anche `3.3145 |> precround(2) |> clamp(1,4)`: usa i
    // builtin `precround`/`clamp`/`random` — coperta dal Task 4.
    treesEqual(c("3.3145 |> precround(2)"), c("precround(3.3145, 2)"), "il pipe diventa una chiamata");
    const scope = makeToyScope();
    closeEqual(
      (scope.evaluate("2 |> (x -> 3x)") as TNum).value,
      6,
      "2 |> (x -> 3x) — pipe verso una funzione anonima",
    );
    raisesJmeError(() => compile("a |> b"), "jme.shunt.pipe right hand takes no arguments");
  });

  it("Expand juxtapositions", () => {
    // upstream usa `Numbas.jme.builtinScope`: qui basta uno scope con i NOMI
    // delle funzioni coinvolte, perché `expandJuxtapositions` guarda solo
    // quelli.
    const base = new Scope();
    ["cos", "sin", "ln", "abs", "arccos", "exp"].forEach((name) => {
      base.addFunction(new FuncObj(name, [TNum], TNum, ((x: number) => x) as (...a: never[]) => unknown));
    });

    /** Espande le giustapposizioni in `expr`. */
    function expand(expr: string, options?: Parameters<Scope["expandJuxtapositions"]>[1], scope?: Scope): Tree {
      const s = scope || base;
      return s.expandJuxtapositions(c(expr), options);
    }
    treesEqual(expand("xy"), c("x*y"), "xy");
    treesEqual(expand("xy", { singleLetterVariables: false }), c("xy"), "xy, nomi di più lettere ammessi");
    treesEqual(expand("g12x"), c("g_12*x"), "g12x");
    treesEqual(expand("x'y"), c("x'*y"), "x'y");
    treesEqual(expand("ax_yz"), c("a*x_y*z"), "ax_yz");
    treesEqual(expand("axy'z"), c("a*x*y'*z"), "axy'z");
    treesEqual(expand("pi"), c("pi"), "pi");
    treesEqual(expand("pizza"), c("pi*z*z*a"), "pizza");
    treesEqual(expand("alpha_1m_xy"), c("alpha_1*m_x*y"), "alpha_1m_xy");
    treesEqual(expand("v:abc"), c("v:a*b*c"), "v:abc");
    treesEqual(expand("xcos(x)"), c("x*cos(x)"), "xcos(x)");
    treesEqual(expand("xsqr(x)"), c("x*sqrt(x)"), "xsqr(x)");
    treesEqual(expand("lnabs(x)"), c("ln(abs(x))"), "lnabs(x)");
    treesEqual(
      expand("lnabs(x)", { implicitFunctionComposition: false }),
      c("lnabs(x)"),
      "lnabs(x), senza composizione implicita",
    );
    treesEqual(expand("x(y)"), c("x*y"), "x(y)");
    treesEqual(expand("x(y)", { noUnknownFunctions: false }), c("x(y)"), "x(y), funzioni sconosciute ammesse");
    treesEqual(expand("xy(z)"), c("x*y*z"), "xy(z)");
    treesEqual(expand("xlnabs(x)"), c("x*ln(abs(x))"), "xlnabs(x)");
    treesEqual(expand("lnarccos(x)"), c("ln(arccos(x))"), "lnarccos(x)");
    treesEqual(expand("lnlnln(x)"), c("ln(ln(ln(x)))"), "lnlnln(x)");
    treesEqual(expand("xysincos(x)"), c("x*y*sin(cos(x))"), "xysincos(x)");
    treesEqual(expand("x(y,1)"), c("x(y,1)"), "x(y,1)");
    treesEqual(expand("ln(y)"), c("ln(y)"), "ln(y)");
    treesEqual(expand("f(y)"), c("f*y"), "f(y)");
    treesEqual(expand("ln abs(x)"), c("ln(abs(x))"), "ln abs(x)");
    treesEqual(expand("ln*abs(x)"), c("ln(abs(x))"), "ln*abs(x)");
    treesEqual(expand("x ln abs(x)"), c("x*ln(abs(x))"), "x ln abs(x)");
    treesEqual(expand("xy*sin ln abs(x)"), c("x*y*sin(ln(abs(x)))"), "xy*sin ln abs(x)");
    treesEqual(expand("5g()"), c("5*g()"), "5g()");
    treesEqual(expand("xy^z"), c("x*y^z"), "xy^z");
    treesEqual(expand("(xy)^z"), c("(x*y)^z"), "(xy)^z");
    treesEqual(expand("x^yz"), c("x^y*z"), "x^yz");
    treesEqual(expand("x^(yz)"), c("x^(y*z)"), "x^(yz)");
    treesEqual(expand("xy^ab"), c("x*y^a*b"), "xy^ab");
    treesEqual(expand("xy+ab"), c("x*y+a*b"), "xy+ab");
    treesEqual(expand("xy/z"), c("x*y/z"), "xy/z");
    treesEqual(expand("x/yz"), c("x/(y*z)"), "x/yz");
    treesEqual(expand("5xe^(2x+1)"), c("5*(x*e^(2x+1))"), "5xe^(2x+1)");
    treesEqual(expand("xy!"), c("x*y!"), "xy!");
    treesEqual(expand("exp(x)"), c("exp(x)"), "exp(x)");
    treesEqual(expand("z(x*y)^2"), c("z*(x*y)^2"), "z(x*y)^2");

    const s = new Scope([base]);
    s.setConstant("e1", { value: new TNum(1), tex: "e_1" });
    treesEqual(expand("ze1", null, s), c("z*e1"), "niente pedici sulle costanti note");
    treesEqual(expand("ze2 + e2", null, s), c("z*e_2 + e_2"), "pedici quando si spezza un nome");

    const s2 = new Scope([base]);
    s2.addFunction(new FuncObj("", [], TNum, (() => 1) as (...a: never[]) => unknown));
    treesEqual(expand("zsin(x)", null, s2), c("z*sin(x)"), "regge una funzione con nome vuoto nello scope");
  });

  it("Case sensitivity", () => {
    const scope = makeToyScope();
    scope.caseSensitive = true;
    expect(scope.parser.compile("X")).not.toEqual(scope.parser.compile("x"));
    // upstream usa `SIN(1)`: qui `ABS` è la funzione equivalente dello scope
    // giocattolo (`sin` arriva col Task 4).
    raisesJmeError(() => scope.evaluate("ABS(1)"), "jme.typecheck.function not defined", "ABS(1)");
    closeEqual(
      (scope.evaluate("w*W", { w: scope.evaluate("1"), W: scope.evaluate("2") }) as TNum).value,
      2,
      "w*W con w=1, W=2",
    );
  });
});
