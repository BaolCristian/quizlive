import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { avviaORiprendi, applicaRisposta, completa } from "../tentativo";
import { seedEsercizi } from "../seed";
import path from "path";

let studentId: string;
let altroId: string;

beforeEach(async () => {
  await prisma.tentativo.deleteMany();
  await prisma.esercizioVersione.deleteMany();
  await prisma.esercizio.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: ["s1@test.it", "s2@test.it"] } } });
  studentId = (await prisma.user.create({ data: { email: "s1@test.it", name: "S1", role: "STUDENT" } })).id;
  altroId = (await prisma.user.create({ data: { email: "s2@test.it", name: "S2", role: "STUDENT" } })).id;
  await seedEsercizi(path.resolve(process.cwd(), "content/esercizi"));
});

describe("ciclo di vita del tentativo", () => {
  it("il primo accesso crea un tentativo con un seme", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(t).not.toBeNull();
    expect(t!.seed).toMatch(/.+/);
    expect(t!.state).toBeNull();
    expect(t!.status).toBe("IN_PROGRESS");
  });

  it("il secondo accesso riprende lo stesso tentativo, stesso seme", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const b = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(b!.tentativoId).toBe(a!.tentativoId);
    expect(b!.seed).toBe(a!.seed);
  });

  it("due studenti hanno tentativi e semi diversi", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const b = await avviaORiprendi(altroId, "01-equazione-primo-grado");
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.seed).not.toBe(a!.seed);
  });

  it("un esercizio inesistente da' null", async () => {
    expect(await avviaORiprendi(studentId, "non-esiste")).toBeNull();
  });

  it("una risposta corretta fa salire il punteggio scritto sul database", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const { loadQuestion } = await import("@savint/engine");
    const q = loadQuestion(t!.content as never, { seed: t!.seed, locale: "it" });
    const p = q.getPart("p0")!;
    const giusta = p.correctAnswer();
    p.submit(giusta);
    q.updateScore();

    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", giusta, q.toState(), "it");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score).toBeGreaterThan(0);

    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.score).toBeGreaterThan(0);
  });

  it("uno stato che dichiara un punteggio gonfiato non viene creduto", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const statoBugiardo = {
      seed: t!.seed, answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 9999, marks: 9999,
      parts: [{ path: "p0", answered: true, score: 9999, marks: 9999, answer: "0" }],
    };
    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", "0", statoBugiardo as never, "it");
    expect(r.ok).toBe(true);
    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.score).toBe(0);
    expect(riga!.maxScore).toBeLessThan(9999);
  });

  it("il tentativo di un altro studente viene rifiutato", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const r = await applicaRisposta(t!.tentativoId, altroId, "p0", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "non_tuo" });
  });

  it("una parte che non esiste viene rifiutata", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const r = await applicaRisposta(t!.tentativoId, studentId, "p99", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "parte_sconosciuta" });
  });

  it("completare chiude il tentativo e fissa il punteggio", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const r = await completa(t!.tentativoId, studentId, "it");
    expect(r.ok).toBe(true);
    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.status).toBe("COMPLETED");
    expect(riga!.completedAt).not.toBeNull();
  });

  it("dopo il completamento non si accettano risposte", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    await completa(t!.tentativoId, studentId, "it");
    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "gia_completato" });
  });

  it("dopo il completamento un nuovo accesso apre un tentativo nuovo", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    await completa(a!.tentativoId, studentId, "it");
    const b = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.status).toBe("IN_PROGRESS");
  });

  it("un tentativo piu' vecchio della conservazione non si riprende", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const giorni = Number(process.env.TENTATIVI_RETENTION_DAYS ?? 180);
    await prisma.tentativo.update({
      where: { id: a!.tentativoId },
      data: { lastActivityAt: new Date(Date.now() - (giorni + 1) * 86_400_000) },
    });
    const b = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
  });
});
