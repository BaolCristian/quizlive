# Esercizi 01 — Cancello e ruoli

**Data:** 2026-09-02
**Stato:** design deciso in conversazione; documento in attesa di revisione
**Programma:** vedi `2026-09-02-savint-esercizi-programma-design.md` (sotto-progetto 1)

## Contesto (verificato nel codice)

- `src/lib/auth/config.ts`: provider Google senza callback `signIn`, senza
  controllo di dominio né lista di ammessi. `User.role` ha default `TEACHER`.
  **Chiunque entri con Google diventa docente.** Gli studenti hanno account nello
  stesso Workspace della scuola, quindi oggi possono aprire l'editor.
- `src/app/(dashboard)/layout.tsx`, `src/app/(editor)/layout.tsx` e le 24 route
  API che chiamano `auth()` controllano solo che esista una sessione, mai il
  ruolo. Solo `/api/admin/*` usa `assertAdmin()`.
- Strategia sessione: `database` in produzione, `jwt` in dev/demo/hub. Con le
  sessioni su database il middleware non può leggere il ruolo: l'enforcement va
  nei layout e nelle route.
- `next-auth` 5.0.0-beta.30: il callback `signIn` può restituire `false` oppure
  una stringa URL verso cui reindirizzare.
- Il join a un quiz live via PIN (`joinSession` su Socket.io) è anonimo e non
  richiede login. Non si tocca.
- La scuola ha **un gruppo Google per ogni classe**, con email che inizia con
  `allievi.`: esempio reale `allievi.2sia4.0@paolosarpi.edu.it` per la classe
  2SIA4.0. Tutti gli studenti stanno in un gruppo `allievi.*`. Esistono anche
  un gruppo studenti generico e un gruppo docenti, entrambi opzionali nella
  configurazione.

## Obiettivo

1. Riconoscere gli studenti al login dal gruppo Google e assegnare il ruolo
   `STUDENT`.
2. Impedire a uno studente **qualsiasi** accesso a dashboard, editor, statistiche,
   sessioni live come host, API docente: sia via interfaccia sia chiamando le API
   direttamente.
3. Leggere al login i **gruppi di classe** dell'utente e salvarli, così il
   sotto-progetto 4 crea le classi e le iscrizioni senza codici né elenchi.
4. Dare allo studente un'area propria minima su cui atterrare.
5. Non cambiare nulla per le installazioni che non configurano il gruppo.

## Configurazione

| Variabile | Obbligatoria | Significato |
|---|---|---|
| `STUDENT_GROUP_EMAIL` | almeno una tra questa e `CLASS_GROUP_PATTERN` | email del gruppo Google generico degli studenti |
| `TEACHER_GROUP_EMAIL` | no | email del gruppo docenti; se assente, chi non è studente è docente (comportamento attuale) |
| `CLASS_GROUP_PATTERN` | almeno una tra questa e `STUDENT_GROUP_EMAIL` | espressione regolare sull'email del gruppo che identifica un gruppo di classe, con un gruppo di cattura `name` per il nome della classe. Per Paolo Sarpi: `^allievi\.(?<name>[^@]+)@paolosarpi\.edu\.it$` |
| `GOOGLE_SA_KEY_FILE` | sì se attiva | percorso del JSON del service account (in Docker: secret montato in `/run/secrets/`) |
| `GOOGLE_ADMIN_IMPERSONATE` | sì se attiva | email di un account del Workspace con ruolo "Lettore gruppi" da impersonare |

- Modulo `src/lib/config/student-gate.ts`: legge e valida le variabili una volta;
  espone `isStudentGateEnabled()` e la configurazione tipizzata. Il cancello è
  attivo se è impostata `STUDENT_GROUP_EMAIL` **o** `CLASS_GROUP_PATTERN`. Se è
  attivo e mancano chiave o admin, o il pattern non compila o non ha la cattura
  `name`: **errore all'avvio** con messaggio esplicito (fail loud).
- In modalità hub (`SAVINT_MODE=hub`) il cancello è sempre disattivo.

## Componenti

### 1. Client Google Groups — `src/lib/auth/google-groups.ts`

- Dipendenza nuova: `google-auth-library` (ufficiale, MIT), client JWT con
  `subject` = admin impersonato, scope
  `https://www.googleapis.com/auth/admin.directory.group.readonly`.
- `listUserGroups(userEmail): Promise<{ email, name }[]>` chiama
  `GET /admin/directory/v1/groups?userKey={user}` (paginata) e restituisce i
  gruppi di cui l'utente è **membro diretto**. Una sola chiamata per login,
  da cui si ricavano ruolo e classi. Timeout 5 s. Errori tipizzati:
  `GroupCheckError` con causa.
- I gruppi annidati non compaiono: studenti e docenti devono essere membri
  diretti del proprio gruppo di ruolo **oppure** di un gruppo di classe (uno
  studente in `classe-3a` è studente anche se il gruppo studenti generico lo
  contiene solo per annidamento).
- Cache in memoria per email con TTL 60 s, così il risultato calcolato in
  `signIn` è disponibile in `createUser` senza richiamare Google.

### 2. Regola del ruolo — `src/lib/auth/resolve-role.ts`

Funzione pura, senza I/O, coperta da test a tabella:

```
classifyGroups(groups, config)
  → { isStudent, isTeacher, classGroups: { email, name }[] }
resolveRole({ existingRole, isStudent, isTeacher, teacherGroupConfigured })
  → "ADMIN" | "TEACHER" | "STUDENT" | "DENY"
```

`classifyGroups`: `isTeacher` se tra i gruppi c'è `TEACHER_GROUP_EMAIL`;
`classGroups` sono i gruppi la cui email corrisponde a `CLASS_GROUP_PATTERN`
(nome = cattura `name` in maiuscolo, quindi `2sia4.0` → `2SIA4.0`; anno di corso
= prima cifra del nome se è tra 1 e 5, altrimenti assente); `isStudent` se c'è
`STUDENT_GROUP_EMAIL` **oppure** almeno un gruppo di classe. Con i gruppi
`allievi.*` il gruppo generico non è necessario.

`resolveRole`, regole in ordine:
1. `existingRole === "ADMIN"` → `ADMIN` (mai retrocesso automaticamente).
2. `isTeacher` → `TEACHER` (il gruppo docenti vince su quello studenti).
3. `isStudent` → `STUDENT`.
4. `teacherGroupConfigured` → `DENY` (non è in nessun gruppo).
5. altrimenti → `TEACHER` (comportamento attuale quando il gruppo docenti non è configurato).

Il controllo si ripete **a ogni login**: chi cambia gruppo cambia ruolo senza
interventi manuali.

### 3. Callback di login — `src/lib/auth/config.ts`

- Nuovo callback `signIn`, attivo solo per il provider `google`, solo in modalità
  installazione, solo se il cancello è attivo. Altrimenti ritorna `true` e nulla
  cambia.
- Calcola il ruolo con i componenti 1 e 2. `DENY` → ritorna
  `/login?error=NotAllowed`. Utente esistente con ruolo diverso → aggiorna
  `User.role`.
- Errore transitorio di Google: utente **esistente** entra con il ruolo salvato
  (log di warning); utente **nuovo** viene rimandato a `/login?error=GroupCheckFailed`
  (fail closed: nessun nuovo docente creato senza verifica).
- A ogni login riuscito salva su `User.classGroups` i gruppi di classe trovati
  (email, nome, anno di corso), anche per i docenti: il sotto-progetto 4 li usa per creare le
  classi, iscrivere gli studenti e proporre al docente le sue classi. In questo
  sotto-progetto il dato viene solo salvato.
- `events.createUser`: imposta `User.role` e `User.classGroups` con i valori in
  cache per l'email.
- I callback `jwt` e `session` propagano `STUDENT`; `src/types/next-auth.d.ts`
  estende il tipo del ruolo.
- Prisma: `enum Role { TEACHER ADMIN STUDENT }` e `User.classGroups Json?`, con
  migrazione.

### 4. Enforcement — `src/lib/auth/require-role.ts`

- `requireTeacher()` per le route API: ritorna `{ session }` oppure
  `{ response }` con 401 se non loggato, 403 se `STUDENT`. Ammette `TEACHER` e
  `ADMIN`.
- `requireStudent()` speculare, per le future API studente.
- `redirectUnlessTeacher()` per i layout: `STUDENT` → redirect a `/studente`;
  non loggato → `/login`.
- Layout `(dashboard)` e `(editor)` usano `redirectUnlessTeacher()`. Il
  `TermsGuard` resta solo lì: gli studenti non accettano i termini docente.
- Route API da proteggere con `requireTeacher()` (sostituisce il pattern
  `auth()` + controllo id, senza cambiare altro):
  `/api/quiz/**`, `/api/session/**`, `/api/stats/**`, `/api/upload`,
  `/api/dashboard/**`, `/api/hub/oauth/start|callback|link|revoke`, `/api/hub/quiz/**`,
  `/api/installation/**`, `/api/consent/**`, `/api/report`, `/api/image-search`.
  `/api/admin/**` resta con `assertAdmin()`.
- Route che restano pubbliche, senza modifiche: `/api/public/**`, `/api/emoticons`,
  `/api/locale`, `/api/image-proxy`, `/api/uploads/**`, `/api/auth/**`,
  `/api/hub/practice/**`, Socket.io `joinSession`/`rejoinSession`.
- Pagine pubbliche (`/join`, `/practice/[quizId]`, legali, landing) invariate.
- Login: `callbackUrl` resta `/dashboard`; il layout della dashboard reindirizza
  lo studente a `/studente`. La pagina di login mostra i due nuovi messaggi di
  errore (`NotAllowed`, `GroupCheckFailed`) in italiano e inglese.
- Sidebar e link "dashboard" non compaiono mai a uno studente perché non entra
  nei layout che li contengono.

### 5. Area studente minima — `src/app/(student)/studente/`

- Layout proprio: logo, nome dello studente, logout. Nessuna sidebar docente.
- Pagina `/studente`: messaggio "Qui troverai i tuoi esercizi" con i colori del
  brand. È un segnaposto che il sotto-progetto 4 sostituisce.
- Uno studente che apre `/dashboard`, `/dashboard/*` o l'editor viene rimandato
  qui.
- `prisma/seed.ts` aggiunge uno studente demo (`studente@scuola.it`, ruolo
  `STUDENT`) così in sviluppo e in demo, dove il login è per email senza gruppo
  Google, l'area studente e l'enforcement si provano subito.

### 6. Documentazione e deploy

- `DEPLOY-GUIDA.md`: nuova sezione "Riconoscimento studenti e classi (Google
  Workspace)" con i passi nella console Google Cloud e nella console Admin:
  creare il service account nel progetto già usato per OAuth, abilitare l'Admin
  SDK API, attivare la delega a livello di dominio con il solo scope di lettura
  gruppi, assegnare all'account impersonato il ruolo "Lettore gruppi", creare i
  gruppi di ruolo e di classe con una convenzione di nome che il pattern possa
  riconoscere.
- `.env.example`: le cinque variabili commentate.
- `docker/docker-compose.yml`: le tre variabili d'ambiente più il secret
  file-based `google_sa_key` montato in `/run/secrets/google_sa_key`;
  `docker/setup.sh` e `docker/README.md` aggiornati.
- `README.it.md` / `README.md`: voce nell'elenco funzionalità.

## Test

- **Unit**: `classifyGroups` (gruppo studenti generico, solo gruppo di classe
  `allievi.2sia4.0`, docente anche in una classe, pattern assente, pattern non
  valido, nome senza cifra iniziale) e `resolveRole` a
  tabella (tutte le combinazioni); validazione della configurazione (attiva,
  incompleta, assente, hub); client gruppi con `fetch` simulato (lista,
  paginazione, vuota, errore, timeout, cache).
- **Integrazione**: callback `signIn` con `listUserGroups` simulato: nuovo
  studente con classe, nuovo docente, retrocessione docente→studente, cambio di
  classe tra due login, DENY, errore Google con utente esistente e con utente
  nuovo.
- **Enforcement a tabella**: per ogni route protetta, con sessione `STUDENT` la
  risposta è 403; con `TEACHER` non è 403. Un test per i due layout.
- **Manuale**, con il Workspace reale: checklist in fondo alla sezione della
  guida di deploy (login studente, login docente, studente che digita
  `/dashboard`, studente che chiama `/api/quiz`).

## Fuori ambito (segnalato, non risolto qui)

- Il server Socket.io riconosce l'host dal nome riservato `__host__`, non dalla
  sessione. È una debolezza preesistente e indipendente dagli studenti: va
  trattata in un intervento a sé.
- Riconoscimento per pattern di email o per elenco classe: alternative al
  gruppo, rinviate a quando serviranno a una scuola senza gruppi.
- Consensi e informativa per gli studenti: la scuola, titolare del trattamento,
  aggiorna la propria informativa; nessuna schermata di consenso studente in
  questo sotto-progetto.

## Rischi

- Latenza dell'Admin SDK al login: una chiamata paginata, timeout 5 s, cache.
- Solo membri diretti: se la scuola mette gli studenti nei gruppi di classe e
  annida le classi nel gruppo studenti, funziona grazie al pattern. Se invece
  annida senza gruppi di classe riconoscibili, lo studente non viene
  riconosciuto: il messaggio di errore al login lo dice e la guida spiega la
  convenzione.
- Docente per errore anche nel gruppo studenti: vince il gruppo docenti se
  configurato; altrimenti diventa studente e il problema si vede subito.
- Chiave del service account: è un segreto con potere di lettura sui gruppi.
  Va tenuta come secret Docker, mai nel repo né nell'immagine.
