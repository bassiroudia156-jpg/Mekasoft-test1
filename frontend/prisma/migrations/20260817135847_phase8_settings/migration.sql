-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Sénégal',
ADD COLUMN     "hoursSaturday" TEXT DEFAULT '08h00 - 14h00',
ADD COLUMN     "hoursSunday" TEXT DEFAULT 'Fermé',
ADD COLUMN     "hoursWeekday" TEXT DEFAULT '07h00 - 18h00',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "siren" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;
