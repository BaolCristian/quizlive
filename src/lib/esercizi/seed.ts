import { readdirSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { esercizioFileSchema, hashContenuto } from "./format/schema";

export interface RisultatoSeed { creati: number; aggiornati: number; invariati: number }

/** Carica gli esercizi da una cartella. Il nome del file, senza estensione, è
 * la chiave stabile dell'esercizio: rinominarlo crea un esercizio nuovo. */
export async function seedEsercizi(dir: string): Promise<RisultatoSeed> {
  const out: RisultatoSeed = { creati: 0, aggiornati: 0, invariati: 0 };

  for (const nome of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const grezzo: unknown = JSON.parse(readFileSync(path.join(dir, nome), "utf8"));
    const parsed = esercizioFileSchema.safeParse(grezzo);
    if (!parsed.success) {
      throw new Error(`${nome}: involucro SAVINT non valido — ${parsed.error.message}`);
    }
    const { savint, question } = parsed.data;

    // Il motore è l'unico giudice del contenuto: se non lo carica, il seed si ferma.
    try {
      loadQuestion(question as NumbasQuestionJSON, { seed: "verifica-seed" });
    } catch (e) {
      throw new Error(`${nome}: il motore non carica la domanda — ${e instanceof Error ? e.message : String(e)}`);
    }

    const chiave = nome.replace(/\.json$/, "");
    const hash = hashContenuto(question);

    const esercizio = await prisma.esercizio.upsert({
      where: { id: chiave },
      create: {
        id: chiave, title: savint.title, description: savint.description ?? null,
        yearLevel: savint.yearLevel, topic: savint.topic, tags: savint.tags, difficulty: savint.difficulty,
      },
      update: {
        title: savint.title, description: savint.description ?? null,
        yearLevel: savint.yearLevel, topic: savint.topic, tags: savint.tags, difficulty: savint.difficulty,
      },
    });

    const ultima = await prisma.esercizioVersione.findFirst({
      where: { esercizioId: esercizio.id },
      orderBy: { version: "desc" },
    });

    if (!ultima) {
      await prisma.esercizioVersione.create({
        data: { esercizioId: esercizio.id, version: 1, content: question as object, hash },
      });
      out.creati++;
    } else if (ultima.hash !== hash) {
      await prisma.esercizioVersione.create({
        data: { esercizioId: esercizio.id, version: ultima.version + 1, content: question as object, hash },
      });
      out.aggiornati++;
    } else {
      out.invariati++;
    }
  }

  return out;
}
