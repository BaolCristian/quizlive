import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "STUDENT" } })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { esercizio: { findMany: vi.fn() } } }));
// Il traduttore restituisce chiave e valori: così le asserzioni parlano di
// quale messaggio è stato scelto, non del testo italiano di quel messaggio.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { prisma } from "@/lib/db/client";
import StudentHomePage from "../page";

function esercizioCon(tentativi: unknown[]) {
  return [{
    id: "01-prova", title: "Prova", yearLevel: 1, topic: "algebra", difficulty: 2,
    versions: [{ id: "v1", version: 1, tentativi }],
  }];
}

beforeEach(() => {
  vi.mocked(prisma.esercizio.findMany).mockReset();
});

async function rendi() {
  render(await StudentHomePage());
}

describe("elenco degli esercizi dello studente", () => {
  // Onda finale, punto 6. L'elenco prendeva il tentativo più recente senza
  // guardarne lo stato: un tentativo CHIUSO veniva annunciato come "Tentativo
  // in corso", cosa che il dominio non prevede — `avviaORiprendi` riprende
  // solo quelli in corso, quindi toccando quella riga lo studente apre un
  // esercizio nuovo, non quello che l'etichetta gli prometteva.
  it("un tentativo completato non viene detto in corso", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(
      esercizioCon([{ status: "COMPLETED", score: 2, maxScore: 2 }]) as never,
    );
    await rendi();
    expect(screen.getByText(/^ultimoTentativo:/)).toBeInTheDocument();
    expect(screen.queryByText(/^tentativoInCorso/)).toBeNull();
  });

  // Il massimo lo scrive il server solo quando arriva la prima risposta:
  // fino ad allora la colonna vale zero, e la riga diceva "Tentativo in
  // corso: 0/0" — un massimo che nessun esercizio ha mai avuto.
  it("un tentativo appena aperto non mostra 0/0", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(
      esercizioCon([{ status: "IN_PROGRESS", score: 0, maxScore: 0 }]) as never,
    );
    await rendi();
    expect(screen.getByText("tentativoAperto")).toBeInTheDocument();
    expect(screen.queryByText(/0\/0/)).toBeNull();
  });

  it("un tentativo in corso con un massimo mostra il punteggio", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(
      esercizioCon([{ status: "IN_PROGRESS", score: 1, maxScore: 2 }]) as never,
    );
    await rendi();
    expect(screen.getByText(/^tentativoInCorso:.*"score":1.*"maxScore":2/)).toBeInTheDocument();
  });

  it("senza tentativi non si dice nulla del tentativo", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(esercizioCon([]) as never);
    await rendi();
    expect(screen.queryByText(/tentativo/i)).toBeNull();
    expect(screen.getByText("Prova")).toBeInTheDocument();
  });
});
