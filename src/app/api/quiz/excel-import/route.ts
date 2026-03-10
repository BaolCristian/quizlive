import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { parseExcelQuiz } from "@/lib/excel/parser";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const quizId = formData.get("quizId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = await parseExcelQuiz(buffer);
  } catch {
    return NextResponse.json(
      { error: "File Excel non valido" },
      { status: 400 },
    );
  }

  if (result.questions.length === 0 && result.errors.length === 0) {
    return NextResponse.json(
      { error: "Il file non contiene domande" },
      { status: 400 },
    );
  }

  if (result.errors.length > 0) {
    return NextResponse.json(
      { errors: result.errors, questions: result.questions },
      { status: 422 },
    );
  }

  // Mode: add to existing quiz
  if (quizId) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId, authorId: session.user.id },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!quiz) {
      return NextResponse.json(
        { error: "Quiz non trovato" },
        { status: 404 },
      );
    }

    const startOrder = quiz.questions.length;
    await prisma.question.createMany({
      data: result.questions.map((q, i) => ({
        quizId,
        type: q.type,
        text: q.text,
        timeLimit: q.timeLimit,
        points: q.points,
        order: startOrder + i,
        options: q.options as any,
        confidenceEnabled: q.confidenceEnabled,
      })),
    });

    return NextResponse.json(
      { id: quizId, added: result.questions.length },
      { status: 200 },
    );
  }

  // Mode: create new quiz
  const quiz = await prisma.quiz.create({
    data: {
      title: "Quiz importato da Excel",
      authorId: session.user.id,
      questions: {
        create: result.questions.map((q, i) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          order: i,
          options: q.options as any,
          confidenceEnabled: q.confidenceEnabled,
        })),
      },
    },
  });

  return NextResponse.json(
    { id: quiz.id, title: quiz.title },
    { status: 201 },
  );
}
