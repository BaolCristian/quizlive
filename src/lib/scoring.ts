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
    default:
      return false;
  }
}
