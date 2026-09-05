import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { applicaRisposta } from "@/lib/esercizi/tentativo";

const answerSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(answerSchema)]),
);

const bodySchema = z.object({
  partPath: z.string().min(1).max(32).regex(/^p\d+(g\d+)?$/),
  answer: answerSchema,
  state: z.object({
    seed: z.string(),
    answered: z.boolean(),
    submitted: z.number(),
    adviceDisplayed: z.boolean(),
    revealed: z.boolean(),
    score: z.number(),
    marks: z.number(),
    parts: z.array(z.unknown()),
  }),
});

const STATI: Record<string, number> = {
  non_trovato: 404, non_tuo: 403, gia_completato: 409, parte_sconosciuta: 400,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:risposta:${studentId}`, windowSeconds: 60, max: 120 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";
  const esito = await applicaRisposta(
    id, studentId, parsed.data.partPath, parsed.data.answer as never, parsed.data.state as never, locale,
  );

  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ score: esito.score, maxScore: esito.maxScore, feedback: esito.feedback });
}
