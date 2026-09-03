/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:51-182 — funzioni JME/JavaScript personalizzate, definite
// dal JSON di una domanda (`makeJMEFunction`, `makeJavascriptFunction`,
// `makeFunction`, `makeFunctions`).
//
// Decisione 5 del brief: `makeJavascriptFunction` (`new Function(...)`, come
// upstream — l'unico punto del motore in cui è permesso) è gated da
// `options.allowJavascript` (default `true`, esposto dal Task 9 come
// `LoadOptions.allowJavascriptFunctions`). Le funzioni JavaScript asincrone
// (marcate `type: "promise"` nella definizione, o che restituiscono un
// `Promise`/`TPromise` a runtime) non sono supportate: `makeVariables`
// (Task 6) è solo sincrono (decisione 1).

import { JmeError } from "../jme/errors";
import { errorMessageIn } from "../errors";
import { evaluate, findvars, findvarsOps, unwrapValue, wrapValue } from "../jme/evaluate";
import { FuncObj } from "../jme/funcobj";
import { compile } from "../jme/parser";
import { Scope } from "../jme/scope";
import { types, type Token, type TokenConstructor, type Tree } from "../jme/tokens";
import { normaliseName } from "../jme/tokenizer";
import { mergeUnique } from "../jme/util";

/** La definizione di una funzione personalizzata (jme-variables.js:31-40,
 * `func_data`). */
export interface FunctionDef {
  name: string;
  definition: string;
  language: "jme" | "javascript";
  outtype: string;
  parameters: Array<{ name: string; type: string }>;
  /** Non upstream: alcuni payload JSON marcano così una funzione JavaScript
   * asincrona. Il motore è solo sincrono (decisione 1 del brief): se
   * presente, `makeFunction` lancia prima ancora di costruire `new
   * Function(...)`. */
  type?: string;
}

/** Opzioni di `makeFunction`/`makeFunctions` (decisione 5 del brief: non
 * upstream). */
export interface MakeFunctionOptions {
  /** Permette funzioni in linguaggio `"javascript"` (`new Function(...)`).
   * Predefinito `true`. */
  allowJavascript?: boolean;
}

// `FuncObj` (Task 2) dichiara già `tree`/`language` per queste funzioni
// (jme-variables.js:143-146); `paramNames`/`definition` non sono campi di
// `FuncObj` (fuori dai file di questo task) — qui basta un tipo più
// specifico, usato solo internamente.
interface CustomFuncObj extends FuncObj {
  paramNames: string[];
  definition: string;
}

// jme-variables.js:51-86
/** Crea una funzione personalizzata scritta in JME: valuta gli argomenti in
 * un nuovo scope figlio, poi valuta `fn.definition` su quello scope. */
function makeJMEFunction(
  fn: CustomFuncObj,
  scope: Scope,
): (args: Token[] | Tree[], scope: Scope) => Token {
  // `exactOptionalPropertyTypes`: si assegna `tree` solo quando la
  // compilazione produce un albero, invece di scrivere `undefined` sul campo
  // opzionale (come richiesto dal resto del pacchetto).
  const compiled = compile(fn.definition);
  if (compiled) {
    fn.tree = compiled;
  }
  // upstream (jme-variables.js:53-54) costruisce anche `nscope = new
  // jme.Scope([scope])` e ci registra `fn` (`nscope.addFunction(fn)`), ma
  // `nscope` non è più letto da nessuna parte: né dalla chiusura restituita
  // (che valuta nello scope della CHIAMATA, non in `nscope`), né da
  // `findvarsOps`. È un'aggiunta senza effetti osservabili — non portata.
  let finding = false;
  findvarsOps[fn.name] = (tree, boundvars, s) => {
    let vars: string[] = [];
    if (!finding) {
      finding = true;
      vars = findvars(fn.tree, fn.paramNames.map((v) => normaliseName(v, s)), s);
      finding = false;
    }
    const args = tree.args as Tree[];
    for (let i = 0; i < args.length; i++) {
      vars = mergeUnique(vars, findvars(args[i] as Tree, boundvars, s));
    }
    return vars;
  };

  return (rawArgs: Token[] | Tree[], callScope: Scope): Token => {
    const args = rawArgs as Token[];
    const s = new Scope(callScope);
    for (let j = 0; j < args.length; j++) {
      s.setVariable(fn.paramNames[j] as string, args[j] as Token);
    }
    // upstream usa `this.tree`: qui si chiude su `fn`, sempre lo stesso
    // oggetto perché questa chiusura è invocata solo come `fn.evaluate(...)`.
    return evaluate(fn.tree as Tree, s) as Token;
  };
}

/** Un valore che assomiglia a una promise (non upstream, decisione 3 del
 * brief): un token `TPromise` (`.type === "promise"`, che `wrapValue`
 * lascerebbe passare invariato perché ha già `.type`) o un oggetto
 * "thenable" — tipicamente una `Promise` nativa restituita da una funzione
 * JavaScript `async`. Verificato per struttura, non con `instanceof`, per
 * non introdurre alcun uso dell'API `Promise` nel codice (il motore è solo
 * sincrono, decisione 1). */
function looksLikePromise(v: unknown): boolean {
  if (v === null || typeof v !== "object") {
    return false;
  }
  const o = v as { type?: unknown; then?: unknown };
  return o.type === "promise" || typeof o.then === "function";
}

// jme-variables.js:87-134
/** Crea una funzione personalizzata scritta in JavaScript, con `new
 * Function(paramNames, fn.definition)` — l'unico punto del motore in cui
 * `new Function` è permesso (decisione 5 del brief). */
function makeJavascriptFunction(
  fn: CustomFuncObj,
  withEnv?: Record<string, unknown>,
): (args: Token[] | Tree[], scope: Scope) => Token {
  const paramNames = fn.paramNames.slice();
  paramNames.push("scope");
  const env = withEnv || {};
  const env_args = Object.entries(env).map(([name, v]) => {
    paramNames.push(name);
    return v;
  });
  delete findvarsOps[fn.name];
  let jfn: (...a: unknown[]) => unknown;
  try {
    // upstream: `new Function(paramNames, fn.definition)` — `Function`
    // accetta un array come primo argomento (convertito in una stringa
    // separata da virgole); qui si passa via spread, stesso risultato, ma
    // tipizzato.
    jfn = new Function(...paramNames, fn.definition) as (...a: unknown[]) => unknown;
  } catch {
    throw new JmeError("jme.variables.syntax error in function definition");
  }
  return function (this: unknown, rawArgs: Token[] | Tree[], callScope: Scope): Token {
    const args = rawArgs as Token[];
    let s = callScope;
    if (fn.definition.match(/variables/)) {
      // hack di retrocompatibilità per funzioni che leggono
      // `scope.variables.nomevar` invece di `scope.getVariable(nomevar)`.
      s = new Scope([s]);
      s.flatten();
    }
    const jsArgs = args.map((a) => unwrapValue(a));
    jsArgs.push(s);
    const allArgs = jsArgs.concat(env_args);
    let val: unknown;
    try {
      val = jfn.apply(this, allArgs);
      if (val === undefined) {
        throw new JmeError("jme.user javascript.returned undefined", { name: fn.name });
      }
      if (looksLikePromise(val)) {
        throw new JmeError("jme.variables.async function not supported", { name: fn.name });
      }
      let wrapped = wrapValue(val, fn.outtype);
      if (!wrapped.type) {
        wrapped = new (fn.outcons as unknown as new (v: unknown) => Token)(wrapped);
      }
      return wrapped;
    } catch (e) {
      // upstream (jme-variables.js:126-132) avvolge OGNI eccezione del
      // corpo in `jme.user javascript.error`, incluso il proprio
      // `jme.user javascript.returned undefined` lanciato nello stesso
      // `try`. L'unica eccezione qui è `jme.variables.async function not
      // supported` (non upstream, decisione 3): è la nostra divergenza
      // deliberata, e avvolgerla ne nasconderebbe il motivo.
      if (e instanceof JmeError && e.key === "jme.variables.async function not supported") {
        throw e;
      }
      const message = errorMessageIn(e, callScope.locale);
      throw new JmeError("jme.user javascript.error", { name: fn.name, message: message });
    }
  };
}

// jme-variables.js:135-171
/** Crea una funzione personalizzata: dispatcha su `def.language`. */
export function makeFunction(
  def: FunctionDef,
  scope: Scope,
  withEnv?: Record<string, unknown>,
  options?: MakeFunctionOptions,
): FuncObj {
  if (def.language === "javascript" && def.type === "promise") {
    throw new JmeError("jme.variables.async function not supported", { name: def.name });
  }
  if (def.language === "javascript" && options?.allowJavascript === false) {
    throw new JmeError("jme.variables.javascript function not allowed", { name: def.name });
  }
  const intype: string[] = [];
  const paramNames: string[] = [];
  def.parameters.forEach((p) => {
    intype.push(p.type);
    paramNames.push(p.name);
  });
  const outcons: TokenConstructor | "?" = types[def.outtype] ?? "?";
  // upstream passa `true` come `options` (jme-variables.js:141): `funcObj`
  // legge solo `options.description`/`options.random`/... su un booleano,
  // che valgono sempre `undefined` — equivalente a `{}`.
  const fn = new FuncObj(def.name, intype, outcons, null, {}) as CustomFuncObj;
  fn.paramNames = paramNames;
  fn.definition = def.definition;
  fn.name = normaliseName(def.name, scope);
  fn.language = def.language;
  try {
    switch (fn.language) {
      case "jme":
        fn.evaluate = makeJMEFunction(fn, scope);
        break;
      case "javascript":
        fn.evaluate = makeJavascriptFunction(fn, withEnv);
        break;
      default:
        throw new JmeError("jme.variables.invalid function language", { language: def.language });
    }
  } catch (e) {
    const message = errorMessageIn(e, scope.locale);
    throw new JmeError("jme.variables.error making function", { name: fn.name, message: message });
  }
  return fn;
}

// jme-variables.js:172-182
/** Crea più funzioni personalizzate in un nuovo scope figlio, restituendo
 * tutte le definizioni per nome (`scope.functions`: upstream lo restituisce
 * così com'è, con un array di definizioni per nome — il JSDoc upstream dice
 * "Object<funcObj>" ma il valore reale è quello passato via `{functions:
 * ...}` a `new Scope(...)` in `question.js:801-802`). */
export function makeFunctions(
  defs: FunctionDef[],
  scope: Scope,
  withEnv?: Record<string, unknown>,
  options?: MakeFunctionOptions,
): Record<string, FuncObj[]> {
  const nscope = new Scope(scope);
  defs.forEach((def) => {
    const cfn = makeFunction(def, nscope, withEnv, options);
    nscope.addFunction(cfn);
  });
  return nscope.functions;
}
