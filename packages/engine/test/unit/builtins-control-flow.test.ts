// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Branching` (jme-tests.mjs:1458-1470), `Repetition`
// (1471-1482), `Boolean operations` (1483-1490) e `substitute into for: ..
// of: ..` (1491-1501) del modulo QUnit `Evaluating`, più il blocco `findvars`
// del modulo `Compiling` (95-119) nella parte che dipende dai gestori
// `jme.findvarsOps` registrati dai temi `control_flow`/`comprehensions`
// (jme-builtins.js:3015-3750), e la copertura del resto dei due temi.
//
// `Boolean operations` era rimandato dal Task 4a (builtins-numeric.test.ts):
// tutti e cinque gli assert usano `let` (control_flow) e `len` (lists).
// Qui è riattivato anche l'ultimo assert di `Random numbers` (1171),
// `8.45 in repeat(random(8.15..8.45#0.1),100)`, che il Task 4a aveva
// rimandato perché `repeat` sta nel tema `lists` (jme-builtins.js:1284).
//
// RIMANDATO AL TASK 5 (serve `jme.display`):
//   - nessun assert di questi blocchi. I due assert di `findvars` che
//     riguardano `DOMcontentsubber` (`findvars in HTML`, 120-128) non sono
//     traducibili: il subber del DOM non è portato (vedi DIVERGENCES.md).

import { describe, it, expect } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import {
  findvars,
  findvarsOps,
  isDeterministicOps,
  substituteTree,
  substituteTreeOps,
  unwrapValue,
} from "../../src/jme/evaluate";
import { compile } from "../../src/jme/parser";
import { lazyOps, Scope } from "../../src/jme/scope";
import { TFunc, TOp, type Token, type Tree } from "../../src/jme/tokens";
import { closeEqual, deepCloseEqual } from "./math-helpers";
import { raisesJmeError } from "./jme-helpers";

/** Valuta nello scope dei builtin. */
function ev(expr: string | Tree, variables?: Record<string, unknown>): Token {
  const v = builtinScope.evaluate(expr, variables);
  expect(v, `l'espressione non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** Il valore grezzo del token. */
function val(t: Token): unknown {
  return (t as { value?: unknown }).value;
}

/** I valori JS dei token di una lista. */
function values(expr: string): unknown[] {
  return (val(ev(expr)) as Token[]).map((x) => val(x));
}

describe("Evaluating > Branching", () => {
  it("if e switch, con valutazione pigra", () => {
    closeEqual(val(ev("if(true,1,0)")), 1, "if(true,1,0)");
    closeEqual(val(ev("if(false,1,0)")), 0, "if(false,1,0)");
    closeEqual(val(ev("if(true,1,1<i)")), 1, "valutazione pigra: if(true,1,1<i)");
    closeEqual(val(ev("if(false,1<i,1)")), 1, "valutazione pigra: if(false,1<i,1)");

    closeEqual(val(ev("switch(true,1,0)")), 1, "switch(true,1,0)");
    closeEqual(val(ev("switch(false,1,true,2,3)")), 2, "switch(false,1,true,2,3)");
    closeEqual(val(ev("switch(false,1,false,2,3)")), 3, "switch(false,1,false,2,3)");
    closeEqual(val(ev("switch(false,1,true,0)")), 0, "switch(false,1,true,0)");
    raisesJmeError(
      () => ev("switch(false,1,false,0)"),
      "jme.func.switch.no default case",
      "nessun caso predefinito",
    );
  });

  it("assert e try (jme-builtins.js:3162-3190)", () => {
    // upstream: `assert(condizione, alternativa)` ritorna `false` quando la
    // condizione è vera, e valuta l'alternativa quando è falsa.
    expect(val(ev("assert(true, 1)")), "assert con condizione vera").toBe(false);
    closeEqual(val(ev("assert(false, 1)")), 1, "assert con condizione falsa");

    closeEqual(val(ev("try(1+1, err, 0)")), 2, "try senza errori");
    expect(val(ev('try([1][5], err, "preso")')), "try che cattura l'errore").toBe("preso");
    // il nome legato NON può essere `e`: la sostituzione delle costanti gira
    // prima della funzione pigra e lo rimpiazzerebbe col numero di Nepero.
    expect(typeof val(ev("try([1][5], err, err)")), "il nome legato contiene il messaggio").toBe("string");
  });

  it("l'operatore pipe come funzione (jme-builtins.js:3193-3223)", () => {
    // upstream: `|>` è riscritto in fase di compilazione, quindi la
    // definizione serve solo agli alberi costruiti a mano.
    const tree: Tree = {
      tok: new TOp("|>"),
      args: [compile("-2") as Tree, { tok: new TFunc("abs"), args: [] }],
    };
    closeEqual(val(ev(tree)), 2, "-2 |> abs()");
    deepCloseEqual(findvars(tree, [], builtinScope), [], "findvars attraversa la riscrittura del pipe");
  });
});

describe("Evaluating > Repetition", () => {
  it("map, repeat e for:", () => {
    deepCloseEqual(values("map(x+1,x,[1,2,3])"), [2, 3, 4], "map(x+1,x,[1,2,3])");
    deepCloseEqual(values("map(x+1,x,1..3)"), [2, 3, 4], "map(x+1,x,1..3)");
    raisesJmeError(
      () => ev("map(x+1,x,2)"),
      "jme.typecheck.map not on enumerable",
      "non si può mappare su qualcosa che non è enumerabile",
    );
    deepCloseEqual(values("repeat(1,5)"), [1, 1, 1, 1, 1], "repeat(1,5)");
    closeEqual((val(ev("repeat(random(3..6),5)")) as Token[]).length, 5, "repeat(random(3..6),5) produce 5 valori");
    const n = val(ev("repeat(random(3..6),5)[4]")) as number;
    expect(n >= 3 && n <= 6, "l'ultimo elemento di repeat(random(3..6),5) è nell'intervallo").toBe(true);
    // ultimo assert di `Random numbers` (jme-tests.mjs:1171), rimandato dal
    // Task 4a perché `repeat` è del tema `lists`: con un passo non intero
    // l'estremo superiore del range deve restare estraibile.
    expect(
      val(ev("8.45 in repeat(random(8.15..8.45#0.1),100)")),
      "8.45 in repeat(random(8.15..8.45#0.1),100)",
    ).toBe(true);
    deepCloseEqual(
      values("let(x, 2, y, 4, x+y for: y of: 1..3)"),
      [3, 4, 5],
      "for: sostituisce la variabile mappata",
    );
    deepCloseEqual(values("i for: i of: 1..3"), [1, 2, 3], "for: sostituisce anche le costanti");
  });

  it("map su vettori, matrici e insiemi", () => {
    deepCloseEqual(val(ev("map(x*2,x,vector(1,2))")), [2, 4], "map su un vettore");
    deepCloseEqual(
      (val(ev("map(x*2,x,matrix([1,2],[3,4]))")) as number[][]).map((r) => [...r]),
      [
        [2, 4],
        [6, 8],
      ],
      "map su una matrice",
    );
    deepCloseEqual(values("map(x+1,x,set([1,2]))"), [2, 3], "map su un insieme");
    raisesJmeError(
      () => ev('map("a",x,vector(1,2))'),
      "jme.map.vector map returned non number",
      "map su un vettore deve produrre numeri",
    );
    raisesJmeError(
      () => ev('map("a",x,matrix([1,2]))'),
      "jme.map.matrix map returned non number",
      "map su una matrice deve produrre numeri",
    );
  });

  it("for: con più generatori, destrutturazione e where:", () => {
    deepCloseEqual(
      (val(ev("[x,y] for: x of: 1..2 for: y of: 1..2")) as Token[]).map((p) =>
        (val(p) as Token[]).map((v) => val(v)),
      ),
      [
        [1, 1],
        [1, 2],
        [2, 1],
        [2, 2],
      ],
      "due generatori annidati",
    );
    deepCloseEqual(values("a+b for: [a,b] of: [[1,2],[3,4]]"), [3, 7], "destrutturazione dei nomi");
    deepCloseEqual(values("x for: x of: 1..5 where: mod(x,2)=0"), [2, 4], "where: filtra");
    // senza sostituzione preliminare (`noSubstitution`), così l'errore arriva
    // da `unfold_for` e non dal gestore di `substituteTreeOps`.
    raisesJmeError(
      () => builtinScope.evaluate(compile("x for: 1 of: [1]") as Tree, undefined, true),
      "jme.typecheck.for in name wrong type",
      "il nome legato da of: deve essere un nome",
    );
  });

  it("filter, iterate, iterate_until, foldl, take, separate", () => {
    deepCloseEqual(values("filter(x>1,x,[1,2,3])"), [2, 3], "filter");
    deepCloseEqual(values("iterate(x+1,x,0,3)"), [0, 1, 2, 3], "iterate");
    deepCloseEqual(values("iterate_until(x+1,x,0,x>=3)"), [0, 1, 2, 3], "iterate_until");
    deepCloseEqual(values("iterate_until(x+1,x,0,false,2)"), [0, 1, 2], "iterate_until con un massimo");
    raisesJmeError(
      () => ev('iterate_until(x+1,x,0,"no")'),
      "jme.iterate_until.condition produced non-boolean",
      "la condizione di iterate_until deve essere booleana",
    );
    closeEqual(val(ev("foldl(acc+x,acc,x,0,[1,2,3])")), 6, "foldl");
    deepCloseEqual(values("take(2,x>1,x,[1,2,3,4])"), [2, 3], "take");
    deepCloseEqual(
      (val(ev("separate([1,2,3], x -> x>1)")) as Token[]).map((l) => (val(l) as Token[]).map((v) => val(v))),
      [[2, 3], [1]],
      "separate",
    );
  });

  it("le forme con lambda esplicita", () => {
    deepCloseEqual(values("map(x -> x+1, [1,2,3])"), [2, 3, 4], "map con lambda");
    deepCloseEqual(values("filter(x -> x>1, [1,2,3])"), [2, 3], "filter con lambda");
    deepCloseEqual(values("iterate(x -> x+1, 0, 3)"), [0, 1, 2, 3], "iterate con lambda");
    closeEqual(val(ev("foldl((acc,x) -> acc+x, 0, [1,2,3])")), 6, "foldl con lambda");
    deepCloseEqual(values("take(2, x -> x>1, [1,2,3,4])"), [2, 3], "take con lambda");
  });
});

describe("Evaluating > Boolean operations", () => {
  it("gli operatori booleani sono pigri (rimandato dal Task 4a)", () => {
    expect(val(ev("let(a,[],len(a)>0 and a[0]=1)")), "and pigro").toBe(false);
    expect(val(ev("let(a,[],len(a)=0 or a[0]=1)")), "or pigro").toBe(true);
    expect(val(ev("let(a,[],len(a)>0 implies a[0]=1)")), "implies pigro").toBe(true);
    expect(val(ev("let(a,[],len(a)>0 nand a[0]=1)")), "nand pigro").toBe(true);
    expect(val(ev("let(a,[],len(a)=0 nor a[0]=1)")), "nor pigro").toBe(false);
  });
});

describe("Evaluating > substitute into for: .. of: ..", () => {
  it("la sostituzione non consuma l'albero", () => {
    const scope = new Scope([builtinScope]);
    let tree = compile("x for: x of: y") as Tree;
    scope.evaluate(tree, { y: scope.evaluate("[1,2]") });
    deepCloseEqual(
      unwrapValue(scope.evaluate(tree, { y: scope.evaluate("[3,4]") }) as Token),
      unwrapValue(scope.evaluate("[3,4]") as Token),
      "for: si può valutare due volte con liste diverse",
    );

    tree = compile("map(x,x,y)") as Tree;
    scope.evaluate(tree, { y: scope.evaluate("[1,2]") });
    deepCloseEqual(
      unwrapValue(scope.evaluate(tree, { y: scope.evaluate("[3,4]") }) as Token),
      unwrapValue(scope.evaluate("[3,4]") as Token),
      "map si può valutare due volte con liste diverse",
    );

    tree = compile("take(4,x>0,x,y)") as Tree;
    scope.evaluate(tree, { y: scope.evaluate("[1,2]") });
    deepCloseEqual(
      unwrapValue(scope.evaluate(tree, { y: scope.evaluate("[3,4]") }) as Token),
      unwrapValue(scope.evaluate("[3,4]") as Token),
      "take si può valutare due volte con liste diverse",
    );

    // `substituteTreeOps.take`: upstream il gestore sostituisce dentro una
    // copia che poi butta via, quindi il valore non arriva mai nell'albero
    // (vedi DIVERGENCES.md). Con `take` pigra la differenza non si vede
    // valutando — il nome è comunque legato nello scope — quindi si guarda
    // l'albero sostituito, come per `map` e `for:`.
    const withList = new Scope([builtinScope, { variables: { y: ev("[1,2]") } }]);
    const substituted = substituteTree(compile("take(4,x>0,x,y)") as Tree, withList, true) as Tree;
    expect(
      ((substituted.args as Tree[])[3] as Tree).tok.type,
      "substituteTree porta la lista dentro take",
    ).toBe("list");
    expect(
      ((substituteTree(compile("map(x,x,y)") as Tree, withList, true) as Tree).args as Tree[])[2]?.tok.type,
      "come fa per map",
    ).toBe("list");
  });
});

describe("Compiling > findvars", () => {
  it("i gestori findvarsOps dei temi di controllo e comprensione", () => {
    deepCloseEqual(
      findvars(compile('"{a} $\\\\var{b}$ {c} \\\\[ \\\\simplify{{d}*f} \\\\]"')),
      ["a", "b", "c", "d"],
      "findvars trova le variabili usate nelle stringhe",
    );
    deepCloseEqual(findvars(compile("map(x,x,x)")), ["x"], "map lega x ma findvars lo trova comunque");
    deepCloseEqual(findvars(compile("let(x,z,x+y)")), ["y", "z"], "findvars su let");
    deepCloseEqual(findvars(compile('let(["x":z],x+y)')), ["y", "z"], "findvars su let con un dizionario");
    deepCloseEqual(
      findvars(compile("let([q,w],[2,3],x,z,x+y+q+w)")),
      ["y", "z"],
      "findvars su let con una sequenza di nomi",
    );
    deepCloseEqual(findvars(compile("x -> x+z")), ["z"], "findvars su una lambda");
    deepCloseEqual(findvars(compile("a -> a(x)")), ["x"], "findvars su una lambda passata come funzione");
    deepCloseEqual(findvars(compile("[x,[y,z]] -> x+y+z+w")), ["w"], "findvars su una lambda con destrutturazione");
    deepCloseEqual(
      findvars(compile("undefined_function(x)")),
      ["x", "undefined_function"],
      "i nomi di funzione non definiti sono variabili mancanti",
    );
    deepCloseEqual(findvars(compile('safe("{a}")')), [], "findvars su safe non guarda dentro la stringa");
    deepCloseEqual(findvars(compile("try(a, e, e+b)")), ["a", "b"], "findvars su try esclude il nome legato");
    deepCloseEqual(findvars(compile("isset(x)")), [], "findvars su isset non conta il nome");
    deepCloseEqual(
      findvars(compile("filter(x>a,x,[1])")),
      ["a"],
      "findvars su filter esclude il nome legato",
    );
    deepCloseEqual(
      findvars(compile("foldl(acc+x+a,acc,x,0,[1])")),
      ["a"],
      "findvars su foldl esclude i due nomi legati",
    );
    deepCloseEqual(
      findvars(compile("take(1,x>a,x,[1])")),
      ["a"],
      "findvars su take esclude il nome legato",
    );
    deepCloseEqual(
      findvars(compile("x+a for: x of: b")),
      ["a", "b"],
      "findvars su for: esclude il nome legato",
    );
    deepCloseEqual(
      findvars(compile("iterate(x+a,x,0,3)")),
      ["a"],
      "findvars su iterate esclude il nome legato",
    );
    deepCloseEqual(
      findvars(compile("iterate_until(x+a,x,0,x>b)")),
      ["a", "b"],
      "findvars su iterate_until esclude il nome legato",
    );
  });
});

describe("i registri globali riempiti dai builtin", () => {
  it("lazyOps contiene i 32 nomi di jme-builtins.js, nello stesso ordine", () => {
    // inventario §4.3: i 32 `jme.lazyOps.push` del file, tema per tema.
    expect(lazyOps).toEqual([
      "and",
      "or",
      "implies",
      "nand",
      "nor", // booleans (958-962)
      "repeat", // lists (1294)
      "dict", // dictionaries (1599)
      "safe", // strings (1707)
      "isa", // type_casting (1847)
      "decimal", // number_parsing (2137)
      "satisfy", // jme (2273)
      "isset", // 2291
      "unset", // 2305
      "expression", // 2372
      "exec", // 2431
      "canonical_compare", // 2528
      "scope_case_sensitive", // 2552
      "seedrandom", // randomisation (2973)
      "if", // control_flow (3036-3185)
      "switch",
      "let",
      "assert",
      "try",
      "|>", // 3218
      "map", // comprehensions (3297-3705)
      "for:",
      "filter",
      "iterate",
      "iterate_until",
      "foldl",
      "take",
      "diff", // calculus (3764)
    ]);
  });

  it("i 14 gestori di findvarsOps e i 9 di substituteTreeOps", () => {
    // inventario §8.11
    expect(Object.keys(findvarsOps).sort()).toEqual(
      [
        "safe",
        "render",
        "satisfy",
        "isset",
        "let",
        "try",
        "|>",
        "map",
        "for:",
        "filter",
        "iterate",
        "iterate_until",
        "foldl",
        "take",
      ].sort(),
    );
    expect(Object.keys(substituteTreeOps).sort()).toEqual(
      ["isset", "let", "map", "for:", "filter", "iterate", "iterate_until", "foldl", "take"].sort(),
    );
    // jme-builtins.js:2974 — l'unica registrazione di `isDeterministicOps`.
    expect(Object.keys(isDeterministicOps)).toEqual(["seedrandom"]);
  });
});
