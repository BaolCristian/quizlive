import { z } from "zod";

export const joinSessionSchema = z.object({
  pin: z.string().length(6).regex(/^\d{6}$/),
  playerName: z.string().min(1).max(30),
  playerEmail: z.string().email().optional(),
});

export const submitAnswerSchema = z.object({
  value: z.record(z.string(), z.unknown()),
  responseTimeMs: z.number().int().min(0),
});
