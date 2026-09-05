"use client";

import katex from "katex";
import { useMemo } from "react";
import { proteggiTextrm } from "./proteggi-textrm";

export interface FormulaProps {
  /** Il LaTeX prodotto dal motore. */
  tex: string;
  /** Formula centrata su riga propria invece che nel testo. */
  display?: boolean;
}

/** Rende una formula con KaTeX. Non lancia mai: se il LaTeX non è
 * renderizzabile nemmeno dopo la protezione, mostra il sorgente. */
export function Formula({ tex, display = false }: FormulaProps) {
  const reso = useMemo(() => {
    try {
      return katex.renderToString(proteggiTextrm(tex), {
        displayMode: display,
        throwOnError: true,
        strict: "ignore",
      });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (reso === null) {
    return <code className="rounded bg-muted px-1 py-0.5 text-sm">{tex}</code>;
  }
  return <span dangerouslySetInnerHTML={{ __html: reso }} />;
}
