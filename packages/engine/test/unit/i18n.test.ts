// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

import { describe, it, expect, afterEach } from "vitest";
import { t, setLocale, getLocale } from "../../src/i18n";
import { it as itDict } from "../../src/i18n/it";
import { en as enDict } from "../../src/i18n/en";
import { JmeError } from "../../src/jme/errors";

afterEach(() => setLocale("it"));

describe("i18n", () => {
  it("traduce con parametri in it ed en", () => {
    setLocale("it");
    expect(t("jme.typecheck.function not defined", { op: "foo", suggestion: "" })).toContain("foo");
    setLocale("en");
    expect(t("jme.typecheck.function not defined", { op: "foo", suggestion: "" })).toContain("foo");
  });
  it("ritorna la chiave se manca", () => {
    expect(t("chiave.inesistente")).toBe("chiave.inesistente");
  });
  it("JmeError espone la chiave upstream", () => {
    const e = new JmeError("jme.shunt.no left bracket");
    expect(e.key).toBe("jme.shunt.no left bracket");
    expect(e).toBeInstanceOf(Error);
    expect(e.message.length).toBeGreaterThan(0);
  });
  it("setLocale/getLocale cambiano la lingua corrente", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    setLocale("it");
    expect(getLocale()).toBe("it");
  });
  it("il locale esplicito ha la precedenza su quello corrente", () => {
    setLocale("it");
    expect(t("jme.shunt.no left bracket", undefined, "en")).toBe(enDict["jme.shunt.no left bracket"]);
    expect(t("jme.shunt.no left bracket")).toBe(itDict["jme.shunt.no left bracket"]);
  });
  it("i due dizionari hanno le stesse chiavi", () => {
    expect(Object.keys(itDict).sort()).toEqual(Object.keys(enDict).sort());
  });
  it("JmeError conserva l'errore originale e i parametri", () => {
    const cause = new Error("boom");
    const e = new JmeError("jme.subvars.error compiling", { message: "boom", expression: "1+" }, cause);
    expect(e.params).toEqual({ message: "boom", expression: "1+" });
    expect(e.originalError).toBe(cause);
    expect(e.message).toContain("1+");
    expect(e.name).toBe("JmeError");
  });
});
