// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Safe strings` (jme-tests.mjs:631-636), `Currency`
// (1125-1133) e della parte pura di `HTML` (1573-1577) del modulo QUnit
// `Evaluating`, più gli assert di `Arithmetic` (698) sulle stringhe che il
// Task 4a aveva rimandato, e la copertura del resto del tema `strings`
// (jme-builtins.js:1662-1812) e di `html` puro (2785, 2810).
//
// RIATTIVATO DAL TASK 5 (ora i ganci `displayHooks` sono riempiti):
//   - `latex(expression, ...)` e `string(expression, ...)` del tema
//     `type_casting` (jme-builtins.js:1879-1913), che chiamano
//     `displayHooks.texify`/`treeToJME`.
//   - `render` su un valore numerico, il cui `tokenToDisplayString` passa dal
//     `JMEifier`.
//
// ANCORA FUORI:
//   - i due assert di `HTML` (1574-1575) su `table(...)`: `table` costruisce
//     nodi del DOM e non è portato (vedi DIVERGENCES.md).

import { describe, it, expect } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import type { Token } from "../../src/jme/tokens";
import { closeEqual, deepCloseEqual } from "./math-helpers";
// riempie `displayHooks`: `latex`/`string`/`render` ne hanno bisogno.
import "../../src/jme/display";

/** Valuta nello scope dei builtin. */
function ev(expr: string, variables?: Record<string, unknown>): Token {
  const v = builtinScope.evaluate(expr, variables);
  expect(v, `${expr} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** Il valore grezzo del token. */
function val(t: Token): unknown {
  return (t as { value?: unknown }).value;
}

/** I valori JS dei token di una lista. */
function values(expr: string): unknown[] {
  return (val(ev(expr)) as Token[]).map((x) => val(x));
}

describe("Evaluating > Safe strings", () => {
  it("safe rende la stringa immune alla sostituzione di variabili", () => {
    expect(val(ev('safe("a")')), 'safe("a")').toBe("a");
    expect((ev('safe("a")') as { safe?: boolean }).safe, 'safe("a") è marcata sicura').toBe(true);
    expect(val(ev('safe(safe("a"))')), 'safe(safe("a"))').toBe("a");
    // upstream (1688-1706): senza `safe` la stringa passa da `contentsubvars`.
    expect(val(ev('safe("{1+1}")')), "safe blocca la sostituzione").toBe("{1+1}");
  });
});

describe("Evaluating > Currency", () => {
  it("la tabella upstream (rimandata dal Task 4a)", () => {
    expect(val(ev('currency(2.01,"£","p")')), 'currency(2.01,"£","p")').toBe("£2.01");
    expect(val(ev('currency(2.00001,"£","p")')), 'currency(2.00001,"£","p")').toBe("£2");
    expect(val(ev('currency(2.999,"£","p")')), 'currency(2.999,"£","p")').toBe("£3");
    expect(val(ev('currency(0.999,"£","p")')), 'currency(0.999,"£","p")').toBe("£1");
    expect(val(ev('currency(0.99,"£","p")')), 'currency(0.99,"£","p")').toBe("99p");
    expect((ev('currency(0.99,"£","p")') as { latex?: boolean }).latex, "il risultato è marcato LaTeX").toBe(true);
  });
});

describe("Evaluating > Strings", () => {
  it("gli assert di Arithmetic sulle stringhe rimandati dal Task 4a", () => {
    closeEqual(val(ev('"hi "+"there"')), "hi there", '"hi "+"there"');
    closeEqual(val(ev('"n: "+1')), "n: 1", '"n: "+1');
    closeEqual(val(ev('2+" things"')), "2 things", '2+" things"');
  });

  it("maiuscole, minuscole e taglio", () => {
    expect(val(ev('capitalise("ciao mondo")')), "capitalise").toBe("Ciao mondo");
    expect(val(ev('upper("aBc")')), "upper").toBe("ABC");
    expect(val(ev('lower("aBc")')), "lower").toBe("abc");
    expect(val(ev('trim("  x  ")')), "trim").toBe("x");
    expect(val(ev('lpad("7",3,"0")')), "lpad").toBe("007");
    expect(val(ev('rpad("7",3,"0")')), "rpad").toBe("700");
    expect(val(ev('pluralise(1,"mela","mele")')), "pluralise(1)").toBe("mela");
    expect(val(ev('pluralise(2,"mela","mele")')), "pluralise(2)").toBe("mele");
    expect(val(ev("letterordinal(0)")), "letterordinal(0)").toBe("a");
    closeEqual(val(ev('unpercent("50%")')), 0.5, "unpercent: toglie il % e divide per 100");
    expect(val(ev('separateThousands(1234567,",")')), "separateThousands").toBe("1,234,567");
  });

  it("split, listval, in e abs", () => {
    deepCloseEqual(values('split("a,b,c", ",")'), ["a", "b", "c"], "split");
    expect(val(ev('"abcde"[1]')), "listval su stringa con indice").toBe("b");
    expect(val(ev('"abcde"[1..3]')), "listval su stringa con range").toBe("bc");
    expect(val(ev('"bc" in "abcd"')), "in come sottostringa").toBe(true);
    expect(val(ev('"z" in "abcd"')), "in come sottostringa, assente").toBe(false);
    closeEqual(val(ev('abs("abcd")')), 4, "abs di una stringa è la lunghezza");
  });

  it("espressioni regolari", () => {
    deepCloseEqual(values('match_regex("a(\\\\d+)", "xa123y")'), ["a123", "123"], "match_regex");
    deepCloseEqual(values('match_regex("A", "xay", "i")'), ["a"], "match_regex con flag");
    deepCloseEqual(values('match_regex("z", "xay")'), [], "match_regex senza corrispondenze");
    deepCloseEqual(values('split_regex("a1b2c", "\\\\d")'), ["a", "b", "c"], "split_regex");
    deepCloseEqual(values('split_regex("a1B2c", "[0-9b]", "gi")'), ["a", "", "", "c"], "split_regex con flag");
    expect(val(ev('replace_regex("\\\\d", "-", "a1b2")')), "replace_regex").toBe("a-b2");
    expect(val(ev('replace_regex("\\\\d", "-", "a1b2", "g")')), "replace_regex con flag").toBe("a-b-");
  });

  it("join e formatstring sui tipi che non richiedono il display", () => {
    expect(val(ev('join(["a","b"], "-")')), "join di stringhe").toBe("a-b");
    // upstream `util.formatString` sostituisce `%s` in sequenza, non `{n}`.
    expect(val(ev('formatstring("%s e %s", ["a","b"])')), "formatstring").toBe("a e b");
  });

  it("latex marca la stringa e render sostituisce le variabili", () => {
    const l = ev('latex("x^2")') as { value: string; latex?: boolean; display_latex?: boolean };
    expect(l.value, "latex non tocca il contenuto").toBe("x^2");
    expect(l.latex, "latex marca la stringa").toBe(true);
    expect(l.display_latex, "latex marca anche display_latex").toBe(true);
    expect(val(ev('render(safe("<{x}>"), ["x": "ok"])')), "render con un dizionario di variabili").toBe("<ok>");
  });

  it("translate passa dal dizionario i18n del motore", () => {
    expect(val(ev('translate("jme.type.no cast method")')), "chiave senza parametri").toBe(
      "Conversione automatica non disponibile da {from} a {to}",
    );
    expect(
      val(ev('translate("jme.type.no cast method", ["from": "a", "to": "b"])')),
      "chiave con parametri",
    ).toBe("Conversione automatica non disponibile da a a b");
    expect(val(ev('translate("chiave inesistente")')), "una chiave assente ritorna sé stessa").toBe(
      "chiave inesistente",
    );
  });
});

describe("Evaluating > HTML", () => {
  it("escape_html e isnonemptyhtml (le sole funzioni pure del tema)", () => {
    expect(val(ev(`escape_html("<p>a & b</p>")`)), "escape_html").toBe("&lt;p&gt;a &amp; b&lt;/p&gt;");
    expect(val(ev(`escape_html("\\"x\\"")`)), "escape_html sulle virgolette").toBe("&quot;x&quot;");
    expect(val(ev(`isnonemptyhtml("<p>ciao</p>")`)), "isnonemptyhtml con del testo").toBe(true);
    expect(val(ev(`isnonemptyhtml("<p></p>")`)), "isnonemptyhtml senza testo").toBe(false);
    expect(val(ev(`isnonemptyhtml("")`)), "isnonemptyhtml sulla stringa vuota").toBe(false);
  });
});

describe("Evaluating > Type casting", () => {
  it("int, rational e list", () => {
    expect(ev("int(2.0)").type, "int(2.0) è un intero").toBe("integer");
    expect(ev("rational(0.5)").type, "rational(0.5) è un razionale").toBe("rational");
    expect(String(val(ev("rational(0.5)"))), "rational(0.5) = 1/2").toBe("1/2");
    deepCloseEqual(values("list(set([1,2]))"), [1, 2], "list di un insieme");
    deepCloseEqual(values("list(vector(1,2))"), [1, 2], "list di un vettore");
    deepCloseEqual(
      (val(ev("list(matrix([1,2],[3,4]))")) as Token[]).map((r) => (val(r) as Token[]).map((x) => val(x))),
      [
        [1, 2],
        [3, 4],
      ],
      "list di una matrice",
    );
  });

  it("isa (jme-tests.mjs:686-697)", () => {
    expect(val(ev('1 isa "number"')), '1 isa "number"').toBe(true);
    expect(val(ev('1 isa "complex"')), '1 isa "complex"').toBe(false);
    expect(val(ev('i isa "complex"')), 'i isa "complex"').toBe(true);
    expect(val(ev('1+i isa "complex"')), '1+i isa "complex"').toBe(true);
    expect(val(ev('"1" isa "number"')), '"1" isa "number"').toBe(false);
    expect(val(ev('"1" isa "string"')), '"1" isa "string"').toBe(true);
    expect(val(ev('[] isa "list"')), '[] isa "list"').toBe(true);
    expect(val(ev('xy isa "name"')), 'xy isa "name"').toBe(true);
    expect(val(ev('vector(1,2)[0] isa "number"')), 'vector(1,2)[0] isa "number"').toBe(true);
  });

  // jme-builtins.js:1879-1913 — riattivati dal Task 5.
  it("latex e string su un'espressione", () => {
    expect(val(ev('latex(expression("x+1"))')), "latex(expression)").toBe("x + 1");
    expect(val(ev('string(expression("x+1"))')), "string(expression)").toBe("x + 1");
    expect(val(ev('latex(expression("1/2"),"fractionnumbers")')), "latex con un ruleset").toBe(
      "\\frac{ 1 }{ 2 }",
    );
    expect(val(ev('string(expression("1*x"))')), "string omette il simbolo di moltiplicazione").toBe("1x");
    const t = ev('latex(expression("x"))') as { latex?: boolean; display_latex?: boolean };
    expect(t.latex, "latex marca la stringa come LaTeX").toBe(true);
    expect(t.display_latex, "latex marca la stringa come da mostrare").toBe(true);
    // jme-builtins.js:1700 — `render` passa da `tokenToDisplayString`, che per
    // i numeri costruisce un `JMEifier`.
    expect(val(ev('render(safe("{x}"), ["x": 1.5])')), "render di un numero").toBe("1.5");
  });
});
