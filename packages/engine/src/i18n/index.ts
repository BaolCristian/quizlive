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

let currentLocale: Locale = "it";

/** Imposta la lingua usata da `t()` quando non ne riceve una esplicita. */
export function setLocale(l: Locale): void {
  currentLocale = l;
}

/** La lingua corrente. */
export function getLocale(): Locale {
  return currentLocale;
}

// upstream `R()` interpola con la sintassi i18next (`{{nome}}`); qui si usa
// `{nome}`, perché i testi sono nostri e non devono restare compatibili con i
// file di `locales/`.
const re_placeholder = /\{(\w+)\}/g;

/** Traduce `key` nella lingua indicata (o in quella corrente), interpolando i
 * segnaposto `{nome}` con `params`. Una chiave assente ritorna la chiave
 * stessa: i test upstream verificano le chiavi, non i messaggi
 * (jme-tests.mjs:19-21, `e.originalMessage`), quindi una chiave mancante non
 * deve mai far fallire una valutazione. */
export function t(key: string, params?: Params, locale?: Locale): string {
  const dict = dictionaries[locale ?? currentLocale];
  const template = dict[key];
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
