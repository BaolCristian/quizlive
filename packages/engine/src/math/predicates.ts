/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// util.js:96-346 (copyarray/copyobj/copyinto/objects_equal/arraysEqual, SOLO
// le funzioni che operano su valori grezzi, non su token JME) e util.js:395-518
// (predicati di tipo/parsing numerico). `isNumber` (util.js:441-457) è
// aggiunta più sotto: dipende da `cleanNumber` (format.ts), che non esiste
// ancora al passo 2 del porting — vedi il commento sopra la sua definizione.

// util.js:111-119
/** Clona un array; se `deep`, clona anche gli elementi. */
export function copyarray<T>(arr: readonly T[], deep?: boolean): T[] {
  const out = arr.slice();
  if (deep) {
    for (let i = 0; i < out.length; i++) {
      out[i] = copyobj(out[i], deep) as T;
    }
  }
  return out;
}

// util.js:126-148
/** Clona un oggetto/array in base a `typeof`; ricorsivo se `deep`. */
export function copyobj<T>(obj: T, deep?: boolean): T {
  switch (typeof obj) {
    case "object": {
      if (obj === null) {
        return obj;
      }
      // upstream: testa `obj.length !== undefined` (array-like, non solo
      // Array.isArray); qui si usa Array.isArray per tipizzare correttamente
      // in TS — nessun chiamante interno passa oggetti "array-like" non-Array.
      if (Array.isArray(obj)) {
        return copyarray(obj, deep) as unknown as T;
      } else {
        const newobj: Record<string, unknown> = {};
        for (const x in obj as Record<string, unknown>) {
          const v = (obj as Record<string, unknown>)[x];
          newobj[x] = deep ? copyobj(v, deep) : v;
        }
        return newobj as T;
      }
    }
    default:
      return obj;
  }
}

// util.js:154-160
/** Copia in `dest` solo le chiavi di `src` non già presenti (muta `dest`). */
export function copyinto(src: Record<string, unknown>, dest: Record<string, unknown>): void {
  for (const x in src) {
    if (dest[x] === undefined) {
      dest[x] = src[x];
    }
  }
}

// util.js:295-317
/** Uguaglianza profonda di valori JS grezzi (non token JME). */
export function objects_equal(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a != typeof b) {
    return false;
  }
  if (typeof a == "object") {
    if (a === null || b === null) {
      return a === b;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return arraysEqual(a, b);
    } else {
      const ao = a as Record<string, unknown>;
      const bo = b as Record<string, unknown>;
      return (
        Object.keys(ao).every((k) => objects_equal(ao[k], bo[k])) &&
        Object.keys(bo).every((k) => Object.hasOwn(ao, k))
      );
    }
  }
  // eslint-disable-next-line eqeqeq -- upstream: confronto debole voluto
  return a == b;
}

// util.js:324-346
/** Array uguali elemento per elemento (ricorsivo su array annidati). */
export function arraysEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  if (a.length != b.length) {
    return false;
  }
  const l = a.length;
  for (let i = 0; i < l; i++) {
    if (Array.isArray(a[i])) {
      if (!Array.isArray(b[i])) {
        return false;
      } else if (!arraysEqual(a[i], b[i])) {
        return false;
      }
    } else {
      if (!objects_equal(a[i], b[i])) {
        return false;
      }
    }
  }
  return true;
}

// util.js:405-412
/** `i` è un intero? `typeof i=='bigint'` oppure `parseInt(i,10)==i` (coercizione debole). */
export function isInt(i: unknown): boolean {
  // eslint-disable-next-line eqeqeq -- upstream: coercizione debole voluta
  return typeof i == "bigint" || parseInt(i as string, 10) == (i as unknown as number);
}

// util.js:413-420
/** `f` è un numero a virgola mobile? `parseFloat(f)==f` (coercizione debole). */
export function isFloat(f: unknown): boolean {
  // eslint-disable-next-line eqeqeq -- upstream: coercizione debole voluta
  return parseFloat(f as string) == (f as unknown as number);
}

// util.js:514-518
/** Riconosce una frazione `a/b` (con segni opzionali su numeratore/denominatore). */
export const re_fraction = /^\s*(-?)\s*(\d+)\s*\/\s*(-?)\s*(\d+)\s*/;

// util.js:421-429
/** `s` combacia col pattern di una frazione? */
export function isFraction(s: unknown): boolean {
  const str = String(s).trim();
  return re_fraction.test(str);
}

// util.js:458-469
/** Indice negativo → `n+size` (stile Python). */
export function wrapListIndex(n: number, size: number): number {
  if (n < 0) {
    n += size;
  }
  return n;
}

// util.js:470-484
/** `b` è un booleano letterale o una delle stringhe false/true/yes/no (case-insensitive)? */
export function isBool(b: unknown): boolean {
  if (b == null) {
    return false;
  }
  if (typeof b == "boolean") {
    return true;
  }
  const s = String(b).toLowerCase();
  return s == "false" || s == "true" || s == "yes" || s == "no";
}

// util.js:485-501 — solo il ramo regex (riga 499): il ramo DOM (494-497,
// `document.createElement`) non si porta (§4 dell'inventario, fuori ambito).
/** Il testo estratto da un frammento HTML è non vuoto? (Versione senza DOM.) */
export function isNonemptyHTML(html: string | undefined | null): boolean {
  if (html === undefined || html === null) {
    return false;
  }
  return html.replace(/<\/?[^>]*>/g, "").trim() != "";
}

// util.js:502-513
/** `true`/`'true'`/`'yes'` (case-insensitive) → `true`, il resto → `false`. */
export function parseBool(b: unknown): boolean {
  if (!b) {
    return false;
  }
  const s = String(b).toLowerCase();
  return s == "true" || s == "yes";
}

// util.js:441-457 — aggiunta nello Step 3: dipende da `cleanNumber`
// (format.ts), non disponibile nello Step 2. Import qui sotto invece che in
// testa al file, per marcare esplicitamente questa dipendenza "in arrivo".
import { cleanNumber } from "./format";

/** `n` è un numero valido, "infinity" o (se richiesto) una frazione,
 * opzionalmente secondo uno stile di notazione? */
export function isNumber(
  n: number | string,
  allowFractions?: boolean,
  styles?: string | string[],
  strictStyle?: boolean
): boolean {
  if (n === undefined || n === null) {
    return false;
  }
  if (allowFractions && re_fraction.test(String(n))) {
    return true;
  }
  const cleaned = cleanNumber(String(n), styles, strictStyle);
  if (!isNaN(Number(cleaned))) {
    return true;
  }
  if (/-?infinity/i.test(cleaned)) {
    return true;
  } else {
    return false;
  }
}
