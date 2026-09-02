/**
 * Orchestratore del cancello studenti: dato l'utente che sta entrando, decide
 * ruolo e classi. Le decisioni sono tenute in memoria per 60 s per email, per
 * evitare una seconda chiamata a Google nello stesso login e per passare il
 * risultato da `signIn` a `events.createUser` (utenti nuovi).
 */
import { getStudentGateConfig } from "@/lib/config/student-gate";
import { listUserGroups, GroupCheckError } from "@/lib/auth/google-groups";
import { classifyGroups, resolveRole, type ClassGroup, type ExistingRole } from "@/lib/auth/resolve-role";

export type GateDecision =
  | { allowed: true; role: "ADMIN" | "TEACHER" | "STUDENT"; classGroups?: ClassGroup[] }
  | { allowed: false; reason: "NotAllowed" | "GroupCheckFailed" };

const TTL_MS = 60_000;
const cache = new Map<string, { decision: GateDecision; expiresAt: number; existingRole: ExistingRole }>();

/** `mario@x.it` → `m***@x.it`, per non scrivere email in chiaro nei log. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function remember(email: string, existingRole: ExistingRole, decision: GateDecision): void {
  cache.set(email, { decision, expiresAt: Date.now() + TTL_MS, existingRole });
}

/** La decisione dipende anche dal ruolo in DB: un cambio di ruolo salta la cache. */
function peek(email: string, existingRole: ExistingRole): GateDecision | undefined {
  const hit = cache.get(email);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(email);
    return undefined;
  }
  if (hit.existingRole !== existingRole) return undefined;
  return hit.decision;
}

/**
 * Legge la decisione per l'email e la rimuove dalla cache. Usata da
 * events.createUser, cioè per utenti nuovi: il ruolo in DB non esisteva ancora,
 * quindi la voce è letta qualunque fosse il ruolo con cui è stata prodotta.
 */
export function takeDecision(email: string): GateDecision | undefined {
  const key = email.toLowerCase();
  const hit = cache.get(key);
  cache.delete(key);
  if (!hit || hit.expiresAt < Date.now()) return undefined;
  return hit.decision;
}

export function resetDecisionCacheForTests(): void {
  cache.clear();
}

export async function evaluateLogin(
  email: string,
  existingRole: ExistingRole,
  deps: { listGroups?: typeof listUserGroups } = {},
): Promise<GateDecision> {
  const key = email.toLowerCase();
  const cached = peek(key, existingRole);
  if (cached) return cached;

  const cfg = getStudentGateConfig();
  if (!cfg) return { allowed: true, role: existingRole ?? "TEACHER" };

  const listGroups = deps.listGroups ?? listUserGroups;
  let decision: GateDecision;
  try {
    const groups = await listGroups(key);
    const c = classifyGroups(groups, cfg);
    const role = resolveRole({
      existingRole,
      isStudent: c.isStudent,
      isTeacher: c.isTeacher,
      teacherGroupConfigured: cfg.teacherGroupEmail !== null,
    });
    decision = role === "DENY" ? { allowed: false, reason: "NotAllowed" } : { allowed: true, role, classGroups: c.classGroups };
  } catch (e) {
    if (!(e instanceof GroupCheckError)) throw e;
    console.warn(`[student-gate] verifica gruppi fallita per ${maskEmail(key)}: ${e.message}`);
    if (e.notFound) {
      // Account fuori dal Workspace: non è un guasto di Google, non entra.
      decision = { allowed: false, reason: "NotAllowed" };
    } else {
      decision = existingRole ? { allowed: true, role: existingRole } : { allowed: false, reason: "GroupCheckFailed" };
    }
  }

  remember(key, existingRole, decision);
  return decision;
}
