"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { PlayerEsercizioProps } from "./player-esercizio";

/** Il player (Task 10, misura del peso della pagina): l'import statico di
 * `player-esercizio.tsx` porta con sé `@savint/engine` e KaTeX fin dal primo
 * caricamento della rotta, ben oltre i 500 kB di soglia dati dalla spec.
 * `next/dynamic` con `ssr: false` sposta quel peso in un chunk separato,
 * scaricato solo quando questo componente monta lato client — mai nel bundle
 * SSR/di prima interazione della rotta.
 *
 * `ssr: false` in `next/dynamic` non è ammesso da un Server Component
 * (`page.tsx` resta un async Server Component: legge la sessione e il
 * tentativo dal database, cosa che un Client Component non può fare): da qui
 * questo wrapper, l'unico scopo del quale è essere il confine "use client"
 * su cui appoggiare l'import pigro. */
const PlayerEsercizio = dynamic(
  () => import("./player-esercizio").then((m) => m.PlayerEsercizio),
  { ssr: false, loading: () => <Caricamento /> },
);

function Caricamento() {
  const t = useTranslations("esercizi");
  return <p>{t("caricamento")}</p>;
}

export function PlayerEsercizioLazy(props: PlayerEsercizioProps) {
  return <PlayerEsercizio {...props} />;
}
