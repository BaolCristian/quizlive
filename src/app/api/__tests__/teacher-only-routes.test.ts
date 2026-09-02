// src/app/api/__tests__/teacher-only-routes.test.ts
// @vitest-environment node
/**
 * Ogni route docente deve rispondere 403 a uno STUDENT prima di toccare il DB.
 * prisma è un proxy che lancia: se una route lo tocca prima del controllo del
 * ruolo, il test fallisce con un messaggio chiaro.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "s1", role: "STUDENT", name: "S", email: "s@x.it" } })),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: new Proxy({}, { get: (_t, prop) => { throw new Error(`prisma.${String(prop)} toccato prima del controllo del ruolo`); } }),
}));

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Entry = { name: string; load: () => Promise<Record<string, unknown>>; methods: string[] };

const routes: Entry[] = [
  { name: "quiz", load: () => import("@/app/api/quiz/route"), methods: ["GET", "POST"] },
  { name: "quiz/[id]", load: () => import("@/app/api/quiz/[id]/route"), methods: ["GET", "PUT", "DELETE"] },
  { name: "quiz/[id]/export", load: () => import("@/app/api/quiz/[id]/export/route"), methods: ["GET"] },
  { name: "quiz/[id]/share", load: () => import("@/app/api/quiz/[id]/share/route"), methods: ["POST", "GET", "DELETE"] },
  { name: "quiz/duplicate", load: () => import("@/app/api/quiz/duplicate/route"), methods: ["POST"] },
  { name: "quiz/excel-import", load: () => import("@/app/api/quiz/excel-import/route"), methods: ["POST"] },
  { name: "quiz/excel-template", load: () => import("@/app/api/quiz/excel-template/route"), methods: ["GET"] },
  { name: "quiz/import", load: () => import("@/app/api/quiz/import/route"), methods: ["POST"] },
  { name: "quiz/moodle-import", load: () => import("@/app/api/quiz/moodle-import/route"), methods: ["POST"] },
  { name: "session", load: () => import("@/app/api/session/route"), methods: ["POST", "GET"] },
  { name: "session/[id]", load: () => import("@/app/api/session/[id]/route"), methods: ["PATCH", "DELETE"] },
  { name: "stats/export", load: () => import("@/app/api/stats/export/route"), methods: ["GET"] },
  { name: "upload", load: () => import("@/app/api/upload/route"), methods: ["POST"] },
  { name: "report", load: () => import("@/app/api/report/route"), methods: ["POST"] },
  { name: "consent", load: () => import("@/app/api/consent/route"), methods: ["POST"] },
  { name: "consent/check", load: () => import("@/app/api/consent/check/route"), methods: ["GET"] },
  { name: "image-search", load: () => import("@/app/api/image-search/route"), methods: ["GET"] },
  { name: "dashboard/hub/clone", load: () => import("@/app/api/dashboard/hub/clone/route"), methods: ["POST"] },
  { name: "hub/oauth/start", load: () => import("@/app/api/hub/oauth/start/route"), methods: ["GET"] },
  { name: "hub/oauth/callback", load: () => import("@/app/api/hub/oauth/callback/route"), methods: ["GET"] },
  { name: "hub/oauth/link", load: () => import("@/app/api/hub/oauth/link/route"), methods: ["DELETE"] },
  { name: "hub/quiz/[id]/publish", load: () => import("@/app/api/hub/quiz/[id]/publish/route"), methods: ["POST", "DELETE"] },
  { name: "installation/hub/connect", load: () => import("@/app/api/installation/hub/connect/route"), methods: ["POST"] },
];

describe("teacher-only routes reject STUDENT with 403", () => {
  for (const r of routes) {
    for (const m of r.methods) {
      it(`${m} /api/${r.name}`, async () => {
        const mod = await r.load();
        const handler = mod[m] as Handler;
        expect(typeof handler, `handler ${m} mancante in ${r.name}`).toBe("function");
        const req = new NextRequest(`http://localhost/api/${r.name}?q=x&sessionId=x`, { method: m });
        const res = await handler(req, { params: Promise.resolve({ id: "x", sessionId: "x" }) });
        expect(res.status).toBe(403);
      });
    }
  }
});
