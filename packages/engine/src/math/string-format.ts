/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// util.js:749-1076 (slugify..hashCode) + util.js:1392-1394 (caselessCompare)
// + util.js:1619-1671 (contentsplitbrackets, con le sue variabili di modulo
// private endDelimiters/re_startMaths a util.js:1599-1605). Non portati
// (§4 dell'inventario, fuori ambito per il motore puro): `formatTime`
// (792-813, non usata da nessun consumatore incluso — vedi nota upstream
// "no urgenza"; qui si omette comunque perché usa `Date`, irrilevante per
// generazione/correzione di esercizi), `nicePartName` (Task 8),
// `debounce`/`b64encode`/`b64decode`/`prefix_css_selectors` (fuori ambito).

import { precround } from "./rounding";
import { niceRealNumber, parseNumber } from "./format";

// util.js:1449 — riconosce token stringa JME (usato da `splitbrackets`).
// upstream: `[^\1\\]` — il `\1` DENTRO la classe di caratteri non è un
// backreference (non valido lì), ma un escape ottale per il codice
// carattere 1 (verificato a runtime: identico a `\x01`); TypeScript non
// accetta la sintassi letterale `\1` in una classe di caratteri e chiede
// `\x01` — stessa semantica, nessun cambio di comportamento. Il `\1` FUORI
// dalla classe, alla fine della regex, resta un vero backreference (al
// tipo di apice usato) e non è toccato.
const re_jme_string = /^("""|'''|['"])((?:[^\x01\\]|\\.)*?)\1/;

// util.js:749-755
/** Trasforma la stringa data in una che contiene solo lettere, cifre e trattini. */
export function slugify(str: string | undefined): string {
  if (str === undefined) {
    return "";
  }
  return (str + "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/-+/g, "-");
}

// util.js:764-771
/** Padding a sinistra di `s` col carattere `p` fino a lunghezza `n`. */
export function lpad(s: string | number, n: number, p: string): string {
  let str = s.toString();
  const pad = (p + "").slice(0, 1);
  while (str.length < n) {
    str = pad + str;
  }
  return str;
}

// util.js:779-786
/** Padding a destra di `s` col carattere `p` fino a lunghezza `n`. */
export function rpad(s: string | number, n: number, p: string): string {
  let str = s.toString();
  const pad = (p + "").slice(0, 1);
  while (str.length < n) {
    str = str + pad;
  }
  return str;
}

// util.js:796-801
/** Sostituisce `%s` in sequenza con gli argomenti extra. */
export function formatString(str: string, ...values: string[]): string {
  for (let i = 0; i < values.length; i++) {
    str = str.replace(/%s/, values[i]!);
  }
  return str;
}

// util.js:824-843
/** Formatta un importo di valuta (es. `currency(5.3,'£','p')` → `'£5.30'`). */
export function currency(n: number, prefix: string, suffix: string): string {
  if (n < 0) {
    return "-" + currency(-n, prefix, suffix);
  } else if (n == 0) {
    return prefix + "0";
  }
  // convert n to a whole number of pence, as a string
  let s = niceRealNumber(100 * n, { precisionType: "dp", precision: 0 });
  if (n >= 0.995) {
    if (n % 1 < 0.005) {
      return prefix + niceRealNumber(Math.floor(n));
    } else if (n % 1 >= 0.995) {
      return prefix + niceRealNumber(Math.ceil(n));
    }
    s = s.replace(/(..)$/, ".$1"); // put a dot before the last two digits, representing the pence
    return prefix + s;
  } else {
    return s + suffix;
  }
}

// util.js:854-876
/** Scrive un numero separando ogni tre cifre col separatore dato. */
export function separateThousands(n: number | string, separator: string): string {
  let s: string = n as string;
  if (typeof n == "number") {
    if (n < 0) {
      return "-" + separateThousands(-n, separator);
    }
    s = niceRealNumber(n);
  }
  const bits = s.split(".");
  const whole = bits[0]!;
  const frac = bits[1];
  const over = whole.length % 3;
  let out = whole.slice(0, over);
  let i = over;
  while (i < whole.length) {
    out += (out ? separator : "") + whole.slice(i, i + 3);
    i += 3;
  }
  if (frac !== undefined && Number(frac) > 0) {
    out += "." + (frac + "");
  }
  return out;
}

// util.js:888-890
/** Toglie il `%` finale e divide per 100. */
export function unPercent(s: string): number {
  return parseNumber(s.replace(/%/, ""), false) / 100;
}

// util.js:900-907
/** Pluralizza una parola: `n` (dopo arrotondamento a 10dp) `∈{-1,1}` → singolare, altrimenti plurale. */
export function pluralise(n: number, singular: string, plural: string): string {
  const nn = precround(n, 10) as number;
  if (nn == -1 || nn == 1) {
    return singular;
  } else {
    return plural;
  }
}

// util.js:913-917
/** Maiuscola sulla prima lettera minuscola. */
export function capitalise(str: string): string {
  return str.replace(/^[a-z]/, (c) => c.toUpperCase());
}

// util.js:932-1015
/** Divide una stringa secondo parentesi bilanciate, sostituendo le
 * parentesi annidate con `nestlb`/`nestrb`; ignora le parentesi dentro
 * stringhe JME. */
export function splitbrackets(str: string, lb: string, rb: string, nestlb?: string, nestrb?: string): string[] {
  const length = str.length;
  nestlb = nestlb || "";
  nestrb = nestrb || "";
  type Bit =
    | { kind: "str"; str: string }
    | { kind: "jme_str"; str: string }
    | { kind: "lb" }
    | { kind: "rb" };
  const bits: Bit[] = [];
  let start = 0;
  let depth = 0;
  let m: RegExpExecArray | null;
  for (let i = 0; i < length; i++) {
    if (str.charAt(i) == "\\") {
      i += 1;
      continue;
    }
    // if cursor is at a left bracket
    if (str.slice(i, i + lb.length) == lb) {
      bits.push({ kind: "str", str: str.slice(start, i) });
      bits.push({ kind: "lb" });
      i += lb.length - 1;
      start = i + 1;
      depth += 1;
    } else if (str.slice(i, i + rb.length) == rb) {
      bits.push({ kind: "str", str: str.slice(start, i) });
      bits.push({ kind: "rb" });
      i += rb.length - 1;
      start = i + 1;
      depth -= 1;
    } else if (depth > 0 && (m = re_jme_string.exec(str.slice(i)))) {
      bits.push({ kind: "str", str: str.slice(start, i) });
      bits.push({ kind: "jme_str", str: m[0] });
      i += m[0].length - 1;
      start = i + 1;
    }
  }
  if (start < str.length) {
    bits.push({ kind: "str", str: str.slice(start) });
  }

  depth = 0;
  const out: string[] = [];
  let s = "";
  let s_plain = "";
  let s_unclosed = "";
  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i]!;
    switch (bit.kind) {
      case "jme_str":
        s += bit.str;
        break;
      case "str":
        s += bit.str;
        s_unclosed += bit.str;
        break;
      case "lb":
        s_unclosed += lb;
        if (depth == 0) {
          s_plain = s;
          s = "";
        } else {
          s += nestlb;
        }
        depth += 1;
        break;
      case "rb":
        if (depth == 0) {
          s += rb;
          s_unclosed += rb;
        } else {
          depth -= 1;
          if (depth > 0) {
            s += nestrb;
          } else {
            out.push(s_plain);
            out.push(s);
            s = "";
            s_unclosed = "";
          }
        }
        break;
    }
  }
  if (s_unclosed.length) {
    out.push(s_unclosed);
  }
  return out;
}

// util.js:1022-1030
/** Sostituisce `& < > " '` coi rispettivi escape HTML. */
export function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// util.js:1036-1052
/** Fabbrica un comparatore che ordina per una o più proprietà. */
export function sortBy<T extends Record<string, unknown>>(props: string | string[]): (a: T, b: T) => number {
  const propList = typeof props == "string" ? [props] : props;
  const l = propList.length;
  return (a: T, b: T) => {
    for (let i = 0; i < l; i++) {
      const prop = propList[i]!;
      if ((a[prop] as unknown as number) > (b[prop] as unknown as number)) {
        return 1;
      } else if ((a[prop] as unknown as number) < (b[prop] as unknown as number)) {
        return -1;
      }
    }
    return 0;
  };
}

// util.js:1060-1076
/** Hash di una stringa in una stringa di cifre, stile `String.hashCode` di Java. */
export function hashCode(str: string): string {
  let hash = 0;
  if (str.length == 0) {
    return hash + "";
  }
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = (hash << 5) - hash + c;
  }
  if (hash < 0) {
    return "0" + -hash;
  } else {
    return "1" + hash;
  }
}

// util.js:1392-1394
/** Confronto case-insensitive (`localeCompare` con `sensitivity:'accent'`). */
export function caselessCompare(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

// util.js:1599-1605 — variabili di modulo private, usate solo da `contentsplitbrackets`.
const endDelimiters: Record<string, RegExp> = {
  $: /[^\\]\$/,
  "\\(": /[^\\]\\\)/,
  $$: /[^\\]\$\$/,
  "\\[": /[^\\]\\\]/,
};
const re_startMaths = /(^|[^\\])(?:\$\$|\$)|\\\(|\\\[|\\begin\{(\w+)\}/;

// util.js:1619-1671
/** Divide un testo secondo i delimitatori TeX (`$`, `\[`, `\]`, ...). */
export function contentsplitbrackets(txt: string | undefined, re_end?: RegExp): string[] {
  if (txt === undefined) {
    return [""];
  }
  let m: RegExpExecArray | null;
  let startDelimiter = "";
  let endDelimiter: string;
  let startText = "";
  let start: number;
  let end: number;
  let startChop: number, endChop: number;
  const bits: string[] = [];
  let endRe = re_end;
  while (txt.length) {
    if (!endRe) {
      m = re_startMaths.exec(txt);
      if (!m) {
        // if no maths delimiters, we're done
        bits.push(txt);
        break;
      }
      startDelimiter = m[0];
      start = m.index;
      startChop = start + startDelimiter.length;
      startText = txt.slice(0, start);
      if (m[1]) {
        startText += m[1];
        startDelimiter = startDelimiter.slice(m[1].length);
      }
      txt = txt.slice(startChop);
      if (startDelimiter.match(/^\\begin/m)) {
        // if this is an environment, construct a regexp to find the corresponding \end{} command.
        const environment = m[1];
        endRe = new RegExp("[^\\\\]\\\\end\\{" + environment + "\\}"); // don't ask if this copes with nested environments
      } else if (startDelimiter.match(/^(?:.|[\r\n])\$/m)) {
        endRe = endDelimiters[startDelimiter.slice(1)];
      } else {
        endRe = endDelimiters[startDelimiter]; // get the corresponding end delimiter for the matched start delimiter
      }
    }
    m = endRe!.exec(txt);
    if (!m) {
      // if no ending delimiter, the text contains no valid maths
      bits.push(startText, startDelimiter, txt);
      (bits as string[] & { re_end?: RegExp | undefined }).re_end = endRe;
      break;
    }
    endDelimiter = m[0].slice(1);
    end = m.index + 1; // the end delimiter regexp has a "not a backslash" character at the start because JS regexps don't do negative lookbehind
    endChop = end + endDelimiter.length;
    const mathBit = txt.slice(0, end);
    txt = txt.slice(endChop);
    bits.push(startText, startDelimiter, mathBit, endDelimiter);
    endRe = undefined;
  }
  return bits;
}
