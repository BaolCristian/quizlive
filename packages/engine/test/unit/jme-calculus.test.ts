// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del test QUnit `Evaluating > Calculus` (tests/jme/jme-tests.mjs:
// 1578-1607): 20 casi di derivazione simbolica.
//
// Come upstream, ogni caso passa dal builtin `diff` — che semplifica il
// risultato col ruleset `all` (jme-builtins.js:3755-3761) — e confronta la
// stringa JME resa da `treeToJME`. Il Task 4b confrontava invece gli alberi
// con `treesSame`, perché `treeToJME` arriva col Task 5.

import { describe, expect, it } from "vitest";
import { compile } from "../../src/jme/parser";
import type { Token, Tree } from "../../src/jme/tokens";
import { differentiate } from "../../src/jme/calculus";
import { raisesJmeError } from "./jme-helpers";
import { builtinScope } from "../../src/jme/builtins";
import { treeToJME } from "../../src/jme/display-jme";

// dal Task 4b lo scope è quello dei builtin, come upstream (prima era
// `makeSimplifyScope()`, uno scope giocattolo).
const scope = builtinScope;

/** `diff(expr, wrt)` upstream (jme-tests.mjs:1579-1582). */
function diff(expr: string, wrt: string): string {
  const v = scope.evaluate(`diff(expression("${expr}"),"${wrt}")`);
  expect(v, `diff(${expr}, ${wrt}) non deve valutare a null`).not.toBeNull();
  return treeToJME({ tok: v as Token });
}

/** `diff_equals` upstream (jme-tests.mjs:1583-1585). */
function diffEquals(expr: string, wrt: string, expected: string): void {
  expect(diff(expr, wrt), `diff(${expr}, ${wrt})`).toBe(expected);
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

  // jme-tests.mjs:1595-1596 — rimandati dal Task 4b perché i due membri
  // danno alberi equivalenti ma non identici (associatività di `+`, tipo del
  // token `1`): con il confronto per stringa dell'upstream tornano.
  it("somme miste", () => {
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
