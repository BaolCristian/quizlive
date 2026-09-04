# Corpus pubblico (opzionale, non committato)

Questa cartella ospita le domande scaricate dal database pubblico dell'editor
Numbas, `https://numbas.mathcentre.ac.uk`. È **vuota nel repository**: i JSON
scaricati sono esclusi da `.gitignore`. `test/differential/corpus.ts` li
raccoglie da sé se ci sono, così chi vuole può allargare il corpus in locale
senza toccare il codice.

## L'esportazione senza autenticazione esiste

La decisione 4 del brief del Task 10 chiedeva di verificarlo. **Sì, esiste**,
ma non come endpoint JSON: la pagina pubblica di una domanda
(`/question/<id>/<slug>/`, raggiungibile da `/search/` senza account) contiene
un link di download nella forma

```
/question/<id>/<slug>.exam?token=<uuid>
```

con un token generato per quella pagina. Il file scaricato è in formato
`.exam`: una riga di commento `// Numbas version: <versione>` seguita da un
oggetto JSON di **esame**, in cui la domanda sta in
`question_groups[0].questions[0]` — già nella forma che `loadQuestion`
accetta. Non c'è un `.json` diretto: `/question/<id>/download/question.json`,
`/question/<id>.json` e `/questions/` rispondono 404.

`scripts/engine/fetch-public-questions.sh` automatizza il giro (pagina →
token → `.exam` → domanda), leggendo gli URL da `sources.txt`.

## Perché la cartella resta vuota

Il database pubblico mescola licenze diverse — la voce `metadata.licence` di
ogni domanda può essere `Creative Commons Attribution 4.0 International`
(CC BY), una delle varianti `NonCommercial` / `NoDerivs` / `ShareAlike`, o
`None specified`. Le varianti `NC` e `SA` non sono compatibili con questo
repository, e anche la CC BY richiede di conservare l'attribuzione di ogni
singolo autore. Lo script quindi:

- scarica **solo** le domande con licenza esattamente CC BY, saltando le altre
  con un messaggio;
- conserva in ogni file un campo `_savint_source` con URL, licenza e
  `contributors`, perché l'attribuzione non si perda.

Nessuna domanda pubblica è committata: il corpus del differenziale è quello
`upstream` (le 42 domande inline di `tests/parts/part-tests.mjs`, estratte da
`scripts/engine/extract-part-tests-questions.mjs`) più quello `savint` (le 12
domande scritte a mano in `test/fixtures/savint/`). Il corpus pubblico è
un'estensione locale, facoltativa.

## Uso

```bash
# aggiungi gli URL delle domande a sources.txt, poi:
bash scripts/engine/fetch-public-questions.sh
npm run test:engine:diff
```
