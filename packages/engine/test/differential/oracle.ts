/* Carica il bundle di test upstream in Node (jsdom) e ne espone una facciata tipizzata. Solo dev. */
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import path from "node:path";

export interface OracleApi {
  // Il bundle upstream non è tipizzato: `any` è inevitabile qui e nei punti
  // sotto in cui si tocca `Numbas`/`globalThis` dinamicamente caricati.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  numbas: any; // il namespace globale Numbas del bundle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate(expr: string): any; // Numbas.jme.builtinScope.evaluate(expr)
  texify(expr: string): string; // Numbas.jme.display.exprToLaTeX(expr, [], scope)
  seed(s: string): void; // Math.seedrandom(s) del vendor upstream
}

let cached: Promise<OracleApi> | null = null;

export function loadOracle(): Promise<OracleApi> {
  if (cached) return cached;
  cached = (async () => {
    const dom = new JSDOM("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      ["jme", "jme-display", "marking", "localisation", "marking_scripts"],
      function () {}
    );

    // Come tests/jme/jme-tests.mjs upstream: imposta la lingua prima di valutare.
    Numbas.locale.set_preferred_locale("en-GB");
    Numbas.locale.init();

    const scope = Numbas.jme.builtinScope;
    return {
      numbas: Numbas,
      evaluate: (expr: string) => scope.evaluate(expr),
      texify: (expr: string) => Numbas.jme.display.exprToLaTeX(expr, [], scope),
      seed: (s: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Math as any).seedrandom(s);
      },
    };
  })();
  return cached;
}
