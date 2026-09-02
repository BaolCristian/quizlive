-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'STUDENT';

-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "classGroups" JSONB;
