# Quiz Live

**Piattaforma gratuita di quiz interattivi per la scuola.**

Il docente crea quiz, li proietta sulla LIM e gli studenti rispondono in tempo reale dal proprio telefono. Pensata per rendere le lezioni più coinvolgenti e la valutazione formativa più immediata.

> Quiz Live è e sarà sempre **gratuito per tutte le scuole**. Nuove funzionalità verranno aggiunte progressivamente per offrire un'esperienza sempre migliore a docenti e studenti.

## Funzionalità

- **9 tipi di domanda**: scelta multipla, vero/falso, risposta aperta, ordinamento, abbinamento, trova l'errore, stima numerica, hotspot su immagine, completamento codice
- **Quiz live in tempo reale**: lobby con PIN a 6 cifre, countdown, classifica animata, podio finale
- **Livello di confidenza**: lo studente indica quanto è sicuro della risposta, con bonus o malus sul punteggio
- **Dashboard docente**: crea e modifica quiz, storico sessioni, statistiche avanzate
- **Statistiche**: per sessione, per quiz, per studente, per argomento, con grafici interattivi
- **Condivisione**: condividi quiz tra colleghi con permessi (visualizza/duplica/modifica)
- **Export/Import**: formato .qlz per condividere quiz tra scuole diverse, export risultati in CSV/PDF
- **Upload immagini**: carica immagini nelle domande o usa URL esterni
- **Autenticazione**: login con Google Workspace scolastico
- **Responsive**: interfaccia ottimizzata per LIM (docente) e telefono (studenti)

## Stack tecnologico

| Componente | Tecnologia |
|------------|-----------|
| Framework | Next.js 16 (App Router) |
| Linguaggio | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Real-time | Socket.io 4 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Autenticazione | NextAuth v5 (Google OAuth) |
| Grafici | Recharts |
| Test | Vitest + Playwright |

## Avvio rapido

### Prerequisiti

- **Node.js 20+**
- **PostgreSQL 16** (locale o via Docker)
- **Account Google Cloud** per OAuth

### Installazione

```bash
git clone https://github.com/tuouser/quizlive.git
cd quizlive
npm install
```

### Configurazione

```bash
cp .env.example .env
```

Modifica `.env` con i tuoi valori. Genera il secret di NextAuth:

```bash
openssl rand -base64 32
```

### Database

```bash
# Crea le tabelle
npx prisma migrate dev

# (Opzionale) Carica dati demo
npx prisma db seed
```

Il seed crea un docente demo (`docente@scuola.it`) con quiz di esempio che coprono tutti i 9 tipi di domanda.

### Avvio

```bash
npm run dev:custom
```

Il server parte su **http://localhost:3000** con Socket.io integrato.

> **Nota:** usa sempre `dev:custom` e non `dev`, perché il server custom è necessario per Socket.io.

## Come funziona

### Docente

1. Accedi con Google su `/login`
2. Crea un quiz con le domande desiderate
3. Clicca **Gioca** per avviare una sessione live
4. Proietta lo schermo sulla LIM — gli studenti vedono il PIN
5. Avvia il quiz e gestisci il flusso delle domande
6. A fine quiz: podio e statistiche dettagliate

### Studente

1. Apri il sito sul telefono
2. Inserisci il PIN a 6 cifre mostrato sulla LIM
3. Scegli un nickname
4. Rispondi alle domande entro il tempo limite
5. Feedback immediato dopo ogni risposta
6. Classifica finale e podio

## Tipi di domanda

| Tipo | Descrizione |
|------|-------------|
| Scelta multipla | 2-6 opzioni, una o più corrette |
| Vero o falso | Classica domanda binaria |
| Risposta aperta | Confronto con risposte accettate |
| Ordinamento | Riordina elementi nella sequenza corretta |
| Abbinamento | Collega elementi sinistra-destra |
| Trova l'errore | Individua le righe con errori in un testo o codice |
| Stima numerica | Inserisci un numero, punteggio basato sulla vicinanza |
| Hotspot immagine | Tocca il punto corretto su un'immagine |
| Completamento codice | Completa la riga mancante (scelta multipla o testo libero) |

## Comandi principali

| Comando | Descrizione |
|---------|-------------|
| `npm run dev:custom` | Server di sviluppo con Socket.io |
| `npm run build` | Build di produzione |
| `npm run start:custom` | Avvia in produzione |
| `npm run test:run` | Test unitari |
| `npm run test:e2e` | Test end-to-end |
| `npx prisma studio` | GUI database |
| `npx prisma migrate dev` | Migrazioni database |
| `npx prisma db seed` | Carica dati demo |

## Deploy in produzione

### Con Docker Compose

```bash
cp .env.example .env
# Configura .env con i valori di produzione
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

### HTTPS

Si consiglia Caddy come reverse proxy per certificati SSL automatici tramite Let's Encrypt.

## Configurazione Google OAuth

1. Vai su [Google Cloud Console](https://console.cloud.google.com)
2. Crea un progetto e configura la schermata di consenso OAuth
3. Crea credenziali **ID client OAuth 2.0**
   - Origini autorizzate: `http://localhost:3000` (dev) o `https://tuodominio.it` (prod)
   - URI di reindirizzamento: `http://localhost:3000/api/auth/callback/google`
4. Copia Client ID e Client Secret nel file `.env`

## Roadmap

Quiz Live è in sviluppo attivo. Tra le funzionalità in arrivo:

- Modalità squadre
- Timer personalizzabili per domanda
- Temi e personalizzazione grafica
- Report PDF avanzati per classe
- Integrazione con Google Classroom
- App mobile dedicata

## Licenza

Quiz Live è gratuito per uso scolastico ed educativo.
