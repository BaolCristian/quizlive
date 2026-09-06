"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

/** `jme`: la risposta è un'espressione matematica in sintassi JME, testo
 * libero (lettere, operatori, parentesi: non un `inputMode` numerico). */
export function InputEspressione({ parte, valore, onChange, disabilitato, inLinea }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  const contenuto = (
    <>
      <label htmlFor={id} className="sr-only">
        {t("rispostaEspressione")}
      </label>
      <Input
        id={id}
        inputMode="text"
        autoComplete="off"
        placeholder={inLinea ? undefined : t("segnapostoEspressione")}
        className={inLinea ? "w-40" : undefined}
        value={typeof valore === "string" ? valore : ""}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );

  // Vedi `numero.tsx`: in linea il contenitore è un `span`, perché il campo
  // sta dentro la frase del prompt di un gapfill.
  return inLinea ? (
    <span className="inline-flex items-center gap-2 align-middle">{contenuto}</span>
  ) : (
    <div className="flex items-center gap-2">{contenuto}</div>
  );
}
