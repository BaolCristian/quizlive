/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// `Scopes > Rulesets` (tests/jme/jme-tests.mjs:1935-1940) più i test nostri su
// `collectRuleset` e `Ruleset.simplify`, che upstream sono coperti solo di
// rimbalzo dal modulo `Display` (che arriva col Task 5).
//
// I risultati attesi sono stati verificati contro il runtime upstream
// (`.numbas-upstream/tests/jme-runtime.js`, commit 0f0ea33).

import { describe, expect, it } from "vitest";
import { compile } from "../../src/jme/parser";
import { Scope } from "../../src/jme/scope";
import { treesSame } from "../../src/jme/compare";
import type { Tree } from "../../src/jme/tokens";
import {
  collectRuleset,
  conflictingSimplificationRules,
  Ruleset,
  simplificationRules,
  simplify,
} from "../../src/jme/rules";
import { makeSimplifyScope, raisesJmeError } from "./jme-helpers";

const scope = makeSimplifyScope();

/** Semplifica l'espressione e verifica che sia l'albero atteso. */
function simplifiesTo(expr: string, ruleset: string | string[] | Ruleset, expected: string, message: string): void {
  const out = simplify(compile(expr) as Tree, ruleset, scope);
  expect(treesSame(out, compile(expected) as Tree, scope), message).toBe(true);
}

describe("Scopes > Rulesets", () => {
  it("uno scope appena costruito non ha ruleset", () => {
    // jme-tests.mjs:1936
    expect(new Scope().rulesets, "lo scope dal costruttore non ha ruleset").toEqual({});
  });

  it("si può estendere uno scope con dei ruleset", () => {
    // jme-tests.mjs:1937-1938
    const s = new Scope({ rulesets: simplificationRules });
    expect(s.getRuleset("basic"), "ruleset aggiunti allo scope").toBeTruthy();
  });
});

describe("collectRuleset", () => {
  it("aggiunge `basic` solo quando la specifica è una stringa", () => {
    // jme-rules.js:2062-2065 — `set.splice(0,0,'basic')` sta solo nel ramo
    // della stringa (inventario §8.2).
    const basicRules = (simplificationRules["basic"] as Ruleset).rules;
    const fromString = collectRuleset("trig", simplificationRules).rules;
    const fromArray = collectRuleset(["trig"], simplificationRules).rules;
    expect(
      basicRules.every((r) => fromString.includes(r)),
      'collectRuleset("trig") contiene le regole di basic',
    ).toBe(true);
    expect(
      basicRules.some((r) => fromArray.includes(r)),
      'collectRuleset(["trig"]) non contiene le regole di basic',
    ).toBe(false);
    expect(fromString.length, 'collectRuleset("trig") ha basic (14) più trig (6)').toBe(basicRules.length + 6);
    expect(fromArray.length, 'collectRuleset(["trig"]) ha solo le 6 regole di trig').toBe(6);
  });

  it("il prefisso ! toglie le regole di un insieme", () => {
    const basicRules = (simplificationRules["basic"] as Ruleset).rules;
    const rules = collectRuleset("all,!basic", simplificationRules).rules;
    expect(basicRules.some((r) => rules.includes(r)), '"all,!basic" non contiene le regole di basic').toBe(false);
    expect(rules.length, '"all,!basic" tiene le 39 regole restanti').toBe(
      (simplificationRules["all"] as Ruleset).rules.length - basicRules.length,
    );
  });

  it("i nomi dei flag di visualizzazione vivono nello stesso spazio dei ruleset", () => {
    // jme-rules.js:2073 (inventario §8.3)
    expect(collectRuleset("fractionnumbers", simplificationRules).flagSet("fractionnumbers")).toBe(true);
    expect(collectRuleset("!fractionnumbers", simplificationRules).flagSet("fractionnumbers")).toBe(false);
    expect(collectRuleset("basic", simplificationRules).flagSet("fractionnumbers"), "flag non nominata").toBe(false);
  });

  it("una specifica vuota dà un ruleset vuoto e un nome sconosciuto è un errore", () => {
    expect(collectRuleset("", simplificationRules).rules, "specifica vuota").toEqual([]);
    raisesJmeError(
      () => collectRuleset("nonesuch", simplificationRules),
      "jme.display.collectRuleset.set not defined",
      "un nome di ruleset sconosciuto è un errore",
    );
  });

  it("`all` non contiene i ruleset in conflitto", () => {
    // jme-rules.js:2288-2291 (inventario §8.4)
    const all = (simplificationRules["all"] as Ruleset).rules;
    expect(Object.keys(conflictingSimplificationRules).length, "sono sei i ruleset in conflitto").toBe(6);
    for (const [name, set] of Object.entries(conflictingSimplificationRules)) {
      expect(
        set.rules.some((r) => all.includes(r)),
        `${name} non entra in "all"`,
      ).toBe(false);
    }
    expect(all.length, '"all" ha le 53 regole dei 22 ruleset di base').toBe(53);
  });
});

describe("simplify", () => {
  it("`basic` non toglie il fattore 1: serve `unitFactor`", () => {
    // upstream: `simplify('1*x','basic')` dà `1x`, perché la regola `1*x -> x`
    // sta in `unitFactor`, non in `basic` (verificato sul runtime upstream).
    simplifiesTo("1*x", "basic", "1*x", "basic lascia 1*x com'è");
    simplifiesTo("1*x", "unitFactor", "x", "unitFactor toglie il fattore 1");
  });

  it("collectNumbers calcola i prodotti di numeri", () => {
    simplifiesTo("2*3", "collectNumbers", "6", "2*3 diventa 6");
  });

  it("zeroTerm toglie gli addendi nulli", () => {
    simplifiesTo("x+0", "zeroTerm", "x", "x+0 diventa x");
  });

  it("accetta un Ruleset già costruito e un array di nomi", () => {
    simplifiesTo("1*x", simplificationRules["unitFactor"] as Ruleset, "x", "Ruleset diretto");
    simplifiesTo("1*x", ["unitFactor"], "x", "array di nomi");
  });
});
