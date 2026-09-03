/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-variables.js:795 (`re_note`), 797-836 (`ScriptNote`), 838-939
// (`note_script_constructor`) — gli script di note (usati dal motore di
// correzione, Task 7, per gli algoritmi di marking scritti come sequenze di
// note `nome (descrizione): espressione`).

import { t } from "../i18n";
import { JmeError } from "../jme/errors";
import { errorMessageIn } from "../errors";
import { compile } from "../jme/parser";
import { findvars } from "../jme/evaluate";
import { builtinScope } from "../jme/builtins";
import { Scope } from "../jme/scope";
import type { Token, Tree } from "../jme/tokens";
import { normaliseName } from "../jme/tokenizer";
import { computeVariable, makeVariables, remakeVariables, type MakeVariablesResult } from "./generate";

// jme-variables.js:795
const re_note = /^(\$?[a-zA-Z_][a-zA-Z0-9_]*'*)(?:\s*\(([^)]*)\))?\s*:\s*((?:.|\n)*)$/m;

// jme-variables.js:797-836
/** Una nota di uno script (`nome (descrizione): espressione`). */
export class ScriptNote {
  name: string;
  description: string;
  expr: string;
  tree: Tree;
  vars: string[];

  constructor(source: string, scope: Scope) {
    const trimmed = source.trim();
    const m = re_note.exec(trimmed);
    if (!m) {
      // le due traduzioni sono frasi complete con lo spazio iniziale: quando
      // nessuna delle due si applica, `hint` resta "" e il messaggio
      // principale non lascia un `{hint}` letterale (v. `t()`, che sostituisce
      // solo i segnaposto con un valore effettivamente passato).
      let hint = "";
      // upstream (jme-variables.js:818-821): la classe di caratteri
      // `[a-zA-Z0-9+]` include letteralmente `+`, non solo cifre/lettere —
      // portato com'è.
      if (/^[a-zA-Z_][a-zA-Z0-9+]*'*(?:\s*\(([^)]*)\))?$/.test(trimmed)) {
        hint = t("jme.script.note.invalid definition.missing colon", undefined, scope.locale);
      } else if (/^[a-zA-Z_][a-zA-Z0-9+]*'*\s*\(/.test(trimmed)) {
        hint = t("jme.script.note.invalid definition.description missing closing bracket", undefined, scope.locale);
      }
      throw new JmeError("jme.script.note.invalid definition", { source: trimmed, hint: hint });
    }
    this.name = m[1] as string;
    // upstream: `undefined` quando manca la parte fra parentesi; qui si
    // normalizza a stringa vuota per rispettare `description: string`.
    this.description = m[2] ?? "";
    this.expr = m[3] as string;
    if (!this.expr) {
      throw new JmeError("jme.script.note.empty expression", { name: this.name });
    }
    let tree: Tree | null;
    try {
      tree = compile(this.expr);
    } catch (e) {
      const message = errorMessageIn(e, scope.locale);
      throw new JmeError("jme.script.note.compilation error", { name: this.name, message: message });
    }
    this.tree = tree as Tree;
    this.vars = findvars(this.tree, [], scope);
  }
}

/** Uno script di note già costruito (jme-variables.js:850-935, `Script`).
 *
 * Deviazione dal brief: `evaluate_note` upstream (jme-variables.js:927-934)
 * NON passa il risultato per `process_result` — ritorna direttamente
 * `{value, scope}`, indipendentemente da `TResult`. Qui la firma riflette
 * questo (non `TResult`, come invece il brief abbozzava): sono le semantiche
 * che il Task 7 osserva, non il tipo generico. */
export interface NoteScript<TResult> {
  notes: Record<string, ScriptNote>;
  evaluate(scope: Scope, variables?: Record<string, Token>, targets?: string[]): TResult;
  evaluate_note(
    note: string,
    scope: Scope,
    variables?: Record<string, Token>,
  ): { value: Token | undefined; scope: Scope };
  source: string;
  base?: NoteScript<TResult>;
}

// jme-variables.js:846-938
/** Crea una classe `Script` che interpreta uno script di note, usando le
 * funzioni date per costruire lo scope di valutazione e per trasformare il
 * risultato di `evaluate`. */
export function noteScriptConstructor<TResult>(
  constructScope: (scope: Scope, variables?: Record<string, Token>) => Scope,
  processResult: (result: MakeVariablesResult, scope: Scope) => TResult,
  computeNote?: typeof computeVariable,
): new (source: string, base?: NoteScript<TResult>, scope?: Scope) => NoteScript<TResult> {
  class Script implements NoteScript<TResult> {
    source: string;
    notes: Record<string, ScriptNote>;
    base?: NoteScript<TResult>;

    constructor(source: string, base?: NoteScript<TResult>, scope?: Scope) {
      this.source = source;
      if (base) {
        this.base = base;
      }
      const buildScope = constructScope(scope || builtinScope);
      const todo: Record<string, ScriptNote> = {};
      try {
        const noteSources = source.replace(/^\/\/.*$/gm, "").split(/\n(?:\s*\n)+(?!\s)/);
        const ntodo: Record<string, ScriptNote> = {};
        noteSources.forEach((note) => {
          if (note.trim().length) {
            const res = new ScriptNote(note, buildScope);
            const name = normaliseName(res.name, buildScope);
            ntodo[name] = todo[name] = res;
          }
        });
        if (base) {
          Object.keys(base.notes).forEach((name) => {
            if (name in ntodo) {
              todo["base_" + name] = base.notes[name] as ScriptNote;
            } else {
              todo[name] = base.notes[name] as ScriptNote;
            }
          });
        }
      } catch (e) {
        const message = errorMessageIn(e, buildScope.locale);
        throw new JmeError("jme.script.error parsing notes", { message: message });
      }
      this.notes = todo;
    }

    /** jme-variables.js:900-909 (`Script.prototype.construct_scope`). */
    private buildEvaluateScope(scope: Scope, variables?: Record<string, Token>): Scope {
      const s = constructScope(scope, variables);
      // upstream legge `variables[name]` senza controllare che `variables`
      // sia definito: qui, dato che il brief rende `variables` opzionale
      // anche in `evaluate`, si predefinisce a `{}` per evitare un
      // `TypeError` quando `evaluate(scope)` è chiamato senza secondo
      // argomento (esercitato dal test del brief).
      const vars = variables ?? {};
      Object.keys(this.notes).forEach((name) => {
        if (vars[name] === undefined) {
          s.deleteVariable(name);
        }
      });
      return s;
    }

    // jme-variables.js:911-918
    /** `targets` non è upstream: `makeVariables` lo accetta gia\u0300
     * (jme-variables.js:343), ma `Script.evaluate` passa sempre tutte le note.
     * Serve a chi valuta uno script deve saltarne una (il Task 9 salta
     * `pre_submit`: v. `MarkingScript`). Senza, si calcolano tutte. */
    evaluate(scope: Scope, variables?: Record<string, Token>, targets?: string[]): TResult {
      const s = this.buildEvaluateScope(scope, variables);
      const result = makeVariables(this.notes, s, null, computeNote, targets);
      return processResult(result, s);
    }

    // jme-variables.js:920-926
    evaluate_note(
      note: string,
      scope: Scope,
      changed_variables?: Record<string, Token>,
    ): { value: Token | undefined; scope: Scope } {
      const changed = changed_variables ?? {};
      const nscope = constructScope(scope);
      const result = remakeVariables(this.notes, changed, nscope, computeNote, [note]);
      for (const name of Object.keys(result.variables)) {
        nscope.setVariable(name, result.variables[name] as Token);
      }
      return { value: result.variables[note], scope: nscope };
    }
  }

  return Script;
}
