/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// marking.js:457-499 — `Numbas.marking.StatefulScope`.

import { JmeError } from "../jme/errors";
import { Scope, type ScopeExtras } from "../jme/scope";
import type { Token, Tree } from "../jme/tokens";
import type { FeedbackItem } from "./feedback";

/**
 * Uno scope JME con lo stato della correzione attaccato (marking.js:457-470).
 *
 * Lo stato "corrente" è una lista di item di feedback; lo scope sa anche
 * ritrovare per nome gli stati già calcolati. Le funzioni di correzione
 * modificano lo stato mentre vengono chiamate.
 *
 * upstream il costruttore registra qui le 24 funzioni di stato
 * (marking.js:478-480). Nel port la registrazione sta in
 * `makeMarkingScope` (`note-functions.ts`): quel modulo ha bisogno di questa
 * classe (per il tipo dello scope da risalire), e la dipendenza inversa
 * creerebbe un ciclo fra i due moduli ESM. `makeMarkingScope` è l'unico modo
 * in cui il motore costruisce uno `StatefulScope`, quindi il comportamento
 * osservabile non cambia; vedi DIVERGENCES.md.
 */
export class StatefulScope extends Scope {
  /** Quanto è annidata la valutazione in corso. */
  nesting_depth = 0;
  /** Gli item di feedback prodotti finora. */
  state: FeedbackItem[] = [];
  /** Gli stati già calcolati, per nome di nota. */
  states: Record<string, FeedbackItem[]> = {};
  /** Le note già calcolate erano valide? */
  stateValid: Record<string, boolean> = {};
  /** Gli errori che hanno reso non valida una nota. */
  stateErrors: Record<string, Error> = {};

  constructor(scopes?: Scope | ScopeExtras | Array<Scope | ScopeExtras | undefined>) {
    super(scopes);
  }

  // marking.js:483-497
  /** Come `Scope.evaluate`, ma accumula in `this.state` gli item prodotti
   * dalle funzioni di stato chiamate durante la valutazione.
   *
   * upstream (marking.js:489) inoltra al genitore SOLO `[expr, variables]`:
   * l'eventuale terzo argomento `noSubstitution` si perde quando la
   * valutazione passa da uno `StatefulScope`. Portato com'è. */
  override evaluate(
    expr: string | Tree,
    variables?: Record<string, unknown>,
    _noSubstitution?: boolean,
  ): Token | null {
    const is_top = this.state === undefined || this.nesting_depth === 0;
    this.nesting_depth += 1;
    const old_state = is_top ? [] : this.state || [];
    this.state = [];
    let v: Token | null;
    try {
      v = super.evaluate(expr, variables);
    } catch (e) {
      this.nesting_depth -= 1;
      throw e;
    }
    this.nesting_depth -= 1;
    this.state = old_state.concat(this.state);
    return v;
  }
}

// marking.js:122-125, 289-292, 528-531 — la risalita della catena `parent`
// fino allo scope che porta lo stato.
/** Il primo scope della catena che ha uno stato di correzione.
 *
 * upstream il ciclo va in `TypeError` se nessuno scope della catena ha uno
 * stato (cioè se una funzione di stato è chiamata fuori da uno script di
 * correzione); qui l'errore è esplicito. */
export function findStatefulScope(scope: Scope, name: string): StatefulScope {
  let p: Scope | undefined = scope;
  while (p && (p as Partial<StatefulScope>).state === undefined) {
    p = p.parent;
  }
  if (!p) {
    throw new JmeError("marking.state function outside marking script", { name: name });
  }
  return p as StatefulScope;
}
