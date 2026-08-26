-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'actif',
    "firstName" TEXT,
    "lastName" TEXT,
    "profession" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "idNumber" TEXT,
    "companyName" TEXT,
    "taxId" TEXT,
    "sector" TEXT,
    "contactName" TEXT,
    "contactRole" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "street" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'Sénégal',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "registration" TEXT NOT NULL,
    "mileage" INTEGER,
    "fuelType" TEXT,
    "vin" TEXT,
    "engineNumber" TEXT,
    "color" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Actif',
    "lastServiceAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Client_organizationId_createdAt_idx" ON "Client"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_status_idx" ON "Vehicle"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_clientId_idx" ON "Vehicle"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_registration_key" ON "Vehicle"("organizationId", "registration");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
