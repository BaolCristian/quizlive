# Esercizi 03 — Player, tentativi, salvataggio e ripresa — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uno studente apre un link, risolve un esercizio di matematica con variabili generate dal suo seme, riceve il feedback, e ritrova il tentativo esattamente com'era se torna più tardi.

**Architecture:** il motore `@savint/engine` gira nel browser per il feedback immediato e in Node per il ricalcolo autorevole. A ogni risposta il client manda lo stato serializzato del motore; il server ricarica la domanda dal seme, riapplica lo stato e scrive il punteggio che ha calcolato lui. Le formule si rendono con KaTeX, con protezione delle stringhe dentro `\textrm{}`.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma/PostgreSQL, NextAuth 5, next-intl 4, Tailwind 4, shadcn su `@base-ui/react`, Vitest + Testing Library, Playwright, KaTeX 0.16+.

**Spec:** `docs/superpowers/specs/2026-09-05-esercizi-03-player-design.md`

## Global Constraints

- Un tentativo riguarda **un solo esercizio**. `Tentativo.compitoId` è nullable e resta sempre `null` in questo sotto-progetto.
- **Non si introduce `TentativoDomanda`**, né `Classe`, `Compito`, `CompitoRegola`: sono i sotto-progetti 4 e 5.
- **Non si modifica `packages/engine`.** Se serve un aggiro (per esempio la protezione dei `\textrm{}`), sta nel player.
- Il punteggio scritto su `Tentativo.score` è **sempre** quello calcolato dal server, mai quello mandato dal client.
- Il seme lo genera il server all'avvio del tentativo e non cambia più.
- Ogni rotta API: `requireStudent()` da `@/lib/auth/require-role`, controllo che il tentativo appartenga a chi chiama, validazione `zod` con `safeParse`, risposte `NextResponse.json(data, { status })`, errori nella forma `{ error: "..." }`.
- I parametri di rotta in Next 16 sono `Promise` e vanno attesi: `{ params }: { params: Promise<{ id: string }> }`.
- Ogni stringa mostrata all'utente passa da next-intl, nello spazio dei nomi `esercizi`, presente **in entrambi** `src/messages/it.json` e `src/messages/en.json`.
- La lingua dello studente si passa al motore come `locale` in `loadQuestion`/`restoreQuestion`. Non si chiama mai `setLocale` dal player.
- Prisma si importa così: `import { prisma } from "@/lib/db/client"`.
- Test di componente in `__tests__/` accanto al componente, avvolti in `<NextIntlClientProvider locale="it" messages={it}>`.
- Gate prima di ogni commit: `npx tsc --noEmit`, `npx eslint --quiet <file toccati>`, `npm run test:run`.
- Commit in italiano, con i trailer `Co-Authored-By:` e `Claude-Session:` già in uso sul repository.

---

### Task 1: Modelli Prisma e migrazione

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_esercizi_player/migration.sql` (generata)
- Test: `src/lib/esercizi/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: il modello `User` esistente.
- Produces: i modelli Prisma `Esercizio`, `EsercizioVersione`, `Tentativo` e l'enum `TentativoStatus`, con i campi esattamente come sotto.

- [ ] **Step 1: Scrivi il test che fallisce**

`src/lib/esercizi/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("schema esercizi", () => {
  it("dichiara i tre modelli e l'enum", () => {
    expect(schema).toMatch(/^model Esercizio \{/m);
    expect(schema).toMatch(/^model EsercizioVersione \{/m);
    expect(schema).toMatch(/^model Tentativo \{/m);
    expect(schema).toMatch(/^enum TentativoStatus \{/m);
  });

  it("Tentativo.compitoId e' nullable: il sotto-progetto 4 lo riempira'", () => {
    const model = schema.match(/model Tentativo \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/compitoId\s+String\?/);
  });

  it("Tentativo tiene seme, stato e punteggi", () => {
    const model = schema.match(/model Tentativo \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/seed\s+String/);
    expect(model).toMatch(/state\s+Json\?/);
    expect(model).toMatch(/score\s+Float/);
    expect(model).toMatch(/maxScore\s+Float/);
  });

  it("User ha il lato inverso della relazione", () => {
    const model = schema.match(/model User \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/tentativi\s+Tentativo\[\]/);
  });

  it("EsercizioVersione e' unica per (esercizio, versione)", () => {
    const model = schema.match(/model EsercizioVersione \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[esercizioId, version\]\)/);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/esercizi/__tests__/schema.test.ts`
Expected: FAIL, i modelli non esistono.

- [ ] **Step 3: Aggiungi i modelli**

In fondo a `prisma/schema.prisma`:

```prisma
model Esercizio {
  id          String   @id @default(cuid())
  title       String
  description String?
  authorId    String?
  yearLevel   Int
  topic       String
  tags        String[]
  difficulty  Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  versions    EsercizioVersione[]

  @@index([yearLevel, topic])
}

model EsercizioVersione {
  id          String   @id @default(cuid())
  esercizioId String
  version     Int
  content     Json
  hash        String
  createdAt   DateTime @default(now())
  esercizio   Esercizio @relation(fields: [esercizioId], references: [id], onDelete: Cascade)
  tentativi   Tentativo[]

  @@unique([esercizioId, version])
}

enum TentativoStatus {
  IN_PROGRESS
  COMPLETED
}

model Tentativo {
  id                  String   @id @default(cuid())
  studentId           String
  esercizioVersioneId String
  compitoId           String?
  seed                String
  state               Json?
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

Nel modello `User`, accanto alle altre relazioni, aggiungi:

```prisma
  tentativi Tentativo[]
```

- [ ] **Step 4: Genera la migrazione e il client**

Run:
```bash
npx prisma migrate dev --name esercizi_player
npx prisma generate
```
Expected: migrazione creata, client rigenerato senza errori.

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `npx vitest run src/lib/esercizi/__tests__/schema.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/esercizi/__tests__/schema.test.ts
git commit -m "feat(esercizi): modelli Esercizio, EsercizioVersione e Tentativo"
```

---

### Task 2: Formato dei contenuti, esercizi seminati e comando di seed

**Files:**
- Create: `src/lib/esercizi/format/schema.ts`
- Create: `src/lib/esercizi/seed.ts`
- Create: `scripts/seed-esercizi.ts`
- Create: `content/esercizi/01-equazione-primo-grado.json` e altri sette (elenco allo Step 4)
- Modify: `package.json` (script `seed:esercizi`)
- Test: `src/lib/esercizi/format/__tests__/schema.test.ts`, `src/lib/esercizi/__tests__/seed.test.ts`

**Interfaces:**
- Consumes: i modelli del Task 1; `loadQuestion` da `@savint/engine` per validare che ogni contenuto sia caricabile.
- Produces:
  ```ts
  // src/lib/esercizi/format/schema.ts
  export const esercizioFileSchema: z.ZodType<EsercizioFile>;
  export interface EsercizioFile {
    savint: { version: 1; title: string; description?: string; yearLevel: number;
              topic: string; tags: string[]; difficulty: number };
    question: unknown;   // JSON Numbas, non interpretato qui
  }
  export function hashContenuto(question: unknown): string;   // sha-256 esadecimale
  // src/lib/esercizi/seed.ts
  export async function seedEsercizi(dir: string): Promise<{ creati: number; aggiornati: number; invariati: number }>;
  ```

- [ ] **Step 1: Scrivi i test che falliscono**

`src/lib/esercizi/format/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { esercizioFileSchema, hashContenuto } from "../schema";

const valido = {
  savint: { version: 1, title: "Equazione", yearLevel: 2, topic: "equazioni", tags: ["primo-grado"], difficulty: 1 },
  question: { name: "x", parts: [] },
};

describe("schema del file esercizio", () => {
  it("accetta un file valido", () => {
    expect(esercizioFileSchema.safeParse(valido).success).toBe(true);
  });

  it("rifiuta un anno fuori da 1..5", () => {
    const r = esercizioFileSchema.safeParse({ ...valido, savint: { ...valido.savint, yearLevel: 6 } });
    expect(r.success).toBe(false);
  });

  it("rifiuta una difficolta' fuori da 1..3", () => {
    const r = esercizioFileSchema.safeParse({ ...valido, savint: { ...valido.savint, difficulty: 0 } });
    expect(r.success).toBe(false);
  });

  it("non interpreta il contenuto della domanda", () => {
    const r = esercizioFileSchema.safeParse({ ...valido, question: { qualsiasi: "cosa" } });
    expect(r.success).toBe(true);
  });

  it("l'hash dipende dal contenuto e non dall'ordine delle chiavi", () => {
    expect(hashContenuto({ a: 1, b: 2 })).toBe(hashContenuto({ b: 2, a: 1 }));
    expect(hashContenuto({ a: 1 })).not.toBe(hashContenuto({ a: 2 }));
  });
});
```

`src/lib/esercizi/__tests__/seed.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { seedEsercizi } from "../seed";

function scriviEsercizio(dir: string, nome: string, titolo: string, question: unknown) {
  writeFileSync(path.join(dir, nome), JSON.stringify({
    savint: { version: 1, title: titolo, yearLevel: 1, topic: "prova", tags: [], difficulty: 1 },
    question,
  }));
}

const domanda = { name: "Prova", statement: "<p>Quanto fa 1+1?</p>", variables: {}, parts: [
  { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
] };

describe("seed degli esercizi", () => {
  beforeEach(async () => {
    await prisma.tentativo.deleteMany();
    await prisma.esercizioVersione.deleteMany();
    await prisma.esercizio.deleteMany();
  });

  it("crea esercizio e prima versione", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 1, aggiornati: 0, invariati: 0 });
    const versioni = await prisma.esercizioVersione.findMany();
    expect(versioni).toHaveLength(1);
    expect(versioni[0]!.version).toBe(1);
  });

  it("un secondo giro con lo stesso contenuto non crea versioni", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 0, aggiornati: 0, invariati: 1 });
    expect(await prisma.esercizioVersione.count()).toBe(1);
  });

  it("un contenuto cambiato alza la versione e lascia la vecchia", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    scriviEsercizio(dir, "01-prova.json", "Prova", { ...domanda, statement: "<p>Cambiato</p>" });
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 0, aggiornati: 1, invariati: 0 });
    const versioni = await prisma.esercizioVersione.findMany({ orderBy: { version: "asc" } });
    expect(versioni.map((v) => v.version)).toEqual([1, 2]);
  });

  it("rifiuta un file che il motore non sa caricare", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-rotta.json", "Rotta", { name: "x", partsMode: "explore", parts: [] });
    await expect(seedEsercizi(dir)).rejects.toThrow(/01-rotta\.json/);
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/esercizi`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 3: Scrivi lo schema e l'hash**

`src/lib/esercizi/format/schema.ts`:

```ts
import { z } from "zod";
import { createHash } from "crypto";

/** L'involucro SAVINT attorno a una domanda Numbas. Il contenuto della
 * domanda non viene interpretato qui: lo valida il motore al caricamento. */
export const esercizioFileSchema = z.object({
  savint: z.object({
    version: z.literal(1),
    title: z.string().min(1),
    description: z.string().optional(),
    yearLevel: z.number().int().min(1).max(5),
    topic: z.string().min(1),
    tags: z.array(z.string()),
    difficulty: z.number().int().min(1).max(3),
  }),
  question: z.unknown(),
});

export type EsercizioFile = z.infer<typeof esercizioFileSchema>;

/** Serializzazione stabile: le chiavi in ordine, così l'hash non cambia se
 * cambia solo l'ordine con cui sono scritte nel file. */
function stabile(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stabile).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stabile(o[k])}`).join(",")}}`;
}

export function hashContenuto(question: unknown): string {
  return createHash("sha256").update(stabile(question)).digest("hex");
}
```

- [ ] **Step 4: Scrivi gli otto esercizi**

Crea `content/esercizi/` con questi otto file. Il campo `question` è JSON Numbas: per la forma esatta di ogni tipo di parte guarda le fixture già nel repository, `packages/engine/test/fixtures/savint/*.json`, che coprono tutti i tipi in ambito. Testi in italiano.

| File | Anno | Argomento | Tipo di parte | Difficoltà |
|---|---|---|---|---|
| `01-equazione-primo-grado.json` | 1 | `equazioni` | `numberentry` | 1 |
| `02-scomposizione-polinomi.json` | 2 | `polinomi` | `1_n_2` | 1 |
| `03-sistemi-lineari.json` | 2 | `sistemi` | `gapfill` (due `numberentry`) | 2 |
| `04-disequazioni-secondo-grado.json` | 3 | `disequazioni` | `m_n_2` | 2 |
| `05-goniometria-valori.json` | 4 | `goniometria` | `m_n_x` | 2 |
| `06-derivate-elementari.json` | 5 | `derivate` | `jme` | 2 |
| `07-limiti-notevoli.json` | 5 | `limiti` | `numberentry` con tolleranza | 3 |
| `08-terminologia-funzioni.json` | 3 | `funzioni` | `patternmatch` | 1 |

Il primo, per intero, come modello per gli altri sette:

```json
{
  "savint": {
    "version": 1,
    "title": "Equazione di primo grado",
    "description": "Risolvere un'equazione di primo grado a coefficienti interi.",
    "yearLevel": 1,
    "topic": "equazioni",
    "tags": ["primo-grado", "equazioni"],
    "difficulty": 1
  },
  "question": {
    "name": "Equazione di primo grado",
    "statement": "<p>Risolvi l'equazione \\(\\var{a}x + \\var{b} = \\var{c}\\).</p>",
    "advice": "<p>Sottrai \\(\\var{b}\\) da entrambi i membri e dividi per \\(\\var{a}\\): \\(x = \\simplify{({c}-{b})/{a}}\\).</p>",
    "variables": {
      "a": { "name": "a", "definition": "random(2..9)", "description": "" },
      "k": { "name": "k", "definition": "random(-6..6 except 0)", "description": "" },
      "b": { "name": "b", "definition": "random(-9..9 except 0)", "description": "" },
      "c": { "name": "c", "definition": "a*k + b", "description": "" }
    },
    "variablesTest": { "condition": "", "maxRuns": 10 },
    "ungrouped_variables": ["a", "k", "b", "c"],
    "variable_groups": [],
    "functions": {},
    "rulesets": {},
    "parts": [
      {
        "type": "numberentry",
        "marks": 2,
        "prompt": "<p>\\(x = \\)</p>",
        "minValue": "k",
        "maxValue": "k",
        "correctAnswerFraction": false,
        "allowFractions": false,
        "notationStyles": ["plain"]
      }
    ]
  }
}
```

- [ ] **Step 5: Scrivi il seed**

`src/lib/esercizi/seed.ts`:

```ts
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { esercizioFileSchema, hashContenuto } from "./format/schema";

export interface RisultatoSeed { creati: number; aggiornati: number; invariati: number }

/** Carica gli esercizi da una cartella. Il nome del file, senza estensione, è
 * la chiave stabile dell'esercizio: rinominarlo crea un esercizio nuovo. */
export async function seedEsercizi(dir: string): Promise<RisultatoSeed> {
  const out: RisultatoSeed = { creati: 0, aggiornati: 0, invariati: 0 };

  for (const nome of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const grezzo: unknown = JSON.parse(readFileSync(path.join(dir, nome), "utf8"));
    const parsed = esercizioFileSchema.safeParse(grezzo);
    if (!parsed.success) {
      throw new Error(`${nome}: involucro SAVINT non valido — ${parsed.error.message}`);
    }
    const { savint, question } = parsed.data;

    // Il motore è l'unico giudice del contenuto: se non lo carica, il seed si ferma.
    try {
      loadQuestion(question as NumbasQuestionJSON, { seed: "verifica-seed" });
    } catch (e) {
      throw new Error(`${nome}: il motore non carica la domanda — ${e instanceof Error ? e.message : String(e)}`);
    }

    const chiave = nome.replace(/\.json$/, "");
    const hash = hashContenuto(question);

    const esercizio = await prisma.esercizio.upsert({
      where: { id: chiave },
      create: {
        id: chiave, title: savint.title, description: savint.description ?? null,
        yearLevel: savint.yearLevel, topic: savint.topic, tags: savint.tags, difficulty: savint.difficulty,
      },
      update: {
        title: savint.title, description: savint.description ?? null,
        yearLevel: savint.yearLevel, topic: savint.topic, tags: savint.tags, difficulty: savint.difficulty,
      },
    });

    const ultima = await prisma.esercizioVersione.findFirst({
      where: { esercizioId: esercizio.id },
      orderBy: { version: "desc" },
    });

    if (!ultima) {
      await prisma.esercizioVersione.create({
        data: { esercizioId: esercizio.id, version: 1, content: question as object, hash },
      });
      out.creati++;
    } else if (ultima.hash !== hash) {
      await prisma.esercizioVersione.create({
        data: { esercizioId: esercizio.id, version: ultima.version + 1, content: question as object, hash },
      });
      out.aggiornati++;
    } else {
      out.invariati++;
    }
  }

  return out;
}
```

`scripts/seed-esercizi.ts`:

```ts
import path from "path";
import { seedEsercizi } from "../src/lib/esercizi/seed";

const dir = path.resolve(process.cwd(), "content/esercizi");
seedEsercizi(dir)
  .then((r) => { console.log(`esercizi: ${r.creati} creati, ${r.aggiornati} aggiornati, ${r.invariati} invariati`); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
```

In `package.json`, fra gli script:

```json
    "seed:esercizi": "tsx scripts/seed-esercizi.ts",
```

- [ ] **Step 6: Esegui i test e il seed**

Run:
```bash
npx vitest run src/lib/esercizi
npm run seed:esercizi
```
Expected: test verdi; il seed stampa `8 creati, 0 aggiornati, 0 invariati`, e un secondo giro stampa `0 creati, 0 aggiornati, 8 invariati`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/esercizi content/esercizi scripts/seed-esercizi.ts package.json
git commit -m "feat(esercizi): formato dei contenuti, otto esercizi e comando di seed"
```

---

### Task 3: Componente `Formula` (KaTeX con protezione dei `\textrm{}`)

**Files:**
- Create: `src/components/esercizi/player/formula.tsx`
- Create: `src/components/esercizi/player/proteggi-textrm.ts`
- Modify: `package.json` (dipendenze `katex`, `@types/katex`)
- Modify: `src/app/globals.css` (import del CSS di KaTeX)
- Test: `src/components/esercizi/player/__tests__/proteggi-textrm.test.ts`, `.../formula.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function proteggiTextrm(tex: string): string;
  export function Formula(props: { tex: string; display?: boolean }): JSX.Element;
  ```

**Perché esiste `proteggiTextrm`:** il motore riproduce upstream byte per byte e inserisce stringhe grezze dentro `\textrm{}`. KaTeX rifiuta `\textrm{x_1}`, `\textrm{x^2}`, `\textrm{2%}`, `\textrm{\d+}`. Sono 17 casi su 652 nel corpus, tutti di questa forma. La protezione sta qui, non nel motore.

- [ ] **Step 1: Scrivi i test che falliscono**

`src/components/esercizi/player/__tests__/proteggi-textrm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import katex from "katex";
import { proteggiTextrm } from "../proteggi-textrm";

/** Le stringhe che il motore produce e che KaTeX rifiuta senza protezione.
 * Vengono dal corpus della prova del 2026-09-05 (spec, sezione "Prova su KaTeX"). */
const CASI_ROTTI = [
  String.raw`\operatorname{normalise\_subscripts} \left ( \textrm{x_1} \right )`,
  String.raw`\operatorname{latex} \left ( \operatorname{expression} \left ( \textrm{x^2 + 3/4} \right ) \right )`,
  String.raw`\operatorname{unpercent} \left ( \textrm{2%} \right )`,
  String.raw`\operatorname{match\_regex} \left ( \textrm{\d+}, \textrm{01234} \right )`,
  String.raw`\operatorname{formatstring} \left ( \textrm{Their name is %s}, \left[ \textrm{Hortense} \right] \right )`,
  String.raw`\operatorname{render} \left ( \operatorname{safe} \left ( \textrm{Let $x = \var{x}$} \right ) \right )`,
];

describe("protezione del contenuto dei \\textrm{}", () => {
  it.each(CASI_ROTTI)("rende con KaTeX dopo la protezione: %s", (tex) => {
    expect(() => katex.renderToString(tex, { throwOnError: true })).toThrow();
    expect(() => katex.renderToString(proteggiTextrm(tex), { throwOnError: true })).not.toThrow();
  });

  it("non tocca la matematica fuori dai \\textrm{}", () => {
    const tex = String.raw`\frac{x^2}{2} + \sqrt{y_1}`;
    expect(proteggiTextrm(tex)).toBe(tex);
  });

  it("protegge solo il contenuto, non il comando", () => {
    expect(proteggiTextrm(String.raw`\textrm{a_b}`)).toBe(String.raw`\textrm{a\_b}`);
  });

  it("regge \\textrm{} annidati e vuoti", () => {
    expect(() => proteggiTextrm(String.raw`\textrm{}`)).not.toThrow();
    expect(proteggiTextrm(String.raw`\textrm{}`)).toBe(String.raw`\textrm{}`);
  });
});
```

`src/components/esercizi/player/__tests__/formula.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Formula } from "../formula";

describe("Formula", () => {
  it("rende una formula valida come KaTeX", () => {
    const { container } = render(<Formula tex="x^2" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("rende in display quando richiesto", () => {
    const { container } = render(<Formula tex="\int_0^1 x dx" display />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("protegge le stringhe che KaTeX rifiuterebbe", () => {
    const { container } = render(<Formula tex={String.raw`\textrm{x_1}`} />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("ricade sul testo grezzo invece di lanciare", () => {
    render(<Formula tex={String.raw`\nonesiste{`} />);
    expect(screen.getByText(String.raw`\nonesiste{`)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/components/esercizi/player`
Expected: FAIL, `katex` non installato e i moduli non esistono.

- [ ] **Step 3: Installa KaTeX**

**Prima**, ferma il server di sviluppo se è in esecuzione: `npm ci`/`npm install` cancella e ricostruisce `node_modules`, e un dev server acceso durante l'installazione fallisce con "Next.js package not found".

Run: `npm install katex && npm install -D @types/katex`

In `src/app/globals.css`, dopo l'import di Tailwind:

```css
@import "katex/dist/katex.min.css";
```

- [ ] **Step 4: Scrivi la protezione**

`src/components/esercizi/player/proteggi-textrm.ts`:

```ts
/** I caratteri che dentro `\textrm{}` fanno fallire il parser di KaTeX. */
const DA_PROTEGGERE: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "_": "\\_",
  "^": "\\textasciicircum{}",
  "%": "\\%",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "~": "\\textasciitilde{}",
};

/** Protegge il contenuto di ogni `\textrm{...}`, lasciando intatto tutto il
 * resto. Il motore riproduce upstream byte per byte e ci mette dentro
 * stringhe grezze: MathJax le tollera, KaTeX no. */
export function proteggiTextrm(tex: string): string {
  let out = "";
  let i = 0;
  const marcatore = "\\textrm{";

  while (i < tex.length) {
    const inizio = tex.indexOf(marcatore, i);
    if (inizio === -1) { out += tex.slice(i); break; }

    out += tex.slice(i, inizio + marcatore.length);

    // Trova la graffa che chiude, contando gli annidamenti.
    let profondita = 1;
    let j = inizio + marcatore.length;
    let contenuto = "";
    while (j < tex.length && profondita > 0) {
      const c = tex[j]!;
      if (c === "{") profondita++;
      else if (c === "}") { profondita--; if (profondita === 0) break; }
      contenuto += c;
      j++;
    }

    out += contenuto.replace(/[\\_^%$&#~]/g, (c) => DA_PROTEGGERE[c] ?? c);
    if (j < tex.length) out += "}";
    i = j + 1;
  }

  return out;
}
```

- [ ] **Step 5: Scrivi il componente**

`src/components/esercizi/player/formula.tsx`:

```tsx
"use client";

import katex from "katex";
import { useMemo } from "react";
import { proteggiTextrm } from "./proteggi-textrm";

export interface FormulaProps {
  /** Il LaTeX prodotto dal motore. */
  tex: string;
  /** Formula centrata su riga propria invece che nel testo. */
  display?: boolean;
}

/** Rende una formula con KaTeX. Non lancia mai: se il LaTeX non è
 * renderizzabile nemmeno dopo la protezione, mostra il sorgente. */
export function Formula({ tex, display = false }: FormulaProps) {
  const reso = useMemo(() => {
    try {
      return katex.renderToString(proteggiTextrm(tex), {
        displayMode: display,
        throwOnError: true,
        strict: "ignore",
      });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (reso === null) {
    return <code className="rounded bg-muted px-1 py-0.5 text-sm">{tex}</code>;
  }
  return <span dangerouslySetInnerHTML={{ __html: reso }} />;
}
```

- [ ] **Step 6: Esegui i test e verifica che passino**

Run: `npx vitest run src/components/esercizi/player`
Expected: PASS, 10 test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/app/globals.css src/components/esercizi/player
git commit -m "feat(esercizi/player): rendering delle formule con KaTeX e protezione dei textrm"
```

---

### Task 4: Contenuto HTML della domanda (testo + formule, ripulito)

**Files:**
- Create: `src/components/esercizi/player/contenuto-html.tsx`
- Test: `src/components/esercizi/player/__tests__/contenuto-html.test.tsx`

**Interfaces:**
- Consumes: `Formula` dal Task 3.
- Produces: `export function ContenutoHtml(props: { html: string }): JSX.Element;`

Il motore restituisce `statementHtml`, `adviceHtml` e `promptHtml` come HTML con le formule fra `\( \)` e `\[ \]`. Qui si divide il testo dalle formule, si rende il testo con un allowlist minimo e le formule con `Formula`.

- [ ] **Step 1: Scrivi il test che fallisce**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContenutoHtml } from "../contenuto-html";

describe("ContenutoHtml", () => {
  it("rende il testo e le formule in linea", () => {
    const { container } = render(<ContenutoHtml html={"<p>Risolvi \\(x^2\\) ora.</p>"} />);
    expect(screen.getByText(/Risolvi/)).toBeInTheDocument();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("rende le formule in display", () => {
    const { container } = render(<ContenutoHtml html={"<p>\\[\\frac{1}{2}\\]</p>"} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("toglie script e gestori di eventi", () => {
    const { container } = render(
      <ContenutoHtml html={'<p onclick="alert(1)">ciao</p><script>alert(2)</script>'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(screen.getByText("ciao")).toBeInTheDocument();
  });

  it("tiene i tag di formattazione ammessi", () => {
    const { container } = render(<ContenutoHtml html={"<p>a <strong>b</strong> <em>c</em></p><ul><li>d</li></ul>"} />);
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.querySelector("li")).not.toBeNull();
  });

  it("regge un HTML vuoto", () => {
    const { container } = render(<ContenutoHtml html="" />);
    expect(container).toBeTruthy();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/components/esercizi/player/__tests__/contenuto-html.test.tsx`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 3: Implementa**

```tsx
"use client";

import { Fragment, type ReactNode } from "react";
import { Formula } from "./formula";

const TAG_AMMESSI = new Set([
  "P", "BR", "STRONG", "EM", "B", "I", "U", "SUB", "SUP",
  "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CODE", "PRE", "SPAN", "DIV",
]);

/** Toglie tutto ciò che non è nell'allowlist e ogni attributo che non sia
 * `class`. I contenuti oggi vengono dal repository, ma dal sotto-progetto 6
 * arriveranno da altre installazioni: meglio averla adesso. */
function ripulisci(nodo: Element): void {
  for (const figlio of Array.from(nodo.children)) {
    if (!TAG_AMMESSI.has(figlio.tagName)) {
      figlio.replaceWith(...Array.from(figlio.childNodes));
      continue;
    }
    for (const attr of Array.from(figlio.attributes)) {
      if (attr.name !== "class") figlio.removeAttribute(attr.name);
    }
    ripulisci(figlio);
  }
}

/** Divide un testo in pezzi normali e formule. */
function dividiFormule(testo: string): ReactNode[] {
  const pezzi: ReactNode[] = [];
  const re = /\\\((.*?)\\\)|\\\[(.*?)\\\]/gs;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(testo)) !== null) {
    if (m.index > ultimo) pezzi.push(testo.slice(ultimo, m.index));
    const inline = m[1] !== undefined;
    pezzi.push(<Formula key={k++} tex={(m[1] ?? m[2] ?? "").trim()} display={!inline} />);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) pezzi.push(testo.slice(ultimo));
  return pezzi;
}

function rendi(nodo: Node, chiave: number): ReactNode {
  if (nodo.nodeType === Node.TEXT_NODE) {
    return <Fragment key={chiave}>{dividiFormule(nodo.textContent ?? "")}</Fragment>;
  }
  if (nodo.nodeType !== Node.ELEMENT_NODE) return null;
  const el = nodo as Element;
  const Tag = el.tagName.toLowerCase() as keyof JSX.IntrinsicElements;
  const figli = Array.from(el.childNodes).map((n, i) => rendi(n, i));
  return <Tag key={chiave} className={el.getAttribute("class") ?? undefined}>{figli}</Tag>;
}

export function ContenutoHtml({ html }: { html: string }) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const radice = doc.body.firstElementChild!;
  ripulisci(radice);
  return <>{Array.from(radice.childNodes).map((n, i) => rendi(n, i))}</>;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run src/components/esercizi/player/__tests__/contenuto-html.test.tsx`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/components/esercizi/player
git commit -m "feat(esercizi/player): rendering del testo della domanda con formule e allowlist"
```

---

### Task 5: Dominio server — ricalcolo e ciclo di vita del tentativo

**Files:**
- Create: `src/lib/esercizi/marking.ts`
- Create: `src/lib/esercizi/tentativo.ts`
- Test: `src/lib/esercizi/__tests__/marking.test.ts`, `src/lib/esercizi/__tests__/tentativo.test.ts`

**Interfaces:**
- Consumes: modelli del Task 1; `loadQuestion`, `restoreQuestion`, `type QuestionState`, `type Answer`, `type MarkingResult` da `@savint/engine`.
- Produces:
  ```ts
  // marking.ts
  export interface EsitoRicalcolo { score: number; maxScore: number; state: QuestionState;
                                    feedback: { path: string; items: MarkingResult["feedback"] }[] }
  export function ricalcola(content: unknown, seed: string, state: QuestionState | null,
                            locale: "it" | "en"): EsitoRicalcolo;
  // tentativo.ts
  export async function avviaORiprendi(studentId: string, esercizioId: string):
    Promise<{ tentativoId: string; seed: string; content: unknown; state: QuestionState | null;
              score: number; maxScore: number; status: "IN_PROGRESS" | "COMPLETED" } | null>;
  export async function applicaRisposta(tentativoId: string, studentId: string,
    partPath: string, answer: Answer, statoClient: QuestionState, locale: "it" | "en"):
    Promise<{ ok: true; score: number; maxScore: number; feedback: MarkingResult["feedback"] }
          | { ok: false; motivo: "non_trovato" | "non_tuo" | "gia_completato" | "parte_sconosciuta" }>;
  export async function completa(tentativoId: string, studentId: string, locale: "it" | "en"):
    Promise<{ ok: true; score: number; maxScore: number } | { ok: false; motivo: "non_trovato" | "non_tuo" }>;
  ```

**Il punto di questo task:** il server non si fida dello stato che arriva dal client. Lo usa per ricostruire le risposte, ma il punteggio lo ricalcola applicando lui il motore, e scrive il proprio risultato.

- [ ] **Step 1: Scrivi il test di parità che fallisce**

`src/lib/esercizi/__tests__/marking.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { ricalcola } from "../marking";

const dir = path.resolve(process.cwd(), "content/esercizi");
const file = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("ricalcolo lato server", () => {
  it.each(file)("su %s da' lo stesso punteggio del motore nel browser", (nome) => {
    const { question } = JSON.parse(readFileSync(path.join(dir, nome), "utf8")) as { question: NumbasQuestionJSON };
    const seed = `parita-${nome}`;

    // "Client": carica, risponde giusto a ogni parte, serializza.
    const q = loadQuestion(question, { seed, locale: "it" });
    for (const p of q.allParts()) {
      if (p.type === "information") continue;
      p.submit(p.correctAnswer());
    }
    q.updateScore();
    const statoClient = q.toState();
    const punteggioClient = q.score();

    // "Server": ricalcola dallo stesso seme e dallo stesso stato.
    const esito = ricalcola(question, seed, statoClient, "it");

    expect(esito.score).toBeCloseTo(punteggioClient.score, 9);
    expect(esito.maxScore).toBeCloseTo(punteggioClient.marks, 9);
  });

  it("una risposta sbagliata non prende punti", () => {
    const { question } = JSON.parse(
      readFileSync(path.join(dir, "01-equazione-primo-grado.json"), "utf8"),
    ) as { question: NumbasQuestionJSON };
    const q = loadQuestion(question, { seed: "sbagliata", locale: "it" });
    q.getPart("p0")!.submit("999999");
    q.updateScore();
    const esito = ricalcola(question, "sbagliata", q.toState(), "it");
    expect(esito.score).toBe(0);
    expect(esito.maxScore).toBeGreaterThan(0);
  });

  it("uno stato assente da' punteggio zero e stato iniziale", () => {
    const { question } = JSON.parse(
      readFileSync(path.join(dir, "01-equazione-primo-grado.json"), "utf8"),
    ) as { question: NumbasQuestionJSON };
    const esito = ricalcola(question, "vuoto", null, "it");
    expect(esito.score).toBe(0);
    expect(esito.state.parts.length).toBeGreaterThan(0);
  });

  it("uno stato con un seme diverso viene ignorato a favore di quello del tentativo", () => {
    const { question } = JSON.parse(
      readFileSync(path.join(dir, "01-equazione-primo-grado.json"), "utf8"),
    ) as { question: NumbasQuestionJSON };
    const q = loadQuestion(question, { seed: "altro-seme", locale: "it" });
    q.getPart("p0")!.submit(q.getPart("p0")!.correctAnswer());
    q.updateScore();
    const statoAltrui = q.toState();
    const esito = ricalcola(question, "il-mio-seme", statoAltrui, "it");
    expect(esito.state.seed).toBe("il-mio-seme");
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/esercizi/__tests__/marking.test.ts`
Expected: FAIL, `../marking` non esiste.

- [ ] **Step 3: Implementa il ricalcolo**

`src/lib/esercizi/marking.ts`:

```ts
import {
  loadQuestion, restoreQuestion,
  type NumbasQuestionJSON, type QuestionState, type MarkingResult, type Locale,
} from "@savint/engine";

export interface EsitoRicalcolo {
  score: number;
  maxScore: number;
  state: QuestionState;
  feedback: { path: string; items: MarkingResult["feedback"] }[];
}

/** Ricostruisce la domanda dal seme del tentativo e riapplica lo stato che il
 * client dichiara, poi legge il punteggio dal motore. Il seme del tentativo
 * vince sempre su quello dentro lo stato: è il server a decidere quale
 * domanda lo studente sta risolvendo. */
export function ricalcola(
  content: unknown,
  seed: string,
  state: QuestionState | null,
  locale: Locale,
): EsitoRicalcolo {
  const json = content as NumbasQuestionJSON;
  const q = state
    ? restoreQuestion(json, { ...state, seed }, { locale })
    : loadQuestion(json, { seed, locale });

  q.updateScore();
  const punteggio = q.score();

  return {
    score: punteggio.score,
    maxScore: punteggio.marks,
    state: q.toState(),
    feedback: q.allParts().map((p) => ({ path: p.path, items: p.result?.feedback ?? [] })),
  };
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run src/lib/esercizi/__tests__/marking.test.ts`
Expected: PASS, 11 test (8 esercizi più 3 casi).

- [ ] **Step 5: Scrivi il test del ciclo di vita**

`src/lib/esercizi/__tests__/tentativo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { avviaORiprendi, applicaRisposta, completa } from "../tentativo";
import { seedEsercizi } from "../seed";
import path from "path";

let studentId: string;
let altroId: string;

beforeEach(async () => {
  await prisma.tentativo.deleteMany();
  await prisma.esercizioVersione.deleteMany();
  await prisma.esercizio.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: ["s1@test.it", "s2@test.it"] } } });
  studentId = (await prisma.user.create({ data: { email: "s1@test.it", name: "S1", role: "STUDENT" } })).id;
  altroId = (await prisma.user.create({ data: { email: "s2@test.it", name: "S2", role: "STUDENT" } })).id;
  await seedEsercizi(path.resolve(process.cwd(), "content/esercizi"));
});

describe("ciclo di vita del tentativo", () => {
  it("il primo accesso crea un tentativo con un seme", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(t).not.toBeNull();
    expect(t!.seed).toMatch(/.+/);
    expect(t!.state).toBeNull();
    expect(t!.status).toBe("IN_PROGRESS");
  });

  it("il secondo accesso riprende lo stesso tentativo, stesso seme", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const b = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(b!.tentativoId).toBe(a!.tentativoId);
    expect(b!.seed).toBe(a!.seed);
  });

  it("due studenti hanno tentativi e semi diversi", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const b = await avviaORiprendi(altroId, "01-equazione-primo-grado");
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.seed).not.toBe(a!.seed);
  });

  it("un esercizio inesistente da' null", async () => {
    expect(await avviaORiprendi(studentId, "non-esiste")).toBeNull();
  });

  it("una risposta corretta fa salire il punteggio scritto sul database", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const { loadQuestion } = await import("@savint/engine");
    const q = loadQuestion(t!.content as never, { seed: t!.seed, locale: "it" });
    const p = q.getPart("p0")!;
    const giusta = p.correctAnswer();
    p.submit(giusta);
    q.updateScore();

    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", giusta, q.toState(), "it");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score).toBeGreaterThan(0);

    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.score).toBeGreaterThan(0);
  });

  it("uno stato che dichiara un punteggio gonfiato non viene creduto", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const statoBugiardo = {
      seed: t!.seed, answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 9999, marks: 9999,
      parts: [{ path: "p0", answered: true, score: 9999, marks: 9999, answer: "0" }],
    };
    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", "0", statoBugiardo as never, "it");
    expect(r.ok).toBe(true);
    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.score).toBe(0);
    expect(riga!.maxScore).toBeLessThan(9999);
  });

  it("il tentativo di un altro studente viene rifiutato", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const r = await applicaRisposta(t!.tentativoId, altroId, "p0", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "non_tuo" });
  });

  it("una parte che non esiste viene rifiutata", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const r = await applicaRisposta(t!.tentativoId, studentId, "p99", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "parte_sconosciuta" });
  });

  it("completare chiude il tentativo e fissa il punteggio", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const r = await completa(t!.tentativoId, studentId, "it");
    expect(r.ok).toBe(true);
    const riga = await prisma.tentativo.findUnique({ where: { id: t!.tentativoId } });
    expect(riga!.status).toBe("COMPLETED");
    expect(riga!.completedAt).not.toBeNull();
  });

  it("dopo il completamento non si accettano risposte", async () => {
    const t = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    await completa(t!.tentativoId, studentId, "it");
    const r = await applicaRisposta(t!.tentativoId, studentId, "p0", "1", null as never, "it");
    expect(r).toEqual({ ok: false, motivo: "gia_completato" });
  });

  it("dopo il completamento un nuovo accesso apre un tentativo nuovo", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    await completa(a!.tentativoId, studentId, "it");
    const b = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
    expect(b!.status).toBe("IN_PROGRESS");
  });

  it("un tentativo piu' vecchio della conservazione non si riprende", async () => {
    const a = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    const giorni = Number(process.env.TENTATIVI_RETENTION_DAYS ?? 180);
    await prisma.tentativo.update({
      where: { id: a!.tentativoId },
      data: { lastActivityAt: new Date(Date.now() - (giorni + 1) * 86_400_000) },
    });
    const b = await avviaORiprendi(studentId, "01-equazione-primo-grado");
    expect(b!.tentativoId).not.toBe(a!.tentativoId);
  });
});
```

- [ ] **Step 6: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/esercizi/__tests__/tentativo.test.ts`
Expected: FAIL, `../tentativo` non esiste.

- [ ] **Step 7: Implementa il ciclo di vita**

`src/lib/esercizi/tentativo.ts`:

```ts
import { randomUUID } from "crypto";
import type { Answer, QuestionState, MarkingResult, Locale } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { ricalcola } from "./marking";

export interface TentativoAperto {
  tentativoId: string;
  seed: string;
  content: unknown;
  state: QuestionState | null;
  score: number;
  maxScore: number;
  status: "IN_PROGRESS" | "COMPLETED";
}

/** Restituisce il tentativo in corso dello studente su quell'esercizio, o ne
 * apre uno nuovo sull'ultima versione. `null` se l'esercizio non esiste. */
export async function avviaORiprendi(studentId: string, esercizioId: string): Promise<TentativoAperto | null> {
  const versione = await prisma.esercizioVersione.findFirst({
    where: { esercizioId },
    orderBy: { version: "desc" },
  });
  if (!versione) return null;

  // Conservazione pigra, come per PracticeRun: un tentativo fermo da più della
  // finestra non si riprende, se ne apre uno nuovo. Nessun lavoro pianificato
  // in questo sotto-progetto.
  const giorni = Number(process.env.TENTATIVI_RETENTION_DAYS ?? 180);
  const sogliaAttivita = new Date(Date.now() - giorni * 86_400_000);

  const inCorso = await prisma.tentativo.findFirst({
    where: {
      studentId, esercizioVersioneId: versione.id, status: "IN_PROGRESS",
      lastActivityAt: { gte: sogliaAttivita },
    },
    orderBy: { startedAt: "desc" },
  });

  const t = inCorso ?? (await prisma.tentativo.create({
    data: { studentId, esercizioVersioneId: versione.id, seed: randomUUID() },
  }));

  return {
    tentativoId: t.id,
    seed: t.seed,
    content: versione.content,
    state: (t.state as QuestionState | null) ?? null,
    score: t.score,
    maxScore: t.maxScore,
    status: t.status,
  };
}

type EsitoRisposta =
  | { ok: true; score: number; maxScore: number; feedback: MarkingResult["feedback"] }
  | { ok: false; motivo: "non_trovato" | "non_tuo" | "gia_completato" | "parte_sconosciuta" };

/** Applica una risposta e riscrive il punteggio con quello che calcola il
 * server. Lo stato del client serve solo a ricostruire le risposte: i numeri
 * che dichiara non vengono mai copiati sul database. */
export async function applicaRisposta(
  tentativoId: string,
  studentId: string,
  partPath: string,
  answer: Answer,
  statoClient: QuestionState | null,
  locale: Locale,
): Promise<EsitoRisposta> {
  const t = await prisma.tentativo.findUnique({
    where: { id: tentativoId },
    include: { versione: true },
  });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };
  if (t.status === "COMPLETED") return { ok: false, motivo: "gia_completato" };

  const esito = ricalcola(t.versione.content, t.seed, statoClient, locale);
  const parte = esito.feedback.find((f) => f.path === partPath);
  if (!parte) return { ok: false, motivo: "parte_sconosciuta" };

  await prisma.tentativo.update({
    where: { id: t.id },
    data: { state: esito.state as object, score: esito.score, maxScore: esito.maxScore },
  });

  return { ok: true, score: esito.score, maxScore: esito.maxScore, feedback: parte.items };
}

/** Chiude il tentativo fissando il punteggio ricalcolato. */
export async function completa(
  tentativoId: string,
  studentId: string,
  locale: Locale,
): Promise<{ ok: true; score: number; maxScore: number } | { ok: false; motivo: "non_trovato" | "non_tuo" }> {
  const t = await prisma.tentativo.findUnique({ where: { id: tentativoId }, include: { versione: true } });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };

  const esito = ricalcola(t.versione.content, t.seed, (t.state as QuestionState | null) ?? null, locale);
  await prisma.tentativo.update({
    where: { id: t.id },
    data: {
      state: esito.state as object, score: esito.score, maxScore: esito.maxScore,
      status: "COMPLETED", completedAt: new Date(),
    },
  });
  return { ok: true, score: esito.score, maxScore: esito.maxScore };
}
```

- [ ] **Step 8: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/esercizi`
Expected: PASS.

- [ ] **Step 9: Misura il costo del ricalcolo**

La spec lo chiede esplicitamente: va misurato, non stimato.

Run:
```bash
npx tsx -e "
const { readFileSync } = require('fs');
const { ricalcola } = require('./src/lib/esercizi/marking.ts');
const { question } = JSON.parse(readFileSync('content/esercizi/06-derivate-elementari.json','utf8'));
const t0 = Date.now();
for (let i = 0; i < 50; i++) ricalcola(question, 'x' + i, null, 'it');
console.log('media per ricalcolo:', (Date.now() - t0) / 50, 'ms');
"
```

Scrivi il numero nel messaggio di commit. Se supera i 150 ms per esercizio, fermati e segnalalo: la ricaduta prevista dalla spec è ricalcolare solo alla chiusura.

- [ ] **Step 10: Commit**

```bash
git add src/lib/esercizi
git commit -m "feat(esercizi): ricalcolo lato server e ciclo di vita del tentativo"
```

---

### Task 6: Rotte API

**Files:**
- Create: `src/app/api/esercizi/tentativi/[id]/risposta/route.ts`
- Create: `src/app/api/esercizi/tentativi/[id]/completa/route.ts`
- Test: `src/app/api/esercizi/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `applicaRisposta`, `completa` dal Task 5; `requireStudent` da `@/lib/auth/require-role`; `checkRateLimit` da `@/lib/rate-limit/db-rate-limit`.
- Produces: due rotte `POST`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireStudent: vi.fn(),
}));
vi.mock("@/lib/esercizi/tentativo", () => ({
  applicaRisposta: vi.fn(),
  completa: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireStudent } from "@/lib/auth/require-role";
import { applicaRisposta } from "@/lib/esercizi/tentativo";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/tentativi/[id]/risposta/route";

const params = Promise.resolve({ id: "t1" });
const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/tentativi/t1/risposta", { method: "POST", body: JSON.stringify(body) });

const corpoValido = { partPath: "p0", answer: "2", state: { seed: "s", answered: false, submitted: 0,
  adviceDisplayed: false, revealed: false, score: 0, marks: 2, parts: [] } };

beforeEach(() => {
  vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST risposta", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(401);
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST(richiesta({ partPath: 42 }), { params });
    expect(r.status).toBe(400);
  });

  it("404 se il tentativo non esiste", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(404);
  });

  it("403 se il tentativo e' di un altro", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "non_tuo" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(403);
  });

  it("409 se gia' completato", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "gia_completato" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(409);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(429);
  });

  it("200 con il punteggio del server", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: true, score: 2, maxScore: 2, feedback: [] });
    const r = await POST(richiesta(corpoValido), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ score: 2, maxScore: 2, feedback: [] });
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/app/api/esercizi`
Expected: FAIL, la rotta non esiste.

- [ ] **Step 3: Implementa la rotta della risposta**

`src/app/api/esercizi/tentativi/[id]/risposta/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { applicaRisposta } from "@/lib/esercizi/tentativo";

const answerSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(answerSchema)]),
);

const bodySchema = z.object({
  partPath: z.string().min(1).max(32).regex(/^p\d+(g\d+)?$/),
  answer: answerSchema,
  state: z.object({
    seed: z.string(),
    answered: z.boolean(),
    submitted: z.number(),
    adviceDisplayed: z.boolean(),
    revealed: z.boolean(),
    score: z.number(),
    marks: z.number(),
    parts: z.array(z.unknown()),
  }),
});

const STATI: Record<string, number> = {
  non_trovato: 404, non_tuo: 403, gia_completato: 409, parte_sconosciuta: 400,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:risposta:${studentId}`, windowSeconds: 60, max: 120 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";
  const esito = await applicaRisposta(
    id, studentId, parsed.data.partPath, parsed.data.answer as never, parsed.data.state as never, locale,
  );

  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ score: esito.score, maxScore: esito.maxScore, feedback: esito.feedback });
}
```

- [ ] **Step 4: Implementa la rotta del completamento**

`src/app/api/esercizi/tentativi/[id]/completa/route.ts`, stessa struttura, senza corpo:

```ts
import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { completa } from "@/lib/esercizi/tentativo";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";
  const esito = await completa(id, gate.session.user.id, locale);

  if (!esito.ok) {
    return NextResponse.json({ error: esito.motivo }, { status: esito.motivo === "non_trovato" ? 404 : 403 });
  }
  return NextResponse.json({ score: esito.score, maxScore: esito.maxScore });
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/app/api/esercizi`
Expected: PASS, 7 test.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/esercizi
git commit -m "feat(esercizi): rotte per applicare una risposta e completare un tentativo"
```

---

### Task 7: Componenti di input per i tipi di parte

**Files:**
- Create: `src/components/esercizi/player/parti/index.tsx` (dispatcher)
- Create: `src/components/esercizi/player/parti/{numero,scelta-singola,scelta-multipla,griglia,testo,espressione,gapfill,informazione}.tsx`
- Test: `src/components/esercizi/player/parti/__tests__/parti.test.tsx`

**Interfaces:**
- Consumes: `ContenutoHtml` dal Task 4; `type PartBase` non è esportato dal motore, quindi le parti si passano come dati semplici.
- Produces:
  ```ts
  export interface PartePubblica {
    path: string; type: PartType; promptHtml: string; marks: number;
    scelte?: string[];        // 1_n_2, m_n_2: gli HTML delle scelte
    righe?: string[];         // m_n_x: le scelte (righe)
    colonne?: string[];       // m_n_x: le risposte (colonne)
    gaps?: PartePubblica[];   // gapfill
  }
  export interface InputParteProps {
    parte: PartePubblica;
    valore: Answer;
    onChange: (v: Answer) => void;
    disabilitato: boolean;
  }
  export function InputParte(props: InputParteProps): JSX.Element;
  ```

**Nota su `m_n_x`:** il motore accetta due forme e su una griglia quadrata non può distinguerle. Il player manda **sempre** la matrice interna `ticks`, indicizzata `[risposta][scelta]`, così l'ambiguità non si presenta mai.

- [ ] **Step 1: Scrivi i test che falliscono**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputParte, type PartePubblica } from "../index";

const base = { path: "p0", promptHtml: "<p>Domanda</p>", marks: 1 };

describe("InputParte", () => {
  it("numberentry: scrive il valore digitato", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "numberentry" } as PartePubblica;
    render(<InputParte parte={parte} valore="" onChange={onChange} disabilitato={false} />);
    await userEvent.type(screen.getByRole("textbox"), "42");
    expect(onChange).toHaveBeenLastCalledWith("42");
  });

  it("1_n_2: una scelta sola, manda l'indice", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "1_n_2", scelte: ["<p>tre</p>", "<p>quattro</p>"] } as PartePubblica;
    render(<InputParte parte={parte} valore={null} onChange={onChange} disabilitato={false} />);
    await userEvent.click(screen.getAllByRole("radio")[1]!);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("m_n_2: piu' scelte, manda un vettore di booleani", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "m_n_2", scelte: ["<p>a</p>", "<p>b</p>"] } as PartePubblica;
    render(<InputParte parte={parte} valore={[false, false]} onChange={onChange} disabilitato={false} />);
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onChange).toHaveBeenLastCalledWith([true, false]);
  });

  it("m_n_x: manda sempre la matrice ticks [risposta][scelta]", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "m_n_x", righe: ["<p>r1</p>", "<p>r2</p>"], colonne: ["<p>c1</p>", "<p>c2</p>"] } as PartePubblica;
    render(<InputParte parte={parte} valore={[[false, false], [false, false]]} onChange={onChange} disabilitato={false} />);
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onChange).toHaveBeenLastCalledWith([[true, false], [false, false]]);
  });

  it("gapfill: un input per gap, manda un vettore", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "gapfill", gaps: [
      { path: "p0g0", type: "numberentry", promptHtml: "", marks: 1 },
      { path: "p0g1", type: "numberentry", promptHtml: "", marks: 1 },
    ] } as PartePubblica;
    render(<InputParte parte={parte} valore={["", ""]} onChange={onChange} disabilitato={false} />);
    await userEvent.type(screen.getAllByRole("textbox")[1]!, "7");
    expect(onChange).toHaveBeenLastCalledWith(["", "7"]);
  });

  it("information: nessun campo da compilare", () => {
    const parte = { ...base, type: "information" } as PartePubblica;
    render(<InputParte parte={parte} valore={null} onChange={vi.fn()} disabilitato={false} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("disabilitato: i campi non si possono toccare", () => {
    const parte = { ...base, type: "numberentry" } as PartePubblica;
    render(<InputParte parte={parte} valore="1" onChange={vi.fn()} disabilitato />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/components/esercizi/player/parti`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 3: Implementa il dispatcher e i componenti**

`parti/index.tsx`:

```tsx
"use client";

import type { Answer, PartType } from "@savint/engine";
import { ContenutoHtml } from "../contenuto-html";
import { InputNumero } from "./numero";
import { InputSceltaSingola } from "./scelta-singola";
import { InputSceltaMultipla } from "./scelta-multipla";
import { InputGriglia } from "./griglia";
import { InputTesto } from "./testo";
import { InputEspressione } from "./espressione";
import { InputGapfill } from "./gapfill";

export interface PartePubblica {
  path: string;
  type: PartType;
  promptHtml: string;
  marks: number;
  scelte?: string[];
  righe?: string[];
  colonne?: string[];
  gaps?: PartePubblica[];
}

export interface InputParteProps {
  parte: PartePubblica;
  valore: Answer;
  onChange: (v: Answer) => void;
  disabilitato: boolean;
}

export function InputParte(props: InputParteProps) {
  const { parte } = props;
  return (
    <div className="space-y-2" data-parte={parte.path}>
      <ContenutoHtml html={parte.promptHtml} />
      {campo(props)}
    </div>
  );
}

function campo(props: InputParteProps) {
  switch (props.parte.type) {
    case "numberentry": return <InputNumero {...props} />;
    case "patternmatch": return <InputTesto {...props} />;
    case "jme": return <InputEspressione {...props} />;
    case "1_n_2": return <InputSceltaSingola {...props} />;
    case "m_n_2": return <InputSceltaMultipla {...props} />;
    case "m_n_x": return <InputGriglia {...props} />;
    case "gapfill": return <InputGapfill {...props} />;
    case "information": return null;
    default: return null;
  }
}
```

`parti/numero.tsx`, come modello per `testo.tsx` ed `espressione.tsx`, che
differiscono solo per etichetta, `inputMode` e segnaposto:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { InputParteProps } from "./index";

export function InputNumero({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">{t("laTuaRisposta")}</label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={typeof valore === "string" ? valore : ""}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
```

`parti/griglia.tsx`, il caso delicato: manda **sempre** la matrice interna,
mai la forma trasposta.

```tsx
"use client";

import { ContenutoHtml } from "../contenuto-html";
import type { InputParteProps } from "./index";

export function InputGriglia({ parte, valore, onChange, disabilitato }: InputParteProps) {
  const righe = parte.righe ?? [];
  const colonne = parte.colonne ?? [];
  // `ticks` del motore: indicizzata [risposta][scelta].
  const ticks: boolean[][] = Array.isArray(valore)
    ? (valore as boolean[][])
    : colonne.map(() => righe.map(() => false));

  function commuta(risposta: number, scelta: number) {
    const copia = ticks.map((r) => [...r]);
    copia[risposta]![scelta] = !copia[risposta]![scelta];
    onChange(copia);
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th />
          {colonne.map((c, j) => <th key={j} scope="col"><ContenutoHtml html={c} /></th>)}
        </tr>
      </thead>
      <tbody>
        {righe.map((r, i) => (
          <tr key={i}>
            <th scope="row" className="text-left font-normal"><ContenutoHtml html={r} /></th>
            {colonne.map((_, j) => (
              <td key={j} className="text-center">
                <input
                  type="checkbox"
                  aria-label={`${i + 1}-${j + 1}`}
                  checked={ticks[j]?.[i] ?? false}
                  disabled={disabilitato}
                  onChange={() => commuta(j, i)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`parti/scelta-singola.tsx` rende un gruppo di `radio` e chiama
`onChange(indice)`; `parti/scelta-multipla.tsx` rende `checkbox` e chiama
`onChange` con una copia del vettore di booleani; `parti/gapfill.tsx` mappa
`parte.gaps` su `InputParte` annidati e ricompone il vettore delle risposte.
Regole comuni a tutti:

- il prompt lo rende già `InputParte`, i singoli campi non lo ripetono;
- ogni campo ha un'etichetta collegata, così i test possono usare i ruoli e chi usa uno screen reader capisce;
- `disabilitato` disabilita ogni campo;
- nessun componente corregge niente: producono il valore e chiamano `onChange`.

Le forme del valore per tipo, che devono corrispondere a `Answer` del motore:

| Tipo | Forma di `valore` |
|---|---|
| `numberentry`, `patternmatch`, `jme` | `string` |
| `1_n_2` | `number` (indice della scelta) |
| `m_n_2` | `boolean[]` |
| `m_n_x` | `boolean[][]` indicizzato `[risposta][scelta]` |
| `gapfill` | `Answer[]`, uno per gap |
| `information` | `null` |

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/components/esercizi/player/parti`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/components/esercizi/player/parti
git commit -m "feat(esercizi/player): componenti di input per gli otto tipi di parte"
```

---

### Task 8: Il player

**Files:**
- Create: `src/components/esercizi/player/player-esercizio.tsx`
- Create: `src/components/esercizi/player/usa-tentativo.ts`
- Test: `src/components/esercizi/player/__tests__/player-esercizio.test.tsx`

**Interfaces:**
- Consumes: `InputParte` (Task 7), `ContenutoHtml` (Task 4), `loadQuestion`/`restoreQuestion` da `@savint/engine`, le rotte del Task 6.
- Produces:
  ```ts
  export interface PlayerEsercizioProps {
    tentativoId: string;
    seed: string;
    content: unknown;
    statoIniziale: QuestionState | null;
    locale: "it" | "en";
  }
  export function PlayerEsercizio(props: PlayerEsercizioProps): JSX.Element;
  ```

Macchina a fasi, stato React semplice, come `player-view.tsx`:
`type Fase = "caricamento" | "esercizio" | "riepilogo" | "errore"`.

- [ ] **Step 1: Scrivi il test che fallisce**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "fs";
import path from "path";
import it from "@/messages/it.json";
import { PlayerEsercizio } from "../player-esercizio";

const { question } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/01-equazione-primo-grado.json"), "utf8"),
) as { question: unknown };

function montaggio(props: Partial<React.ComponentProps<typeof PlayerEsercizio>> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={it}>
      <PlayerEsercizio tentativoId="t1" seed="seme-di-prova" content={question}
        statoIniziale={null} locale="it" {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(
    JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Giusto." }] }),
    { status: 200 },
  )) as never;
});

describe("PlayerEsercizio", () => {
  it("mostra il testo della domanda con le variabili sostituite", async () => {
    const { container } = montaggio();
    await waitFor(() => expect(screen.getByText(/Risolvi/)).toBeInTheDocument());
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("invia la risposta e mostra il feedback che arriva dal server", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: it.esercizi.invia }));
    await waitFor(() => expect(screen.getByText("Giusto.")).toBeInTheDocument());
  });

  it("il punteggio mostrato e' quello del server, non quello locale", async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ score: 0, maxScore: 2, feedback: [{ type: "incorrect", message: "No." }] }),
      { status: 200 },
    )) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: it.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(/0\s*\/\s*2/)).toBeInTheDocument());
  });

  it("riprende da uno stato salvato con le risposte al loro posto", async () => {
    const stato = {
      seed: "seme-di-prova", answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 2, marks: 2,
      parts: [{ path: "p0", answered: true, score: 2, marks: 2, answer: "3" }],
    };
    montaggio({ statoIniziale: stato as never });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("3"));
  });

  it("mostra la fase di errore se il contenuto non si carica", async () => {
    montaggio({ content: { partsMode: "explore", parts: [] } });
    await waitFor(() => expect(screen.getByText(it.esercizi.erroreCaricamento)).toBeInTheDocument());
  });

  it("un errore di rete non perde la risposta digitata", async () => {
    global.fetch = vi.fn(async () => { throw new Error("rete giù"); }) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: it.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(it.esercizi.erroreRete)).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("3");
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/components/esercizi/player/__tests__/player-esercizio.test.tsx`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 3: Aggiungi le chiavi i18n**

In `src/messages/it.json` e `src/messages/en.json`, nuovo spazio dei nomi `esercizi` con almeno: `invia`, `avanti`, `riprova`, `completa`, `punteggio`, `riepilogo`, `caricamento`, `erroreCaricamento`, `erroreRete`, `rispostaCorretta`, `rispostaSbagliata`, `tentativoCompletato`, `mostraSoluzione`.

- [ ] **Step 4: Implementa il player**

Struttura, con lo stato del motore tenuto in un `useRef` perché è un oggetto vivo che non deve far ridisegnare:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { loadQuestion, restoreQuestion, type Answer, type QuestionState, type Question } from "@savint/engine";
import { ContenutoHtml } from "./contenuto-html";
import { InputParte, type PartePubblica } from "./parti";

type Fase = "caricamento" | "esercizio" | "riepilogo" | "errore";
```

Comportamento richiesto dai test:

1. Al montaggio carica la domanda (`restoreQuestion` se c'è uno stato, `loadQuestion` altrimenti) dentro un `try/catch`: in caso di errore, fase `errore`.
2. Costruisce le `PartePubblica` dalle parti della domanda e i valori iniziali dallo stato ripreso.
3. All'invio: chiama `parte.submit(valore)` sul motore locale per il feedback immediato, poi `POST` alla rotta della risposta con `partPath`, `answer` e `q.toState()`.
4. Quando arriva la risposta del server, **sostituisce** punteggio e feedback locali con quelli del server. Se divergono, `console.warn` con i due valori: è il segnale che browser e Node non concordano e non deve passare inosservato.
5. Se la `fetch` fallisce, mostra `erroreRete` e **non** azzera ciò che lo studente ha scritto.
6. Quando tutte le parti hanno risposta, mostra il pulsante di completamento, che chiama la rotta `completa` e porta alla fase `riepilogo`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/components/esercizi/player`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/esercizi/player src/messages
git commit -m "feat(esercizi/player): player con fasi, invio e punteggio autorevole dal server"
```

---

### Task 9: Pagine studente e docente

**Files:**
- Create: `src/app/(student)/studente/esercizio/[esercizioId]/page.tsx`
- Create: `src/app/(dashboard)/dashboard/esercizi/page.tsx`
- Modify: `src/app/(student)/studente/page.tsx` (elenco degli esercizi disponibili)
- Test: `src/app/(student)/studente/esercizio/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `avviaORiprendi` (Task 5), `PlayerEsercizio` (Task 8), `redirectUnlessTeacher` da `@/lib/auth/require-role`.

- [ ] **Step 1: Scrivi il test che fallisce**

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "STUDENT" } })) }));
vi.mock("@/lib/esercizi/tentativo", () => ({ avviaORiprendi: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));

import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { notFound } from "next/navigation";
import Page from "../[esercizioId]/page";

describe("pagina dell'esercizio", () => {
  it("404 se l'esercizio non esiste", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ esercizioId: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("passa al player tentativo, seme, contenuto e stato", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS",
    });
    const albero = await Page({ params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }) });
    const props = (albero as { props: Record<string, unknown> }).props;
    expect(props.tentativoId).toBe("t1");
    expect(props.seed).toBe("s1");
    expect(props.statoIniziale).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/app/\(student\)`
Expected: FAIL, la pagina non esiste.

- [ ] **Step 3: Implementa le pagine**

`src/app/(student)/studente/esercizio/[esercizioId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { PlayerEsercizio } from "@/components/esercizi/player/player-esercizio";

export default async function Page({ params }: { params: Promise<{ esercizioId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { esercizioId } = await params;
  const tentativo = await avviaORiprendi(session.user.id, esercizioId);
  if (!tentativo) notFound();

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <PlayerEsercizio
      tentativoId={tentativo.tentativoId}
      seed={tentativo.seed}
      content={tentativo.content}
      statoIniziale={tentativo.state}
      locale={locale}
    />
  );
}
```

`src/app/(dashboard)/dashboard/esercizi/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { Card } from "@/components/ui/card";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi");

  const esercizi = await prisma.esercizio.findMany({
    orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("titoloDocente")}</h1>
      <ul className="grid gap-3">
        {esercizi.map((e) => (
          <Card key={e.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{e.title}</p>
              <p className="text-sm text-muted-foreground">
                {t("annoArgomento", { anno: e.yearLevel, argomento: e.topic })}
                {" · "}
                {t("difficolta", { livello: e.difficulty })}
                {" · "}
                {t("versione", { numero: e.versions[0]?.version ?? 0 })}
              </p>
            </div>
            <code className="rounded bg-muted px-2 py-1 text-sm">/studente/esercizio/{e.id}</code>
          </Card>
        ))}
      </ul>
    </div>
  );
}
```

La home dello studente (`src/app/(student)/studente/page.tsx`) sostituisce la
scheda "in arrivo" con lo stesso elenco, dove ogni riga è un collegamento a
`/studente/esercizio/<id>` e mostra, se esiste, il tentativo in corso con il
suo punteggio.

Chiavi i18n aggiunte in questo task, in entrambe le lingue: `titoloDocente`,
`titoloStudente`, `annoArgomento`, `difficolta`, `versione`, `nessunEsercizio`,
`tentativoInCorso`, `laTuaRisposta`.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(student)" "src/app/(dashboard)/dashboard/esercizi"
git commit -m "feat(esercizi): pagina dell'esercizio per lo studente ed elenco per il docente"
```

---

### Task 10: Prova end-to-end e peso del bundle

**Files:**
- Create: `tests/e2e/esercizi-player.spec.ts`
- Modify: `prisma/seed.ts` (uno studente di prova, se non c'è già)

- [ ] **Step 1: Scrivi la prova end-to-end**

```ts
import { test, expect } from "@playwright/test";

test("lo studente risolve, ricarica a meta' e riprende", async ({ page }) => {
  await page.goto("/login");
  // Accedi come studente di prova seminato (vedi prisma/seed.ts).
  await page.fill('input[name="email"]', "studente@test.it");
  await page.fill('input[name="password"]', "password");
  await page.click('button[type="submit"]');

  await page.goto("/studente/esercizio/03-sistemi-lineari");
  await expect(page.locator(".katex").first()).toBeVisible();

  const primi = page.getByRole("textbox");
  await primi.first().fill("2");
  await page.getByRole("button", { name: /invia/i }).click();
  await expect(page.getByText(/\d+\s*\/\s*\d+/)).toBeVisible();

  // Ricarica a metà: la risposta già data deve tornare al suo posto.
  await page.reload();
  await expect(page.getByRole("textbox").first()).toHaveValue("2");
});
```

- [ ] **Step 2: Esegui la prova**

Run: `npx playwright test tests/e2e/esercizi-player.spec.ts`
Expected: PASS.

- [ ] **Step 3: Misura il peso della pagina**

Run:
```bash
npm run build
```
Guarda la riga della rotta `/studente/esercizio/[esercizioId]` nel prospetto finale. Scrivi il "First Load JS" nel messaggio di commit. Se supera i 500 kB, carica il player con `next/dynamic` e `ssr: false`, poi rimisura.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/esercizi-player.spec.ts prisma/seed.ts
git commit -m "test(esercizi): prova end-to-end di risoluzione, ricarica e ripresa"
```

---

## Note per il controllore

- **Il Task 3 installa una dipendenza.** Se il server di sviluppo è acceso, `npm install` cancella e ricostruisce `node_modules` e il dev server muore con "Next.js package not found". Va fermato prima.
- **I test del Task 2 e del Task 5 toccano il database.** Girano sulla stessa istanza degli altri test del repository e ripuliscono ciò che creano in `beforeEach`. Se falliscono a raffica con violazioni di unicità, controlla che un run precedente non sia stato ucciso a metà.
- **Due misure vanno prese, non stimate:** il costo del ricalcolo (Task 5, Step 9) e il peso della pagina (Task 10, Step 3). Entrambe hanno una ricaduta già scelta nella spec se il numero è brutto. Vanno riportate nel messaggio di commit.
- **Il motore non si tocca.** Se un task sembra richiedere una modifica a `packages/engine`, fermati e segnalalo: la spec dice che gli aggiri stanno nel player, e una modifica al motore sarebbe una divergenza deliberata da upstream, con il suo giro di revisione.
- I test intermittenti noti del repository sono quelli di rate limit (`db-rate-limit`, `hub/practice/start`): se falliscono da soli, rilanciali prima di indagare.
