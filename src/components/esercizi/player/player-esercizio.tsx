"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  loadQuestion,
  restoreQuestion,
  variables,
  parts,
  type Answer,
  type FeedbackItem,
  type NumbasQuestionJSON,
  type PartState,
  type QuestionState,
  Question,
} from "@savint/engine";
import { Button, buttonVariants } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import { ContenutoHtml } from "./contenuto-html";
import { InputParte, type PartePubblica } from "./parti";
import { completaTentativo, inviaRisposta } from "./usa-tentativo";

type Fase = "caricamento" | "esercizio" | "riepilogo" | "errore";
type PartBase = InstanceType<typeof parts.PartBase>;
type Punteggio = { score: number; maxScore: number };

export interface PlayerEsercizioProps {
  tentativoId: string;
  /** L'esercizio a cui appartiene il tentativo: serve al riepilogo per
   * offrire un nuovo tentativo senza far indovinare l'indirizzo. */
  esercizioId: string;
  seed: string;
  content: unknown;
  statoIniziale: QuestionState | null;
  locale: "it" | "en";
}

/** Costruisce la forma pubblica di una parte per il player (Task 7:
 * `PartePubblica`). Il motore sostituisce già da sé `p.promptHtml` (e quello
 * dei gap): `Question`'s constructor chiama `substitutePartPrompts` su ogni
 * parte al caricamento, quindi la `sostituisci(p.promptHtml)` qui sotto è
 * ridondante — innocua, ma non è lei a salvare la situazione. Il varco che il
 * motore lascia davvero aperto è nelle IMPOSTAZIONI di tipo (`p.settings`),
 * mai toccate da quel passaggio: le scelte di `1_n_2`/`m_n_2` e le righe/
 * colonne di una griglia `m_n_x` (`choices` sono le righe, `answers` le
 * colonne — vedi il commento di `InputGriglia`) arrivano qui ancora col
 * markup autorale (`\var{r1}`). È per questi tre campi che la sostituzione
 * qui sotto è necessaria: senza, tre degli otto esercizi mostrerebbero allo
 * studente markup grezzo nelle scelte o nella griglia. */
function costruisciParte(p: PartBase): PartePubblica {
  const scope = p.getScope();
  const sostituisci = (html: string) => variables.substituteHtml(html, scope);
  const impostazioni = p.settings as Record<string, unknown>;

  const parte: PartePubblica = {
    path: p.path,
    type: p.type,
    promptHtml: sostituisci(p.promptHtml),
    marks: p.marks,
  };

  if (p.type === "1_n_2" || p.type === "m_n_2") {
    parte.scelte = ((impostazioni.choices as string[] | undefined) ?? []).map(sostituisci);
  } else if (p.type === "m_n_x") {
    parte.righe = ((impostazioni.choices as string[] | undefined) ?? []).map(sostituisci);
    parte.colonne = ((impostazioni.answers as string[] | undefined) ?? []).map(sostituisci);
  } else if (p.type === "gapfill") {
    parte.gaps = p.gaps.map(costruisciParte);
  }

  return parte;
}

function trovaStato(path: string, stati: PartState[] | undefined): PartState | undefined {
  return stati?.find((s) => s.path === path);
}

/** La risposta da cui ripartire per una parte, ricostruita dallo stato
 * salvato. Per un `gapfill` lo stato tiene le risposte sui gap, mai sulla
 * parte madre (Task 8 dell'engine, `state.ts`): si ricompone l'array
 * ricorsivamente dagli stati dei gap. Un gap senza risposta nello stato
 * diventa `null` — il contratto di `InputGapfill` per "mai risposto", non
 * ancora la risposta che va al motore (vedi `preparaRispostaPerMotore`). */
function rispostaDaStato(parte: PartePubblica, stati: PartState[] | undefined): Answer {
  const stato = trovaStato(parte.path, stati);
  if (parte.type === "gapfill") {
    return (parte.gaps ?? []).map((gap) => rispostaDaStato(gap, stato?.gaps));
  }
  return (stato?.answer ?? null) as Answer;
}

/** Segnalazione del coordinatore: un gap mai toccato viaggia come `null`
 * nell'array della risposta di un `gapfill` — l'unica scelta type-legale
 * per `InputGapfill`, dato che `Answer` non ammette `undefined`. Ma
 * `GapFillPart#storeAnswer` (engine, `gapfill-part.ts`) inoltra ogni voce
 * dell'array al gap corrispondente INVARIATA: solo `undefined` significa
 * davvero "nessuna risposta"; `null` diventa una risposta letterale. Per un
 * gap di testo/numero il risultato è solo un'altra risposta sbagliata
 * (innocuo ma comunque falso: quel gap non è stato risposto). Per un gap a
 * scelta multipla (`1_n_2`/`m_n_2`/`m_n_x`) è peggio: la sua
 * `setStudentAnswer` chiama `.map()` sulla risposta, e un `null` la fa
 * incappare in un `TypeError` che risale fino a rompere l'invio
 * dell'INTERA parte gapfill (verificato al banco). Un gap davvero mai
 * risposto deve quindi arrivare al motore — e finire nello stato che si
 * manda al server — come OMESSO, non come `null`: la conversione va fatta
 * qui, al confine con `parts.PartBase#submit`, prima che l'array lasci il
 * player. */
function preparaRispostaPerMotore(parte: PartePubblica, valore: Answer): Answer {
  if (parte.type !== "gapfill" || !Array.isArray(valore)) return valore;
  const senzaNull = valore.map((v) => (v === null ? undefined : v));
  return senzaNull as unknown as Answer;
}

/** Una voce di feedback del motore.
 *
 * Il messaggio NON è testo semplice: una quindicina di voci di
 * `packages/engine/src/i18n/it.ts` portano marcatori (`<strong>{name}</strong>`
 * per l'intestazione di uno spazio di un gapfill, `<code>`, `<span
 * class="monospace">`), e resi come testo lo studente leggeva davvero
 * "<strong>Spazio 0</strong>". `dangerouslySetInnerHTML` non è la via
 * d'uscita: alcune di queste voci contengono anche formule, e il markup
 * arriva comunque da contenuti autorali. Si passa da `ContenutoHtml`, che ha
 * già l'allowlist dei tag e la divisione delle formule.
 *
 * Corretto e sbagliato avevano lo stesso identico aspetto — stesso colore,
 * nessuna icona — e l'unica distinzione era un `aria-label` su un `<p>`, un
 * elemento a cui l'ARIA vieta un nome accessibile: le tecnologie assistive lo
 * ignoravano, quindi la distinzione non esisteva né per gli occhi né per lo
 * screen reader. Qui il colore e l'icona la danno a vista, e un testo
 * `sr-only` — un nome vero, non un attributo su un elemento che non lo
 * ammette — la dà a chi ascolta. */
function VoceFeedback({ voce }: { voce: FeedbackItem }) {
  const t = useTranslations("esercizi");
  const corretta = voce.type === "correct";
  const sbagliata = voce.type === "incorrect";

  const stile = corretta
    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
    : sbagliata
      ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
      : "border-transparent text-muted-foreground";

  return (
    <div className={`flex items-start gap-2 rounded-md border px-2 py-1 text-sm ${stile}`}>
      {corretta && <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
      {sbagliata && <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
      <div className="min-w-0">
        {(corretta || sbagliata) && (
          <span className="sr-only">{corretta ? t("rispostaCorretta") : t("rispostaSbagliata")}: </span>
        )}
        <span>
          <ContenutoHtml html={voce.message} />
        </span>
      </div>
    </div>
  );
}

export function PlayerEsercizio({
  tentativoId, esercizioId, seed, content, statoIniziale, locale,
}: PlayerEsercizioProps) {
  const t = useTranslations("esercizi");
  // Lo stato del motore è un oggetto vivo (chiama `submit`, tiene punteggio e
  // storico): un `useRef`, non uno stato React, perché mutarlo non deve
  // ridisegnare da solo il componente.
  const domandaRef = useRef<Question | null>(null);

  const [fase, setFase] = useState<Fase>("caricamento");
  const [statementHtml, setStatementHtml] = useState("");
  const [parti, setParti] = useState<PartePubblica[]>([]);
  const [risposte, setRisposte] = useState<Record<string, Answer>>({});
  const [feedbackPerParte, setFeedbackPerParte] = useState<Record<string, FeedbackItem[]>>({});
  const [erroriRete, setErroriRete] = useState<Record<string, boolean>>({});
  const [inviando, setInviando] = useState<Record<string, boolean>>({});
  const [rispostoConSuccesso, setRispostoConSuccesso] = useState<Record<string, boolean>>({});
  const [punteggio, setPunteggio] = useState<Punteggio | null>(null);
  const [completando, setCompletando] = useState(false);
  const [erroreCompletamento, setErroreCompletamento] = useState(false);

  useEffect(() => {
    try {
      const json = content as NumbasQuestionJSON;
      const q = statoIniziale
        ? restoreQuestion(json, { ...statoIniziale, seed }, { locale })
        : loadQuestion(json, { seed, locale });
      domandaRef.current = q;

      const partiCostruite = q.parts.map(costruisciParte);
      const risposteIniziali: Record<string, Answer> = {};
      const rispostoIniziale: Record<string, boolean> = {};
      const feedbackIniziale: Record<string, FeedbackItem[]> = {};
      for (const parte of partiCostruite) {
        risposteIniziali[parte.path] = rispostaDaStato(parte, statoIniziale?.parts);
        if (trovaStato(parte.path, statoIniziale?.parts)?.answered) {
          rispostoIniziale[parte.path] = true;
        }
        // `restoreQuestion` rinvia da sé le parti già risposte
        // (`applyQuestionState`, engine): a questo punto una parte ripresa
        // ha già un `result` fresco, con lo stesso feedback che avrebbe
        // mostrato al momento dell'invio originale. Senza questo, riprendere
        // un tentativo mostrerebbe il punteggio giusto ma nessuna delle
        // spiegazioni sotto ogni parte — un mezzo ripristino.
        const parteEngine = q.getPart(parte.path);
        if (parteEngine?.result) {
          feedbackIniziale[parte.path] = parteEngine.result.feedback;
        }
      }

      setParti(partiCostruite);
      setStatementHtml(q.statementHtml);
      setRisposte(risposteIniziali);
      setRispostoConSuccesso(rispostoIniziale);
      setFeedbackPerParte(feedbackIniziale);
      const totale = q.score();
      setPunteggio({ score: totale.score, maxScore: totale.marks });
      setFase("esercizio");
    } catch (e) {
      console.error("[esercizi/player] impossibile caricare la domanda", e);
      setFase("errore");
    }
    // Contenuto, seme e stato iniziale sono fissi per tutta la vita del
    // componente: la domanda si carica una volta sola al montaggio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiaRisposta(path: string, valore: Answer) {
    setRisposte((r) => ({ ...r, [path]: valore }));
  }

  async function inviaParte(parte: PartePubblica) {
    const q = domandaRef.current;
    const parteEngine = q?.getPart(parte.path);
    if (!q || !parteEngine) return;

    const path = parte.path;
    const valoreGrezzo = risposte[path] ?? null;
    // L'ultimo punteggio e feedback CONFERMATI dal server, prima di questo
    // invio: se la richiesta fallisce, si torna esattamente qui, mai al
    // valore ottimistico appena calcolato in locale qualche riga sotto — il
    // punto centrale del disegno (punto 3 del dispaccio) è che sullo
    // schermo non deve mai restare un numero che il server non ha
    // confermato, nemmeno per un attimo dopo che la richiesta è fallita.
    const punteggioConfermato = punteggio;
    const feedbackConfermato = feedbackPerParte[path];

    setErroriRete((e) => ({ ...e, [path]: false }));
    setInviando((s) => ({ ...s, [path]: true }));

    try {
      // Correzione locale immediata, per il feedback ottimistico: mai i
      // numeri che vengono mostrati alla fine, quelli arrivano solo dal
      // server (punto 3 del dispaccio).
      const valorePerMotore = preparaRispostaPerMotore(parte, valoreGrezzo);
      const risultatoLocale = parteEngine.submit(valorePerMotore);
      const totaleLocale = q.score();
      // Il motore, e non l'esito HTTP, decide se la parte risulta RISPOSTA:
      // `submit()` mette `answered = false` quando non c'è una risposta da
      // correggere (`part-base.ts`, ramo `submit_no_staged_answer`). È lo
      // stesso criterio che userà il server, che rinvia solo le parti con
      // `answered: true` (engine, `applyQuestionState`).
      const parteRisposta = parteEngine.answered === true;

      setFeedbackPerParte((f) => ({ ...f, [path]: risultatoLocale.feedback }));
      setPunteggio({ score: totaleLocale.score, maxScore: totaleLocale.marks });

      const esito = await inviaRisposta(tentativoId, path, valoreGrezzo, q.toState(), locale);

      // Il server sostituisce sempre punteggio e feedback locali: è lui
      // l'autorità (punto 3 del dispaccio). Con una eccezione precisa: se non
      // manda NESSUNA voce di feedback. Succede per una parte che il motore
      // considera non risposta — il server rinvia solo le parti con
      // `answered: true`, quindi la sua `p.result` resta vuota e
      // `marking.ts` restituisce `[]`. Sostituire lì il feedback locale con
      // un array vuoto lasciava lo studente davanti a uno schermo muto: campo
      // vuoto, "Invia" premuto, punteggio fermo, nessuna spiegazione. Il
      // motivo — "Non hai inserito un numero valido." — è già stato calcolato
      // qui dal motore del browser: è quello che va mostrato. Non è un
      // punteggio, quindi non viola la regola che i numeri arrivano solo dal
      // server.
      setFeedbackPerParte((f) => ({
        ...f,
        [path]: esito.feedback.length > 0 ? esito.feedback : risultatoLocale.feedback,
      }));
      setPunteggio({ score: esito.score, maxScore: esito.maxScore });
      // Non "la richiesta è andata a buon fine", ma "la parte risulta
      // risposta": una POST riuscita su una parte lasciata in bianco tornava
      // 200, e marcarla risposta faceva comparire "Completa il tentativo"
      // dopo due Invia a vuoto — con un tentativo chiuso a 0 e un seme nuovo
      // alla visita seguente. È anche l'asimmetria che faceva sparire quel
      // bottone dopo una ricarica: al ripristino il flag arriva già dallo
      // stato del motore, che qui non veniva consultato.
      setRispostoConSuccesso((s) => ({ ...s, [path]: parteRisposta }));

      if (esito.score !== totaleLocale.score || esito.maxScore !== totaleLocale.marks) {
        // Browser e Node dovrebbero concordare sullo stesso motore: un
        // disallineamento è un segnale che non deve passare inosservato.
        console.warn("[esercizi/player] punteggio locale e del server divergono", {
          locale: totaleLocale,
          server: { score: esito.score, maxScore: esito.maxScore },
        });
      }
    } catch (e) {
      console.error("[esercizi/player] invio della risposta fallito", e);
      // Nessun numero non confermato dal server resta in vista: si torna al
      // punteggio e al feedback di prima di questo invio, non a quello
      // ottimistico calcolato in locale sopra.
      setPunteggio(punteggioConfermato);
      setFeedbackPerParte((f) => ({ ...f, [path]: feedbackConfermato ?? [] }));
      setErroriRete((er) => ({ ...er, [path]: true }));
    } finally {
      setInviando((s) => ({ ...s, [path]: false }));
    }
  }

  async function completaEsercizio() {
    setCompletando(true);
    setErroreCompletamento(false);
    try {
      const esito = await completaTentativo(tentativoId, locale);
      setPunteggio({ score: esito.score, maxScore: esito.maxScore });
      setFase("riepilogo");
    } catch (e) {
      console.error("[esercizi/player] completamento del tentativo fallito", e);
      setErroreCompletamento(true);
    } finally {
      setCompletando(false);
    }
  }

  if (fase === "caricamento") {
    return <p>{t("caricamento")}</p>;
  }

  if (fase === "errore") {
    return <p role="alert">{t("erroreCaricamento")}</p>;
  }

  if (fase === "riepilogo") {
    // Il riepilogo era un vicolo cieco: titolo, "Tentativo completato.",
    // punteggio, e nient'altro. Su un telefono le uniche uscite erano il
    // tasto indietro e la disconnessione, e una ricarica apriva un tentativo
    // nuovo con un altro seme — il punteggio appena preso diventava
    // irraggiungibile senza che nessuno lo avesse detto. Due uscite
    // esplicite, quindi: l'elenco degli esercizi e un nuovo tentativo.
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">{t("riepilogo")}</h1>
        <p>{t("tentativoCompletato")}</p>
        {punteggio && (
          <p className="text-lg font-semibold">
            {t("punteggio")}: {punteggio.score} / {punteggio.maxScore}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href="/studente" className={buttonVariants({ variant: "outline" })}>
            {t("tornaAgliEsercizi")}
          </Link>
          {/* Un'ancora vera, non un `Link`: aprire un nuovo tentativo è un
              giro dal server (`avviaORiprendi` ne crea uno con un seme
              nuovo, visto che questo è ormai chiuso), e una navigazione
              client verso la rotta su cui siamo già non lo farebbe. */}
          <a href={withBasePath(`/studente/esercizio/${esercizioId}`)} className={buttonVariants()}>
            {t("riprovaEsercizio")}
          </a>
        </div>
      </section>
    );
  }

  const partiDaRispondere = parti.filter((p) => p.type !== "information");
  const tutteRisposte =
    partiDaRispondere.length > 0 && partiDaRispondere.every((p) => rispostoConSuccesso[p.path]);

  return (
    <section className="space-y-6">
      <ContenutoHtml html={statementHtml} />
      {punteggio && (
        <p>
          {t("punteggio")}: {punteggio.score} / {punteggio.maxScore}
        </p>
      )}
      {parti.map((parte) => (
        <div key={parte.path} className="space-y-2 rounded-lg border p-4">
          <InputParte
            parte={parte}
            valore={risposte[parte.path] ?? null}
            onChange={(v) => cambiaRisposta(parte.path, v)}
            disabilitato={inviando[parte.path] === true}
          />
          {parte.type !== "information" && (
            <Button onClick={() => inviaParte(parte)} disabled={inviando[parte.path] === true}>
              {t("invia")}
            </Button>
          )}
          {(feedbackPerParte[parte.path] ?? []).map((f, i) => (
            <VoceFeedback key={i} voce={f} />
          ))}
          {erroriRete[parte.path] && (
            <div role="alert" className="space-y-1">
              <p>{t("erroreRete")}</p>
              <Button type="button" variant="outline" onClick={() => inviaParte(parte)}>
                {t("riprova")}
              </Button>
            </div>
          )}
        </div>
      ))}
      {tutteRisposte && (
        <Button onClick={completaEsercizio} disabled={completando}>
          {t("completa")}
        </Button>
      )}
      {erroreCompletamento && <p role="alert">{t("erroreRete")}</p>}
    </section>
  );
}
