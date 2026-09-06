import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { completa } from "@/lib/esercizi/tentativo";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;

  // La rotta sorella (`risposta`) aveva un tetto, questa no: eppure anche
  // qui ogni chiamata leggeva il tentativo e faceva girare l'intero motore
  // sul suo stato. Il tetto è più basso perché chiudere un tentativo è un
  // gesto raro, uno per esercizio.
  const limite = await checkRateLimit({ key: `esercizi:completa:${studentId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";
  const esito = await completa(id, studentId, locale);

  if (!esito.ok) {
    return NextResponse.json({ error: esito.motivo }, { status: esito.motivo === "non_trovato" ? 404 : 403 });
  }
  return NextResponse.json({ score: esito.score, maxScore: esito.maxScore });
}
