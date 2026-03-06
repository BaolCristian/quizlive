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

const permissionLabel: Record<string, string> = {
  VIEW: "Visualizza",
  DUPLICATE: "Duplica",
  EDIT: "Modifica",
};

export default async function SharePage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const sharedByMe = await prisma.quizShare.findMany({
    where: { quiz: { authorId: userId } },
    include: {
      quiz: { select: { id: true, title: true } },
      sharedWith: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const sharedWithMe = await prisma.quizShare.findMany({
    where: { sharedWithId: userId },
    include: {
      quiz: {
        select: {
          id: true,
          title: true,
          author: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group sharedByMe by quiz
  const byQuiz = sharedByMe.reduce(
    (acc, share) => {
      const key = share.quiz.id;
      if (!acc[key]) acc[key] = { title: share.quiz.title, shares: [] };
      acc[key].shares.push(share);
      return acc;
    },
    {} as Record<
      string,
      { title: string; shares: typeof sharedByMe }
    >,
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Condivisioni</h1>

      {/* Shared by me */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Quiz condivisi da me</h2>
        {Object.keys(byQuiz).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Non hai condiviso nessun quiz.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(byQuiz).map(([quizId, { title, shares }]) => (
              <Card key={quizId}>
                <CardHeader>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>
                    Condiviso con {shares.length}{" "}
                    {shares.length === 1 ? "persona" : "persone"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {shares.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>
                          {s.sharedWith.name ?? s.sharedWith.email}
                        </span>
                        <Badge variant="outline">
                          {permissionLabel[s.permission]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Shared with me */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Quiz condivisi con me</h2>
        {sharedWithMe.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nessun quiz condiviso con te.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sharedWithMe.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.quiz.title}</CardTitle>
                  <CardDescription>
                    Da {s.quiz.author.name ?? s.quiz.author.email}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">
                    {permissionLabel[s.permission]}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
