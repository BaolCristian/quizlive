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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await evaluateLogin("old@x.it", "TEACHER", { listGroups })).toEqual({ allowed: true, role: "TEACHER" });
    warnSpy.mockRestore();
  });

  it("Google error with a new user → GroupCheckFailed", async () => {
    const listGroups = vi.fn(async () => { throw new GroupCheckError("down"); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await evaluateLogin("new@x.it", null, { listGroups })).toEqual({ allowed: false, reason: "GroupCheckFailed" });
    warnSpy.mockRestore();
  });

  it("uses the cache within the TTL instead of calling Google again", async () => {
    const listGroups = vi.fn(async () => [{ email: "studenti@x.it", name: "Studenti" }]);
    await evaluateLogin("c@x.it", null, { listGroups });
    await evaluateLogin("c@x.it", null, { listGroups });
    expect(listGroups).toHaveBeenCalledTimes(1);
  });
});
