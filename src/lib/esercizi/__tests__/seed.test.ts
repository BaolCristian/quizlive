import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { seedEsercizi } from "../seed";

function scriviEsercizio(dir: string, nome: string, titolo: string, question: unknown) {
  writeFileSync(path.join(dir, nome), JSON.stringify({
    savint: { version: 1, title: titolo, yearLevel: 1, topic: "prova", tags: [], difficulty: 1 },
    question,
  }));
}

const domanda = { name: "Prova", statement: "<p>Quanto fa 1+1?</p>", variables: {}, parts: [
  { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
] };

describe("seed degli esercizi", () => {
  beforeEach(async () => {
    await prisma.tentativo.deleteMany();
    await prisma.esercizioVersione.deleteMany();
    await prisma.esercizio.deleteMany();
  });

  it("crea esercizio e prima versione", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 1, aggiornati: 0, invariati: 0 });
    const versioni = await prisma.esercizioVersione.findMany();
    expect(versioni).toHaveLength(1);
    expect(versioni[0]!.version).toBe(1);
  });

  it("un secondo giro con lo stesso contenuto non crea versioni", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 0, aggiornati: 0, invariati: 1 });
    expect(await prisma.esercizioVersione.count()).toBe(1);
  });

  it("un contenuto cambiato alza la versione e lascia la vecchia", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    scriviEsercizio(dir, "01-prova.json", "Prova", { ...domanda, statement: "<p>Cambiato</p>" });
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 0, aggiornati: 1, invariati: 0 });
    const versioni = await prisma.esercizioVersione.findMany({ orderBy: { version: "asc" } });
    expect(versioni.map((v) => v.version)).toEqual([1, 2]);
  });

  it("rifiuta un file che il motore non sa caricare", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-rotta.json", "Rotta", { name: "x", partsMode: "explore", parts: [] });
    await expect(seedEsercizi(dir)).rejects.toThrow(/01-rotta\.json/);
  });
});
