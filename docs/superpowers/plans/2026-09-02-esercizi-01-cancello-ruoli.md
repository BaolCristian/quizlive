# Esercizi 01 — Cancello e ruoli: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riconoscere gli studenti al login dai gruppi Google Workspace, dare loro il ruolo `STUDENT`, salvare i loro gruppi di classe, e impedire a uno studente qualsiasi accesso a dashboard, editor, pagine host e API docente, con un'area studente minima su cui atterrare.

**Architecture:** Un modulo di configurazione legge e valida le variabili d'ambiente una volta (fail loud all'avvio). Al login Google, un callback `signIn` di NextAuth chiama una volta l'Admin SDK (`groups.list?userKey`), classifica i gruppi con funzioni pure, decide il ruolo, aggiorna `User.role` e `User.classGroups`; per gli utenti nuovi il risultato passa a `events.createUser` tramite una cache in memoria. L'enforcement sta in un helper `require-role.ts` usato dai layout server e da tutte le route API docente, perché con le sessioni su database il middleware non può leggere il ruolo.

**Tech Stack:** Next.js 16 App Router, NextAuth 5.0.0-beta.30 (Auth.js), Prisma 6 + PostgreSQL, `google-auth-library` (nuova dipendenza), Vitest 3, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-02-esercizi-01-cancello-ruoli-design.md` (programma: `docs/superpowers/specs/2026-09-02-savint-esercizi-programma-design.md`)

## Global Constraints

- Il cancello è attivo solo in modalità installazione (`SAVINT_MODE` diverso da `hub`) e solo se è impostata `STUDENT_GROUP_EMAIL` **o** `CLASS_GROUP_PATTERN`. Se non è attivo, **nessun comportamento cambia** per le installazioni esistenti.
- Se il cancello è attivo e mancano `GOOGLE_SA_KEY_FILE` o `GOOGLE_ADMIN_IMPERSONATE`, o `CLASS_GROUP_PATTERN` non compila o non contiene la cattura `(?<name>`, il server **non parte** e stampa un messaggio esplicito.
- Ruoli: `ADMIN` non è mai retrocesso; il gruppo docenti vince sul gruppo studenti; senza gruppo docenti configurato chi non è studente è docente.
- Una sola chiamata a Google per login, timeout 5 s, cache in memoria per email con TTL 60 s.
- Errore Google: utente esistente entra con il ruolo salvato; utente nuovo è rimandato a `/login?error=GroupCheckFailed`.
- Le route pubbliche restano pubbliche: `/api/public/**`, `/api/emoticons`, `/api/locale`, `/api/image-proxy`, `/api/uploads/**`, `/api/auth/**`, `/api/hub/practice/**`, `/api/hub/oauth/token`, `/api/hub/oauth/revoke` (server-to-server), Socket.io `joinSession`/`rejoinSession`, `/join`, `/practice/[quizId]`.
- Tutti i redirect costruiti a mano usano `BASE_PATH` (da `@/lib/base-path`), perché le installazioni possono girare sotto un prefisso (es. `/savint`).
- Testi utente in italiano e inglese in `src/messages/it.json` e `src/messages/en.json`.
- Comandi: test `npx vitest run <file>`, lint `npm run lint`, build `npm run build`, migrazioni `npx prisma migrate dev --name <nome>`.
- Ogni commit termina con le due righe di attribuzione usate nel repo:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611`.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `prisma/schema.prisma` (modifica) | `Role.STUDENT`, `User.classGroups Json?` |
| `prisma/seed.ts` (modifica) | studente demo `studente@scuola.it` |
| `src/types/next-auth.d.ts` (modifica) | tipo del ruolo in sessione |
| `src/lib/config/student-gate.ts` (nuovo) | lettura e validazione della configurazione del cancello |
| `src/lib/auth/resolve-role.ts` (nuovo) | funzioni pure `classifyGroups` e `resolveRole` |
| `src/lib/auth/google-groups.ts` (nuovo) | client Admin SDK: `listUserGroups` |
| `src/lib/auth/student-gate.ts` (nuovo) | orchestratore `evaluateLogin` + cache decisioni per email |
| `src/lib/auth/gate-callbacks.ts` (nuovo) | `signInWithGate` e `onUserCreated`, testabili senza NextAuth |
| `src/lib/auth/config.ts` (modifica) | aggancia i callback, propaga `STUDENT` |
| `src/lib/auth/require-role.ts` (nuovo) | `requireTeacher`, `requireStudent`, `redirectUnlessTeacher` |
| `src/server.ts` (modifica) | validazione configurazione all'avvio |
| `src/app/(auth)/login/page.tsx` (modifica) | messaggi di errore `NotAllowed`, `GroupCheckFailed` |
| `src/app/(dashboard)/layout.tsx`, `src/app/(editor)/layout.tsx`, `src/app/(app)/account/hub-link/page.tsx`, `src/app/(live)/live/host/[sessionId]/page.tsx`, `src/app/(live)/live/test/[sessionId]/page.tsx` (modifica) | redirect degli studenti |
| 23 route API (modifica, elenco nei Task 10–12) | 403 agli studenti |
| `src/app/(student)/studente/layout.tsx`, `page.tsx`, `src/components/student/student-header.tsx` (nuovi) | area studente minima |
| `src/messages/it.json`, `src/messages/en.json` (modifica) | testi |
| `.env.example`, `docker/.env.example`, `docker/docker-compose.yml`, `docker/setup.sh`, `.gitignore`, `docker/README.md`, `DEPLOY-GUIDA.md`, `README.it.md`, `README.md` (modifica) | configurazione e guida |

---

### Task 1: Schema Prisma, tipi e studente demo

**Files:**
- Modify: `prisma/schema.prisma` (enum `Role` alla riga 10, model `User` alla riga 90)
- Create: `prisma/migrations/<timestamp>_student_role_and_class_groups/migration.sql` (generata)
- Modify: `src/types/next-auth.d.ts`
- Modify: `prisma/seed.ts` (dopo la creazione dell'admin, riga 31)
- Test: `src/lib/auth/__tests__/student-role-schema.test.ts`

**Interfaces:**
- Produces: `Role.STUDENT` in `@prisma/client`; `User.classGroups: Prisma.JsonValue | null`; `Session["user"]["role"]: "TEACHER" | "ADMIN" | "STUDENT"`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// src/lib/auth/__tests__/student-role-schema.test.ts
import { describe, it, expect } from "vitest";
import { Prisma, Role } from "@prisma/client";

describe("Student role schema", () => {
  it("exposes Role.STUDENT", () => {
    expect(Role.STUDENT).toBe("STUDENT");
  });

  it("User has a classGroups field", () => {
    const fields = Prisma.dmmf.datamodel.models.find((m) => m.name === "User")!.fields.map((f) => f.name);
    expect(fields).toContain("classGroups");
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/auth/__tests__/student-role-schema.test.ts`
Expected: FAIL (`Role.STUDENT` è `undefined`, `classGroups` assente).

- [ ] **Step 3: Modifica lo schema**

In `prisma/schema.prisma`:

```prisma
enum Role {
  TEACHER
  ADMIN
  STUDENT
}
```

Nel model `User`, dopo `createdAt     DateTime  @default(now())`:

```prisma
  // Gruppi Google di classe letti all'ultimo login (vedi spec Esercizi 01).
  // Array di { email, name, yearLevel } — null se il cancello non è attivo.
  classGroups   Json?
```

- [ ] **Step 4: Genera la migrazione**

Run: `npx prisma migrate dev --name student_role_and_class_groups`
Expected: cartella `prisma/migrations/<timestamp>_student_role_and_class_groups/` con `ALTER TYPE "Role" ADD VALUE 'STUDENT'` e `ALTER TABLE "User" ADD COLUMN "classGroups" JSONB`. Il client Prisma viene rigenerato.

- [ ] **Step 5: Aggiorna il tipo di sessione**

```ts
// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "TEACHER" | "ADMIN" | "STUDENT";
    } & DefaultSession["user"];
  }
}
```

- [ ] **Step 6: Aggiungi lo studente demo al seed**

In `prisma/seed.ts`, dopo `console.log("Created admin:", admin.email);`:

```ts
  // Demo student: in dev/demo (login per email senza gruppo Google) permette di
  // provare l'area studente e l'enforcement senza configurare il Workspace.
  const student = await prisma.user.upsert({
    where: { email: "studente@scuola.it" },
    update: { role: Role.STUDENT },
    create: {
      email: "studente@scuola.it",
      name: "Studente Demo",
      role: Role.STUDENT,
      googleId: "demo-student-google-id",
      classGroups: [{ email: "allievi.2sia4.0@scuola.it", name: "2SIA4.0", yearLevel: 2 }],
    },
  });

  console.log("Created student:", student.email);
```

- [ ] **Step 7: Esegui test, seed e lint**

Run: `npx vitest run src/lib/auth/__tests__/student-role-schema.test.ts && npx prisma db seed && npm run lint`
Expected: test PASS; il seed stampa `Created student: studente@scuola.it`; lint senza errori.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/types/next-auth.d.ts src/lib/auth/__tests__/student-role-schema.test.ts
git commit -m "feat(auth): ruolo STUDENT, User.classGroups e studente demo"
```

---

### Task 2: Configurazione del cancello (fail loud)

**Files:**
- Create: `src/lib/config/student-gate.ts`
- Modify: `src/server.ts` (prima di `app.prepare()`)
- Test: `src/lib/config/__tests__/student-gate.test.ts`

**Interfaces:**
- Produces:

```ts
export interface StudentGateConfig {
  studentGroupEmail: string | null;   // minuscolo
  teacherGroupEmail: string | null;   // minuscolo
  classGroupPattern: RegExp | null;   // contiene la cattura (?<name>...)
  serviceAccountKeyFile: string;
  adminImpersonate: string;
}
export function readStudentGateConfig(env?: Record<string, string | undefined>): StudentGateConfig | null; // null = disattivo
export function getStudentGateConfig(): StudentGateConfig | null;   // memoizzata su process.env
export function isStudentGateEnabled(): boolean;
export function assertStudentGateConfig(): void;                    // lancia se mal configurato
export function resetStudentGateConfigForTests(): void;
```

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// src/lib/config/__tests__/student-gate.test.ts
import { describe, it, expect } from "vitest";
import { readStudentGateConfig } from "../student-gate";

const base = {
  GOOGLE_SA_KEY_FILE: "/run/secrets/google-sa-key.json",
  GOOGLE_ADMIN_IMPERSONATE: "admin@scuola.edu.it",
};

describe("readStudentGateConfig", () => {
  it("is disabled when neither STUDENT_GROUP_EMAIL nor CLASS_GROUP_PATTERN is set", () => {
    expect(readStudentGateConfig({})).toBeNull();
    expect(readStudentGateConfig({ STUDENT_GROUP_EMAIL: "  " })).toBeNull();
  });

  it("is disabled in hub mode even if configured", () => {
    expect(
      readStudentGateConfig({ ...base, SAVINT_MODE: "hub", STUDENT_GROUP_EMAIL: "studenti@scuola.edu.it" }),
    ).toBeNull();
  });

  it("enables with the student group only, lowercasing emails", () => {
    const cfg = readStudentGateConfig({ ...base, STUDENT_GROUP_EMAIL: "Studenti@Scuola.edu.it" });
    expect(cfg).not.toBeNull();
    expect(cfg!.studentGroupEmail).toBe("studenti@scuola.edu.it");
    expect(cfg!.teacherGroupEmail).toBeNull();
    expect(cfg!.classGroupPattern).toBeNull();
  });

  it("enables with the class pattern only and compiles it", () => {
    const cfg = readStudentGateConfig({
      ...base,
      CLASS_GROUP_PATTERN: String.raw`^allievi\.(?<name>[^@]+)@paolosarpi\.edu\.it$`,
    });
    expect(cfg!.classGroupPattern).toBeInstanceOf(RegExp);
    expect("allievi.2sia4.0@paolosarpi.edu.it".match(cfg!.classGroupPattern!)!.groups!.name).toBe("2sia4.0");
  });

  it("throws when enabled without the service account key file", () => {
    expect(() =>
      readStudentGateConfig({ GOOGLE_ADMIN_IMPERSONATE: "a@b.it", STUDENT_GROUP_EMAIL: "s@b.it" }),
    ).toThrow(/GOOGLE_SA_KEY_FILE/);
  });

  it("throws when enabled without the admin to impersonate", () => {
    expect(() =>
      readStudentGateConfig({ GOOGLE_SA_KEY_FILE: "/k.json", STUDENT_GROUP_EMAIL: "s@b.it" }),
    ).toThrow(/GOOGLE_ADMIN_IMPERSONATE/);
  });

  it("throws when the pattern does not compile", () => {
    expect(() => readStudentGateConfig({ ...base, CLASS_GROUP_PATTERN: "(" })).toThrow(/CLASS_GROUP_PATTERN/);
  });

  it("throws when the pattern has no (?<name>) capture", () => {
    expect(() => readStudentGateConfig({ ...base, CLASS_GROUP_PATTERN: "^allievi\\..+$" })).toThrow(/\(\?<name>/);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/config/__tests__/student-gate.test.ts`
Expected: FAIL, modulo `../student-gate` inesistente.

- [ ] **Step 3: Implementa il modulo**

```ts
// src/lib/config/student-gate.ts
/**
 * Configurazione del "cancello studenti": riconoscimento del ruolo e delle
 * classi dai gruppi Google Workspace (spec: Esercizi 01 — Cancello e ruoli).
 *
 * Il cancello è attivo solo in modalità installazione e solo se è impostata
 * STUDENT_GROUP_EMAIL oppure CLASS_GROUP_PATTERN. Se attivo, chiave del service
 * account e admin da impersonare sono obbligatori: in caso contrario si lancia
 * un errore, così un'installazione mal configurata non parte.
 */

export interface StudentGateConfig {
  studentGroupEmail: string | null;
  teacherGroupEmail: string | null;
  classGroupPattern: RegExp | null;
  serviceAccountKeyFile: string;
  adminImpersonate: string;
}

type Env = Record<string, string | undefined>;

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function readStudentGateConfig(env: Env = process.env): StudentGateConfig | null {
  if (env.SAVINT_MODE === "hub") return null;

  const studentGroupEmail = clean(env.STUDENT_GROUP_EMAIL)?.toLowerCase() ?? null;
  const teacherGroupEmail = clean(env.TEACHER_GROUP_EMAIL)?.toLowerCase() ?? null;
  const patternSource = clean(env.CLASS_GROUP_PATTERN);

  if (!studentGroupEmail && !patternSource) return null;

  const serviceAccountKeyFile = clean(env.GOOGLE_SA_KEY_FILE);
  if (!serviceAccountKeyFile) {
    throw new Error(
      "Cancello studenti attivo ma GOOGLE_SA_KEY_FILE non è impostata: serve il percorso del JSON del service account (vedi DEPLOY-GUIDA.md, sezione 'Riconoscimento studenti e classi').",
    );
  }
  const adminImpersonate = clean(env.GOOGLE_ADMIN_IMPERSONATE)?.toLowerCase();
  if (!adminImpersonate) {
    throw new Error(
      "Cancello studenti attivo ma GOOGLE_ADMIN_IMPERSONATE non è impostata: serve l'email di un account del Workspace con ruolo 'Lettore gruppi'.",
    );
  }

  let classGroupPattern: RegExp | null = null;
  if (patternSource) {
    if (!patternSource.includes("(?<name>")) {
      throw new Error(
        "CLASS_GROUP_PATTERN deve contenere un gruppo di cattura (?<name>...) per il nome della classe, es. ^allievi\\.(?<name>[^@]+)@scuola\\.edu\\.it$",
      );
    }
    try {
      classGroupPattern = new RegExp(patternSource, "i");
    } catch (e) {
      throw new Error(`CLASS_GROUP_PATTERN non è un'espressione regolare valida: ${(e as Error).message}`);
    }
  }

  return { studentGroupEmail, teacherGroupEmail, classGroupPattern, serviceAccountKeyFile, adminImpersonate };
}

let memo: StudentGateConfig | null | undefined;

export function getStudentGateConfig(): StudentGateConfig | null {
  if (memo === undefined) memo = readStudentGateConfig(process.env);
  return memo;
}

export function isStudentGateEnabled(): boolean {
  return getStudentGateConfig() !== null;
}

/** Da chiamare all'avvio del server: lancia se la configurazione è incoerente. */
export function assertStudentGateConfig(): void {
  const cfg = getStudentGateConfig();
  if (cfg) {
    console.log(
      `> Cancello studenti attivo (gruppo studenti: ${cfg.studentGroupEmail ?? "-"}, gruppo docenti: ${cfg.teacherGroupEmail ?? "-"}, pattern classi: ${cfg.classGroupPattern ? "sì" : "no"})`,
    );
  }
}

export function resetStudentGateConfigForTests(): void {
  memo = undefined;
}
```

- [ ] **Step 4: Valida all'avvio del server**

In `src/server.ts`, dopo `import type { ServerToClientEvents, ClientToServerEvents } from "./types";` aggiungi:

```ts
import { assertStudentGateConfig } from "./lib/config/student-gate";
```

e subito prima di `app.prepare().then(() => {`:

```ts
// Fail loud: una configurazione incoerente del cancello studenti ferma l'avvio.
assertStudentGateConfig();
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/config/__tests__/student-gate.test.ts && npm run lint`
Expected: 8 test PASS; lint pulito.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config/student-gate.ts src/lib/config/__tests__/student-gate.test.ts src/server.ts
git commit -m "feat(auth): configurazione del cancello studenti con validazione all'avvio"
```

---

### Task 3: Funzioni pure `classifyGroups` e `resolveRole`

**Files:**
- Create: `src/lib/auth/resolve-role.ts`
- Test: `src/lib/auth/__tests__/resolve-role.test.ts`

**Interfaces:**
- Consumes: `StudentGateConfig` (Task 2), solo i campi `studentGroupEmail`, `teacherGroupEmail`, `classGroupPattern`.
- Produces:

```ts
export interface GoogleGroupRef { email: string; name?: string }
export interface ClassGroup { email: string; name: string; yearLevel: number | null }
export interface GroupClassification { isStudent: boolean; isTeacher: boolean; classGroups: ClassGroup[] }
export type GroupRules = Pick<StudentGateConfig, "studentGroupEmail" | "teacherGroupEmail" | "classGroupPattern">;
export function classifyGroups(groups: GoogleGroupRef[], rules: GroupRules): GroupClassification;

export type ExistingRole = "ADMIN" | "TEACHER" | "STUDENT" | null;
export type ResolvedRole = "ADMIN" | "TEACHER" | "STUDENT" | "DENY";
export function resolveRole(input: { existingRole: ExistingRole; isStudent: boolean; isTeacher: boolean; teacherGroupConfigured: boolean }): ResolvedRole;
```

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// src/lib/auth/__tests__/resolve-role.test.ts
import { describe, it, expect } from "vitest";
import { classifyGroups, resolveRole } from "../resolve-role";

const pattern = new RegExp(String.raw`^allievi\.(?<name>[^@]+)@paolosarpi\.edu\.it$`, "i");
const rules = {
  studentGroupEmail: "studenti@paolosarpi.edu.it",
  teacherGroupEmail: "docenti@paolosarpi.edu.it",
  classGroupPattern: pattern,
};

describe("classifyGroups", () => {
  it("recognises the generic student group (case-insensitive)", () => {
    const c = classifyGroups([{ email: "Studenti@PaoloSarpi.edu.it" }], rules);
    expect(c).toEqual({ isStudent: true, isTeacher: false, classGroups: [] });
  });

  it("recognises a class group alone as student, with uppercase name and year", () => {
    const c = classifyGroups([{ email: "allievi.2sia4.0@paolosarpi.edu.it", name: "2 SIA 4.0" }], rules);
    expect(c.isStudent).toBe(true);
    expect(c.classGroups).toEqual([{ email: "allievi.2sia4.0@paolosarpi.edu.it", name: "2SIA4.0", yearLevel: 2 }]);
  });

  it("keeps class groups for a teacher too", () => {
    const c = classifyGroups(
      [{ email: "docenti@paolosarpi.edu.it" }, { email: "allievi.5a@paolosarpi.edu.it" }],
      rules,
    );
    expect(c.isTeacher).toBe(true);
    expect(c.isStudent).toBe(true);
    expect(c.classGroups.map((g) => g.name)).toEqual(["5A"]);
  });

  it("yields no year when the class name does not start with 1-5", () => {
    const c = classifyGroups([{ email: "allievi.serale@paolosarpi.edu.it" }], rules);
    expect(c.classGroups[0]).toEqual({ email: "allievi.serale@paolosarpi.edu.it", name: "SERALE", yearLevel: null });
  });

  it("ignores class groups when no pattern is configured", () => {
    const c = classifyGroups([{ email: "allievi.2sia4.0@paolosarpi.edu.it" }], { ...rules, classGroupPattern: null });
    expect(c).toEqual({ isStudent: false, isTeacher: false, classGroups: [] });
  });

  it("returns nothing for unrelated groups", () => {
    const c = classifyGroups([{ email: "segreteria@paolosarpi.edu.it" }], rules);
    expect(c).toEqual({ isStudent: false, isTeacher: false, classGroups: [] });
  });
});

describe("resolveRole", () => {
  const cases: Array<[Parameters<typeof resolveRole>[0], ReturnType<typeof resolveRole>]> = [
    [{ existingRole: "ADMIN", isStudent: true, isTeacher: false, teacherGroupConfigured: true }, "ADMIN"],
    [{ existingRole: null, isStudent: true, isTeacher: true, teacherGroupConfigured: true }, "TEACHER"],
    [{ existingRole: "TEACHER", isStudent: true, isTeacher: false, teacherGroupConfigured: true }, "STUDENT"],
    [{ existingRole: null, isStudent: true, isTeacher: false, teacherGroupConfigured: false }, "STUDENT"],
    [{ existingRole: null, isStudent: false, isTeacher: false, teacherGroupConfigured: true }, "DENY"],
    [{ existingRole: "TEACHER", isStudent: false, isTeacher: false, teacherGroupConfigured: true }, "DENY"],
    [{ existingRole: null, isStudent: false, isTeacher: false, teacherGroupConfigured: false }, "TEACHER"],
    [{ existingRole: "STUDENT", isStudent: false, isTeacher: false, teacherGroupConfigured: false }, "TEACHER"],
  ];
  it.each(cases)("resolveRole(%o) → %s", (input, expected) => {
    expect(resolveRole(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/auth/__tests__/resolve-role.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 3: Implementa**

```ts
// src/lib/auth/resolve-role.ts
import type { StudentGateConfig } from "@/lib/config/student-gate";

export interface GoogleGroupRef {
  email: string;
  name?: string;
}

export interface ClassGroup {
  email: string;
  name: string;
  yearLevel: number | null;
}

export interface GroupClassification {
  isStudent: boolean;
  isTeacher: boolean;
  classGroups: ClassGroup[];
}

export type GroupRules = Pick<StudentGateConfig, "studentGroupEmail" | "teacherGroupEmail" | "classGroupPattern">;

/** Anno di corso = prima cifra del nome classe se è tra 1 e 5, altrimenti null. */
function yearLevelFromName(name: string): number | null {
  const d = name.charAt(0);
  return d >= "1" && d <= "5" ? Number(d) : null;
}

/**
 * Classifica i gruppi Google di un utente (membership dirette) secondo le regole
 * configurate. Le email sono confrontate senza distinzione di maiuscole.
 */
export function classifyGroups(groups: GoogleGroupRef[], rules: GroupRules): GroupClassification {
  let isStudent = false;
  let isTeacher = false;
  const classGroups: ClassGroup[] = [];

  for (const g of groups) {
    const email = g.email.trim().toLowerCase();
    if (rules.studentGroupEmail && email === rules.studentGroupEmail) isStudent = true;
    if (rules.teacherGroupEmail && email === rules.teacherGroupEmail) isTeacher = true;
    if (rules.classGroupPattern) {
      const m = email.match(rules.classGroupPattern);
      const raw = m?.groups?.name;
      if (raw) {
        const name = raw.toUpperCase();
        classGroups.push({ email, name, yearLevel: yearLevelFromName(name) });
        isStudent = true;
      }
    }
  }

  return { isStudent, isTeacher, classGroups };
}

export type ExistingRole = "ADMIN" | "TEACHER" | "STUDENT" | null;
export type ResolvedRole = "ADMIN" | "TEACHER" | "STUDENT" | "DENY";

/** Regole della spec, in ordine. */
export function resolveRole(input: {
  existingRole: ExistingRole;
  isStudent: boolean;
  isTeacher: boolean;
  teacherGroupConfigured: boolean;
}): ResolvedRole {
  if (input.existingRole === "ADMIN") return "ADMIN";
  if (input.isTeacher) return "TEACHER";
  if (input.isStudent) return "STUDENT";
  if (input.teacherGroupConfigured) return "DENY";
  return "TEACHER";
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/auth/__tests__/resolve-role.test.ts`
Expected: 14 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/resolve-role.ts src/lib/auth/__tests__/resolve-role.test.ts
git commit -m "feat(auth): classificazione gruppi Google e regola del ruolo"
```

---

### Task 4: Client Admin SDK `listUserGroups`

**Files:**
- Modify: `package.json` (dipendenza `google-auth-library`)
- Create: `src/lib/auth/google-groups.ts`
- Test: `src/lib/auth/__tests__/google-groups.test.ts`

**Interfaces:**
- Consumes: `getStudentGateConfig()` (Task 2) per `serviceAccountKeyFile` e `adminImpersonate`.
- Produces:

```ts
export class GroupCheckError extends Error { readonly cause?: unknown }
export interface GoogleGroup { email: string; name: string }
export interface ListUserGroupsOptions { fetchImpl?: typeof fetch; tokenProvider?: () => Promise<string>; timeoutMs?: number }
export async function listUserGroups(userEmail: string, opts?: ListUserGroupsOptions): Promise<GoogleGroup[]>;
```

- [ ] **Step 1: Installa la dipendenza**

Run: `npm install google-auth-library`
Expected: `package.json` e `package-lock.json` aggiornati; nessun errore.

- [ ] **Step 2: Scrivi i test che falliscono**

```ts
// src/lib/auth/__tests__/google-groups.test.ts
import { describe, it, expect, vi } from "vitest";
import { listUserGroups, GroupCheckError } from "../google-groups";

const token = async () => "tok";

function fetchReturning(pages: Array<{ groups?: unknown[]; nextPageToken?: string }>, status = 200) {
  let i = 0;
  return vi.fn(async (url: string | URL | Request) => {
    const body = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("listUserGroups", () => {
  it("returns email and name of each group, following pagination", async () => {
    const fetchImpl = fetchReturning([
      { groups: [{ email: "Studenti@X.it", name: "Studenti" }], nextPageToken: "p2" },
      { groups: [{ email: "allievi.2sia4.0@x.it", name: "2 SIA 4.0" }] },
    ]);
    const groups = await listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token });
    expect(groups).toEqual([
      { email: "studenti@x.it", name: "Studenti" },
      { email: "allievi.2sia4.0@x.it", name: "2 SIA 4.0" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstUrl = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(firstUrl).toContain("userKey=mario%40x.it");
    const secondUrl = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0]);
    expect(secondUrl).toContain("pageToken=p2");
  });

  it("sends the bearer token", async () => {
    const fetchImpl = fetchReturning([{ groups: [] }]);
    await listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });

  it("returns [] when the user has no groups", async () => {
    const fetchImpl = fetchReturning([{}]);
    expect(await listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token })).toEqual([]);
  });

  it("throws GroupCheckError on non-2xx responses", async () => {
    const fetchImpl = fetchReturning([{ error: { message: "nope" } }], 403);
    await expect(listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token })).rejects.toBeInstanceOf(GroupCheckError);
  });

  it("throws GroupCheckError when fetch rejects (network)", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    await expect(listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token })).rejects.toBeInstanceOf(GroupCheckError);
  });

  it("throws GroupCheckError on timeout", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    ) as unknown as typeof fetch;
    await expect(
      listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token, timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(GroupCheckError);
  });

  it("throws GroupCheckError when the token provider fails", async () => {
    const fetchImpl = fetchReturning([{ groups: [] }]);
    await expect(
      listUserGroups("mario@x.it", { fetchImpl, tokenProvider: async () => { throw new Error("bad key"); } }),
    ).rejects.toBeInstanceOf(GroupCheckError);
  });
});
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/auth/__tests__/google-groups.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 4: Implementa**

```ts
// src/lib/auth/google-groups.ts
/**
 * Client minimale dell'Admin SDK Directory API per elencare i gruppi Google
 * di cui un utente è membro diretto. Autenticazione: service account con
 * delega a livello di dominio che impersona un account "Lettore gruppi".
 */
import { JWT } from "google-auth-library";
import { getStudentGateConfig } from "@/lib/config/student-gate";

const SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly";
const DIRECTORY_GROUPS_URL = "https://admin.googleapis.com/admin/directory/v1/groups";
const DEFAULT_TIMEOUT_MS = 5000;

export class GroupCheckError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GroupCheckError";
    this.cause = cause;
  }
}

export interface GoogleGroup {
  email: string;
  name: string;
}

export interface ListUserGroupsOptions {
  fetchImpl?: typeof fetch;
  tokenProvider?: () => Promise<string>;
  timeoutMs?: number;
}

let jwtClient: JWT | null = null;

/** Access token del service account (impersonando l'admin). Memoizza il client. */
async function defaultTokenProvider(): Promise<string> {
  const cfg = getStudentGateConfig();
  if (!cfg) throw new Error("Cancello studenti non attivo");
  if (!jwtClient) {
    jwtClient = new JWT({ keyFile: cfg.serviceAccountKeyFile, scopes: [SCOPE], subject: cfg.adminImpersonate });
  }
  const { token } = await jwtClient.getAccessToken();
  if (!token) throw new Error("Nessun access token ottenuto dal service account");
  return token;
}

interface GroupsPage {
  groups?: Array<{ email?: string; name?: string }>;
  nextPageToken?: string;
}

export async function listUserGroups(userEmail: string, opts: ListUserGroupsOptions = {}): Promise<GoogleGroup[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenProvider = opts.tokenProvider ?? defaultTokenProvider;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let token: string;
  try {
    token = await tokenProvider();
  } catch (e) {
    throw new GroupCheckError("Impossibile ottenere il token del service account Google", e);
  }

  const result: GoogleGroup[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(DIRECTORY_GROUPS_URL);
    url.searchParams.set("userKey", userEmail);
    url.searchParams.set("maxResults", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let page: GroupsPage;
    try {
      const res = await fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new GroupCheckError(`Admin SDK ha risposto ${res.status}: ${text.slice(0, 200)}`);
      }
      page = (await res.json()) as GroupsPage;
    } catch (e) {
      if (e instanceof GroupCheckError) throw e;
      throw new GroupCheckError("Chiamata all'Admin SDK fallita", e);
    } finally {
      clearTimeout(timer);
    }

    for (const g of page.groups ?? []) {
      if (g.email) result.push({ email: g.email.toLowerCase(), name: g.name ?? "" });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return result;
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/auth/__tests__/google-groups.test.ts && npm run lint`
Expected: 7 test PASS; lint pulito.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/auth/google-groups.ts src/lib/auth/__tests__/google-groups.test.ts
git commit -m "feat(auth): client Admin SDK per i gruppi Google dell'utente"
```

---

### Task 5: Orchestratore `evaluateLogin` con cache per email

**Files:**
- Create: `src/lib/auth/student-gate.ts`
- Test: `src/lib/auth/__tests__/student-gate.test.ts`

**Interfaces:**
- Consumes: `listUserGroups` (Task 4), `classifyGroups`/`resolveRole` (Task 3), `getStudentGateConfig` (Task 2).
- Produces:

```ts
export type GateDecision =
  | { allowed: true; role: "ADMIN" | "TEACHER" | "STUDENT"; classGroups?: ClassGroup[] } // classGroups assente = non toccare il valore salvato
  | { allowed: false; reason: "NotAllowed" | "GroupCheckFailed" };
export async function evaluateLogin(email: string, existingRole: ExistingRole, deps?: { listGroups?: typeof listUserGroups }): Promise<GateDecision>;
export function takeDecision(email: string): GateDecision | undefined;   // legge e rimuove dalla cache
export function resetDecisionCacheForTests(): void;
```

- [ ] **Step 1: Scrivi i test che falliscano**

```ts
// src/lib/auth/__tests__/student-gate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config/student-gate", () => ({
  getStudentGateConfig: vi.fn(),
}));

import { getStudentGateConfig } from "@/lib/config/student-gate";
import { GroupCheckError } from "../google-groups";
import { evaluateLogin, takeDecision, resetDecisionCacheForTests } from "../student-gate";

const cfg = {
  studentGroupEmail: "studenti@x.it",
  teacherGroupEmail: "docenti@x.it",
  classGroupPattern: new RegExp(String.raw`^allievi\.(?<name>[^@]+)@x\.it$`, "i"),
  serviceAccountKeyFile: "/k.json",
  adminImpersonate: "admin@x.it",
};

beforeEach(() => {
  resetDecisionCacheForTests();
  (getStudentGateConfig as ReturnType<typeof vi.fn>).mockReturnValue(cfg);
});

describe("evaluateLogin", () => {
  it("new student in a class group → STUDENT with classGroups, and the decision is cached", async () => {
    const listGroups = vi.fn(async () => [{ email: "allievi.2sia4.0@x.it", name: "2 SIA 4.0" }]);
    const d = await evaluateLogin("Mario@X.it", null, { listGroups });
    expect(d).toEqual({
      allowed: true,
      role: "STUDENT",
      classGroups: [{ email: "allievi.2sia4.0@x.it", name: "2SIA4.0", yearLevel: 2 }],
    });
    expect(listGroups).toHaveBeenCalledWith("mario@x.it");
    expect(takeDecision("mario@x.it")).toEqual(d);
    expect(takeDecision("mario@x.it")).toBeUndefined(); // consumata
  });

  it("new teacher → TEACHER with empty classGroups", async () => {
    const listGroups = vi.fn(async () => [{ email: "docenti@x.it", name: "Docenti" }]);
    expect(await evaluateLogin("prof@x.it", null, { listGroups })).toEqual({ allowed: true, role: "TEACHER", classGroups: [] });
  });

  it("existing teacher now only in a class group → STUDENT (demotion)", async () => {
    const listGroups = vi.fn(async () => [{ email: "allievi.5a@x.it", name: "5A" }]);
    const d = await evaluateLogin("ex@x.it", "TEACHER", { listGroups });
    expect(d.allowed && d.role).toBe("STUDENT");
  });

  it("in no group with teacher group configured → NotAllowed", async () => {
    const listGroups = vi.fn(async () => [{ email: "segreteria@x.it", name: "Segreteria" }]);
    expect(await evaluateLogin("x@x.it", null, { listGroups })).toEqual({ allowed: false, reason: "NotAllowed" });
  });

  it("Google error with an existing user → allowed with the saved role, classGroups untouched", async () => {
    const listGroups = vi.fn(async () => { throw new GroupCheckError("down"); });
    expect(await evaluateLogin("old@x.it", "TEACHER", { listGroups })).toEqual({ allowed: true, role: "TEACHER" });
  });

  it("Google error with a new user → GroupCheckFailed", async () => {
    const listGroups = vi.fn(async () => { throw new GroupCheckError("down"); });
    expect(await evaluateLogin("new@x.it", null, { listGroups })).toEqual({ allowed: false, reason: "GroupCheckFailed" });
  });

  it("uses the cache within the TTL instead of calling Google again", async () => {
    const listGroups = vi.fn(async () => [{ email: "studenti@x.it", name: "Studenti" }]);
    await evaluateLogin("c@x.it", null, { listGroups });
    await evaluateLogin("c@x.it", null, { listGroups });
    expect(listGroups).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/auth/__tests__/student-gate.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 3: Implementa**

```ts
// src/lib/auth/student-gate.ts
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
const cache = new Map<string, { decision: GateDecision; expiresAt: number }>();

function remember(email: string, decision: GateDecision): void {
  cache.set(email, { decision, expiresAt: Date.now() + TTL_MS });
}

function peek(email: string): GateDecision | undefined {
  const hit = cache.get(email);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(email);
    return undefined;
  }
  return hit.decision;
}

/** Legge la decisione per l'email e la rimuove dalla cache. */
export function takeDecision(email: string): GateDecision | undefined {
  const key = email.toLowerCase();
  const d = peek(key);
  cache.delete(key);
  return d;
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
  const cached = peek(key);
  if (cached) return cached;

  const cfg = getStudentGateConfig();
  if (!cfg) {
    const d: GateDecision = { allowed: true, role: existingRole ?? "TEACHER" };
    return d;
  }

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
    console.warn(`[student-gate] verifica gruppi fallita per ${key}: ${e.message}`);
    decision = existingRole ? { allowed: true, role: existingRole } : { allowed: false, reason: "GroupCheckFailed" };
  }

  remember(key, decision);
  return decision;
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/auth/__tests__/student-gate.test.ts && npm run lint`
Expected: 7 test PASS; lint pulito.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/student-gate.ts src/lib/auth/__tests__/student-gate.test.ts
git commit -m "feat(auth): decisione di login dal gruppo Google con cache per email"
```

---

### Task 6: Callback NextAuth (`signIn`, `createUser`) e propagazione del ruolo

**Files:**
- Create: `src/lib/auth/gate-callbacks.ts`
- Modify: `src/lib/auth/config.ts` (callback `jwt`/`session`, nuovo `signIn`, nuovo `events`)
- Test: `src/lib/auth/__tests__/gate-callbacks.test.ts`

**Interfaces:**
- Consumes: `evaluateLogin`, `takeDecision` (Task 5), `isStudentGateEnabled` (Task 2), `BASE_PATH` (`@/lib/base-path`), `prisma`.
- Produces:

```ts
export async function signInWithGate(args: { email: string | null | undefined; provider: string | undefined }): Promise<true | string>;
export async function onUserCreated(args: { id: string; email: string | null | undefined }): Promise<void>;
```

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// src/lib/auth/__tests__/gate-callbacks.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUser = { findUnique: vi.fn(), update: vi.fn() };
vi.mock("@/lib/db/client", () => ({ prisma: { user: mockUser } }));
vi.mock("@/lib/config/student-gate", () => ({ isStudentGateEnabled: vi.fn() }));
vi.mock("@/lib/auth/student-gate", () => ({ evaluateLogin: vi.fn(), takeDecision: vi.fn() }));
vi.mock("@/lib/base-path", () => ({ BASE_PATH: "/savint" }));

import { isStudentGateEnabled } from "@/lib/config/student-gate";
import { evaluateLogin, takeDecision } from "@/lib/auth/student-gate";
import { signInWithGate, onUserCreated } from "../gate-callbacks";

const enabled = isStudentGateEnabled as ReturnType<typeof vi.fn>;
const evalMock = evaluateLogin as ReturnType<typeof vi.fn>;
const takeMock = takeDecision as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUser.findUnique.mockReset();
  mockUser.update.mockReset();
  enabled.mockReturnValue(true);
  evalMock.mockReset();
  takeMock.mockReset();
});

describe("signInWithGate", () => {
  it("returns true and does nothing when the gate is disabled", async () => {
    enabled.mockReturnValue(false);
    expect(await signInWithGate({ email: "a@x.it", provider: "google" })).toBe(true);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("returns true for non-google providers", async () => {
    expect(await signInWithGate({ email: "a@x.it", provider: "credentials" })).toBe(true);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=NotAllowed when the email is missing", async () => {
    expect(await signInWithGate({ email: null, provider: "google" })).toBe("/savint/login?error=NotAllowed");
  });

  it("updates role and classGroups of an existing user", async () => {
    mockUser.findUnique.mockResolvedValue({ id: "u1", role: "TEACHER" });
    evalMock.mockResolvedValue({ allowed: true, role: "STUDENT", classGroups: [{ email: "allievi.3a@x.it", name: "3A", yearLevel: 3 }] });
    expect(await signInWithGate({ email: "M@x.it", provider: "google" })).toBe(true);
    expect(evalMock).toHaveBeenCalledWith("m@x.it", "TEACHER");
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "STUDENT", classGroups: [{ email: "allievi.3a@x.it", name: "3A", yearLevel: 3 }] },
    });
  });

  it("does not touch classGroups when the decision has none (Google error, existing user)", async () => {
    mockUser.findUnique.mockResolvedValue({ id: "u1", role: "TEACHER" });
    evalMock.mockResolvedValue({ allowed: true, role: "TEACHER" });
    await signInWithGate({ email: "m@x.it", provider: "google" });
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "TEACHER" } });
  });

  it("does not call update for a new user (createUser will)", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    evalMock.mockResolvedValue({ allowed: true, role: "STUDENT", classGroups: [] });
    expect(await signInWithGate({ email: "n@x.it", provider: "google" })).toBe(true);
    expect(evalMock).toHaveBeenCalledWith("n@x.it", null);
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it("redirects with the deny reason", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    evalMock.mockResolvedValue({ allowed: false, reason: "GroupCheckFailed" });
    expect(await signInWithGate({ email: "n@x.it", provider: "google" })).toBe("/savint/login?error=GroupCheckFailed");
  });
});

describe("onUserCreated", () => {
  it("applies the cached decision to the freshly created user", async () => {
    takeMock.mockReturnValue({ allowed: true, role: "STUDENT", classGroups: [] });
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(takeMock).toHaveBeenCalledWith("n@x.it");
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: "u9" }, data: { role: "STUDENT", classGroups: [] } });
  });

  it("does nothing without a cached decision or when the gate is disabled", async () => {
    takeMock.mockReturnValue(undefined);
    await onUserCreated({ id: "u9", email: "n@x.it" });
    enabled.mockReturnValue(false);
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(mockUser.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/auth/__tests__/gate-callbacks.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 3: Implementa i callback**

```ts
// src/lib/auth/gate-callbacks.ts
/**
 * Callback del cancello studenti, separati da NextAuth per essere testabili.
 * - signInWithGate: usato in callbacks.signIn; ritorna true oppure l'URL di
 *   redirect (stringa) verso la pagina di login con il motivo.
 * - onUserCreated: usato in events.createUser; applica la decisione in cache.
 */
import { prisma } from "@/lib/db/client";
import { BASE_PATH } from "@/lib/base-path";
import { isStudentGateEnabled } from "@/lib/config/student-gate";
import { evaluateLogin, takeDecision } from "@/lib/auth/student-gate";

function loginError(reason: "NotAllowed" | "GroupCheckFailed"): string {
  return `${BASE_PATH}/login?error=${reason}`;
}

export async function signInWithGate(args: {
  email: string | null | undefined;
  provider: string | undefined;
}): Promise<true | string> {
  if (!isStudentGateEnabled()) return true;
  if (args.provider !== "google") return true;

  const email = args.email?.trim().toLowerCase();
  if (!email) return loginError("NotAllowed");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  const decision = await evaluateLogin(email, existing?.role ?? null);
  if (!decision.allowed) return loginError(decision.reason);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: decision.role,
        ...(decision.classGroups !== undefined ? { classGroups: decision.classGroups } : {}),
      },
    });
  }
  return true;
}

export async function onUserCreated(args: { id: string; email: string | null | undefined }): Promise<void> {
  if (!isStudentGateEnabled()) return;
  const email = args.email?.trim().toLowerCase();
  if (!email) return;
  const decision = takeDecision(email);
  if (!decision || !decision.allowed) return;
  await prisma.user.update({
    where: { id: args.id },
    data: { role: decision.role, classGroups: decision.classGroups ?? [] },
  });
}
```

- [ ] **Step 4: Aggancia i callback in `config.ts`**

In `src/lib/auth/config.ts`:

1. Aggiungi gli import dopo `import { BASE_PATH } from "@/lib/base-path";`:

```ts
import { signInWithGate, onUserCreated } from "@/lib/auth/gate-callbacks";
```

2. Dentro `callbacks: {`, prima di `async jwt({ token, user }) {`, aggiungi:

```ts
    async signIn({ user, account }) {
      if (hub) return true;
      return signInWithGate({ email: user.email, provider: account?.provider });
    },
```

3. Nel callback `session`, sostituisci le due righe con il cast del ruolo:

```ts
          session.user.role = (dbUser?.role as "TEACHER" | "ADMIN") ?? "TEACHER";
```
→
```ts
          session.user.role = (dbUser?.role as "TEACHER" | "ADMIN" | "STUDENT") ?? "TEACHER";
```
e
```ts
          session.user.role = (token.role as "TEACHER" | "ADMIN") ?? "TEACHER";
```
→
```ts
          session.user.role = (token.role as "TEACHER" | "ADMIN" | "STUDENT") ?? "TEACHER";
```

4. Dopo la chiusura di `callbacks: { ... },` e prima di `pages: {`, aggiungi:

```ts
  events: {
    async createUser({ user }) {
      if (hub) return;
      await onUserCreated({ id: user.id!, email: user.email });
    },
  },
```

- [ ] **Step 5: Esegui i test, lint e build dei tipi**

Run: `npx vitest run src/lib/auth/__tests__/gate-callbacks.test.ts && npm run lint && npx tsc --noEmit`
Expected: 9 test PASS; lint e tipi puliti.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/gate-callbacks.ts src/lib/auth/__tests__/gate-callbacks.test.ts src/lib/auth/config.ts
git commit -m "feat(auth): cancello al login Google e ruolo STUDENT in sessione"
```

---

### Task 7: Messaggi di errore nella pagina di login

**Files:**
- Modify: `src/messages/it.json` (oggetto `login`), `src/messages/en.json` (oggetto `login`)
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: query `?error=NotAllowed|GroupCheckFailed|AccessDenied` prodotta da Task 6 e da Auth.js.

- [ ] **Step 1: Aggiungi i testi**

In `src/messages/it.json`, oggetto `login`:

```json
"login": {
  "loginWithSchoolAccount": "Accedi con il tuo account scolastico",
  "loginWithGoogle": "Accedi con Google",
  "demoLogin": "Demo Login",
  "emailPlaceholder": "docente@scuola.it",
  "enterAsTeacher": "Entra come docente",
  "errorNotAllowed": "Il tuo account non è abilitato: non risulta nei gruppi della scuola. Chiedi alla segreteria di controllare il tuo gruppo.",
  "errorGroupCheckFailed": "Non siamo riusciti a verificare il tuo account con Google. Riprova tra qualche minuto.",
  "errorGeneric": "Accesso non riuscito. Riprova."
}
```

In `src/messages/en.json`, oggetto `login`:

```json
"login": {
  "loginWithSchoolAccount": "Sign in with your school account",
  "loginWithGoogle": "Sign in with Google",
  "demoLogin": "Demo Login",
  "emailPlaceholder": "teacher@school.com",
  "enterAsTeacher": "Enter as teacher",
  "errorNotAllowed": "Your account is not enabled: it is not in the school's groups. Ask the office to check your group.",
  "errorGroupCheckFailed": "We could not verify your account with Google. Please try again in a few minutes.",
  "errorGeneric": "Sign-in failed. Please try again."
}
```

- [ ] **Step 2: Mostra l'errore nella pagina**

In `src/app/(auth)/login/page.tsx`:

1. Aggiungi `AlertCircle` all'import di lucide: `import { Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";`
2. Dopo `const [devLoginEnabled, setDevLoginEnabled] = useState(false);` aggiungi:

```tsx
  const [errorKey, setErrorKey] = useState<"errorNotAllowed" | "errorGroupCheckFailed" | "errorGeneric" | null>(null);

  useEffect(() => {
    // Letto da window per non richiedere un boundary Suspense (useSearchParams).
    const err = new URLSearchParams(window.location.search).get("error");
    if (!err) return;
    if (err === "NotAllowed" || err === "AccessDenied") setErrorKey("errorNotAllowed");
    else if (err === "GroupCheckFailed") setErrorKey("errorGroupCheckFailed");
    else setErrorKey("errorGeneric");
  }, []);
```

3. Subito prima di `{/* Google Sign In Button */}` aggiungi:

```tsx
        {errorKey && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t(errorKey)}</p>
          </div>
        )}
```

- [ ] **Step 3: Verifica a mano e lint**

Run: `npm run lint` e poi `npm run dev:custom`; apri `http://localhost:3000/login?error=NotAllowed` e `?error=GroupCheckFailed`.
Expected: il riquadro rosso mostra i due messaggi; senza parametro non compare.

- [ ] **Step 4: Commit**

```bash
git add src/messages/it.json src/messages/en.json "src/app/(auth)/login/page.tsx"
git commit -m "feat(login): messaggi per account non abilitato e verifica gruppi fallita"
```

---

### Task 8: Helper `require-role.ts`

**Files:**
- Create: `src/lib/auth/require-role.ts`
- Test: `src/lib/auth/__tests__/require-role.test.ts`

**Interfaces:**
- Consumes: `auth()` da `@/lib/auth/config`; `redirect` da `next/navigation`.
- Produces:

```ts
export type RequireRoleResult = { ok: true; session: Session } | { ok: false; response: Response };
export async function requireTeacher(): Promise<RequireRoleResult>;   // TEACHER o ADMIN; 401 senza sessione; 403 STUDENT
export async function requireStudent(): Promise<RequireRoleResult>;   // STUDENT; 401 senza sessione; 403 altrimenti
export async function redirectUnlessTeacher(): Promise<Session>;       // STUDENT → redirect("/studente"); anonimo → redirect("/login")
```

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// src/lib/auth/__tests__/require-role.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }),
}));

import { auth } from "@/lib/auth/config";
import { requireTeacher, requireStudent, redirectUnlessTeacher } from "../require-role";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const sessionWith = (role: "TEACHER" | "ADMIN" | "STUDENT") => ({ user: { id: "u", role, name: "N", email: "n@x.it" } });

beforeEach(() => authMock.mockReset());

describe("requireTeacher", () => {
  it("401 without session", async () => {
    authMock.mockResolvedValue(null);
    const r = await requireTeacher();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });
  it("403 for STUDENT", async () => {
    authMock.mockResolvedValue(sessionWith("STUDENT"));
    const r = await requireTeacher();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });
  it.each(["TEACHER", "ADMIN"] as const)("ok for %s", async (role) => {
    authMock.mockResolvedValue(sessionWith(role));
    const r = await requireTeacher();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.user.id).toBe("u");
  });
});

describe("requireStudent", () => {
  it("401 without session", async () => {
    authMock.mockResolvedValue(null);
    const r = await requireStudent();
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(r.ok).toBe(false);
  });
  it("403 for TEACHER", async () => {
    authMock.mockResolvedValue(sessionWith("TEACHER"));
    const r = await requireStudent();
    if (!r.ok) expect(r.response.status).toBe(403);
    expect(r.ok).toBe(false);
  });
  it("ok for STUDENT", async () => {
    authMock.mockResolvedValue(sessionWith("STUDENT"));
    expect((await requireStudent()).ok).toBe(true);
  });
});

describe("redirectUnlessTeacher", () => {
  it("redirects anonymous users to /login", async () => {
    authMock.mockResolvedValue(null);
    await expect(redirectUnlessTeacher()).rejects.toThrow("REDIRECT:/login");
  });
  it("redirects students to /studente", async () => {
    authMock.mockResolvedValue(sessionWith("STUDENT"));
    await expect(redirectUnlessTeacher()).rejects.toThrow("REDIRECT:/studente");
  });
  it("returns the session for teachers", async () => {
    authMock.mockResolvedValue(sessionWith("TEACHER"));
    expect((await redirectUnlessTeacher()).user.role).toBe("TEACHER");
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/auth/__tests__/require-role.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 3: Implementa**

```ts
// src/lib/auth/require-role.ts
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
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/auth/__tests__/require-role.test.ts && npm run lint`
Expected: 10 test PASS; lint pulito.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/require-role.ts src/lib/auth/__tests__/require-role.test.ts
git commit -m "feat(auth): helper requireTeacher/requireStudent/redirectUnlessTeacher"
```

---

### Task 9: Test a tabella dell'enforcement sulle route (fallisce finché i Task 10–12 non sono fatti)

**Files:**
- Test: `src/app/api/__tests__/teacher-only-routes.test.ts`

**Interfaces:**
- Consumes: gli handler esportati dalle 23 route elencate sotto.

- [ ] **Step 1: Scrivi il test**

```ts
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
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/app/api/__tests__/teacher-only-routes.test.ts`
Expected: FAIL su tutte le route (oggi rispondono 200 oppure lanciano perché toccano prisma). Se una route fallisce **all'import** per un modulo che legge l'ambiente, aggiungi un `vi.mock` mirato per quel modulo in cima al test e annota il perché in un commento.

- [ ] **Step 3: Commit del test (rosso)**

```bash
git add src/app/api/__tests__/teacher-only-routes.test.ts
git commit -m "test(api): le route docente devono rispondere 403 agli studenti"
```

---

### Task 10: Protezione route quiz (9 file)

**Files:**
- Modify: `src/app/api/quiz/route.ts`, `src/app/api/quiz/[id]/route.ts`, `src/app/api/quiz/[id]/export/route.ts`, `src/app/api/quiz/[id]/share/route.ts`, `src/app/api/quiz/duplicate/route.ts`, `src/app/api/quiz/excel-import/route.ts`, `src/app/api/quiz/excel-template/route.ts`, `src/app/api/quiz/import/route.ts`, `src/app/api/quiz/moodle-import/route.ts`

**Interfaces:**
- Consumes: `requireTeacher()` (Task 8).

- [ ] **Step 1: Applica la trasformazione a ogni handler**

In ogni file, sostituisci l'import

```ts
import { auth } from "@/lib/auth/config";
```
con
```ts
import { requireTeacher } from "@/lib/auth/require-role";
```

e in **ogni** handler esportato sostituisci il blocco di autenticazione. Forma A (`quiz/route.ts`, `quiz/[id]/route.ts`, `quiz/[id]/share/route.ts`, `quiz/duplicate/route.ts`):

```ts
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

Forma B con graffe (`excel-import`, `excel-template`, `import`, `moodle-import`):

```ts
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

Forma C (`quiz/[id]/export/route.ts`):

```ts
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
```

Tutte e tre diventano:

```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;
```

Il resto dell'handler continua a usare `session.user.id` senza modifiche.

- [ ] **Step 2: Esegui il test dell'enforcement sul sottoinsieme quiz e i tipi**

Run: `npx vitest run src/app/api/__tests__/teacher-only-routes.test.ts -t "/api/quiz" && npx tsc --noEmit && npm run lint`
Expected: i 14 casi `quiz*` PASS; tipi e lint puliti.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/quiz
git commit -m "feat(api): route quiz riservate ai docenti"
```

---

### Task 11: Protezione route sessioni, statistiche, upload, report, consenso, ricerca immagini (7 file)

**Files:**
- Modify: `src/app/api/session/route.ts`, `src/app/api/session/[id]/route.ts`, `src/app/api/stats/export/route.ts`, `src/app/api/upload/route.ts`, `src/app/api/report/route.ts`, `src/app/api/consent/route.ts`, `src/app/api/consent/check/route.ts`, `src/app/api/image-search/route.ts`

**Interfaces:**
- Consumes: `requireTeacher()` (Task 8).

- [ ] **Step 1: Applica la trasformazione**

Import: `import { auth } from "@/lib/auth/config";` → `import { requireTeacher } from "@/lib/auth/require-role";`.

`session/route.ts` (due handler, forma su una riga):

```ts
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
→
```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;
```

`session/[id]/route.ts`, `upload/route.ts`, `report/route.ts`, `consent/route.ts`, `consent/check/route.ts` (forma senza graffe):

```ts
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
→
```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;
```

`stats/export/route.ts` (variabile `authSession`):

```ts
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
```
→
```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const authSession = gate.session;
```

`image-search/route.ts`:

```ts
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
```
→
```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
```
(la variabile `session` non è usata dopo: non ridichiararla, altrimenti lint segnala una variabile inutilizzata).

- [ ] **Step 2: Esegui i test e i tipi**

Run: `npx vitest run src/app/api/__tests__/teacher-only-routes.test.ts -t "session|stats|upload|report|consent|image-search" && npx tsc --noEmit && npm run lint`
Expected: i 10 casi PASS; tipi e lint puliti.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/session src/app/api/stats src/app/api/upload src/app/api/report src/app/api/consent src/app/api/image-search
git commit -m "feat(api): sessioni, statistiche, upload, report, consenso e ricerca immagini riservati ai docenti"
```

---

### Task 12: Protezione route hub lato installazione (6 file) e chiusura del test a tabella

**Files:**
- Modify: `src/app/api/dashboard/hub/clone/route.ts`, `src/app/api/hub/oauth/start/route.ts`, `src/app/api/hub/oauth/callback/route.ts`, `src/app/api/hub/oauth/link/route.ts`, `src/app/api/hub/quiz/[id]/publish/route.ts`, `src/app/api/installation/hub/connect/route.ts`

**Interfaces:**
- Consumes: `requireTeacher()` (Task 8).

- [ ] **Step 1: Applica la trasformazione**

Import: `import { auth } from "@/lib/auth/config";` → `import { requireTeacher } from "@/lib/auth/require-role";`.

`dashboard/hub/clone`, `hub/oauth/start`, `hub/oauth/callback`, `hub/oauth/link`, `hub/quiz/[id]/publish` (entrambi gli handler):

```ts
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
```
→
```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;
```

`installation/hub/connect`:

```ts
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
```
→
```ts
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const session = gate.session;
```

- [ ] **Step 2: Esegui l'intero test a tabella, i tipi, il lint e tutta la suite**

Run: `npx vitest run src/app/api/__tests__/teacher-only-routes.test.ts && npx tsc --noEmit && npm run lint && npm run test:run`
Expected: tutti i 31 casi PASS; nessuna regressione nella suite completa.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard src/app/api/hub/oauth src/app/api/hub/quiz src/app/api/installation
git commit -m "feat(api): integrazione hub lato installazione riservata ai docenti"
```

---

### Task 13: Layout e pagine server: gli studenti vengono rimandati a `/studente`

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`, `src/app/(editor)/layout.tsx`, `src/app/(app)/account/hub-link/page.tsx`, `src/app/(live)/live/host/[sessionId]/page.tsx`, `src/app/(live)/live/test/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `redirectUnlessTeacher()` (Task 8).

- [ ] **Step 1: Dashboard layout**

```tsx
// src/app/(dashboard)/layout.tsx
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await redirectUnlessTeacher();

  return (
    <DashboardThemeProvider>
      <TermsGuard>
        <div className="flex h-screen flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
          <DashboardSidebar user={session.user} hubEnabled={Boolean(process.env.SAVINT_HUB_URL)} />
          <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
        </div>
      </TermsGuard>
    </DashboardThemeProvider>
  );
}
```

- [ ] **Step 2: Editor layout**

```tsx
// src/app/(editor)/layout.tsx
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectUnlessTeacher();

  return (
    <DashboardThemeProvider>
      <TermsGuard>{children}</TermsGuard>
    </DashboardThemeProvider>
  );
}
```

- [ ] **Step 3: Pagina collegamento hub e pagine host/test dei quiz live**

In `src/app/(app)/account/hub-link/page.tsx` sostituisci

```ts
import { auth } from "@/lib/auth/config";
```
con
```ts
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
```
e
```ts
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
```
con
```ts
  const session = await redirectUnlessTeacher();
```
Se dopo la modifica `redirect` non è più usato nel file, togli `import { redirect } from "next/navigation";` (lint lo segnala).

In `src/app/(live)/live/host/[sessionId]/page.tsx` e `src/app/(live)/live/test/[sessionId]/page.tsx` sostituisci l'import di `auth` con quello di `redirectUnlessTeacher` e

```ts
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
```
con
```ts
  const session = await redirectUnlessTeacher();
```
Tieni `redirect` importato solo se il file lo usa altrove (`notFound`/`redirect` più avanti nel file host).

- [ ] **Step 4: Verifica tipi, lint e build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/layout.tsx" "src/app/(editor)/layout.tsx" "src/app/(app)/account/hub-link/page.tsx" "src/app/(live)/live/host/[sessionId]/page.tsx" "src/app/(live)/live/test/[sessionId]/page.tsx"
git commit -m "feat(auth): dashboard, editor, collegamento hub e pagine host solo per docenti"
```

---

### Task 14: Area studente minima

**Files:**
- Create: `src/components/student/student-header.tsx`
- Create: `src/app/(student)/studente/layout.tsx`
- Create: `src/app/(student)/studente/page.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json` (nuovo oggetto `student`)
- Test: `src/components/student/__tests__/student-header.test.tsx`

**Interfaces:**
- Consumes: `auth()`; `withBasePath` da `@/lib/base-path`; testi `student.*`.

- [ ] **Step 1: Aggiungi i testi**

In `src/messages/it.json`, dopo l'oggetto `login`:

```json
"student": {
  "areaTitle": "Area studente",
  "greeting": "Ciao, {name}",
  "comingSoonTitle": "Qui troverai i tuoi esercizi",
  "comingSoonBody": "Stiamo preparando la palestra di matematica. Quando il tuo docente assegnerà i primi esercizi, li vedrai in questa pagina.",
  "logout": "Esci"
}
```

In `src/messages/en.json`, dopo l'oggetto `login`:

```json
"student": {
  "areaTitle": "Student area",
  "greeting": "Hi, {name}",
  "comingSoonTitle": "Your exercises will appear here",
  "comingSoonBody": "We are setting up the maths practice area. When your teacher assigns the first exercises, you will see them on this page.",
  "logout": "Sign out"
}
```

- [ ] **Step 2: Scrivi il test del header che fallisce**

```tsx
// src/components/student/__tests__/student-header.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import it_ from "@/messages/it.json";
import { StudentHeader } from "../student-header";

describe("StudentHeader", () => {
  it("shows the student name and a logout button", () => {
    render(
      <NextIntlClientProvider locale="it" messages={it_}>
        <StudentHeader name="Mario Rossi" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Ciao, Mario Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esci" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/components/student/__tests__/student-header.test.tsx`
Expected: FAIL, componente inesistente.

- [ ] **Step 4: Implementa header, layout e pagina**

```tsx
// src/components/student/student-header.tsx
"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

export function StudentHeader({ name }: { name: string }) {
  const t = useTranslations("student");
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-3">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="h-9 w-9 object-contain" />
        <div className="leading-tight">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("areaTitle")}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{t("greeting", { name })}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { window.location.href = withBasePath("/api/auth/logout"); }}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <LogOut className="h-4 w-4" />
        {t("logout")}
      </button>
    </header>
  );
}
```

```tsx
// src/app/(student)/studente/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { StudentHeader } from "@/components/student/student-header";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-blue-50 via-background to-brand-magenta-50">
      <StudentHeader name={session.user.name ?? session.user.email ?? ""} />
      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">{children}</main>
    </div>
  );
}
```

```tsx
// src/app/(student)/studente/page.tsx
import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";

export default async function StudentHomePage() {
  const t = await getTranslations("student");
  return (
    <section className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center shadow-xl shadow-slate-200/50 backdrop-blur-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
        <BookOpen className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-black text-slate-900">{t("comingSoonTitle")}</h1>
      <p className="mt-2 text-slate-600">{t("comingSoonBody")}</p>
    </section>
  );
}
```

- [ ] **Step 5: Esegui test, lint e build**

Run: `npx vitest run src/components/student/__tests__/student-header.test.tsx && npm run lint && npm run build`
Expected: test PASS; nessun errore.

- [ ] **Step 6: Verifica a mano in dev**

Run: `npm run dev:custom`. Login demo con `studente@scuola.it`.
Expected: dopo il login la dashboard reindirizza a `/studente` con header e messaggio; `/dashboard`, `/dashboard/quiz/new` e `/account/hub-link` riportano a `/studente`; `curl -b <cookie> http://localhost:3000/api/quiz` risponde 403. Login con `docente@scuola.it`: `/studente` reindirizza a `/dashboard`.

- [ ] **Step 7: Commit**

```bash
git add src/components/student "src/app/(student)" src/messages/it.json src/messages/en.json
git commit -m "feat(studente): area studente minima con header e logout"
```

---

### Task 15: Configurazione, Docker e guida di deploy

**Files:**
- Modify: `.env.example`, `docker/.env.example`, `docker/docker-compose.yml`, `docker/setup.sh`, `.gitignore`, `docker/README.md`, `DEPLOY-GUIDA.md`, `README.it.md`, `README.md`

- [ ] **Step 1: `.env.example`** — aggiungi in fondo:

```bash
# ── Riconoscimento studenti e classi (Google Workspace) ─────────────────────
# Attivo se è impostata almeno una tra STUDENT_GROUP_EMAIL e CLASS_GROUP_PATTERN.
# Vedi DEPLOY-GUIDA.md, sezione "Riconoscimento studenti e classi".
# STUDENT_GROUP_EMAIL=studenti@scuola.edu.it
# TEACHER_GROUP_EMAIL=docenti@scuola.edu.it
# Espressione regolare sull'email del gruppo di classe, con cattura (?<name>...).
# CLASS_GROUP_PATTERN=^allievi\.(?<name>[^@]+)@scuola\.edu\.it$
# Service account con delega a livello di dominio (JSON) e admin da impersonare.
# GOOGLE_SA_KEY_FILE=/percorso/google-sa-key.json
# GOOGLE_ADMIN_IMPERSONATE=admin@scuola.edu.it
```

- [ ] **Step 2: `docker/.env.example`** — aggiungi dopo il blocco Google OAuth:

```bash
# Riconoscimento studenti e classi dai gruppi Google Workspace (opzionale).
# Metti il JSON del service account in docker/secrets/google-sa-key.json.
# STUDENT_GROUP_EMAIL=studenti@scuola.edu.it
# TEACHER_GROUP_EMAIL=docenti@scuola.edu.it
# CLASS_GROUP_PATTERN=^allievi\.(?<name>[^@]+)@scuola\.edu\.it$
# GOOGLE_ADMIN_IMPERSONATE=admin@scuola.edu.it
# GOOGLE_SA_KEY_FILE=/run/secrets/google-sa-key.json
```

- [ ] **Step 3: `docker/docker-compose.yml`** — nel servizio `app`, dopo `SESSION_RETENTION_DAYS: ${SESSION_RETENTION_DAYS:-365}`:

```yaml
      STUDENT_GROUP_EMAIL: ${STUDENT_GROUP_EMAIL:-}
      TEACHER_GROUP_EMAIL: ${TEACHER_GROUP_EMAIL:-}
      CLASS_GROUP_PATTERN: ${CLASS_GROUP_PATTERN:-}
      GOOGLE_ADMIN_IMPERSONATE: ${GOOGLE_ADMIN_IMPERSONATE:-}
      GOOGLE_SA_KEY_FILE: ${GOOGLE_SA_KEY_FILE:-}
```

e in `volumes:` dello stesso servizio, dopo `- savint-uploads:/app/public/uploads`:

```yaml
      - ./secrets:/run/secrets:ro
```

- [ ] **Step 4: `docker/setup.sh`** — sostituisci `mkdir -p certs` con `mkdir -p certs secrets`.

- [ ] **Step 5: `.gitignore`** — dopo `docker/certs/` aggiungi `docker/secrets/`.

- [ ] **Step 6: Verifica la composizione**

Run: `cd docker && cp .env.example .env.test && CLASS_GROUP_PATTERN='^allievi\.(?<name>[^@]+)@x\.it$' docker compose --env-file .env.test config | grep -A1 CLASS_GROUP_PATTERN; rm .env.test`
Expected: la variabile compare con il pattern intatto, dollaro finale compreso.

- [ ] **Step 7: `DEPLOY-GUIDA.md`** — dopo la sezione `### Google OAuth` (prima di `## 4. Installa e builda`) aggiungi:

````markdown
### Riconoscimento studenti e classi (Google Workspace)

Serve solo se vuoi far entrare gli **studenti** (modulo Esercizi). Senza questa
configurazione tutto resta come prima: chi entra con Google è un docente.

Come funziona: al login SAVINT chiede a Google l'elenco dei gruppi di cui
l'utente è membro diretto. Chi è nel gruppo docenti è docente; chi è nel
gruppo studenti o in un gruppo di classe è studente e viene rimandato all'area
studente; chi non è in nessun gruppo non entra (se il gruppo docenti è
configurato). I gruppi di classe (es. `allievi.2sia4.0@scuola.edu.it`) vengono
salvati per creare le classi in automatico.

Nella **Google Cloud Console**, nello stesso progetto usato per OAuth:
1. "API e servizi" > "Libreria": abilita **Admin SDK API**.
2. "IAM e amministrazione" > "Account di servizio": crea un account di servizio
   (es. `savint-groups`), poi "Chiavi" > "Aggiungi chiave" > JSON. Scarica il
   file: è un segreto.
3. Nella scheda "Dettagli" dell'account di servizio copia l'**ID cliente**
   (numero lungo).

Nella **Console di amministrazione Google Workspace** (admin.google.com):
4. "Sicurezza" > "Controlli API" > "Delega a livello di dominio" > "Aggiungi":
   incolla l'ID cliente e questo unico ambito:
   ```
   https://www.googleapis.com/auth/admin.directory.group.readonly
   ```
5. "Account" > "Ruoli amministratore": assegna il ruolo **Lettore gruppi** (o
   crea un ruolo con la sola lettura dei gruppi) a un account che SAVINT
   impersonerà, es. `savint-reader@scuola.edu.it`.
6. Crea i gruppi: uno per i docenti, uno per gli studenti e/o uno per ogni
   classe. I gruppi di classe devono seguire una convenzione di nome che
   `CLASS_GROUP_PATTERN` riconosca, es. `allievi.<classe>@scuola.edu.it`.

Nel `.env` di SAVINT:
```bash
TEACHER_GROUP_EMAIL=docenti@scuola.edu.it
STUDENT_GROUP_EMAIL=studenti@scuola.edu.it        # facoltativo se usi i gruppi di classe
CLASS_GROUP_PATTERN=^allievi\.(?<name>[^@]+)@scuola\.edu\.it$
GOOGLE_ADMIN_IMPERSONATE=savint-reader@scuola.edu.it
GOOGLE_SA_KEY_FILE=/etc/savint/google-sa-key.json   # con Docker: /run/secrets/google-sa-key.json
```
Con Docker copia il JSON in `docker/secrets/google-sa-key.json` (la cartella è
esclusa da git).

Se la configurazione è incompleta SAVINT **non parte** e stampa quale
variabile manca.

Checklist di verifica dopo il deploy:
- [ ] Login con un account **studente**: atterra su `/studente`, non vede la dashboard.
- [ ] Lo studente digita `/dashboard` o `/dashboard/quiz/new`: torna a `/studente`.
- [ ] Lo studente apre `/api/quiz`: risposta `403`.
- [ ] Login con un account **docente**: dashboard come prima.
- [ ] Account fuori da ogni gruppo: pagina di login con "Il tuo account non è abilitato".
- [ ] Nei log all'avvio compare `Cancello studenti attivo`.
````

- [ ] **Step 8: `docker/README.md`** — nella sezione che parla di Google OAuth aggiungi il paragrafo:

```markdown
### Studenti e classi dai gruppi Google (opzionale)

Per far entrare gli studenti nel modulo Esercizi, imposta nel `.env` le variabili
`STUDENT_GROUP_EMAIL` / `CLASS_GROUP_PATTERN`, `TEACHER_GROUP_EMAIL`,
`GOOGLE_ADMIN_IMPERSONATE` e `GOOGLE_SA_KEY_FILE=/run/secrets/google-sa-key.json`,
e copia il JSON del service account in `docker/secrets/google-sa-key.json`.
I passi nella console Google sono in `DEPLOY-GUIDA.md`, sezione
"Riconoscimento studenti e classi".
```

- [ ] **Step 9: README** — in `README.it.md` dopo la riga `- **Autenticazione**: login con Google Workspace scolastico` aggiungi:

```markdown
- **Studenti riconosciuti dai gruppi Google**: chi è nel gruppo studenti o in un gruppo di classe entra come studente, senza vedere editor e dashboard; le classi vengono lette dai gruppi (base del modulo Esercizi, in arrivo)
```

In `README.md` dopo `- **Authentication**: login with school Google Workspace`:

```markdown
- **Students recognised from Google groups**: members of the student group or of a class group sign in as students, with no access to the editor or dashboard; classes are read from the groups (foundation of the upcoming Exercises module)
```

- [ ] **Step 10: Commit**

```bash
git add .env.example docker/.env.example docker/docker-compose.yml docker/setup.sh .gitignore docker/README.md DEPLOY-GUIDA.md README.it.md README.md
git commit -m "docs(deploy): riconoscimento studenti e classi da Google Workspace"
```

---

### Task 16: Verifica finale

**Files:** nessuna modifica prevista.

- [ ] **Step 1: Suite completa, tipi, lint, build**

Run: `npm run test:run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tutto verde. Se un test preesistente fallisce per il nuovo ruolo (es. un cast su `"TEACHER" | "ADMIN"`), correggi il cast e rilancia.

- [ ] **Step 2: Prova del fail loud**

Run: `STUDENT_GROUP_EMAIL=studenti@x.it npm run dev:custom`
Expected: il processo termina con `Cancello studenti attivo ma GOOGLE_SA_KEY_FILE non è impostata...`.

- [ ] **Step 3: Prova senza configurazione (nessun cambiamento)**

Run: `npm run dev:custom`, login demo con `docente@scuola.it`.
Expected: dashboard identica a prima; nei log non compare `Cancello studenti attivo`.

- [ ] **Step 4: Prova con il Workspace reale (facoltativa in locale, obbligatoria prima del rilascio)**

Segui la checklist della sezione "Riconoscimento studenti e classi" in `DEPLOY-GUIDA.md` su un'installazione con `GOOGLE_CLIENT_ID` e i gruppi veri. Verifica anche che dopo il login di uno studente `User.classGroups` contenga la sua classe:

```bash
psql "$DATABASE_URL" -c "select email, role, \"classGroups\" from \"User\" where role = 'STUDENT' limit 5;"
```

- [ ] **Step 5: Apri la PR**

```bash
git push -u origin feature/esercizi-design
gh pr create --title "Esercizi 01 — cancello e ruoli studente" --body "$(cat <<'EOB'
## Riassunto
- Ruolo STUDENT riconosciuto al login dai gruppi Google Workspace (Admin SDK, una chiamata per login)
- Gruppi di classe salvati su User.classGroups per creare le classi in automatico (sotto-progetto 4)
- Dashboard, editor, pagine host e 23 route API riservate ai docenti (403 agli studenti)
- Area studente minima su /studente
- Guida di deploy, .env e Docker aggiornati; fail loud se la configurazione è incompleta

Spec: docs/superpowers/specs/2026-09-02-esercizi-01-cancello-ruoli-design.md
Piano: docs/superpowers/plans/2026-09-02-esercizi-01-cancello-ruoli.md

## Test
- Unit: configurazione, classificazione gruppi, regola del ruolo, client Admin SDK, orchestratore, callback, helper di ruolo
- Tabella: 31 handler docente rispondono 403 a uno STUDENT prima di toccare il DB
- Manuale: checklist in DEPLOY-GUIDA.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611
EOB
)"
```
