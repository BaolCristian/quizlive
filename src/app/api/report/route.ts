import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const reportSchema = z.object({
  quizId: z.string().min(1),
  reason: z.enum(["COPYRIGHT", "PERSONAL_DATA", "OFFENSIVE", "OTHER"]),
  description: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { quizId, reason, description } = parsed.data;

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz)
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  if (quiz.authorId === session.user.id)
    return NextResponse.json({ error: "Cannot report your own quiz" }, { status: 400 });

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.report.count({
    where: {
      reporterId: session.user.id,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentCount >= 10)
    return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });

  try {
    const report = await prisma.report.create({
      data: {
        quizId,
        reporterId: session.user.id,
        reason,
        description: description || null,
      },
    });
    return NextResponse.json(report, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Already reported" }, { status: 409 });
    }
    throw err;
  }
}
