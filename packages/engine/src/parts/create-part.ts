/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// part.js:85-143 — `Numbas.createPartFromJSON` e `Numbas.createPart`, più il
// registro `Numbas.partConstructors`.
//
// `createPartFromXML` (49-84) non è portata: il percorso XML è fuori ambito.

import { JmeError, errorMessageIn } from "../jme/errors";
import { nicePartName } from "./nice-part-name";
import type { PartBase } from "./part-base";
import type { PartContext, PartJSON, PartType } from "./types";

/** Il costruttore di un tipo di parte. */
export type PartConstructor = new (
  index: number,
  path: string,
  ctx: PartContext,
  parentPart?: PartBase,
) => PartBase;

// part.js:16 (`Numbas.partConstructors`)
/** Il registro dei tipi di parte: ogni modulo `*-part.ts` si registra qui al
 * caricamento, come upstream fa in fondo a ogni `parts/*.js`. */
export const partConstructors: Partial<Record<PartType, PartConstructor>> = {};

/** Registra il costruttore di un tipo di parte. */
export function registerPartType(type: PartType, cons: PartConstructor): void {
  partConstructors[type] = cons;
}

// part.js:130-143
/** Costruisce una parte del tipo dato, senza caricarne la definizione. */
export function createPart(
  index: number,
  type: PartType,
  path: string,
  ctx: PartContext,
  parentPart?: PartBase,
): PartBase {
  const cons = partConstructors[type];
  if (!cons) {
    throw new JmeError("part.unknown type", { part: nicePartName(path, ctx.scope.locale), type: type });
  }
  const part = new cons(index, path, ctx, parentPart);
  part.type = type;
  // upstream: `part.scope = part.makeScope(scope)`. Qui lo scope esplicito non
  // esiste come parametro separato: `makeScope()` risolve da sé la catena
  // (parte madre → domanda → `ctx.scope`), che è l'ordine upstream quando
  // `scope` non è passato (part.js:1050-1058).
  part.setScope(part.makeScope());
  return part;
}

// part.js:98-118
/** Costruisce una parte a partire dalla sua definizione JSON.
 *
 * Un tipo sconosciuto lancia `part.unknown type`; un JSON senza `type` lancia
 * `part.missing type attribute`. Ogni altro errore durante il caricamento è
 * riavvolto in `part.error` con il nome della parte. */
export function createPartFromJSON(
  index: number,
  data: PartJSON,
  path: string,
  ctx: PartContext,
  parentPart?: PartBase,
): PartBase {
  if (!data || !data.type) {
    throw new JmeError("part.missing type attribute", { part: nicePartName(path, ctx.scope.locale) });
  }
  const part = createPart(index, data.type, path, ctx, parentPart);
  try {
    part.loadFromJSON(data);
    part.finaliseLoad();
  } catch (e) {
    // `partErrorKeys` vive in `part-base.ts`, che importa questo modulo: qui
    // basta la stessa condizione senza l'import (un `part.error` ha già il
    // nome della parte nel messaggio e non va riavvolto).
    if (e instanceof JmeError && e.key === "part.error") {
      throw e;
    }
    part.error(errorMessageIn(e, part.locale), {}, e);
  }
  return part;
}
