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

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOBBY: "outline",
  IN_PROGRESS: "default",
  FINISHED: "secondary",
};

const statusLabel: Record<string, string> = {
  LOBBY: "Lobby",
  IN_PROGRESS: "In corso",
  FINISHED: "Terminata",
};

export default async function SessionsListPage() {
  const session = await auth();

  const sessions = await prisma.session.findMany({
    where: { hostId: session!.user!.id },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Le mie sessioni</h1>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground">
          Nessuna sessione ancora. Avvia un quiz per creare una sessione!
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{s.quiz.title}</CardTitle>
                    <Badge variant={statusVariant[s.status]}>
                      {statusLabel[s.status]}
                    </Badge>
                  </div>
                  <CardDescription>
                    PIN: {s.pin} &middot;{" "}
                    {s.createdAt.toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {s._count.answers} risposte
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
