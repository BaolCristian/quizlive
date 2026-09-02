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
- La scuola ha un **gruppo Google studenti generico**; il gruppo docenti esiste
  ma resta opzionale nella configurazione.

## Obiettivo

1. Riconoscere gli studenti al login dal gruppo Google e assegnare il ruolo
   `STUDENT`.
2. Impedire a uno studente **qualsiasi** accesso a dashboard, editor, statistiche,
   sessioni live come host, API docente: sia via interfaccia sia chiamando le API
   direttamente.
3. Dare allo studente un'area propria minima su cui atterrare.
4. Non cambiare nulla per le installazioni che non configurano il gruppo.

## Configurazione

| Variabile | Obbligatoria | Significato |
|---|---|---|
| `STUDENT_GROUP_EMAIL` | attiva la funzione | email del gruppo Google degli studenti |
| `TEACHER_GROUP_EMAIL` | no | email del gruppo docenti; se assente, chi non è studente è docente (comportamento attuale) |
| `GOOGLE_SA_KEY_FILE` | sì se attiva | percorso del JSON del service account (in Docker: secret montato in `/run/secrets/`) |
| `GOOGLE_ADMIN_IMPERSONATE` | sì se attiva | email di un account del Workspace con ruolo "Lettore gruppi" da impersonare |

- Modulo `src/lib/config/student-gate.ts`: legge e valida le variabili una volta;
  espone `isStudentGateEnabled()` e la configurazione tipizzata. Se
  `STUDENT_GROUP_EMAIL` è impostata e mancano chiave o admin: **errore
  all'avvio** con messaggio esplicito (fail loud).
- In modalità hub (`SAVINT_MODE=hub`) il cancello è sempre disattivo.

## Componenti

### 1. Client Google Groups — `src/lib/auth/google-groups.ts`

- Dipendenza nuova: `google-auth-library` (ufficiale, MIT), client JWT con
  `subject` = admin impersonato, scope
  `https://www.googleapis.com/auth/admin.directory.group.member.readonly`.
- `isMember(groupEmail, userEmail): Promise<boolean>` chiama
  `GET /admin/directory/v1/groups/{group}/hasMember/{user}` (copre i gruppi
  annidati). Timeout 5 s. Errori tipizzati: `GroupCheckError` con causa.
- Cache in memoria per email con TTL 60 s, così un login fa al massimo una
  chiamata per gruppo e il ruolo calcolato in `signIn` è disponibile in
  `createUser` senza richiamare Google.

### 2. Regola del ruolo — `src/lib/auth/resolve-role.ts`

Funzione pura, senza I/O, coperta da test a tabella:

```
resolveRole({ existingRole, isStudent, isTeacher, teacherGroupConfigured })
  → "ADMIN" | "TEACHER" | "STUDENT" | "DENY"
```

Regole, in ordine:
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
- `events.createUser`: imposta `User.role` con il valore in cache per l'email.
- I callback `jwt` e `session` propagano `STUDENT`; `src/types/next-auth.d.ts`
  estende il tipo del ruolo.
- Prisma: `enum Role { TEACHER ADMIN STUDENT }` con migrazione.

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
  `/api/dashboard/**`, `/api/hub/oauth/start|link|revoke`, `/api/hub/quiz/**`,
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

### 6. Documentazione e deploy

- `DEPLOY-GUIDA.md`: nuova sezione "Riconoscimento studenti (Google Workspace)"
  con i passi nella console Google Cloud e nella console Admin: creare il
  service account nel progetto già usato per OAuth, abilitare l'Admin SDK
  API, attivare la delega a livello di dominio con il solo scope di lettura
  membri, assegnare all'account impersonato il ruolo "Lettore gruppi", creare i
  gruppi.
- `.env.example`: le quattro variabili commentate.
- `docker/docker-compose.yml`: le tre variabili d'ambiente più il secret
  file-based `google_sa_key` montato in `/run/secrets/google_sa_key`;
  `docker/setup.sh` e `docker/README.md` aggiornati.
- `README.it.md` / `README.md`: voce nell'elenco funzionalità.

## Test

- **Unit**: `resolveRole` a tabella (tutte le combinazioni); validazione della
  configurazione (attiva, incompleta, assente, hub); client gruppi con `fetch`
  simulato (membro, non membro, errore, timeout, cache).
- **Integrazione**: callback `signIn` con `isMember` simulato: nuovo studente,
  nuovo docente, retrocessione docente→studente, DENY, errore Google con utente
  esistente e con utente nuovo.
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

- Latenza dell'Admin SDK al login: una o due chiamate, timeout 5 s, cache.
- Docente per errore anche nel gruppo studenti: vince il gruppo docenti se
  configurato; altrimenti diventa studente e il problema si vede subito.
- Chiave del service account: è un segreto con potere di lettura sui gruppi.
  Va tenuta come secret Docker, mai nel repo né nell'immagine.
