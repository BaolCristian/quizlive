/**
 * Configurazione del "cancello studenti": riconoscimento del ruolo e delle
 * classi dai gruppi Google Workspace (spec: Esercizi 01 — Cancello e ruoli).
 *
 * Il cancello è attivo solo in modalità installazione e solo se è impostata
 * STUDENT_GROUP_EMAIL oppure CLASS_GROUP_PATTERN. Se attivo, chiave del service
 * account e admin da impersonare sono obbligatori, e DEMO_MODE deve essere
 * spento (il login demo aggira il cancello): in caso contrario si lancia un
 * errore, così un'installazione mal configurata non parte.
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

  // Il login demo entra senza password e senza passare dal cancello: le due
  // configurazioni insieme sono una porta aperta, quindi il server non parte.
  if (env.DEMO_MODE === "true" && env.NODE_ENV !== "development") {
    throw new Error(
      "Cancello studenti attivo con DEMO_MODE=true: il login demo senza password aggira il cancello. Imposta DEMO_MODE=false (oppure NODE_ENV=development solo in locale).",
    );
  }

  const serviceAccountKeyFile = clean(env.GOOGLE_SA_KEY_FILE);
  if (!serviceAccountKeyFile) {
    throw new Error(
      "Cancello studenti attivo ma GOOGLE_SA_KEY_FILE non è impostata: serve il percorso del JSON del service account (vedi docs/SETUP.md, sezione 2.1 'Riconoscimento studenti e classi').",
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
