# QLZ Export/Import + Image Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add .qlz (Quiz Live Zip) export/import format and image upload support to Quiz Live.

**Architecture:** JSZip for ZIP creation/reading. Images uploaded to `public/uploads/quiz/{quizId}/`. Export bundles quiz JSON + images into self-contained .qlz file. Import extracts and creates quiz with local images. The `mediaUrl` field on Question supports both local paths (`/uploads/...`) and external URLs (`https://...`).

**Tech Stack:** JSZip, Zod (validation), Next.js API routes (multipart), React (UI)

---

### Task 1: Install JSZip

**Files:**
- Modify: `package.json`

**Step 1: Install dependency**

Run: `npm install jszip`

**Step 2: Verify installation**

Run: `node -e "require('jszip'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jszip dependency for .qlz format"
```

---

### Task 2: QLZ manifest validator

**Files:**
- Create: `src/lib/validators/qlz.ts`

**Step 1: Create the validator**

```typescript
import { z } from "zod";

const qlzQuestionSchema = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING"]),
  text: z.string().min(1).max(500),
  image: z.string().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
  options: z.union([
    z.object({ choices: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).min(2).max(6) }),
    z.object({ correct: z.boolean() }),
    z.object({ acceptedAnswers: z.array(z.string().min(1)).min(1) }),
    z.object({ items: z.array(z.string().min(1)).min(2), correctOrder: z.array(z.number()) }),
    z.object({ pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2) }),
  ]),
});

export const qlzManifestSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  quiz: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    tags: z.array(z.string()).default([]),
    questions: z.array(qlzQuestionSchema).min(1),
  }),
});

export type QlzManifest = z.infer<typeof qlzManifestSchema>;
export type QlzQuestion = z.infer<typeof qlzQuestionSchema>;
```

**Step 2: Commit**

```bash
git add src/lib/validators/qlz.ts
git commit -m "feat: add Zod schema for .qlz manifest validation"
```

---

### Task 3: Export API route

**Files:**
- Create: `src/app/api/quiz/[id]/export/route.ts`

**Step 1: Create export route**

This route:
1. Loads the quiz with questions from DB
2. For each question with `mediaUrl`, reads the image (local file or remote URL)
3. Builds a ZIP with `manifest.json` + `assets/` folder
4. Returns the .qlz file as download

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import JSZip from "jszip";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import type { QlzManifest } from "@/lib/validators/qlz";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const zip = new JSZip();
  const assetsFolder = zip.folder("assets")!;

  const questions: QlzManifest["quiz"]["questions"] = [];

  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    let imagePath: string | undefined;

    if (q.mediaUrl) {
      try {
        let imageBuffer: Buffer;
        const ext = q.mediaUrl.split(".").pop()?.split("?")[0] || "png";
        const filename = `q${i}.${ext}`;

        if (q.mediaUrl.startsWith("/uploads/")) {
          // Local file
          const filePath = join(process.cwd(), "public", q.mediaUrl);
          if (existsSync(filePath)) {
            imageBuffer = await readFile(filePath);
          } else {
            imageBuffer = Buffer.alloc(0);
          }
        } else {
          // Remote URL
          const res = await fetch(q.mediaUrl);
          if (res.ok) {
            imageBuffer = Buffer.from(await res.arrayBuffer());
          } else {
            imageBuffer = Buffer.alloc(0);
          }
        }

        if (imageBuffer.length > 0) {
          assetsFolder.file(filename, imageBuffer);
          imagePath = `assets/${filename}`;
        }
      } catch {
        // Skip image on error
      }
    }

    questions.push({
      type: q.type,
      text: q.text,
      ...(imagePath ? { image: imagePath } : {}),
      timeLimit: q.timeLimit,
      points: q.points,
      options: q.options as QlzManifest["quiz"]["questions"][number]["options"],
    });
  }

  const manifest: QlzManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    quiz: {
      title: quiz.title,
      ...(quiz.description ? { description: quiz.description } : {}),
      tags: quiz.tags,
      questions,
    },
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const safeName = quiz.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.qlz"`,
    },
  });
}
```

**Step 2: Test manually**

Run the dev server, then:
```bash
curl -s -o test.qlz http://localhost:3000/api/quiz/<quiz-id>/export
unzip -l test.qlz
```
Expected: Lists `manifest.json` and any `assets/` files.

**Step 3: Commit**

```bash
git add src/app/api/quiz/[id]/export/route.ts
git commit -m "feat: add .qlz export API route"
```

---

### Task 4: Import API route

**Files:**
- Create: `src/app/api/quiz/import/route.ts`

**Step 1: Create import route**

This route:
1. Receives a .qlz file as multipart form upload
2. Opens ZIP, reads and validates manifest.json
3. Creates quiz in DB
4. Extracts images to `public/uploads/quiz/{newQuizId}/`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import JSZip from "jszip";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { qlzManifestSchema } from "@/lib/validators/qlz";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  let zip: JSZip;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return NextResponse.json({ error: "Invalid .qlz file" }, { status: 400 });
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile)
    return NextResponse.json({ error: "Missing manifest.json" }, { status: 400 });

  let manifest;
  try {
    const raw = await manifestFile.async("string");
    const parsed = qlzManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid manifest", details: parsed.error.flatten() }, { status: 400 });
    manifest = parsed.data;
  } catch {
    return NextResponse.json({ error: "Cannot parse manifest.json" }, { status: 400 });
  }

  // Create quiz in DB
  const quiz = await prisma.quiz.create({
    data: {
      title: manifest.quiz.title,
      description: manifest.quiz.description,
      tags: manifest.quiz.tags,
      authorId: session.user.id,
      questions: {
        create: manifest.quiz.questions.map((q, i) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          order: i,
          options: q.options,
          mediaUrl: null, // will be updated after image extraction
        })),
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  // Extract images
  const uploadsDir = join(process.cwd(), "public", "uploads", "quiz", quiz.id);
  let hasImages = false;

  for (let i = 0; i < manifest.quiz.questions.length; i++) {
    const q = manifest.quiz.questions[i];
    if (!q.image) continue;

    const zipEntry = zip.file(q.image);
    if (!zipEntry) continue;

    if (!hasImages) {
      await mkdir(uploadsDir, { recursive: true });
      hasImages = true;
    }

    const ext = q.image.split(".").pop() || "png";
    const filename = `q${i}.${ext}`;
    const imageBuffer = await zipEntry.async("nodebuffer");
    await writeFile(join(uploadsDir, filename), imageBuffer);

    // Update question mediaUrl in DB
    await prisma.question.update({
      where: { id: quiz.questions[i].id },
      data: { mediaUrl: `/uploads/quiz/${quiz.id}/${filename}` },
    });
  }

  return NextResponse.json({ id: quiz.id, title: quiz.title }, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/quiz/import/route.ts
git commit -m "feat: add .qlz import API route"
```

---

### Task 5: Image upload API route

**Files:**
- Create: `src/app/api/upload/route.ts`

**Step 1: Create upload route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const quizId = formData.get("quizId") as string | null;

  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "File type not allowed. Use PNG, JPG, GIF or WebP." }, { status: 400 });

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });

  const ext = file.name.split(".").pop() || "png";
  const filename = `${randomUUID()}.${ext}`;
  const folder = quizId || "temp";
  const dir = join(process.cwd(), "public", "uploads", "quiz", folder);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, filename), buffer);

  const url = `/uploads/quiz/${folder}/${filename}`;
  return NextResponse.json({ url }, { status: 201 });
}
```

**Step 2: Add `public/uploads/` to `.gitignore`**

Check if `.gitignore` exists and add the line `public/uploads/` to it so uploaded images are not committed.

**Step 3: Commit**

```bash
git add src/app/api/upload/route.ts .gitignore
git commit -m "feat: add image upload API route"
```

---

### Task 6: Update mediaUrl validator to accept local paths

**Files:**
- Modify: `src/lib/validators/quiz.ts` (line 33)

**Step 1: Update the mediaUrl field**

Currently it only accepts `.url()`. Change it to accept both URLs and local paths starting with `/uploads/`:

Change line 33 from:
```typescript
  mediaUrl: z.string().url().nullable().optional(),
```
to:
```typescript
  mediaUrl: z.string().refine(
    (val) => val.startsWith("/uploads/") || val.startsWith("http://") || val.startsWith("https://"),
    { message: "Must be a URL or a local upload path" }
  ).nullable().optional(),
```

**Step 2: Commit**

```bash
git add src/lib/validators/quiz.ts
git commit -m "fix: allow local upload paths in mediaUrl validator"
```

---

### Task 7: Update question editor with image upload

**Files:**
- Modify: `src/components/quiz/question-editor.tsx` (lines 141-152)

**Step 1: Replace the Media URL section**

Replace the current "URL media" section (lines 141-152) with a dual-mode UI that supports both URL input and file upload. Add state for upload loading and a preview of the current image.

The new section should:
- Show a preview thumbnail if `mediaUrl` is set (either URL or local path)
- Have two options: "Incolla URL" (text input) or "Carica file" (file input)
- On file upload, POST to `/api/upload` and set the returned path as `mediaUrl`
- Have a "Rimuovi" button to clear the image

Replace the media URL `div` (lines 141-152) with:

```tsx
        {/* Media: URL or Upload */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Immagine (opzionale)</label>
          {question.mediaUrl && (
            <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/50">
              <img
                src={question.mediaUrl}
                alt="Anteprima"
                className="h-16 w-16 object-cover rounded"
              />
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {question.mediaUrl}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFieldChange("mediaUrl", null)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          )}
          {!question.mediaUrl && (
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="Incolla URL immagine..."
                onBlur={(e) => {
                  if (e.target.value) handleFieldChange("mediaUrl", e.target.value);
                }}
                className="flex-1"
              />
              <label className="cursor-pointer inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
                Carica
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const form = new FormData();
                    form.append("file", file);
                    try {
                      const res = await fetch("/api/upload", {
                        method: "POST",
                        body: form,
                      });
                      if (!res.ok) throw new Error();
                      const { url } = await res.json();
                      handleFieldChange("mediaUrl", url);
                    } catch {
                      alert("Errore nel caricamento dell'immagine");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </div>
```

**Step 2: Commit**

```bash
git add src/components/quiz/question-editor.tsx
git commit -m "feat: add image upload support to question editor"
```

---

### Task 8: Export button on quiz list

**Files:**
- Modify: `src/app/(dashboard)/dashboard/quiz/page.tsx`

**Step 1: Add export button**

In the quiz card `CardContent`, add a download link next to the existing "Gioca" and "Vedi statistiche" buttons. Use a simple `<a>` tag with `download` attribute pointing to `/api/quiz/{id}/export`:

After the `<PlayQuizButton>` line, add:
```tsx
                <a
                  href={`/api/quiz/${quiz.id}/export`}
                  download
                  className="inline-block mt-2 ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Esporta .qlz
                </a>
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/dashboard/quiz/page.tsx
git commit -m "feat: add export .qlz button to quiz list"
```

---

### Task 9: Import button component and UI

**Files:**
- Create: `src/components/quiz/import-button.tsx`
- Modify: `src/app/(dashboard)/dashboard/quiz/page.tsx`

**Step 1: Create import button component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

export function ImportQuizButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/quiz/import", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Errore nell'importazione");
      }
      const { id } = await res.json();
      router.push(`/dashboard/quiz/${id}/edit`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore nell'importazione");
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".qlz"
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
          <Upload className="size-4 mr-2" />
        )}
        Importa .qlz
      </Button>
    </>
  );
}
```

**Step 2: Add import button to quiz list page header**

In `src/app/(dashboard)/dashboard/quiz/page.tsx`, add the import alongside the existing "Nuovo Quiz" button.

Add import at top:
```typescript
import { ImportQuizButton } from "@/components/quiz/import-button";
```

Change the header div (the one with `flex items-center justify-between`) to include both buttons:
```tsx
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">I miei Quiz</h1>
        <div className="flex gap-2">
          <ImportQuizButton />
          <Link href="/dashboard/quiz/new">
            <Button>Nuovo Quiz</Button>
          </Link>
        </div>
      </div>
```

**Step 3: Commit**

```bash
git add src/components/quiz/import-button.tsx src/app/(dashboard)/dashboard/quiz/page.tsx
git commit -m "feat: add .qlz import button to quiz list"
```

---

### Task 10: Add public/uploads to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add uploads directory**

Add this line to `.gitignore`:
```
public/uploads/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore uploaded files in git"
```
