import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { Card } from "@/components/ui/card";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi");

  const esercizi = await prisma.esercizio.findMany({
    orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("titoloDocente")}</h1>
      {esercizi.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunEsercizio")}</p>
      ) : (
        <ul className="grid gap-3">
          {esercizi.map((e) => (
            <li key={e.id}>
              <Card className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("annoArgomento", { anno: e.yearLevel, argomento: e.topic })}
                    {" · "}
                    {t("difficolta", { livello: e.difficulty })}
                    {" · "}
                    {t("versione", { numero: e.versions[0]?.version ?? 0 })}
                  </p>
                </div>
                <code className="rounded bg-muted px-2 py-1 text-sm">/studente/esercizio/{e.id}</code>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
