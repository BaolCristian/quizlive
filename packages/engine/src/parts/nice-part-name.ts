/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// util.js:1310-1330 — `Numbas.util.nicePartName`.

import { t } from "../i18n";
import { letterOrdinal } from "../math";

// util.js:1316
const re_path = /^p(\d+)(?:s(\d+))?(?:g(\d+))?(?:a(\d+))?$/;

// util.js:1315-1330
/** Un nome leggibile per la parte con il percorso dato, es. `p0g1` →
 * "parte a) spazio 1".
 *
 * upstream fa `util.letterOrdinal(m[1])` su una STRINGA: `letterOrdinal`
 * confronta con `n == 0` (uguaglianza debole) e poi cicla su `n > 0`
 * decrementando, quindi la stringa è convertita implicitamente. Qui la
 * conversione è esplicita. Un percorso che non combacia con `re_path` fa
 * andare upstream in `TypeError` su `m[1]`; qui si ritorna il percorso
 * stesso, che è comunque solo testo per un messaggio d'errore. */
export function nicePartName(path: string | undefined): string {
  const m = re_path.exec(path ?? "");
  if (!m) {
    return path ?? "";
  }
  let s = t("part") + " " + letterOrdinal(Number(m[1]));
  if (m[2]) {
    s += " " + t("step") + " " + m[2];
  }
  if (m[3]) {
    s += " " + t("gap") + " " + m[3];
  }
  if (m[4]) {
    s += " " + t("alternative") + " " + m[4];
  }
  return s;
}
