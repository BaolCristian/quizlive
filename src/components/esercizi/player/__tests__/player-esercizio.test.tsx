import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
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

function montaggio(props: Partial<React.ComponentProps<typeof PlayerEsercizio>> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PlayerEsercizio
        tentativoId="t1"
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
});
