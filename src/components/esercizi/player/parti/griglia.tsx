"use client";

import { useTranslations } from "next-intl";
import { ContenutoHtml } from "../contenuto-html";
import type { InputParteProps } from "./index";

/** `m_n_x`: griglia scelte × risposte.
 *
 * Il motore accetta due forme per la risposta (quella "naturale"
 * `[scelta][risposta]` e la matrice interna `ticks`, `[risposta][scelta]`)
 * e su una griglia quadrata non può distinguerle dalla sola forma. Il
 * player manda SEMPRE `ticks`: `righe` sono le scelte, `colonne` le
 * risposte, quindi l'indice di riga (`i`) è la "scelta" e l'indice di
 * colonna (`j`) è la "risposta" — la matrice va quindi indicizzata
 * `ticks[j][i]`, mai `ticks[i][j]`. Scambiarli produce comunque un
 * `boolean[][]` della stessa forma su una griglia quadrata: l'ambiguità
 * non si vede finché qualcuno non prova a correggerla. */
export function InputGriglia({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const t = useTranslations("esercizi");
  const righe = parte.righe ?? [];
  const colonne = parte.colonne ?? [];
  // `ticks` del motore: indicizzata [risposta][scelta] = [colonna][riga].
  const ticks: boolean[][] = Array.isArray(valore)
    ? (valore as boolean[][])
    : colonne.map(() => righe.map(() => false));

  function commuta(risposta: number, scelta: number) {
    const copia = ticks.map((r) => [...r]);
    copia[risposta]![scelta] = !copia[risposta]![scelta];
    onChange(copia);
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th />
          {colonne.map((c, j) => (
            <th key={j} scope="col">
              <ContenutoHtml html={c} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {righe.map((r, i) => (
          <tr key={i}>
            <th scope="row" className="text-left font-normal">
              <ContenutoHtml html={r} />
            </th>
            {colonne.map((_, j) => (
              <td key={j} className="text-center">
                <input
                  type="checkbox"
                  aria-label={t("cellaGriglia", { riga: i + 1, colonna: j + 1 })}
                  checked={ticks[j]?.[i] ?? false}
                  disabled={disabilitato}
                  onChange={() => commuta(j, i)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
