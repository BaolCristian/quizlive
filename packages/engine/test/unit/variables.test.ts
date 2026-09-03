// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Test nostri (non esistono test upstream puri per `jme.variables.makeVariables`
// eccetto il modulo `Promises`, fuori scope: decisione 1 del brief del Task
// 6). Usano `builtinScope` del Task 4 come padre.

import { describe, it, expect } from "vitest";
import { Scope, compile, findvars, findvarsOps, makeRng, type Token, TNum } from "../../src/jme";
import { builtinScope } from "../../src/jme/builtins";
import {
  makeConstants,
  makeFunction,
  makeRulesets,
  makeVariables,
  remakeVariables,
  substituteHtml,
  variableDependants,
} from "../../src/variables";
import { JmeError } from "../../src/jme/errors";

const def = (expr: string) => {
  const tree = compile(expr)!;
  return { tree, vars: findvars(tree), definition: expr };
};
const fresh = (seed = "s") => {
  const s = new Scope(builtinScope);
  s.rng = makeRng(seed);
  return s;
};

describe("makeVariables", () => {
  it("risolve le dipendenze ricorsivamente", () => {
    const r = makeVariables({ a: def("b+1"), b: def("2") }, fresh());
    expect((r.variables.a as TNum).value).toBe(3);
    expect(r.conditionSatisfied).toBe(true);
  });

  it("riferimento circolare → chiave upstream", () => {
    expect(() => makeVariables({ a: def("b"), b: def("a") }, fresh())).toThrow(JmeError);
    try {
      makeVariables({ a: def("b"), b: def("a") }, fresh());
    } catch (e) {
      expect((e as JmeError).key).toBe("jme.variables.circular reference");
    }
  });

  it("assegnazione multipla a,b", () => {
    const r = makeVariables({ "a,b": def("[1,2]") }, fresh());
    expect((r.variables.a as TNum).value).toBe(1);
    expect((r.variables.b as TNum).value).toBe(2);
  });

  it("la condizione è valutata una volta e non rigenera", () => {
    const r = makeVariables({ n: def("random(1..6)") }, fresh("x"), compile("n>100"));
    expect(r.conditionSatisfied).toBe(false);
  });

  it("stesso seed → stessi valori; l'ordine del JSON decide i draw", () => {
    const todo = () => ({ a: def("random(1..1000)"), b: def("random(1..1000)") });
    const r1 = makeVariables(todo(), fresh("k"));
    const r2 = makeVariables(todo(), fresh("k"));
    expect((r1.variables.a as TNum).value).toBe((r2.variables.a as TNum).value);
    expect((r1.variables.b as TNum).value).toBe((r2.variables.b as TNum).value);
    const swapped = makeVariables({ b: def("random(1..1000)"), a: def("random(1..1000)") }, fresh("k"));
    expect((swapped.variables.b as TNum).value).toBe((r1.variables.a as TNum).value);
  });

  it("remakeVariables ricalcola solo i dipendenti", () => {
    const todo = { a: def("1"), b: def("a+1"), c: def("5") };
    const r = makeVariables(todo, fresh());
    const s2 = remakeVariables(todo, { a: r.scope.evaluate("10") as Token }, r.scope);
    expect((s2.getVariable("b") as TNum).value).toBe(11);
    expect((s2.getVariable("c") as TNum).value).toBe(5);
    expect(Object.keys(variableDependants(todo, ["a"], r.scope))).toEqual(["b"]);
  });
});

// Assert upstream rimandato dal Task 4/5 (jme-tests.mjs:105-117, dentro il
// modulo `Subvars`, ultimo blocco del test `findvars`): dipende da
// `jme.variables.makeFunction`, non ancora portata a quel punto. Vedi la nota
// di rinvio in test/unit/builtins-control-flow.test.ts.
describe("Subvars > findvars (blocco rimandato)", () => {
  it("una funzione personalizzata ricorsiva non produce il proprio nome in findvars", () => {
    const fn = makeFunction(
      {
        parameters: [{ type: "number", name: "x" }],
        definition: "if(x>0,0,f(x-1))",
        name: "f",
        language: "jme",
        // upstream omette `outtype` in questo test (func_data non lo
        // richiede a runtime); qui è obbligatorio per il tipo `FunctionDef`.
        outtype: "number",
      },
      builtinScope,
    );
    const scope = new Scope([builtinScope]);
    scope.addFunction(fn);
    // upstream (jme-tests.mjs:115) chiama `findvars(tree, scope)` con 2
    // argomenti: `scope` finisce nel parametro `boundvars`, e `scope` (il
    // terzo parametro) resta `undefined` — un refuso del test upstream,
    // innocuo qui perché `f(2)` ha come unico argomento un numero, il cui
    // ramo di `findvars` non legge mai `boundvars`. Si chiama la forma a 3
    // argomenti chiaramente intesa; il risultato osservabile è identico.
    const vars = findvars(compile("f(2)"), [], scope);
    expect(vars).toEqual([]);
    delete findvarsOps["f"];
  });
});

// `functions.ts`, `rulesets.ts`, `constants.ts`, `subvars.ts`: nessun test
// upstream puro esiste per queste (§5.2 dell'inventario, tutte "nostre").
describe("makeFunction", () => {
  it("funzione personalizzata in JME, usabile dallo scope", () => {
    const fn = makeFunction(
      { parameters: [{ type: "number", name: "x" }], definition: "x*2", name: "double", language: "jme", outtype: "number" },
      builtinScope,
    );
    const scope = new Scope([builtinScope]);
    scope.addFunction(fn);
    expect((scope.evaluate("double(21)") as TNum).value).toBe(42);
  });

  it("funzione personalizzata in JavaScript, usabile dallo scope", () => {
    const fn = makeFunction(
      {
        parameters: [{ type: "number", name: "x" }],
        definition: "return x*2;",
        name: "jsdouble",
        language: "javascript",
        outtype: "number",
      },
      builtinScope,
    );
    const scope = new Scope([builtinScope]);
    scope.addFunction(fn);
    expect((scope.evaluate("jsdouble(21)") as TNum).value).toBe(42);
  });

  it("allowJavascript:false impedisce le funzioni JavaScript", () => {
    expect(() =>
      makeFunction(
        {
          parameters: [{ type: "number", name: "x" }],
          definition: "return x*2;",
          name: "jsdouble2",
          language: "javascript",
          outtype: "number",
        },
        builtinScope,
        undefined,
        { allowJavascript: false },
      ),
    ).toThrow(JmeError);
    try {
      makeFunction(
        {
          parameters: [{ type: "number", name: "x" }],
          definition: "return x*2;",
          name: "jsdouble2",
          language: "javascript",
          outtype: "number",
        },
        builtinScope,
        undefined,
        { allowJavascript: false },
      );
    } catch (e) {
      expect((e as JmeError).key).toBe("jme.variables.javascript function not allowed");
    }
  });

  it("una funzione JavaScript che restituisce una promise non è supportata", () => {
    const fn = makeFunction(
      {
        parameters: [],
        definition: "return Promise.resolve(1);",
        name: "asyncfn",
        language: "javascript",
        outtype: "number",
      },
      builtinScope,
    );
    const scope = new Scope([builtinScope]);
    scope.addFunction(fn);
    expect(() => scope.evaluate("asyncfn()")).toThrow(JmeError);
  });
});

describe("makeRulesets", () => {
  it("costruisce un ruleset a partire dai nomi di altri ruleset", () => {
    const scope = new Scope(builtinScope);
    const out = makeRulesets({ mine: ["basic"] }, scope);
    expect(out.mine!.rules.length).toBeGreaterThan(0);
    expect(scope.getRuleset("mine")).toBe(out.mine);
  });

  it("riferimento circolare fra ruleset → chiave upstream", () => {
    const scope = new Scope(builtinScope);
    expect(() => makeRulesets({ a: ["b"], b: ["a"] }, scope)).toThrow(JmeError);
    try {
      makeRulesets({ a: ["b"], b: ["a"] }, new Scope(builtinScope));
    } catch (e) {
      expect((e as JmeError).key).toBe("ruleset.circular reference");
    }
  });
});

describe("makeConstants", () => {
  it("aggiunge le costanti allo scope, rispettando `enabled`", () => {
    const scope = new Scope(builtinScope);
    makeConstants([{ name: "k", value: "5", tex: "k" }], scope);
    expect((scope.getConstant("k")!.value as TNum).value).toBe(5);

    const scope2 = new Scope(builtinScope);
    makeConstants([{ name: "k", value: "5", tex: "k" }], scope2, { k: false });
    expect(scope2.getConstant("k")).toBeUndefined();
  });
});

describe("substituteHtml", () => {
  it("sostituisce {espr} in testo semplice", () => {
    expect(substituteHtml("il valore è {1+1}", builtinScope)).toBe("il valore è 2");
  });

  it("serializza le liste come [ a, b ] (doToken)", () => {
    expect(substituteHtml("{[1,2]}", builtinScope)).toBe("[ 1, 2 ]");
  });

  it("sostituisce \\var{} dentro un blocco matematico", () => {
    expect(substituteHtml("$\\var{1+1}$", builtinScope)).toContain("2");
  });
});
