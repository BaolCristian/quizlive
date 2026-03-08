import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { QuizDashboard } from "@/components/dashboard/quiz-dashboard";

export default async function QuizListPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: userId },
        { shares: { some: { sharedWithId: userId } } },
      ],
    },
    include: {
      _count: { select: { questions: true, sessions: true } },
      author: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Serialize dates for client component
  const serialized = quizzes.map((q) => ({
    ...q,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }));

  return <QuizDashboard quizzes={serialized} userId={userId} />;
}
