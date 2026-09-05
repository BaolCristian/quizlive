import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Formula } from "../formula";

describe("Formula", () => {
  it("rende una formula valida come KaTeX", () => {
    const { container } = render(<Formula tex="x^2" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("rende in display quando richiesto", () => {
    const { container } = render(<Formula tex="\int_0^1 x dx" display />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("protegge le stringhe che KaTeX rifiuterebbe", () => {
    const { container } = render(<Formula tex={String.raw`\textrm{x_1}`} />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("ricade sul testo grezzo invece di lanciare", () => {
    render(<Formula tex={String.raw`\nonesiste{`} />);
    expect(screen.getByText(String.raw`\nonesiste{`)).toBeInTheDocument();
  });
});
