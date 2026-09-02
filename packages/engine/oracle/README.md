# Oracolo (solo sviluppo)
Bundle di test del runtime Numbas, copiato da `tests/numbas-runtime.js`, `tests/locales.js` e `tests/marking_scripts.js`
del repository numbas/Numbas al commit 0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5 (Apache 2.0, Copyright Newcastle University).
Usato solo dai test differenziali in `packages/engine/test/differential/`; non entra nel build.
Per aggiornarlo: `scripts/engine/fetch-upstream.sh` e ricopia i due file, poi aggiorna il commit qui e in NOTICE.
