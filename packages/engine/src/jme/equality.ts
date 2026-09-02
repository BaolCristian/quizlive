/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// util.js:160-346 — le funzioni di uguaglianza che operano su token JME
// (`eq`, `neq`, `equalityTests`, `except`, `distinct`, `contains`). Il Task 1
// ha portato da util.js solo quel che lavora su valori grezzi: queste sono
// rimaste qui perché dipendono da `findCompatibleType`/`castToType` e dallo
// `Scope`.

import * as math from "../math";
import { JmeError } from "./errors";
import type { Scope } from "./scope";
import type { Token } from "./tokens";
import { castToType, findCompatibleType } from "./evaluate";
import { normaliseName } from "./tokenizer";
import { treesSame } from "./compare";

// util.js:205-266
/** Come decidere se due token dello stesso tipo sono uguali, per tipo. */
export const equalityTests: Record<string, (a: Token, b: Token, scope: Scope) => boolean> = {
  boolean(a, b) {
    return (a as { value: boolean }).value === (b as { value: boolean }).value;
  },
  dict(a, b, scope) {
    const av = (a as { value?: Record<string, Token> }).value ?? {};
    const bv = (b as { value?: Record<string, Token> }).value ?? {};
    const seen: Record<string, boolean> = {};
    for (const x in av) {
      seen[x] = true;
      if (bv[x] === undefined || !eq(av[x] as Token, bv[x] as Token, scope)) {
        return false;
      }
    }
    // upstream itera una seconda volta sulle chiavi di `a` (non di `b`) e salta
    // quelle già viste: il secondo ciclo non fa mai nulla. Portato com'è.
    for (const x in av) {
      if (seen[x]) {
        continue;
      }
      if (!eq(av[x] as Token, bv[x] as Token, scope)) {
        return false;
      }
    }
    return true;
  },
  expression(a, b, scope) {
    return treesSame(
      (a as { tree: Parameters<typeof treesSame>[0] }).tree,
      (b as { tree: Parameters<typeof treesSame>[0] }).tree,
      scope,
    );
  },
  function(a, b) {
    return (a as { name: string }).name === (b as { name: string }).name;
  },
  html(a, b) {
    // upstream confronta `value[0].outerHTML` dei nodi del DOM; qui `THTML`
    // conserva già la sorgente come stringa.
    return (a as { value: string }).value === (b as { value: string }).value;
  },
  keypair(a, b) {
    return (a as { key: string }).key === (b as { key: string }).key;
  },
  list(a, b, scope) {
    const av = (a as { value?: Token[] }).value;
    const bv = (b as { value?: Token[] }).value;
    if (!av || !bv) {
      return !av && !bv;
    }
    return av.length === bv.length && av.filter((ae, i) => !eq(ae, bv[i] as Token, scope)).length === 0;
  },
  matrix(a, b) {
    return math.matrixmath.eq((a as { value: math.Matrix }).value, (b as { value: math.Matrix }).value);
  },
  name(a, b, scope) {
    return normaliseName((a as { name: string }).name, scope) === normaliseName((b as { name: string }).name, scope);
  },
  nothing() {
    return true;
  },
  number(a, b) {
    return math.eq((a as { value: math.NumbasNumber }).value, (b as { value: math.NumbasNumber }).value);
  },
  integer(a, b) {
    return math.eq((a as { value: math.NumbasNumber }).value, (b as { value: math.NumbasNumber }).value);
  },
  rational(a, b) {
    return (a as { value: math.Fraction }).value.equals((b as { value: math.Fraction }).value);
  },
  decimal(a, b) {
    return (a as { value: math.ComplexDecimal }).value.equals((b as { value: math.ComplexDecimal }).value);
  },
  op(a, b) {
    return (a as { name: string }).name === (b as { name: string }).name;
  },
  range(a, b) {
    const av = (a as { value: math.Range }).value;
    const bv = (b as { value: math.Range }).value;
    return av[0] === bv[0] && av[1] === bv[1] && av[2] === bv[2];
  },
  set(a, b, scope) {
    return math.setmath.eq((a as { value: Token[] }).value, (b as { value: Token[] }).value, (x, y) =>
      eq(x, y, scope),
    );
  },
  string(a, b) {
    return (a as { value: string }).value === (b as { value: string }).value;
  },
  vector(a, b) {
    return math.vectormath.eq(
      (a as { value: math.Vector }).value,
      (b as { value: math.Vector }).value,
    );
  },
  interval(a, b) {
    return (a as { value: math.RealIntervalUnion }).value.equals((b as { value: math.RealIntervalUnion }).value);
  },
};

// util.js:168-183
/** I due token sono uguali? Se hanno tipi diversi, si convertono prima a un
 * tipo compatibile. */
export function eq(a: Token, b: Token, scope: Scope): boolean {
  if (a.type !== b.type) {
    const type = findCompatibleType(a.type, b.type);
    if (type) {
      a = castToType(a, type);
      b = castToType(b, type);
    } else {
      return false;
    }
  }
  const test = equalityTests[a.type];
  if (test) {
    return test(a, b, scope);
  }
  throw new JmeError("util.equality not defined for type", { type: a.type });
}

// util.js:276-278
/** I due token sono diversi? */
export function neq(a: Token, b: Token, scope: Scope): boolean {
  return !eq(a, b, scope);
}

// util.js:354-363
/** Gli elementi di `list` che non compaiono in `exclude`. */
export function except<T extends Token>(list: T[], exclude: Token[], scope: Scope): T[] {
  return list.filter((l) => {
    for (let i = 0; i < exclude.length; i++) {
      if (eq(l, exclude[i] as Token, scope)) {
        return false;
      }
    }
    return true;
  });
}

// util.js:372-389
/** Una copia della lista senza duplicati. */
export function distinct<T extends Token>(list: T[], scope: Scope): T[] {
  if (list.length === 0) {
    return [];
  }
  const out: T[] = [list[0] as T];
  for (let i = 1; i < list.length; i++) {
    let got = false;
    for (let j = 0; j < out.length; j++) {
      if (eq(list[i] as T, out[j] as T, scope)) {
        got = true;
        break;
      }
    }
    if (!got) {
      out.push(list[i] as T);
    }
  }
  return out;
}

// util.js:397-404
/** Il valore compare nella lista? */
export function contains(list: Token[], value: Token, scope: Scope): boolean {
  for (let i = 0; i < list.length; i++) {
    if (eq(value, list[i] as Token, scope)) {
      return true;
    }
  }
  return false;
}
