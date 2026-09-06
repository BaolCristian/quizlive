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

    // Trova la graffa che chiude, contando gli annidamenti, e protegge ogni
    // carattere del contenuto man mano che scorre. Una `\{` o una `\}` è una
    // graffa letterale scappata (dato, non annidamento): va lasciata intatta
    // e non deve muovere il contatore di profondità, altrimenti un contenuto
    // come `a\}b` verrebbe troncato a `a\` scambiando il dato per la
    // chiusura del gruppo (fix round 1, punto 3).
    let profondita = 1;
    let j = inizio + marcatore.length;
    let contenutoProtetto = "";
    while (j < tex.length && profondita > 0) {
      const c = tex[j]!;
      if (c === "\\" && (tex[j + 1] === "{" || tex[j + 1] === "}")) {
        contenutoProtetto += c + tex[j + 1];
        j += 2;
        continue;
      }
      if (c === "{") { profondita++; contenutoProtetto += c; j++; continue; }
      if (c === "}") {
        profondita--;
        if (profondita === 0) break;
        contenutoProtetto += c;
        j++;
        continue;
      }
      contenutoProtetto += DA_PROTEGGERE[c] ?? c;
      j++;
    }

    out += contenutoProtetto;
    if (j < tex.length) out += "}";
    i = j + 1;
  }

  return out;
}
