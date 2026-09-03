/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:536-576 — costruzione dei ruleset di domanda a partire da
// un dizionario nome -> lista di elementi (nomi di altri ruleset, o flag di
// visualizzazione), con rilevamento dei cicli.

import { JmeError } from "../jme/errors";
import { Ruleset, collectRuleset, displayFlags, type RulesetSpec } from "../jme/rules-ruleset";
import type { Scope } from "../jme/scope";
import { normaliseName } from "../jme/tokenizer";

// jme-variables.js:536-563
/** Valuta ricorsivamente un ruleset e le sue dipendenze, con rilevamento dei
 * cicli. */
export function computeRuleset(
  name: string,
  todo: Record<string, unknown>,
  scope: Scope,
  path?: string[],
): Ruleset {
  const p = path === undefined ? [] : path;
  const existing_ruleset = scope.getRuleset(normaliseName(name, scope));
  if (existing_ruleset) {
    return existing_ruleset;
  }
  if (normaliseName(name, scope) in displayFlags) {
    // upstream (jme-variables.js:539-541) ritorna `undefined` qui: il
    // chiamante è il `forEach` più sotto, che ignora il valore di ritorno —
    // serve solo a evitare `ruleset.set not defined` quando un elemento
    // della lista di un ruleset è una flag di visualizzazione (es.
    // `"!fractionnumbers"`) e non un altro ruleset annidato. La firma
    // pubblica del brief non è nullable: un `Ruleset` vuoto, mai salvato né
    // restituito da `makeRulesets` con questo nome (perché un nome di flag
    // non è mai davvero una chiave di `todo` in quel percorso).
    return new Ruleset([], {});
  }
  if (p.includes(name)) {
    throw new JmeError("ruleset.circular reference", { name: name });
  }
  const newpath = p.slice();
  newpath.push(name);
  if (todo[name] === undefined) {
    throw new JmeError("ruleset.set not defined", { name: name });
  }
  (todo[name] as unknown[]).forEach((item) => {
    if (typeof item !== "string") {
      return;
    }
    const m = /^\s*(!)?(.*)\s*$/.exec(item) as RegExpExecArray;
    const name2 = (m[2] as string).trim();
    computeRuleset(name2, todo, scope, newpath);
  });
  const ruleset = collectRuleset(todo[name] as RulesetSpec, scope.allRulesets());
  scope.setRuleset(name, ruleset);
  return ruleset;
}

// jme-variables.js:570-576
/** Costruisce tutti i ruleset di un dizionario nome -> definizione. */
export function makeRulesets(todo: Record<string, unknown>, scope: Scope): Record<string, Ruleset> {
  const out: Record<string, Ruleset> = {};
  for (const name of Object.keys(todo)) {
    out[name] = computeRuleset(name, todo, scope, []);
  }
  return out;
}
