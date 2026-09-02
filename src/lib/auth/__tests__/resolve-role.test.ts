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
    [{ existingRole: "STUDENT", isStudent: false, isTeacher: false, teacherGroupConfigured: false }, "STUDENT"],
    [{ existingRole: "STUDENT", isStudent: false, isTeacher: false, teacherGroupConfigured: true }, "DENY"],
    [{ existingRole: "STUDENT", isStudent: false, isTeacher: true, teacherGroupConfigured: false }, "TEACHER"],
  ];
  it.each(cases)("resolveRole(%o) → %s", (input, expected) => {
    expect(resolveRole(input)).toBe(expected);
  });
});
