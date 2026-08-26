// GET/PATCH/DELETE /api/admin/payment-credentials — SUPERADMIN-only Chariow
// credentials editor. GET is masked-only; PATCH/DELETE are audited.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { generateKey } from '@/lib/server/crypto';
import { GET, PATCH, DELETE } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const superadminUser = seedSuperadmin({ id: 'superadmin_1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadminUser.id, email: superadminUser.email },
  admin: { id: superadminUser.id, email: superadminUser.email, role: 'SUPERADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/payment-credentials', { method: 'GET' });
}
function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/payment-credentials', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
function makeDelete(): NextRequest {
  return new NextRequest('http://test/api/admin/payment-credentials', { method: 'DELETE' });
}

const originalEncryptionKey = process.env.ENCRYPTION_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
  process.env.ENCRYPTION_KEY = generateKey();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalEncryptionKey;
});

describe('GET /api/admin/payment-credentials', () => {
  it('returns masked status, no plaintext', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chariow: { configured: boolean } };
    expect(body.chariow.configured).toBe(false);
  });

  it('rejects a non-SUPERADMIN caller without touching the DB', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.paymentProviderCredential.findUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/payment-credentials', () => {
  it('saves the provided fields and writes an audited payment_credentials.update action', async () => {
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValue(null);
    prismaMock.paymentProviderCredential.upsert.mockResolvedValueOnce({} as never);

    const res = await PATCH(
      makePatch({ apiKey: 'sk_new', webhookSecret: 'whsec_new', productIdPro: 'prd_pro' }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.paymentProviderCredential.upsert).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: superadminUser.id,
        action: 'payment_credentials.update',
        targetType: 'PaymentProviderCredential',
        targetId: 'CHARIOW',
        metadata: expect.objectContaining({
          fieldsChanged: ['apiKey', 'webhookSecret', 'productIdPro'],
        }),
      }),
    );
    // No plaintext ever leaks into the response.
    const body = (await res.json()) as { chariow: Record<string, unknown> };
    expect(JSON.stringify(body)).not.toContain('sk_new');
    expect(JSON.stringify(body)).not.toContain('whsec_new');
  });

  it('400s when the body has no fields to update', async () => {
    const res = await PATCH(makePatch({}));
    expect(res.status).toBe(400);
    expect(prismaMock.paymentProviderCredential.upsert).not.toHaveBeenCalled();
  });

  it('500s ENCRYPTION_NOT_CONFIGURED and skips the audit log when ENCRYPTION_KEY is unset', async () => {
    delete process.env.ENCRYPTION_KEY;
    const res = await PATCH(makePatch({ apiKey: 'sk_new' }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('ENCRYPTION_NOT_CONFIGURED');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(prismaMock.paymentProviderCredential.upsert).not.toHaveBeenCalled();
  });

  it('rejects a non-SUPERADMIN caller without writing anything', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ apiKey: 'sk_new' }));
    expect(res.status).toBe(403);
    expect(prismaMock.paymentProviderCredential.upsert).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ apiKey: 'sk_new' }));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await PATCH(makePatch({ apiKey: 'sk_new' }));
    expect(res.status).toBe(429);
  });
});

describe('DELETE /api/admin/payment-credentials', () => {
  it('clears the override row and writes an audited payment_credentials.clear action', async () => {
    prismaMock.paymentProviderCredential.deleteMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.paymentProviderCredential.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeDelete());

    expect(res.status).toBe(200);
    expect(prismaMock.paymentProviderCredential.deleteMany).toHaveBeenCalledWith({
      where: { provider: 'CHARIOW' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'payment_credentials.clear', targetId: 'CHARIOW' }),
    );
  });

  it('rejects a non-SUPERADMIN caller without deleting anything', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await DELETE(makeDelete());
    expect(res.status).toBe(403);
    expect(prismaMock.paymentProviderCredential.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(makeDelete());
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });
});
