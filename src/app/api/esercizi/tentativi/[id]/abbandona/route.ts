import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { abbandona } from "@/lib/esercizi/tentativo";

// Un abbandono è un gesto raro quanto un completamento (uno per tentativo, e
// per di più dietro una conferma nel player): stesso tetto della rotta
// sorella `completa`, con una chiave propria perché sono due contatori
// indipendenti.
const STATI: Record<string, number> = { non_trovato: 404, non_tuo: 403, gia_completato: 409 };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:abbandona:${studentId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  // Nessun corpo da validare: l'unica cosa che conta è a chi appartiene
  // `id`, e quello lo controlla `abbandona` stessa (studentId dalla sessione,
  // mai da un campo che il chiamante potrebbe falsificare).
  const esito = await abbandona(id, studentId);

  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ ok: true });
}
