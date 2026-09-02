/**
 * Controllo del ruolo per route API e layout server. Con le sessioni su
 * database il middleware non può leggere il ruolo: il controllo sta qui.
 */
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth/config";

export type RequireRoleResult = { ok: true; session: Session } | { ok: false; response: Response };

function unauthorized(): RequireRoleResult {
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

function forbidden(): RequireRoleResult {
  return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

/** Ammette TEACHER e ADMIN. */
export async function requireTeacher(): Promise<RequireRoleResult> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (session.user.role === "STUDENT") return forbidden();
  return { ok: true, session };
}

/** Ammette solo STUDENT. */
export async function requireStudent(): Promise<RequireRoleResult> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if (session.user.role !== "STUDENT") return forbidden();
  return { ok: true, session };
}

/** Per i layout: anonimo → /login, studente → /studente, altrimenti la sessione. */
export async function redirectUnlessTeacher(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "STUDENT") redirect("/studente");
  return session;
}
