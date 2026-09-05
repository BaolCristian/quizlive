# Esercizi 03 — Player React, tentativi, salvataggio e ripresa

Sotto-progetto 3 del programma SAVINT Esercizi
(`docs/superpowers/specs/2026-09-02-savint-esercizi-programma-design.md`).
Dipende dal sotto-progetto 1 (ruolo `STUDENT` e area studente, in main da
446d5e5) e dal sotto-progetto 2 (motore `packages/engine`, in main dal merge
077a329). Non dipende dal 4: classi, bacino e compiti arrivano dopo.

## Contesto

Il motore esiste e funziona: carica il JSON di una domanda Numbas, genera le
variabili da un seme, produce testo e LaTeX, corregge le risposte con credito
in frazioni esatte e serializza lo stato del tentativo. Ha 1038 test propri e
480 differenziali contro il runtime Numbas originale caricato come oracolo.

Nell'applicazione, però, non c'è niente: nessun file di `src/` importa
`@savint/engine`, nessuno dei modelli previsti dal programma esiste in
`prisma/schema.prisma`, e non è installata nessuna libreria di formule. Uno
studente che entra oggi vede l'area `/studente` con una scheda "in arrivo".

Questo sotto-progetto costruisce il primo pezzo di software che uno studente
può davvero usare: aprire un esercizio, risolverlo, vedere il feedback,
chiudere il portatile e riprendere dove aveva lasciato.

### Prova su KaTeX (eseguita il 2026-09-05, prima di questa spec)

Il programma sceglieva KaTeX e rimandava la verifica al sotto-progetto 2, dove
non è stata fatta. È stata fatta ora, su 652 stringhe LaTeX distinte prodotte
dal motore: tutti gli esempi della documentazione upstream con due insiemi di
regole, più le formule di tutte le domande del corpus di test.

| Esito | Numero |
|---|---|
| Rese correttamente da KaTeX | 635 |
| Errori di parsing | 17 |
| Avvisi in modalità strict | 3 (`commentAtEnd`) |

Nessun costrutto matematico fallisce. I 17 errori hanno tutti la stessa causa:
il motore inserisce una stringa grezza dentro `\textrm{}` senza proteggere i
caratteri speciali di LaTeX, quindi `x_1`, `x^2`, `2%`, `\d+` e `$` fanno
fallire il parser. Colpisce solo funzioni che mostrano una stringa (`latex`,
`render`, `match_regex`, `replace_regex`, `unpercent`, `formatstring`,
`normalise_subscripts`, `expand_juxtapositions`, `numerical_compare`,
`make_variables`, `string`).

Verificato contro l'oracolo: il port produce **byte per byte lo stesso LaTeX**
del Numbas originale su quei casi. È un comportamento di upstream che MathJax
tollera e KaTeX rifiuta, non un difetto del port.

**Conclusione:** si usa KaTeX, con un componente che protegge il contenuto dei
`\textrm{}` prima di renderizzare. Niente MathJax, niente doppio renderer.

## Obiettivo

Uno studente apre un link, risolve un esercizio con variabili generate dal suo
seme, riceve il feedback del motore, e ritrova il tentativo esattamente com'era
se torna più tardi. Il punteggio scritto sul database è sempre quello calcolato
dal server, mai quello dichiarato dal browser.

## Decisioni prese

1. **Confine.** Un tentativo riguarda **un solo esercizio**. Il modello
   `Tentativo` nasce con `compitoId` nullable: il sotto-progetto 4 lo riempirà
   quando esisteranno i compiti, senza rifare il modello.
2. **Ingresso.** Rotta `/studente/esercizio/[esercizioId]`. Il server risolve o
   crea il tentativo dello studente autenticato per l'ultima versione di quel
   esercizio. L'identificativo del tentativo non compare nell'URL: il docente
   distribuisce un link solo e non deve elencare gli studenti.
3. **Contenuti.** Esercizi in `content/esercizi/*.json`, versionati nel repo e
   caricati da `npm run seed:esercizi`. Nessun editor e nessun importatore:
   sono i sotto-progetti 5 e 4.
4. **Salvataggio.** Lo stato serializzato del motore viaggia al server **a ogni
   invio di risposta**. La ripresa è esatta anche dopo una chiusura brusca.
5. **Ricalcolo.** Il server ricalcola il punteggio **a ogni risposta**: ricarica
   la domanda dal seme, riapplica lo stato e scrive il proprio risultato. Il
   client non ha mai una finestra in cui il suo punteggio conta. Va oltre la
   lettera del programma ("il server ricalcola a fine tentativo"), che resta
   valida come minimo: qui lo stato arriva comunque a ogni risposta, quindi
   ricalcolare subito costa poco e toglie una classe di problemi.
6. **Formule.** KaTeX (MIT), con protezione dei `\textrm{}` e ricaduta sul
   testo grezzo se il rendering fallisce comunque. Mai un'eccezione che rompe
   la pagina.
7. **Tentativi illimitati, nessuna classifica.** Come da programma.
8. **`TentativoDomanda` non si introduce qui.** Serve quando un tentativo
   comprenderà più esercizi pescati, cioè nel sotto-progetto 4. Lo stato del
   motore copre già le parti di una singola domanda.

## Non-obiettivi

Classi, compiti, regole di pesca, progressi per studente o per argomento,
editor di esercizi, formato SAVINT completo, importatore `.exam`, pubblicazione
sull'hub, tentativi su più esercizi, correzione asincrona in coda, modalità
offline.

## Architettura

```
content/esercizi/*.json                    esercizi versionati nel repo

prisma/schema.prisma                       Esercizio, EsercizioVersione, Tentativo

src/lib/esercizi/
  format/schema.ts                         zod: involucro SAVINT (metadati) + contenuto Numbas opaco
  seed.ts                                  upsert di Esercizio/EsercizioVersione dal contenuto su disco
  tentativo.ts                             avvia-o-riprendi, applica risposta, completa
  marking.ts                               ricalcolo lato server dal seme (usa @savint/engine in Node)

src/app/(student)/studente/esercizio/[esercizioId]/page.tsx    server component
src/app/(dashboard)/dashboard/esercizi/page.tsx                elenco per il docente
src/app/api/esercizi/tentativi/[id]/risposta/route.ts
src/app/api/esercizi/tentativi/[id]/completa/route.ts

src/components/esercizi/player/
  player-esercizio.tsx                     macchina a fasi, stato React semplice
  formula.tsx                              KaTeX + protezione \textrm{} + ricaduta
  contenuto-html.tsx                       testo della domanda: divide testo e formule
  parti/                                   un componente per tipo di parte
```

Il motore gira nel browser per il feedback immediato e in Node per il
ricalcolo. È lo stesso pacchetto: nessuna logica di correzione viene
riscritta.

### Modello dati

```prisma
model Esercizio {
  id          String   @id @default(cuid())
  title       String
  description String?
  authorId    String?
  yearLevel   Int      // 1..5
  topic       String   // slug
  tags        String[]
  difficulty  Int      // 1..3
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  versions    EsercizioVersione[]
}

model EsercizioVersione {
  id          String   @id @default(cuid())
  esercizioId String
  version     Int
  content     Json     // JSON della domanda Numbas, passato al motore così com'è
  hash        String   // sha-256 del contenuto: guida il bump di versione
  createdAt   DateTime @default(now())
  esercizio   Esercizio @relation(fields: [esercizioId], references: [id], onDelete: Cascade)
  tentativi   Tentativo[]
  @@unique([esercizioId, version])
}

enum TentativoStatus { IN_PROGRESS COMPLETED }

model Tentativo {
  id                  String   @id @default(cuid())
  studentId           String
  esercizioVersioneId String
  compitoId           String?  // il sotto-progetto 4 lo riempirà
  seed                String
  state               Json?    // QuestionState del motore
  score               Float    @default(0)
  maxScore            Float    @default(0)
  status              TentativoStatus @default(IN_PROGRESS)
  startedAt           DateTime @default(now())
  completedAt         DateTime?
  lastActivityAt      DateTime @updatedAt
  student             User @relation(fields: [studentId], references: [id], onDelete: Cascade)
  versione            EsercizioVersione @relation(fields: [esercizioVersioneId], references: [id], onDelete: Cascade)
  @@index([studentId, esercizioVersioneId])
  @@index([lastActivityAt])
}
```

Sul modello `User` va aggiunto il lato inverso della relazione,
`tentativi Tentativo[]`, altrimenti Prisma non valida lo schema.

`partPath` nelle rotte è il percorso della parte come lo produce il motore
(`"p0"`, `"p0g1"`), non un indice: un esercizio ha una domanda sola ma può
avere più parti e più gap.

Il seme è generato dal server all'avvio del tentativo e non cambia più: è ciò
che rende riproducibile sia la ripresa sia il ricalcolo.

Conservazione: `TENTATIVI_RETENTION_DAYS` con la stessa meccanica pigra già
usata da `PracticeRun` (controllo alla lettura, nessun cron in questo
sotto-progetto). L'indice su `lastActivityAt` esiste perché la pulizia
arriverà.

### Formato dei contenuti

```json
{
  "savint": { "version": 1, "title": "...", "yearLevel": 2, "topic": "equazioni",
              "tags": ["primo-grado"], "difficulty": 1, "description": "..." },
  "question": { ...JSON Numbas, non interpretato da SAVINT... }
}
```

Lo schema zod valida solo l'involucro. Il contenuto va al motore così com'è: è
il motore a rifiutare esplicitamente ciò che non supporta (`explore`,
`preamble.js`, estensioni, funzioni asincrone, `matrixentry`) con chiavi
d'errore proprie, e quel rifiuto è già coperto dai suoi test.

Il comando di seed calcola l'hash del contenuto: se combacia con l'ultima
versione non fa niente, altrimenti crea una versione nuova. I tentativi già
aperti restano legati alla versione con cui sono partiti.

### Ciclo di vita di un tentativo

```
GET  /studente/esercizio/<esercizioId>
     requireStudent -> avviaORiprendi(studentId, esercizioId)
       nessun tentativo aperto -> crea con seme nuovo
       tentativo aperto        -> riprendi
     -> { questionJson, seed, state, score, maxScore }

client: loadQuestion(json, {seed, locale}) [+ restoreQuestion(state)]

POST /api/esercizi/tentativi/<id>/risposta   { partPath, answer, state }
     requireStudent + il tentativo è di chi chiama + zod + rate limit
     server: loadQuestion(seme) -> restoreQuestion(state) -> punteggio autorevole
     -> { score, maxScore, feedback }        il client sostituisce il proprio

POST /api/esercizi/tentativi/<id>/completa
     stato COMPLETED, completedAt, punteggio finale ricalcolato
```

Il client mostra subito il feedback del motore locale, poi lo rimpiazza con
quello del server. Se i due divergono vince il server e la divergenza va nei
log: è il segnale che qualcosa non torna fra browser e Node, e non deve
passare inosservato.

### Rendering delle formule

`<Formula tex={...} display={bool} />` fa tre cose, in quest'ordine: protegge i
caratteri speciali dentro i `\textrm{}`, chiama `katex.renderToString` con
`throwOnError: false`, e se il risultato è comunque un errore mostra il LaTeX
grezzo in un `<code>`. Le 17 stringhe che oggi falliscono sono i suoi casi di
test.

Il testo delle domande arriva dal motore come HTML con le formule fra `\( \)` e
`\[ \]`. `contenuto-html.tsx` lo divide, rende il testo come HTML ripulito da
un allowlist minimo e le formule con `Formula`. La ripulitura serve qui poco
(i contenuti sono nel repo) ma serve molto dal sotto-progetto 6, quando
arriveranno da altre installazioni: meglio averla dall'inizio che aggiungerla
dopo a un componente già usato.

### Tipi di parte

Un componente per tipo, sulla falsariga dello `AnswerInput` già esistente:
`numberentry`, `1_n_2`, `m_n_2`, `m_n_x`, `patternmatch`, `jme`, `gapfill`,
`information`. `matrixentry` è fuori ambito nel motore e resta fuori qui.

Per `m_n_x` il motore accetta due forme di risposta e su una griglia quadrata
non può distinguerle: assume la matrice interna. Il player manda sempre quella
forma, così l'ambiguità non si presenta.

## Localizzazione

Nuovo spazio dei nomi `esercizi` in `src/messages/it.json` e `en.json`. La
lingua dello studente viene passata a `loadQuestion` come `locale`, così il
feedback del motore esce nella stessa lingua dell'interfaccia. Il motore
tiene la lingua sullo `Scope`, quindi due tentativi in lingue diverse nello
stesso processo non si disturbano.

## Test

- Componente, con `NextIntlClientProvider`: un test per ogni tipo di parte più
  `Formula` (incluse le 17 stringhe note) e `contenuto-html`.
- Unità sul dominio: avvio, ripresa, applicazione di una risposta, chiusura,
  e un test di parità che confronta il punteggio del motore nel browser con
  quello del ricalcolo lato server su tutto il corpus degli esercizi.
- Rotte API: autenticazione, proprietà del tentativo, validazione, rate limit.
- End-to-end con Playwright: lo studente entra, risolve una parte, ricarica la
  pagina a metà, riprende con le risposte al loro posto, completa e vede il
  punteggio.

## Rischi

- **Costo del ricalcolo per risposta.** Il modulo del motore si carica una
  volta (28,5 ms a freddo, misurati), ma ogni richiesta ricostruisce una
  domanda. Va misurato durante l'implementazione, non stimato; se un esercizio
  pesante risultasse troppo lento, la ricaduta è ricalcolare solo alla
  chiusura, che è ciò che il programma chiedeva.
- **Protezione dei `\textrm{}`.** L'aggiro sta nel player. Correggerlo nel
  motore sarebbe una divergenza deliberata da upstream, da valutare a parte:
  qui non si tocca il motore.
- **Peso del bundle.** Il motore è 130 KB gzip e non fa tree-shaking, più
  KaTeX e i suoi font. Su una pagina che uno studente apre da telefono va
  guardato: se pesa troppo, il player si carica in modo differito.

## Punti aperti

- L'elenco degli argomenti (`topic`) è curato per anno nel sotto-progetto 4.
  Qui basta una stringa libera coerente fra i contenuti seminati.
- La pulizia dei tentativi scaduti è pigra come per `PracticeRun`. Il
  passaggio a un lavoro pianificato si decide quando esisteranno volumi veri.
