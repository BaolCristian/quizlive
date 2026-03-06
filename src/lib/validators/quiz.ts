import { z } from "zod";

const multipleChoiceOptionsSchema = z.object({
  choices: z.array(z.object({
    text: z.string().min(1),
    isCorrect: z.boolean(),
  })).min(2).max(6),
});

const trueFalseOptionsSchema = z.object({
  correct: z.boolean(),
});

const openAnswerOptionsSchema = z.object({
  acceptedAnswers: z.array(z.string().min(1)).min(1),
});

const orderingOptionsSchema = z.object({
  items: z.array(z.string().min(1)).min(2),
  correctOrder: z.array(z.number()),
});

const matchingOptionsSchema = z.object({
  pairs: z.array(z.object({
    left: z.string().min(1),
    right: z.string().min(1),
  })).min(2),
});

export const questionSchema = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING"]),
  text: z.string().min(1).max(500),
  mediaUrl: z.string().url().nullable().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
  order: z.number().int().min(0),
  options: z.union([
    multipleChoiceOptionsSchema,
    trueFalseOptionsSchema,
    openAnswerOptionsSchema,
    orderingOptionsSchema,
    matchingOptionsSchema,
  ]),
});

export const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  questions: z.array(questionSchema).min(1),
});

export const updateQuizSchema = quizSchema.partial();

export type QuizInput = z.infer<typeof quizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
