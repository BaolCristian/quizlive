"use client";

import { Fragment, type JSX, type ReactNode } from "react";
import { Formula } from "./formula";

const TAG_AMMESSI = new Set([
  "P", "BR", "STRONG", "EM", "B", "I", "U", "SUB", "SUP",
  "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CODE", "PRE", "SPAN", "DIV",
]);

/** Elementi vuoti (senza contenuto né tag di chiusura): React lancia se
 * ricevono `children`. `BR` è l'unico dell'allowlist. */
const TAG_VUOTI = new Set(["BR"]);

/** Elementi il cui contenuto è codice o dichiarazioni, non testo per lo
 * studente: vanno tolti insieme al contenuto, non scompattati come un tag
 * sconosciuto qualsiasi (fix round 1, punto 2). Un `<script>` scompattato
 * lascerebbe il suo sorgente come testo visibile nella pagina. */
const TAG_DA_RIMUOVERE_CON_CONTENUTO = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

/** Toglie tutto ciò che non è nell'allowlist e ogni attributo che non sia
 * `class`, garantendo che al termine OGNI elemento rimasto nell'albero sia
 * nell'allowlist, a qualunque profondità.
 *
 * Non si può ottenere ricorrendo solo nei figli di un elemento ammesso: un
 * tag fuori allowlist (`<figure>`, `<mark>`, un custom element, ...) va
 * scompattato, ma i suoi figli — appena promossi al posto suo — vanno
 * riesaminati da capo, perché potrebbero essere a loro volta fuori
 * allowlist (o contenere `<script>`/`<style>` da rimuovere). Ricorrere solo
 * nel ramo "ammesso" spegne il filtro per l'intero sottoalbero del primo tag
 * sconosciuto incontrato: è il bug critico della prima versione, dimostrato
 * con `<figure><style>...</style></figure>` che metteva un foglio di stile
 * live nel documento. Qui si usa una worklist: ogni elemento promosso da uno
 * scompattamento torna in coda per essere trattato come tutti gli altri. */
function ripulisci(radice: Element): void {
  const daEsaminare: Element[] = Array.from(radice.children);

  while (daEsaminare.length > 0) {
    const el = daEsaminare.pop()!;

    if (TAG_DA_RIMUOVERE_CON_CONTENUTO.has(el.tagName)) {
      el.remove();
      continue;
    }

    if (!TAG_AMMESSI.has(el.tagName)) {
      const figli = Array.from(el.childNodes);
      el.replaceWith(...figli);
      for (const figlio of figli) {
        if (figlio.nodeType === Node.ELEMENT_NODE) daEsaminare.push(figlio as Element);
      }
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      if (attr.name !== "class") el.removeAttribute(attr.name);
    }
    daEsaminare.push(...Array.from(el.children));
  }
}

interface FormulaTrovata {
  inizio: number;
  fine: number;
  inline: boolean;
  contenuto: string;
}

/** Cerca la prossima formula `\( \)` o `\[ \]` a partire da `da`, seguendo
 * la profondità delle graffe invece di fermarsi al primo delimitatore di
 * chiusura letterale che incontra.
 *
 * Un `\)`/`\]` che compare mentre una graffa è ancora aperta (es. dentro
 * `\text{...}`) non è il vero terminatore: è dato, non struttura. Una regex
 * lazy (`\\\(.*?\\\)`) non lo sa e taglia lì, lasciando il resto della
 * formula come testo grezzo visibile (fix round 1, punto 4). */
function trovaProssimaFormula(testo: string, da: number): FormulaTrovata | null {
  let inizio = -1;
  let inline = true;
  for (let k = da; k < testo.length - 1; k++) {
    if (testo[k] === "\\" && (testo[k + 1] === "(" || testo[k + 1] === "[")) {
      inizio = k;
      inline = testo[k + 1] === "(";
      break;
    }
  }
  if (inizio === -1) return null;

  const chiusura = inline ? ")" : "]";
  let profondita = 0;
  let j = inizio + 2;
  let contenuto = "";
  while (j < testo.length) {
    const c = testo[j]!;
    if (c === "{") { profondita++; contenuto += c; j++; continue; }
    if (c === "}") { profondita = Math.max(0, profondita - 1); contenuto += c; j++; continue; }
    if (profondita === 0 && c === "\\" && testo[j + 1] === chiusura) {
      return { inizio, fine: j + 2, inline, contenuto };
    }
    contenuto += c;
    j++;
  }
  // Nessun delimitatore di chiusura a profondità zero: non è una formula
  // valida, resta testo grezzo.
  return null;
}

/** Divide un testo in pezzi normali e formule. */
function dividiFormule(testo: string): ReactNode[] {
  const pezzi: ReactNode[] = [];
  let ultimo = 0;
  let k = 0;
  while (ultimo < testo.length) {
    const trovata = trovaProssimaFormula(testo, ultimo);
    if (!trovata) {
      pezzi.push(testo.slice(ultimo));
      break;
    }
    if (trovata.inizio > ultimo) pezzi.push(testo.slice(ultimo, trovata.inizio));
    pezzi.push(<Formula key={k++} tex={trovata.contenuto.trim()} display={!trovata.inline} />);
    ultimo = trovata.fine;
  }
  return pezzi;
}

function rendi(nodo: Node, chiave: number): ReactNode {
  if (nodo.nodeType === Node.TEXT_NODE) {
    return <Fragment key={chiave}>{dividiFormule(nodo.textContent ?? "")}</Fragment>;
  }
  if (nodo.nodeType !== Node.ELEMENT_NODE) return null;
  const el = nodo as Element;
  const Tag = el.tagName.toLowerCase() as keyof JSX.IntrinsicElements;
  const className = el.getAttribute("class") ?? undefined;
  if (TAG_VUOTI.has(el.tagName)) {
    return <Tag key={chiave} className={className} />;
  }
  const figli = Array.from(el.childNodes).map((n, i) => rendi(n, i));
  return <Tag key={chiave} className={className}>{figli}</Tag>;
}

export function ContenutoHtml({ html }: { html: string }) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const radice = doc.body.firstElementChild!;
  ripulisci(radice);
  return <>{Array.from(radice.childNodes).map((n, i) => rendi(n, i))}</>;
}
