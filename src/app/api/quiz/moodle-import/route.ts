import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { parseMoodleXml } from "@/lib/moodle/parser";

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

  const xmlString = await file.text();

  let result;
  try {
    result = parseMoodleXml(xmlString);
  } catch {
    return NextResponse.json(
      { error: "Invalid Moodle XML file" },
      { status: 400 },
    );
  }

  if (result.questions.length === 0 && result.errors.length === 0) {
    return NextResponse.json(
      { error: "No compatible questions found in the file" },
      { status: 400 },
    );
  }

  if (result.errors.length > 0 && result.questions.length === 0) {
    return NextResponse.json(
      { errors: result.errors, skipped: result.skipped },
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
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
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
      {
        id: quizId,
        added: result.questions.length,
        errors: result.errors,
        skipped: result.skipped,
      },
      { status: 200 },
    );
  }

  // Mode: create new quiz
  const quiz = await prisma.quiz.create({
    data: {
      title: "Quiz importato da Moodle",
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
    {
      id: quiz.id,
      title: quiz.title,
      imported: result.questions.length,
      errors: result.errors,
      skipped: result.skipped,
    },
    { status: 201 },
  );
}
