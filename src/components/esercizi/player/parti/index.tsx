"use client";

import type { Answer, PartType } from "@savint/engine";
import { ContenutoHtml } from "../contenuto-html";
import { InputNumero } from "./numero";
import { InputSceltaSingola } from "./scelta-singola";
import { InputSceltaMultipla } from "./scelta-multipla";
import { InputGriglia } from "./griglia";
import { InputTesto } from "./testo";
import { InputEspressione } from "./espressione";
import { InputGapfill } from "./gapfill";

/** La forma di una parte esposta al player: HTML già pronto (variabili già
 * sostituite da chi costruisce questo oggetto), mai da sostituire qui. */
export interface PartePubblica {
  path: string;
  type: PartType;
  promptHtml: string;
  marks: number;
  /** 1_n_2, m_n_2: gli HTML delle scelte. */
  scelte?: string[];
  /** m_n_x: le scelte (righe). */
  righe?: string[];
  /** m_n_x: le risposte (colonne). */
  colonne?: string[];
  /** gapfill: una parte per spazio da riempire. */
  gaps?: PartePubblica[];
}

export interface InputParteProps {
  parte: PartePubblica;
  valore: Answer;
  onChange: (v: Answer) => void;
  disabilitato: boolean;
}

/** Dispatcher: rende il prompt una volta sola, poi il campo di input del
 * tipo giusto. I singoli campi non ripetono il prompt. */
export function InputParte(props: InputParteProps) {
  const { parte } = props;
  return (
    <div className="space-y-2" data-parte={parte.path}>
      <ContenutoHtml html={parte.promptHtml} />
      {campo(props)}
    </div>
  );
}

function campo(props: InputParteProps) {
  switch (props.parte.type) {
    case "numberentry":
      return <InputNumero {...props} />;
    case "patternmatch":
      return <InputTesto {...props} />;
    case "jme":
      return <InputEspressione {...props} />;
    case "1_n_2":
      return <InputSceltaSingola {...props} />;
    case "m_n_2":
      return <InputSceltaMultipla {...props} />;
    case "m_n_x":
      return <InputGriglia {...props} />;
    case "gapfill":
      return <InputGapfill {...props} />;
    case "information":
      return null;
    default:
      return null;
  }
}
