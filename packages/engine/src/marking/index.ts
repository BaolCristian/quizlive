/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Superficie pubblica del modulo `marking/`, l'equivalente del namespace
// `Numbas.marking` upstream (runtime/scripts/marking.js).
//
// Gli export sono NOMINATI, non `export *`. In particolare NON escono di qui
// `StatefulScope` né `makeMarkingScope`: uno `StatefulScope` costruito a mano
// non ha le funzioni di stato che `makeMarkingScope` gli installa, quindi
// sarebbe uno scope che *sembra* correggere e non accumula niente. Restano
// interni anche `stateFn`, `markingStateFunctions`, `computeNote`,
// `finaliseState`, `feedback` e gli script `.jme` incorporati: sono i pezzi
// del motore di correzione, non l'interfaccia con cui lo si usa (si corregge
// chiamando `part.submit()`).

// side effect globale, come upstream: registra `apply` fra le operazioni pigre
// (`jme.lazyOps`) e installa `substituteTreeOps.apply` (marking.js:307-310).
// Esplicito, perché sotto da `note-functions` esce solo un tipo e un
// `export type` non porta con sé il modulo a runtime.
import "./note-functions";

// i tipi del feedback che una parte espone in `finalised_result` e
// `markingFeedback`.
export type { FeedbackOp, FeedbackReason, FeedbackFormat, FeedbackItem } from "./feedback";
export type { FinalisedState } from "./finalise-state";

// marking.js:456-509 — lo script di correzione di una parte
// (`part.markingScript`) e il risultato che produce.
export { MarkingScript, type MarkingScriptResult } from "./marking-script";
