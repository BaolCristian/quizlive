# Divergenze volute rispetto al runtime Numbas

| Area | Upstream | Motore SAVINT | Motivo |
|---|---|---|---|
| Casualità | `Math.random` globale, semina solo via funzione JME `seedrandom` | `Rng` iniettato nello scope, seminato per tentativo con `seedrandom(seed)` | ricalcolo lato server con lo stesso seed |
| Formato d'ingresso | XML compilato o JSON | solo JSON | il compilatore Python resta fuori |
| Messaggi | i18next, catalogo `en-GB` + traduzioni parziali | dizionario `it`/`en` nostro | italiano completo |
| Esame | `exam.js`: navigazione, timer, SCORM, gruppi con pesca | non portato | la composizione la fa SAVINT |
