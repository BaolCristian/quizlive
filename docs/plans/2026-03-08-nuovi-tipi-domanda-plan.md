# Nuovi Tipi di Domanda + Confidenza — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 new question types (SPOT_ERROR, NUMERIC_ESTIMATION, IMAGE_HOTSPOT, CODE_COMPLETION) and a cross-cutting confidence level feature to Quiz Live.

**Architecture:** Extend the existing discriminated-union pattern: each question type defines its Options type, AnswerValue type, Zod validator, scoring logic, sanitization, editor component, and player input component. The confidence level is an optional flag on Question that adds a post-answer step for the player.

**Tech Stack:** Prisma (schema + migration), TypeScript types, Zod validators, Socket.io server logic, React components (Tailwind CSS)

---

## Task 1: Prisma Schema — Add New Types + Confidence Fields

**Files:**
- Modify: `prisma/schema.prisma:15-21` (QuestionType enum)
- Modify: `prisma/schema.prisma:106-119` (Question model)
- Modify: `prisma/schema.prisma:149-165` (Answer model)

**Step 1: Update the enum and models**

In `prisma/schema.prisma`, add to the `QuestionType` enum:

```prisma
enum QuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
  OPEN_ANSWER
  ORDERING
  MATCHING
  SPOT_ERROR
  NUMERIC_ESTIMATION
  IMAGE_HOTSPOT
  CODE_COMPLETION
}
```

Add to the `Question` model (after `options Json`):

```prisma
  confidenceEnabled Boolean @default(false)
```

Add to the `Answer` model (after `score Int`):

```prisma
  confidenceLevel Int?
```

**Step 2: Generate and apply migration**

Run: `npx prisma migrate dev --name add_new_question_types_and_confidence`

Expected: Migration created and applied successfully.

**Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add new question types and confidence fields to schema"
```

---

## Task 2: TypeScript Types — New Options and Answer Value Types

**Files:**
- Modify: `src/types/index.ts:1-91`

**Step 1: Add new option types after MatchingOptions (line 22)**

```typescript
export type SpotErrorOptions = {
  lines: string[];
  errorIndices: number[];
  explanation?: string;
};

export type NumericEstimationOptions = {
  correctValue: number;
  tolerance: number;
  maxRange: number;
  unit?: string;
};

export type ImageHotspotOptions = {
  imageUrl: string;
  hotspot: { x: number; y: number; radius: number };
  tolerance: number;
};

export type CodeCompletionOptions = {
  codeLines: string[];
  blankLineIndex: number;
  correctAnswer: string;
  mode: "choice" | "text";
  choices?: string[];
};
```

**Step 2: Update the QuestionOptions union (line 25-30)**

```typescript
export type QuestionOptions =
  | MultipleChoiceOptions
  | TrueFalseOptions
  | OpenAnswerOptions
  | OrderingOptions
  | MatchingOptions
  | SpotErrorOptions
  | NumericEstimationOptions
  | ImageHotspotOptions
  | CodeCompletionOptions;
```

**Step 3: Add new answer value types after MatchingValue (line 37)**

```typescript
export type SpotErrorValue = { selected: number[] };
export type NumericEstimationValue = { value: number };
export type ImageHotspotValue = { x: number; y: number };
export type CodeCompletionValue = { text: string } | { selected: number };
```

**Step 4: Update the AnswerValue union (line 39-44)**

```typescript
export type AnswerValue =
  | MultipleChoiceValue
  | TrueFalseValue
  | OpenAnswerValue
  | OrderingValue
  | MatchingValue
  | SpotErrorValue
  | NumericEstimationValue
  | ImageHotspotValue
  | CodeCompletionValue;
```

**Step 5: Add confidence to answerFeedback event**

In the `ServerToClientEvents` interface, update the `answerFeedback` event to include an optional `confidenceEnabled` flag:

```typescript
  answerFeedback: (data: {
    isCorrect: boolean;
    score: number;
    totalScore: number;
    position: number;
    classCorrectPercent: number;
    confidenceEnabled?: boolean;
  }) => void;
```

Add a new event for submitting confidence after the answer:

```typescript
export interface ClientToServerEvents {
  // ... existing events ...
  submitConfidence: (data: { confidenceLevel: number }) => void;
}
```

**Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript types for new question types and confidence"
```

---

## Task 3: Zod Validators — New Question Type Schemas

**Files:**
- Modify: `src/lib/validators/quiz.ts:1-61`

**Step 1: Add new option schemas after matchingOptionsSchema (line 28)**

```typescript
const spotErrorOptionsSchema = z.object({
  lines: z.array(z.string().min(1)).min(2),
  errorIndices: z.array(z.number().int().min(0)).min(1),
  explanation: z.string().optional(),
});

const numericEstimationOptionsSchema = z.object({
  correctValue: z.number(),
  tolerance: z.number().min(0),
  maxRange: z.number().min(0),
  unit: z.string().optional(),
});

const imageHotspotOptionsSchema = z.object({
  imageUrl: z.string().refine(
    (val) => val.startsWith("/uploads/") || val.startsWith("http://") || val.startsWith("https://"),
    { message: "Must be a URL or a local upload path" }
  ),
  hotspot: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    radius: z.number().min(0.01).max(0.5),
  }),
  tolerance: z.number().min(0).max(0.5),
});

const codeCompletionOptionsSchema = z.object({
  codeLines: z.array(z.string()).min(2),
  blankLineIndex: z.number().int().min(0),
  correctAnswer: z.string().min(1),
  mode: z.enum(["choice", "text"]),
  choices: z.array(z.string().min(1)).min(2).max(6).optional(),
});
```

**Step 2: Update the questionSchema type enum and options union (lines 30-47)**

```typescript
export const questionSchema = z.object({
  type: z.enum([
    "MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING",
    "SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT", "CODE_COMPLETION",
  ]),
  text: z.string().min(1).max(500),
  mediaUrl: z.string().refine(
    (val) => val.startsWith("/uploads/") || val.startsWith("http://") || val.startsWith("https://"),
    { message: "Must be a URL or a local upload path" }
  ).nullable().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
  order: z.number().int().min(0),
  confidenceEnabled: z.boolean().default(false),
  options: z.union([
    multipleChoiceOptionsSchema,
    trueFalseOptionsSchema,
    openAnswerOptionsSchema,
    orderingOptionsSchema,
    matchingOptionsSchema,
    spotErrorOptionsSchema,
    numericEstimationOptionsSchema,
    imageHotspotOptionsSchema,
    codeCompletionOptionsSchema,
  ]),
});
```

**Step 3: Commit**

```bash
git add src/lib/validators/quiz.ts
git commit -m "feat: add Zod validators for new question types"
```

---

## Task 4: Scoring Logic — checkAnswer + calculateScore for New Types

**Files:**
- Modify: `src/lib/scoring.ts:1-42`
- Create: `src/lib/__tests__/scoring.test.ts`

**Step 1: Write tests for the new scoring functions**

Create `src/lib/__tests__/scoring.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { checkAnswer, calculateScore, calculatePartialScore } from "../scoring";

describe("SPOT_ERROR", () => {
  const options = { lines: ["a", "b", "c", "d"], errorIndices: [1, 3], explanation: "test" };

  it("returns true when all errors found and no false positives", () => {
    expect(checkAnswer("SPOT_ERROR", options, { selected: [1, 3] })).toBe(true);
  });

  it("returns false with partial selection", () => {
    expect(checkAnswer("SPOT_ERROR", options, { selected: [1] })).toBe(false);
  });

  it("returns false with wrong selection", () => {
    expect(checkAnswer("SPOT_ERROR", options, { selected: [0, 2] })).toBe(false);
  });
});

describe("SPOT_ERROR partial scoring", () => {
  const options = { lines: ["a", "b", "c", "d"], errorIndices: [1, 3] };

  it("full score when all correct", () => {
    const score = calculatePartialScore("SPOT_ERROR", options, { selected: [1, 3] }, 1000);
    expect(score).toBe(1000);
  });

  it("half score when 1 of 2 correct, no wrong", () => {
    const score = calculatePartialScore("SPOT_ERROR", options, { selected: [1] }, 1000);
    expect(score).toBe(500);
  });

  it("zero when wrong selection cancels correct", () => {
    const score = calculatePartialScore("SPOT_ERROR", options, { selected: [1, 0] }, 1000);
    expect(score).toBe(0); // 500 - 500 = 0
  });
});

describe("NUMERIC_ESTIMATION", () => {
  const options = { correctValue: 100, tolerance: 5, maxRange: 50 };

  it("correct within tolerance", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", options, { value: 103 })).toBe(true);
  });

  it("correct at exact value", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", options, { value: 100 })).toBe(true);
  });

  it("incorrect outside tolerance", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", options, { value: 120 })).toBe(false);
  });
});

describe("NUMERIC_ESTIMATION partial scoring", () => {
  const options = { correctValue: 100, tolerance: 10, maxRange: 50 };

  it("full score within tolerance", () => {
    const score = calculatePartialScore("NUMERIC_ESTIMATION", options, { value: 105 }, 1000);
    expect(score).toBe(1000);
  });

  it("partial score between tolerance and maxRange", () => {
    // scarto=30, tolerance=10, maxRange=50 => 1000 * (1 - (30-10)/(50-10)) = 1000 * 0.5 = 500
    const score = calculatePartialScore("NUMERIC_ESTIMATION", options, { value: 130 }, 1000);
    expect(score).toBe(500);
  });

  it("zero beyond maxRange", () => {
    const score = calculatePartialScore("NUMERIC_ESTIMATION", options, { value: 200 }, 1000);
    expect(score).toBe(0);
  });
});

describe("IMAGE_HOTSPOT", () => {
  const options = { imageUrl: "test.jpg", hotspot: { x: 0.5, y: 0.5, radius: 0.1 }, tolerance: 0.05 };

  it("correct when inside radius", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", options, { x: 0.52, y: 0.52 })).toBe(true);
  });

  it("incorrect when outside radius + tolerance", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", options, { x: 0.9, y: 0.9 })).toBe(false);
  });
});

describe("IMAGE_HOTSPOT partial scoring", () => {
  const options = { imageUrl: "test.jpg", hotspot: { x: 0.5, y: 0.5, radius: 0.1 }, tolerance: 0.1 };

  it("full score inside radius", () => {
    const score = calculatePartialScore("IMAGE_HOTSPOT", options, { x: 0.5, y: 0.5 }, 1000);
    expect(score).toBe(1000);
  });

  it("partial score in tolerance zone", () => {
    // distance ~0.14 from center, radius=0.1, tolerance=0.1, so in tolerance zone
    const score = calculatePartialScore("IMAGE_HOTSPOT", options, { x: 0.6, y: 0.6 }, 1000);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1000);
  });

  it("zero outside radius + tolerance", () => {
    const score = calculatePartialScore("IMAGE_HOTSPOT", options, { x: 0.9, y: 0.9 }, 1000);
    expect(score).toBe(0);
  });
});

describe("CODE_COMPLETION", () => {
  const choiceOptions = {
    codeLines: ["for (", "  ___", ")"],
    blankLineIndex: 1,
    correctAnswer: "let i = 0; i < n; i++",
    mode: "choice" as const,
    choices: ["let i = 0; i < n; i++", "while true", "i++"],
  };

  it("correct choice mode", () => {
    expect(checkAnswer("CODE_COMPLETION", choiceOptions, { selected: 0 })).toBe(true);
  });

  it("incorrect choice mode", () => {
    expect(checkAnswer("CODE_COMPLETION", choiceOptions, { selected: 1 })).toBe(false);
  });

  const textOptions = {
    codeLines: ["for (", "  ___", ")"],
    blankLineIndex: 1,
    correctAnswer: "let i = 0; i < n; i++",
    mode: "text" as const,
  };

  it("correct text mode (exact)", () => {
    expect(checkAnswer("CODE_COMPLETION", textOptions, { text: "let i = 0; i < n; i++" })).toBe(true);
  });

  it("correct text mode (case insensitive, extra spaces)", () => {
    expect(checkAnswer("CODE_COMPLETION", textOptions, { text: "  Let I = 0; I < N; I++  " })).toBe(true);
  });

  it("incorrect text mode", () => {
    expect(checkAnswer("CODE_COMPLETION", textOptions, { text: "wrong" })).toBe(false);
  });
});

describe("confidence scoring", () => {
  it("correct + high confidence = 1.2x", () => {
    const base = calculateScore({ isCorrect: true, responseTimeMs: 0, timeLimit: 20, maxPoints: 1000 });
    const withConf = applyConfidence(base, true, 3);
    expect(withConf).toBe(Math.round(base * 1.2));
  });

  it("correct + low confidence = 0.8x", () => {
    const base = calculateScore({ isCorrect: true, responseTimeMs: 0, timeLimit: 20, maxPoints: 1000 });
    const withConf = applyConfidence(base, true, 1);
    expect(withConf).toBe(Math.round(base * 0.8));
  });

  it("wrong + high confidence = -200 malus (floor 0)", () => {
    const withConf = applyConfidence(0, false, 3);
    expect(withConf).toBe(0); // max(0 - 200, 0)
  });

  it("wrong + medium/low confidence = no change", () => {
    expect(applyConfidence(0, false, 2)).toBe(0);
    expect(applyConfidence(0, false, 1)).toBe(0);
  });
});
```

Import `applyConfidence` from scoring too (we'll add it in Step 3).

**Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/scoring.test.ts`
Expected: FAIL — functions not yet implemented.

**Step 3: Implement the new scoring functions**

Replace `src/lib/scoring.ts` with:

```typescript
interface ScoreInput {
  isCorrect: boolean;
  responseTimeMs: number;
  timeLimit: number;
  maxPoints: number;
}

export function calculateScore({ isCorrect, responseTimeMs, timeLimit, maxPoints }: ScoreInput): number {
  if (!isCorrect) return 0;
  const timeLimitMs = timeLimit * 1000;
  const timeRatio = Math.min(responseTimeMs / timeLimitMs, 1);
  const multiplier = 1.0 - timeRatio * 0.5;
  return Math.round(maxPoints * multiplier);
}

/** For types with partial scoring, returns raw points (before time bonus). */
export function calculatePartialScore(type: string, options: any, value: any, maxPoints: number): number {
  switch (type) {
    case "SPOT_ERROR": {
      const errorIndices = new Set(options.errorIndices as number[]);
      const selected = new Set(value.selected as number[]);
      const totalErrors = errorIndices.size;
      const perItem = maxPoints / totalErrors;
      let score = 0;
      for (const s of selected) {
        if (errorIndices.has(s)) {
          score += perItem;
        } else {
          score -= perItem;
        }
      }
      return Math.max(0, Math.round(score));
    }
    case "NUMERIC_ESTIMATION": {
      const { correctValue, tolerance, maxRange } = options;
      const scarto = Math.abs(value.value - correctValue);
      if (scarto <= tolerance) return maxPoints;
      if (scarto >= maxRange) return 0;
      return Math.round(maxPoints * (1 - (scarto - tolerance) / (maxRange - tolerance)));
    }
    case "IMAGE_HOTSPOT": {
      const { hotspot, tolerance: tol } = options;
      const dx = value.x - hotspot.x;
      const dy = value.y - hotspot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= hotspot.radius) return maxPoints;
      if (dist >= hotspot.radius + tol) return 0;
      return Math.round(maxPoints * (1 - (dist - hotspot.radius) / tol));
    }
    default:
      return 0;
  }
}

/** Apply confidence multiplier/malus to a score. */
export function applyConfidence(score: number, isCorrect: boolean, confidenceLevel: number): number {
  if (isCorrect) {
    const multipliers: Record<number, number> = { 1: 0.8, 2: 1.0, 3: 1.2 };
    return Math.round(score * (multipliers[confidenceLevel] ?? 1.0));
  } else {
    if (confidenceLevel === 3) return Math.max(0, score - 200);
    return score;
  }
}

export function checkAnswer(type: string, options: any, value: any): boolean {
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const correct = options.choices
        .map((c: any, i: number) => (c.isCorrect ? i : -1))
        .filter((i: number) => i >= 0);
      const selected = [...value.selected].sort();
      return JSON.stringify(correct.sort()) === JSON.stringify(selected);
    }
    case "TRUE_FALSE":
      return value.selected === options.correct;
    case "OPEN_ANSWER":
      return options.acceptedAnswers.some(
        (a: string) => a.toLowerCase().trim() === value.text.toLowerCase().trim()
      );
    case "ORDERING":
      return JSON.stringify(value.order) === JSON.stringify(options.correctOrder);
    case "MATCHING": {
      const expected = options.pairs.map((_: any, i: number) => [i, i]);
      const sorted = [...value.matches].sort((a: number[], b: number[]) => a[0] - b[0]);
      return JSON.stringify(sorted) === JSON.stringify(expected);
    }
    case "SPOT_ERROR": {
      const errorSet = new Set(options.errorIndices as number[]);
      const selectedSet = new Set(value.selected as number[]);
      if (errorSet.size !== selectedSet.size) return false;
      for (const idx of errorSet) {
        if (!selectedSet.has(idx)) return false;
      }
      return true;
    }
    case "NUMERIC_ESTIMATION": {
      const scarto = Math.abs(value.value - options.correctValue);
      return scarto <= options.tolerance;
    }
    case "IMAGE_HOTSPOT": {
      const { hotspot } = options;
      const dx = value.x - hotspot.x;
      const dy = value.y - hotspot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= hotspot.radius;
    }
    case "CODE_COMPLETION": {
      if (options.mode === "choice") {
        const correctIdx = options.choices?.indexOf(options.correctAnswer) ?? -1;
        return value.selected === correctIdx;
      }
      // text mode: normalized comparison
      const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
      return normalize(value.text) === normalize(options.correctAnswer);
    }
    default:
      return false;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/scoring.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/__tests__/scoring.test.ts
git commit -m "feat: implement scoring for new question types and confidence"
```

---

## Task 5: Socket Server — Sanitize, Score, and Distribute New Types

**Files:**
- Modify: `src/lib/socket/server.ts:1-511`

**Step 1: Update imports (line 4-12)**

Add imports for the new types:

```typescript
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  QuestionOptions,
  MultipleChoiceOptions,
  OrderingOptions,
  MatchingOptions,
  SpotErrorOptions,
  NumericEstimationOptions,
  ImageHotspotOptions,
  CodeCompletionOptions,
} from "@/types";
```

Also import `calculatePartialScore` and `applyConfidence`:

```typescript
import { checkAnswer, calculateScore, calculatePartialScore, applyConfidence } from "@/lib/scoring";
```

**Step 2: Update sanitizeOptions function (lines 60-92)**

Add cases for the 4 new types before the `default`:

```typescript
    case "SPOT_ERROR": {
      const se = options as SpotErrorOptions;
      return { lines: se.lines, errorIndices: [], explanation: undefined } as any;
    }
    case "NUMERIC_ESTIMATION": {
      // Player only needs to know the unit (if any)
      const ne = options as NumericEstimationOptions;
      return { correctValue: 0, tolerance: 0, maxRange: 0, unit: ne.unit } as any;
    }
    case "IMAGE_HOTSPOT": {
      const ih = options as ImageHotspotOptions;
      return { imageUrl: ih.imageUrl, hotspot: { x: 0, y: 0, radius: 0 }, tolerance: 0 } as any;
    }
    case "CODE_COMPLETION": {
      const cc = options as CodeCompletionOptions;
      if (cc.mode === "choice" && cc.choices) {
        const shuffled = [...cc.choices].sort(() => Math.random() - 0.5);
        return {
          codeLines: cc.codeLines,
          blankLineIndex: cc.blankLineIndex,
          correctAnswer: "",
          mode: cc.mode,
          choices: shuffled,
        } as any;
      }
      return {
        codeLines: cc.codeLines,
        blankLineIndex: cc.blankLineIndex,
        correctAnswer: "",
        mode: cc.mode,
      } as any;
    }
```

**Step 3: Update buildDistribution function (lines 115-147)**

The new types all fall into the `default` case (correct/incorrect counts), which is fine. No change needed.

**Step 4: Update the submitAnswer handler (lines 283-369)**

Replace the scoring section to support partial scores and confidence. The key change is in how `score` is calculated. Replace lines 292-298 with:

```typescript
      const isCorrect = checkAnswer(question.type, question.options, value);

      // Calculate score: use partial scoring for types that support it
      let score: number;
      const partialTypes = ["SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT"];
      if (partialTypes.includes(question.type)) {
        const rawPartial = calculatePartialScore(question.type, question.options, value, question.points);
        // Apply time bonus to partial score
        const timeLimitMs = question.timeLimit * 1000;
        const timeRatio = Math.min(responseTimeMs / timeLimitMs, 1);
        const timeMultiplier = 1.0 - timeRatio * 0.5;
        score = Math.round(rawPartial * timeMultiplier);
      } else {
        score = calculateScore({
          isCorrect,
          responseTimeMs,
          timeLimit: question.timeLimit,
          maxPoints: question.points,
        });
      }
```

Also, add `confidenceEnabled` to the feedback event so the player view knows to show the confidence UI. After the `socket.emit("answerFeedback", ...)` call, check if the question has confidence enabled from the cached questions. We need to add `confidenceEnabled` to the cached question type.

Update the `GameState.questions` interface to include `confidenceEnabled`:

```typescript
  questions: {
    id: string;
    text: string;
    type: QuestionType;
    options: QuestionOptions;
    timeLimit: number;
    points: number;
    mediaUrl: string | null;
    order: number;
    confidenceEnabled: boolean;
  }[];
```

Update the question loading in `joinSession` (line 193-202) to include:

```typescript
  confidenceEnabled: q.confidenceEnabled,
```

Update the `answerFeedback` emit to include:

```typescript
      socket.emit("answerFeedback", {
        isCorrect,
        score,
        totalScore: player?.totalScore ?? 0,
        position,
        classCorrectPercent,
        confidenceEnabled: question.confidenceEnabled,
      });
```

**Step 5: Add submitConfidence handler**

After the `submitAnswer` handler, add a new handler for confidence:

```typescript
    // ------------------------------------------------------------------
    // submitConfidence
    // ------------------------------------------------------------------
    socket.on("submitConfidence", async ({ confidenceLevel }) => {
      if (!currentSessionId || !currentPlayerName) return;

      const game = games.get(currentSessionId);
      if (!game || game.currentQuestionIndex < 0) return;

      const question = game.questions[game.currentQuestionIndex];
      if (!question || !question.confidenceEnabled) return;

      const player = game.players.get(currentPlayerName);
      if (!player) return;

      // Apply confidence modifier to the last delta
      const oldDelta = player.lastDelta;
      const isCorrect = oldDelta > 0;
      const newDelta = applyConfidence(oldDelta, isCorrect, confidenceLevel);
      const diff = newDelta - oldDelta;

      player.totalScore += diff;
      player.lastDelta = newDelta;

      // Update DB answer with confidence level and adjusted score
      try {
        await prisma.answer.update({
          where: {
            sessionId_questionId_playerName: {
              sessionId: game.sessionId,
              questionId: question.id,
              playerName: currentPlayerName,
            },
          },
          data: {
            confidenceLevel,
            score: newDelta,
          },
        });
      } catch (err) {
        console.error("submitConfidence DB error:", err);
      }

      // Send updated feedback
      const leaderboard = buildLeaderboard(game);
      const position = leaderboard.findIndex((l) => l.playerName === currentPlayerName) + 1;

      socket.emit("answerFeedback", {
        isCorrect,
        score: newDelta,
        totalScore: player.totalScore,
        position,
        classCorrectPercent: 0, // not recomputed
        confidenceEnabled: false, // don't re-show confidence
      });
    });
```

**Step 6: Commit**

```bash
git add src/lib/socket/server.ts
git commit -m "feat: add socket server support for new question types and confidence"
```

---

## Task 6: QLZ Validator — Support New Types in Export/Import

**Files:**
- Modify: `src/lib/validators/qlz.ts:1-58`

**Step 1: Add the new option schemas and update the qlz question schema**

Add the same 4 new option schemas (spotErrorOptionsSchema, numericEstimationOptionsSchema, imageHotspotOptionsSchema, codeCompletionOptionsSchema) after the existing ones, then update:

```typescript
const qlzQuestionSchema = z.object({
  type: z.enum([
    "MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING",
    "SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT", "CODE_COMPLETION",
  ]),
  text: z.string().min(1).max(500),
  image: z.string().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
  confidenceEnabled: z.boolean().default(false),
  options: z.union([
    multipleChoiceOptionsSchema,
    trueFalseOptionsSchema,
    openAnswerOptionsSchema,
    orderingOptionsSchema,
    matchingOptionsSchema,
    spotErrorOptionsSchema,
    numericEstimationOptionsSchema,
    imageHotspotOptionsSchema,
    codeCompletionOptionsSchema,
  ]),
});
```

**Step 2: Commit**

```bash
git add src/lib/validators/qlz.ts
git commit -m "feat: add qlz export/import support for new question types"
```

---

## Task 7: Editor Components — 4 New Sub-Editors + Confidence Toggle

**Files:**
- Create: `src/components/quiz/spot-error-editor.tsx`
- Create: `src/components/quiz/numeric-estimation-editor.tsx`
- Create: `src/components/quiz/image-hotspot-editor.tsx`
- Create: `src/components/quiz/code-completion-editor.tsx`
- Create: `src/components/quiz/confidence-toggle.tsx`
- Modify: `src/components/quiz/question-editor.tsx`

**Step 1: Create SpotErrorEditor**

Create `src/components/quiz/spot-error-editor.tsx`:

```tsx
"use client";

import { Plus, Trash2 } from "lucide-react";

interface Props {
  options: { lines: string[]; errorIndices: number[]; explanation?: string };
  onChange: (opts: Props["options"]) => void;
}

export function SpotErrorEditor({ options, onChange }: Props) {
  const { lines, errorIndices, explanation } = options;

  const toggleError = (i: number) => {
    const newIndices = errorIndices.includes(i)
      ? errorIndices.filter((idx) => idx !== i)
      : [...errorIndices, i];
    onChange({ ...options, errorIndices: newIndices });
  };

  const updateLine = (i: number, text: string) => {
    const newLines = lines.map((l, idx) => (idx === i ? text : l));
    onChange({ ...options, lines: newLines });
  };

  const addLine = () => {
    onChange({ ...options, lines: [...lines, ""] });
  };

  const removeLine = (i: number) => {
    const newLines = lines.filter((_, idx) => idx !== i);
    const newIndices = errorIndices
      .filter((idx) => idx !== i)
      .map((idx) => (idx > i ? idx - 1 : idx));
    onChange({ ...options, lines: newLines, errorIndices: newIndices });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Inserisci le righe di testo/codice. Clicca il numero per marcare le righe errate.
      </p>
      {lines.map((line, i) => {
        const isError = errorIndices.includes(i);
        return (
          <div key={i} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggleError(i)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                isError
                  ? "bg-red-500 text-white ring-2 ring-red-300"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900"
              }`}
              title={isError ? "Rimuovi errore" : "Segna come errore"}
            >
              {i + 1}
            </button>
            <input
              value={line}
              onChange={(e) => updateLine(i, e.target.value)}
              placeholder={`Riga ${i + 1}`}
              className={`flex-1 rounded-xl border px-4 py-3 text-lg lg:text-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                isError
                  ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"
                  : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            />
            {lines.length > 2 && (
              <button
                onClick={() => removeLine(i)}
                className="text-slate-400 hover:text-red-500 p-1 transition-colors"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={addLine}
        className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="size-5" /> Aggiungi riga
      </button>

      {/* Explanation */}
      <div>
        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Spiegazione (opzionale)</label>
        <input
          value={explanation || ""}
          onChange={(e) => onChange({ ...options, explanation: e.target.value || undefined })}
          placeholder="Spiega perche queste righe sono errate..."
          className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-base text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {errorIndices.length === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Seleziona almeno una riga come errore cliccando sul numero.
        </p>
      )}
    </div>
  );
}
```

**Step 2: Create NumericEstimationEditor**

Create `src/components/quiz/numeric-estimation-editor.tsx`:

```tsx
"use client";

interface Props {
  options: { correctValue: number; tolerance: number; maxRange: number; unit?: string };
  onChange: (opts: Props["options"]) => void;
}

export function NumericEstimationEditor({ options, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Valore corretto</label>
          <input
            type="number"
            value={options.correctValue}
            onChange={(e) => onChange({ ...options, correctValue: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xl font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Unita di misura (opzionale)</label>
          <input
            type="text"
            value={options.unit || ""}
            onChange={(e) => onChange({ ...options, unit: e.target.value || undefined })}
            placeholder="es. km, kg, °C..."
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Tolleranza (punteggio pieno)
          </label>
          <input
            type="number"
            min={0}
            value={options.tolerance}
            onChange={(e) => onChange({ ...options, tolerance: Math.max(0, Number(e.target.value)) })}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <p className="mt-1 text-xs text-slate-400">Scarto massimo per punteggio pieno</p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Range massimo (zero punti)
          </label>
          <input
            type="number"
            min={0}
            value={options.maxRange}
            onChange={(e) => onChange({ ...options, maxRange: Math.max(0, Number(e.target.value)) })}
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <p className="mt-1 text-xs text-slate-400">Oltre questo scarto: 0 punti</p>
        </div>
      </div>

      {/* Visual preview */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Anteprima punteggio</p>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="text-green-600 font-semibold">Pieno:</span>
          {options.correctValue - options.tolerance} — {options.correctValue + options.tolerance}
          {options.unit ? ` ${options.unit}` : ""}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="text-amber-600 font-semibold">Parziale:</span>
          fino a ±{options.maxRange}
          {options.unit ? ` ${options.unit}` : ""}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create ImageHotspotEditor**

Create `src/components/quiz/image-hotspot-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Upload, Search } from "lucide-react";
import { ImageSearchDialog } from "@/components/quiz/image-search";

interface Props {
  options: {
    imageUrl: string;
    hotspot: { x: number; y: number; radius: number };
    tolerance: number;
  };
  onChange: (opts: Props["options"]) => void;
}

export function ImageHotspotEditor({ options, onChange }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onChange({
      ...options,
      hotspot: { ...options.hotspot, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 },
    });
  };

  const setImageUrl = (url: string) => {
    onChange({ ...options, imageUrl: url });
  };

  return (
    <div className="space-y-4">
      {/* Image source */}
      {!options.imageUrl ? (
        <div className="flex items-center gap-3">
          <input
            type="url"
            placeholder="URL immagine per hotspot..."
            onBlur={(e) => {
              if (e.target.value && /^https?:\/\//.test(e.target.value)) setImageUrl(e.target.value);
            }}
            className="flex-1 bg-transparent text-lg text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none border-b border-slate-200 dark:border-slate-600 pb-1"
          />
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold px-4 py-2 rounded-xl text-base border border-indigo-200 dark:border-indigo-700 transition-colors shrink-0"
          >
            <Search className="size-4" /> Cerca
          </button>
          <label className="flex items-center gap-2 cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-semibold px-4 py-2 rounded-xl text-base transition-colors shrink-0">
            <Upload className="size-4" /> Carica
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
                  const res = await fetch("/api/upload", { method: "POST", body: form });
                  if (!res.ok) throw new Error();
                  const { url } = await res.json();
                  setImageUrl(url);
                } catch {
                  alert("Errore nel caricamento dell'immagine");
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Clicca sull'immagine per posizionare l'hotspot (punto corretto).
          </p>
          <div className="relative inline-block">
            <img
              src={options.imageUrl}
              alt="Hotspot"
              className="max-h-80 max-w-full rounded-xl cursor-crosshair"
              onClick={handleImageClick}
            />
            {/* Hotspot marker */}
            {options.hotspot.x > 0 && (
              <div
                className="absolute border-4 border-red-500 rounded-full pointer-events-none"
                style={{
                  left: `${options.hotspot.x * 100}%`,
                  top: `${options.hotspot.y * 100}%`,
                  width: `${options.hotspot.radius * 200}%`,
                  height: `${options.hotspot.radius * 200}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="absolute inset-0 bg-red-500/20 rounded-full" />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImageUrl("")}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Cambia immagine
          </button>
        </div>
      )}

      {/* Radius and tolerance */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Raggio hotspot
          </label>
          <input
            type="range"
            min={0.02}
            max={0.3}
            step={0.01}
            value={options.hotspot.radius}
            onChange={(e) =>
              onChange({
                ...options,
                hotspot: { ...options.hotspot, radius: Number(e.target.value) },
              })
            }
            className="mt-1 w-full"
          />
          <span className="text-xs text-slate-400">{Math.round(options.hotspot.radius * 100)}%</span>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Tolleranza extra
          </label>
          <input
            type="range"
            min={0}
            max={0.2}
            step={0.01}
            value={options.tolerance}
            onChange={(e) => onChange({ ...options, tolerance: Number(e.target.value) })}
            className="mt-1 w-full"
          />
          <span className="text-xs text-slate-400">{Math.round(options.tolerance * 100)}%</span>
        </div>
      </div>

      {showSearch && (
        <ImageSearchDialog
          onSelect={(url) => {
            setImageUrl(url);
            setShowSearch(false);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
```

**Step 4: Create CodeCompletionEditor**

Create `src/components/quiz/code-completion-editor.tsx`:

```tsx
"use client";

import { Plus, Trash2 } from "lucide-react";

interface Props {
  options: {
    codeLines: string[];
    blankLineIndex: number;
    correctAnswer: string;
    mode: "choice" | "text";
    choices?: string[];
  };
  onChange: (opts: Props["options"]) => void;
}

export function CodeCompletionEditor({ options, onChange }: Props) {
  const { codeLines, blankLineIndex, correctAnswer, mode, choices } = options;

  const updateLine = (i: number, text: string) => {
    const newLines = codeLines.map((l, idx) => (idx === i ? text : l));
    onChange({ ...options, codeLines: newLines });
  };

  const addLine = () => {
    onChange({ ...options, codeLines: [...codeLines, ""] });
  };

  const removeLine = (i: number) => {
    if (codeLines.length <= 2) return;
    const newLines = codeLines.filter((_, idx) => idx !== i);
    let newBlank = blankLineIndex;
    if (i < blankLineIndex) newBlank--;
    else if (i === blankLineIndex) newBlank = Math.min(newBlank, newLines.length - 1);
    onChange({ ...options, codeLines: newLines, blankLineIndex: newBlank });
  };

  const updateChoice = (i: number, text: string) => {
    if (!choices) return;
    const newChoices = choices.map((c, idx) => (idx === i ? text : c));
    onChange({ ...options, choices: newChoices });
  };

  return (
    <div className="space-y-4">
      {/* Code lines */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
          Scrivi il codice. Clicca la freccia per selezionare la riga da nascondere.
        </p>
        <div className="bg-slate-900 rounded-xl p-3 space-y-1 font-mono text-sm">
          {codeLines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...options, blankLineIndex: i })}
                className={`w-6 h-6 rounded text-xs font-bold shrink-0 transition-all ${
                  i === blankLineIndex
                    ? "bg-amber-500 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-amber-800"
                }`}
                title="Seleziona come riga vuota"
              >
                {i + 1}
              </button>
              <input
                value={line}
                onChange={(e) => updateLine(i, e.target.value)}
                placeholder={i === blankLineIndex ? "← Questa riga sara nascosta" : `Riga ${i + 1}`}
                className={`flex-1 bg-transparent px-2 py-1 rounded outline-none ${
                  i === blankLineIndex
                    ? "text-amber-400 border border-amber-500/30 bg-amber-500/10"
                    : "text-green-300 border border-transparent"
                }`}
              />
              {codeLines.length > 2 && (
                <button
                  onClick={() => removeLine(i)}
                  className="text-slate-500 hover:text-red-400 p-0.5 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addLine}
          className="mt-2 flex items-center gap-2 text-base font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="size-4" /> Aggiungi riga
        </button>
      </div>

      {/* Correct answer */}
      <div>
        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Risposta corretta</label>
        <input
          value={correctAnswer}
          onChange={(e) => onChange({ ...options, correctAnswer: e.target.value })}
          placeholder="Il codice corretto per la riga nascosta..."
          className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Mode toggle */}
      <div>
        <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 block">Modalita risposta</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange({ ...options, mode: "choice", choices: choices || [correctAnswer, "", ""] })}
            className={`flex-1 py-3 rounded-xl text-base font-bold transition-all border-2 ${
              mode === "choice"
                ? "bg-indigo-100 dark:bg-indigo-900 border-indigo-500 text-indigo-700 dark:text-indigo-300"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-indigo-300"
            }`}
          >
            Scelta multipla
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...options, mode: "text", choices: undefined })}
            className={`flex-1 py-3 rounded-xl text-base font-bold transition-all border-2 ${
              mode === "text"
                ? "bg-indigo-100 dark:bg-indigo-900 border-indigo-500 text-indigo-700 dark:text-indigo-300"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-indigo-300"
            }`}
          >
            Testo libero
          </button>
        </div>
      </div>

      {/* Choice options (only in choice mode) */}
      {mode === "choice" && choices && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Opzioni (la risposta corretta e inclusa automaticamente)</label>
          {choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                choice === correctAnswer ? "bg-green-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500"
              }`}>
                {i + 1}
              </div>
              <input
                value={choice}
                onChange={(e) => updateChoice(i, e.target.value)}
                placeholder={`Opzione ${i + 1}`}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-base font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {choices.length > 2 && (
                <button
                  onClick={() => onChange({ ...options, choices: choices.filter((_, idx) => idx !== i) })}
                  className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {choices.length < 6 && (
            <button
              onClick={() => onChange({ ...options, choices: [...choices, ""] })}
              className="flex items-center gap-2 text-base font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="size-4" /> Aggiungi opzione
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 5: Create ConfidenceToggle**

Create `src/components/quiz/confidence-toggle.tsx`:

```tsx
"use client";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function ConfidenceToggle({ enabled, onChange }: Props) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? "translate-x-5" : ""
          }`}
        />
      </div>
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
        Livello di confidenza
      </span>
    </label>
  );
}
```

**Step 6: Update QuestionEditor to include new types**

In `src/components/quiz/question-editor.tsx`:

1. Update `QUESTION_TYPES` array (line 16-22) to add:

```typescript
  { value: "SPOT_ERROR", label: "Trova l'errore", icon: "🔍" },
  { value: "NUMERIC_ESTIMATION", label: "Stima numerica", icon: "🔢" },
  { value: "IMAGE_HOTSPOT", label: "Hotspot immagine", icon: "🎯" },
  { value: "CODE_COMPLETION", label: "Completa il codice", icon: "💻" },
```

2. Update `defaultOptionsForType` function (line 26-39) to add cases:

```typescript
    case "SPOT_ERROR":
      return { lines: ["", ""], errorIndices: [], explanation: undefined };
    case "NUMERIC_ESTIMATION":
      return { correctValue: 0, tolerance: 5, maxRange: 50, unit: undefined };
    case "IMAGE_HOTSPOT":
      return { imageUrl: "", hotspot: { x: 0.5, y: 0.5, radius: 0.1 }, tolerance: 0.05 };
    case "CODE_COMPLETION":
      return { codeLines: ["", ""], blankLineIndex: 0, correctAnswer: "", mode: "text" as const };
```

3. Add imports for the new editors at the top:

```typescript
import { SpotErrorEditor } from "@/components/quiz/spot-error-editor";
import { NumericEstimationEditor } from "@/components/quiz/numeric-estimation-editor";
import { ImageHotspotEditor } from "@/components/quiz/image-hotspot-editor";
import { CodeCompletionEditor } from "@/components/quiz/code-completion-editor";
import { ConfidenceToggle } from "@/components/quiz/confidence-toggle";
```

4. Add new editor sections after the MATCHING editor (after line 194):

```tsx
        {question.type === "SPOT_ERROR" && (
          <SpotErrorEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "NUMERIC_ESTIMATION" && (
          <NumericEstimationEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "IMAGE_HOTSPOT" && (
          <ImageHotspotEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
        {question.type === "CODE_COMPLETION" && (
          <CodeCompletionEditor
            options={question.options as any}
            onChange={(opts) => handleFieldChange("options", opts)}
          />
        )}
```

5. Add ConfidenceToggle in the settings footer row (after the points input, around line 223):

```tsx
        <ConfidenceToggle
          enabled={(question as any).confidenceEnabled ?? false}
          onChange={(enabled) => handleFieldChange("confidenceEnabled" as any, enabled)}
        />
```

**Step 7: Commit**

```bash
git add src/components/quiz/
git commit -m "feat: add editor components for new question types and confidence toggle"
```

---

## Task 8: Player View — New Answer Input Components + Confidence Widget

**Files:**
- Modify: `src/components/live/player-view.tsx`

**Step 1: Add new input components in the AnswerInput switch (after line 488)**

Add new cases in the `AnswerInput` switch:

```typescript
    case "SPOT_ERROR":
      return (
        <SpotErrorInput
          options={options as any}
          onSubmit={onSubmit}
        />
      );
    case "NUMERIC_ESTIMATION":
      return (
        <NumericEstimationInput
          options={options as any}
          onSubmit={onSubmit}
        />
      );
    case "IMAGE_HOTSPOT":
      return (
        <ImageHotspotInput
          options={options as any}
          onSubmit={onSubmit}
        />
      );
    case "CODE_COMPLETION":
      return (
        <CodeCompletionInput
          options={options as any}
          onSubmit={onSubmit}
        />
      );
```

**Step 2: Add SpotErrorInput component (after MatchingInput)**

```tsx
/* ---------- SPOT_ERROR ---------- */

function SpotErrorInput({
  options,
  onSubmit,
}: {
  options: { lines: string[] };
  onSubmit: (value: AnswerValue) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {options.lines.map((line, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
              selected.has(i)
                ? "bg-red-600 text-white ring-2 ring-red-400"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <span className="text-sm font-bold text-white/60 w-6 text-center shrink-0">{i + 1}</span>
            <span className="font-mono text-base">{line}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onSubmit({ selected: [...selected] })}
        disabled={selected.size === 0}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        Conferma ({selected.size} selezionat{selected.size === 1 ? "a" : "e"})
      </button>
    </>
  );
}
```

**Step 3: Add NumericEstimationInput component**

```tsx
/* ---------- NUMERIC_ESTIMATION ---------- */

function NumericEstimationInput({
  options,
  onSubmit,
}: {
  options: { unit?: string };
  onSubmit: (value: AnswerValue) => void;
}) {
  const [val, setVal] = useState("");

  return (
    <div className="flex flex-1 flex-col justify-end gap-4">
      <div className="flex items-center gap-3">
        <input
          type="number"
          inputMode="decimal"
          placeholder="La tua stima..."
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-16 flex-1 bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl px-4 text-2xl font-bold text-center placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
        />
        {options.unit && (
          <span className="text-xl font-semibold text-white/70">{options.unit}</span>
        )}
      </div>
      <button
        onClick={() => onSubmit({ value: Number(val) })}
        disabled={val === "" || isNaN(Number(val))}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
      >
        Invia
      </button>
    </div>
  );
}
```

**Step 4: Add ImageHotspotInput component**

```tsx
/* ---------- IMAGE_HOTSPOT ---------- */

function ImageHotspotInput({
  options,
  onSubmit,
}: {
  options: { imageUrl: string };
  onSubmit: (value: AnswerValue) => void;
}) {
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);

  const handleTap = (e: React.MouseEvent<HTMLImageElement> | React.TouchEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    setTap({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-sm text-gray-400 mb-3">Tocca il punto corretto sull'immagine</p>
        <div className="relative inline-block max-w-full">
          <img
            src={options.imageUrl}
            alt="Domanda"
            className="max-h-64 sm:max-h-80 max-w-full rounded-xl"
            onClick={handleTap}
            onTouchStart={handleTap}
          />
          {tap && (
            <div
              className="absolute w-6 h-6 -ml-3 -mt-3 bg-red-500 rounded-full border-2 border-white shadow-lg pointer-events-none animate-score-pop"
              style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
            />
          )}
        </div>
      </div>
      <button
        onClick={() => tap && onSubmit({ x: tap.x, y: tap.y })}
        disabled={!tap}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        Conferma
      </button>
    </>
  );
}
```

**Step 5: Add CodeCompletionInput component**

```tsx
/* ---------- CODE_COMPLETION ---------- */

function CodeCompletionInput({
  options,
  onSubmit,
}: {
  options: { codeLines: string[]; blankLineIndex: number; mode: "choice" | "text"; choices?: string[] };
  onSubmit: (value: AnswerValue) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="flex flex-1 flex-col">
      {/* Code block */}
      <div className="bg-slate-800 rounded-xl p-3 mb-4 font-mono text-sm overflow-x-auto">
        {options.codeLines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-500 w-6 text-right shrink-0">{i + 1}</span>
            {i === options.blankLineIndex ? (
              <span className="text-amber-400 font-bold">{"??? ←"}</span>
            ) : (
              <span className="text-green-300">{line}</span>
            )}
          </div>
        ))}
      </div>

      {/* Answer input */}
      {options.mode === "choice" && options.choices ? (
        <div className="flex-1 space-y-2">
          {options.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => onSubmit({ selected: i })}
              className="w-full text-left bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl px-4 py-3 text-base font-mono text-white transition-all active:scale-95"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col justify-end gap-3 flex-1">
          <input
            type="text"
            placeholder="Scrivi il codice mancante..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-14 w-full bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl px-4 text-lg font-mono placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
          />
          <button
            onClick={() => onSubmit({ text })}
            disabled={!text.trim()}
            className="h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
          >
            Invia
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 6: Add ConfidenceWidget to the feedback phase**

Add state for confidence tracking. In the PlayerView component, add:

```typescript
const [awaitingConfidence, setAwaitingConfidence] = useState(false);
```

Update the `onAnswerFeedback` handler to check for confidence:

```typescript
    const onAnswerFeedback = (data: FeedbackData & { confidenceEnabled?: boolean }) => {
      setFeedback(data);
      if (data.confidenceEnabled) {
        setAwaitingConfidence(true);
      }
      setPhase("feedback");
    };
```

In the feedback phase rendering, before the existing feedback content, add a confidence step:

```tsx
  if (phase === "feedback" && feedback) {
    if (awaitingConfidence) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-indigo-500 to-purple-700 p-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6">
            Quanto sei sicuro della tua risposta?
          </h2>
          <div className="space-y-3 w-full max-w-xs">
            {[
              { level: 1, label: "Poco sicuro", color: "from-slate-500 to-slate-600" },
              { level: 2, label: "Abbastanza sicuro", color: "from-amber-500 to-yellow-600" },
              { level: 3, label: "Molto sicuro", color: "from-green-500 to-emerald-600" },
            ].map(({ level, label, color }) => (
              <button
                key={level}
                onClick={() => {
                  socket?.emit("submitConfidence", { confidenceLevel: level });
                  setAwaitingConfidence(false);
                }}
                className={`w-full py-4 rounded-2xl bg-gradient-to-r ${color} text-white font-bold text-lg shadow-lg hover:scale-105 active:scale-95 transition-all`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // ... existing feedback rendering ...
  }
```

**Step 7: Commit**

```bash
git add src/components/live/player-view.tsx
git commit -m "feat: add player input components for new question types and confidence"
```

---

## Task 9: Host View — Render New Question Types

**Files:**
- Modify: `src/components/live/host-view.tsx`

**Step 1: Add rendering for new types in the question phase (after TRUE_FALSE block, line 357)**

Add after the TRUE_FALSE section:

```tsx
        {/* SPOT_ERROR display */}
        {q.question.type === "SPOT_ERROR" && (
          <div className="px-6 lg:px-10 pb-6 max-w-3xl mx-auto w-full">
            <div className="bg-slate-800 rounded-2xl p-4 lg:p-6 font-mono text-sm lg:text-base space-y-1">
              {((q.question.options as any).lines as string[]).map((line, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-700/50">
                  <span className="text-slate-500 w-6 text-right shrink-0">{i + 1}</span>
                  <span className="text-green-300">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NUMERIC_ESTIMATION display */}
        {q.question.type === "NUMERIC_ESTIMATION" && (
          <div className="px-6 lg:px-10 pb-6 flex justify-center">
            <div className="bg-slate-800 rounded-2xl px-8 py-6 flex items-center gap-3 border border-slate-700">
              <span className="text-4xl lg:text-5xl">🔢</span>
              <span className="text-xl lg:text-2xl font-semibold text-slate-300">
                Inserisci un valore numerico
                {(q.question.options as any).unit && (
                  <span className="text-slate-400 ml-2">({(q.question.options as any).unit})</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* IMAGE_HOTSPOT display */}
        {q.question.type === "IMAGE_HOTSPOT" && (
          <div className="px-6 lg:px-10 pb-6 flex justify-center">
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
              <img
                src={(q.question.options as any).imageUrl}
                alt="Hotspot"
                className="max-h-64 lg:max-h-96 rounded-xl"
              />
              <p className="text-center text-sm text-slate-400 mt-2">Tocca il punto corretto</p>
            </div>
          </div>
        )}

        {/* CODE_COMPLETION display */}
        {q.question.type === "CODE_COMPLETION" && (
          <div className="px-6 lg:px-10 pb-6 max-w-3xl mx-auto w-full">
            <div className="bg-slate-800 rounded-2xl p-4 lg:p-6 font-mono text-sm lg:text-base space-y-1">
              {((q.question.options as any).codeLines as string[]).map((line, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 rounded-lg">
                  <span className="text-slate-500 w-6 text-right shrink-0">{i + 1}</span>
                  {i === (q.question.options as any).blankLineIndex ? (
                    <span className="text-amber-400 font-bold animate-pulse">{"??? ←"}</span>
                  ) : (
                    <span className="text-green-300">{line}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
```

**Step 2: Commit**

```bash
git add src/components/live/host-view.tsx
git commit -m "feat: add host view rendering for new question types"
```

---

## Task 10: Update Quiz API — Handle confidenceEnabled Field

**Files:**
- Check: `src/app/api/quiz/route.ts` (POST handler)
- Check: `src/app/api/quiz/[id]/route.ts` (PUT handler)

**Step 1: Verify existing API routes pass through confidenceEnabled**

The quiz API uses `questionSchema` from validators, which we already updated to include `confidenceEnabled`. The Prisma create/update calls should pass through the field automatically since they spread the validated question data.

Check the POST and PUT routes. If they map `question.options`, `question.type`, etc. individually, add `confidenceEnabled` to the mapping. If they spread the whole question object, no change needed.

**Step 2: If changes needed, update and commit**

```bash
git add src/app/api/quiz/
git commit -m "feat: pass confidenceEnabled through quiz API"
```

---

## Task 11: Build Verification + Manual Test

**Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds without errors.

**Step 2: Run all unit tests**

Run: `npm run test:run`
Expected: All tests pass.

**Step 3: Manual smoke test**

Run: `npm run dev:custom`

1. Login as docente@scuola.it
2. Create a new quiz with one question of each new type
3. Start a session
4. Join from another browser tab as a student
5. Play through each question type
6. Verify scoring and results display correctly
7. Test confidence level on a question with it enabled

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete new question types implementation"
```

---

## Summary of all files changed

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Modify: enum + 2 fields |
| `src/types/index.ts` | Modify: new types + events |
| `src/lib/scoring.ts` | Modify: new scoring logic |
| `src/lib/__tests__/scoring.test.ts` | Create: unit tests |
| `src/lib/validators/quiz.ts` | Modify: new Zod schemas |
| `src/lib/validators/qlz.ts` | Modify: new type support |
| `src/lib/socket/server.ts` | Modify: sanitize, score, confidence |
| `src/components/quiz/question-editor.tsx` | Modify: new editors + confidence toggle |
| `src/components/quiz/spot-error-editor.tsx` | Create |
| `src/components/quiz/numeric-estimation-editor.tsx` | Create |
| `src/components/quiz/image-hotspot-editor.tsx` | Create |
| `src/components/quiz/code-completion-editor.tsx` | Create |
| `src/components/quiz/confidence-toggle.tsx` | Create |
| `src/components/live/player-view.tsx` | Modify: 4 new inputs + confidence |
| `src/components/live/host-view.tsx` | Modify: 4 new renderers |
| `src/app/api/quiz/route.ts` | Check/Modify: confidenceEnabled |
| `src/app/api/quiz/[id]/route.ts` | Check/Modify: confidenceEnabled |
