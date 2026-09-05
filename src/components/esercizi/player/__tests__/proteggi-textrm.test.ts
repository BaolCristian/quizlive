import { describe, it, expect } from "vitest";
import katex from "katex";
import { proteggiTextrm } from "../proteggi-textrm";

/** Le stringhe che il motore produce e che KaTeX rifiuta senza protezione.
 * Vengono dal corpus della prova del 2026-09-05 (spec, sezione "Prova su KaTeX"). */
const CASI_ROTTI = [
  String.raw`\operatorname{normalise\_subscripts} \left ( \textrm{x_1} \right )`,
  String.raw`\operatorname{latex} \left ( \operatorname{expression} \left ( \textrm{x^2 + 3/4} \right ) \right )`,
  String.raw`\operatorname{unpercent} \left ( \textrm{2%} \right )`,
  String.raw`\operatorname{match\_regex} \left ( \textrm{\d+}, \textrm{01234} \right )`,
  String.raw`\operatorname{formatstring} \left ( \textrm{Their name is %s}, \left[ \textrm{Hortense} \right] \right )`,
  String.raw`\operatorname{render} \left ( \operatorname{safe} \left ( \textrm{Let $x = \var{x}$} \right ) \right )`,
];

describe("protezione del contenuto dei \\textrm{}", () => {
  it.each(CASI_ROTTI)("rende con KaTeX dopo la protezione: %s", (tex) => {
    expect(() => katex.renderToString(tex, { throwOnError: true })).toThrow();
    expect(() => katex.renderToString(proteggiTextrm(tex), { throwOnError: true })).not.toThrow();
  });

  it("non tocca la matematica fuori dai \\textrm{}", () => {
    const tex = String.raw`\frac{x^2}{2} + \sqrt{y_1}`;
    expect(proteggiTextrm(tex)).toBe(tex);
  });

  it("protegge solo il contenuto, non il comando", () => {
    expect(proteggiTextrm(String.raw`\textrm{a_b}`)).toBe(String.raw`\textrm{a\_b}`);
  });

  it("regge \\textrm{} annidati e vuoti", () => {
    expect(() => proteggiTextrm(String.raw`\textrm{}`)).not.toThrow();
    expect(proteggiTextrm(String.raw`\textrm{}`)).toBe(String.raw`\textrm{}`);
  });

  it("non conta come chiusura una graffa preceduta da backslash (fix round 1, punto 3)", () => {
    // `\textrm{a\}b}`: la `\}` è una graffa letterale scappata (dato, non
    // annidamento) e KaTeX la rende così com'è, senza protezione.
    const tex = String.raw`\textrm{a\}b}`;
    expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
    // Un contatore di profondità che non riconosce l'escape la conterebbe come
    // chiusura del gruppo, troncando il contenuto a "a\" e lasciando "b}" a
    // penzolare fuori da \textrm{}: la protezione introdurrebbe un fallimento
    // che il testo grezzo non aveva.
    expect(() => katex.renderToString(proteggiTextrm(tex), { throwOnError: true })).not.toThrow();
  });
});
