import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: session.user.id },
        { shares: { some: { sharedWithId: session.user.id } } },
      ],
    },
    include: { _count: { select: { questions: true, sessions: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(quizzes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, ...quizData } = parsed.data;

  try {
    const quiz = await prisma.quiz.create({
      data: {
        ...quizData,
        authorId: session.user.id,
        questions: {
          create: questions.map((q, i) => {
            const { order: _order, ...rest } = q;
            return { ...rest, order: i };
          }),
        },
      },
      include: { questions: true },
    });

    return NextResponse.json(quiz, { status: 201 });
  } catch (err) {
    console.error("POST /api/quiz error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 },
    );
  }
}
