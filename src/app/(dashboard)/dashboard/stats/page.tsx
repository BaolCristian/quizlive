import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function StatsOverviewPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  // Parallel queries for overview stats
  const [quizCount, finishedSessions, allAnswers, quizzesWithTags] =
    await Promise.all([
      prisma.quiz.count({ where: { authorId: userId } }),
      prisma.session.findMany({
        where: { hostId: userId, status: "FINISHED" },
        include: {
          quiz: { select: { title: true, id: true } },
          answers: {
            select: {
              playerName: true,
              playerEmail: true,
              isCorrect: true,
              score: true,
              sessionId: true,
            },
          },
        },
        orderBy: { endedAt: "desc" },
      }),
      prisma.answer.findMany({
        where: { session: { hostId: userId } },
        select: {
          playerName: true,
          playerEmail: true,
        },
        distinct: ["playerName"],
      }),
      prisma.quiz.findMany({
        where: { authorId: userId, tags: { isEmpty: false } },
        select: {
          id: true,
          tags: true,
          sessions: {
            where: { status: "FINISHED" },
            select: {
              answers: {
                select: { isCorrect: true },
              },
            },
          },
        },
      }),
    ]);

  const totalSessions = finishedSessions.length;
  const uniqueStudents = allAnswers.length;

  // Most active quiz (most sessions)
  const quizSessionCount = new Map<string, { title: string; count: number }>();
  for (const s of finishedSessions) {
    const entry = quizSessionCount.get(s.quizId);
    if (entry) {
      entry.count++;
    } else {
      quizSessionCount.set(s.quizId, { title: s.quiz.title, count: 1 });
    }
  }
  const mostActiveQuiz = [...quizSessionCount.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .at(0);

  // Weakest topic tags (lowest avg % correct)
  const tagStats = new Map<
    string,
    { correct: number; total: number }
  >();
  for (const quiz of quizzesWithTags) {
    const allTagAnswers = quiz.sessions.flatMap((s) => s.answers);
    if (allTagAnswers.length === 0) continue;
    const correct = allTagAnswers.filter((a) => a.isCorrect).length;
    const total = allTagAnswers.length;
    for (const tag of quiz.tags) {
      const entry = tagStats.get(tag);
      if (entry) {
        entry.correct += correct;
        entry.total += total;
      } else {
        tagStats.set(tag, { correct, total });
      }
    }
  }

  const weakestTags = [...tagStats.entries()]
    .map(([tag, { correct, total }]) => ({
      tag,
      avgCorrect: total > 0 ? Math.round((correct / total) * 100) : 0,
      total,
    }))
    .sort((a, b) => a.avgCorrect - b.avgCorrect)
    .slice(0, 5);

  // Most improved students: compare first-half vs second-half session scores
  const studentSessionScores = new Map<
    string,
    { name: string; scores: { date: Date | null; avgScore: number }[] }
  >();
  for (const s of finishedSessions) {
    const playerScores = new Map<
      string,
      { total: number; count: number }
    >();
    for (const a of s.answers) {
      const entry = playerScores.get(a.playerName);
      if (entry) {
        entry.total += a.score;
        entry.count++;
      } else {
        playerScores.set(a.playerName, { total: a.score, count: 1 });
      }
    }
    for (const [name, { total, count }] of playerScores) {
      const key = name;
      const existing = studentSessionScores.get(key);
      const point = { date: s.endedAt, avgScore: Math.round(total / count) };
      if (existing) {
        existing.scores.push(point);
      } else {
        studentSessionScores.set(key, { name, scores: [point] });
      }
    }
  }

  const improvedStudents = [...studentSessionScores.values()]
    .filter((s) => s.scores.length >= 2)
    .map((s) => {
      const sorted = [...s.scores].sort(
        (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)
      );
      const half = Math.floor(sorted.length / 2);
      const firstHalf = sorted.slice(0, half);
      const secondHalf = sorted.slice(half);
      const avgFirst =
        firstHalf.reduce((sum, p) => sum + p.avgScore, 0) / firstHalf.length;
      const avgSecond =
        secondHalf.reduce((sum, p) => sum + p.avgScore, 0) / secondHalf.length;
      const improvement = Math.round(avgSecond - avgFirst);
      return { name: s.name, improvement, sessions: s.scores.length };
    })
    .filter((s) => s.improvement > 0)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Statistiche generali</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/stats/students">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              Studenti
            </Badge>
          </Link>
          <Link href="/dashboard/stats/topics">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              Argomenti
            </Badge>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quiz totali
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{quizCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sessioni completate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSessions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Studenti unici
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{uniqueStudents}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quiz piu attivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mostActiveQuiz ? (
              <div>
                <p className="text-lg font-bold truncate">
                  {mostActiveQuiz[1].title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mostActiveQuiz[1].count} sessioni
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nessun dato</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weakest topics */}
      <Card>
        <CardHeader>
          <CardTitle>Argomenti piu deboli</CardTitle>
        </CardHeader>
        <CardContent>
          {weakestTags.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nessun tag assegnato ai quiz o nessuna sessione completata.
            </p>
          ) : (
            <div className="space-y-3">
              {weakestTags.map((t) => {
                const color =
                  t.avgCorrect < 50
                    ? "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950"
                    : t.avgCorrect < 70
                      ? "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950"
                      : "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950";
                return (
                  <div
                    key={t.tag}
                    className="flex items-center justify-between"
                  >
                    <span className="font-medium">{t.tag}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {t.total} risposte
                      </span>
                      <span
                        className={`text-sm font-semibold px-2 py-0.5 rounded ${color}`}
                      >
                        {t.avgCorrect}% corrette
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Most improved students */}
      <Card>
        <CardHeader>
          <CardTitle>Studenti piu migliorati</CardTitle>
        </CardHeader>
        <CardContent>
          {improvedStudents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Servono almeno 2 sessioni per studente per calcolare il
              miglioramento.
            </p>
          ) : (
            <div className="space-y-3">
              {improvedStudents.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between"
                >
                  <span className="font-medium">{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {s.sessions} sessioni
                    </span>
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                      +{s.improvement} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
