import { describe, it, expect } from "vitest";
import { calculateScore, checkAnswer } from "@/lib/scoring";

describe("calculateScore", () => {
  it("gives max score for instant correct answer", () => {
    expect(calculateScore({ isCorrect: true, responseTimeMs: 0, timeLimit: 20, maxPoints: 1000 })).toBe(1000);
  });

  it("gives 0 for incorrect answer", () => {
    expect(calculateScore({ isCorrect: false, responseTimeMs: 5000, timeLimit: 20, maxPoints: 1000 })).toBe(0);
  });

  it("gives reduced score for slower answer", () => {
    const score = calculateScore({ isCorrect: true, responseTimeMs: 10000, timeLimit: 20, maxPoints: 1000 });
    expect(score).toBe(750);
  });

  it("gives minimum 50% for correct answer at time limit", () => {
    const score = calculateScore({ isCorrect: true, responseTimeMs: 20000, timeLimit: 20, maxPoints: 1000 });
    expect(score).toBe(500);
  });

  it("clamps score at 50% even if over time limit", () => {
    const score = calculateScore({ isCorrect: true, responseTimeMs: 30000, timeLimit: 20, maxPoints: 1000 });
    expect(score).toBe(500);
  });
});

describe("checkAnswer", () => {
  it("checks multiple choice - single correct", () => {
    const options = { choices: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: true }] };
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [1] })).toBe(true);
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [0] })).toBe(false);
  });

  it("checks multiple choice - multiple correct", () => {
    const options = { choices: [
      { text: "A", isCorrect: true },
      { text: "B", isCorrect: false },
      { text: "C", isCorrect: true },
    ] };
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [0, 2] })).toBe(true);
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [0] })).toBe(false);
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [0, 1, 2] })).toBe(false);
  });

  it("checks true/false correctly", () => {
    expect(checkAnswer("TRUE_FALSE", { correct: true }, { selected: true })).toBe(true);
    expect(checkAnswer("TRUE_FALSE", { correct: true }, { selected: false })).toBe(false);
    expect(checkAnswer("TRUE_FALSE", { correct: false }, { selected: false })).toBe(true);
  });

  it("checks open answer case-insensitive and trimmed", () => {
    const options = { acceptedAnswers: ["Roma", "rome"] };
    expect(checkAnswer("OPEN_ANSWER", options, { text: "roma" })).toBe(true);
    expect(checkAnswer("OPEN_ANSWER", options, { text: "  Roma  " })).toBe(true);
    expect(checkAnswer("OPEN_ANSWER", options, { text: "Milano" })).toBe(false);
  });

  it("checks ordering correctly", () => {
    const options = { items: ["A", "B", "C"], correctOrder: [2, 0, 1] };
    expect(checkAnswer("ORDERING", options, { order: [2, 0, 1] })).toBe(true);
    expect(checkAnswer("ORDERING", options, { order: [0, 1, 2] })).toBe(false);
  });

  it("checks matching correctly", () => {
    const options = { pairs: [{ left: "IT", right: "Italia" }, { left: "FR", right: "Francia" }] };
    expect(checkAnswer("MATCHING", options, { matches: [[0, 0], [1, 1]] })).toBe(true);
    expect(checkAnswer("MATCHING", options, { matches: [[0, 1], [1, 0]] })).toBe(false);
  });
});
