/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:1661-1812 — tema `strings`: 25 nomi, 31 firme.
//
// Due divergenze volute (vedi DIVERGENCES.md):
//   - `translate(str[, params])` chiama `t(key, params)` del modulo `i18n/`
//     invece della `R()` globale di i18next (§8.15 dell'inventario).
//   - `formatstring`/`join` passano da `tokenToDisplayString`, che per i tipi
//     numerici richiede il gancio `displayHooks.treeToJME` del Task 5.
//
// `safe` è PIGRA (riga 1707) e registra un gestore di `findvarsOps`, come
// `render` (1720).

import * as math from "../../math";
import type { Scope } from "../scope";
import { Scope as ScopeClass } from "../scope";
import { TBool, TDict, TList, TNum, TRange, TString, type Token, type Tree } from "../tokens";
import { findvars, findvarsOps, isFunction } from "../evaluate";
import { contentsubvars, tokenToDisplayString } from "../subvars";
import { mergeUnique } from "../util";
import { t } from "../../i18n";
import { add, pushLazy, sig } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

/** Registra il tema `strings` (jme-builtins.js:1662-1810). */
export function registerStrings(scope: Scope): void {
  // 1663-1667
  const fconc = (a: unknown, b: unknown) => (a as string) + (b as string);
  add(scope, "+", [TString, "?"], TString, fconc);
  add(scope, "+", ["?", TString], TString, fconc);

  // 1668-1676
  add(scope, "formatstring", [TString, TList], TString, null, {
    evaluate: (args, s) => {
      const str = (toks(args)[0] as TString).value;
      const extra = (toks(args)[1] as TList).value ?? [];
      return new TString(math.formatString(str, ...extra.map((x) => tokenToDisplayString(x, s))));
    },
  });

  // 1677-1678
  add(scope, "unpercent", [TString], TNum, math.unPercent);
  add(scope, "letterordinal", [TNum], TString, math.letterOrdinal);

  // 1679-1687 — marca la stringa come LaTeX "sicuro" da mostrare com'è.
  add(scope, "latex", [TString], TString, null, {
    evaluate: (args) => {
      const arg = toks(args)[0] as TString;
      const s = new TString(arg.value);
      s.latex = true;
      s.display_latex = true;
      if (arg.safe !== undefined) {
        s.safe = arg.safe;
      }
      return s;
    },
  });

  // 1688-1710 — disattiva la sostituzione di variabili `{...}` nella stringa.
  add(scope, "safe", [TString], TString, null, {
    evaluate: (args, sc) => {
      let s = (args as Tree[])[0] as Tree;
      while (isFunction(s.tok, "safe")) {
        s = (s.args as Tree[])[0] as Tree;
      }
      let t2: TString;
      if (s.args) {
        const r = sc.evaluate(s) as TString;
        t2 = new TString(r.value);
        if (r.latex !== undefined) {
          t2.latex = r.latex;
        }
        if (r.display_latex !== undefined) {
          t2.display_latex = r.display_latex;
        }
      } else {
        t2 = new TString((s.tok as TString).value);
      }
      t2.safe = true;
      return t2;
    },
  });
  pushLazy("safe");
  findvarsOps["safe"] = function () {
    return [];
  };

  // 1712-1729
  add(scope, "render", [TString, sig.optional(sig.type("dict"))], TString, null, {
    evaluate: (args, s) => {
      const str = (toks(args)[0] as TString).value;
      const variables = (toks(args).length > 1 ? (toks(args)[1] as { value?: Record<string, Token> }).value : {}) ?? {};
      const scope2 = new ScopeClass([s, { variables: variables }]);
      return new TString(contentsubvars(str, scope2, true));
    },
  });
  findvarsOps["render"] = function (tree, boundvars, s) {
    let vars: string[] = [];
    const args = tree.args as Tree[];
    if ((args[0] as Tree).tok.type != "string") {
      vars = findvars(args[0] as Tree, [], s);
    }
    if (args.length > 1) {
      vars = mergeUnique(vars, findvars(args[1] as Tree, boundvars, s));
    }
    return vars;
  };

  // 1730-1741
  add(scope, "capitalise", [TString], TString, (s: string) => math.capitalise(s));
  add(scope, "upper", [TString], TString, (s: string) => s.toUpperCase());
  add(scope, "lower", [TString], TString, (s: string) => s.toLowerCase());
  add(scope, "pluralise", [TNum, TString, TString], TString, (n: number, singular: string, plural: string) =>
    math.pluralise(n, singular, plural),
  );

  // 1742-1750
  add(scope, "join", [TList, TString], TString, null, {
    evaluate: (args, s) => {
      const list = (toks(args)[0] as TList).value ?? [];
      const delimiter = (toks(args)[1] as TString).value;
      return new TString(list.map((x) => tokenToDisplayString(x, s)).join(delimiter));
    },
  });

  // 1751-1760
  add(scope, "split", [TString, TString], TList, (str: string, delimiter: string) =>
    str.split(delimiter).map((s) => new TString(s)),
  );
  add(scope, "trim", [TString], TString, (str: string) => str.trim());
  add(scope, "currency", [TNum, TString, TString], TString, math.currency, { latex: true });
  add(scope, "separateThousands", [TNum, TString], TString, math.separateThousands);

  // 1761-1766
  add(scope, "listval", [TString, TNum], TString, (s: string, i: number) => s[i]);
  add(scope, "listval", [TString, TRange], TString, (s: string, range: math.Range) => s.slice(range[0], range[1]));

  // 1767-1771
  add(scope, "in", [TString, TString], TBool, (sub: string, str: string) => str.indexOf(sub) >= 0);
  add(scope, "lpad", [TString, TNum, TString], TString, math.lpad);
  add(scope, "rpad", [TString, TNum, TString], TString, math.rpad);

  // 1772-1782
  add(
    scope,
    "match_regex",
    [TString, TString],
    TList,
    (pattern: string, str: string) => {
      const re = new RegExp(pattern, "u");
      const m = re.exec(str);
      return m || [];
    },
    { unwrapValues: true },
  );
  add(
    scope,
    "match_regex",
    [TString, TString, TString],
    TList,
    (pattern: string, str: string, flags: string) => {
      const re = new RegExp(pattern, flags);
      const m = re.exec(str);
      return m || [];
    },
    { unwrapValues: true },
  );

  // 1783-1793
  add(scope, "split_regex", [TString, TString], TList, (str: string, delimiter: string) =>
    str.split(new RegExp(delimiter, "u")).map((s) => new TString(s)),
  );
  add(scope, "split_regex", [TString, TString, TString], TList, (str: string, delimiter: string, flags: string) =>
    str.split(new RegExp(delimiter, flags)).map((s) => new TString(s)),
  );

  // 1794-1801
  add(scope, "replace_regex", [TString, TString, TString], TString, (pattern: string, replacement: string, str: string) =>
    str.replace(new RegExp(pattern, "u"), replacement),
  );
  add(
    scope,
    "replace_regex",
    [TString, TString, TString, TString],
    TString,
    (pattern: string, replacement: string, str: string, flags: string) =>
      str.replace(new RegExp(pattern, flags), replacement),
  );

  // 1802-1804
  add(scope, "abs", [TString], TNum, (s: string) => s.length);

  // 1805-1810 — upstream chiama `R(s)`/`R(s, params)`, la funzione globale di
  // i18next; qui il dizionario è quello del motore (`i18n/`).
  add(scope, "translate", [TString], TString, (s: string) => t(s));
  add(
    scope,
    "translate",
    [TString, TDict],
    TString,
    (s: string, params: Record<string, string | number>) => t(s, params),
    { unwrapValues: true },
  );
}
