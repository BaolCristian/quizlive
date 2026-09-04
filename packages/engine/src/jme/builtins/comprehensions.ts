/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:3226-3750 — tema `comprehensions`: 10 nomi, 10 firme.
// `map`, `for:`, `filter`, `iterate`, `iterate_until`, `foldl` e `take` sono
// PIGRE, e ognuna registra il proprio gestore in `jme.findvarsOps` e
// `jme.substituteTreeOps` (righe 3298-3712).
//
// upstream le funzioni `make_lambda` (che riscrivono la forma "vecchia"
// `map(espr, nome, lista)` nella forma con lambda) vivono in
// `options.make_lambda` del `funcObj`, così che `findvarsOps` possa
// richiamarle con `fn.options.make_lambda`. Qui sono funzioni di modulo,
// chiamate direttamente sia da `evaluate` sia da `findvarsOps`: stesso
// comportamento, senza il giro attraverso le opzioni.

import * as math from "../../math";
import { JmeError } from "../errors";
import { signature as sig } from "../funcobj";
import { Scope, type Scope as ScopeType } from "../scope";
import { TBool, TLambda, TList, TMatrix, TName, TNum, TVector, type Token, type Tree } from "../tokens";
import {
  castToType,
  findvars,
  findvarsOps,
  findvars_args,
  isOp,
  isType,
  substituteTree,
  substituteTreeOps,
} from "../evaluate";
import { normaliseName } from "../tokenizer";
import { mergeUnique } from "../util";
import { add, pushLazy } from "./registry";

/** Gli argomenti già valutati di una funzione non pigra. */
function toks(args: Token[] | Tree[]): Token[] {
  return args as Token[];
}

// jme-builtins.js:3229-3240
/** Applica la lambda a ogni elemento della lista. */
function mapOverList(lambda: TLambda, list: Token[], scope: ScopeType): TList {
  const olist = list.map((v) => lambda.evaluate([v], scope));
  return new TList(olist);
}

// jme-builtins.js:3248-3273
/** Come mappare, per tipo del valore su cui si mappa. */
export const mapFunctions: Record<string, (lambda: TLambda, value: unknown, scope: ScopeType) => Token> = {
  list(lambda, value, scope) {
    return mapOverList(lambda, value as Token[], scope);
  },
  set(lambda, value, scope) {
    return mapOverList(lambda, value as Token[], scope);
  },
  range(lambda, value, scope) {
    const list = math.rangeToList(value as math.Range).map((n) => new TNum(n));
    return mapOverList(lambda, list, scope);
  },
  matrix(lambda, value, scope) {
    return new TMatrix(
      math.matrixmath.map(value as math.Matrix, (n) => {
        const o = lambda.evaluate([new TNum(n as number)], scope);
        if (!isType(o, "number")) {
          throw new JmeError("jme.map.matrix map returned non number");
        }
        return (castToType(o, "number") as TNum).value;
      }),
    );
  },
  vector(lambda, value, scope) {
    return new TVector(
      math.vectormath.map(value as math.Vector, (n) => {
        const o = lambda.evaluate([new TNum(n as number)], scope);
        if (!isType(o, "number")) {
          throw new JmeError("jme.map.vector map returned non number");
        }
        return (castToType(o, "number") as TNum).value;
      }),
    );
  },
};

// jme-builtins.js:3275-3281, 3505-3511 — `map` e `filter` condividono la
// stessa riscrittura: `map(espr, nome, lista)` → `map(nome -> espr, lista)`.
/** Riscrive la forma senza lambda di `map`/`filter`. */
function map_make_lambda(args: Tree[]): Tree[] {
  if ((args[0] as Tree).tok.type == "lambda") {
    return args;
  }
  return [{ tok: new TLambda([args[1] as Tree], args[0] as Tree) }, args[2] as Tree];
}

// jme-builtins.js:3538-3543
/** Riscrive la forma senza lambda di `iterate`. */
function iterate_make_lambda(args: Tree[]): Tree[] {
  if ((args[0] as Tree).tok.type == "lambda") {
    return args;
  }
  return [{ tok: new TLambda([args[1] as Tree], args[0] as Tree) }, args[2] as Tree, args[3] as Tree];
}

// jme-builtins.js:3573-3580
/** Riscrive la forma senza lambda di `iterate_until`. */
function iterate_until_make_lambda(args: Tree[]): Tree[] {
  if ((args[0] as Tree).tok.type == "lambda") {
    return args;
  }
  return [
    { tok: new TLambda([args[1] as Tree], args[0] as Tree) },
    args[2] as Tree,
    { tok: new TLambda([args[1] as Tree], args[3] as Tree) },
    args[4] as Tree,
  ].filter((a) => a !== undefined) as Tree[];
}

// jme-builtins.js:3630-3638
/** Riscrive la forma senza lambda di `foldl`. */
function foldl_make_lambda(args: Tree[]): Tree[] {
  if ((args[0] as Tree).tok.type == "lambda") {
    return args;
  }
  return [
    { tok: new TLambda([args[1] as Tree, args[2] as Tree], args[0] as Tree) },
    args[3] as Tree,
    args[4] as Tree,
  ];
}

// jme-builtins.js:3671-3679
/** Riscrive la forma senza lambda di `take`. */
function take_make_lambda(args: Tree[]): Tree[] {
  if ((args[1] as Tree).tok.type == "lambda") {
    return args;
  }
  return [args[0] as Tree, { tok: new TLambda([args[2] as Tree], args[1] as Tree) }, args[3] as Tree];
}

/** Registra il tema `comprehensions` (jme-builtins.js:3276-3746). */
export function registerComprehensions(scope: ScopeType): void {
  // 3276-3305
  add(scope, "map", ["?", TName, "?"], TList, null, {
    evaluate: (args, s) => {
      const trees = map_make_lambda(args as Tree[]);
      const lambda = (trees[0] as Tree).tok as TLambda;
      const value = s.evaluate(trees[1] as Tree) as Token;
      if (!(value.type in mapFunctions)) {
        throw new JmeError("jme.typecheck.map not on enumerable", { type: value.type });
      }
      return (mapFunctions[value.type] as (l: TLambda, v: unknown, sc: ScopeType) => Token)(
        lambda,
        (value as { value?: unknown }).value,
        s,
      );
    },
  });
  pushLazy("map");
  findvarsOps["map"] = function (tree, boundvars, s) {
    return findvars_args(map_make_lambda(tree.args as Tree[]), boundvars, s);
  };
  substituteTreeOps["map"] = function (tree, s, allowUnbound) {
    const args = tree.args as Tree[];
    const list_index = (args[0] as Tree).tok.type == "lambda" ? 1 : 2;
    args[list_index] = substituteTree(args[list_index] as Tree, s, allowUnbound) as Tree;
  };

  // 3306-3434 — `for: espr of: lista where: cond`, eventualmente concatenati.
  add(scope, "for:", ["?", TName, "?"], TList, null, {
    evaluate: (args, s) => {
      const trees = args as Tree[];
      const lambda = trees[0] as Tree;

      /** Un generatore della catena `for: ... of: ... where: ...`. */
      interface ForSpec {
        name?: string;
        names?: string[];
        value_tree: Tree;
        where?: Tree;
      }
      const fors: ForSpec[] = [];

      /** Srotola le applicazioni concatenate di `for:`, `of:` e `where:`. */
      function unfold_for(arg: Tree): ForSpec | null {
        if (isOp(arg.tok, "for:")) {
          unfold_for((arg.args as Tree[])[0] as Tree);
          unfold_for((arg.args as Tree[])[1] as Tree);
          return null;
        } else if (isOp(arg.tok, "where:")) {
          const f = unfold_for((arg.args as Tree[])[0] as Tree) as ForSpec;
          f.where = (arg.args as Tree[])[1] as Tree;
          return null;
        } else if (isOp(arg.tok, "of:")) {
          const value_tree = (arg.args as Tree[])[1] as Tree;
          const namearg = (arg.args as Tree[])[0] as Tree;
          if (isType(namearg.tok, "name")) {
            const f: ForSpec = { name: (namearg.tok as TName).name, value_tree };
            fors.push(f);
            return f;
          } else if (isType(namearg.tok, "list")) {
            const names = (namearg.args as Tree[]).map((subnamearg) => {
              if (!isType(subnamearg.tok, "name")) {
                throw new JmeError("jme.typecheck.for in name wrong type", { type: subnamearg.tok.type });
              }
              return (subnamearg.tok as TName).name;
            });
            const f: ForSpec = { names, value_tree };
            fors.push(f);
            return f;
          } else {
            throw new JmeError("jme.typecheck.for in name wrong type", { type: namearg.tok.type });
          }
        } else {
          throw new JmeError("jme.typecheck.no right type definition", { op: "for:" });
        }
      }

      unfold_for(trees[1] as Tree);

      const nscope = new Scope(s);

      const indexes = fors.map(() => 0);
      const values: Token[][] = fors.map(() => []);

      const end = fors.length - 1;
      const out: Token[] = [];
      let j = 0;

      /** Finita una collezione, si torna indietro di un passo e si avanza
       * nella precedente. */
      function retreat(): void {
        values[j] = [];
        const spec = fors[j] as ForSpec;
        if (spec.names !== undefined) {
          spec.names.forEach((name) => {
            nscope.deleteVariable(name);
          });
        } else {
          nscope.deleteVariable(spec.name as string);
        }
        indexes[j] = 0;
        j -= 1;
        if (j >= 0) {
          indexes[j] = (indexes[j] as number) + 1;
        }
      }

      while (j >= 0) {
        const f = fors[j] as ForSpec;
        if (indexes[j] == 0) {
          values[j] = (castToType(nscope.evaluate(f.value_tree) as Token, "list") as TList).value ?? [];
          if (f.names !== undefined) {
            values[j] = (values[j] as Token[]).map((v) => castToType(v, "list") as Token);
          }
        }
        const vs = values[j] as Token[];
        while ((indexes[j] as number) < vs.length) {
          const value = vs[indexes[j] as number] as Token;
          if (f.name !== undefined) {
            nscope.setVariable(f.name, value);
          } else {
            (f.names as string[]).forEach((name, k) => {
              nscope.setVariable(name, ((value as TList).value as Token[])[k] as Token);
            });
          }
          if (f.where === undefined) {
            break;
          }
          const res = (castToType(nscope.evaluate(f.where) as Token, "boolean") as TBool).value;
          if (res) {
            break;
          }
          indexes[j] = (indexes[j] as number) + 1;
        }
        if ((indexes[j] as number) >= vs.length) {
          retreat();
          continue;
        }

        if (j == end) {
          out.push(nscope.evaluate(lambda) as Token);
          indexes[j] = (indexes[j] as number) + 1;
          while (j >= 0 && (indexes[j] as number) >= (values[j] as Token[]).length) {
            retreat();
          }
        } else {
          j += 1;
          if (j <= end) {
            indexes[j] = 0;
          }
        }
      }

      return new TList(out);
    },
  });
  pushLazy("for:");
  findvarsOps["for:"] = function (tree, boundvars, s) {
    const mapped_boundvars = boundvars.slice();
    let vars: string[] = [];

    /** Visita un pezzo di `.. for: .. of: ..` cercando le variabili libere. */
    function visit_for(arg: Tree): void {
      if (isOp(arg.tok, "for:")) {
        visit_for((arg.args as Tree[])[0] as Tree);
        visit_for((arg.args as Tree[])[1] as Tree);
      } else if (isOp(arg.tok, "where:")) {
        visit_for((arg.args as Tree[])[0] as Tree);
        vars = mergeUnique(vars, findvars((arg.args as Tree[])[1] as Tree, mapped_boundvars, s));
      } else if (isOp(arg.tok, "of:")) {
        const namearg = (arg.args as Tree[])[0] as Tree;
        if (namearg.tok.type == "list") {
          const names = namearg.args as Tree[];
          for (let i = 0; i < names.length; i++) {
            mapped_boundvars.push(normaliseName(((names[i] as Tree).tok as TName).name, s));
          }
        } else {
          mapped_boundvars.push(normaliseName((namearg.tok as TName).name, s));
        }
        vars = mergeUnique(vars, findvars((arg.args as Tree[])[1] as Tree, mapped_boundvars, s));
      }
    }
    visit_for((tree.args as Tree[])[1] as Tree);
    vars = mergeUnique(vars, findvars((tree.args as Tree[])[0] as Tree, mapped_boundvars, s));
    return vars;
  };
  substituteTreeOps["for:"] = function (tree, s) {
    const nscope = new Scope([s]);

    /** Sostituisce le variabili in un pezzo di `.. for: .. of: ..`. */
    function visit_for(arg: Tree): Tree {
      const out: Tree = { tok: arg.tok, args: (arg.args as Tree[]).slice() };
      const oargs = out.args as Tree[];
      if (isOp(out.tok, "for:")) {
        oargs[0] = visit_for(oargs[0] as Tree);
        oargs[1] = visit_for(oargs[1] as Tree);
      } else if (isOp(out.tok, "when:")) {
        // upstream: qui il nome dell'operatore è `when:`, che non esiste — il
        // ramo è irraggiungibile (l'operatore si chiama `where:`). Portato
        // com'è per non cambiare il comportamento osservabile.
        oargs[0] = visit_for(oargs[0] as Tree);
        oargs[1] = visit_for(oargs[1] as Tree);
      } else if (isOp(out.tok, "of:")) {
        const namearg = oargs[0] as Tree;
        if (namearg.tok.type == "list") {
          (namearg.args as Tree[]).forEach((name) => {
            nscope.deleteVariable((name.tok as TName).name);
          });
        } else {
          nscope.deleteVariable((namearg.tok as TName).name);
        }
        oargs[1] = substituteTree(oargs[1] as Tree, nscope, true) as Tree;
      } else {
        return substituteTree(out, nscope, true) as Tree;
      }
      return out;
    }
    const args = tree.args as Tree[];
    args[1] = visit_for(args[1] as Tree);
    args[0] = substituteTree(args[0] as Tree, nscope, true) as Tree;
  };

  // 3503-3531
  add(scope, "filter", ["?", TName, "?"], TList, null, {
    evaluate: (args, s) => {
      const trees = map_make_lambda(args as Tree[]);
      const lambda = (trees[0] as Tree).tok as TLambda;
      const list = (castToType(s.evaluate(trees[1] as Tree) as Token, "list") as TList).value ?? [];
      const ovalue = list.filter((v) => (castToType(lambda.evaluate([v], s), "boolean") as TBool).value);
      return new TList(ovalue);
    },
  });
  pushLazy("filter");
  findvarsOps["filter"] = function (tree, boundvars, s) {
    return findvars_args(map_make_lambda(tree.args as Tree[]), boundvars, s);
  };
  substituteTreeOps["filter"] = function (tree, s, allowUnbound) {
    const args = tree.args as Tree[];
    const list_index = (args[0] as Tree).tok.type == "lambda" ? 1 : 2;
    args[list_index] = substituteTree(args[list_index] as Tree, s, allowUnbound) as Tree;
  };

  // 3544-3572
  add(scope, "iterate", ["?", TName, "?", TNum], TList, null, {
    evaluate: (args, s) => {
      const trees = iterate_make_lambda(args as Tree[]);
      const lambda = (trees[0] as Tree).tok as TLambda;
      let value = s.evaluate(trees[1] as Tree) as Token;
      const times = Math.round((castToType(s.evaluate(trees[2] as Tree) as Token, "number") as TNum).value as number);
      const out: Token[] = [value];
      for (let i = 0; i < times; i++) {
        value = lambda.evaluate([value], s);
        out.push(value);
      }
      return new TList(out);
    },
  });
  pushLazy("iterate");
  findvarsOps["iterate"] = function (tree, boundvars, s) {
    return findvars_args(iterate_make_lambda(tree.args as Tree[]), boundvars, s);
  };
  substituteTreeOps["iterate"] = function (tree, s, allowUnbound) {
    const args = tree.args as Tree[];
    const i = (args[0] as Tree).tok.type == "lambda" ? 0 : 1;
    args[i + 1] = substituteTree(args[i + 1] as Tree, s, allowUnbound) as Tree;
    args[i + 2] = substituteTree(args[i + 2] as Tree, s, allowUnbound) as Tree;
  };

  // 3583-3622
  add(scope, "iterate_until", ["?", TName, "?", "?", sig.optional(sig.type("number"))], TList, null, {
    evaluate: (args, s) => {
      const trees = iterate_until_make_lambda(args as Tree[]);
      const lambda = (trees[0] as Tree).tok as TLambda;
      let value = s.evaluate(trees[1] as Tree) as Token;
      const condition = (trees[2] as Tree).tok as TLambda;
      const max_iterations = trees[3]
        ? ((castToType(s.evaluate(trees[3] as Tree) as Token, "number") as TNum).value as number)
        : 100;

      const out: Token[] = [value];

      for (let n = 0; n < max_iterations; n++) {
        const stop = condition.evaluate([value], s);
        if (!isType(stop, "boolean")) {
          throw new JmeError("jme.iterate_until.condition produced non-boolean", { type: stop.type });
        } else {
          if ((castToType(stop, "boolean") as TBool).value) {
            break;
          }
        }
        value = lambda.evaluate([value], s);
        out.push(value);
      }

      return new TList(out);
    },
  });
  pushLazy("iterate_until");
  findvarsOps["iterate_until"] = function (tree, boundvars, s) {
    return findvars_args(iterate_until_make_lambda(tree.args as Tree[]), boundvars, s);
  };
  substituteTreeOps["iterate_until"] = function (tree, s, allowUnbound) {
    const args = tree.args as Tree[];
    const i = (args[0] as Tree).tok.type == "lambda" ? 0 : 1;
    args[i + 1] = substituteTree(args[i + 1] as Tree, s, allowUnbound) as Tree;
    if (args[i + 3]) {
      // upstream (3625): `jme.substituteTree(tree.args[i+3], scope.allowUnbound)`
      // — passa `scope.allowUnbound` (che non esiste) COME SCOPE, quindi la
      // chiamata lancerebbe. Qui si passano scope e flag come nelle altre.
      args[i + 3] = substituteTree(args[i + 3] as Tree, s, allowUnbound) as Tree;
    }
  };

  // 3643-3670
  add(scope, "foldl", ["?", TName, TName, "?", TList], "?", null, {
    evaluate: (args, s) => {
      const trees = foldl_make_lambda(args as Tree[]);
      const lambda = (trees[0] as Tree).tok as TLambda;
      const first_value = s.evaluate(trees[1] as Tree) as Token;
      const list = (castToType(s.evaluate(trees[2] as Tree) as Token, "list") as TList).value ?? [];
      return list.reduce((acc, value) => lambda.evaluate([acc, value], s), first_value);
    },
  });
  pushLazy("foldl");
  findvarsOps["foldl"] = function (tree, boundvars, s) {
    return findvars_args(foldl_make_lambda(tree.args as Tree[]), boundvars, s);
  };
  substituteTreeOps["foldl"] = function (tree, s, allowUnbound) {
    const args = tree.args as Tree[];
    const i = (args[0] as Tree).tok.type == "lambda" ? 0 : 2;
    args[i + 1] = substituteTree(args[i + 1] as Tree, s, allowUnbound) as Tree;
    args[i + 2] = substituteTree(args[i + 2] as Tree, s, allowUnbound) as Tree;
  };

  // 3682-3716
  add(scope, "take", [TNum, "?", TName, "?"], TList, null, {
    evaluate: (args, s) => {
      const trees = take_make_lambda(args as Tree[]);
      const n = (s.evaluate(trees[0] as Tree) as { value: number }).value;
      const lambda = (trees[1] as Tree).tok as TLambda;
      const list = (castToType(s.evaluate(trees[2] as Tree) as Token, "list") as TList).value ?? [];
      const value: Token[] = [];
      for (let i = 0; i < list.length && value.length < n; i++) {
        const v = list[i] as Token;
        const ok = (castToType(lambda.evaluate([v], s), "boolean") as TBool).value;
        if (ok) {
          value.push(v);
        }
      }
      return new TList(value);
    },
  });
  pushLazy("take");
  findvarsOps["take"] = function (tree, boundvars, s) {
    return findvars_args(take_make_lambda(tree.args as Tree[]), boundvars, s);
  };
  // upstream (3709-3715) copia UNA SECONDA VOLTA `tree.args` in un `args`
  // locale, sostituisce lì dentro e ritorna `{tok, args}` — ma
  // `jme.substituteTree` (jme.js:247-251) scarta il valore di ritorno del
  // gestore e usa l'albero che ha copiato lui: upstream la sostituzione in
  // `take` non ha quindi alcun effetto. Qui si muta la copia del chiamante,
  // come fanno gli altri otto gestori, così `take` si comporta come `map` e
  // `for:`. Vedi DIVERGENCES.md.
  substituteTreeOps["take"] = function (tree, s, allowUnbound) {
    const args = tree.args as Tree[];
    const list_index = (args[1] as Tree).tok.type == "lambda" ? 2 : 3;
    args[0] = substituteTree(args[0] as Tree, s, allowUnbound) as Tree;
    args[list_index] = substituteTree(args[list_index] as Tree, s, allowUnbound) as Tree;
  };

  // 3717-3741 — partiziona la lista secondo un predicato lambda.
  add(scope, "separate", [TList, TLambda], TList, null, {
    evaluate: (args, s) => {
      const trues: Token[] = [];
      const falses: Token[] = [];
      const list = toks(args)[0] as TList;
      const lambda = toks(args)[1] as TLambda;
      (list.value ?? []).forEach((x) => {
        const b = (castToType(lambda.evaluate([x], s), "boolean") as TBool).value;
        (b ? trues : falses).push(x);
      });
      return new TList([new TList(trues), new TList(falses)]);
    },
  });

  // 3743-3747
  /** Il token è il valore `true`? */
  const tok_is_true = (item: Token) => item.type == "boolean" && item.value;
  add(scope, "all", [sig.listof(sig.type("boolean"))], TBool, (list: Token[]) => list.every(tok_is_true));
  add(scope, "some", [sig.listof(sig.type("boolean"))], TBool, (list: Token[]) => list.some(tok_is_true));
}
