/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:1549-1659 — tema `dictionaries`: 10 nomi, 12 firme.
//
// `dict` è PIGRA (riga 1599): riceve gli alberi delle coppie chiave-valore,
// oppure — con un solo argomento — una lista di coppie `[chiave, valore]` da
// valutare.

import { JmeError } from "../errors";
import type { Scope } from "../scope";
import { TBool, TDict, TList, TNum, TString, type Token, type Tree } from "../tokens";
import { evaluate } from "../evaluate";
import { add, pushLazy } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

// jme-builtins.js:1551-1567 — il corpo condiviso da `+` e dalle due firme di
// `merge`: fonde i dizionari dati (o quelli contenuti nell'unica lista data).
/** Fonde una serie di dizionari; le chiavi ripetute vincono da destra. */
function dictUpdate(args: Token[] | Tree[]): Token {
  const nvalue: Record<string, Token> = {};
  let items = toks(args);
  if (items.length == 1 && (items[0] as Token).type == "list") {
    items = (items[0] as TList).value ?? [];
  }
  items.forEach((arg) => {
    const value = (arg as TDict).value ?? {};
    Object.keys(value).forEach((x) => {
      nvalue[x] = value[x] as Token;
    });
  });
  return new TDict(nvalue);
}

/** Registra il tema `dictionaries` (jme-builtins.js:1568-1655). */
export function registerDictionaries(scope: Scope): void {
  // 1568-1571
  add(scope, "+", [TDict, TDict], TDict, null, { evaluate: dictUpdate });
  add(scope, "merge", ["*dict"], TDict, null, { evaluate: dictUpdate });
  add(scope, "merge", ["list of dict"], TDict, null, { evaluate: dictUpdate });

  // 1572-1599
  add(scope, "dict", ["*keypair"], TDict, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      if (trees.length == 0) {
        return new TDict({});
      }
      const value: Record<string, Token> = {};
      if ((trees[0] as Tree).tok.type == "keypair") {
        trees.forEach((kp) => {
          value[(kp.tok as { key: string }).key] = evaluate((kp.args as Tree[])[0] as Tree, s) as Token;
        });
      } else if (trees.length == 1) {
        const list = s.evaluate(trees[0] as Tree) as Token;
        const items = (list as TList).value;
        if (
          list.type != "list" ||
          !(items ?? []).every(
            (item) =>
              item.type == "list" && ((item as TList).value ?? []).length == 2 &&
              (((item as TList).value as Token[])[0] as Token).type == "string",
          )
        ) {
          throw new JmeError("jme.typecheck.no right type definition", { op: "dict" });
        }
        (items as Token[]).forEach((item) => {
          const pair = (item as TList).value as Token[];
          value[(pair[0] as TString).value] = pair[1] as Token;
        });
      } else {
        throw new JmeError("jme.typecheck.no right type definition", { op: "dict" });
      }
      return new TDict(value);
    },
  });
  pushLazy("dict");

  // 1600-1622
  add(scope, "keys", [TDict], TList, (d: Record<string, Token>) => {
    const o: Token[] = [];
    Object.keys(d).forEach((key) => {
      o.push(new TString(key));
    });
    return o;
  });
  add(scope, "values", [TDict], TList, (d: Record<string, Token>) => {
    const o: Token[] = [];
    Object.values(d).forEach((v) => {
      o.push(v);
    });
    return o;
  });
  add(
    scope,
    "values",
    [TDict, "list of string"],
    TList,
    (d: Record<string, Token>, keys: TString[]) =>
      keys.map((key) => {
        if (!Object.hasOwn(d, key.value)) {
          // upstream passa `{key: key}`, cioè il TOKEN invece della stringa:
          // il messaggio conterrebbe `[object Object]`.
          throw new JmeError("jme.func.listval.key not in dict", { key: key.value });
        } else {
          return d[key.value] as Token;
        }
      }),
  );

  // 1623-1631
  add(scope, "items", [TDict], TList, null, {
    evaluate: (args) => {
      const o: Token[] = [];
      Object.entries((toks(args)[0] as TDict).value ?? {}).forEach((x) => {
        o.push(new TList([new TString(x[0]), x[1]]));
      });
      return new TList(o);
    },
  });

  // 1632-1651
  add(scope, "listval", [TDict, TString], "?", null, {
    evaluate: (args) => {
      const d = (toks(args)[0] as TDict).value ?? {};
      const key = (toks(args)[1] as TString).value;
      if (!Object.hasOwn(d, key)) {
        throw new JmeError("jme.func.listval.key not in dict", { key: key });
      }
      return d[key] as Token;
    },
  });
  add(scope, "get", [TDict, TString, "?"], "?", null, {
    evaluate: (args) => {
      const d = (toks(args)[0] as TDict).value ?? {};
      const key = (toks(args)[1] as TString).value;
      if (!Object.hasOwn(d, key)) {
        return toks(args)[2] as Token;
      }
      return d[key] as Token;
    },
  });

  // 1652-1657
  add(scope, "in", [TString, TDict], TBool, (s: string, d: Record<string, Token>) => Object.hasOwn(d, s));
  add(scope, "abs", [TDict], TNum, (d: Record<string, Token>) => Object.keys(d).length);
}
