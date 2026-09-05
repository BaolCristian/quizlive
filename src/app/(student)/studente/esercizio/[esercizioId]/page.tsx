import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";

export default async function Page({ params }: { params: Promise<{ esercizioId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { esercizioId } = await params;
  const tentativo = await avviaORiprendi(session.user.id, esercizioId);
  if (!tentativo) notFound();

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <PlayerEsercizioLazy
      tentativoId={tentativo.tentativoId}
      esercizioId={esercizioId}
      seed={tentativo.seed}
      content={tentativo.content}
      statoIniziale={tentativo.state}
      locale={locale}
    />
  );
}
