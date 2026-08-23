// lib/server/subscriptions/credentials.ts — DB-override-with-env-fallback
// Chariow credentials, encrypted at rest. Pins down the exact 2026-08-22
// incident this exists to prevent: a plaintext secret never leaves this
// module except as a masked last-4 hint or (for the webhook secret only)
// baked into a server-composed URL — never a raw field a human could
// mis-copy into the wrong place.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKey, encrypt, decrypt } from '@/lib/server/crypto';
import {
  getChariowCredentials,
  getChariowCredentialsStatus,
  saveChariowCredentials,
  clearChariowCredentials,
} from './credentials';

const TEST_KEY = generateKey();
const ENV_KEYS = [
  'ENCRYPTION_KEY',
  'CHARIOW_API_KEY',
  'CHARIOW_WEBHOOK_SECRET',
  'CHARIOW_PRODUCT_ID_PRO',
  'CHARIOW_PRODUCT_ID_BUSINESS',
  'APP_URL',
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('getChariowCredentials', () => {
  it('falls back to env vars when no DB row exists', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);
    process.env.CHARIOW_API_KEY = 'sk_env';
    process.env.CHARIOW_WEBHOOK_SECRET = 'whsec_env';
    process.env.CHARIOW_PRODUCT_ID_PRO = 'prd_pro';
    process.env.CHARIOW_PRODUCT_ID_BUSINESS = 'prd_biz';

    const creds = await getChariowCredentials();
    expect(creds).toEqual({
      apiKey: 'sk_env',
      webhookSecret: 'whsec_env',
      productIdPro: 'prd_pro',
      productIdBusiness: 'prd_biz',
      isOverride: false,
    });
  });

  it('decrypts and prefers the DB row over env vars when both exist', async () => {
    process.env.CHARIOW_API_KEY = 'sk_env_should_be_ignored';
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce({
      id: 'ppc_1',
      provider: 'CHARIOW',
      encryptedApiKey: encrypt('sk_db_real', TEST_KEY),
      encryptedWebhookSecret: encrypt('whsec_db_real', TEST_KEY),
      productIdPro: 'prd_pro_db',
      productIdBusiness: 'prd_biz_db',
      updatedAt: new Date('2026-08-22T00:00:00Z'),
      updatedByAdminId: 'admin_1',
    } as never);

    const creds = await getChariowCredentials();
    expect(creds).toEqual({
      apiKey: 'sk_db_real',
      webhookSecret: 'whsec_db_real',
      productIdPro: 'prd_pro_db',
      productIdBusiness: 'prd_biz_db',
      isOverride: true,
    });
  });

  it('degrades to null (not a throw) when decryption fails — e.g. ENCRYPTION_KEY rotated', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce({
      id: 'ppc_1',
      provider: 'CHARIOW',
      encryptedApiKey: encrypt('sk_db_real', TEST_KEY),
      encryptedWebhookSecret: null,
      productIdPro: null,
      productIdBusiness: null,
      updatedAt: new Date(),
      updatedByAdminId: null,
    } as never);
    process.env.ENCRYPTION_KEY = generateKey(); // a DIFFERENT key than what encrypted the row

    const creds = await getChariowCredentials();
    expect(creds.apiKey).toBeNull();
    expect(creds.isOverride).toBe(true); // still an override — just an undecryptable field
  });

  it('falls back to env vars when a DB row exists but ENCRYPTION_KEY is unset', async () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.CHARIOW_API_KEY = 'sk_env_fallback';
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce({
      id: 'ppc_1',
      provider: 'CHARIOW',
      encryptedApiKey: 'some-ciphertext',
      encryptedWebhookSecret: null,
      productIdPro: null,
      productIdBusiness: null,
      updatedAt: new Date(),
      updatedByAdminId: null,
    } as never);

    const creds = await getChariowCredentials();
    expect(creds).toMatchObject({ apiKey: 'sk_env_fallback', isOverride: false });
  });
});

describe('getChariowCredentialsStatus', () => {
  it('masks secrets to a last-4 hint, never the plaintext', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);
    process.env.CHARIOW_API_KEY = 'sk_ugjuxho5_011d4906a5522b7c36d3578037e2200a';
    process.env.CHARIOW_WEBHOOK_SECRET = 'whsecret';
    process.env.CHARIOW_PRODUCT_ID_PRO = 'prd_pro';
    process.env.CHARIOW_PRODUCT_ID_BUSINESS = 'prd_biz';

    const status = await getChariowCredentialsStatus();
    expect(status.apiKeyMasked).toBe('····200a');
    expect(status.webhookSecretMasked).toBe('····cret');
    expect(JSON.stringify(status)).not.toContain('sk_ugjuxho5');
    expect(status.configured).toBe(true);
  });

  it('builds a correctly URL-encoded webhookUrl — the exact 2026-08-22 incident this closes', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);
    process.env.APP_URL = 'https://mekasoft.app';
    process.env.CHARIOW_WEBHOOK_SECRET = '2P7H4WBKqYLxIRhjjcXXibR1PTtip+SLAwQ1j7dVU8U=';

    const status = await getChariowCredentialsStatus();
    expect(status.webhookUrl).toBe(
      'https://mekasoft.app/api/webhooks/subscriptions/chariow?secret=2P7H4WBKqYLxIRhjjcXXibR1PTtip%2BSLAwQ1j7dVU8U%3D',
    );
  });

  it('webhookUrl is null when no webhook secret is configured at all', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);
    const status = await getChariowCredentialsStatus();
    expect(status.webhookUrl).toBeNull();
    expect(status.configured).toBe(false);
  });
});

describe('saveChariowCredentials', () => {
  it('encrypts and upserts a brand-new row', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);
    prismaMock.paymentProviderCredential.upsert.mockResolvedValueOnce({} as never);

    await saveChariowCredentials({
      apiKey: 'sk_new',
      webhookSecret: 'whsec_new',
      productIdPro: 'prd_pro',
      productIdBusiness: 'prd_biz',
      updatedByAdminId: 'admin_1',
    });

    expect(prismaMock.paymentProviderCredential.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.paymentProviderCredential.upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ provider: 'CHARIOW' });
    expect(call.create.productIdPro).toBe('prd_pro');
    expect(call.create.updatedByAdminId).toBe('admin_1');
    // Ciphertext, not plaintext, is what actually gets persisted.
    expect(call.create.encryptedApiKey).not.toBe('sk_new');
    expect(typeof call.create.encryptedApiKey).toBe('string');
  });

  it('leaves fields untouched when omitted (undefined) — the "blank means keep it" password-field convention', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce({
      id: 'ppc_1',
      provider: 'CHARIOW',
      encryptedApiKey: encrypt('sk_existing', TEST_KEY),
      encryptedWebhookSecret: encrypt('whsec_existing', TEST_KEY),
      productIdPro: 'prd_pro_existing',
      productIdBusiness: 'prd_biz_existing',
      updatedAt: new Date(),
      updatedByAdminId: 'admin_0',
    } as never);
    prismaMock.paymentProviderCredential.upsert.mockResolvedValueOnce({} as never);

    // Only the webhook secret is being rotated — everything else omitted.
    await saveChariowCredentials({ webhookSecret: 'whsec_rotated', updatedByAdminId: 'admin_2' });

    const call = prismaMock.paymentProviderCredential.upsert.mock.calls[0]![0];
    // The untouched API key ciphertext is carried through byte-for-byte
    // (not re-encrypted — a fresh IV would make it a different string even
    // for the same plaintext, which is why this decrypts to compare
    // instead of comparing ciphertext directly).
    expect(decrypt(call.update.encryptedApiKey as string, TEST_KEY)).toBe('sk_existing');
    expect(decrypt(call.update.encryptedWebhookSecret as string, TEST_KEY)).toBe('whsec_rotated');
    expect(call.update.productIdPro).toBe('prd_pro_existing');
    expect(call.update.productIdBusiness).toBe('prd_biz_existing');
  });

  it('clears a field when explicitly set to an empty string', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce({
      id: 'ppc_1',
      provider: 'CHARIOW',
      encryptedApiKey: encrypt('sk_existing', TEST_KEY),
      encryptedWebhookSecret: null,
      productIdPro: null,
      productIdBusiness: null,
      updatedAt: new Date(),
      updatedByAdminId: null,
    } as never);
    prismaMock.paymentProviderCredential.upsert.mockResolvedValueOnce({} as never);

    await saveChariowCredentials({ apiKey: '', updatedByAdminId: 'admin_1' });

    const call = prismaMock.paymentProviderCredential.upsert.mock.calls[0]![0];
    expect(call.update.encryptedApiKey).toBeNull();
  });

  it('throws instead of silently storing plaintext when ENCRYPTION_KEY is unset', async () => {
    delete process.env.ENCRYPTION_KEY;
    await expect(
      saveChariowCredentials({ apiKey: 'sk_x', updatedByAdminId: 'admin_1' }),
    ).rejects.toThrow(/ENCRYPTION_KEY/);
    expect(prismaMock.paymentProviderCredential.upsert).not.toHaveBeenCalled();
  });
});

describe('clearChariowCredentials', () => {
  it('deletes the override row, reverting to env-var fallback', async () => {
    prismaMock.paymentProviderCredential.deleteMany.mockResolvedValueOnce({ count: 1 } as never);
    await clearChariowCredentials();
    expect(prismaMock.paymentProviderCredential.deleteMany).toHaveBeenCalledWith({
      where: { provider: 'CHARIOW' },
    });
  });
});
