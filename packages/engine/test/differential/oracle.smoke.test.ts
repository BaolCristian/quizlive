// @vitest-environment node
import { describe, it, expect } from "vitest";
import { loadOracle } from "./oracle";

describe("oracolo upstream", () => {
  it("valuta 1+1 e produce LaTeX", async () => {
    const o = await loadOracle();
    expect(o.evaluate("1+1").value).toBe(2);
    expect(o.texify("x^2/2")).toContain("\\frac");
  });
  it("è deterministico a parità di seed", async () => {
    const o = await loadOracle();
    o.seed("savint");
    const a = o.evaluate("random(1..1000000)").value;
    o.seed("savint");
    const b = o.evaluate("random(1..1000000)").value;
    expect(a).toBe(b);
  });
});
