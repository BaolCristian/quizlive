import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("schema esercizi", () => {
  it("dichiara i tre modelli e l'enum", () => {
    expect(schema).toMatch(/^model Esercizio \{/m);
    expect(schema).toMatch(/^model EsercizioVersione \{/m);
    expect(schema).toMatch(/^model Tentativo \{/m);
    expect(schema).toMatch(/^enum TentativoStatus \{/m);
  });

  it("Tentativo.compitoId e' nullable: il sotto-progetto 4 lo riempira'", () => {
    const model = schema.match(/model Tentativo \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/compitoId\s+String\?/);
  });

  it("Tentativo tiene seme, stato e punteggi", () => {
    const model = schema.match(/model Tentativo \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/seed\s+String/);
    expect(model).toMatch(/state\s+Json\?/);
    expect(model).toMatch(/score\s+Float/);
    expect(model).toMatch(/maxScore\s+Float/);
  });

  it("User ha il lato inverso della relazione", () => {
    const model = schema.match(/model User \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/tentativi\s+Tentativo\[\]/);
  });

  it("EsercizioVersione e' unica per (esercizio, versione)", () => {
    const model = schema.match(/model EsercizioVersione \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[esercizioId, version\]\)/);
  });
});
