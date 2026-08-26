-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "planUpdatedAt" TIMESTAMP(3);
