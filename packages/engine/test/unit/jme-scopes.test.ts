// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit `Scopes` di tests/jme/jme-tests.mjs:1856-2017.
// `Rulesets` (1937) è tradotto in jme-simplify.test.ts (Task 3).
//
// Il Task 4b ha sostituito `makeToyScope()` con `builtinScope` ovunque
// upstream usi `Numbas.jme.builtinScope` o i suoi function set: `Functions`,
// `Function sets`, `Scope JME functions`, `Constants` e `unset`. Restano sullo
// scope giocattolo solo i test che verificano la meccanica dello `Scope` con
// funzioni costruite apposta (`Custom parser`, i test di `resolve`/`deleted`).
//
// RIMANDATO AL TASK 5: gli assert di `Constants` che passano da
// `jme.display.exprToLaTeX`/`texify` (il tex di una costante ridefinita).

import { describe, it, expect } from "vitest";
import { FuncObj } from "../../src/jme/funcobj";
import { FunctionSet, makeRng, Scope } from "../../src/jme/scope";
import { Parser } from "../../src/jme/parser";
import { TBool, TNum, TScope, TString, type Token } from "../../src/jme/tokens";
import * as math from "../../src/math";
import { substituteTree } from "../../src/jme/evaluate";
import { closeEqual } from "./math-helpers";
import { builtinScope } from "../../src/jme/builtins";
import { evaluated, makeToyScope, raisesJmeError } from "./jme-helpers";

describe("Scopes", () => {
  it("Variables", () => {
    expect(builtinScope.variables, "lo scope dei builtin non ha variabili").toEqual({});
    expect(new Scope().variables, "uno scope appena costruito non ha variabili").toEqual({});
    const scope = new Scope({
      variables: {
        x: new TNum(1),
        y: new TString("hi"),
      },
    });
    expect(scope.getVariable("x"), "variabili passate al costruttore").toBeTruthy();
    const scope2 = new Scope([scope, { variables: { x: new TNum(2) } }]);
    closeEqual((scope2.getVariable("x") as TNum).value, 2, "il valore nuovo copre quello vecchio");
    expect((scope2.getVariable("y") as TString).value, "le altre variabili restano visibili").toBe("hi");
  });

  it("Functions", () => {
    expect(new Scope().functions, "uno scope appena costruito non ha funzioni").toEqual({});

    const base = builtinScope;
    expect(base.getFunction("+").length, "lo scope dei builtin ha delle funzioni").toBeGreaterThan(0);

    const scope = new Scope([
      base,
      {
        functions: {
          "+": [new FuncObj("+", [TBool, TBool], TBool, null, { nobuiltin: true })],
        },
      },
    ]);
    expect(scope.getFunction("+").length, "overload aggiunto allo scope precedente").toBe(
      base.getFunction("+").length + 1,
    );
    expect(
      new Scope([scope, base]).getFunction("+").length,
      "le funzioni non si duplicano estendendo lo scope",
    ).toBe(scope.getFunction("+").length);

    const s = new Scope();
    const s2 = new Scope([base, s]);
    s2.addFunction(new FuncObj("testfn", [], TNum, (() => 1) as (...a: never[]) => unknown));
    expect(s.functions["testfn"], "estendere uno scope non tocca quello vecchio").toBeUndefined();
  });

  it("Function sets", () => {
    // upstream usa `Numbas.jme.function_sets.arithmetic`: qui gli insiemi dei
    // temi vivono nello scope dei builtin (`functionSet` in builtins/registry.ts).
    const arithmetic = builtinScope.getFunctionSet("arithmetic") as FunctionSet;
    expect(arithmetic, "l'insieme arithmetic è raggiungibile per nome").toBeTruthy();
    const s = new Scope({});
    s.addFunctionSet(arithmetic);
    expect(s.getFunction("+").length > 0, "+ è definita").toBe(true);
    expect(s.getFunction("sin").length === 0, "sin non è definita").toBe(true);
    expect(s.getFunctionSet("arithmetic"), "l'insieme è raggiungibile per nome").toBe(arithmetic);
  });

  it("Scope JME functions", () => {
    const blank = (evaluated(builtinScope, "scope()") as TScope).scope;
    expect(Object.keys(blank.allFunctions()).length, "uno scope vuoto non ha funzioni").toBe(0);
    expect(Object.keys(blank.allVariables()).length, "uno scope vuoto non ha variabili").toBe(0);

    expect(
      (evaluated(builtinScope, 'eval(expression("1"), scope())') as TNum).value,
      "un letterale si valuta anche in uno scope vuoto",
    ).toBe(1);
    expect(
      evaluated(builtinScope, 'eval(expression("x"), scope())').type,
      "un nome in uno scope vuoto resta un nome",
    ).toBe("name");

    raisesJmeError(
      () => builtinScope.evaluate('eval(expression("1+1"), scope())'),
      "jme.typecheck.op not defined",
      "+ non è definita in uno scope vuoto",
    );

    expect(
      evaluated(builtinScope, 'eval(expression("1+1"), scope() |> add_functions(["+"]))'),
      "+ è definita dopo averla aggiunta",
    ).toBeTruthy();
    raisesJmeError(
      () => builtinScope.evaluate('eval(expression("1-1"), scope() |> add_functions(["+"]))'),
      "jme.typecheck.op not defined",
      "- non è definita dopo aver aggiunto solo +",
    );

    expect(
      evaluated(builtinScope, 'eval(expression("1 + 2 - 3"), scope() |> add_function_sets(["arithmetic"]))'),
      "+ e - sono definite dopo aver aggiunto l'insieme arithmetic",
    ).toBeTruthy();
    raisesJmeError(
      () => builtinScope.evaluate('eval(expression("sin(1)"), scope() |> add_function_sets(["arithmetic"]))'),
      "jme.typecheck.function not defined",
      "sin non è nell'insieme arithmetic",
    );

    expect(
      evaluated(
        builtinScope,
        'eval(expression("1 + 2"), scope() |> add_function_sets(["arithmetic"]) |> remove_functions(["-"]))',
      ),
      "+ resta definita dopo aver tolto -",
    ).toBeTruthy();
    raisesJmeError(
      () =>
        builtinScope.evaluate(
          'eval(expression("1 - 2"), scope() |> add_function_sets(["arithmetic"]) |> remove_functions(["-"]))',
        ),
      "jme.typecheck.op not defined",
      "- non è più definita dopo remove_functions",
    );
  });

  it("Custom parser", () => {
    const parser = new Parser();
    parser.addOperator("!!");
    parser.setOperatorProperties("!!", { commutative: true, precedence: 5 });
    const scope = new Scope([makeToyScope()]);
    scope.addFunction(
      new FuncObj("!!", [TNum, TNum], TNum, ((a: number, b: number) => 1 / (1 / a + 1 / b)) as (
        ...a: never[]
      ) => unknown),
    );
    scope.parser = parser;
    closeEqual((scope.evaluate("1 !! 2") as TNum).value, 2 / 3, "1 !! 2 = 2/3");
  });

  it("Constants", () => {
    // upstream verifica le costanti dei builtin (pi, e, i); la loro resa in
    // LaTeX è verificata dal Task 5 in jme-display.test.ts.
    expect((evaluated(builtinScope, "pi") as TNum).value, "pi è la costante del cerchio").toBe(Math.PI);
    expect((evaluated(builtinScope, "e") as TNum).value, "e è la base del logaritmo naturale").toBe(Math.E);
    expect((evaluated(builtinScope, "i") as TNum).value, "i è la radice di -1").toEqual(math.complex(0, 1));
    expect(builtinScope.getConstant("j"), "j non è attiva di default").toBeUndefined();

    const s = new Scope([builtinScope]);
    expect((s.evaluate("pi") as TNum).value, "pi si valuta al valore della costante").toBe(Math.PI);
    expect(s.getConstant("pi")?.tex, "il tex della costante dei builtin").toBe("\\pi");

    const child = new Scope([s]);
    child.deleteConstant("pi");
    expect(child.getConstant("pi"), "pi non è più una costante dopo la cancellazione").toBeUndefined();
    expect(s.getConstant("pi"), "la cancellazione non tocca lo scope genitore").toBeTruthy();

    child.setConstant("pi", { value: new TNum(3), tex: "\\pi" });
    expect((child.evaluate("pi") as TNum).value, "pi ridefinita nel figlio").toBe(3);
    expect(child.getConstant("pi")?.tex, "il tex indicato viene conservato").toBe("\\pi");
    expect(child.isConstant(new TNum(3)), "isConstant riconosce il valore").toBeTruthy();
    expect(child.isConstant(new TNum(42)), "isConstant non inventa costanti").toBeUndefined();
  });

  it("unset", () => {
    const scope = new Scope([builtinScope]);
    scope.setVariable("e", evaluated(scope, "3"));
    const unset_scope = scope.unset({ variables: ["e"] });
    expect(unset_scope.getVariable("e"), "e non è più una variabile dopo unset").toBeUndefined();
    expect(unset_scope.getConstant("e"), "e resta una costante dopo unset").toBeTruthy();
    expect((unset_scope.evaluate("e") as TNum).value, "e torna al valore della costante").toBe(Math.E);
    expect((unset_scope.evaluate("ln(e)=1") as TBool).value, "ln(e) = 1").toBe(true);

    const unset_fn = scope.unset({ functions: ["+"] });
    expect(unset_fn.getFunction("+").length, "+ non è più definita dopo unset").toBe(0);
  });

  it("deleteVariable cancella anche la costante omonima", () => {
    // jme.js:2755-2762: `options.delete_constant !== false`.
    const scope = new Scope();
    scope.setConstant("k", { value: new TNum(1) });
    scope.setVariable("k", new TNum(2));
    const child = new Scope([scope]);
    child.deleteVariable("k");
    expect(child.getVariable("k")).toBeUndefined();
    expect(child.getConstant("k")).toBeUndefined();

    const child2 = new Scope([scope]);
    child2.deleteVariable("k", { delete_constant: false });
    expect(child2.getVariable("k")).toBeUndefined();
    expect(child2.getConstant("k")).toBeTruthy();
  });

  it("resolve si ferma al primo livello che cancella il nome", () => {
    // jme.js:2785-2798: il controllo di cancellazione precede quello sui
    // valori, e la ricerca finisce lì anche se un nonno definisce il nome.
    const grandparent = new Scope();
    grandparent.setVariable("x", new TNum(1));
    const parent = new Scope([grandparent]);
    parent.deleteVariable("x");
    const child = new Scope([parent]);
    expect(child.getVariable("x"), "la cancellazione nel padre nasconde il nonno").toBeUndefined();
  });

  it("getFunction si ferma al primo livello che cancella il nome", () => {
    // jme.js:2839-2859: `break`, non `return`, quindi ritorna quel che ha già
    // accumulato scendendo dalla foglia.
    const grandparent = makeToyScope();
    const parent = new Scope([grandparent]);
    parent.deleteFunction("+");
    const child = new Scope([parent]);
    child.addFunction(new FuncObj("+", [TBool, TBool], TBool, null));
    expect(child.getFunction("+").length, "solo la definizione del livello più basso").toBe(1);
  });

  it("clone copia i membri e conserva il genitore", () => {
    const parent = new Scope();
    parent.setVariable("a", new TNum(1));
    const scope = new Scope([parent]);
    scope.setVariable("b", new TNum(2));
    const copy = scope.clone();
    expect((copy.getVariable("a") as TNum).value, "vede ancora il genitore").toBe(1);
    expect((copy.getVariable("b") as TNum).value, "ha le variabili proprie").toBe(2);
    copy.setVariable("b", new TNum(3));
    expect((scope.getVariable("b") as TNum).value, "la copia è indipendente").toBe(2);
  });

  it("flatten appiattisce le variabili della catena", () => {
    const parent = new Scope();
    parent.setVariable("a", new TNum(1));
    const scope = new Scope([parent]);
    scope.setVariable("b", new TNum(2));
    scope.flatten();
    expect(Object.keys(scope.variables).sort()).toEqual(["a", "b"]);
  });

  it("il generatore casuale è deterministico e si eredita", () => {
    // decisione 12 del brief: la radice usa `makeRng("savint")`, i figli
    // ereditano il riferimento del genitore. Il seme si costruisce SOLO per
    // una radice che non eredita né riceve un generatore: `makeRng` è cara
    // (key schedule di seedrandom) e `new Scope([parent])` è su tutti i
    // percorsi caldi.
    const a = new Scope();
    const b = new Scope();
    expect(a.rng(), "due scope radice partono dallo stesso seme").toBe(b.rng());
    expect(new Scope().rng(), "la radice senza genitore ha comunque un default deterministico").toBe(
      makeRng("savint")(),
    );

    const parent = new Scope();
    const child = new Scope([parent]);
    expect(child.rng, "il figlio condivide LO STESSO oggetto funzione del genitore").toBe(parent.rng);
    const grandchild = new Scope([child, { variables: {} }]);
    expect(grandchild.rng, "e lo condivide lungo tutta la catena").toBe(parent.rng);
    // le estrazioni continuano la stessa sequenza, non ripartono dal seme
    const first = parent.rng();
    expect(child.rng(), "il figlio continua la sequenza del genitore").not.toBe(first);

    const explicit = makeRng("altro seme");
    const seeded = new Scope({ rng: explicit });
    expect(seeded.rng, "`extras.rng` ha la precedenza sul default").toBe(explicit);
    const seededChild = new Scope([new Scope(), { rng: explicit }]);
    expect(seededChild.rng, "`extras.rng` ha la precedenza anche sul genitore").toBe(explicit);

    expect(new Scope().clone().rng, "clone conserva il generatore di una radice").toBeTypeOf("function");
    const cloned = child.clone();
    expect(cloned.rng, "clone conserva l'oggetto funzione").toBe(parent.rng);
  });

  it("evaluate di un'espressione vuota ritorna null", () => {
    // `Scope.evaluate` dichiara `Token | null`: `null` solo qui.
    const scope = makeToyScope();
    expect(scope.evaluate(""), "stringa vuota").toBeNull();
    expect(scope.evaluate("   "), "solo spazi").toBeNull();
    expect(substituteTree(null, scope, true), "substituteTree su un albero nullo").toBeNull();
    expect(evaluated(scope, "1+1"), "un'espressione vera non è nulla").toBeTruthy();
  });

  it("le variabili passate a evaluate non toccano lo scope", () => {
    const scope = makeToyScope();
    const v = scope.evaluate("x+1", { x: 2 }) as TNum;
    expect(v.value).toBe(3);
    expect(scope.getVariable("x"), "x non resta definita").toBeUndefined();
  });

  it("allFunctions e allVariables raccolgono tutta la catena", () => {
    const parent = new Scope();
    parent.setVariable("a", new TNum(1));
    parent.addFunction(new FuncObj("f", [], TNum, (() => 1) as (...a: never[]) => unknown));
    const child = new Scope([parent]);
    child.setVariable("b", new TNum(2));
    child.addFunction(new FuncObj("f", [TNum], TNum, ((x: number) => x) as (...a: never[]) => unknown));
    expect(Object.keys(child.allVariables()).sort()).toEqual(["a", "b"]);
    expect((child.allFunctions()["f"] as unknown[]).length, "le definizioni si fondono").toBe(2);
  });

  it("le operazioni pigre ricevono gli alberi, non i valori", () => {
    // §7.5 dell'inventario: `Scope.evaluate` controlla `lazyOps` PRIMA di
    // valutare gli argomenti, quindi il ramo non scelto non viene toccato.
    const scope = makeToyScope();
    const result = scope.evaluate("if(1<2, 1, undefined_name/0)") as TNum;
    expect(result.value, "il ramo non scelto non è valutato").toBe(1);
  });

  it("matchFunctionToArguments sceglie la definizione esatta", () => {
    const scope = makeToyScope();
    const exact = new FuncObj("g", [TBool], TBool, ((b: boolean) => b) as (...a: never[]) => unknown);
    const numeric = new FuncObj("g", [TNum], TNum, ((n: number) => n) as (...a: never[]) => unknown);
    scope.addFunction(numeric);
    scope.addFunction(exact);
    const matched = scope.matchFunctionToArguments({ type: "function", name: "g" } as unknown as Token, [
      new TBool(true),
    ]);
    expect(matched?.fn, "vince il match esatto sul tipo").toBe(exact);
  });
});
