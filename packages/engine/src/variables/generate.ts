/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:191-245 (`computeVariable`), 328-398 (`splitVariableNames`,
// `makeVariables`), 482-526 (`remakeVariables`), 613-687 (`variableDependants`).
//
// Decisione 1 del brief: solo le versioni sincrone. `computeVariablePromise`
// (256-321) e `makeVariablesPromise` (410-469) non sono portate — nessun tipo
// di parte in ambito è asincrono (inventario 05 §6.9); vedi DIVERGENCES.md.
// Decisione 2: `makeVariables` valuta la `condition` una volta sola; il ciclo
// `maxRuns` (question.js) è del Task 9.
// Decisione 3: l'ordine di `Object.keys(todo)` è l'ordine di inserimento del
// JSON di domanda e NON va mai riordinato (inventario §9): determina l'ordine
// dei draw casuali a parità di seme.

import { JmeError } from "../jme/errors";
import { evaluate, castToType, findvars } from "../jme/evaluate";
import { compile } from "../jme/parser";
import { Scope } from "../jme/scope";
import { TBool, TList, type Token, type Tree } from "../jme/tokens";
import { normaliseName } from "../jme/tokenizer";

/** Una variabile da valutare (jme-variables.js:24-29, `variable_data_dict`).
 *
 * `names`/`originalName` sono scritti da `makeVariables` stessa per
 * l'assegnazione multipla (`"a,b": ...`); `description`/`templateType`/
 * `definition` sono portati dal JSON di domanda (Task 9) e non letti da
 * questo modulo. */
export interface VariableDef {
  tree: Tree | null;
  vars: string[];
  names?: string[];
  originalName?: string;
  description?: string;
  templateType?: string;
  definition?: string;
}

/** Dizionario nome → definizione. L'ordine di inserimento (= ordine delle
 * chiavi del JSON di domanda) determina l'ordine dei draw casuali (§9
 * dell'inventario): non va mai riordinato. */
export type VariablesTodo = Record<string, VariableDef>;

/** Il risultato di `makeVariables` (jme-variables.js:343-398). */
export interface MakeVariablesResult {
  variables: Record<string, Token>;
  conditionSatisfied: boolean;
  scope: Scope;
}

// jme-variables.js:191-245
/** Valuta una variabile, calcolando prima ricorsivamente tutte le sue
 * dipendenze. */
export function computeVariable(
  name: string,
  todo: VariablesTodo,
  scope: Scope,
  path?: string[],
  computeFn?: typeof computeVariable,
): Token {
  const originalName = todo[name]?.originalName || name;
  const existing_value = scope.getVariable(name);
  if (existing_value !== undefined) {
    return existing_value;
  }
  const p = path === undefined ? [] : path;
  const compute = computeFn || computeVariable;
  if (name === "") {
    throw new JmeError("jme.variables.empty name");
  }
  if (p.includes(name)) {
    throw new JmeError("jme.variables.circular reference", { name: name });
  }
  const v = todo[name];
  if (v === undefined) {
    const c = scope.getConstant(name);
    if (c) {
      return c.value;
    }
    throw new JmeError("jme.variables.variable not defined", { name: name });
  }
  // calcola le dipendenze
  for (let i = 0; i < v.vars.length; i++) {
    const x = v.vars[i] as string;
    if (scope.variables[x] === undefined) {
      const newpath = p.slice(0);
      // mantenuto letterale (invece di `unshift`) per fedeltà al brief
      newpath.splice(0, 0, name);
      try {
        compute(x, todo, scope, newpath, compute);
      } catch (e) {
        if (
          e instanceof JmeError &&
          (e.key === "jme.variables.circular reference" || e.key === "jme.variables.variable not defined")
        ) {
          throw e;
        } else {
          const message = e instanceof Error ? e.message : String(e);
          throw new JmeError("jme.variables.error computing dependency", { name: x, message: message }, e);
        }
      }
    }
  }
  if (!v.tree) {
    throw new JmeError("jme.variables.empty definition", { name: originalName });
  }
  let value: Token;
  try {
    value = evaluate(v.tree, scope) as Token;
    if (v.names) {
      value = castToType(value, "list");
    }
    scope.setVariable(name, value);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new JmeError("jme.variables.error evaluating variable", { name: originalName, message: message }, e);
  }
  return value;
}

// jme-variables.js:328-332
/** Spacca un elenco di nomi separati da virgola, per l'assegnazione multipla
 * (`"a, b" -> ["a", "b"]`). */
export function splitVariableNames(s: string): string[] {
  return s.split(/\s*,\s*/).filter((n) => n.trim());
}

// jme-variables.js:343-398
/** Valuta un intero dizionario di variabili, rispettando le dipendenze.
 *
 * Se `condition` è data, la valuta UNA SOLA VOLTA dopo aver calcolato le
 * variabili da cui dipende: il ciclo "rigenera finché non è soddisfatta" è
 * fuori da questo modulo (decisione 2, Task 9). */
export function makeVariables(
  todo: VariablesTodo,
  scope: Scope,
  condition?: Tree | null,
  computeFn?: typeof computeVariable,
  targets?: string[],
): MakeVariablesResult {
  const multis: Record<string, string> = {};
  let multi_acc = 0;
  const ntodo: VariablesTodo = {};
  Object.keys(todo).forEach((name) => {
    const names = splitVariableNames(name);
    if (names.length === 0) {
      return;
    }
    if (names.length > 1) {
      let mname: string;
      for (;;) {
        mname = "$multi_" + multi_acc++;
        if (todo[mname] === undefined) {
          break;
        }
      }
      multis[mname] = name;
      // upstream muta lo stesso oggetto referenziato da `todo[name]`
      // (jme-variables.js:361-363): il chiamante vede `.names`/`.originalName`
      // scritti sulla propria definizione.
      const def = todo[name] as VariableDef;
      def.names = names;
      def.originalName = name;
      ntodo[mname] = def;
      names.forEach((sname, i) => {
        ntodo[sname] = {
          tree: compile(mname + "[" + i + "]"),
          vars: [mname],
        };
      });
    } else {
      ntodo[name] = todo[name] as VariableDef;
    }
  });
  const compute = computeFn || computeVariable;
  let conditionSatisfied = true;
  if (condition) {
    const condition_vars = findvars(condition, [], scope);
    condition_vars.forEach((v) => {
      compute(v, ntodo, scope, undefined, compute);
    });
    conditionSatisfied = (evaluate(condition, scope) as TBool).value;
  }
  if (conditionSatisfied) {
    const actualTargets = targets || Object.keys(ntodo);
    actualTargets.forEach((x) => {
      compute(x, ntodo, scope, undefined, compute);
    });
  }
  const variables = scope.variables;
  Object.keys(multis).forEach((mname) => {
    variables[multis[mname] as string] = variables[mname] as Token;
    delete variables[mname];
  });
  return { variables: variables, conditionSatisfied: conditionSatisfied, scope: scope };
}

// jme-variables.js:482-526
/** Ricalcola solo le variabili che dipendono da quelle cambiate.
 *
 * Costruisce un nuovo scope con i valori di `changed`, poi ricalcola i
 * dipendenti (`variableDependants`) in quello scope. */
export function remakeVariables(
  todo: VariablesTodo,
  changed: Record<string, Token>,
  scope: Scope,
  computeFn?: typeof computeVariable,
  targets?: string[],
): Scope {
  const variables: Record<string, Token> = {};
  Object.entries(changed).forEach(([name, value]) => {
    const names = splitVariableNames(name);
    if (names.length === 1) {
      variables[name] = value;
    } else {
      const list = castToType(value, "list") as TList;
      names.forEach((n, i) => {
        variables[n] = (list.value as Token[])[i] as Token;
      });
    }
  });
  let nscope = new Scope([scope, { variables: variables }]);
  const replaced = Object.keys(changed);
  // trova le variabili dipendenti da ricalcolare
  const dependents_todo = variableDependants(todo, replaced, nscope);
  for (const name of Object.keys(dependents_todo)) {
    if (name in variables) {
      delete dependents_todo[name];
    } else {
      const names = splitVariableNames(name);
      for (const sname of names) {
        nscope.deleteVariable(sname);
      }
    }
  }
  if (targets) {
    targets.forEach((name) => {
      nscope.deleteVariable(name);
    });
  }
  for (const name of Object.keys(todo)) {
    if (name in dependents_todo) {
      continue;
    }
    if (nscope.getVariable(name) === undefined) {
      dependents_todo[name] = todo[name] as VariableDef;
    }
  }
  // calcola quelle variabili
  const nv = makeVariables(dependents_todo, nscope, null, computeFn, targets);
  nscope = new Scope([nscope, { variables: nv.variables }]);
  return nscope;
}

// jme-variables.js:613-687
/** Dato un elenco di nomi "antenati", ritorna il sotto-dizionario di `todo`
 * delle variabili che ne dipendono (direttamente o transitivamente). */
export function variableDependants(todo: VariablesTodo, ancestors: string[], scope: Scope): VariablesTodo {
  const flatAncestors = ancestors.flatMap((name) => splitVariableNames(name));

  // nome variabile -> nomi delle variabili da cui dipende
  const dependants: Record<string, string[]> = {};
  const multis: Record<string, string> = {};

  /** Trova ricorsivamente le variabili da cui `name` dipende. */
  function findDependants(name: string, path?: string[]): string[] {
    const p = path || [];
    if (p.includes(name)) {
      return [];
    }
    if (name in dependants) {
      return dependants[name] as string[];
    }
    if (name in multis) {
      return dependants[multis[name] as string] as string[];
    }
    const names = splitVariableNames(name);
    let d: string[] = [];
    if (name in todo) {
      const newpath = p.slice();
      newpath.push(name);
      (todo[name] as VariableDef).vars.forEach((name2) => {
        d = d.concat(name2, findDependants(name2, newpath));
      });
    }
    const o: string[] = [];
    d.forEach((name2) => {
      if (!o.includes(name2)) {
        o.push(name2);
      }
    });
    dependants[name] = o;
    names.forEach((n) => {
      multis[n] = name;
    });
    return o;
  }
  for (const name of Object.keys(todo)) {
    findDependants(name);
  }
  const out: VariablesTodo = {};
  for (const name of Object.keys(dependants)) {
    for (let i = 0; i < flatAncestors.length; i++) {
      const ancestor = normaliseName(flatAncestors[i] as string, scope);
      if ((dependants[name] as string[]).includes(ancestor)) {
        out[name] = todo[name] as VariableDef;
        break;
      }
    }
  }
  return out;
}
