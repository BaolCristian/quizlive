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
});
