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
