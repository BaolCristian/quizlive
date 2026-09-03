/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// marking.js:101-454 — `state_fn`, l'array `state_functions` (le funzioni del
// linguaggio delle note), gli helper `submit_part`/`mark_part`/
// `concat_feedback` e la registrazione di `apply` fra le operazioni pigre.
//
// NON portate (decisione 2 del brief, inventario 05 §11.6 e §6.9):
// `check_pre_submit` (348-366) e `apply_marking_script` (368-404). La prima è
// l'unico punto in cui la correzione può diventare asincrona e nessuno dei
// tipi di parte in ambito la attiva; la seconda serve solo agli script di
// correzione dei plugin. Vedi DIVERGENCES.md.

import { t } from "../i18n";
import { JmeError } from "../jme/errors";
import { FuncObj, signature, type SignatureInput } from "../jme/funcobj";
import { unwrapValue, wrapValue } from "../jme/evaluate";
import { lazyOps, type Scope } from "../jme/scope";
import { substituteTreeOps } from "../jme/evaluate";
import { normaliseName } from "../jme/tokenizer";
import {
  TBool,
  TDict,
  THTML,
  TList,
  TName,
  TNothing,
  TNum,
  TScope,
  TString,
  type Token,
  type TokenConstructor,
  type Tree,
} from "../jme/tokens";
import { feedback, type FeedbackItem, type FeedbackReason } from "./feedback";
import { finaliseState } from "./finalise-state";
import { StatefulScope, findStatefulScope } from "./stateful-scope";

/** Quel che una funzione di stato ritorna: il valore JME della chiamata e gli
 * item di feedback da aggiungere allo stato (marking.js:106). */
export interface StateFnResult {
  return: unknown;
  state: FeedbackItem[];
}

/** Il corpo di una funzione di stato non pigra: riceve i valori JS già
 * spacchettati. */
type StateFnBody = (...args: never[]) => StateFnResult;

// marking.js:110-130
/** Crea una funzione JME che modifica lo stato della correzione: esegue `fn`,
 * accoda `fn().state` allo stato dello `StatefulScope` più vicino nella catena
 * dei genitori, e ritorna `fn().return` impacchettato come token JME. */
export function stateFn(
  name: string,
  args: SignatureInput[],
  outcons: TokenConstructor,
  fn: StateFnBody,
): FuncObj {
  return new FuncObj(name, args, outcons, null, {
    evaluate: function (fnargs: Token[] | Tree[], scope: Scope): Token {
      let res: StateFnResult;
      if (lazyOps.indexOf(name) >= 0) {
        // le funzioni pigre ricevono gli alberi e lo scope, non i valori
        res = (fn as unknown as (a: Tree[], s: Scope) => StateFnResult)(fnargs as Tree[], scope);
      } else {
        res = (fn as unknown as (...a: unknown[]) => StateFnResult)(
          ...(fnargs as Token[]).map((a) => unwrapValue(a)),
        );
      }
      res.state.forEach((s) => {
        s.scope = new TScope(scope);
      });
      const p = findStatefulScope(scope, name);
      p.state = p.state.concat(res.state);
      return wrapValue(res.return);
    },
  });
}

/** Il minimo che una parte deve offrire al motore di correzione perché
 * `submit_part`/`mark_part` funzionino (Task 8). Il tipo `Part` vero vive in
 * `parts/`: qui basta la forma, per non creare una dipendenza all'indietro. */
export interface MarkablePart {
  /** La risposta in attesa di invio. */
  stagedAnswer: unknown;
  /** Il credito assegnato, fra 0 e 1. */
  credit: number;
  /** La parte ha ricevuto una risposta valida? */
  answered: boolean;
  /** Il risultato dell'ultima correzione. */
  finalised_result: { states: FeedbackItem[]; valid: boolean; credit: number };
  submit(): void;
  setStudentAnswer(): void;
  availableMarks(): number;
  getScope(): Scope;
  setCredit(credit: number, message?: string, reason?: FeedbackReason): void;
  mark_answer(
    answer: Token,
    scope: Scope,
  ): {
    states: Record<string, FeedbackItem[]>;
    values: Record<string, Token>;
    stateValid: Record<string, boolean>;
    stateErrors: Record<string, Error>;
  };
}

/** Quel che il motore di correzione chiede alla domanda (Task 9). */
export interface MarkingQuestion {
  getPart(path: string): MarkablePart;
}

/** La parte all'indirizzo dato, cercata nella domanda dello scope.
 *
 * upstream (marking.js:336) fa `scope.question.getPart(path)` senza controlli:
 * fuori da una domanda andrebbe in `TypeError`. Qui l'errore è esplicito. */
function getPart(scope: Scope, path: string): MarkablePart {
  const question = scope.question as MarkingQuestion | undefined;
  if (!question || typeof question.getPart !== "function") {
    throw new JmeError("marking.no question in scope", { path: path });
  }
  return question.getPart(path);
}

// marking.js:318-332
/** Sottomette la risposta data alla parte data, e ne ritorna il risultato come
 * dizionario JME con le chiavi `credit`, `marks`, `feedback`, `answered`. */
function submitPart(part: MarkablePart, answer?: unknown): Token {
  const originalAnswer = part.stagedAnswer;
  if (answer !== undefined) {
    part.stagedAnswer = answer;
  }
  part.submit();
  part.stagedAnswer = originalAnswer;
  part.setStudentAnswer();
  return wrapValue({
    credit: part.credit,
    marks: part.availableMarks(),
    feedback: part.finalised_result.states,
    answered: part.answered,
  });
}

// marking.js:157-168
/** `correctif(condizione)` e `correctif(condizione, messaggio, messaggio)`. */
function correctif(condition: boolean, correctMessage?: string, incorrectMessage?: string): StateFnResult {
  let state: FeedbackItem;
  if (condition) {
    state = feedback.set_credit(1, "correct", correctMessage || t("part.marking.correct"));
  } else {
    state = feedback.set_credit(0, "incorrect", incorrectMessage || t("part.marking.incorrect"));
  }
  return { return: condition, state: [state] };
}

// marking.js:132-454
/** Le funzioni del linguaggio delle note, nell'ordine di registrazione
 * upstream (da cui dipende la risoluzione degli overload). */
const stateFunctions: FuncObj[] = [];

// marking.js:133-138
stateFunctions.push(
  stateFn("correct", [], TBool, () => ({
    return: true,
    state: [feedback.set_credit(1, "correct", t("part.marking.correct"))],
  })),
);
// marking.js:139-144
stateFunctions.push(
  stateFn("correct", [TString], TBool, ((message: string) => ({
    return: true,
    state: [feedback.set_credit(1, "correct", message)],
  })) as StateFnBody),
);
// marking.js:145-150
stateFunctions.push(
  stateFn("incorrect", [], TBool, () => ({
    return: false,
    state: [feedback.set_credit(0, "incorrect", t("part.marking.incorrect"))],
  })),
);
// marking.js:151-156
stateFunctions.push(
  stateFn("incorrect", [TString], TBool, ((message: string) => ({
    return: false,
    state: [feedback.set_credit(0, "incorrect", message)],
  })) as StateFnBody),
);
// marking.js:169-170
stateFunctions.push(stateFn("correctif", [TBool], TBool, correctif as StateFnBody));
stateFunctions.push(stateFn("correctif", [TBool, TString, TString], TBool, correctif as StateFnBody));
// marking.js:171-176
stateFunctions.push(
  stateFn("set_credit", [TNum, TString], TNum, ((n: number, message: string) => ({
    return: n,
    state: [feedback.set_credit(n, undefined, message)],
  })) as StateFnBody),
);
// marking.js:177-182
stateFunctions.push(
  stateFn("multiply_credit", [TNum, TString], TNum, ((n: number, message: string) => ({
    return: n,
    state: [feedback.multiply_credit(n, message)],
  })) as StateFnBody),
);
// marking.js:183-188
stateFunctions.push(
  stateFn("multiply_credit_if", [TBool, TNum, TString, TString], TBool, ((
    condition: boolean,
    n: number,
    positive_message: string,
    negative_message: string,
  ) => ({
    return: condition,
    state: [
      condition ? feedback.multiply_credit(n, positive_message) : feedback.feedback(negative_message),
    ],
  })) as StateFnBody),
);
// marking.js:189-194
stateFunctions.push(
  stateFn("multiply_credit_if", [TBool, TNum, TString], TBool, ((
    condition: boolean,
    n: number,
    positive_message: string,
  ) => ({
    return: condition,
    state: condition ? [feedback.multiply_credit(n, positive_message)] : [],
  })) as StateFnBody),
);
// marking.js:195-200
stateFunctions.push(
  stateFn("add_credit", [TNum, TString], TNum, ((n: number, message: string) => ({
    return: n,
    state: [feedback.add_credit(n, message)],
  })) as StateFnBody),
);
// marking.js:201-206
stateFunctions.push(
  stateFn("add_credit_if", [TBool, TNum, TString, TString], TBool, ((
    condition: boolean,
    n: number,
    positive_message: string,
    negative_message: string,
  ) => ({
    return: condition,
    state: [
      condition
        ? feedback.add_credit(n, positive_message)
        : feedback.feedback(negative_message, n < 0 ? "neutral" : "incorrect"),
    ],
  })) as StateFnBody),
);
// marking.js:207-212
stateFunctions.push(
  stateFn("add_credit_if", [TBool, TNum, TString], TBool, ((
    condition: boolean,
    n: number,
    positive_message: string,
  ) => ({
    return: condition,
    state: condition ? [feedback.add_credit(n, positive_message)] : [],
  })) as StateFnBody),
);
// marking.js:213-218
stateFunctions.push(
  stateFn("sub_credit", [TNum, TString], TNum, ((n: number, message: string) => ({
    return: n,
    state: [feedback.sub_credit(n, message)],
  })) as StateFnBody),
);
// marking.js:219-224
stateFunctions.push(
  stateFn("end", [], TBool, () => ({
    return: true,
    state: [feedback.end()],
  })),
);
// marking.js:225-233 — `fail` rende la risposta NON VALIDA (credito 0 con
// ragione `invalid` più `end(true)`); `warn` qui sotto no (inventario §9).
stateFunctions.push(
  stateFn("fail", [TString], TString, ((message: string) => ({
    return: message,
    state: [feedback.set_credit(0, "invalid", message), feedback.end(true)],
  })) as StateFnBody),
);
// marking.js:234-239
stateFunctions.push(
  stateFn("warn", [TString], TString, ((message: string) => ({
    return: message,
    state: [feedback.warning(message)],
  })) as StateFnBody),
);
// marking.js:240-245 — upstream dichiara un secondo parametro `scope` che non
// riceve mai (la funzione non è pigra, quindi `fn` è chiamata con i soli
// argomenti JME): `feedback.feedback` riceve sempre `scope` indefinito, e
// `stateFn` lo sovrascrive comunque con lo scope reale.
stateFunctions.push(
  stateFn("feedback", [TString], TString, ((message: string) => ({
    return: message,
    state: [feedback.feedback(message, undefined, undefined, undefined)],
  })) as StateFnBody),
);
// marking.js:246-251
stateFunctions.push(
  stateFn("positive_feedback", [TString], TString, ((message: string) => ({
    return: message,
    state: [feedback.feedback(message, "correct")],
  })) as StateFnBody),
);
// marking.js:252-257
stateFunctions.push(
  stateFn("negative_feedback", [TString], TString, ((message: string) => ({
    return: message,
    state: [feedback.feedback(message, "incorrect")],
  })) as StateFnBody),
);
// marking.js:258-263
stateFunctions.push(
  stateFn("feedback", [THTML], THTML, ((html: string) => ({
    return: html,
    state: [feedback.feedback(html, undefined, "html")],
  })) as StateFnBody),
);
// marking.js:264-269
stateFunctions.push(
  stateFn("positive_feedback", [THTML], THTML, ((message: string) => ({
    return: message,
    state: [feedback.feedback(message, "correct", "html")],
  })) as StateFnBody),
);
// marking.js:270-275
stateFunctions.push(
  stateFn("negative_feedback", [THTML], THTML, ((message: string) => ({
    return: message,
    state: [feedback.feedback(message, "incorrect", "html")],
  })) as StateFnBody),
);
// marking.js:276-280 — l'operatore `;`: ritorna il secondo argomento. Lo stato
// di ENTRAMBI è già stato accumulato valutandoli, ed è così che `a(); b()`
// incatena gli effetti.
stateFunctions.push(
  new FuncObj(";", ["?", "?"], "?", null, {
    evaluate: function (args: Token[] | Tree[]): Token {
      return (args as Token[])[1] as Token;
    },
  }),
);
// marking.js:281-306 — `apply` è PIGRA: per ogni argomento che è un nome di
// nota, recupera lo stato già calcolato per quella nota e lo concatena al
// proprio; se l'argomento è una lista, la tratta come lista letterale di item.
stateFunctions.push(
  stateFn("apply", ["multiple (name or list)"], TName, ((args: Tree[], scope: Scope): StateFnResult => {
    const out: StateFnResult = { return: new TNothing(), state: [] };
    for (let i = 0; i < args.length; i++) {
      const tok = (args[i] as Tree).tok;
      if (tok.type === "name") {
        const name = normaliseName(tok.name, scope);
        const p = findStatefulScope(scope, "apply");
        const state = p.states[name];
        out.return = new TNothing();
        out.state = out.state.concat(state || []);
      } else {
        const value = scope.evaluate(args[i] as Tree);
        if (!value || value.type !== "list") {
          throw new JmeError("marking.apply.not a list");
        }
        out.return = value;
        out.state = out.state.concat(unwrapValue(value) as FeedbackItem[]);
      }
    }
    return out;
  }) as unknown as StateFnBody),
);
// marking.js:307 — `apply` valuta i propri argomenti da sé.
if (lazyOps.indexOf("apply") === -1) {
  lazyOps.push("apply");
}
// marking.js:308-310 — gli argomenti di `apply` sono nomi di note, non
// variabili da sostituire: l'albero resta com'è.
substituteTreeOps["apply"] = function (tree: Tree): Tree {
  return tree;
};

// marking.js:334-339
stateFunctions.push(
  new FuncObj("submit_part", [TString], TDict, null, {
    evaluate: function (args: Token[] | Tree[], scope: Scope): Token {
      const part = getPart(scope, ((args as Token[])[0] as TString).value);
      return submitPart(part);
    },
  }),
);
// marking.js:340-346
stateFunctions.push(
  new FuncObj("submit_part", [TString, "?"], TDict, null, {
    evaluate: function (args: Token[] | Tree[], scope: Scope): Token {
      const part = getPart(scope, ((args as Token[])[0] as TString).value);
      const answer = unwrapValue((args as Token[])[1] as Token);
      return submitPart(part, answer);
    },
  }),
);
// marking.js:405-443 — corregge (ma non sottomette) un'altra parte. Il ramo
// `part_result.waiting_for_pre_submit` (421-431) non è portato: senza
// `check_pre_submit` nessuna correzione può restare in attesa.
stateFunctions.push(
  new FuncObj("mark_part", [TString, "?"], TDict, null, {
    evaluate: function (args: Token[] | Tree[], scope: Scope): Token {
      const part = getPart(scope, ((args as Token[])[0] as TString).value);
      const answer = (args as Token[])[1] as Token;
      let part_result;
      if (answer.type === "nothing") {
        part.setCredit(0, t("part.marking.nothing entered"));
        part_result = {
          states: { mark: [] as FeedbackItem[] },
          stateValid: {} as Record<string, boolean>,
          stateErrors: {} as Record<string, Error>,
          values: { interpreted_answer: answer },
        };
      } else {
        part_result = part.mark_answer(answer, part.getScope());
      }
      const result = finaliseState(part_result.states["mark"] ?? []);
      // le chiavi del dizionario JME restano quelle upstream (`state_valid`),
      // anche dove il tipo TypeScript usa il camelCase (`stateValid`).
      return wrapValue({
        marks: part.availableMarks(),
        credit: result.credit,
        feedback: result.states,
        valid: result.valid,
        states: part_result.states,
        state_valid: part_result.stateValid,
        values: part_result.values,
      });
    },
  }),
);
// marking.js:444-454
stateFunctions.push(
  stateFn(
    "concat_feedback",
    [TList, TNum, signature.optional(signature.type("boolean"))],
    TList,
    ((messages: FeedbackItem[], scale: number, strip_messages?: boolean): StateFnResult => {
      let ms = messages;
      if (strip_messages) {
        ms = messages.map((m) => ({ ...m, message: "" }));
      }
      return { return: ms, state: [feedback.concat(ms, scale)] };
    }) as StateFnBody,
  ),
);

/** Le definizioni delle funzioni del linguaggio delle note, in sola lettura. */
export const markingStateFunctions: readonly FuncObj[] = stateFunctions;

// marking.js:471-481 — upstream questa registrazione è nel costruttore di
// `StatefulScope`.
/** Costruisce lo scope di valutazione di uno script di correzione: uno
 * `StatefulScope` figlio di `parent`, con le funzioni del linguaggio delle
 * note e le variabili date. */
export function makeMarkingScope(parent: Scope, variables?: Record<string, Token>): StatefulScope {
  const scope = new StatefulScope([parent, variables ? { variables: variables } : undefined]);
  stateFunctions.forEach((fn) => {
    scope.addFunction(fn);
  });
  return scope;
}
