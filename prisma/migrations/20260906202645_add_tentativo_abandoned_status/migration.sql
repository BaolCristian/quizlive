-- AlterEnum
-- Migrazione additiva: aggiunge solo questo valore, non tocca IN_PROGRESS né
-- COMPLETED. Il secondo blocco che `prisma migrate dev --create-only`
-- proponeva qui (un `ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET
-- DEFAULT ...`) è una riasserzione del default già applicato dalla
-- migrazione precedente (drift spurio del diffing di Prisma sul
-- `dbgenerated` di quella colonna, estraneo a questo cambiamento): rimosso
-- perché non è nostro da toccare qui.
ALTER TYPE "TentativoStatus" ADD VALUE 'ABANDONED';
