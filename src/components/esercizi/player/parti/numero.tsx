"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

/** `numberentry`: la risposta è la stringa digitata (il motore la
 * interpreta lui, il campo non corregge né normalizza nulla). */
export function InputNumero({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t("laTuaRisposta")}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={typeof valore === "string" ? valore : ""}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
