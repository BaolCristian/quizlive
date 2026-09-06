import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContenutoHtml } from "../contenuto-html";

describe("ContenutoHtml", () => {
  it("rende il testo e le formule in linea", () => {
    const { container } = render(<ContenutoHtml html={"<p>Risolvi \\(x^2\\) ora.</p>"} />);
    expect(screen.getByText(/Risolvi/)).toBeInTheDocument();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("rende le formule in display", () => {
    const { container } = render(<ContenutoHtml html={"<p>\\[\\frac{1}{2}\\]</p>"} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("toglie script e gestori di eventi", () => {
    const { container } = render(
      <ContenutoHtml html={'<p onclick="alert(1)">ciao</p><script>alert(2)</script>'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(screen.getByText("ciao")).toBeInTheDocument();
  });

  it("tiene i tag di formattazione ammessi", () => {
    const { container } = render(<ContenutoHtml html={"<p>a <strong>b</strong> <em>c</em></p><ul><li>d</li></ul>"} />);
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.querySelector("li")).not.toBeNull();
  });

  it("regge un HTML vuoto", () => {
    const { container } = render(<ContenutoHtml html="" />);
    expect(container).toBeTruthy();
  });

  it("ripulisce anche quando un tag non ammesso ne contiene un altro, a qualunque profondità (fix round 1, punto 1 — CRITICAL)", () => {
    // Caso dimostrato dal reviewer su un mount reale: un <style> annidato
    // dentro due tag non ammessi diventava un foglio di stile live nel
    // documento perché la pulizia si fermava al primo tag sconosciuto
    // incontrato e non riesaminava mai i figli promossi.
    const html = "<article><figure><style>body{display:none}</style></figure></article>";
    const { container } = render(<ContenutoHtml html={html} />);
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("article")).toBeNull();
    // Proprietà da garantire: nessun elemento nell'albero reso è fuori
    // dall'allowlist, indipendentemente dalla profondità o dagli antenati.
    const TAG_AMMESSI = new Set([
      "P", "BR", "STRONG", "EM", "B", "I", "U", "SUB", "SUP",
      "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CODE", "PRE", "SPAN", "DIV",
    ]);
    for (const el of Array.from(container.querySelectorAll("*"))) {
      expect(TAG_AMMESSI.has(el.tagName)).toBe(true);
    }
  });

  it("un tag ignoto in cima a due livelli di annidamento non riapre il filtro per i suoi discendenti", () => {
    // Variante a tre livelli di un tag sconosciuto/personalizzato (non solo
    // elementi HTML noti come <figure>): stesso obbligo di proprietà.
    const html = "<mark><ignoto-xyz><script>alert(1)</script></ignoto-xyz></mark>";
    const { container } = render(<ContenutoHtml html={html} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
  });

  it("rimuove script, style e template insieme al loro contenuto, non li scompatta in testo visibile (fix round 1, punto 2)", () => {
    const { container } = render(
      <ContenutoHtml html={"<p>a<script>alert(1)</script>b</p><style>p{color:red}</style><template><p>fantasma</p></template>"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("template")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
    expect(container.textContent).not.toContain("color:red");
    expect(container.textContent).not.toContain("fantasma");
    expect(container.textContent).toBe("ab");
  });

  it("non taglia una formula al primo delimitatore che compare dentro una graffa aperta (fix round 1, punto 4)", () => {
    // `\text{a \) b}` contiene una sotto-sequenza "\)" che non è il vero
    // delimitatore di chiusura: lo splitter deve seguire la profondità delle
    // graffe, non fermarsi al primo `\)` letterale che incontra.
    const html = String.raw`<p>x<span>\(\text{a \) b}\)</span>y</p>`;
    const { container } = render(<ContenutoHtml html={html} />);
    const span = container.querySelector("span")!;
    // Tutto il contenuto della formula deve finire dentro Formula (KaTeX o
    // fallback grezzo): nessun testo grezzo residuo come "b}" o ")" deve
    // restare come nodo di testo diretto dentro lo <span>.
    const testoDiretto = Array.from(span.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("");
    expect(testoDiretto).toBe("");
  });
});
