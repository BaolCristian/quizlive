import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

afterEach(() => {
  vi.useRealTimers();
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

  it("user not found in the Workspace → NotAllowed even if existing", async () => {
    const listGroups = vi.fn(async () => { throw new GroupCheckError("nf", undefined, true); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await evaluateLogin("ghost@x.it", "TEACHER", { listGroups })).toEqual({
      allowed: false,
      reason: "NotAllowed",
    });
    warnSpy.mockRestore();
  });

  it("does not write the email in clear text in the warning", async () => {
    const listGroups = vi.fn(async () => { throw new GroupCheckError("down"); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await evaluateLogin("mario.rossi@x.it", "TEACHER", { listGroups });
    const line = String(warnSpy.mock.calls[0][0]);
    expect(line).toContain("m***@x.it");
    expect(line).not.toContain("mario.rossi@x.it");
    warnSpy.mockRestore();
  });

  it("uses the cache within the TTL instead of calling Google again", async () => {
    const listGroups = vi.fn(async () => [{ email: "studenti@x.it", name: "Studenti" }]);
    await evaluateLogin("c@x.it", null, { listGroups });
    await evaluateLogin("c@x.it", null, { listGroups });
    expect(listGroups).toHaveBeenCalledTimes(1);
  });

  it("takeDecision reads the entry whatever role produced it (new users)", async () => {
    const listGroups = vi.fn(async () => [{ email: "docenti@x.it", name: "Docenti" }]);
    const d = await evaluateLogin("k@x.it", "TEACHER", { listGroups });
    expect(takeDecision("k@x.it")).toEqual(d);
  });

  it("cache hit is case-insensitive", async () => {
    const listGroups = vi.fn(async () => [{ email: "studenti@x.it", name: "Studenti" }]);
    await evaluateLogin("C@x.it", null, { listGroups });
    await evaluateLogin("c@x.it", null, { listGroups });
    expect(listGroups).toHaveBeenCalledTimes(1);
  });

  it("a role change in the DB bypasses the cache", async () => {
    const listGroups = vi.fn(async () => [{ email: "studenti@x.it", name: "Studenti" }]);
    const first = await evaluateLogin("r@x.it", null, { listGroups });
    expect(first.allowed && first.role).toBe("STUDENT");
    const second = await evaluateLogin("r@x.it", "ADMIN", { listGroups });
    expect(second.allowed && second.role).toBe("ADMIN");
    expect(listGroups).toHaveBeenCalledTimes(2);
  });

  it("cache expires after 60 s", async () => {
    vi.useFakeTimers();
    const listGroups = vi.fn(async () => [{ email: "studenti@x.it", name: "Studenti" }]);
    await evaluateLogin("t@x.it", null, { listGroups });
    vi.advanceTimersByTime(60_001);
    await evaluateLogin("t@x.it", null, { listGroups });
    expect(listGroups).toHaveBeenCalledTimes(2);
  });

  it("class change between two logins is reflected once the cache expires", async () => {
    vi.useFakeTimers();
    const listGroups = vi
      .fn()
      .mockResolvedValueOnce([{ email: "allievi.2sia4.0@x.it", name: "2 SIA 4.0" }])
      .mockResolvedValueOnce([{ email: "allievi.3sia4.0@x.it", name: "3 SIA 4.0" }]);
    const first = await evaluateLogin("s@x.it", null, { listGroups });
    expect(first.allowed && first.classGroups?.map((g) => g.name)).toEqual(["2SIA4.0"]);
    vi.advanceTimersByTime(60_001);
    const second = await evaluateLogin("s@x.it", null, { listGroups });
    expect(second.allowed && second.classGroups?.map((g) => g.name)).toEqual(["3SIA4.0"]);
  });
});
