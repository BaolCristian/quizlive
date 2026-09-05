"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

/** `patternmatch`: la risposta è testo libero, confrontato dal motore con
 * un pattern (non un numero: nessun `inputMode` numerico). */
export function InputTesto({ parte, valore, onChange, disabilitato, inLinea }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  const contenuto = (
    <>
      <label htmlFor={id} className="sr-only">
        {t("rispostaTesto")}
      </label>
      <Input
        id={id}
        inputMode="text"
        autoComplete="off"
        placeholder={inLinea ? undefined : t("segnapostoTesto")}
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
