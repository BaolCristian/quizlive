import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { PlayerEsercizio } from "@/components/esercizi/player/player-esercizio";

export default async function Page({ params }: { params: Promise<{ esercizioId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { esercizioId } = await params;
  const tentativo = await avviaORiprendi(session.user.id, esercizioId);
  if (!tentativo) notFound();

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <PlayerEsercizio
      tentativoId={tentativo.tentativoId}
      seed={tentativo.seed}
      content={tentativo.content}
      statoIniziale={tentativo.state}
      locale={locale}
    />
  );
}
