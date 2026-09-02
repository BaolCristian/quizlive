# @savint/engine

Motore matematico di SAVINT Esercizi: porting in TypeScript del runtime
Numbas (https://github.com/numbas/Numbas), per valutare espressioni JME,
correggere le risposte e generare varianti casuali seminate delle domande.

## Uso

```ts
import { loadQuestion } from "@savint/engine";
```

## Test

`npx vitest run packages/engine`

Spec: `docs/superpowers/specs/2026-09-02-esercizi-02-motore-design.md`.

Derived from Numbas, see NOTICE.
