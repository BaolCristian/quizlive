import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "fs";
import path from "path";
import type { NumbasQuestionJSON } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import { PlayerEsercizio } from "../player-esercizio";

const { question } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/01-equazione-primo-grado.json"), "utf8"),
) as { question: unknown };

const { question: disequazione } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/04-disequazioni-secondo-grado.json"), "utf8"),
) as { question: NumbasQuestionJSON };

// Fixture minimale, non un file sotto content/esercizi/ (compito di un altro
// task): un gapfill con una parte "toccata" (patternmatch, risposta corretta
// "ok") e una parte a scelta singola MAI toccata. Serve solo a dimostrare il
// confine fra "nessuna risposta" e "risposta letterale null" (vedi il test
// "un gap di scelta multipla mai toccato...").
const gapfillConSceltaFixture = {
  name: "Prova gapfill",
  statement: "<p>Prova</p>",
  variables: {},
  parts: [
    {
      type: "gapfill",
      prompt: "<p>Spazio testo: [[0]] — spazio a scelta: [[1]]</p>",
      gaps: [
        { type: "patternmatch", marks: 1, matchMode: "exact", answer: "ok", allowEmpty: false },
        { type: "1_n_2", marks: 1, choices: ["a", "b"], matrix: ["1", "-1"] },
      ],
    },
  ],
} as unknown as NumbasQuestionJSON;

// Fixture minimale per il ramo `m_n_x` di `costruisciParte`: nessun esercizio
// spedito ha variabili nelle righe o nelle colonne di una griglia, quindi
// senza questa fixture quel ramo non è provato da nessun test (fix round 1,
// punto 4). `choices` sono le righe, `answers` le colonne.
const grigliaConVariabiliFixture = {
  name: "Prova griglia",
  statement: "<p>Prova</p>",
  variables: { a: { name: "a", definition: "3" }, b: { name: "b", definition: "5" } },
  parts: [
    {
      type: "m_n_x",
      marks: 0,
      prompt: "<p>Abbina</p>",
      choices: ["riga \\(\\var{a}\\)", "riga fissa"],
      answers: ["colonna \\(\\var{b}\\)", "colonna fissa"],
      matrix: [
        ["1", "-1"],
        ["-1", "1"],
      ],
    },
  ],
} as unknown as NumbasQuestionJSON;

function montaggio(props: Partial<React.ComponentProps<typeof PlayerEsercizio>> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PlayerEsercizio
        tentativoId="t1"
        esercizioId="01-equazione-primo-grado"
        seed="seme-di-prova"
        content={question}
        statoIniziale={null}
        locale="it"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(
    JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Giusto." }] }),
    { status: 200 },
  )) as never;
});

describe("PlayerEsercizio", () => {
  it("mostra il testo della domanda con le variabili sostituite", async () => {
    const { container } = montaggio();
    await waitFor(() => expect(screen.getByText(/Risolvi/)).toBeInTheDocument());
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("invia la risposta e mostra il feedback che arriva dal server", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText("Giusto.")).toBeInTheDocument());
  });

  it("il punteggio mostrato e' quello del server, non quello locale", async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ score: 0, maxScore: 2, feedback: [{ type: "incorrect", message: "No." }] }),
      { status: 200 },
    )) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(/0\s*\/\s*2/)).toBeInTheDocument());
  });

  it("riprende da uno stato salvato con le risposte al loro posto", async () => {
    const stato = {
      seed: "seme-di-prova", answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 2, marks: 2,
      parts: [{ path: "p0", answered: true, score: 2, marks: 2, answer: "3" }],
    };
    montaggio({ statoIniziale: stato as never });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("3"));
  });

  // Fix round 1, punto 2: `restoreQuestion` rinvia da sé le parti già
  // risposte (`applyQuestionState`, engine), quindi al ripristino la parte
  // ha già un `result` fresco. "3" non è la soluzione di questa domanda con
  // questo seme (lo stesso invio a un caricamento fresco dà punteggio
  // locale 0, vedi il test sopra sul disallineamento col server): il
  // feedback riportato deve essere quello "sbagliato" vero, non un riquadro
  // vuoto sotto un punteggio che intanto è corretto.
  it("riprende anche il feedback della parte, non solo la risposta e il punteggio", async () => {
    const stato = {
      seed: "seme-di-prova", answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 0, marks: 2,
      parts: [{ path: "p0", answered: true, score: 0, marks: 2, answer: "3" }],
    };
    montaggio({ statoIniziale: stato as never });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("3"));
    expect(screen.getByText("La tua risposta non è corretta.")).toBeInTheDocument();
  });

  it("mostra la fase di errore se il contenuto non si carica", async () => {
    montaggio({ content: { partsMode: "explore", parts: [] } });
    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreCaricamento)).toBeInTheDocument());
  });

  it("un errore di rete non perde la risposta digitata", async () => {
    global.fetch = vi.fn(async () => { throw new Error("rete giù"); }) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreRete)).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("3");
  });

  // Punto 1 del dispaccio: il motore restituisce il markup autorale
  // (`\var{r1}`), mai quello reso — vale per il prompt ma anche per le
  // scelte di una parte a scelta multipla e per righe/colonne di una
  // griglia. Se il player si limitasse a sostituire il prompt, questo
  // esercizio mostrerebbe agli studenti il markup grezzo `\var{...}` dentro
  // ogni scelta: KaTeX non conosce `\var` e la formula ricadrebbe sul
  // fallback testuale di `Formula`, lasciando la stringa "\var{" visibile.
  it("sostituisce le variabili anche nelle scelte di una parte a scelta multipla, non solo nel prompt", async () => {
    const { container } = montaggio({ content: disequazione, seed: "seme-di-prova" });
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThan(1));
    expect(container.textContent).not.toMatch(/\\var\{/);
  });

  // Punto 2 del dispaccio: la lingua dello studente va sull'header
  // `x-savint-locale`, altrimenti il feedback torna sempre in italiano.
  it("manda la lingua dello studente nell'header x-savint-locale (italiano di default)", async () => {
    const fetchMock: (...args: [string | URL | Request, RequestInit?]) => Promise<Response> = vi.fn(async () => new Response(
      JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Giusto." }] }),
      { status: 200 },
    ));
    global.fetch = fetchMock as never;
    montaggio({ locale: "it" });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const opzioni = vi.mocked(fetchMock).mock.calls[0]?.[1];
    expect(opzioni?.headers).toMatchObject({ "x-savint-locale": "it" });
  });

  it("manda x-savint-locale=en quando lo studente lavora in inglese", async () => {
    const fetchMock: (...args: [string | URL | Request, RequestInit?]) => Promise<Response> = vi.fn(async () => new Response(
      JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Correct." }] }),
      { status: 200 },
    ));
    global.fetch = fetchMock as never;
    montaggio({ locale: "en" });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const opzioni = vi.mocked(fetchMock).mock.calls[0]?.[1];
    expect(opzioni?.headers).toMatchObject({ "x-savint-locale": "en" });
  });

  // Segnalazione del coordinatore: `InputGapfill` rappresenta un gap mai
  // toccato come `null` (l'unica scelta type-legale, `Answer` non ammette
  // `undefined`). Inoltrato così com'è a `GapFillPart#storeAnswer`, un gap a
  // scelta multipla (`1_n_2`/`m_n_2`/`m_n_x`) lo tratta come una risposta
  // vera e la sua `setStudentAnswer` fa `.map()` su quel `null`: un
  // `TypeError` che risale fino a rompere l'invio dell'INTERA parte gapfill
  // (verificato al banco: `Cannot read properties of null (reading 'map')`).
  // Un gap davvero mai risposto deve arrivare al motore come omesso
  // (`undefined`), non come `null`: questo test fallirebbe (per un errore di
  // rete non gestito dovuto all'eccezione) se il player tornasse a inoltrare
  // `null` invariato.
  it("un gap di scelta multipla mai toccato in un gapfill non manda in errore l'invio (null vs omesso)", async () => {
    montaggio({ content: gapfillConSceltaFixture, seed: "seme-gapfill" });
    await waitFor(() => screen.getByRole("textbox"));
    // Solo lo spazio di testo viene compilato: lo spazio a scelta singola
    // resta esattamente come l'ha lasciato `InputGapfill`, cioè `null`.
    await userEvent.type(screen.getByRole("textbox"), "ok");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    // Con la conversione corretta, la correzione locale va a buon fine (lo
    // spazio di testo è corretto) e non emerge mai l'errore di rete generico
    // che il player mostrerebbe se la correzione locale avesse lanciato.
    await waitFor(() => expect(screen.getByText("Giusto.")).toBeInTheDocument());
    expect(screen.queryByText(messaggiIt.esercizi.erroreRete)).toBeNull();
  });

  // Fix round 1, punto 1 (Important): il punteggio ottimistico calcolato in
  // locale non deve mai restare in vista quando l'invio al server fallisce.
  // Si conferma prima un punteggio col server (2/2), poi si invia di nuovo
  // con una risposta chiaramente sbagliata (punteggio locale: 0/2) mentre la
  // rete cade: se il player non ripristinasse il valore confermato, lo
  // schermo mostrerebbe 0/2 accanto all'errore di rete — un numero che il
  // server non ha mai confermato.
  it("un errore di rete non lascia in vista il punteggio ottimistico locale", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(/2\s*\/\s*2/)).toBeInTheDocument());

    global.fetch = vi.fn(async () => { throw new Error("rete giù"); }) as never;
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "999999");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreRete)).toBeInTheDocument());
    expect(screen.getByText(/2\s*\/\s*2/)).toBeInTheDocument();
    expect(screen.queryByText(/0\s*\/\s*2/)).toBeNull();
  });

  // Onda finale, punto 5: il riepilogo era un vicolo cieco — punteggio e
  // nient'altro. Su un telefono le uniche uscite erano il tasto indietro e la
  // disconnessione, e una ricarica apriva un tentativo nuovo con un altro
  // seme, rendendo irraggiungibile il punteggio appena preso.
  it("il riepilogo offre due uscite: l'elenco e un nuovo tentativo", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await userEvent.click(
      await screen.findByRole("button", { name: messaggiIt.esercizi.completa }),
    );

    await waitFor(() =>
      expect(screen.getByText(messaggiIt.esercizi.tentativoCompletato)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: messaggiIt.esercizi.tornaAgliEsercizi }),
    ).toHaveAttribute("href", "/studente");
    // L'esercizio si riapre dal suo indirizzo: un nuovo tentativo, non la
    // stessa pagina già chiusa.
    expect(
      screen.getByRole("link", { name: messaggiIt.esercizi.riprovaEsercizio }),
    ).toHaveAttribute("href", expect.stringContaining("/studente/esercizio/01-equazione-primo-grado"));
  });

  // Onda finale, punto 2: i messaggi del motore portano marcatori (una
  // quindicina in `packages/engine/src/i18n/it.ts`, `<strong>` e `<code>` in
  // testa) e resi come testo semplice lo studente leggeva davvero
  // "<strong>Spazio 0</strong>" — verificato sull'esercizio gapfill.
  it("rende i marcatori del feedback invece di mostrarli allo studente", async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({
        score: 1, maxScore: 2,
        feedback: [{ type: "incorrect", message: "<strong>Spazio 0</strong>: sbagliato \\(x^2\\)" }],
      }),
      { status: 200 },
    )) as never;
    const { container } = montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() => expect(container.querySelector("strong")).not.toBeNull());
    expect(container.querySelector("strong")!.textContent).toBe("Spazio 0");
    // Nessun tag rimasto come testo, e la formula dentro il messaggio passa
    // comunque da KaTeX (il motivo per cui non si usa dangerouslySetInnerHTML).
    expect(container.textContent).not.toContain("<strong>");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  });

  // Onda finale, punto 1. Lo stub di `fetch` di questo file finge un server
  // generoso: qualunque richiesta torna con una voce di feedback e 2/2.
  // Nessun test poteva quindi vedere il caso reale peggiore — una parte che
  // il MOTORE considera non risposta. Il server rinvia solo le parti con
  // `answered: true` (engine, `applyQuestionState`) e restituisce
  // `p.result?.feedback ?? []` (`marking.ts`): per un campo lasciato vuoto la
  // risposta HTTP è 200, `feedback: []` e il punteggio invariato. Lo stub qui
  // sotto si comporta così. Prima del fix questo bastava a produrre lo
  // schermo muto visto al banco: nessun messaggio e "Completa il tentativo"
  // in vista dopo un Invia a vuoto.
  it("un Invia a campo vuoto spiega perche' e non sblocca il completamento", async () => {
    const chiamate: unknown[] = [];
    global.fetch = vi.fn(async (...args: unknown[]) => {
      chiamate.push(args);
      // Come la rotta vera su una parte che il motore non considera risposta.
      return new Response(JSON.stringify({ score: 0, maxScore: 2, feedback: [] }), { status: 200 });
    }) as never;

    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    // Nessuna digitazione: si preme Invia sul campo vuoto.
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(chiamate.length).toBe(1));

    // 1. Lo studente riceve una spiegazione, non il silenzio: quando il
    //    server non manda feedback si mostra quello calcolato in locale.
    //    (Su 07-limiti-notevoli il motore dice "Non hai inserito un numero
    //    valido."; su questo esercizio, con il campo lasciato del tutto in
    //    bianco, dice "Non hai risposto a questa domanda." — è lo stesso
    //    percorso `submit_no_staged_answer`.)
    await waitFor(() =>
      expect(screen.getByText("Non hai risposto a questa domanda.")).toBeInTheDocument(),
    );
    // 2. La parte NON risulta risposta: il bottone di completamento resta
    //    fuori vista, quindi non si può chiudere il tentativo a 0 premendo
    //    Invia due volte a vuoto.
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.completa })).toBeNull();
  });

  // La faccia opposta dello stesso flag: una risposta che il motore accetta
  // deve sbloccare il completamento (nessuna regressione dal punto 1).
  it("una risposta accettata dal motore sblocca il completamento", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messaggiIt.esercizi.completa })).toBeInTheDocument(),
    );
  });

  // Fix round 1, punto 4: nessun esercizio spedito ha variabili nelle righe
  // o nelle colonne di una griglia (`m_n_x`), quindi quel ramo di
  // `costruisciParte` non era provato da nessun test.
  it("sostituisce le variabili anche nelle righe e nelle colonne di una griglia", async () => {
    const { container } = montaggio({ content: grigliaConVariabiliFixture, seed: "seme-griglia" });
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThan(1));
    expect(container.textContent).not.toMatch(/\\var\{/);
    expect(screen.getAllByRole("checkbox").length).toBe(4);
  });
});
