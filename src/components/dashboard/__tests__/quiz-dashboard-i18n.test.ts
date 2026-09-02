/**
 * Ogni chiave t("...") usata da quiz-dashboard.tsx nel namespace "quiz" deve
 * esistere in entrambe le lingue: una chiave mancante produce MISSING_MESSAGE
 * a runtime (successo nel marzo 2026 con publicQuiz/privateQuiz).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import it_ from "@/messages/it.json";
import en from "@/messages/en.json";

const source = readFileSync(
  path.resolve(__dirname, "../quiz-dashboard.tsx"),
  "utf8",
);
const usedKeys = [...new Set([...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))];

describe("quiz-dashboard translations", () => {
  it("uses at least one key (regex sanity check)", () => {
    expect(usedKeys.length).toBeGreaterThan(10);
  });

  it.each([
    ["it", it_ as Record<string, Record<string, unknown>>],
    ["en", en as Record<string, Record<string, unknown>>],
  ])("every quiz.* key exists in %s.json", (_locale, messages) => {
    const quiz = messages.quiz;
    const missing = usedKeys.filter((k) => !(k.split(".")[0] in quiz));
    expect(missing).toEqual([]);
  });
});
