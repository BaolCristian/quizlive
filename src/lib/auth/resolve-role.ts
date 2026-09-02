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
