"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

/** `patternmatch`: la risposta è testo libero, confrontato dal motore con
 * un pattern (non un numero: nessun `inputMode` numerico). */
export function InputTesto({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t("rispostaTesto")}
      </label>
      <Input
        id={id}
        inputMode="text"
        autoComplete="off"
        placeholder={t("segnapostoTesto")}
        value={typeof valore === "string" ? valore : ""}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
