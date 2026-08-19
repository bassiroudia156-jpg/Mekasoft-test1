-- CreateTable
CREATE TABLE "AnonymousSubscriptionIntent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "atelierName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" TIMESTAMP(3),

    CONSTRAINT "AnonymousSubscriptionIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnonymousSubscriptionIntent_email_idx" ON "AnonymousSubscriptionIntent"("email");

-- CreateIndex
CREATE INDEX "AnonymousSubscriptionIntent_status_idx" ON "AnonymousSubscriptionIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousSubscriptionIntent_provider_providerRef_key" ON "AnonymousSubscriptionIntent"("provider", "providerRef");
