// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Il modulo `marking/scripts/index.ts` è generato: questo test lo rigenera in
// memoria dai `.jme` e verifica che coincida col file su disco, così una
// modifica a uno script senza rilanciare il generatore fa fallire la suite.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// il generatore è uno script Node puro: `allowJs` lo risolve, i tipi sono inferiti.
import { generateMarkingScriptsModule, OUTPUT_PATH, SCRIPTS_DIR, MARKING_SCRIPT_NAMES } from "../../../../scripts/engine/embed-marking-scripts.mjs";
import { markingScripts } from "../../src/marking/scripts";

const here = dirname(fileURLToPath(import.meta.url));
// il clone upstream è in `.gitignore`: c'è solo per chi ha lanciato
// `scripts/engine/fetch-upstream.sh`. Le copie tracciate sotto
// `src/marking/scripts/` bastano a tutto il resto della suite, quindi il
// confronto verbatim si salta invece di far fallire un clone pulito.
const upstreamDir = join(here, "..", "..", "..", "..", ".numbas-upstream", "marking_scripts");
const hasUpstream = existsSync(upstreamDir);

describe("marking/scripts (generato)", () => {
  it("il file su disco coincide con l'output del generatore", () => {
    const generated: string = generateMarkingScriptsModule() as string;
    expect(generated).toBe(readFileSync(OUTPUT_PATH as string, "utf8"));
  });

  it("i 5 script in ambito sono incorporati, matrixentry no", () => {
    expect(Object.keys(markingScripts).sort()).toEqual(
      ["gapfill", "jme", "multipleresponse", "numberentry", "patternmatch"].sort(),
    );
    expect(MARKING_SCRIPT_NAMES).not.toContain("matrixentry");
  });

  it("ogni copia tracciata ha l'intestazione di licenza ed è quella incorporata", () => {
    for (const name of MARKING_SCRIPT_NAMES as string[]) {
      const copy = readFileSync(join(SCRIPTS_DIR as string, name + ".jme"), "utf8");
      // l'intestazione sono le prime 4 righe (3 di commento + una vuota)
      const lines = copy.split("\n");
      expect(lines.slice(0, 3).every((l) => l.startsWith("// "))).toBe(true);
      expect(lines[3]).toBe("");
      expect(markingScripts[name as keyof typeof markingScripts]).toBe(copy);
    }
  });

  // solo con il clone upstream presente: `.numbas-upstream/` è ignorato da git,
  // e la suite deve restare verde su un clone appena fatto.
  it.skipIf(!hasUpstream)("ogni script è una copia verbatim dell'originale upstream", () => {
    for (const name of MARKING_SCRIPT_NAMES as string[]) {
      const copy = readFileSync(join(SCRIPTS_DIR as string, name + ".jme"), "utf8");
      const upstream = readFileSync(join(upstreamDir, name + ".jme"), "utf8");
      expect(copy.split("\n").slice(4).join("\n")).toBe(upstream);
    }
  });
});
