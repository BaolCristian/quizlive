import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

// Keys and rows here must be scoped to what this file creates. Vitest runs
// test files concurrently against one shared database, so an unscoped
// deleteMany() over HubReport/HubRateLimit would race with (and silently
// delete rows for) every other file touching those tables at the same time.
const RATE_LIMIT_PREFIX = "hub-moderation-models-test:";

describe("HubReport and HubRateLimit models", () => {
  const accountIds: string[] = [];
  const quizIds: string[] = [];

  afterEach(async () => {
    await prisma.hubReport.deleteMany({ where: { hubQuizId: { in: quizIds } } });
    await prisma.hubRateLimit.deleteMany({ where: { key: { startsWith: RATE_LIMIT_PREFIX } } });
  });

  afterAll(async () => {
    for (const id of quizIds) await prisma.hubQuiz.deleteMany({ where: { id } });
    for (const id of accountIds) await prisma.hubAccount.deleteMany({ where: { id } });
  });

  it("creates a HubReport with required fields", async () => {
    const acct = await prisma.hubAccount.create({
      data: {
        email: `r1-${Date.now()}@b.it`,
        name: "A",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    accountIds.push(acct.id);
    const quiz = await prisma.hubQuiz.create({
      data: {
        hubAccountId: acct.id,
        title: "t",
        license: "CC_BY",
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 60,
        payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: 1,
      },
    });
    quizIds.push(quiz.id);
    const r = await prisma.hubReport.create({
      data: {
        hubQuizId: quiz.id,
        reporterIpHash: "abc",
        reason: "OFFENSIVE",
        description: "bad",
      },
    });
    expect(r.status).toBe("PENDING");
  });

  it("enforces unique (key, windowStart) on HubRateLimit", async () => {
    const now = new Date();
    const key = `${RATE_LIMIT_PREFIX}k`;
    await prisma.hubRateLimit.create({ data: { key, windowStart: now, count: 1 } });
    await expect(
      prisma.hubRateLimit.create({ data: { key, windowStart: now, count: 1 } }),
    ).rejects.toThrow();
  });
});
