// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Porting diretto (una `it` per `assert` upstream) di jme-tests.mjs:
// QUnit.module('Subvars') > 'splitbrackets' (67-79), 'contentsplitbrackets'
// (80-82), 'util' (129-138). Sono gli unici test di quel modulo che toccano
// solo `Numbas.util` puro (le altre — subvars/findvars — dipendono da
// jme.js/DOM, fuori ambito per il Task 1, vedi inventario §5).

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { deepCloseEqual } from "./math-helpers";

describe("Subvars > splitbrackets", () => {
  it("a", () => {
    expect(math.splitbrackets("a", "{", "}")).toEqual(["a"]);
  });
  it("a{1}", () => {
    expect(math.splitbrackets("a{1}", "{", "}")).toEqual(["a", "1"]);
  });
  it("a{{{1}}} with lb and rb {{{ and }}}", () => {
    expect(math.splitbrackets("a{{{1}}}", "{{{", "}}}")).toEqual(["a", "1"]);
  });
  it("{1}a", () => {
    expect(math.splitbrackets("{1}a", "{", "}")).toEqual(["", "1", "a"]);
  });
  it("{1}a{2}", () => {
    expect(math.splitbrackets("{1}a{2}", "{", "}")).toEqual(["", "1", "a", "2"]);
  });
  it("}a", () => {
    expect(math.splitbrackets("}a", "{", "}")).toEqual(["}a"]);
  });
  it("a{{", () => {
    expect(math.splitbrackets("a{{", "{", "}")).toEqual(["a{{"]);
  });
  it("}a{", () => {
    expect(math.splitbrackets("}a{", "{", "}")).toEqual(["}a{"]);
  });
  it("a{1}b{", () => {
    expect(math.splitbrackets("a{1}b{", "{", "}")).toEqual(["a", "1", "b{"]);
  });
  it("a{b{1}c}d", () => {
    expect(math.splitbrackets("a{b{1}c}d", "{", "}", "[[", "]]")).toEqual(["a", "b[[1]]c", "d"]);
  });
  it('{a("{b}"){y}}', () => {
    expect(math.splitbrackets('{a("{b}"){y}}', "{", "}", "(", ")")).toEqual(["", 'a("{b}")(y)']);
  });
});

describe("Subvars > contentsplitbrackets", () => {
  it("return the character before the maths delimiter to the plain text part", () => {
    deepCloseEqual(math.contentsplitbrackets("{a}$x$"), ["{a}", "$", "x", "$"]);
  });
});

describe("Subvars > util", () => {
  it("0", () => {
    deepCloseEqual(math.separateThousands(0, ","), "0");
  });
  it("123", () => {
    deepCloseEqual(math.separateThousands(123, ","), "123");
  });
  it("1234", () => {
    deepCloseEqual(math.separateThousands(1234, ","), "1,234");
  });
  it("12345", () => {
    deepCloseEqual(math.separateThousands(12345, ","), "12,345");
  });
  it("123456", () => {
    deepCloseEqual(math.separateThousands(123456, ","), "123,456");
  });
  it("1234567.0123", () => {
    deepCloseEqual(math.separateThousands(1234567.0123, ","), "1,234,567.0123");
  });
  it("-1234567.0123", () => {
    deepCloseEqual(math.separateThousands(-1234567.0123, ","), "-1,234,567.0123");
  });
  it("-1234567.0123 with space", () => {
    deepCloseEqual(math.separateThousands(-1234567.0123, " "), "-1 234 567.0123");
  });
});
