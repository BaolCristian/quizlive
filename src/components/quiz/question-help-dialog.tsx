"use client";

import { X } from "lucide-react";

interface HelpContent {
  icon: string;
  title: string;
  description: string;
  editorTip: string;
  playerView: string;
  scoring: string;
  example: {
    question: string;
    answer: string;
  };
}

const HELP: Record<string, HelpContent> = {
  MULTIPLE_CHOICE: {
    icon: "🔘",
    title: "Scelta multipla",
    description:
      "Lo studente sceglie una o piu risposte tra le opzioni proposte. Puoi avere da 2 a 6 opzioni e piu di una puo essere corretta.",
    editorTip: "Clicca il cerchio accanto a ogni opzione per segnarla come corretta.",
    playerView: "Lo studente vede 4 bottoni colorati e tocca la risposta.",
    scoring: "Corretto se seleziona esattamente le risposte giuste. Punteggio basato sulla velocita.",
    example: {
      question: "Qual e la capitale dell'Italia?",
      answer: "Roma (corretta), Milano, Napoli, Torino",
    },
  },
  TRUE_FALSE: {
    icon: "✅",
    title: "Vero o Falso",
    description:
      "Lo studente sceglie tra Vero e Falso. La domanda piu semplice e veloce.",
    editorTip: "Clicca su Vero o Falso per impostare la risposta corretta.",
    playerView: "Lo studente vede due grandi bottoni: Vero e Falso.",
    scoring: "Corretto/errato. Punteggio basato sulla velocita.",
    example: {
      question: "La Terra e il terzo pianeta dal Sole.",
      answer: "Vero",
    },
  },
  OPEN_ANSWER: {
    icon: "✏️",
    title: "Risposta aperta",
    description:
      "Lo studente scrive liberamente la risposta. Puoi indicare piu risposte accettate (es. sinonimi).",
    editorTip:
      "Aggiungi tutte le varianti accettabili (es. 'Roma', 'roma', 'ROMA'). Il confronto ignora maiuscole/minuscole.",
    playerView: "Lo studente vede un campo di testo e un bottone Invia.",
    scoring:
      "Corretto se il testo corrisponde a una delle risposte accettate (case-insensitive). Punteggio basato sulla velocita.",
    example: {
      question: "Come si chiama il satellite naturale della Terra?",
      answer: "Luna (risposte accettate: 'Luna', 'la luna')",
    },
  },
  ORDERING: {
    icon: "🔢",
    title: "Ordinamento",
    description:
      "Lo studente deve mettere gli elementi nell'ordine corretto. Utile per sequenze, processi, cronologie.",
    editorTip:
      "Inserisci gli elementi nell'ordine corretto. Il sistema li mescolera automaticamente per lo studente.",
    playerView:
      "Lo studente vede gli elementi in ordine casuale e usa le frecce su/giu per riordinarli.",
    scoring: "Corretto se l'ordine finale coincide con quello impostato. Punteggio basato sulla velocita.",
    example: {
      question: "Ordina i pianeti dal Sole: Marte, Terra, Venere, Mercurio",
      answer: "Mercurio → Venere → Terra → Marte",
    },
  },
  MATCHING: {
    icon: "🔗",
    title: "Abbinamento",
    description:
      "Lo studente collega elementi della colonna sinistra con quelli della colonna destra. La colonna destra viene mescolata.",
    editorTip: "Inserisci le coppie: l'elemento sinistro sara fisso, il destro sara mescolato.",
    playerView:
      "Lo studente tocca un elemento a sinistra, poi il corrispondente a destra per creare l'abbinamento.",
    scoring: "Corretto se tutti gli abbinamenti sono giusti. Punteggio basato sulla velocita.",
    example: {
      question: "Abbina ogni capitale al suo paese",
      answer: "Roma → Italia, Parigi → Francia, Berlino → Germania",
    },
  },
  SPOT_ERROR: {
    icon: "🔍",
    title: "Trova l'errore",
    description:
      "Lo studente deve individuare le righe che contengono errori in un testo o codice. Puo esserci piu di un errore da trovare.",
    editorTip:
      "Scrivi le righe di testo/codice. Clicca il numero della riga per marcarla come errore (diventa rossa). Puoi aggiungere una spiegazione opzionale.",
    playerView:
      "Lo studente vede le righe numerate e tocca quelle che ritiene errate. Puo selezionarne piu di una.",
    scoring:
      "Punteggio parziale: ogni errore trovato vale punti, ogni selezione sbagliata toglie punti (minimo 0). Bonus velocita applicato al totale.",
    example: {
      question: "Trova le righe con errori nel codice Python:",
      answer:
        'Riga 1: print("Hello") → OK\nRiga 2: for i in range(10) → OK\nRiga 3: x = 5 / 0 → ERRORE\nRiga 4: return x → OK',
    },
  },
  NUMERIC_ESTIMATION: {
    icon: "🔢",
    title: "Stima numerica",
    description:
      "Lo studente inserisce un numero. Il punteggio dipende da quanto e vicino al valore corretto.",
    editorTip:
      "Imposta il valore corretto, la tolleranza (punteggio pieno) e il range massimo (zero punti). Puoi aggiungere un'unita di misura.",
    playerView: "Lo studente vede un campo numerico e l'eventuale unita di misura.",
    scoring:
      "Pieno punteggio entro la tolleranza. Punteggio parziale decrescente fino al range massimo. Zero oltre il range.",
    example: {
      question: "Quanti km ci sono tra Roma e Milano?",
      answer:
        "Valore corretto: 572 km\nTolleranza: ±30 km (pieno punteggio: 542-602)\nRange massimo: ±200 km (zero punti oltre 772 o sotto 372)",
    },
  },
  IMAGE_HOTSPOT: {
    icon: "🎯",
    title: "Hotspot su immagine",
    description:
      "Lo studente tocca il punto corretto su un'immagine. Utile per anatomia, geografia, schemi tecnici.",
    editorTip:
      "Carica un'immagine, poi clicca per posizionare l'hotspot (il punto corretto). Usa gli slider per regolare il raggio e la tolleranza.",
    playerView: "Lo studente vede l'immagine e tocca dove ritiene sia il punto corretto.",
    scoring:
      "Pieno punteggio se il tocco cade dentro il raggio. Punteggio parziale nella zona di tolleranza. Zero fuori.",
    example: {
      question: "Tocca il cuore nel diagramma anatomico",
      answer:
        "L'area corretta e un cerchio centrato sul cuore.\nTocco dentro il cerchio = pieno punteggio.\nTocco vicino = punteggio parziale.",
    },
  },
  CODE_COMPLETION: {
    icon: "💻",
    title: "Completa il codice",
    description:
      "Lo studente completa una riga mancante di codice. Puo rispondere a scelta multipla o scrivendo il codice.",
    editorTip:
      "Scrivi il blocco di codice e seleziona la riga da nascondere (cliccando il numero). Scegli se lo studente risponde a scelta multipla o testo libero.",
    playerView:
      "Lo studente vede il codice con una riga mancante (???) e sceglie tra opzioni o scrive la risposta.",
    scoring:
      "Scelta multipla: corretto/errato. Testo libero: confronto normalizzato (ignora maiuscole e spazi extra). Bonus velocita.",
    example: {
      question: "Completa il ciclo for in JavaScript:",
      answer:
        'Riga 1: for (___) {\nRiga 2:   console.log(i);\nRiga 3: }\n\nRisposta: let i = 0; i < 10; i++',
    },
  },
};

interface Props {
  type: string;
  onClose: () => void;
}

export function QuestionHelpDialog({ type, onClose }: Props) {
  const help = HELP[type];
  if (!help) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{help.icon}</span>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {help.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Description */}
          <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            {help.description}
          </p>

          {/* Editor tip */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Come crearla
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {help.editorTip}
            </p>
          </section>

          {/* Player view */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Cosa vede lo studente
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {help.playerView}
            </p>
          </section>

          {/* Scoring */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Valutazione
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {help.scoring}
            </p>
          </section>

          {/* Example */}
          <section className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">
              Esempio
            </h3>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {help.example.question}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-line">
              {help.example.answer}
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-base transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
