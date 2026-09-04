/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:1195-1547 — tema `lists`: 26 nomi, 40 firme.
//
// `sum`/`prod` hanno una firma per ciascun tipo numerico esatto e usano
// `unwrapValues`, quindi ricevono valori JS grezzi (numeri, `bigint`,
// `Decimal`, `Fraction`) invece dei token.

import * as math from "../../math";
import { JmeError } from "../errors";
import type { Scope } from "../scope";
import {
  TDecimal,
  TInt,
  TList,
  TNum,
  TRange,
  TName,
  TRational,
  TString,
  TVector,
  TBool,
  type Token,
  type Tree,
} from "../tokens";
import { evaluate } from "../evaluate";
import { compareTokens, sortTokensBy } from "../compare";
import { contains, distinct, eq, except } from "../equality";
import { add, int_options, pushLazy, sig } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

/** Registra il tema `lists` (jme-builtins.js:1196-1525). */
export function registerLists(scope: Scope): void {
  // 1196-1207
  add(scope, "+", [TList, TList], TList, null, {
    evaluate: (args) => {
      const value = ((toks(args)[0] as TList).value ?? []).concat((toks(args)[1] as TList).value ?? []);
      return new TList(value);
    },
  });
  add(scope, "+", [TList, "?"], TList, null, {
    evaluate: (args) => {
      const value = ((toks(args)[0] as TList).value ?? []).slice();
      value.push(toks(args)[1] as Token);
      return new TList(value);
    },
  });

  // 1209-1213
  add(scope, "list", [TRange], TList, (range: math.Range) => math.rangeToList(range).map((n) => new TNum(n)));

  // 1215-1224 — la lista può contenere valori di qualunque tipo: si usa
  // `util.except`, che confronta con `util.eq`.
  add(scope, "except", [TList, TList], TList, null, {
    evaluate: (args, s) =>
      new TList(except((toks(args)[0] as TList).value ?? [], (toks(args)[1] as TList).value ?? [], s)),
  });
  add(scope, "except", [TList, "?"], TList, null, {
    evaluate: (args, s) => new TList(except((toks(args)[0] as TList).value ?? [], [toks(args)[1] as Token], s)),
  });

  // 1225-1229 — upstream passa un SESTO argomento `{unwrapValues:false}` a
  // `add_function`, che ne accetta cinque: viene ignorato.
  add(scope, "distinct", [TList], TList, null, {
    evaluate: (args, s) => new TList(distinct((toks(args)[0] as TList).value ?? [], s)),
  });

  // 1230-1234
  add(scope, "in", ["?", TList], TBool, null, {
    evaluate: (args, s) => new TBool(contains((toks(args)[1] as TList).value ?? [], toks(args)[0] as Token, s)),
  });

  // 1235-1237
  add(scope, "abs", [TList], TNum, (l: Token[]) => l.length);

  // 1238-1256
  add(scope, "sum", [sig.listof(sig.type("number"))], TNum, math.sum, { unwrapValues: true });
  add(scope, "sum", [sig.listof(sig.type("integer"))], TInt, (list: bigint[]) => new TInt(math.sum(list) as bigint), {
    unwrapValues: true,
  });
  add(
    scope,
    "sum",
    [sig.listof(sig.type("decimal"))],
    TDecimal,
    (list: math.ComplexDecimal[]) => {
      let total = math.ensure_decimal(0);
      for (const x of list) {
        total = total.plus(x);
      }
      return total;
    },
    { unwrapValues: true },
  );
  add(
    scope,
    "sum",
    [sig.listof(sig.type("rational"))],
    TRational,
    (list: math.Fraction[]) => {
      let total = new math.Fraction(0, 1);
      for (const x of list) {
        total = total.add(x);
      }
      return total;
    },
    { unwrapValues: true },
  );
  add(scope, "sum", [TVector], TNum, math.sum);

  // 1258-1276
  add(scope, "prod", [sig.listof(sig.type("number"))], TNum, math.prod, { unwrapValues: true });
  add(
    scope,
    "prod",
    [sig.listof(sig.type("integer"))],
    TInt,
    (list: bigint[]) => new TInt(math.prod(list) as bigint),
    int_options,
  );
  add(
    scope,
    "prod",
    [sig.listof(sig.type("decimal"))],
    TDecimal,
    (list: math.ComplexDecimal[]) => {
      let total = math.ensure_decimal(1);
      for (const x of list) {
        total = total.times(x);
      }
      return total;
    },
    { unwrapValues: true },
  );
  add(
    scope,
    "prod",
    [sig.listof(sig.type("rational"))],
    TRational,
    (list: math.Fraction[]) => {
      let total = new math.Fraction(1, 1);
      for (const x of list) {
        total = total.multiply(x);
      }
      return total;
    },
    { unwrapValues: true },
  );
  add(scope, "prod", [TVector], TNum, math.prod);

  // 1277-1283
  add(scope, "reorder", [TList, sig.listof(sig.type("number"))], TList, (list: Token[], order: TNum[]) =>
    math.reorder(
      list,
      order.map((n) => n.value as number),
    ),
  );

  // 1284-1294 — `repeat(expr,n)` valuta `expr` n volte: è PIGRA.
  add(scope, "repeat", ["?", TNum], TList, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const size = (evaluate(trees[1] as Tree, s) as TNum).value as number;
      const value: Token[] = [];
      for (let i = 0; i < size; i++) {
        value[i] = evaluate(trees[0] as Tree, s) as Token;
      }
      return new TList(value);
    },
  });
  pushLazy("repeat");

  // 1295-1334
  add(scope, "listval", [TList, TNum], "?", null, {
    evaluate: (args) => {
      const list = toks(args)[0] as TList;
      const index = math.wrapListIndex((toks(args)[1] as TNum).value as number, list.vars);
      // upstream: il ramo `name` è irraggiungibile con questa firma, ma il
      // messaggio d'errore fa parte del contratto.
      if (list.type !== "list") {
        if ((list as Token).type === "name") {
          throw new JmeError("jme.variables.variable not defined", { name: (list as unknown as TName).name });
        } else {
          throw new JmeError("jme.func.listval.not a list");
        }
      }
      const value = list.value ?? [];
      if (index in value) {
        return value[index] as Token;
      } else {
        throw new JmeError("jme.func.listval.invalid index", { index: index, size: value.length });
      }
    },
  });
  add(scope, "listval", [TList, TRange], TList, null, {
    evaluate: (args) => {
      const range = (toks(args)[1] as TRange).value as math.Range;
      const list = toks(args)[0] as TList;
      const size = list.vars;
      const start = math.wrapListIndex(range[0], size);
      const end = math.wrapListIndex(range[1], size);
      const step = range[2];
      const items = list.value ?? [];
      let value: Token[];
      if (step != 1) {
        value = [];
        for (let i = start; i < end; i += step) {
          if (i % 1 == 0) {
            value.push(items[i] as Token);
          }
        }
      } else {
        value = items.slice(start, end);
      }
      return new TList(value);
    },
  });

  // 1335-1343
  add(scope, "flatten", ["list of list"], TList, null, {
    evaluate: (args) => {
      let o: Token[] = [];
      ((toks(args)[0] as TList).value ?? []).forEach((l) => {
        o = o.concat((l as TList).value ?? []);
      });
      return new TList(o);
    },
  });

  // 1344-1360
  add(scope, "groups_of", [TList, TNum], TList, null, {
    evaluate: (args) => {
      const list = (toks(args)[0] as TList).value ?? [];
      const n = (toks(args)[1] as TNum).value as number;
      const out: Token[] = [];
      for (let i = 0; i < list.length; i += n) {
        const row = list.slice(i, i + n);
        if (row.length) {
          out.push(new TList(row));
        }
      }
      return new TList(out);
    },
  });

  // 1361-1365
  add(scope, "enumerate", [TList], TList, (list: Token[]) => list.map((v, i) => new TList([new TInt(i), v])));

  // 1366-1373
  add(scope, "sort", [TList], TList, null, {
    evaluate: (args) => {
      const list = toks(args)[0] as TList;
      const newlist = new TList(list.vars);
      newlist.value = (list.value ?? []).slice().sort(compareTokens);
      return newlist;
    },
  });

  // 1374-1397
  add(scope, "sort_by", [TNum, sig.listof(sig.type("list"))], TList, null, {
    evaluate: (args) => {
      const index = (toks(args)[0] as TNum).value as number;
      const list = toks(args)[1] as TList;
      const newlist = new TList(list.vars);
      newlist.value = (list.value ?? [])
        .slice()
        .sort(sortTokensBy((x) => ((x as TList).value as Token[])[index]));
      return newlist;
    },
  });
  add(scope, "sort_by", [TString, sig.listof(sig.type("dict"))], TList, null, {
    evaluate: (args) => {
      const index = (toks(args)[0] as { value: string }).value;
      const list = toks(args)[1] as TList;
      const newlist = new TList(list.vars);
      newlist.value = (list.value ?? [])
        .slice()
        .sort(sortTokensBy((x) => (x as { value: Record<string, Token> }).value[index]));
      return newlist;
    },
  });

  // 1398-1417
  add(scope, "sort_destinations", [TList], TList, null, {
    evaluate: (args) => {
      const list = toks(args)[0] as TList;
      const newlist = new TList(list.vars);
      const sorted = (list.value ?? [])
        .map((v, i) => ({ tok: v, i: i }))
        .sort((a, b) => compareTokens(a.tok, b.tok));
      const inverse: number[] = [];
      for (let i = 0; i < sorted.length; i++) {
        inverse[(sorted[i] as { i: number }).i] = i;
      }
      newlist.value = inverse.map((n) => new TNum(n));
      return newlist;
    },
  });

  // 1418-1465 — le due firme hanno corpi identici, cambia solo il tipo della
  // chiave (indice numerico in una lista, stringa in un dizionario).
  add(scope, "group_by", [TNum, sig.listof(sig.type("list"))], TList, null, {
    evaluate: (args) => groupBy(toks(args)[0] as Token, toks(args)[1] as TList),
  });
  add(scope, "group_by", [TString, sig.listof(sig.type("dict"))], TList, null, {
    evaluate: (args) => groupBy(toks(args)[0] as Token, toks(args)[1] as TList),
  });

  // 1466-1472
  add(scope, "reverse", [TList], TList, null, {
    evaluate: (args) => new TList(((toks(args)[0] as TList).value ?? []).slice().reverse()),
  });

  // 1473-1485 — gli indici in cui il valore dato compare nella lista.
  add(scope, "indices", [TList, "?"], TList, null, {
    evaluate: (args, s) => {
      const list = toks(args)[0] as TList;
      const target = toks(args)[1] as Token;
      const out: Token[] = [];
      (list.value ?? []).forEach((v, i) => {
        if (eq(v, target, s)) {
          out.push(new TNum(i));
        }
      });
      return new TList(out);
    },
  });

  // 1486-1499
  add(scope, "product", [sig.multiple(sig.type("list"))], TList, (...lists: Token[][]) =>
    math.product(lists).map((l) => new TList(l)),
  );
  add(scope, "product", [TList, TNum], TList, (l: Token[], n: number) =>
    math.cartesian_power(l, n).map((sl) => new TList(sl)),
  );

  // 1500-1506
  add(scope, "zip", [sig.multiple(sig.type("list"))], TList, (...lists: Token[][]) =>
    math.zip(lists).map((l) => new TList(l)),
  );

  // 1507-1524
  add(scope, "combinations", [TList, TNum], TList, (list: Token[], r: number) =>
    math.list_combinations(list, r).map((l) => new TList(l)),
  );
  add(scope, "combinations_with_replacement", [TList, TNum], TList, (list: Token[], r: number) =>
    math.combinations_with_replacement(list, r).map((l) => new TList(l)),
  );
  add(scope, "permutations", [TList, TNum], TList, (list: Token[], r: number) =>
    math.list_permutations(list, r).map((l) => new TList(l)),
  );

  // 1525-1545 — upstream dichiara il tipo di uscita `[TList]` (un ARRAY con
  // dentro il costruttore), che `funcObj` interpreta come `outtype: '?'`;
  // l'`evaluate` custom costruisce comunque una `TList`.
  add(scope, "frequencies", [TList], "?", null, {
    evaluate: (args, s) => {
      const o: Array<[Token, number]> = [];
      const l = (toks(args)[0] as TList).value ?? [];
      l.forEach((x) => {
        // upstream chiama `util.eq(item[0], x)` SENZA scope: i tipi che ne
        // hanno bisogno (`name`, `expression`, `set`, `dict`, `list`)
        // lancerebbero. Qui si passa lo scope della chiamata.
        const p = o.find((item) => eq(item[0], x, s));
        if (p) {
          p[1] += 1;
        } else {
          o.push([x, 1]);
        }
      });
      return new TList(o.map((p) => new TList([p[0], new TNum(p[1])])));
    },
  });
}

// jme-builtins.js:1418-1465 — il corpo condiviso dalle due firme di `group_by`.
/** Raggruppa gli elementi consecutivi con la stessa chiave, dopo averli
 * ordinati per quella chiave. */
function groupBy(indexTok: Token, list: TList): TList {
  const index = (indexTok as { value: string | number }).value;
  /** La chiave di ordinamento di un elemento. */
  const key_of = (x: Token) => (x as { value: Record<string | number, Token> }).value[index];
  const sorted = (list.value ?? []).slice().sort(sortTokensBy(key_of));
  const out: Token[] = [];
  for (let i = 0; i < sorted.length; ) {
    const key = key_of(sorted[i] as Token) as Token;
    const values: Token[] = [sorted[i] as Token];
    for (i++; i < sorted.length; i++) {
      if (compareTokens(key, key_of(sorted[i] as Token) as Token) == 0) {
        values.push(sorted[i] as Token);
      } else {
        break;
      }
    }
    out.push(new TList([key, new TList(values)]));
  }
  return new TList(out);
}
