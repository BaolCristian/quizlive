-- CreateEnum
CREATE TYPE "TentativoStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';

-- CreateTable
CREATE TABLE "Esercizio" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "authorId" TEXT,
    "yearLevel" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "tags" TEXT[],
    "difficulty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Esercizio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsercizioVersione" (
    "id" TEXT NOT NULL,
    "esercizioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsercizioVersione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tentativo" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "esercizioVersioneId" TEXT NOT NULL,
    "compitoId" TEXT,
    "seed" TEXT NOT NULL,
    "state" JSONB,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TentativoStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tentativo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Esercizio_yearLevel_topic_idx" ON "Esercizio"("yearLevel", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "EsercizioVersione_esercizioId_version_key" ON "EsercizioVersione"("esercizioId", "version");

-- CreateIndex
CREATE INDEX "Tentativo_studentId_esercizioVersioneId_idx" ON "Tentativo"("studentId", "esercizioVersioneId");

-- CreateIndex
CREATE INDEX "Tentativo_lastActivityAt_idx" ON "Tentativo"("lastActivityAt");

-- AddForeignKey
ALTER TABLE "EsercizioVersione" ADD CONSTRAINT "EsercizioVersione_esercizioId_fkey" FOREIGN KEY ("esercizioId") REFERENCES "Esercizio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tentativo" ADD CONSTRAINT "Tentativo_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tentativo" ADD CONSTRAINT "Tentativo_esercizioVersioneId_fkey" FOREIGN KEY ("esercizioVersioneId") REFERENCES "EsercizioVersione"("id") ON DELETE CASCADE ON UPDATE CASCADE;
