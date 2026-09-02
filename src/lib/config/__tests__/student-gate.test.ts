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

  it("throws when the gate is on together with DEMO_MODE outside development", () => {
    expect(() =>
      readStudentGateConfig({
        ...base,
        STUDENT_GROUP_EMAIL: "studenti@scuola.edu.it",
        DEMO_MODE: "true",
        NODE_ENV: "production",
      }),
    ).toThrow(/DEMO_MODE/);
  });

  it("allows DEMO_MODE in development", () => {
    const cfg = readStudentGateConfig({
      ...base,
      STUDENT_GROUP_EMAIL: "studenti@scuola.edu.it",
      DEMO_MODE: "true",
      NODE_ENV: "development",
    });
    expect(cfg!.studentGroupEmail).toBe("studenti@scuola.edu.it");
  });

  it("throws when the pattern does not compile", () => {
    expect(() => readStudentGateConfig({ ...base, CLASS_GROUP_PATTERN: "(?<name>" })).toThrow(/CLASS_GROUP_PATTERN/);
  });

  it("throws when the pattern has no (?<name>) capture", () => {
    expect(() => readStudentGateConfig({ ...base, CLASS_GROUP_PATTERN: "^allievi\\..+$" })).toThrow(/\(\?<name>/);
  });
});
