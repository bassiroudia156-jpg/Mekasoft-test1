-- CreateTable
CREATE TABLE "PaymentProviderCredential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "encryptedWebhookSecret" TEXT,
    "productIdPro" TEXT,
    "productIdBusiness" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "PaymentProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderCredential_provider_key" ON "PaymentProviderCredential"("provider");

-- CreateIndex
CREATE INDEX "PaymentProviderCredential_provider_idx" ON "PaymentProviderCredential"("provider");
