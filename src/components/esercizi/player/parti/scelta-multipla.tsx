"use client";

import { ContenutoHtml } from "../contenuto-html";
import type { InputParteProps } from "./index";

/** `m_n_2`: più scelte indipendenti, la risposta è un vettore di booleani
 * (una voce per scelta, nessuna correzione applicata qui). */
export function InputSceltaMultipla({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const scelte = parte.scelte ?? [];
  const stato: boolean[] = Array.isArray(valore) ? (valore as boolean[]) : scelte.map(() => false);

  function commuta(i: number) {
    const copia = [...stato];
    copia[i] = !copia[i];
    onChange(copia);
  }

  return (
    <div className="space-y-1">
      {scelte.map((html, i) => {
        const id = `scelta-${parte.path}-${i}`;
        return (
          <div key={id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id}
              checked={stato[i] ?? false}
              disabled={disabilitato}
              onChange={() => commuta(i)}
            />
            <label htmlFor={id}>
              <ContenutoHtml html={html} />
            </label>
          </div>
        );
      })}
    </div>
  );
}
