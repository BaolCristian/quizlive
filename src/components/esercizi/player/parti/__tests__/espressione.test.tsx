import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Answer } from "@savint/engine";
import it_ from "@/messages/it.json";
import { InputParte, type PartePubblica } from "../index";

const base = { path: "p0", promptHtml: "<p>Domanda</p>", marks: 1, type: "jme" } as const;

function renderIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="it" messages={it_}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Come `NumeroControllato` in `parti.test.tsx`: senza uno stato che tiene
 * il valore corrente, digitare o premere un tasto non produrrebbe l'effetto
 * di un campo controllato reale. */
function EspressioneControllata({
  valoreIniziale = "",
  inLinea,
  onChange,
}: {
  valoreIniziale?: string;
  inLinea?: boolean;
  onChange?: (v: Answer) => void;
}) {
  const [valore, setValore] = useState<Answer>(valoreIniziale);
  const parte = { ...base } as PartePubblica;
  return (
    <InputParte
      parte={parte}
      valore={valore}
      onChange={(v) => {
        setValore(v);
        onChange?.(v);
      }}
      disabilitato={false}
      inLinea={inLinea}
    />
  );
}

describe("InputEspressione: tastiera di simboli", () => {
  it("un tasto inserisce al punto del cursore, non in fondo al campo", async () => {
    renderIntl(<EspressioneControllata />);
    const campo = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(campo, "12");
    // Cursore fra "1" e "2".
    campo.setSelectionRange(1, 1);

    const tastoPotenza = screen.getByRole("button", { name: it_.esercizi.tastoPotenza });
    await userEvent.click(tastoPotenza);

    expect(campo.value).toBe("1^2");
    // E il cursore è rimasto giusto dopo il `^`: continuare a scrivere
    // completa l'esponente invece di finire in fondo al campo. `skipClick`
    // perché uno studente che continua a scrivere non riclicca sul campo —
    // e un nuovo click (anche sintetico, senza coordinate reali) sposterebbe
    // il cursore, mascherando quello che il tasto ha davvero impostato.
    await userEvent.type(campo, "3", { skipClick: true });
    expect(campo.value).toBe("1^32");
  });

  it("il tasto di una funzione lascia il cursore dentro le parentesi", async () => {
    renderIntl(<EspressioneControllata />);
    const campo = screen.getByRole("textbox") as HTMLInputElement;

    const tastoRadice = screen.getByRole("button", { name: it_.esercizi.tastoRadice });
    await userEvent.click(tastoRadice);

    expect(campo.value).toBe("sqrt()");
    // Vedi sopra: `skipClick` per non perdere il cursore lasciato dal tasto.
    await userEvent.type(campo, "4", { skipClick: true });
    expect(campo.value).toBe("sqrt(4)");
  });

  it("l'anteprima compare per un'espressione valida", async () => {
    const { container } = renderIntl(<EspressioneControllata />);
    const campo = screen.getByRole("textbox");
    await userEvent.type(campo, "12*x^2");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("l'anteprima resta assente per un'espressione a metà", async () => {
    const { container } = renderIntl(<EspressioneControllata />);
    const campo = screen.getByRole("textbox");
    // "12*x^" non è un'espressione valida: ogni suo prefisso non lo è.
    await userEvent.type(campo, "12*x^");
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("l'anteprima resta assente appena dopo il tasto radice, prima che l'argomento sia scritto", async () => {
    // `sqrt()` non lancia (bug noto del motore: l'argomento mancante
    // diventa la stringa "undefined" nel LaTeX) ma non va mai mostrato:
    // sarebbe un errore del motore travestito da anteprima.
    const { container } = renderIntl(<EspressioneControllata />);
    const tastoRadice = screen.getByRole("button", { name: it_.esercizi.tastoRadice });
    await userEvent.click(tastoRadice);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent ?? "").not.toContain("undefined");
  });

  it("il campo resta vuoto: nessuna anteprima da mostrare", () => {
    const { container } = renderIntl(<EspressioneControllata />);
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("la variante in linea non ha la tastiera di simboli", () => {
    renderIntl(<EspressioneControllata inLinea valoreIniziale="x" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("la variante in linea non mostra mai l'anteprima, anche con un'espressione valida", () => {
    const { container } = renderIntl(<EspressioneControllata inLinea valoreIniziale="x^2" />);
    expect(container.querySelector(".katex")).toBeNull();
  });
});
