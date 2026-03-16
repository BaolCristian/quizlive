export default function HelpPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <h1>Guida a SAVINT</h1>

      <p>
        <em>Versione 1.0.0 — aggiornato il 16 marzo 2026</em>
      </p>

      <p>
        SAVINT è una piattaforma di quiz interattivi pensata per la didattica.
        I docenti creano i quiz e li avviano in classe, gli studenti partecipano
        dai propri dispositivi in tempo reale.
      </p>

      <hr />

      <h2>Per il docente</h2>

      <h3>Creare un quiz</h3>
      <ol>
        <li>Dalla <strong>Dashboard</strong>, clicca <strong>Nuovo Quiz</strong>.</li>
        <li>Inserisci il titolo e, opzionalmente, una descrizione e dei tag.</li>
        <li>
          Aggiungi le domande. Tipi disponibili:
          <ul>
            <li><strong>Scelta multipla</strong> — una o più risposte corrette</li>
            <li><strong>Vero / Falso</strong></li>
            <li><strong>Risposta aperta</strong> — lo studente scrive la risposta</li>
            <li><strong>Ordinamento</strong> — mettere gli elementi nell'ordine corretto</li>
            <li><strong>Abbinamento</strong> — collegare coppie di elementi</li>
            <li><strong>Trova l&apos;errore</strong> — individuare le righe errate in un testo</li>
            <li><strong>Stima numerica</strong> — indovinare un valore numerico</li>
            <li><strong>Hotspot su immagine</strong> — cliccare il punto giusto su un&apos;immagine</li>
            <li><strong>Completamento codice</strong> — completare una riga di codice mancante</li>
          </ul>
        </li>
        <li>Per ogni domanda puoi impostare il <strong>tempo limite</strong> e i <strong>punti</strong>.</li>
        <li>Puoi abilitare la <strong>confidenza</strong>: dopo aver risposto, lo studente indica quanto è sicuro della risposta (influenza il punteggio).</li>
      </ol>

      <h3>Pubblicare un quiz</h3>
      <p>
        Usa l&apos;interruttore <strong>Pubblico/Privato</strong> nell&apos;editor del quiz.
        I quiz pubblici appaiono nella <strong>Libreria</strong> e possono essere
        giocati o duplicati da altri docenti.
      </p>

      <h3>Avviare una partita</h3>
      <ol>
        <li>Dalla dashboard, clicca <strong>Gioca</strong> sul quiz scelto.</li>
        <li>Viene generato un <strong>PIN</strong> a 6 cifre. Comunicalo agli studenti.</li>
        <li>Attendi che gli studenti si colleghino (li vedrai apparire nella lobby).</li>
        <li>Clicca <strong>Inizia Quiz</strong> — apparirà il countdown &quot;Pronti, Partenza, Via!&quot;.</li>
      </ol>

      <h3>Durante la partita</h3>
      <ul>
        <li>Le domande appaiono sulla lavagna (proiettore) e sui dispositivi degli studenti.</li>
        <li>Il <strong>timer</strong> conta alla rovescia. Negli ultimi 5 secondi si sente un tick e il timer diventa rosso.</li>
        <li>Puoi cliccare <strong>Avanti →</strong> per passare ai risultati senza aspettare il timer.</li>
        <li>Nella schermata dei risultati vedi la <strong>distribuzione delle risposte</strong> (istogramma) e la <strong>classifica</strong>.</li>
        <li>Le risposte corrette sono evidenziate in verde con ✓.</li>
        <li>Usa il bottone <strong>🔊/🔇</strong> per attivare/disattivare gli effetti sonori (vale anche per tutti gli studenti).</li>
      </ul>

      <h3>Fine partita</h3>
      <p>
        Dopo l&apos;ultima domanda, clicca <strong>Mostra podio</strong>.
        Appare la classifica finale con medaglie 🥇🥈🥉 e confetti.
      </p>

      <h3>Importazione quiz</h3>
      <p>Puoi importare quiz da:</p>
      <ul>
        <li><strong>File Excel</strong> — usa il template scaricabile dalla dashboard</li>
        <li><strong>File .qlz</strong> — formato nativo SAVINT (esporta/importa tra docenti)</li>
        <li><strong>Moodle XML</strong> — importa quiz da Moodle</li>
      </ul>

      <hr />

      <h2>Per lo studente</h2>

      <h3>Partecipare a una partita</h3>
      <ol>
        <li>Vai su <strong>SAVINT</strong> dal browser del telefono o computer.</li>
        <li>Inserisci il <strong>PIN</strong> comunicato dal docente.</li>
        <li>Scegli un <strong>nome</strong> e un <strong>avatar</strong>.</li>
        <li>Clicca <strong>Entra</strong> e attendi l&apos;inizio del quiz.</li>
      </ol>

      <h3>Rispondere alle domande</h3>
      <ul>
        <li><strong>Scelta multipla</strong>: se c&apos;è una sola risposta corretta, basta toccarla. Se ce ne sono più di una, selezionale tutte e poi conferma.</li>
        <li><strong>Vero / Falso</strong>: tocca il pulsante corrispondente.</li>
        <li><strong>Risposta aperta</strong>: scrivi la risposta e premi Invio o il bottone Conferma.</li>
        <li><strong>Ordinamento</strong>: tocca un elemento per selezionarlo, poi tocca la posizione dove spostarlo. Puoi anche usare le frecce ▲▼.</li>
        <li><strong>Abbinamento</strong>: tocca un elemento a sinistra, poi il corrispondente a destra.</li>
        <li><strong>Stima numerica</strong>: inserisci il numero e premi Invio.</li>
        <li><strong>Hotspot</strong>: tocca il punto corretto sull&apos;immagine.</li>
        <li><strong>Completamento codice</strong>: scegli l&apos;opzione corretta o scrivi il codice mancante.</li>
      </ul>

      <h3>Punteggio</h3>
      <ul>
        <li>Rispondi <strong>velocemente e correttamente</strong> per ottenere più punti.</li>
        <li>Per le domande a scelta multipla con più risposte corrette, il punteggio è <strong>parziale</strong>: ogni risposta corretta dà punti, ogni risposta sbagliata toglie punti.</li>
        <li>Se è abilitata la <strong>confidenza</strong>, indicare alta sicurezza e rispondere correttamente dà un bonus; alta sicurezza con risposta sbagliata dà una penalità.</li>
      </ul>

      <h3>Connessione</h3>
      <p>
        Se la connessione cade, il sistema tenta di riconnettersi automaticamente.
        Vedrai un banner giallo &quot;Riconnessione in corso...&quot;.
        Il tuo punteggio resta intatto per 2 minuti.
      </p>

      <hr />

      <h2>Informazioni</h2>
      <ul>
        <li><strong>Versione</strong>: 1.0.0</li>
        <li><strong>Autore</strong>: Cristian Virgili</li>
        <li><strong>Licenza</strong>: AGPL-3.0</li>
        <li><strong>Ultimo aggiornamento</strong>: 16 marzo 2026</li>
      </ul>
    </article>
  );
}
