"use client";

import { ContenutoHtml } from "../contenuto-html";
import type { InputParteProps } from "./index";

/** `1_n_2`: una sola scelta ammessa, la risposta è l'indice scelto. */
export function InputSceltaSingola({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const scelte = parte.scelte ?? [];
  const nome = `scelta-${parte.path}`;
  return (
    <div className="space-y-1" role="radiogroup">
      {scelte.map((html, i) => {
        const id = `${nome}-${i}`;
        return (
          <div key={id} className="flex items-center gap-2">
            <input
              type="radio"
              id={id}
              name={nome}
              checked={valore === i}
              disabled={disabilitato}
              onChange={() => onChange(i)}
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
