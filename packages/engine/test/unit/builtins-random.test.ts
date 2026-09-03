// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Random numbers` (jme-tests.mjs:1140-1173) del modulo QUnit
// `Evaluating`, più le verifiche di determinismo del generatore iniettato
// (decisione 1 del brief del Task 4a: niente `Math.random`, niente
// monkey-patching — `seedrandom(seed, expr)` valuta in uno scope figlio con
// `rng = makeRng(seed)`).
//
// ASSERT TRADOTTO DAL TASK 4b IN builtins-control-flow.test.ts:
//   - `8.45 in repeat(random(8.15..8.45#0.1),100)` (1171): `repeat` sta nel
//     tema `lists` (jme-builtins.js:1284), portato dal Task 4b, ed è
//     verificato insieme agli altri assert su `repeat` di `Repetition`.

import { describe, it, expect, beforeEach } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import { makeRng, Scope } from "../../src/jme/scope";
import type { Token } from "../../src/jme/tokens";
import { deepCloseEqual } from "./math-helpers";
import { engineErrorKeys } from "../../src/errors";

/** La prima chiave d'errore lanciata da `fn` (gli errori di `math/` portano la
 * chiave upstream in `err.key`, il messaggio è tradotto). */
function errorKey(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return engineErrorKeys(e)[0] ?? (e instanceof Error ? e.message : String(e));
  }
  return undefined;
}


/** Valuta nello scope dei builtin. */
function ev(expr: string): Token {
  const v = builtinScope.evaluate(expr);
  expect(v, `${expr} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** Il valore grezzo del token. */
function val(t: Token): unknown {
  return (t as { value?: unknown }).value;
}

beforeEach(() => {
  // upstream non semina niente (usa `Math.random`); qui il generatore è
  // esplicito, così i test sono riproducibili.
  builtinScope.rng = makeRng("test");
});

describe("Evaluating > Random numbers", () => {
  it("random su un range", () => {
    let acc = true;
    for (let i = 0; i < 10; i++) {
      acc = acc && [1, 2, 3, 4, 5].includes(val(ev("random(1..5)")) as number);
    }
    expect(acc, "random(1..5) sta in [1,2,3,4,5]").toBe(true);
    expect(val(ev("random(1..1)")), "random(1..1) = 1").toBe(1);
  });

  it("random su liste e argomenti multipli", () => {
    expect(errorKey(() => ev("random([])")), "random([])").toBe("math.choose.empty selection");
    let acc = true;
    for (let i = 0; i < 10; i++) {
      acc = acc && ["a", "b", "c"].includes(val(ev('random(["a","b","c"])')) as string);
    }
    expect(acc, 'random(["a","b","c"]) sta in ["a","b","c"]').toBe(true);

    acc = true;
    for (let i = 0; i < 10; i++) {
      acc = acc && ([1, 2, "a"] as unknown[]).includes(val(ev('random(1,2,"a")')));
    }
    expect(acc, 'random(1,2,"a") sta in [1,2,"a"]').toBe(true);

    const x = val(ev("random(1..3#0)")) as number;
    expect(x >= 1 && x <= 3, "random(1..3#0)").toBe(true);

    expect(errorKey(() => ev("random()")), "random()").toBe("math.choose.empty selection");
  });

  it("deal", () => {
    deepCloseEqual(
      (val(ev("deal(4)")) as Token[]).map((t) => val(t)).sort(),
      [0, 1, 2, 3],
      "deal(4) è una permutazione di 0..3",
    );
  });

  it("il tipo prodotto da random su un range", () => {
    expect(ev("random(1..5)").type, "random(1..5) dà un intero").toBe("integer");
    expect(ev("random(1..5#3)").type, "random(1..5#3) dà un intero").toBe("integer");
    expect(ev("random(1..5#0.5)").type, "random(1..5#0.5) dà un number").toBe("number");
  });

  it("shuffle, shuffle_together, weighted_random, random_integer_partition", () => {
    const s = (val(ev("shuffle([1,2,3,4,5])")) as Token[]).map((t) => val(t)).sort();
    expect(s, "shuffle conserva gli elementi").toEqual([1, 2, 3, 4, 5]);

    const st = val(ev('shuffle_together([[1,2,3],["a","b","c"]])')) as Token[];
    const first = (val(st[0] as Token) as Token[]).map((t) => val(t));
    const second = (val(st[1] as Token) as Token[]).map((t) => val(t));
    expect(
      first.map((n) => ["a", "b", "c"][(n as number) - 1]),
      "shuffle_together applica la stessa permutazione",
    ).toEqual(second);

    expect(
      [1, 2].includes(val(ev('weighted_random([[1,1],[2,1]])')) as number),
      "weighted_random sceglie fra i valori dati",
    ).toBe(true);

    const p = (val(ev("random_integer_partition(10,3)")) as Token[]).map((t) => val(t) as number);
    expect(p.length, "random_integer_partition(10,3) ha 3 parti").toBe(3);
    expect(
      p.reduce((a, b) => a + b, 0),
      "le parti sommano a 10",
    ).toBe(10);
  });
});

describe("seedrandom e determinismo del generatore", () => {
  it("seedrandom dà sempre lo stesso risultato", () => {
    const first = val(ev("seedrandom('a', random(1..1000000))"));
    for (let i = 0; i < 5; i++) {
      expect(val(ev("seedrandom('a', random(1..1000000))")), "seedrandom('a', ...) è stabile").toBe(first);
    }
  });

  it("seedrandom non tocca il generatore dello scope chiamante", () => {
    builtinScope.rng = makeRng("k");
    const a = val(ev("random(1..1000000)"));
    ev("seedrandom('other', random(1..1000000))");
    const b = val(ev("random(1..1000000)"));

    builtinScope.rng = makeRng("k");
    const a2 = val(ev("random(1..1000000)"));
    const b2 = val(ev("random(1..1000000)"));
    expect(a, "il primo tiro non cambia").toBe(a2);
    expect(b, "seedrandom non consuma il generatore esterno").toBe(b2);
  });

  it("due scope con makeRng('k') danno la stessa sequenza", () => {
    const draw = (): unknown[] => {
      const scope = new Scope([builtinScope, { rng: makeRng("k") }]);
      const out: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        out.push(val(scope.evaluate("random(1..1000000)") as Token));
      }
      return out;
    };
    expect(draw(), "stesso seme, stessa sequenza").toEqual(draw());
  });

  it("semi diversi danno sequenze diverse", () => {
    const draw = (seed: string): unknown[] => {
      const scope = new Scope([builtinScope, { rng: makeRng(seed) }]);
      const out: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        out.push(val(scope.evaluate("random(1..1000000)") as Token));
      }
      return out;
    };
    expect(draw("k"), "semi diversi, sequenze diverse").not.toEqual(draw("j"));
  });
});
