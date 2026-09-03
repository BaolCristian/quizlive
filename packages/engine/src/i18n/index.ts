/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Sostituto minimo di i18next (upstream: `R(key, params)` in
// runtime/scripts/localisation.js, usato da `Numbas.Error`,
// runtime/scripts/numbas.js:82-95). Non porta il file upstream: quello carica
// i JSON di `locales/` e dipende da i18next; qui basta un dizionario per
// lingua e l'interpolazione `{nome}`.

import { it } from "./it";
import { en } from "./en";

export type Locale = "it" | "en";
export type Params = Record<string, string | number>;

const dictionaries: Record<Locale, Record<string, string>> = { it, en };

// upstream: la lingua è la globale di i18next scelta da `localisation.js`, e
// `R()` la legge a ogni chiamata. Qui la lingua di una domanda viaggia sul suo
// `Scope` (`Scope.locale`, vedi DIVERGENCES.md): questa variabile è solo la
// PREDEFINITA del processo, cioè quel che si usa quando nessuno scope, nessuna
// parte e nessuna opzione ne indica una.
let currentLocale: Locale = "it";

/** Imposta la lingua predefinita del processo: quella che `t()` usa quando non
 * ne riceve una esplicita, e quella che `loadQuestion` fissa sulla domanda se
 * `LoadOptions.locale` manca.
 *
 * Non cambia la lingua di una domanda già caricata: quella sta sul suo scope. */
export function setLocale(l: Locale): void {
  currentLocale = l;
}

/** La lingua predefinita del processo. */
export function getLocale(): Locale {
  return currentLocale;
}

// upstream `R()` interpola con la sintassi i18next (`{{nome}}`); qui si usa
// `{nome}`, perché i testi sono nostri e non devono restare compatibili con i
// file di `locales/`.
const re_placeholder = /\{(\w+)\}/g;

/** Traduce `key` nella lingua indicata (o in quella predefinita del processo,
 * se `locale` è assente), interpolando i segnaposto `{nome}` con `params`.
 * Una chiave assente ritorna la chiave
 * stessa: i test upstream verificano le chiavi, non i messaggi
 * (jme-tests.mjs:19-21, `e.originalMessage`), quindi una chiave mancante non
 * deve mai far fallire una valutazione. */
export function t(key: string, params?: Params, locale?: Locale): string {
  const dict = dictionaries[locale ?? currentLocale];
  let template = dict[key];
  // upstream: i cataloghi usano l'annidamento di i18next (`$t(mark)`) e la
  // regola di plurale della lingua per scegliere fra la chiave `mark` e
  // `mark_plural` (localisation.js). Qui i messaggi sono già scritti per
  // esteso, e la forma plurale sta in `<chiave>_plural`: la sceglie la stessa
  // regola che i18next applica a inglese e italiano, cioè "singolare solo per
  // esattamente uno". Il valore di `count` arriva già formattato da
  // `niceNumber`, in notazione `plain`: `parseFloat` lo rilegge.
  if (params !== undefined && params.count !== undefined) {
    const count = typeof params.count === "number" ? params.count : parseFloat(params.count);
    if (count !== 1) {
      const plural = dict[`${key}_plural`];
      if (plural !== undefined) {
        template = plural;
      }
    }
  }
  if (template === undefined) {
    return key;
  }
  if (!params) {
    return template;
  }
  return template.replace(re_placeholder, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export { it, en };
