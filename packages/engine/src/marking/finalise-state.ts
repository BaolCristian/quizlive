/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// marking.js:599-693 — il typedef `finalised_state` e `marking.finalise_state`.
//
// Il credito è SEMPRE una `math.Fraction`: mai un float intermedio (inventario
// 05 §9). Una somma ingenua in virgola mobile di molti `add_credit` (un
// gapfill con tanti gap, una scelta multipla con tante celle) romperebbe le
// uguaglianze esatte che i test si aspettano. Solo il valore di ritorno è un
// `number`, via `Fraction.toFloat()` (marking.js:690).
//
// Il Task 8 riusa questa funzione per `Part#apply_feedback` (part.js:1737-1845)
// invece di duplicare lo `switch`: quella macchina a stati è la stessa, con
// gli effetti applicati all'oggetto `Part` invece che a un accumulatore puro
// (il commento upstream a marking.js:609 lo dice esplicitamente).

import { Fraction } from "../math";
import type { FeedbackItem } from "./feedback";

/** Il risultato di una correzione (marking.js:599-606). */
export interface FinalisedState {
  /** La risposta è correggibile? */
  valid: boolean;
  /** La quota di credito da assegnare. */
  credit: number;
  /** Le operazioni di feedback effettivamente attive. */
  states: FeedbackItem[];
}

/** Il credito di un item come frazione esatta.
 *
 * upstream: `Fraction.fromFloat(state.credit)` senza controlli. Qui un credito
 * assente vale zero invece di propagare un `NaN` — nessun costruttore di
 * `feedback` produce un item con `op` di credito e `credit` indefinito, quindi
 * il ramo è solo difensivo. Un credito già frazionario è usato tale e quale
 * (`FeedbackItem.credit` ammette `Fraction`). */
function creditFraction(credit: number | Fraction | undefined): Fraction {
  if (credit === undefined) {
    return Fraction.zero;
  }
  return credit instanceof Fraction ? credit : Fraction.fromFloat(credit);
}

// marking.js:617-693
/** Percorre una sequenza di operazioni di feedback accumulando il credito.
 *
 * Un item `concat` viene espanso INLINE nella sequenza come
 * `start_lift(scale) … messages … end_lift`: il credito prodotto dentro il
 * blocco è accumulato a parte e poi riportato scalato nel credito esterno. È
 * il meccanismo con cui il feedback di un gap entra proporzionalmente nel
 * feedback della parte madre. */
export function finaliseState(states: FeedbackItem[]): FinalisedState {
  let valid = true;
  let end = false;
  let credit = Fraction.zero;
  const out_states: FeedbackItem[] = [];
  let num_lifts = 0;
  const lifts: Array<{ credit: Fraction; scale: number }> = [];
  let scale = 1;
  // upstream riassegna il parametro `states` quando espande un `concat`
  // (marking.js:658): qui la lista di lavoro è una variabile locale, così il
  // chiamante non vede la sua lista sostituita.
  let list = states;
  for (let i = 0; i < list.length; i++) {
    const state = list[i] as FeedbackItem;
    switch (state.op) {
      case "set_credit":
        out_states.push(state);
        credit = creditFraction(state.credit);
        break;
      case "multiply_credit":
        out_states.push(state);
        credit = credit.multiply(Fraction.fromFloat(state.factor as number));
        break;
      case "add_credit":
        out_states.push(state);
        credit = credit.add(creditFraction(state.credit));
        break;
      case "sub_credit":
        out_states.push(state);
        credit = credit.subtract(creditFraction(state.credit));
        break;
      case "end":
        out_states.push(state);
        if (state.invalid) {
          valid = false;
        }
        if (num_lifts) {
          // dentro un blocco lift, `end` salta al suo `end_lift` invece di
          // terminare l'intera nota (marking.js:649-652)
          while (i + 1 < list.length && (list[i + 1] as FeedbackItem).op !== "end_lift") {
            i += 1;
          }
        } else {
          end = true;
        }
        break;
      case "concat":
        list = list
          .slice(0, i + 1)
          .concat(
            [{ op: "start_lift", scale: state.scale }],
            state.messages ?? [],
            [{ op: "end_lift" }],
            list.slice(i + 1),
          );
        break;
      case "start_lift":
        num_lifts += 1;
        lifts.push({ credit: credit, scale: scale });
        credit = Fraction.zero;
        scale = state.scale as number;
        out_states.push(state);
        break;
      case "end_lift": {
        num_lifts -= 1;
        const last_lift = lifts.pop() as { credit: Fraction; scale: number };
        const lift_credit = credit;
        credit = last_lift.credit;
        credit = credit.add(lift_credit.multiply(Fraction.fromFloat(scale)));
        scale = last_lift.scale;
        out_states.push(state);
        break;
      }
      default:
        out_states.push(state);
    }
    if (end) {
      break;
    }
  }
  return {
    valid: valid,
    credit: credit.toFloat(),
    states: out_states,
  };
}
