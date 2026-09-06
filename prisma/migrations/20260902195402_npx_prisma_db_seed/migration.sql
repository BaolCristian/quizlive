-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';
