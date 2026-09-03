#!/usr/bin/env node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Incorpora gli script di correzione `.jme` in un modulo TypeScript.
//
// Gli script sono DATI, non codice: si copiano verbatim da
// `.numbas-upstream/marking_scripts/` in `packages/engine/src/marking/scripts/`
// e questo generatore li trasforma in `scripts/index.ts`. Niente `?raw`,
// niente plugin di bundler, niente lettura da filesystem a runtime: il motore
// deve funzionare identico in Node, nel browser e in un bundle.
//
// Uso:  node scripts/engine/embed-marking-scripts.mjs
// Il test `packages/engine/test/unit/marking-scripts-embedded.test.ts`
// rigenera l'output in memoria e verifica che coincida col file su disco.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** I nomi degli script in ambito, nell'ordine in cui compaiono nel modulo
 * generato. `matrixentry` resta fuori: il tipo di parte `matrix` non è
 * portato (decisione 3 del design doc, inventario 05 §3.6). */
export const MARKING_SCRIPT_NAMES = ["numberentry", "multipleresponse", "patternmatch", "gapfill", "jme"];

/** La cartella che contiene i `.jme` e l'`index.ts` generato. */
export const SCRIPTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "packages",
  "engine",
  "src",
  "marking",
  "scripts",
);

/** Rende una stringa sicura dentro un template literal TypeScript. */
function escapeTemplate(source) {
  return source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** Costruisce il contenuto di `scripts/index.ts` leggendo i `.jme` in `dir`. */
export function generateMarkingScriptsModule(dir = SCRIPTS_DIR) {
  const entries = MARKING_SCRIPT_NAMES.map((name) => {
    const source = readFileSync(join(dir, name + ".jme"), "utf8");
    return "  " + name + ": `" + escapeTemplate(source) + "`,\n";
  });
  return (
    "/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.\n" +
    " * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */\n" +
    "\n" +
    "// GENERATO da scripts/engine/embed-marking-scripts.mjs — non modificare a mano.\n" +
    "// Sorgenti: packages/engine/src/marking/scripts/*.jme (copie verbatim di\n" +
    "// .numbas-upstream/marking_scripts/*.jme, con un'intestazione di licenza).\n" +
    "\n" +
    "/** Gli script di correzione predefiniti, indicizzati per tipo di parte. */\n" +
    "export const markingScripts = {\n" +
    entries.join("") +
    "} as const;\n"
  );
}

/** Il percorso del modulo generato. */
export const OUTPUT_PATH = join(SCRIPTS_DIR, "index.ts");

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  writeFileSync(OUTPUT_PATH, generateMarkingScriptsModule(), "utf8");
  process.stdout.write("scritto " + OUTPUT_PATH + "\n");
}
