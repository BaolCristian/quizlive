import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TopicsStatsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  // Get all quizzes with tags and their finished sessions + answers
  const quizzes = await prisma.quiz.findMany({
    where: { authorId: userId },
    select: {
      id: true,
      title: true,
      tags: true,
      sessions: {
        where: { status: "FINISHED" },
        select: {
          id: true,
          answers: {
            select: { isCorrect: true },
          },
        },
      },
    },
  });

  // Aggregate stats by tag
  type TagStats = {
    tag: string;
    quizCount: number;
    quizTitles: string[];
    totalSessions: number;
    totalAnswers: number;
    correctAnswers: number;
  };

  const tagMap = new Map<string, TagStats>();

  for (const quiz of quizzes) {
    if (quiz.tags.length === 0) continue;

    const quizSessions = quiz.sessions.length;
    const quizAnswers = quiz.sessions.flatMap((s) => s.answers);
    const quizCorrect = quizAnswers.filter((a) => a.isCorrect).length;
    const quizTotal = quizAnswers.length;

    for (const tag of quiz.tags) {
      const entry = tagMap.get(tag);
      if (entry) {
        entry.quizCount++;
        entry.quizTitles.push(quiz.title);
        entry.totalSessions += quizSessions;
        entry.totalAnswers += quizTotal;
        entry.correctAnswers += quizCorrect;
      } else {
        tagMap.set(tag, {
          tag,
          quizCount: 1,
          quizTitles: [quiz.title],
          totalSessions: quizSessions,
          totalAnswers: quizTotal,
          correctAnswers: quizCorrect,
        });
      }
    }
  }

  const tags = [...tagMap.values()]
    .map((t) => ({
      ...t,
      avgCorrectPct:
        t.totalAnswers > 0
          ? Math.round((t.correctAnswers / t.totalAnswers) * 100)
          : null,
    }))
    .sort((a, b) => (a.avgCorrectPct ?? 0) - (b.avgCorrectPct ?? 0));

  const quizzesWithoutTags = quizzes.filter((q) => q.tags.length === 0).length;

  function getColorClasses(pct: number | null) {
    if (pct === null) return "bg-muted text-muted-foreground";
    if (pct < 50)
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    if (pct < 70)
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800";
    return "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
  }

  function getBarColor(pct: number | null) {
    if (pct === null) return "bg-muted";
    if (pct < 50) return "bg-red-500";
    if (pct < 70) return "bg-yellow-500";
    return "bg-green-500";
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/stats"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Torna alle statistiche
        </Link>
        <h1 className="text-2xl font-bold mt-2">Analisi per argomento</h1>
        <p className="text-muted-foreground">
          Identifica gli argomenti che necessitano di revisione
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span>Debole (&lt;50%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          <span>Sufficiente (50-70%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Buono (&gt;70%)</span>
        </div>
      </div>

      {tags.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Nessun tag assegnato ai quiz. Aggiungi tag ai tuoi quiz per vedere
              le statistiche per argomento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tags.map((t) => (
            <Card key={t.tag} className={`border ${getColorClasses(t.avgCorrectPct)}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{t.tag}</CardTitle>
                  {t.avgCorrectPct !== null ? (
                    <Badge
                      variant={
                        t.avgCorrectPct < 50
                          ? "destructive"
                          : t.avgCorrectPct < 70
                            ? "secondary"
                            : "default"
                      }
                    >
                      {t.avgCorrectPct}% corrette
                    </Badge>
                  ) : (
                    <Badge variant="outline">Nessun dato</Badge>
                  )}
                </div>
                <CardDescription>
                  {t.quizCount} {t.quizCount === 1 ? "quiz" : "quiz"} &middot;{" "}
                  {t.totalSessions} {t.totalSessions === 1 ? "sessione" : "sessioni"} &middot;{" "}
                  {t.totalAnswers} risposte
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Progress bar */}
                {t.avgCorrectPct !== null && (
                  <div className="w-full bg-muted rounded-full h-2.5 mb-3">
                    <div
                      className={`h-2.5 rounded-full ${getBarColor(t.avgCorrectPct)}`}
                      style={{ width: `${t.avgCorrectPct}%` }}
                    />
                  </div>
                )}
                <div className="text-sm">
                  <span className="font-medium">Quiz: </span>
                  {t.quizTitles.slice(0, 3).join(", ")}
                  {t.quizTitles.length > 3 && ` (+${t.quizTitles.length - 3})`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {quizzesWithoutTags > 0 && (
        <p className="text-sm text-muted-foreground">
          {quizzesWithoutTags} {quizzesWithoutTags === 1 ? "quiz non ha" : "quiz non hanno"}{" "}
          tag assegnati e {quizzesWithoutTags === 1 ? "non e incluso" : "non sono inclusi"}{" "}
          in questa analisi.
        </p>
      )}
    </div>
  );
}
