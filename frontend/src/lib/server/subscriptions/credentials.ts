// Admin-editable, encrypted Chariow credentials (2026-08-22). Mirrors
// lib/server/plans/pricing.ts's exact override-with-env-fallback shape: a
// PaymentProviderCredential row wins over the matching env var when
// present, so a SUPERADMIN can set/rotate Chariow's API key, webhook
// secret, and product IDs from /admin/integrations without a redeploy.
//
// Why Chariow specifically (not Stripe/Moneroo too): Chariow's webhook
// auth is a shared secret placed directly in the callback URL (no HMAC —
// see chariow.ts's own file comment), so a human pasting the wrong value
// into that URL is a real, already-happened failure mode ("Your pulse
// does not respond", 2026-08-22 — the API key got pasted where the
// webhook secret belonged). Stripe/Moneroo verify via header HMAC and
// don't share that specific risk, so they stay on env vars for now.
//
// Secrets are ciphertext ONLY at rest (lib/server/crypto.ts's AES-256-GCM,
// keyed by ENCRYPTION_KEY) — the plaintext never touches the database and
// is never returned to a client; only a masked last-4 hint is.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { decrypt, encrypt } from '@/lib/server/crypto';
import { createLogger } from '@/lib/server/logger';

type Db = Pick<PrismaClient, 'paymentProviderCredential'> | Prisma.TransactionClient;

const log = createLogger();
const PROVIDER = 'CHARIOW';

export interface ChariowCredentials {
  apiKey: string | null;
  webhookSecret: string | null;
  productIdPro: string | null;
  productIdBusiness: string | null;
  /** true when this came from the DB override, false when it's the env-var fallback. */
  isOverride: boolean;
}

export interface ChariowCredentialsStatus {
  configured: boolean;
  isOverride: boolean;
  apiKeyMasked: string | null;
  webhookSecretMasked: string | null;
  productIdPro: string | null;
  productIdBusiness: string | null;
  /** null when webhookSecret is unset — nothing valid to build a URL from. */
  webhookUrl: string | null;
}

function encryptionKey(): string | null {
  return process.env.ENCRYPTION_KEY || null;
}

/** Last 4 chars only, e.g. "sk_live_…e2200a" → "…2200a" is NOT how this
 * works — deliberately just "····2200a" (no prefix leaked either), so
 * two different keys sharing a common human-chosen prefix can't be
 * confused for the same key by their masked display. */
function mask(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `····${tail}`;
}

/** Decrypts, degrading to null instead of throwing — a corrupted row or a
 * rotated ENCRYPTION_KEY must never crash a checkout/webhook, just fall
 * through as "not configured" (the route/provider layer already handles
 * that as a 503, same as an unset env var). */
function safeDecrypt(ciphertext: string | null, key: string): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext, key);
  } catch (err) {
    log.warn('chariow credentials: decrypt failed — treating as unset', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** The live, decrypted credentials — used by chariow.ts's provider/webhook
 * code paths. Never log or return this value's contents to a client. */
export async function getChariowCredentials(): Promise<ChariowCredentials> {
  const row = await prisma.paymentProviderCredential.findUnique({ where: { provider: PROVIDER } });
  const key = encryptionKey();

  if (row && key) {
    return {
      apiKey: safeDecrypt(row.encryptedApiKey, key),
      webhookSecret: safeDecrypt(row.encryptedWebhookSecret, key),
      productIdPro: row.productIdPro,
      productIdBusiness: row.productIdBusiness,
      isOverride: true,
    };
  }

  return {
    apiKey: process.env.CHARIOW_API_KEY || null,
    webhookSecret: process.env.CHARIOW_WEBHOOK_SECRET || null,
    productIdPro: process.env.CHARIOW_PRODUCT_ID_PRO || null,
    productIdBusiness: process.env.CHARIOW_PRODUCT_ID_BUSINESS || null,
    isOverride: false,
  };
}

/** Admin-facing status — masked values + the exact ready-to-copy webhook
 * URL, never a plaintext secret. Used by GET /api/admin/integrations and
 * the payment-credentials editor. */
export async function getChariowCredentialsStatus(): Promise<ChariowCredentialsStatus> {
  const creds = await getChariowCredentials();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return {
    configured: !!(
      creds.apiKey &&
      creds.webhookSecret &&
      creds.productIdPro &&
      creds.productIdBusiness
    ),
    isOverride: creds.isOverride,
    apiKeyMasked: mask(creds.apiKey),
    webhookSecretMasked: mask(creds.webhookSecret),
    productIdPro: creds.productIdPro,
    productIdBusiness: creds.productIdBusiness,
    webhookUrl: creds.webhookSecret
      ? `${appUrl}/api/webhooks/subscriptions/chariow?secret=${encodeURIComponent(creds.webhookSecret)}`
      : null,
  };
}

export interface SaveChariowCredentialsInput {
  /** undefined = leave the stored value untouched; '' or null = clear it
   * (falls back to the env var again); non-empty string = encrypt + store. */
  apiKey?: string | null | undefined;
  webhookSecret?: string | null | undefined;
  productIdPro?: string | null | undefined;
  productIdBusiness?: string | null | undefined;
  updatedByAdminId: string;
}

export interface SaveChariowCredentialsResult {
  /** Which fields actually had a real (masked) value before this write —
   * for the caller's audit-log metadata; never the plaintext. */
  before: { apiKeySet: boolean; webhookSecretSet: boolean };
  after: { apiKeySet: boolean; webhookSecretSet: boolean };
}

/** Upserts only the fields actually provided — mirrors a password field's
 * "leave blank to keep the current value" convention, since the plaintext
 * is never sent back to the client to prefill a form with. Accepts an
 * optional transaction client so the caller (the admin route) can wrap
 * this write and its logAdminAction call atomically, same as every other
 * admin mutation in this codebase. */
export async function saveChariowCredentials(
  input: SaveChariowCredentialsInput,
  db: Db = prisma,
): Promise<SaveChariowCredentialsResult> {
  const key = encryptionKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not configured — cannot store credentials at rest.');
  }

  const existing = await db.paymentProviderCredential.findUnique({ where: { provider: PROVIDER } });

  const nextEncryptedApiKey =
    input.apiKey === undefined
      ? (existing?.encryptedApiKey ?? null)
      : input.apiKey
        ? encrypt(input.apiKey, key)
        : null;
  const nextEncryptedWebhookSecret =
    input.webhookSecret === undefined
      ? (existing?.encryptedWebhookSecret ?? null)
      : input.webhookSecret
        ? encrypt(input.webhookSecret, key)
        : null;
  const nextProductIdPro =
    input.productIdPro === undefined
      ? (existing?.productIdPro ?? null)
      : input.productIdPro || null;
  const nextProductIdBusiness =
    input.productIdBusiness === undefined
      ? (existing?.productIdBusiness ?? null)
      : input.productIdBusiness || null;

  await db.paymentProviderCredential.upsert({
    where: { provider: PROVIDER },
    create: {
      provider: PROVIDER,
      encryptedApiKey: nextEncryptedApiKey,
      encryptedWebhookSecret: nextEncryptedWebhookSecret,
      productIdPro: nextProductIdPro,
      productIdBusiness: nextProductIdBusiness,
      updatedByAdminId: input.updatedByAdminId,
    },
    update: {
      encryptedApiKey: nextEncryptedApiKey,
      encryptedWebhookSecret: nextEncryptedWebhookSecret,
      productIdPro: nextProductIdPro,
      productIdBusiness: nextProductIdBusiness,
      updatedByAdminId: input.updatedByAdminId,
    },
  });

  return {
    before: {
      apiKeySet: !!existing?.encryptedApiKey,
      webhookSecretSet: !!existing?.encryptedWebhookSecret,
    },
    after: {
      apiKeySet: !!nextEncryptedApiKey,
      webhookSecretSet: !!nextEncryptedWebhookSecret,
    },
  };
}

/** Reverts fully to env-var-only config (deletes the DB override row). */
export async function clearChariowCredentials(db: Db = prisma): Promise<void> {
  await db.paymentProviderCredential.deleteMany({ where: { provider: PROVIDER } });
}
