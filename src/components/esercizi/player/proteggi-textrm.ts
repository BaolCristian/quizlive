/** I caratteri che dentro `\textrm{}` fanno fallire il parser di KaTeX. */
const DA_PROTEGGERE: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "_": "\\_",
  "^": "\\textasciicircum{}",
  "%": "\\%",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "~": "\\textasciitilde{}",
};

/** Protegge il contenuto di ogni `\textrm{...}`, lasciando intatto tutto il
 * resto. Il motore riproduce upstream byte per byte e ci mette dentro
 * stringhe grezze: MathJax le tollera, KaTeX no. */
export function proteggiTextrm(tex: string): string {
  let out = "";
  let i = 0;
  const marcatore = "\\textrm{";

  while (i < tex.length) {
    const inizio = tex.indexOf(marcatore, i);
    if (inizio === -1) { out += tex.slice(i); break; }

    out += tex.slice(i, inizio + marcatore.length);

    // Trova la graffa che chiude, contando gli annidamenti.
    let profondita = 1;
    let j = inizio + marcatore.length;
    let contenuto = "";
    while (j < tex.length && profondita > 0) {
      const c = tex[j]!;
      if (c === "{") profondita++;
      else if (c === "}") { profondita--; if (profondita === 0) break; }
      contenuto += c;
      j++;
    }

    out += contenuto.replace(/[\\_^%$&#~]/g, (c) => DA_PROTEGGERE[c] ?? c);
    if (j < tex.length) out += "}";
    i = j + 1;
  }

  return out;
}
