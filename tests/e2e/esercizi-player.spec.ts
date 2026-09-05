/**
 * E2E — Player esercizi: risoluzione, ricarica a metà, ripresa (Task 10)
 *
 * Copre l'intero motivo per cui esiste questo sotto-progetto: uno studente
 * apre un esercizio, risponde a una parte, il server conferma un punteggio,
 * e se lo studente ricarica la pagina a metà tentativo la trova esattamente
 * come l'ha lasciata — risposta nel campo, punteggio confermato. Una prova
 * che si limitasse a verificare che la pagina si carica non proverebbe
 * niente: qui si asserisce il VALORE ripristinato e il PUNTEGGIO
 * ripristinato, non solo la presenza di un campo.
 *
 * Esercizio scelto: 03-sistemi-lineari (content/esercizi). È una singola
 * parte "gapfill" con due spazi numberentry — lo spazio deliberatamente
 * lasciato vuoto (il secondo) esercita il percorso "gap mai risposto va
 * omesso, non `null`" che i commit del Task 9 hanno dovuto sistemare
 * (altrimenti il motore lancia un TypeError sull'intera parte). La risposta
 * numerica del primo spazio (x0) è casuale per seme: la prova non assume
 * mai che "2" sia la risposta corretta, cattura invece il punteggio
 * confermato dal server dopo l'invio e verifica che sia ESATTAMENTE lo
 * stesso dopo il reload — che sia 0/2, 1/2 o 2/2 non conta, conta che non
 * cambi da solo alla ricarica.
 *
 * NON si asserisce che il bottone "Completa il tentativo" resti visibile
 * dopo il reload, e questo è deliberato, non una svista: con un solo gap su
 * due risposto, il bottone appare PRIMA del reload (il player marca la
 * parte "risposta con successo" da qualunque POST riuscito) ma sparisce
 * DOPO il reload (lo stato ricostruito dal motore segna `answered: false`
 * per una parte gapfill finché non hanno risposta TUTTI i gap — verificato
 * a mano nel `state` persistito). I due segnali — "inviato con successo" e
 * "risposta completa secondo il motore" — divergono proprio in questo
 * caso, ed è una scoperta di questo task, riportata nel report, non
 * qualcosa che spetti a questa prova normalizzare o a Task 10 correggere.
 *
 * Pre-requisiti
 * -------------
 *  - Il server di sviluppo del worktree deve essere già in esecuzione
 *    (progetto lanciato con `tsx watch src/server.ts`), con `studente@scuola.it`
 *    seminato da `prisma/seed.ts` (già presente: non è stato necessario
 *    aggiungere un altro utente di prova).
 *  - `NODE_ENV=development` o `DEMO_MODE=true` così il provider "Dev Login"
 *    (credentials, solo email) è registrato — vedi `src/lib/auth/config.ts`.
 *
 * Nota sulla ripetibilità: `avviaORiprendi` riusa il tentativo IN_PROGRESS
 * più recente per (studente, esercizio) entro la finestra di conservazione,
 * quindi rilanciare questa prova più volte di fila riprende lo stesso
 * tentativo invece di crearne uno nuovo — la prova sovrascrive comunque la
 * risposta del primo spazio a ogni esecuzione, quindi resta deterministica.
 */
import { test, expect, type Page } from "@playwright/test";

const STUDENT_EMAIL = "studente@scuola.it";
const ESERCIZIO_ID = "03-sistemi-lineari";

// La UI del player è tradotta con next-intl: la lingua segue il cookie
// "locale" o, in sua assenza, l'header Accept-Language del browser (vedi
// `src/i18n/request.ts`). Il profilo Chromium di Playwright di default manda
// un Accept-Language inglese, che farebbe leggere "Submit"/"Score" invece di
// "Invia"/"Punteggio". Si fissa qui l'italiano per l'intero file.
test.use({ locale: "it-IT" });

async function loginAsStudent(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Il primo compile del dev server può essere lento: attesa generosa
  // perché il form delle credenziali finisca di idratarsi (stesso motivo
  // di quiz-test-mode.spec.ts).
  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible({ timeout: 60_000 });
  await emailInput.fill(STUDENT_EMAIL);
  // L'etichetta del bottone dice sempre "Entra come docente" (residuo del
  // fatto che il Dev Login è nato solo per il docente demo): funziona
  // comunque per qualunque email seminata, studente incluso — vedi il
  // report per la segnalazione del testo fuorviante.
  await page
    .getByRole("button", { name: /entra come docente|enter as teacher/i })
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

test.describe("Player esercizi — risoluzione e ripresa", () => {
  test("lo studente risolve, ricarica a metà e riprende con risposta e punteggio intatti", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await loginAsStudent(page);

    await page.goto(`/studente/esercizio/${ESERCIZIO_ID}`);
    await expect(page.locator(".katex").first()).toBeVisible({ timeout: 20_000 });

    // La parte è un gapfill con due spazi numberentry: si risponde solo al
    // primo, il secondo resta vuoto (percorso "gap mai risposto" del Task 9).
    const campi = page.getByRole("textbox");
    await expect(campi).toHaveCount(2);
    await campi.nth(0).fill("2");
    await page.getByRole("button", { name: /^invia$/i }).click();

    // Segnale forte che il server ha confermato la parte come risposta: il
    // bottone "Completa il tentativo" appare solo quando ogni parte non
    // "information" risulta risposta con successo (player-esercizio.tsx,
    // `tutteRisposte`). Non appare mai su un caricamento fresco.
    const completaBtn = page.getByRole("button", { name: /completa il tentativo/i });
    await expect(completaBtn).toBeVisible({ timeout: 15_000 });

    const punteggioLocator = page.getByText(/Punteggio:\s*\d+\s*\/\s*\d+/);
    await expect(punteggioLocator).toBeVisible();
    const punteggioTesto = (await punteggioLocator.textContent())?.trim() ?? "";
    const match = punteggioTesto.match(/(\d+)\s*\/\s*(\d+)/);
    expect(match, `testo del punteggio inatteso: "${punteggioTesto}"`).not.toBeNull();
    const [, scoreConfermato, maxScoreConfermato] = match!;

    // Ricarica a metà tentativo: nessun nuovo invio, solo un reload della
    // pagina — il server ricostruisce lo stato da `avviaORiprendi`.
    await page.reload();
    await expect(page.locator(".katex").first()).toBeVisible({ timeout: 20_000 });

    // 1. Il valore inserito torna esattamente al suo posto nel campo.
    await expect(page.getByRole("textbox").nth(0)).toHaveValue("2", { timeout: 15_000 });
    // Il secondo spazio, mai risposto, resta vuoto — non "null" letterale.
    await expect(page.getByRole("textbox").nth(1)).toHaveValue("");

    // 2. Il punteggio confermato dal server è identico, senza reinviare
    //    nulla — non è tornato a 0 né è stato ricalcolato in modo diverso.
    await expect(
      page.getByText(new RegExp(`Punteggio:\\s*${scoreConfermato}\\s*/\\s*${maxScoreConfermato}`)),
    ).toBeVisible();
  });
});
