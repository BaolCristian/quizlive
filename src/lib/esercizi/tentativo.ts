import { randomUUID } from "crypto";
import type { Answer, QuestionState, MarkingResult, Locale } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { ricalcola } from "./marking";

export interface TentativoAperto {
  tentativoId: string;
  seed: string;
  content: unknown;
  state: QuestionState | null;
  score: number;
  maxScore: number;
  status: "IN_PROGRESS" | "COMPLETED";
}

/** Restituisce il tentativo in corso dello studente su quell'esercizio, o ne
 * apre uno nuovo sull'ultima versione. `null` se l'esercizio non esiste. */
export async function avviaORiprendi(studentId: string, esercizioId: string): Promise<TentativoAperto | null> {
  const versione = await prisma.esercizioVersione.findFirst({
    where: { esercizioId },
    orderBy: { version: "desc" },
  });
  if (!versione) return null;

  // Conservazione pigra, come per PracticeRun: un tentativo fermo da più della
  // finestra non si riprende, se ne apre uno nuovo. Nessun lavoro pianificato
  // in questo sotto-progetto.
  const giorni = Number(process.env.TENTATIVI_RETENTION_DAYS ?? 180);
  const sogliaAttivita = new Date(Date.now() - giorni * 86_400_000);

  const inCorso = await prisma.tentativo.findFirst({
    where: {
      studentId, esercizioVersioneId: versione.id, status: "IN_PROGRESS",
      lastActivityAt: { gte: sogliaAttivita },
    },
    orderBy: { startedAt: "desc" },
  });

  const t = inCorso ?? (await prisma.tentativo.create({
    data: { studentId, esercizioVersioneId: versione.id, seed: randomUUID() },
  }));

  return {
    tentativoId: t.id,
    seed: t.seed,
    content: versione.content,
    state: (t.state as QuestionState | null) ?? null,
    score: t.score,
    maxScore: t.maxScore,
    status: t.status,
  };
}

type EsitoRisposta =
  | { ok: true; score: number; maxScore: number; feedback: MarkingResult["feedback"] }
  | { ok: false; motivo: "non_trovato" | "non_tuo" | "gia_completato" | "parte_sconosciuta" };

/** Applica una risposta e riscrive il punteggio con quello che calcola il
 * server. Lo stato del client serve solo a ricostruire le risposte: i numeri
 * che dichiara non vengono mai copiati sul database.
 *
 * `_answer` non entra nel calcolo: è nella firma per rispecchiare la singola
 * risposta appena data dal punto di vista del chiamante (ed è quel che la
 * rotta HTTP riceve come campo separato), ma la ricostruzione lavora solo su
 * `statoClient` — la risposta che conta è quella già dentro
 * `statoClient.parts[].answer` al percorso `partPath`. Non verificare che i
 * due coincidano è deliberato: un disallineamento non può comunque gonfiare
 * il punteggio, perché quello lo ricalcola sempre `ricalcola()` dal seme del
 * tentativo, mai da un valore dichiarato dal client. */
export async function applicaRisposta(
  tentativoId: string,
  studentId: string,
  partPath: string,
  _answer: Answer,
  statoClient: QuestionState | null,
  locale: Locale,
): Promise<EsitoRisposta> {
  const t = await prisma.tentativo.findUnique({
    where: { id: tentativoId },
    include: { versione: true },
  });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };
  if (t.status === "COMPLETED") return { ok: false, motivo: "gia_completato" };

  const esito = ricalcola(t.versione.content, t.seed, statoClient, locale);
  const parte = esito.feedback.find((f) => f.path === partPath);
  if (!parte) return { ok: false, motivo: "parte_sconosciuta" };

  await prisma.tentativo.update({
    where: { id: t.id },
    data: { state: esito.state as object, score: esito.score, maxScore: esito.maxScore },
  });

  return { ok: true, score: esito.score, maxScore: esito.maxScore, feedback: parte.items };
}

/** Chiude il tentativo fissando il punteggio ricalcolato. */
export async function completa(
  tentativoId: string,
  studentId: string,
  locale: Locale,
): Promise<{ ok: true; score: number; maxScore: number } | { ok: false; motivo: "non_trovato" | "non_tuo" }> {
  const t = await prisma.tentativo.findUnique({ where: { id: tentativoId }, include: { versione: true } });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };

  const esito = ricalcola(t.versione.content, t.seed, (t.state as QuestionState | null) ?? null, locale);
  await prisma.tentativo.update({
    where: { id: t.id },
    data: {
      state: esito.state as object, score: esito.score, maxScore: esito.maxScore,
      status: "COMPLETED", completedAt: new Date(),
    },
  });
  return { ok: true, score: esito.score, maxScore: esito.maxScore };
}
