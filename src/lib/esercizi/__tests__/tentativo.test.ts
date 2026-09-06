import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { avviaORiprendi, applicaRisposta, completa, abbandona } from "../tentativo";
import { seedEsercizi } from "../seed";

// Prefisso unico di questo file — vedi il commento gemello in
// `seed.test.ts`: Vitest esegue i file di test in parallelo sulle stesse
// tabelle, quindi ogni file deve possedere solo le proprie righe. Si semina
// da una cartella temporanea con una copia (rinominata con questo prefisso)
// del contenuto reale, invece che da `content/esercizi/` direttamente: così
// l'id dell'esercizio è proprio di questo file e cancellazioni e asserzioni
// si filtrano su di esso, senza dipendere né toccare l'esercizio "vero"
// seminato da altri file o dal comando di seed dell'applicazione.
const PREFIX = "tenttest-";
const ESERCIZIO_ID = `${PREFIX}equazione-primo-grado`;

let studentId: string;
let altroId: string;

beforeEach(async () => {
  // L'eliminazione a cascata (Esercizio → EsercizioVersione → Tentativo, e
  // User → Tentativo) è imposta a livello di database dalle migrazioni:
  // basta cancellare le due radici, filtrate sul proprio prefisso/email.
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: ["s1@test.it", "s2@test.it"] } } });
  studentId = (await prisma.user.create({ data: { email: "s1@test.it", name: "S1", role: "STUDENT" } })).id;
  altroId = (await prisma.user.create({ data: { email: "s2@test.it", name: "S2", role: "STUDENT" } })).id;

  const dir = mkdtempSync(path.join(tmpdir(), "tenttest-"));
  const originale = readFileSync(
    path.resolve(process.cwd(), "content/esercizi/01-equazione-primo-grado.json"),
    "utf8",
  );
  writeFileSync(path.join(dir, `${ESERCIZIO_ID}.json`), originale);
  await seedEsercizi(dir);
});

// La pulizia c'era solo PRIMA di ogni test, quindi le righe dell'ultimo
// sopravvivevano alla corsa: un esercizio `tenttest-` è rimasto per giorni
// nel database di sviluppo, e comparso allo studente nel suo elenco come un
// doppione dell'esercizio vero. Quello che si crea qui va tolto anche alla
// fine.
afterAll(async () => {
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: ["s1@test.it", "s2@test.it"] } } });
});

describe("ciclo di vita del tentativo", () => {
  it("il primo accesso crea un tentativo con un seme", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(t).not.toBeNull();
    expect(t!.seed).toMatch(/.+/);
    expect(t!.state).toBeNull();
    expect(t!.status).toBe("IN_PROGRESS");
  });

  it("il secondo accesso riprende lo stesso tentativo, stesso seme", async () => {
    const a = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const b = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(b!.tentativoId).toBe(a!.tentativoId);
    expect(b!.seed).toBe(a!.seed);
  });

  it("due studenti hanno tentativi e semi diversi", async () => {
    const a = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const b = await avviaORiprendi(altroId, ESERCIZIO_ID);
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.seed).not.toBe(a!.seed);
  });

  it("un esercizio inesistente da' null", async () => {
    expect(await avviaORiprendi(studentId, "non-esiste")).toBeNull();
  });

  it("una risposta corretta fa salire il punteggio scritto sul database", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
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
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
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
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const r = await applicaRisposta(t!.tentativoId, altroId, "p0", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "non_tuo" });
  });

  it("una parte che non esiste viene rifiutata", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const r = await applicaRisposta(t!.tentativoId, studentId, "p99", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "parte_sconosciuta" });
  });

  it("completare chiude il tentativo e fissa il punteggio", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const r = await completa(t!.tentativoId, studentId, "it");
    expect(r.ok).toBe(true);
    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.status).toBe("COMPLETED");
    expect(riga!.completedAt).not.toBeNull();
  });

  it("dopo il completamento non si accettano risposte", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    await completa(t!.tentativoId, studentId, "it");
    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "gia_completato" });
  });

  it("dopo il completamento un nuovo accesso apre un tentativo nuovo", async () => {
    const a = await avviaORiprendi(studentId, ESERCIZIO_ID);
    await completa(a!.tentativoId, studentId, "it");
    const b = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.status).toBe("IN_PROGRESS");
  });

  // Onda finale, punto 9: `completa` ripeteva l'intero ricalcolo e
  // riscriveva `completedAt` a ogni chiamata, quindi un doppio clic o una
  // richiesta ritentata dopo un timeout spostava in avanti la chiusura di un
  // tentativo già chiuso. Ora la seconda chiamata non tocca nulla e
  // restituisce il punteggio fissato allora.
  it("chiudere due volte lo stesso tentativo non riscrive nulla", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const primo = await completa(t!.tentativoId, studentId, "it");
    const dopoIlPrimo = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });

    const secondo = await completa(t!.tentativoId, studentId, "it");
    const dopoIlSecondo = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });

    // Stesso esito, e nessuna riscrittura: il timestamp di chiusura è
    // ancora quello della prima volta.
    expect(secondo).toEqual(primo);
    expect(dopoIlSecondo!.completedAt).toEqual(dopoIlPrimo!.completedAt);
    expect(dopoIlSecondo!.score).toBe(dopoIlPrimo!.score);
    expect(dopoIlSecondo!.maxScore).toBe(dopoIlPrimo!.maxScore);
  });

  it("un tentativo piu' vecchio della conservazione non si riprende", async () => {
    const a = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const giorni = Number(process.env.TENTATIVI_RETENTION_DAYS ?? 180);
    await prisma.tentativo.update({
      where: { id: a!.tentativoId },
      data: { lastActivityAt: new Date(Date.now() - (giorni + 1) * 86_400_000) },
    });
    const b = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
  });

  // Il banner di ripresa (player) ha bisogno di sapere QUANDO il tentativo è
  // stato toccato l'ultima volta: senza questo campo non c'è nulla da
  // mostrare oltre "stai riprendendo qualcosa".
  it("avviaORiprendi espone il momento dell'ultima attività", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(t!.lastActivityAt).toBeInstanceOf(Date);
  });
});

describe("abbandonare un tentativo", () => {
  // Il cuore della funzionalità "ricomincia": lo stato del vecchio tentativo
  // diventa ABANDONED (mai COMPLETED — un sotto-progetto futuro conterà i
  // completamenti per stabilire se un compito è stato consegnato, e un
  // tentativo abbandonato non deve mai poter sembrare consegnato), e il primo
  // accesso successivo apre un tentativo nuovo con un seme diverso: la stessa
  // strada già presa da "dopo il completamento un nuovo accesso apre un
  // tentativo nuovo" qui sopra, non una scorciatoia nuova.
  it("marca il vecchio tentativo ABANDONED, mai COMPLETED, e il prossimo accesso ne apre uno nuovo con un altro seme", async () => {
    const a = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const r = await abbandona(a!.tentativoId, studentId);
    expect(r).toEqual({ ok: true });

    const rigaVecchia = await prisma.tentativo.findUnique({ where: { id: a!.tentativoId } });
    expect(rigaVecchia!.status).toBe("ABANDONED");
    expect(rigaVecchia!.status).not.toBe("COMPLETED");

    const b = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.seed).not.toBe(a!.seed);
    expect(b!.status).toBe("IN_PROGRESS");
  });

  it("il tentativo di un altro studente viene rifiutato, e resta intatto", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const r = await abbandona(t!.tentativoId, altroId);
    expect(r).toEqual({ ok: false, motivo: "non_tuo" });

    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.status).toBe("IN_PROGRESS");
  });

  it("un tentativo inesistente da' non_trovato", async () => {
    const r = await abbandona("non-esiste", studentId);
    expect(r).toEqual({ ok: false, motivo: "non_trovato" });
  });

  // La garanzia che conta di più per il conteggio futuro delle consegne: un
  // tentativo già COMPLETED non deve mai poter tornare indietro né essere
  // scambiato per un abbandono.
  it("un tentativo gia' completato non si abbandona, e resta COMPLETED", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    await completa(t!.tentativoId, studentId, "it");
    const r = await abbandona(t!.tentativoId, studentId);
    expect(r).toEqual({ ok: false, motivo: "gia_completato" });

    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.status).toBe("COMPLETED");
  });

  it("abbandonare due volte lo stesso tentativo resta idempotente", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID);
    const primo = await abbandona(t!.tentativoId, studentId);
    const secondo = await abbandona(t!.tentativoId, studentId);
    expect(primo).toEqual({ ok: true });
    expect(secondo).toEqual({ ok: true });

    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.status).toBe("ABANDONED");
  });
});
