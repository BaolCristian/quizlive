import { describe, it, expect, vi } from "vitest";
import { listUserGroups, GroupCheckError } from "../google-groups";

const token = async () => "tok";

function fetchReturning(pages: Array<{ groups?: unknown[]; nextPageToken?: string; error?: unknown }>, status = 200) {
  let i = 0;
  return vi.fn(async () => {
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

  it("404 throws GroupCheckError with notFound=true", async () => {
    const fetchImpl = fetchReturning([{ error: { message: "Resource Not Found: userKey" } }], 404);
    const err = await listUserGroups("ghost@x.it", { fetchImpl, tokenProvider: token }).catch((e) => e);
    expect(err).toBeInstanceOf(GroupCheckError);
    expect((err as GroupCheckError).notFound).toBe(true);
    expect((err as GroupCheckError).message).toContain("ghost@x.it");
  });

  it("keeps notFound=false on other errors", async () => {
    const fetchImpl = fetchReturning([{ error: { message: "nope" } }], 403);
    const err = await listUserGroups("mario@x.it", { fetchImpl, tokenProvider: token }).catch((e) => e);
    expect((err as GroupCheckError).notFound).toBe(false);
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
