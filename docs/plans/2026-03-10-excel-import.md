# Excel Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow teachers to download an Excel template, fill it with questions, and import them to create a new quiz or add to an existing one.

**Architecture:** Server-side ExcelJS generates the template .xlsx and parses uploaded files. Two new API routes handle template download and import. A new client component provides UI buttons alongside the existing .qlz import. A shared parser module transforms Excel rows into `QuestionInput[]` validated by existing Zod schemas.

**Tech Stack:** ExcelJS (new dependency), existing Zod validators, Prisma, Next.js API routes

---

### Task 1: Install ExcelJS

**Step 1: Install dependency**

Run: `npm install exceljs`

**Step 2: Verify installation**

Run: `npm ls exceljs`
Expected: `exceljs@x.x.x`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add exceljs dependency for Excel import feature"
```

---

### Task 2: Excel template generator

**Files:**
- Create: `src/lib/excel/template.ts`

**Step 1: Create the template generator**

This module exports a function `generateQuizTemplate()` that returns an ExcelJS `Workbook` with 5 sheets, each with headers + one example row.

```typescript
import ExcelJS from "exceljs";

const COMMON_HEADERS = ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)"];

const SHEETS = {
  "Scelta Multipla": {
    headers: [...COMMON_HEADERS, "Opzione1", "Opzione2", "Opzione3", "Opzione4", "Opzione5", "Opzione6", "Corretta"],
    example: ["Qual è la capitale d'Italia?", 30, 1000, "N", "Roma", "Milano", "Napoli", "Torino", "", "", "1"],
  },
  "Vero o Falso": {
    headers: [...COMMON_HEADERS, "Risposta (V/F)"],
    example: ["La Terra è piatta", 20, 1000, "N", "F"],
  },
  "Risposta Aperta": {
    headers: [...COMMON_HEADERS, "Risposta1", "Risposta2", "Risposta3"],
    example: ["Qual è la capitale della Francia?", 30, 1000, "N", "Parigi", "parigi", ""],
  },
  "Ordinamento": {
    headers: [...COMMON_HEADERS, "Elemento1", "Elemento2", "Elemento3", "Elemento4", "Elemento5", "Elemento6"],
    example: ["Ordina i pianeti dal più vicino al Sole", 45, 1000, "N", "Mercurio", "Venere", "Terra", "Marte", "", ""],
  },
  "Stima Numerica": {
    headers: [...COMMON_HEADERS, "Valore Corretto", "Tolleranza", "Range Massimo", "Unità"],
    example: ["Quanti abitanti ha l'Italia (in milioni)?", 30, 1000, "N", 59, 2, 10, "milioni"],
  },
} as const;

export async function generateQuizTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const [sheetName, config] of Object.entries(SHEETS)) {
    const sheet = workbook.addWorksheet(sheetName);

    // Header row - bold, colored background
    const headerRow = sheet.addRow(config.headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      cell.alignment = { horizontal: "center" };
    });

    // Example row
    sheet.addRow(config.example);

    // Auto-width columns
    sheet.columns.forEach((col, i) => {
      col.width = Math.max(config.headers[i]?.length ?? 10, 15);
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export { SHEETS };
```

**Step 2: Commit**

```bash
git add src/lib/excel/template.ts
git commit -m "feat: add Excel template generator with 5 question type sheets"
```

---

### Task 3: Excel parser module

**Files:**
- Create: `src/lib/excel/parser.ts`

**Step 1: Create the parser**

This module parses an uploaded .xlsx buffer and returns `QuestionInput[]` plus any validation errors.

```typescript
import ExcelJS from "exceljs";
import type { QuestionInput } from "@/lib/validators/quiz";

export interface ParseError {
  sheet: string;
  row: number;
  message: string;
}

export interface ParseResult {
  questions: QuestionInput[];
  errors: ParseError[];
}

function cellStr(row: ExcelJS.Row, col: number): string {
  const val = row.getCell(col).value;
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function cellNum(row: ExcelJS.Row, col: number): number | null {
  const val = row.getCell(col).value;
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseCommon(row: ExcelJS.Row): { text: string; timeLimit: number; points: number; confidenceEnabled: boolean } {
  return {
    text: cellStr(row, 1),
    timeLimit: cellNum(row, 2) ?? 30,
    points: cellNum(row, 3) ?? 1000,
    confidenceEnabled: cellStr(row, 4).toUpperCase() === "S",
  };
}

function parseMultipleChoice(row: ExcelJS.Row, rowNum: number, errors: ParseError[]): QuestionInput | null {
  const common = parseCommon(row);
  if (!common.text) return null; // skip empty rows

  const choices: { text: string; isCorrect: boolean }[] = [];
  const correctStr = cellStr(row, 11); // column K = "Corretta"
  const correctIndices = correctStr.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));

  if (correctIndices.length === 0) {
    errors.push({ sheet: "Scelta Multipla", row: rowNum, message: "Manca la risposta corretta" });
    return null;
  }

  for (let i = 5; i <= 10; i++) {
    const text = cellStr(row, i);
    if (text) {
      choices.push({ text, isCorrect: correctIndices.includes(i - 4) });
    }
  }

  if (choices.length < 2) {
    errors.push({ sheet: "Scelta Multipla", row: rowNum, message: "Servono almeno 2 opzioni" });
    return null;
  }

  return { ...common, type: "MULTIPLE_CHOICE", order: 0, options: { choices } };
}

function parseTrueFalse(row: ExcelJS.Row, rowNum: number, errors: ParseError[]): QuestionInput | null {
  const common = parseCommon(row);
  if (!common.text) return null;

  const answer = cellStr(row, 5).toUpperCase();
  if (answer !== "V" && answer !== "F") {
    errors.push({ sheet: "Vero o Falso", row: rowNum, message: "La risposta deve essere V o F" });
    return null;
  }

  return { ...common, type: "TRUE_FALSE", order: 0, options: { correct: answer === "V" } };
}

function parseOpenAnswer(row: ExcelJS.Row, rowNum: number, errors: ParseError[]): QuestionInput | null {
  const common = parseCommon(row);
  if (!common.text) return null;

  const acceptedAnswers: string[] = [];
  for (let i = 5; i <= 7; i++) {
    const text = cellStr(row, i);
    if (text) acceptedAnswers.push(text);
  }

  if (acceptedAnswers.length === 0) {
    errors.push({ sheet: "Risposta Aperta", row: rowNum, message: "Serve almeno una risposta accettata" });
    return null;
  }

  return { ...common, type: "OPEN_ANSWER", order: 0, options: { acceptedAnswers } };
}

function parseOrdering(row: ExcelJS.Row, rowNum: number, errors: ParseError[]): QuestionInput | null {
  const common = parseCommon(row);
  if (!common.text) return null;

  const items: string[] = [];
  for (let i = 5; i <= 10; i++) {
    const text = cellStr(row, i);
    if (text) items.push(text);
  }

  if (items.length < 2) {
    errors.push({ sheet: "Ordinamento", row: rowNum, message: "Servono almeno 2 elementi" });
    return null;
  }

  const correctOrder = items.map((_, i) => i);
  return { ...common, type: "ORDERING", order: 0, options: { items, correctOrder } };
}

function parseNumericEstimation(row: ExcelJS.Row, rowNum: number, errors: ParseError[]): QuestionInput | null {
  const common = parseCommon(row);
  if (!common.text) return null;

  const correctValue = cellNum(row, 5);
  const tolerance = cellNum(row, 6);
  const maxRange = cellNum(row, 7);
  const unit = cellStr(row, 8) || undefined;

  if (correctValue === null) {
    errors.push({ sheet: "Stima Numerica", row: rowNum, message: "Manca il valore corretto" });
    return null;
  }
  if (tolerance === null || maxRange === null) {
    errors.push({ sheet: "Stima Numerica", row: rowNum, message: "Tolleranza e Range Massimo sono obbligatori" });
    return null;
  }

  return { ...common, type: "NUMERIC_ESTIMATION", order: 0, options: { correctValue, tolerance, maxRange, unit } };
}

type SheetParser = (row: ExcelJS.Row, rowNum: number, errors: ParseError[]) => QuestionInput | null;

const SHEET_PARSERS: Record<string, SheetParser> = {
  "Scelta Multipla": parseMultipleChoice,
  "Vero o Falso": parseTrueFalse,
  "Risposta Aperta": parseOpenAnswer,
  "Ordinamento": parseOrdering,
  "Stima Numerica": parseNumericEstimation,
};

export async function parseExcelQuiz(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const questions: QuestionInput[] = [];
  const errors: ParseError[] = [];

  for (const [sheetName, parser] of Object.entries(SHEET_PARSERS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;

    sheet.eachRow((row, rowNum) => {
      if (rowNum <= 2) return; // skip header + example row
      const question = parser(row, rowNum, errors);
      if (question) {
        question.order = questions.length;
        questions.push(question);
      }
    });
  }

  return { questions, errors };
}
```

**Step 2: Commit**

```bash
git add src/lib/excel/parser.ts
git commit -m "feat: add Excel parser for quiz questions with validation"
```

---

### Task 4: Unit tests for parser and template

**Files:**
- Create: `src/lib/__tests__/excel.test.ts`

**Step 1: Write tests**

Test the template generator produces a valid workbook with 5 sheets, and the parser correctly handles valid rows, empty rows, and invalid data.

```typescript
import { describe, it, expect } from "vitest";
import { generateQuizTemplate } from "@/lib/excel/template";
import { parseExcelQuiz } from "@/lib/excel/parser";
import ExcelJS from "exceljs";

describe("generateQuizTemplate", () => {
  it("creates workbook with 5 sheets", async () => {
    const buffer = await generateQuizTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "Scelta Multipla", "Vero o Falso", "Risposta Aperta", "Ordinamento", "Stima Numerica",
    ]);
  });

  it("each sheet has header + example row", async () => {
    const buffer = await generateQuizTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    for (const sheet of wb.worksheets) {
      expect(sheet.rowCount).toBe(2);
    }
  });
});

describe("parseExcelQuiz", () => {
  async function buildWorkbook(
    sheetName: string,
    headers: string[],
    rows: (string | number)[][],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(sheetName);
    sheet.addRow(headers); // header
    sheet.addRow([]); // example row (skipped by parser)
    for (const row of rows) sheet.addRow(row);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("parses multiple choice questions", async () => {
    const buf = await buildWorkbook(
      "Scelta Multipla",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Opzione1", "Opzione2", "Opzione3", "Opzione4", "Opzione5", "Opzione6", "Corretta"],
      [["Capitale Italia?", 30, 1000, "N", "Roma", "Milano", "Napoli", "", "", "", "1"]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].type).toBe("MULTIPLE_CHOICE");
    expect(result.questions[0].options).toEqual({
      choices: [
        { text: "Roma", isCorrect: true },
        { text: "Milano", isCorrect: false },
        { text: "Napoli", isCorrect: false },
      ],
    });
  });

  it("parses true/false questions", async () => {
    const buf = await buildWorkbook(
      "Vero o Falso",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta (V/F)"],
      [["La Terra è rotonda", 20, 1000, "N", "V"]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options).toEqual({ correct: true });
  });

  it("parses open answer questions", async () => {
    const buf = await buildWorkbook(
      "Risposta Aperta",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta1", "Risposta2", "Risposta3"],
      [["Capitale Francia?", 30, 1000, "N", "Parigi", "parigi", ""]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.questions[0].options).toEqual({ acceptedAnswers: ["Parigi", "parigi"] });
  });

  it("parses ordering questions", async () => {
    const buf = await buildWorkbook(
      "Ordinamento",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Elemento1", "Elemento2", "Elemento3", "Elemento4", "Elemento5", "Elemento6"],
      [["Ordina", 30, 1000, "N", "A", "B", "C", "", "", ""]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.questions[0].options).toEqual({ items: ["A", "B", "C"], correctOrder: [0, 1, 2] });
  });

  it("parses numeric estimation questions", async () => {
    const buf = await buildWorkbook(
      "Stima Numerica",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Valore Corretto", "Tolleranza", "Range Massimo", "Unità"],
      [["Abitanti Italia?", 30, 1000, "N", 59, 2, 10, "milioni"]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.errors).toHaveLength(0);
    expect(result.questions[0].options).toEqual({ correctValue: 59, tolerance: 2, maxRange: 10, unit: "milioni" });
  });

  it("skips empty rows", async () => {
    const buf = await buildWorkbook(
      "Vero o Falso",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta (V/F)"],
      [["", "", "", "", ""]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports validation errors", async () => {
    const buf = await buildWorkbook(
      "Vero o Falso",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta (V/F)"],
      [["Domanda senza risposta", 20, 1000, "N", "X"]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.questions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("V o F");
  });

  it("uses default values for optional fields", async () => {
    const buf = await buildWorkbook(
      "Vero o Falso",
      ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta (V/F)"],
      [["Test", "", "", "", "V"]],
    );
    const result = await parseExcelQuiz(buf);
    expect(result.questions[0].timeLimit).toBe(30);
    expect(result.questions[0].points).toBe(1000);
    expect(result.questions[0].confidenceEnabled).toBe(false);
  });

  it("assigns sequential order across sheets", async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Vero o Falso");
    s1.addRow(["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta (V/F)"]);
    s1.addRow([]); // example
    s1.addRow(["Q1", 20, 1000, "N", "V"]);
    s1.addRow(["Q2", 20, 1000, "N", "F"]);

    const s2 = wb.addWorksheet("Risposta Aperta");
    s2.addRow(["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)", "Risposta1", "Risposta2", "Risposta3"]);
    s2.addRow([]); // example
    s2.addRow(["Q3", 30, 1000, "N", "Answer", "", ""]);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await parseExcelQuiz(buf);
    expect(result.questions.map((q) => q.order)).toEqual([0, 1, 2]);
  });
});
```

**Step 2: Run tests**

Run: `npm run test:run -- src/lib/__tests__/excel.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/__tests__/excel.test.ts
git commit -m "test: add unit tests for Excel template and parser"
```

---

### Task 5: API route — template download

**Files:**
- Create: `src/app/api/quiz/excel-template/route.ts`

**Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { generateQuizTemplate } from "@/lib/excel/template";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const buffer = await generateQuizTemplate();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="savint-template.xlsx"',
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/quiz/excel-template/route.ts
git commit -m "feat: add API route for Excel template download"
```

---

### Task 6: API route — Excel import

**Files:**
- Create: `src/app/api/quiz/excel-import/route.ts`

**Step 1: Create the route**

Handles two modes: create new quiz (no `quizId`) or add to existing (`quizId` in form data).

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { parseExcelQuiz } from "@/lib/excel/parser";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const quizId = formData.get("quizId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = await parseExcelQuiz(buffer);
  } catch {
    return NextResponse.json({ error: "File Excel non valido" }, { status: 400 });
  }

  if (result.questions.length === 0 && result.errors.length === 0) {
    return NextResponse.json({ error: "Il file non contiene domande" }, { status: 400 });
  }

  if (result.errors.length > 0) {
    return NextResponse.json({ errors: result.errors, questions: result.questions }, { status: 422 });
  }

  // Mode: add to existing quiz
  if (quizId) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId, authorId: session.user.id },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!quiz) {
      return NextResponse.json({ error: "Quiz non trovato" }, { status: 404 });
    }

    const startOrder = quiz.questions.length;
    await prisma.question.createMany({
      data: result.questions.map((q, i) => ({
        quizId,
        type: q.type,
        text: q.text,
        timeLimit: q.timeLimit,
        points: q.points,
        order: startOrder + i,
        options: q.options as any,
        confidenceEnabled: q.confidenceEnabled,
      })),
    });

    return NextResponse.json({ id: quizId, added: result.questions.length }, { status: 200 });
  }

  // Mode: create new quiz
  const quiz = await prisma.quiz.create({
    data: {
      title: "Quiz importato da Excel",
      authorId: session.user.id,
      questions: {
        create: result.questions.map((q, i) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          order: i,
          options: q.options as any,
          confidenceEnabled: q.confidenceEnabled,
        })),
      },
    },
  });

  return NextResponse.json({ id: quiz.id, title: quiz.title }, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/quiz/excel-import/route.ts
git commit -m "feat: add API route for Excel quiz import (new + existing)"
```

---

### Task 7: UI — Excel import button component

**Files:**
- Create: `src/components/quiz/excel-import-button.tsx`

**Step 1: Create the component**

Similar pattern to existing `ImportQuizButton` but for .xlsx files. Shows errors in an alert if validation fails.

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";

interface Props {
  quizId?: string; // if provided, adds questions to existing quiz
  onImported?: () => void; // callback after successful import to existing quiz
}

export function ExcelImportButton({ quizId, onImported }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (quizId) form.append("quizId", quizId);

      const res = await fetch("/api/quiz/excel-import", {
        method: "POST",
        body: form,
      });

      const body = await res.json();

      if (res.status === 422) {
        // Validation errors — show them
        const errMsgs = body.errors
          .map((e: { sheet: string; row: number; message: string }) => `${e.sheet}, riga ${e.row}: ${e.message}`)
          .join("\n");
        alert(`Errori nel file:\n\n${errMsgs}`);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(body.error || "Errore nell'importazione");
      }

      if (quizId) {
        alert(`${body.added} domande aggiunte al quiz`);
        onImported?.();
      } else {
        router.push(`/dashboard/quiz/${body.id}/edit`);
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore nell'importazione");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 mr-2 animate-spin" />
        ) : (
          <FileSpreadsheet className="size-4 mr-2" />
        )}
        Importa Excel
      </Button>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/quiz/excel-import-button.tsx
git commit -m "feat: add ExcelImportButton component"
```

---

### Task 8: UI — Template download button

**Files:**
- Create: `src/components/quiz/excel-template-button.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export function ExcelTemplateButton() {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch("/api/quiz/excel-template");
      if (!res.ok) throw new Error("Errore nel download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "savint-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore nel download");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleDownload} disabled={loading}>
      {loading ? (
        <Loader2 className="size-4 mr-2 animate-spin" />
      ) : (
        <Download className="size-4 mr-2" />
      )}
      Template Excel
    </Button>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/quiz/excel-template-button.tsx
git commit -m "feat: add ExcelTemplateButton component"
```

---

### Task 9: Integrate buttons into quiz dashboard

**Files:**
- Modify: `src/components/dashboard/quiz-dashboard.tsx`

**Step 1: Add imports and buttons**

Add `ExcelImportButton` and `ExcelTemplateButton` next to the existing `ImportQuizButton` in the dashboard. There are two places: the action bar at the top and the empty state.

Add to imports:
```typescript
import { ExcelImportButton } from "@/components/quiz/excel-import-button";
import { ExcelTemplateButton } from "@/components/quiz/excel-template-button";
```

Place `<ExcelTemplateButton />` and `<ExcelImportButton />` next to `<ImportQuizButton />` in both locations (action bar and empty state).

**Step 2: Verify manually**

Run: `npm run dev:custom`
Navigate to `/dashboard/quiz` — verify the 4 buttons appear: Template Excel, Importa Excel, Importa .qlz, Nuovo Quiz

**Step 3: Commit**

```bash
git add src/components/dashboard/quiz-dashboard.tsx
git commit -m "feat: add Excel template and import buttons to quiz dashboard"
```

---

### Task 10: Add "Aggiungi da Excel" to quiz editor

**Files:**
- Modify: quiz editor page (find the edit page component that renders the question list)

**Step 1: Find and modify the quiz editor**

Look in `src/app/(dashboard)/dashboard/quiz/[id]/edit/` for the editor page. Add the `ExcelImportButton` with `quizId` prop and an `onImported` callback that refreshes the page data.

**Step 2: Verify manually**

Run: `npm run dev:custom`
Navigate to a quiz editor — verify "Importa Excel" button appears and works (adds questions to existing quiz).

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/quiz/
git commit -m "feat: add Excel import button to quiz editor for adding questions"
```

---

### Task 11: Run all tests and final verification

**Step 1: Run unit tests**

Run: `npm run test:run`
Expected: All tests pass (including new Excel tests)

**Step 2: Manual smoke test**

1. Download template from dashboard
2. Fill in some questions in the Excel file
3. Import as new quiz — verify questions appear in editor
4. Import into existing quiz — verify questions are appended

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```
