/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:2769-2924 — tema `html`, di cui si portano SOLO le due
// funzioni che non toccano il DOM (§6 dell'inventario, decisione 2 del brief):
//   - `isnonemptyhtml` (2785-2787) → `util.isNonemptyHTML` (util.js:490-501),
//     nel ramo "senza `window.document`", cioè la regex.
//   - `escape_html` (2810-2813).
//
// upstream: NON portati, perché costruiscono nodi del DOM —
//   `html(str)` (2770-2784, usa `jme.variables.DOMcontentsubber`),
//   `image(url,w,h)` (2788-2809),
//   `table(...)` × 3 overload (2829-2911),
//   `max_width`/`max_height` (2913-2921).
// Vedi DIVERGENCES.md.

import * as math from "../../math";
import type { Scope } from "../scope";
import { TBool, TString } from "../tokens";
import { add } from "./registry";

/** Registra la parte pura del tema `html` (jme-builtins.js:2785, 2810). */
export function registerHtmlPure(scope: Scope): void {
  // 2785-2787 — util.js:498: `html.replace(/<\/?[^>]*>/g, '').trim() != ''`.
  add(scope, "isnonemptyhtml", [TString], TBool, (html: string) => {
    if (html === undefined || html === null) {
      return false;
    }
    return html.replace(/<\/?[^>]*>/g, "").trim() != "";
  });

  // 2810-2813 — upstream fa l'escaping mettendo un nodo di testo dentro un
  // `<p>` e rileggendone `innerHTML`, che protegge solo `& < >`; qui si usa
  // `util.escapeHTML` (util.js:1022-1030), che protegge anche `"` e `'`.
  add(scope, "escape_html", [TString], TString, (str: string) => math.escapeHTML(str));
}
