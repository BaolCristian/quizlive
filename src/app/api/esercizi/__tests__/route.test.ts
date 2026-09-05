import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireStudent: vi.fn(),
}));
vi.mock("@/lib/esercizi/tentativo", () => ({
  applicaRisposta: vi.fn(),
  completa: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireStudent } from "@/lib/auth/require-role";
import { applicaRisposta } from "@/lib/esercizi/tentativo";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/tentativi/[id]/risposta/route";

const params = Promise.resolve({ id: "t1" });
const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/tentativi/t1/risposta", { method: "POST", body: JSON.stringify(body) });

const corpoValido = { partPath: "p0", answer: "2", state: { seed: "s", answered: false, submitted: 0,
  adviceDisplayed: false, revealed: false, score: 0, marks: 2, parts: [] } };

beforeEach(() => {
  vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST risposta", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(401);
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST(richiesta({ partPath: 42 }), { params });
    expect(r.status).toBe(400);
  });

  it("404 se il tentativo non esiste", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(404);
  });

  it("403 se il tentativo e' di un altro", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "non_tuo" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(403);
  });

  it("409 se gia' completato", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "gia_completato" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(409);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(429);
  });

  it("200 con il punteggio del server", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: true, score: 2, maxScore: 2, feedback: [] });
    const r = await POST(richiesta(corpoValido), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ score: 2, maxScore: 2, feedback: [] });
  });
});
