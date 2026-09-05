import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { Card } from "@/components/ui/card";

type Traduttore = (chiave: string, valori?: Record<string, string | number>) => string;
type StatoTentativo = { status: string; score: number; maxScore: number };

/** Cosa dire dell'ultimo tentativo di uno studente su un esercizio.
 *
 * L'elenco prendeva il tentativo più recente senza guardarne lo stato e lo
 * annunciava sempre come "Tentativo in corso: {score}/{maxScore}", due volte
 * in contrasto col dominio: un tentativo CHIUSO veniva detto in corso, e un
 * tentativo appena aperto mostrava "0/0", perché il massimo lo scrive il
 * server solo quando arriva la prima risposta (`applicaRisposta`) e fino ad
 * allora la colonna vale zero — un massimo che non è mai stato zero per
 * nessun esercizio. */
function statoTentativo(t: Traduttore, tentativo: StatoTentativo): string {
  const punteggi = { score: tentativo.score, maxScore: tentativo.maxScore };
  if (tentativo.status === "COMPLETED") return t("ultimoTentativo", punteggi);
  // Aperto ma senza nessuna risposta: non c'è ancora un massimo da mostrare.
  if (tentativo.maxScore <= 0) return t("tentativoAperto");
  return t("tentativoInCorso", punteggi);
}

export default async function StudentHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("esercizi");

  const esercizi = await prisma.esercizio.findMany({
    orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          tentativi: {
            where: { studentId: session.user.id },
            orderBy: { startedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
          <BookOpen className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">{t("titoloStudente")}</h1>
      </div>

      {esercizi.length === 0 ? (
        <div className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center shadow-xl shadow-slate-200/50 backdrop-blur-xl">
          <p className="text-slate-600">{t("nessunEsercizio")}</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {esercizi.map((e) => {
            const versione = e.versions[0];
            const tentativo = versione?.tentativi[0];
            return (
              <li key={e.id}>
                <Link href={`/studente/esercizio/${e.id}`} className="block">
                  <Card className="flex-row items-center justify-between gap-4 p-4 transition hover:bg-muted/50">
                    <div>
                      <p className="font-medium text-slate-900">{e.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("annoArgomento", { anno: e.yearLevel, argomento: e.topic })}
                        {" · "}
                        {t("difficolta", { livello: e.difficulty })}
                      </p>
                      {tentativo && (
                        <p className="mt-1 text-sm font-medium text-brand-blue">
                          {statoTentativo(t, tentativo)}
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
