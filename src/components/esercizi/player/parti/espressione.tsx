"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

/** `jme`: la risposta è un'espressione matematica in sintassi JME, testo
 * libero (lettere, operatori, parentesi: non un `inputMode` numerico). */
export function InputEspressione({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t("rispostaEspressione")}
      </label>
      <Input
        id={id}
        inputMode="text"
        autoComplete="off"
        placeholder={t("segnapostoEspressione")}
        value={typeof valore === "string" ? valore : ""}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
