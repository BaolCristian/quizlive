/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// marking.js:5 (`ignore_note_errors`), 501-566 (`marking.compute_note`).

import { JmeError } from "../jme/errors";
import type { Scope } from "../jme/scope";
import type { Token } from "../jme/tokens";
import { computeVariable, type VariablesTodo } from "../variables/generate";
import { findStatefulScope } from "./stateful-scope";

// marking.js:5
/** Un errore in una nota la rende soltanto "non valida" invece di far fallire
 * l'intero script. È il default upstream. */
export const markingOptions = { ignoreNoteErrors: true };

// marking.js:523-566
/** Calcola la nota con il nome dato, una volta sola: il valore è messo in
 * cache nello scope, e lo stato prodotto è registrato in `states[nome]` dello
 * `StatefulScope` più vicino.
 *
 * Un errore non si propaga: la nota è segnata non valida (e l'errore
 * registrato in `stateErrors`) se una delle sue dipendenze era già non valida
 * oppure se `markingOptions.ignoreNoteErrors` è attivo. */
export function computeNote(
  name: string,
  todo: VariablesTodo,
  scope: Scope,
  path?: string[],
  computeFn?: typeof computeVariable,
): Token {
  const existing_value = scope.getVariable(name);
  if (existing_value !== undefined) {
    return existing_value;
  }
  const stateful_scope = findStatefulScope(scope, name);
  if (!stateful_scope.states[name]) {
    try {
      const res = computeVariable(name, todo, scope, path, computeFn);
      scope.setVariable(name, res);
      stateful_scope.stateValid[name] = true;
      for (const s of stateful_scope.state) {
        if (s.op === "end" && s.invalid) {
          stateful_scope.stateValid[name] = false;
          break;
        }
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      stateful_scope.stateErrors[name] = error;
      if (todo[name] === undefined) {
        // upstream (marking.js:545) fa `todo[name].vars` senza controlli: con
        // un nome che NON è una nota va in `TypeError`, che esce da
        // `compute_note` e che `computeVariable` riavvolge in
        // `jme.variables.error computing dependency` (jme-variables.js:227).
        // È un `TypeError` per sbaglio, ma l'effetto — una nota inesistente
        // fa fallire chi la riferisce — è quello su cui contano i test
        // upstream ('Error in mark note', part-tests.mjs:1250-1261, che
        // verifica `notOk(p.marking_result.answered)`); ignorare l'errore
        // renderebbe valida una `mark` che non ha prodotto niente. Qui si
        // rilancia l'errore vero invece del `TypeError`. Vedi DIVERGENCES.md.
        throw error;
      }
      let invalid_dep: string | null = null;
      for (const x of todo[name]?.vars ?? []) {
        if (x in todo && !stateful_scope.stateValid[x]) {
          invalid_dep = x;
          break;
        }
      }
      if (invalid_dep || markingOptions.ignoreNoteErrors) {
        stateful_scope.stateValid[name] = false;
      } else {
        throw new JmeError("marking.note.error evaluating note", { name: name, message: error.message }, e);
      }
    }
    stateful_scope.states[name] = stateful_scope.state.slice().map((s) => {
      s.note = s.note || name;
      return s;
    });
  }
  // upstream ritorna `scope.getVariable(name)`, che è `undefined` quando la
  // nota è fallita: nessun chiamante di `computeVariable` legge il valore di
  // ritorno (lo prendono tutti da `scope.variables`), quindi il tipo resta
  // quello di `computeVariable`.
  return scope.getVariable(name) as Token;
}
