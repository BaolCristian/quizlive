"use client";

import type { Answer } from "@savint/engine";
import { InputParte, type InputParteProps } from "./index";

/** `gapfill`: uno spazio da riempire per ogni `parte.gaps`, ciascuno reso
 * con `InputParte` (dispatch ricorsivo: uno spazio può essere di qualunque
 * tipo semplice). La risposta è il vettore delle risposte, una per gap,
 * nello stesso ordine di `parte.gaps`. */
export function InputGapfill({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const gaps = parte.gaps ?? [];
  const risposte: Answer[] = Array.isArray(valore) ? (valore as Answer[]) : gaps.map(() => null);

  function cambiaGap(indice: number, v: Answer) {
    const copia = [...risposte];
    copia[indice] = v;
    onChange(copia);
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap, indice) => (
        <InputParte
          key={gap.path}
          parte={gap}
          valore={risposte[indice] ?? null}
          onChange={(v) => cambiaGap(indice, v)}
          disabilitato={disabilitato}
        />
      ))}
    </div>
  );
}
