# Quiz Live - Guida per Claude

## Panoramica
Piattaforma quiz live per la scuola. Il docente crea quiz, li proietta sulla LIM, gli studenti rispondono dal telefono in tempo reale.

## Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: React 19, Tailwind CSS 4, shadcn/ui (base-ui)
- **Real-time**: Socket.io 4
- **Database**: PostgreSQL 16 + Prisma 6
- **Auth**: NextAuth v5 (Google OAuth + Credentials dev-only)
- **Grafici**: Recharts
- **Test**: Vitest (unit) + Playwright (e2e)

## Comandi principali
- `npm run dev:custom` — avvia dev server con Socket.io (**NON usare `npm run dev`**)
- `npm run build` + `npm run start:custom` — produzione
- `npm run test:run` — test unitari
- `npm run test:e2e` — test e2e
- `npx prisma migrate dev` — migrazioni
- `npx prisma db seed` — dati demo (Prof. Demo + 2 quiz)
- `npx prisma studio` — GUI database
- `./avvio.sh` — setup completo da zero (crea DB, installa deps, migra, seed, avvia)

## Struttura progetto
```
prisma/schema.prisma          # Schema DB (User, Quiz, Question, Session, Answer, QuizShare)
prisma/seed.ts                # Dati demo
src/server.ts                 # Server custom Next.js + Socket.io
src/lib/auth/config.ts        # NextAuth config (Google + Credentials in dev)
src/lib/db/client.ts          # Prisma client singleton
src/lib/socket/server.ts      # Socket.io server-side
src/lib/socket/client.ts      # Hook useSocket() client-side
src/lib/scoring.ts            # Calcolo punteggi
src/lib/validators/quiz.ts    # Schema Zod quiz/domande (mediaUrl accetta URL e path locali /uploads/)
src/lib/validators/qlz.ts     # Schema Zod per manifest.json del formato .qlz
src/types/index.ts            # Tipi condivisi (eventi Socket.io)
src/app/page.tsx              # Landing studente (inserisci PIN)
src/app/(auth)/login/         # Login (Google + dev credentials)
src/app/(dashboard)/dashboard/ # Area docente
  quiz/                       # CRUD quiz
  sessions/                   # Storico sessioni
  stats/                      # Statistiche
  share/                      # Condivisioni tra docenti
src/app/(live)/live/host/     # Schermo docente (LIM) durante quiz live
src/app/(live)/play/          # Schermo studente (telefono) durante quiz live
src/app/api/session/          # API creazione sessione (genera PIN 6 cifre)
src/app/api/quiz/             # API CRUD quiz + condivisione
src/app/api/quiz/[id]/export/ # API export quiz come .qlz (GET)
src/app/api/quiz/import/      # API import quiz da .qlz (POST multipart)
src/app/api/upload/           # API upload immagini (POST multipart, max 5MB)
src/lib/__tests__/scoring.test.ts # Test punteggi (76+ test)
src/components/quiz/          # Editor quiz, play-button, import-button
  question-editor.tsx         # Editor singola domanda (tutti i 9 tipi + help button)
  question-help-dialog.tsx    # Dialog modale con aiuto/esempio per ogni tipo di domanda
  spot-error-editor.tsx       # Sub-editor per SPOT_ERROR
  numeric-estimation-editor.tsx # Sub-editor per NUMERIC_ESTIMATION
  image-hotspot-editor.tsx    # Sub-editor per IMAGE_HOTSPOT (click-to-place)
  code-completion-editor.tsx  # Sub-editor per CODE_COMPLETION
  confidence-toggle.tsx       # Toggle livello di confidenza
src/components/live/          # Host view, player view
src/components/dashboard/     # Sidebar navigazione
src/components/stats/         # Grafici Recharts
src/components/ui/            # shadcn/ui (base-ui)
```

## Autenticazione
- **Produzione**: solo Google OAuth
- **Sviluppo**: Google OAuth + provider Credentials (login con sola email, senza password)
  - In dev si usa strategia sessione JWT (necessaria per Credentials)
  - L'utente demo è `docente@scuola.it` / "Prof. Demo"
  - Il form dev login appare solo con `NODE_ENV=development`

## Flusso quiz live
1. Docente clicca "Gioca" su un quiz → `POST /api/session` crea sessione con PIN
2. Redirect a `/live/host/{sessionId}` — mostra PIN sulla LIM
3. Studenti vanno su `/` e inseriscono il PIN
4. Docente clicca "Avvia Quiz" → domande in tempo reale via Socket.io
5. Fine quiz → podio e statistiche

## Tipi di domanda
- **MULTIPLE_CHOICE** — scelta multipla (2-6 opzioni, una o più corrette)
- **TRUE_FALSE** — vero o falso
- **OPEN_ANSWER** — risposta aperta (confronto case-insensitive con risposte accettate)
- **ORDERING** — riordina elementi nella sequenza corretta
- **MATCHING** — abbina elementi sinistra ↔ destra
- **SPOT_ERROR** — trova le righe con errori in un testo/codice (punteggio parziale)
- **NUMERIC_ESTIMATION** — inserisci un numero, punteggio basato sulla vicinanza al valore corretto (tolleranza + range massimo)
- **IMAGE_HOTSPOT** — tocca il punto corretto su un'immagine (coordinate normalizzate 0-1, raggio + tolleranza)
- **CODE_COMPLETION** — completa una riga mancante di codice (modalità scelta multipla o testo libero)

Ogni domanda ha un toggle opzionale **confidenceEnabled** che attiva il livello di confidenza: lo studente indica quanto è sicuro della risposta e il punteggio viene modulato (corretto+alta=1.2x, corretto+bassa=0.8x, errato+alta=−200 malus).

Nell'editor, accanto al selettore del tipo di domanda c'è un pulsante **?** che apre un dialog modale con descrizione, suggerimenti per la creazione, vista studente, valutazione ed esempio per quel tipo.

## Punteggio
- **Standard**: `punti_base × (1.0 - tempo_impiegato / tempo_limite × 0.5)` — Range: 500→1000, 0 se sbagliata
- **SPOT_ERROR**: punteggio parziale (ogni errore trovato = +punti, ogni selezione sbagliata = −punti, minimo 0)
- **NUMERIC_ESTIMATION**: pieno punteggio entro tolleranza, decrescente lineare fino a range massimo, zero oltre
- **IMAGE_HOTSPOT**: pieno entro raggio, parziale nella zona di tolleranza, zero fuori
- **Confidenza**: moltiplicatore applicato al punteggio finale (vedi sopra)

## Formato .qlz (Quiz Live Zip)
- File ZIP rinominato con estensione `.qlz`, contiene `manifest.json` + `assets/` (immagini)
- Autocontenuto: le immagini (sia da URL che da upload) vengono incluse nel file
- Usato per esportare/importare quiz tra istanze diverse di Quiz Live
- Validato con schema Zod (`qlzManifestSchema` in `src/lib/validators/qlz.ts`)
- Libreria: JSZip

## Upload immagini
- Le immagini caricate vengono salvate in `public/uploads/quiz/{quizId}/`
- Il campo `mediaUrl` nel DB accetta sia URL esterni (`https://...`) che path locali (`/uploads/...`)
- Il question editor offre entrambe le opzioni: incolla URL o carica file
- API: `POST /api/upload` (multipart, campo `file` + opzionale `quizId`)
- Tipi ammessi: PNG, JPEG, GIF, WebP — max 5MB
- `public/uploads/` è in `.gitignore`

## Ambiente locale
- L'utente ha PostgreSQL installato localmente (no Docker necessario per dev)
- Database: `postgresql://quizlive:quizlive@localhost:5432/quizlive`
- `.env` richiede: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
