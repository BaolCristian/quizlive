import { describe, it, expect } from "vitest";
import { quizSchema, questionSchema } from "@/lib/validators/quiz";
import { joinSessionSchema } from "@/lib/validators/session";

describe("questionSchema", () => {
  it("validates a multiple choice question", () => {
    const result = questionSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      text: "Capitale della Francia?",
      timeLimit: 20,
      points: 1000,
      order: 0,
      options: {
        choices: [
          { text: "Londra", isCorrect: false },
          { text: "Parigi", isCorrect: true },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates a true/false question", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "Il sole e una stella",
      timeLimit: 15,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(true);
  });

  it("validates an open answer question", () => {
    const result = questionSchema.safeParse({
      type: "OPEN_ANSWER",
      text: "Capitale Italia?",
      timeLimit: 30,
      points: 1000,
      order: 0,
      options: { acceptedAnswers: ["Roma", "rome"] },
    });
    expect(result.success).toBe(true);
  });

  it("validates an ordering question", () => {
    const result = questionSchema.safeParse({
      type: "ORDERING",
      text: "Ordina i pianeti",
      timeLimit: 30,
      points: 1000,
      order: 0,
      options: { items: ["Marte", "Venere", "Terra"], correctOrder: [1, 2, 0] },
    });
    expect(result.success).toBe(true);
  });

  it("validates a matching question", () => {
    const result = questionSchema.safeParse({
      type: "MATCHING",
      text: "Abbina paesi e capitali",
      timeLimit: 30,
      points: 1000,
      order: 0,
      options: { pairs: [{ left: "Italia", right: "Roma" }, { left: "Francia", right: "Parigi" }] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a question with empty text", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "",
      timeLimit: 20,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeLimit below 5", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "Test",
      timeLimit: 2,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(false);
  });
});

describe("quizSchema", () => {
  it("validates a complete quiz", () => {
    const result = quizSchema.safeParse({
      title: "Test Quiz",
      questions: [
        {
          type: "TRUE_FALSE",
          text: "Il sole e una stella",
          timeLimit: 15,
          points: 1000,
          order: 0,
          options: { correct: true },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quiz without questions", () => {
    const result = quizSchema.safeParse({
      title: "Empty Quiz",
      questions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a quiz without title", () => {
    const result = quizSchema.safeParse({
      title: "",
      questions: [{ type: "TRUE_FALSE", text: "Q", timeLimit: 10, points: 1000, order: 0, options: { correct: true } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("joinSessionSchema", () => {
  it("validates a valid join request", () => {
    const result = joinSessionSchema.safeParse({
      pin: "482731",
      playerName: "Marco",
    });
    expect(result.success).toBe(true);
  });

  it("validates with optional email", () => {
    const result = joinSessionSchema.safeParse({
      pin: "123456",
      playerName: "Giulia",
      playerEmail: "giulia@scuola.it",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid PIN (too short)", () => {
    const result = joinSessionSchema.safeParse({
      pin: "123",
      playerName: "Marco",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric PIN", () => {
    const result = joinSessionSchema.safeParse({
      pin: "abcdef",
      playerName: "Marco",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty player name", () => {
    const result = joinSessionSchema.safeParse({
      pin: "123456",
      playerName: "",
    });
    expect(result.success).toBe(false);
  });
});
