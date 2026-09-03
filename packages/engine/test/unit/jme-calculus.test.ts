// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del test QUnit `Evaluating > Calculus` (tests/jme/jme-tests.mjs:
// 1578-1607): 20 casi di derivazione simbolica.
//
// Upstream ogni caso passa dal builtin `diff`, che semplifica il risultato col
// ruleset `all` (jme-builtins.js:3755-3761) e lo confronta come stringa JME.
// Qui il confronto è strutturale (`treesSame`) fra i due membri semplificati
// con lo stesso ruleset, perché `treeToJME` arriva col Task 5.

import { describe, expect, it } from "vitest";
import { compile } from "../../src/jme/parser";
import { treesSame } from "../../src/jme/compare";
import type { Tree } from "../../src/jme/tokens";
import { simplify } from "../../src/jme/rules";
import { differentiate } from "../../src/jme/calculus";
import { makeSimplifyScope, raisesJmeError } from "./jme-helpers";

const scope = makeSimplifyScope();

/** Deriva `expr` rispetto a `wrt` e confronta con `expected`, semplificando
 * entrambi i membri col ruleset `all` come fa il builtin `diff`. */
function diffEquals(expr: string, wrt: string, expected: string): void {
  const d = differentiate(compile(expr) as Tree, wrt, scope);
  const got = simplify(d, "all", scope);
  const want = simplify(compile(expected) as Tree, "all", scope);
  expect(treesSame(got, want, scope), `diff(${expr}, ${wrt}) = ${expected}`).toBe(true);
}

describe("Evaluating > Calculus", () => {
  it("costanti e nomi", () => {
    diffEquals("0", "x", "0");
    diffEquals("1", "x", "0");
    diffEquals("x", "x", "1");
    diffEquals("x", "y", "0");
    diffEquals("y", "y", "1");
  });

  it("potenze, somme e differenze", () => {
    diffEquals("x^2", "x", "2x");
    diffEquals("2x^5", "x", "10*x^4");
    diffEquals("x+x^2", "x", "1 + 2x");
    diffEquals("x^2-x", "x", "2x - 1");
    diffEquals("x^(1/-3)", "x", "-(1/3)*x^(-1/3 - 1)");
  });

  it("prodotti e quozienti", () => {
    diffEquals("sin(x)/x", "x", "(x*cos(x) - sin(x))/x^2");
    diffEquals("x*x", "x", "2x");
    diffEquals("x^3*y^2", "y", "2*x^3*y");
    diffEquals("cos(x)*y", "y", "cos(x)");
  });

  it("esponenziali e regola della catena", () => {
    diffEquals("e^x", "x", "e^x");
    diffEquals("2^x", "x", "ln(2)*2^x");
    diffEquals("sin(x)^2", "x", "2*cos(x)*sin(x)");
    diffEquals("sin(x^2)", "x", "2x*cos(x^2)");
  });

  // I due casi restanti (jme-tests.mjs:1595 e 1596) danno alberi equivalenti
  // ma non identici: i due membri differiscono per l'associatività di `+` e
  // per il tipo del token `1` (number contro integer), quindi `treesSame` è
  // falso anche se `treeToJME` dà la stessa stringa upstream.
  // Verifica via treeToJME nel Task 5.
  it.skip("somme miste (verifica via treeToJME nel Task 5)", () => {
    diffEquals("x+y+x*y+y^2*x^2", "y", "1 + x + 2*x^2*y");
    diffEquals("2x^3*y^4 + 5x^6 + 7y^8 + 9*x*y", "y", "8*x^3*y^3 + 56*y^7 + 9x");
  });

  it("una funzione senza derivata nota è un errore", () => {
    // jme-calculus.js:172
    raisesJmeError(
      () => differentiate(compile("f(x)") as Tree, "x", scope),
      "jme.calculus.unknown derivative",
      "f(x) non ha una derivata nota",
    );
  });
});
