import type { QuestionType } from "@prisma/client";

// Question option schemas per type
export type MultipleChoiceOptions = {
  choices: { text: string; isCorrect: boolean }[];
};

export type TrueFalseOptions = {
  correct: boolean;
};

export type OpenAnswerOptions = {
  acceptedAnswers: string[];
};

export type OrderingOptions = {
  items: string[];
  correctOrder: number[];
};

export type MatchingOptions = {
  pairs: { left: string; right: string }[];
};

export type QuestionOptions =
  | MultipleChoiceOptions
  | TrueFalseOptions
  | OpenAnswerOptions
  | OrderingOptions
  | MatchingOptions;

// Answer value schemas per type
export type MultipleChoiceValue = { selected: number[] };
export type TrueFalseValue = { selected: boolean };
export type OpenAnswerValue = { text: string };
export type OrderingValue = { order: number[] };
export type MatchingValue = { matches: [number, number][] };

export type AnswerValue =
  | MultipleChoiceValue
  | TrueFalseValue
  | OpenAnswerValue
  | OrderingValue
  | MatchingValue;

// Socket.io events
export interface ServerToClientEvents {
  playerJoined: (data: { playerName: string; playerCount: number; playerAvatar?: string }) => void;
  playerLeft: (data: { playerName: string; playerCount: number }) => void;
  questionStart: (data: {
    questionIndex: number;
    totalQuestions: number;
    question: {
      text: string;
      type: QuestionType;
      options: QuestionOptions;
      timeLimit: number;
      points: number;
      mediaUrl: string | null;
    };
  }) => void;
  answerCount: (data: { count: number; total: number }) => void;
  questionResult: (data: {
    correctAnswer: QuestionOptions;
    distribution: Record<string, number>;
    leaderboard: { playerName: string; score: number; delta: number; playerAvatar?: string }[];
  }) => void;
  answerFeedback: (data: {
    isCorrect: boolean;
    score: number;
    totalScore: number;
    position: number;
    classCorrectPercent: number;
  }) => void;
  gameOver: (data: {
    podium: { playerName: string; score: number; position: number; playerAvatar?: string }[];
    fullResults: { playerName: string; score: number; playerAvatar?: string }[];
  }) => void;
  sessionError: (data: { message: string }) => void;
  gameState: (data: { status: string; currentQuestion?: number }) => void;
}

export interface ClientToServerEvents {
  joinSession: (data: { pin: string; playerName: string; playerEmail?: string; playerAvatar?: string }) => void;
  startGame: () => void;
  nextQuestion: () => void;
  submitAnswer: (data: { value: AnswerValue; responseTimeMs: number }) => void;
  showResults: () => void;
  endGame: () => void;
}
