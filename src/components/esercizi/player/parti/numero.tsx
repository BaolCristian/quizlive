"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

/** `numberentry`: la risposta è la stringa digitata (il motore la
 * interpreta lui, il campo non corregge né normalizza nulla). */
export function InputNumero({ parte, valore, onChange, disabilitato, inLinea }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  const contenuto = (
    <>
      <label htmlFor={id} className="sr-only">
        {t("laTuaRisposta")}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={inLinea ? "w-24" : undefined}
        value={typeof valore === "string" ? valore : ""}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );

  // In linea (uno spazio di un gapfill al posto del suo `[[n]]`) il
  // contenitore dev'essere un elemento "phrasing": il testo intorno sta in un
  // paragrafo, e un `div` largo quanto la riga spezzerebbe la frase in tre.
  return inLinea ? (
    <span className="inline-flex items-center gap-2 align-middle">{contenuto}</span>
  ) : (
    <div className="flex items-center gap-2">{contenuto}</div>
  );
}
