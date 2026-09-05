import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { completa } from "@/lib/esercizi/tentativo";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";
  const esito = await completa(id, gate.session.user.id, locale);

  if (!esito.ok) {
    return NextResponse.json({ error: esito.motivo }, { status: esito.motivo === "non_trovato" ? 404 : 403 });
  }
  return NextResponse.json({ score: esito.score, maxScore: esito.maxScore });
}
