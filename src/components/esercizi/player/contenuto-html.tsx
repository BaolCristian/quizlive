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

/** Toglie tutto ciò che non è nell'allowlist e ogni attributo che non sia
 * `class`. I contenuti oggi vengono dal repository, ma dal sotto-progetto 6
 * arriveranno da altre installazioni: meglio averla adesso. */
function ripulisci(nodo: Element): void {
  for (const figlio of Array.from(nodo.children)) {
    if (!TAG_AMMESSI.has(figlio.tagName)) {
      figlio.replaceWith(...Array.from(figlio.childNodes));
      continue;
    }
    for (const attr of Array.from(figlio.attributes)) {
      if (attr.name !== "class") figlio.removeAttribute(attr.name);
    }
    ripulisci(figlio);
  }
}

/** Divide un testo in pezzi normali e formule. */
function dividiFormule(testo: string): ReactNode[] {
  const pezzi: ReactNode[] = [];
  const re = /\\\((.*?)\\\)|\\\[(.*?)\\\]/gs;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(testo)) !== null) {
    if (m.index > ultimo) pezzi.push(testo.slice(ultimo, m.index));
    const inline = m[1] !== undefined;
    pezzi.push(<Formula key={k++} tex={(m[1] ?? m[2] ?? "").trim()} display={!inline} />);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) pezzi.push(testo.slice(ultimo));
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
