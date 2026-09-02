import { describe, it, expect } from "vitest";
import { PrismaClient, Role } from "@prisma/client";

describe("Student role schema", () => {
  it("exposes Role.STUDENT", () => {
    expect(Role.STUDENT).toBe("STUDENT");
  });

  it("User has a classGroups field", () => {
    const prisma = new PrismaClient();
    expect(prisma.user.fields.classGroups).toBeDefined();
  });
});
