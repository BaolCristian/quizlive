# SAVINT Esercizi — disegno di programma

**Data:** 2026-09-02
**Stato:** decisioni prese in conversazione con l'utente; documento in attesa di revisione
**Tipo:** disegno di programma (più sotto-progetti, ciascuno con spec e piano propri)

## Obiettivo

Permettere agli studenti delle scuole superiori (classi dalla 1ª alla 5ª) di fare
esercizi di matematica, analisi e geometria **a casa**, in modalità **allenamento
e approfondimento**, non ludica. Lo studente entra con il proprio account, fa gli
esercizi, vede i propri progressi. Il docente assegna gli esercizi alle classi e
vede i progressi di ogni studente e della classe.

Requisiti espliciti dell'utente:

- Prodotto **finito e bello**, non un assemblaggio di strumenti.
- **Open source e distribuibile**: resta dentro SAVINT (AGPL-3.0), si installa con
  l'immagine Docker esistente, **nessun componente esterno** da installare a parte.
- **Migliore** di quanto offerto oggi (Numbas, STACK, WIMS): in italiano, mobile
  first per lo studente, classi e progressi integrati, editor semplice, banca
  condivisa tra scuole via hub.
- Gli studenti **non vedono** editor, dashboard docente, statistiche, sessioni live.
- Esercizi **misti**: scelta multipla, completamento, risposta numerica, espressioni
  algebriche con valori casuali, suggerimenti a passi, figure geometriche.

## Decisioni prese (con motivazione)

1. **Riuso di SAVINT come contenitore**, non un prodotto separato. Si riusano
   autenticazione Google Workspace, deploy Docker, i18n, hub, admin, consensi.
   Un secondo prodotto avrebbe raddoppiato tutto questo e i docenti avrebbero
   avuto due account.
2. **Motore matematico: porting completo in TypeScript del runtime di Numbas**
   (Newcastle University, licenza Apache 2.0) come pacchetto interno del repo.
   L'utente ha scelto il porting completo rispetto all'uso come libreria, per
   avere codice interamente proprio. Riscrivere un CAS da zero è escluso.
3. **Interfaccia studente ed editor: nostri, in React/Next.** Niente Knockout,
   jQuery, Bootstrap, MathJax nel prodotto. L'editor Django di Numbas non si
   forka e non si installa.
4. **Riconoscimento studenti dal gruppo Google Workspace** della scuola, tramite
   Admin SDK Directory API (service account con delega a livello di dominio,
   chiamata `hasMember`). Il login OAuth resta com'è. L'alternativa SAML è
   scartata perché SAVINT non ha SAML.
5. **Classi create in automatico dai gruppi Google di classe.** La scuola ha un
   gruppo per ogni classe, con email `allievi.<classe>@paolosarpi.edu.it`
   (esempio: `allievi.2sia4.0` per la 2SIA4.0), oltre a un gruppo studenti
   generico e uno docenti.
   Al login SAVINT legge i gruppi dell'utente: le classi nascono da sole e lo
   studente risulta iscritto senza codici né elenchi. Il docente sceglie le
   classi che segue dall'elenco. Le classi create a mano con codice di
   iscrizione restano come alternativa per scuole senza gruppi di classe.
6. **Niente GeoGebra** (uso commerciale a pagamento). Figure con **JSXGraph**
   (LGPL/MIT).
7. **Licenze.** Il motore è opera derivata di Numbas: attribuzione Apache
   (NOTICE, header nei file derivati, pagina informazioni). SAVINT resta AGPL.
   L'eventuale monetizzazione (hosting/servizio) è una decisione separata e non
   rientra qui.
8. **Formato esercizio proprio** (JSON SAVINT, validato con zod) più un
   **importatore dal formato Numbas `.exam`**, per riusare esercizi pubblici
   CC BY e per i test di parità del motore.
9. **Bacino di esercizi e test a pesca casuale** (aggiunto il 2026-09-02). Il
   docente costruisce un bacino di esercizi **categorizzato** (anno di corso,
   argomento dalla lista curata, tag liberi, difficoltà) e poi crea un
   **test** con regole di pesca: "3 esercizi da Equazioni di 2° grado, 2 da
   Disequazioni, difficoltà media". La pesca avviene **per studente**, con un
   seed fissato per tentativo, così due studenti vicini hanno esercizi
   diversi e il docente può comunque rivedere esattamente ciò che ciascuno ha
   avuto; in alternativa il docente può scegliere "stessa pesca per tutta la
   classe". Il bacino è della scuola: gli esercizi sono visibili ai colleghi
   dell'installazione (come i quiz condivisi), il test è del docente.

## Fatti verificati sul codice Numbas (2 settembre 2026)

Repository `numbas/Numbas`, ultimo commit 26 agosto 2026.

| Componente | Righe | Note |
|---|---|---|
| `jme.js` (tokenizer, parser, tipi, valutazione) | 6.281 | cuore |
| `math.js` (aritmetica, precisione, decimali) | 4.077 | dipende da decimal.js |
| `jme-builtins.js` (funzioni predefinite) | 3.825 | |
| `jme-display.js` (rendering LaTeX delle espressioni) | 2.479 | |
| `part.js` + `parts/*.js` (tipi di parte) | 2.402 + 2.747 | |
| `jme-rules.js` (semplificazione, pattern matching) | 2.294 | |
| `util.js` | 1.778 | usa `parsel` (da verificare) |
| `exam.js`, `question.js` | 1.625 + 1.467 | da semplificare |
| `jme-variables.js` | 1.208 | |
| `marking.js` + script di correzione in JME | 694 + 810 | gli script sono dati |
| `jme-notations.js`, `jme-calculus.js` | 424 + ~200 | |
| **Totale motore da portare** | **~30.000** | |
| Tema di default (interfaccia) | 7.685 | non si porta |
| Test veri: `tests/jme/jme-tests.mjs`, `tests/parts/part-tests.mjs` | ~3.000 + parti | QUnit, si traducono in Vitest |
| Test generati dalla documentazione (`doc-tests.mjs`) | 6.209 | si riusano |

- **Nessun uso di Knockout né jQuery nel motore** (verificato con grep). MathJax è
  citato solo in `jme.js`: da isolare nel port.
- Dipendenze terze del motore: `decimal.js` (MIT), `seedrandom` (MIT), `i18next`
  (MIT, si sostituisce con un dizionario nostro), `parsel` (usato da `util`, da
  verificare se serve), `knockout` (solo tema, si elimina).
- Locale `it-IT`: 553 chiavi, 325 identiche all'inglese, quindi circa il 40%
  tradotto. Nel port i messaggi sono scritti da noi in italiano e inglese.
- Repo dell'estensione JSXGraph di Numbas senza licenza dichiarata: **non si
  copia**. L'integrazione JSXGraph la scriviamo noi.
- Moduli che **non** si portano: SCORM, storage, schedule, timing, xml,
  exam-to-xml, download, csv, diagnostic, controls, tema, `custom_part_type` ed
  `extension` (rinviati).

## Architettura complessiva

```
packages/engine/                      pacchetto TypeScript puro (nome provvisorio @savint/math-engine)
  src/math/        aritmetica, decimali, random con seed
  src/jme/         tokenizer, parser, tipi, valutazione, builtins, regole, calcolo, display LaTeX
  src/variables/   generazione variabili con vincoli
  src/marking/     interprete script di correzione, feedback
  src/parts/       numberentry, multipleresponse, patternmatch, gapfill, jme, matrixentry, information
  src/question/    domanda, esercizio, stato tentativo (serializzabile)
  src/i18n/        messaggi it/en
  test/            test portati + test differenziali contro il runtime originale (solo dev)

src/lib/esercizi/                     dominio SAVINT: classi, esercizi, compiti, tentativi, progressi, topics
src/lib/esercizi/format/              schema zod del formato SAVINT + importatore Numbas .exam
src/app/(student)/studente/...        area studente
src/app/(dashboard)/dashboard/esercizi/...  area docente
src/components/esercizi/player/       player React (usa il motore)
src/components/esercizi/editor/       editor React (usa il motore per anteprima e validazione)
```

- Il motore non dipende da Next, React o DOM. Gira in browser e in Node.
- Rendering formule: **KaTeX** (MIT). Se il LaTeX prodotto dal motore non fosse
  compatibile su qualche costrutto, fallback a MathJax. Si verifica nel
  sotto-progetto 2.
- Il player gira il motore **nel browser**; il server ricalcola il punteggio a
  fine tentativo con lo stesso seed per non fidarsi del client.

## Modello dati (aggiunte a Prisma)

```
enum Role { TEACHER ADMIN STUDENT }

Classe            id, name, yearLevel? 1..5 (dalla prima cifra del nome, modificabile), schoolYear,
                  source GOOGLE_GROUP|MANUAL, googleGroupEmail? @unique,
                  joinCode? @unique (solo MANUAL), archivedAt?, createdAt
ClasseDocente     classeId, teacherId → User, createdAt        @@unique([classeId, teacherId])
ClasseStudente    classeId, studentId → User, joinedAt         @@unique([classeId, studentId])
User.classGroups  Json? — gruppi di classe letti da Google all'ultimo login (email, nome, anno)
Esercizio         id, title, description?, authorId, yearLevel 1..5, topic (slug), tags[], difficulty 1..3,
                  createdAt, updatedAt                                   (il "bacino" è l'insieme degli esercizi dell'installazione)
EsercizioVersione id, esercizioId, version, content Json (formato SAVINT), hash, createdAt   @@unique([esercizioId, version])
Compito           id, title, classeId, assignedById, dueAt?, closedAt?, createdAt          (dueAt null = palestra)
                  drawMode PER_STUDENT|SAME_FOR_CLASS, drawSeed?
CompitoRegola     compitoId, order, count, yearLevel?, topic?, tags[]?, difficulty?     (regola di pesca; un compito
                  con una sola regola "count=1, esercizio fisso" è l'assegnazione diretta di un esercizio)
CompitoRegolaFissa compitoRegolaId, esercizioId                                        (esercizi scelti a mano invece che pescati)
Tentativo         id, compitoId, studentId, status IN_PROGRESS|COMPLETED, seed,
                  drawnVersionIds String[] (gli esercizi pescati per questo tentativo, in ordine),
                  state Json, score, maxScore, startedAt, completedAt?, lastActivityAt
TentativoDomanda  tentativoId, position, esercizioVersioneId, questionIndex, score, maxScore, answered
                  @@unique([tentativoId, position, questionIndex])
```

- Conservazione: `TENTATIVI_RETENTION_DAYS`, stessa meccanica delle sessioni live.
- Argomenti: lista curata per anno in `src/lib/esercizi/topics.ts` (dalle
  indicazioni nazionali) più tag liberi. La lista fissa serve perché "progressi
  per argomento" funziona solo se tutti taggano allo stesso modo.
- Pesca: alla creazione di un tentativo SAVINT applica le regole del compito
  al bacino (filtri per anno, argomento, tag, difficoltà), pesca `count`
  esercizi con il seed del tentativo (o `drawSeed` del compito se "stessa
  pesca per tutta la classe"), e salva gli id delle versioni pescate: la
  lista non cambia più, anche se il bacino cambia. Se il bacino non basta per
  una regola, il docente lo vede al salvataggio del compito.
- Classi da gruppo: a ogni login dello studente si allineano le iscrizioni
  (entra nelle classi nuove, esce da quelle che non ha più). Il docente che è
  membro di un gruppo di classe viene proposto come docente di quella classe.
- Tentativi illimitati, nessuna classifica tra studenti.

## Porting del motore: metodo

1. **Ordine per dipendenze** (dal grafo `queueScript` verificato):
   `util` + `math` → `jme-base` → `jme-rules` → `jme-calculus` → `jme-builtins`
   → `jme` (facciata) → `jme-display` → `jme-variables` → `marking` (con
   interprete degli script JME) → `part` + `parts/*` → `question` → `exam`
   ridotto a "esercizio".
2. **Test prima.** Per ogni modulo si traducono i test upstream da QUnit a Vitest e
   si fanno passare. Un modulo è "portato" solo quando i suoi test passano.
3. **Test differenziali.** Un corpus di esercizi Numbas (esempi ufficiali e banca
   pubblica CC BY) viene eseguito nel runtime originale headless (jsdom, solo
   devDependency) e nel port. Si confrontano: variabili generate a parità di
   seed, testo renderizzato, esito della correzione su risposte campione. Il
   runtime originale non entra mai in produzione.
4. **Parità numerica.** Si usano gli stessi algoritmi e le stesse librerie
   (`seedrandom`, `decimal.js`) così che, a parità di seed, le variabili
   coincidano.
5. **Stile.** TypeScript strict, ESM, moduli piccoli, niente namespace globale,
   API pubblica documentata. Header di attribuzione Apache nei file derivati.
6. **Agenti.** Il porting si spezza per modulo con i test upstream come criterio
   di accettazione: adatto a subagenti. Indicazione: Opus per `jme`, `jme-rules`,
   `jme-display`, `marking`; Sonnet per `util`, `math`, traduzione dei test.

## Sotto-progetti e ordine

| # | Sotto-progetto | Dipende da | Settimane |
|---|---|---|---|
| 1 | Cancello e ruoli (gruppi Google, ruolo STUDENT, gruppi di classe letti al login, enforcement, area studente minima) | — | 1 |
| 2 | Porting motore (`packages/engine`) | — | 8–12 |
| 3 | Player React, tentativi, salvataggio e ripresa | 1, 2 (parti) | 4–5 |
| 4 | Classi (da gruppi Google e manuali), bacino categorizzato, compiti con regole di pesca, progressi studente e docente | 1 | 4–5 |
| 5 | Editor esercizi, formato SAVINT, importatore Numbas, modelli pronti | 2, 3 | 6–8 |
| 6 | Hub esercizi (pubblica/scarica su savint.it) | 4, 5 | 2 |

Parallelismo: 1 e 2 partono subito; 4 può partire con esercizi fittizi mentre 2
procede; 3 appena il motore ha parti e correzione. Le stime sono grossolane e
servono solo a ordinare.

Il sotto-progetto 1 chiude anche un **buco di sicurezza già presente**: oggi
chiunque entri con Google diventa docente, senza controllo di dominio né ruolo.

## Non-obiettivi (per ora)

- Tipi di parte personalizzati ed estensioni generiche di Numbas.
- Modalità esame a tempo, valutazione sommativa, classifiche.
- Modalità diagnostica (percorsi adattivi).
- App mobile nativa.
- Monetizzazione.

## Punti aperti

- Nome del modulo e dell'area studente (provvisori: "Esercizi", "Palestra").
- KaTeX contro MathJax: si decide con la prova nel sotto-progetto 2.
- Pubblicare il pacchetto motore su npm come progetto a sé: dopo il lancio.
