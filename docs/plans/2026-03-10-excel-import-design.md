# Design: Import quiz da Excel

## Panoramica
Il docente scarica un template Excel (.xlsx) generato dall'app, lo compila con le domande, e lo importa per creare un nuovo quiz o aggiungere domande a uno esistente.

## Template Excel
- **5 fogli**, uno per tipo: `Scelta Multipla`, `Vero o Falso`, `Risposta Aperta`, `Ordinamento`, `Stima Numerica`
- Ogni foglio ha una **riga di intestazione** con i nomi delle colonne e **una riga di esempio** precompilata
- **Colonne comuni** a tutti i fogli: Domanda, Tempo (sec), Punti, Confidenza (S/N) — con default 30s, 1000, N se vuoti

### Colonne specifiche per tipo

| Foglio | Colonne specifiche |
|---|---|
| Scelta Multipla | Opzione1, Opzione2, Opzione3, Opzione4, Opzione5, Opzione6, Corretta (es. "1" o "1,3" per multiple) |
| Vero o Falso | Risposta (V/F) |
| Risposta Aperta | Risposta1, Risposta2, Risposta3 (risposte accettate) |
| Ordinamento | Elemento1, Elemento2, ..., Elemento6 (nell'ordine corretto) |
| Stima Numerica | Valore Corretto, Tolleranza, Range Massimo |

## API

- **`GET /api/quiz/excel-template`** — genera e restituisce il file .xlsx con i 5 fogli, intestazioni ed esempi
- **`POST /api/quiz/excel-import`** — riceve il file .xlsx (multipart), parsa i fogli, valida le domande, restituisce JSON con le domande pronte. Parametro opzionale `quizId` per aggiungere a quiz esistente

## Libreria
- **ExcelJS** (`exceljs`) — per generazione e parsing del file .xlsx, sia lato server

## UI
- **Bottone "Scarica Template"** nella pagina lista quiz (accanto a "Nuovo Quiz" e "Importa .qlz")
- **Bottone "Importa da Excel"** — stesso posto, apre file picker per .xlsx
- Nell'editor quiz esistente, un bottone "Aggiungi da Excel" per aggiungere domande

## Flusso
1. Docente clicca "Scarica Template" → download del .xlsx
2. Compila il file nel proprio programma di fogli di calcolo
3. Clicca "Importa da Excel" → sceglie se creare nuovo quiz o aggiungere a esistente
4. L'app valida il file e mostra un'anteprima con eventuali errori
5. Conferma → le domande vengono salvate

## Validazione
- Righe vuote ignorate
- Fogli vuoti ignorati
- Errori per riga (es. "Riga 3 di Scelta Multipla: manca la risposta corretta") mostrati all'utente prima di confermare

## Tipi supportati
MULTIPLE_CHOICE, TRUE_FALSE, OPEN_ANSWER, ORDERING, NUMERIC_ESTIMATION
