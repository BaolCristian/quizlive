import { describe, it, expect } from "vitest";
import { esercizioFileSchema, hashContenuto } from "../schema";

const valido = {
  savint: { version: 1, title: "Equazione", yearLevel: 2, topic: "equazioni", tags: ["primo-grado"], difficulty: 1 },
  question: { name: "x", parts: [] },
};

describe("schema del file esercizio", () => {
  it("accetta un file valido", () => {
    expect(esercizioFileSchema.safeParse(valido).success).toBe(true);
  });

  it("rifiuta un anno fuori da 1..5", () => {
    const r = esercizioFileSchema.safeParse({ ...valido, savint: { ...valido.savint, yearLevel: 6 } });
    expect(r.success).toBe(false);
  });

  it("rifiuta una difficolta' fuori da 1..3", () => {
    const r = esercizioFileSchema.safeParse({ ...valido, savint: { ...valido.savint, difficulty: 0 } });
    expect(r.success).toBe(false);
  });

  it("non interpreta il contenuto della domanda", () => {
    const r = esercizioFileSchema.safeParse({ ...valido, question: { qualsiasi: "cosa" } });
    expect(r.success).toBe(true);
  });

  it("l'hash dipende dal contenuto e non dall'ordine delle chiavi", () => {
    expect(hashContenuto({ a: 1, b: 2 })).toBe(hashContenuto({ b: 2, a: 1 }));
    expect(hashContenuto({ a: 1 })).not.toBe(hashContenuto({ a: 2 }));
  });
});
