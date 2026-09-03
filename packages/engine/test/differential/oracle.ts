/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */
/* Carica il bundle di test upstream in Node (jsdom) e ne espone una facciata tipizzata. Solo dev. */
/* eslint-disable @typescript-eslint/no-explicit-any -- il bundle upstream non è tipizzato. */
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import path from "node:path";

/** Il risultato della correzione di una parte, come lo vede l'oracolo. */
export interface OracleMarkResult {
  /** Il credito finale, fra 0 e 1. */
  credit: number;
  /** La risposta era correggibile? */
  valid: boolean;
  /** I messaggi di feedback, nell'ordine in cui li produce lo script. */
  feedback: string[];
  /** Il messaggio dell'errore che ha impedito la correzione, se c'è stato. */
  error?: string;
}

/** Il risultato di un invio dell'intera domanda. */
export interface OracleSubmitResult {
  /** Il punteggio totale della domanda. */
  score: number;
  /** Il punteggio massimo. */
  marks: number;
  /** Tutte le parti sono state risposte? */
  answered: boolean;
  /** Per percorso di parte: punteggio, credito, feedback. */
  parts: Record<string, { score: number; credit: number; answered: boolean; feedback: string[] }>;
  /** L'errore che ha interrotto l'invio, se c'è stato. */
  error?: string;
}

/** La domanda costruita dall'oracolo. */
export interface OracleQuestion {
  /** Le variabili generate, "spacchettate" (`q.unwrappedVariables`). */
  variables: Record<string, unknown>;
  /** L'enunciato con le variabili sostituite (`DOMcontentsubvars`). */
  statementHtml: string;
  /** Il nome della domanda, con le variabili sostituite. */
  name: string;
  /** I percorsi di tutte le parti costruite (`"p0"`, `"p0g1"`, ...). */
  partPaths: string[];
  /** Le estrazioni di `Math.random()` fatte subito DOPO la costruzione, se
   * `probeDraws` è stato chiesto: servono a verificare che il port abbia
   * consumato dal generatore esattamente quanto l'oracolo. */
  drawsAfter: number[];
  /** L'oggetto `Numbas.Question` grezzo. */
  q: any;
}

export interface OracleApi {
  // Il bundle upstream non è tipizzato: `any` è inevitabile qui e nei punti
  // sotto in cui si tocca `Numbas`/`globalThis` dinamicamente caricati.
  numbas: any; // il namespace globale Numbas del bundle
  evaluate(expr: string): any; // Numbas.jme.builtinScope.evaluate(expr)
  texify(expr: string): string; // Numbas.jme.display.exprToLaTeX(expr, [], scope)
  seed(s: string): void; // Math.seedrandom(s) del vendor upstream
  /** Le prime `n` estrazioni di `Math.random()` dopo `Math.seedrandom(seed)`. */
  draws(seed: string, n: number): number[];
  /** `Numbas.jme.display.exprToLaTeX(expr, ruleset ?? "all", builtinScope)`. */
  oracleDisplay(expr: string, ruleset?: string | string[]): string;
  /** Costruisce una domanda dal JSON, sotto il seme dato.
   *
   * `probeDraws` estrae quel numero di valori da `Math.random()` subito dopo
   * la costruzione: NON va chiesto se poi si corregge questa domanda, perché
   * sposterebbe il generatore. */
  oracleQuestion(json: object, seed: string, probeDraws?: number): Promise<OracleQuestion>;
  /** Corregge le risposte date, una per percorso di parte. */
  oracleMark(
    json: object,
    seed: string,
    answers: Record<string, unknown>,
  ): Promise<Record<string, OracleMarkResult>>;
  /** Registra le risposte e invia l'intera domanda (`Question#submit`):
   * copre marking adattivo, penalità e punteggio, che `mark` non tocca. */
  oracleSubmit(json: object, seed: string, answers: Record<string, unknown>): Promise<OracleSubmitResult>;
  /** La risposta corretta della parte al percorso dato, nella forma che
   * `storeAnswer` accetta. */
  oracleCorrectAnswer(q: OracleQuestion, path: string): unknown;
  /** Serializza un frammento HTML come lo serializza jsdom, per confrontare
   * l'enunciato del port con quello dell'oracolo senza rumore di formato. */
  serializeHtml(html: string): string;
}

let cached: Promise<OracleApi> | null = null;

export function loadOracle(): Promise<OracleApi> {
  if (cached) return cached;
  cached = (async () => {
    const dom = new JSDOM("");
    const g = globalThis as any;
    // In Node (ambiente "node" di questo test) `navigator` è già un getter
    // non scrivibile del runtime: va ridefinito, non semplicemente assegnato.
    g.window = dom.window;
    g.document = dom.window.document;
    Object.defineProperty(g, "navigator", {
      value: dom.window.navigator,
      configurable: true,
      writable: true,
    });

    // Vitest esegue i test come ESM: `require` non è definito, serve crearlo.
    const require = createRequire(import.meta.url);
    const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../oracle");
    require(path.join(dir, "numbas-runtime.js"));
    require(path.join(dir, "locales.js"));
    require(path.join(dir, "marking_scripts.js"));
    const Numbas = g.Numbas;

    // Come tests/headless.mjs upstream: sblocca lo scheduler dichiarando 'base' caricato.
    Numbas.queueScript("base", [], function () {});

    // Numbas.queueScript restituisce una vera Promise che si risolve quando le
    // dipendenze elencate (e la callback) sono state eseguite: la usiamo per
    // attendere che scope JME, display, marking, localizzazione e gli script
    // di correzione (marking_scripts.js, da cui `Numbas.raw_marking_scripts`)
    // siano pronti, invece di un timeout fisso.
    await Numbas.queueScript(
      "savint-ready",
      ["jme", "jme-display", "jme-variables", "marking", "localisation", "marking_scripts", "question", "seedrandom"],
      function () {},
    );

    // Come tests/jme/jme-tests.mjs upstream: imposta la lingua prima di valutare.
    Numbas.locale.set_preferred_locale("en-GB");
    Numbas.locale.init();

    const scope = Numbas.jme.builtinScope;
    const seed = (s: string): void => {
      (Math as any).seedrandom(s);
    };

    /** L'enunciato con le variabili sostituite.
     *
     * Upstream la sostituzione nell'enunciato è divisa fra due strati:
     *  - `DOMcontentsubvars` (jme-variables.js:697-700) sostituisce `{espr}`
     *    nei nodi di testo, con la serializzazione `doToken` di `DOMsubvars`,
     *    e **non tocca** i blocchi TeX (`sub_text` reinserisce `bits[i+2]`
     *    verbatim, riga 1079);
     *  - `\var{}`/`\simplify{}` dentro il TeX li sostituisce il tema al
     *    momento della composizione, con lo stesso ramo `sub_tex` di
     *    `jme.contentsubvars` (jme.js:409-431).
     *
     * `substituteHtml` del port fa i due passaggi insieme, in un colpo solo:
     * l'oracolo li applica in sequenza, ciascuno con la funzione upstream
     * pensata per la forma dell'input (elemento DOM il primo, stringa il
     * secondo). L'unico codice "nostro" è la staffetta fra i due. */
    const subHtml = (html: string, questionScope: any): string => {
      const el = g.document.createElement("div");
      el.innerHTML = html ?? "";
      Numbas.jme.variables.DOMcontentsubvars(el, questionScope);
      return subTex(el.innerHTML, questionScope);
    };

    /** Il ramo `sub_tex` di `jme.contentsubvars` (jme.js:409-431), applicato
     * ai soli blocchi matematici. */
    const subTex = (html: string, questionScope: any): string => {
      const jmeNs = Numbas.jme;
      const bits: string[] = Numbas.util.contentsplitbrackets(html);
      for (let i = 0; i < bits.length; i += 4) {
        if (i + 3 >= bits.length) continue;
        const tbits: string[] = jmeNs.texsplit(bits[i + 2]);
        let out = "";
        for (let j = 0; j < tbits.length; j += 4) {
          out += tbits[j];
          if (j + 3 < tbits.length) {
            const cmd = tbits[j + 1];
            const rules = jmeNs.collectRuleset(tbits[j + 2], questionScope.allRulesets());
            let expr = tbits[j + 3] as string;
            if (cmd === "var") {
              const v = questionScope.evaluate(expr);
              out += "{" + jmeNs.display.texify({ tok: v }, rules, questionScope) + "}";
            } else if (cmd === "simplify") {
              expr = jmeNs.subvars(expr, questionScope);
              out += "{" + jmeNs.display.exprToLaTeX(expr, rules, questionScope) + "}";
            }
          }
        }
        bits[i + 2] = out;
      }
      return bits.join("");
    };

    const oracleQuestion = async (json: object, s: string, probeDraws = 0): Promise<OracleQuestion> => {
      // Il runtime upstream non semina `Math.random` per domanda: si semina
      // l'intera generazione, come suggerisce l'inventario 06 §6.
      seed(s);
      const q = Numbas.createQuestionFromJSON(json, 0);
      q.generateVariables();
      await q.signals.on("ready");
      const drawsAfter: number[] = [];
      for (let i = 0; i < probeDraws; i++) drawsAfter.push(Math.random());
      return {
        variables: q.unwrappedVariables as Record<string, unknown>,
        statementHtml: subHtml(q.statement, q.scope),
        name: q.name as string,
        partPaths: Object.keys(q.partDictionary ?? {}),
        drawsAfter: drawsAfter,
        q: q,
      };
    };

    /** `finalised_result` → la tripla che il differenziale confronta. */
    const finalisedToResult = (finalised: any): OracleMarkResult => ({
      credit: finalised.credit as number,
      valid: finalised.valid as boolean,
      feedback: (finalised.states as any[])
        .map((st) => st.message)
        .filter((m): m is string => typeof m === "string" && m !== ""),
    });

    const oracleMark = async (
      json: object,
      s: string,
      answers: Record<string, unknown>,
    ): Promise<Record<string, OracleMarkResult>> => {
      const { q } = await oracleQuestion(json, s);
      const out: Record<string, OracleMarkResult> = {};
      for (const [partPath, answer] of Object.entries(answers)) {
        const p = q.getPart(partPath);
        if (!p) throw new Error(`l'oracolo non ha la parte ${partPath}`);
        // part-tests.mjs:53-65 (`mark_part`), senza il ramo `pre_submit`
        // (compiti asincroni: fuori ambito, v. DIVERGENCES.md).
        try {
          p.storeAnswer(answer);
          p.setStudentAnswer();
          const res = p.mark(p.getScope());
          out[partPath] = finalisedToResult(res.finalised_result);
        } catch (e) {
          out[partPath] = {
            credit: 0,
            valid: false,
            feedback: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      return out;
    };

    const oracleSubmit = async (
      json: object,
      s: string,
      answers: Record<string, unknown>,
    ): Promise<OracleSubmitResult> => {
      const { q } = await oracleQuestion(json, s);
      try {
        for (const [partPath, answer] of Object.entries(answers)) {
          const p = q.getPart(partPath);
          if (!p) throw new Error(`l'oracolo non ha la parte ${partPath}`);
          p.storeAnswer(answer);
        }
        q.submit();
      } catch (e) {
        return {
          score: 0,
          marks: 0,
          answered: false,
          parts: {},
          error: e instanceof Error ? e.message : String(e),
        };
      }
      const parts: OracleSubmitResult["parts"] = {};
      for (const partPath of Object.keys(answers)) {
        const p = q.getPart(partPath);
        parts[partPath] = {
          score: p.score as number,
          credit: p.credit as number,
          answered: p.answered as boolean,
          feedback: (p.markingFeedback as any[])
            .map((f) => f.message)
            .filter((m: unknown): m is string => typeof m === "string" && m !== "")
            .concat(p.warnings as string[]),
        };
      }
      return { score: q.score as number, marks: q.marks as number, answered: q.answered as boolean, parts: parts };
    };

    return {
      numbas: Numbas,
      evaluate: (expr: string) => scope.evaluate(expr),
      texify: (expr: string) => Numbas.jme.display.exprToLaTeX(expr, [], scope),
      seed: seed,
      draws: (s: string, n: number) => {
        seed(s);
        const out: number[] = [];
        for (let i = 0; i < n; i++) out.push(Math.random());
        return out;
      },
      oracleDisplay: (expr: string, ruleset?: string | string[]) =>
        Numbas.jme.display.exprToLaTeX(expr, ruleset ?? "all", scope),
      oracleQuestion: oracleQuestion,
      oracleMark: oracleMark,
      oracleSubmit: oracleSubmit,
      oracleCorrectAnswer: (oq: OracleQuestion, partPath: string) => {
        const p = oq.q.getPart(partPath);
        if (!p) throw new Error(`l'oracolo non ha la parte ${partPath}`);
        return p.getCorrectAnswer(p.getScope());
      },
      serializeHtml: (html: string) => {
        const el = g.document.createElement("div");
        el.innerHTML = html ?? "";
        return el.innerHTML;
      },
    };
  })();
  return cached;
}
