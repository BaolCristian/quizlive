"use client";

import type { Answer } from "@savint/engine";
import { ContenutoHtml } from "../contenuto-html";
import { InputParte, type InputParteProps } from "./index";

/** `gapfill`: uno spazio da riempire per ogni `parte.gaps`, ciascuno reso
 * con `InputParte` (dispatch ricorsivo: uno spazio può essere di qualunque
 * tipo semplice). La risposta è il vettore delle risposte, una per gap,
 * nello stesso ordine di `parte.gaps`.
 *
 * Il prompt di un gapfill segna con `[[n]]` il posto di ogni spazio dentro il
 * testo. Il motore non li sostituisce di proposito — è una questione di
 * presentazione, e la presentazione è compito del player: finché non lo
 * facevamo, lo studente di 03-sistemi-lineari leggeva `\(x = \) [[0]], \(y =
 * \) [[1]]` e trovava due caselle nude sotto, senza modo di sapere quale
 * fosse la x se non contandole. Ogni campo va quindi incastonato al posto del
 * suo segnaposto.
 *
 * Se il prompt non nomina TUTTI gli spazi (un autore che ne ha dimenticato
 * uno) si torna all'impilamento di prima: meglio un campo fuori posto che un
 * campo non mostrato affatto. */
export function InputGapfill({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const gaps = parte.gaps ?? [];
  const risposte: Answer[] = Array.isArray(valore) ? (valore as Answer[]) : gaps.map(() => null);

  function cambiaGap(indice: number, v: Answer) {
    const copia = [...risposte];
    copia[indice] = v;
    onChange(copia);
  }

  const tuttiNominati =
    gaps.length > 0 && gaps.every((_, indice) => parte.promptHtml.includes(`[[${indice}]]`));

  const campi = gaps.map((gap, indice) => (
    <InputParte
      key={gap.path}
      parte={gap}
      valore={risposte[indice] ?? null}
      onChange={(v) => cambiaGap(indice, v)}
      disabilitato={disabilitato}
      inLinea={tuttiNominati}
    />
  ));

  if (tuttiNominati) {
    return <ContenutoHtml html={parte.promptHtml} segnaposti={campi} />;
  }

  return (
    <div className="space-y-3">
      <ContenutoHtml html={parte.promptHtml} />
      {campi}
    </div>
  );
}
