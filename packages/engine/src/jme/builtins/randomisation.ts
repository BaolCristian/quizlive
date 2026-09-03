/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:2927-3012 — tema `randomisation`.
//
// DIFFERENZA STRUTTURALE VOLUTA (§8.12 dell'inventario, decisione 1 del brief
// del Task 4a): upstream le funzioni casuali chiamano `Math.random` tramite
// `Numbas.math`, e `seedrandom(seed, expr)` sostituisce `Math.random` globale
// prima di valutare `expr`, ripristinandolo in un `finally`. Qui il
// generatore è iniettato: le funzioni leggono `scope.rng` AL MOMENTO DELLA
// CHIAMATA (non alla registrazione) e `seedrandom` valuta l'espressione in
// uno `Scope` figlio con `rng = makeRng(seed)`, senza toccare nulla di
// globale. Il generatore dello scope chiamante non viene consumato.

import * as math from "../../math";
import { makeRng, Scope } from "../scope";
import { TInt, TList, TNum, TRange, type Token, type Tree } from "../tokens";
import { isDeterministic, isDeterministicOps, unwrapValue } from "../evaluate";
import { add, pushLazy, sig } from "./registry";
import { best_number_type_for_range } from "./ranges";

/** Registra il tema `randomisation` (jme-builtins.js:2928-3006). */
export function registerRandomisation(scope: Scope): void {
  // 2928-2947
  add(scope, "random", [TRange], TNum, null, {
    evaluate: (args, s) => {
      const range = (args as Token[])[0] as TRange;
      const n = math.random(range.value as math.Range, s.rng);
      const cons = best_number_type_for_range(range.value as math.Range);
      return new (cons as unknown as new (v: number) => Token)(n);
    },
    random: true,
  });
  add(scope, "random", [TList], "?", null, {
    random: true,
    evaluate: (args, s) => math.choose(((args as Token[])[0] as TList).value ?? [], s.rng),
  });
  add(scope, "random", ["*?"], "?", null, {
    random: true,
    evaluate: (args, s) => math.choose(args as Token[], s.rng),
  });

  // 2949-2957
  add(scope, "weighted_random", [sig.listof(sig.list(sig.anything(), sig.type("number")))], "?", null, {
    evaluate: (args, s) => {
      const items = (((args as Token[])[0] as TList).value ?? []).map((item) => {
        const pair = (item as TList).value as Token[];
        return [pair[0] as Token, unwrapValue(pair[1] as Token) as number] as [Token, number];
      });
      return math.weighted_random(items, s.rng) as Token;
    },
    random: true,
  });

  // 2959-2977 — PIGRA: valuta il seme nello scope corrente e l'espressione in
  // uno scope figlio con un generatore seminato.
  add(scope, "seedrandom", ["?", "?"], "?", null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const seed = unwrapValue(s.evaluate(trees[0] as Tree) as Token);
      const seeded = new Scope([s, { rng: makeRng(String(seed)) }]);
      return seeded.evaluate(trees[1] as Tree) as Token;
    },
  });
  pushLazy("seedrandom");
  // 2974-2977 — il primo argomento (il seme) è comunque deterministico.
  isDeterministicOps["seedrandom"] = function (expr: Tree, s: Scope): boolean {
    return isDeterministic((expr.args as Tree[])[0] as Tree, s);
  };

  // 2978-3006
  add(
    scope,
    "deal",
    [TNum],
    TList,
    null,
    {
      random: true,
      evaluate: (args, s) => new TList(math.deal(((args as Token[])[0] as TNum).value as number, s.rng).map((i) => new TNum(i))),
    },
  );
  add(scope, "shuffle", [TList], TList, null, {
    random: true,
    evaluate: (args, s) => new TList(math.shuffle(((args as Token[])[0] as TList).value ?? [], s.rng)),
  });
  add(scope, "shuffle_together", [sig.listof(sig.type("list"))], TList, null, {
    random: true,
    evaluate: (args, s) => {
      const lists = (((args as Token[])[0] as TList).value ?? []).map((l) => ((l as TList).value ?? []) as Token[]);
      const shuffled = math.shuffle_together(lists, s.rng);
      return new TList(shuffled.map((l) => new TList(l)));
    },
  });

  add(scope, "random_integer_partition", [TNum, TNum], TList, null, {
    random: true,
    evaluate: (args, s) => {
      const n = ((args as Token[])[0] as TNum).value as number;
      const k = ((args as Token[])[1] as TNum).value as number;
      return new TList(math.random_integer_partition(n, k, s.rng).map((x) => new TInt(x)));
    },
  });
}
