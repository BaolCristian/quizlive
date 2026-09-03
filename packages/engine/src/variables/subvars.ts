/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:708-774 — la parte pura (senza DOM) di `DOMsubvars`:
// sostituisce `{espr}` in una stringa, serializzando ogni token secondo il
// suo tipo (`doToken`, righe 716-741). La coda (775-782, `document.
// createElement`/`innerHTML`/`doc.importNode`) non è portata: v. DIVERGENCES.md
// e decisione 4 del brief.
//
// Cosa fa `substituteHtml` in più rispetto a `{espr}`: come `jme.contentsubvars`
// (jme.js:399-434, già portato in `jme/subvars.ts` per Task 2), gestisce anche
// `\var{}`/`\simplify{}` dentro i blocchi matematici (`$...$`, `\(...\)`, ecc.),
// riusando `texsplit`/`displayHooks` di quel modulo.
//
// Cosa NON delega a `jme/subvars.ts`: la funzione `subvars(str, scope, true)`
// di quel file (usata da `contentsubvars` per il testo semplice) passa da
// `tokenToDisplayString`, che NON riproduce `doToken`: per una stringa non
// toglie l'escaping `\{`/`\}` né aggiunge `\( \)` intorno al LaTeX marcato
// (`token.latex && token.display_latex`), e per una lista non usa il formato
// `[ a, b ]` con serializzazione ricorsiva per elemento — cade invece su
// `treeToJME` (sintassi JME, es. `[1, 2]`). Per questo `substituteHtml` non
// delega semplicemente a `contentsubvars`: ripete la sua struttura di
// splitting (testo semplice + `\var{}`/`\simplify{}`), ma con `doToken` al
// posto di `tokenToDisplayString` per il testo semplice. La sostituzione
// DENTRO `\simplify{...}` invece usa `jme.subvars(espr, scope)` (senza
// `display`, perché il risultato va ricompilato come JME da `exprToLaTeX`):
// quella è già corretta così com'è ed è riusata direttamente da `jme/subvars.ts`.

import * as math from "../math";
import { JmeError } from "../jme/errors";
import { castToType, isType } from "../jme/evaluate";
import { compile } from "../jme/parser";
import type { Scope } from "../jme/scope";
import { displayHooks, subvars as jmeSubvars, texsplit, tokenToDisplayString } from "../jme/subvars";
import type { THTML, TList, Token, Tree, TString } from "../jme/tokens";

/** Il gancio richiesto dal modulo di visualizzazione, o un errore se manca
 * (duplica il privato omonimo di `jme/subvars.ts`: non è esportato da lì). */
function requireHook<K extends keyof typeof displayHooks>(name: K): NonNullable<(typeof displayHooks)[K]> {
  const hook = displayHooks[name];
  if (!hook) {
    throw new JmeError("jme.subvars.display not available", { op: name });
  }
  return hook as NonNullable<(typeof displayHooks)[K]>;
}

// jme-variables.js:716-741 (`doToken`)
/** Serializza un token per la sostituzione dentro testo semplice: HTML come
 * stringa, stringa grezza (con lo stesso trattamento di escape/LaTeX di
 * upstream), lista fra `[ ]` con ogni elemento serializzato ricorsivamente,
 * ogni altro tipo via `tokenToDisplayString`. */
function doToken(token: Token, scope: Scope): string {
  if (isType(token, "html")) {
    const html = castToType(token, "html") as THTML;
    // upstream clona i nodi DOM (non interattivi) o segna quelli interattivi
    // come già inseriti (`numbas_embedded`), per evitare di spostare due
    // volte lo stesso nodo nel DOM vivo. Qui `value` è una stringa: non c'è
    // alcun nodo da spostare, quindi nessuna delle due cose serve (decisione
    // 4 del brief; v. anche la riga su `THTML` in DIVERGENCES.md).
    return html.value;
  } else if (isType(token, "string")) {
    const str = castToType(token, "string") as TString;
    let text = str.value;
    if (!str.safe) {
      text = text.replace(/\\([{}])/g, "$1");
    }
    if (str.latex && str.display_latex) {
      text = "\\(" + text + "\\)";
    }
    return text;
  } else if (isType(token, "list")) {
    const list = castToType(token, "list") as TList;
    return "[ " + (list.value ?? []).map((item) => doToken(item, scope)).join(", ") + " ]";
  } else {
    return tokenToDisplayString(token, scope);
  }
}

// jme-variables.js:709-774, minus la coda DOM (775-782)
/** Sostituisce `{espr}` dentro un testo semplice (non matematico),
 * serializzando ogni valore con `doToken`.
 *
 * Upstream costruisce un array misto di stringhe e nodi DOM, concatenando le
 * stringhe adiacenti; qui, dato che `doToken` produce sempre una stringa
 * (decisione 4), l'intero array collassa in una singola concatenazione. */
function substituteTextBits(str: string, scope: Scope): string {
  const bits = math.splitbrackets(str, "{", "}", "(", ")");
  if (bits.length === 1) {
    return str;
  }
  let out = "";
  for (let i = 0; i < bits.length; i++) {
    if (i % 2) {
      const expr = bits[i] as string;
      let tree: Tree | null;
      try {
        tree = compile(expr);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new JmeError("jme.subvars.error compiling", { message: message, expression: expr }, e);
      }
      const v = scope.evaluate(tree as Tree);
      if (v === null) {
        throw new JmeError("jme.subvars.null substitution", { str: expr });
      }
      out += doToken(v, scope);
    } else {
      out += bits[i];
    }
  }
  return out;
}

// jme.js:399-434 (`contentsubvars`, struttura), jme-variables.js:709-774
// (serializzazione del testo semplice)
/** Sostituisce le variabili in un blocco HTML/testo: `{espr}` nel testo
 * semplice (serializzato come `doToken`) e `\var{}`/`\simplify{}` dentro i
 * blocchi matematici (`$...$`, `\(...\)`, `\begin{...}...\end{...}`). */
export function substituteHtml(html: string, scope: Scope): string {
  const bits = math.contentsplitbrackets(html);
  for (let i = 0; i < bits.length; i += 4) {
    bits[i] = substituteTextBits(bits[i] as string, scope);
    if (i + 3 < bits.length) {
      const tbits = texsplit(bits[i + 2] as string);
      let out = "";
      for (let j = 0; j < tbits.length; j += 4) {
        out += tbits[j];
        if (j + 3 < tbits.length) {
          const cmd = tbits[j + 1];
          const rules = requireHook("collectRuleset")(tbits[j + 2] as string, scope.allRulesets());
          let expr = tbits[j + 3] as string;
          switch (cmd) {
            case "var": {
              const v = scope.evaluate(expr);
              if (v === null) {
                throw new JmeError("jme.subvars.null substitution", { str: expr });
              }
              out += "{" + requireHook("texify")({ tok: v }, rules, scope) + "}";
              break;
            }
            case "simplify": {
              expr = jmeSubvars(expr, scope);
              out += "{" + requireHook("exprToLaTeX")(expr, rules, scope) + "}";
              break;
            }
          }
        }
      }
      bits[i + 2] = out;
    }
  }
  return bits.join("");
}
