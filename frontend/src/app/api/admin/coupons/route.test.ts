// /api/admin/coupons — SUPERADMIN-only coupon CRUD.
//
// Covers GET+POST from ./route.ts and PATCH from ./[id]/route.ts in one
// file, mirroring the established convention (see
// admin/users/route.test.ts's "Wave 1 & 2" consolidation).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { GET, POST } from './route';
import { PATCH } from './[id]/route';
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

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/coupons', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/coupons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const baseCoupon = {
  id: 'coupon_1',
  code: 'WELCOME10',
  discountType: 'PERCENT',
  discountValue: 10,
  appliesToPlan: 'PRO',
  maxRedemptions: null,
  redeemedCount: 0,
  active: true,
  expiresAt: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  createdByAdminId: superadminUser.id,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('GET /api/admin/coupons', () => {
  it('returns the coupon list for a SUPERADMIN', async () => {
    prismaMock.coupon.findMany.mockResolvedValueOnce([baseCoupon] as never);
    const res = await GET(makeGet('http://test/api/admin/coupons'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { coupons: { code: string }[] };
    expect(body.coupons[0]?.code).toBe('WELCOME10');
    expect(prismaMock.coupon.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  it('rejects a non-SUPERADMIN caller without touching the DB', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/coupons'));
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.findMany).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/coupons'));
    expect(res.status).toBe(429);
    expect(prismaMock.coupon.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/coupons', () => {
  const validBody = {
    code: 'launch20',
    discountType: 'PERCENT' as const,
    discountValue: 20,
    appliesToPlan: 'PRO' as const,
  };

  it('creates a coupon, uppercases the code, and writes an audited coupon.create action', async () => {
    prismaMock.coupon.findUnique.mockResolvedValueOnce(null);
    prismaMock.coupon.create.mockResolvedValueOnce({
      ...baseCoupon,
      id: 'coupon_new',
      code: 'LAUNCH20',
      discountValue: 20,
    } as never);

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { coupon: { code: string } };
    expect(body.coupon.code).toBe('LAUNCH20');
    expect(prismaMock.coupon.findUnique).toHaveBeenCalledWith({ where: { code: 'LAUNCH20' } });
    expect(prismaMock.coupon.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'LAUNCH20',
        discountType: 'PERCENT',
        discountValue: 20,
        appliesToPlan: 'PRO',
        maxRedemptions: null,
        expiresAt: null,
        createdByAdminId: superadminUser.id,
      }),
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: superadminUser.id,
        action: 'coupon.create',
        targetType: 'Coupon',
        targetId: 'coupon_new',
      }),
    );
  });

  it('409s COUPON_CODE_TAKEN when the (uppercased) code already exists, no create/audit', async () => {
    prismaMock.coupon.findUnique.mockResolvedValueOnce(baseCoupon as never);
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('COUPON_CODE_TAKEN');
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('400s a PERCENT discount over 100 before ever touching the DB', async () => {
    const res = await POST(makePost({ ...validBody, discountValue: 150 }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('400s an invalid code (bad characters)', async () => {
    const res = await POST(makePost({ ...validBody, code: 'bad code!' }));
    expect(res.status).toBe(400);
    expect(prismaMock.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('400s a FIXED discount with a non-positive value', async () => {
    const res = await POST(
      makePost({ code: 'ZERO', discountType: 'FIXED', discountValue: 0, appliesToPlan: 'PRO' }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-SUPERADMIN caller without touching the DB', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
    expect(prismaMock.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/coupons/[id]', () => {
  it('activates a coupon and writes coupon.activate', async () => {
    prismaMock.coupon.findUnique.mockResolvedValueOnce({
      id: 'coupon_1',
      active: false,
      code: 'WELCOME10',
    } as never);
    prismaMock.coupon.update.mockResolvedValueOnce({ ...baseCoupon, active: true } as never);

    const res = await PATCH(makePatch('coupon_1', { active: true }), paramsOf('coupon_1'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { coupon: { active: boolean } };
    expect(body.coupon.active).toBe(true);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: superadminUser.id,
        action: 'coupon.activate',
        targetType: 'Coupon',
        targetId: 'coupon_1',
        metadata: { code: 'WELCOME10' },
      }),
    );
  });

  it('deactivates a coupon and writes coupon.deactivate', async () => {
    prismaMock.coupon.findUnique.mockResolvedValueOnce({
      id: 'coupon_1',
      active: true,
      code: 'WELCOME10',
    } as never);
    prismaMock.coupon.update.mockResolvedValueOnce({ ...baseCoupon, active: false } as never);

    const res = await PATCH(makePatch('coupon_1', { active: false }), paramsOf('coupon_1'));

    expect(res.status).toBe(200);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'coupon.deactivate' }),
    );
  });

  it('is idempotent on a same-active PATCH — no update, no AdminAction', async () => {
    prismaMock.coupon.findUnique.mockResolvedValueOnce({
      id: 'coupon_1',
      active: true,
      code: 'WELCOME10',
    } as never);

    const res = await PATCH(makePatch('coupon_1', { active: true }), paramsOf('coupon_1'));

    expect(res.status).toBe(200);
    expect(prismaMock.coupon.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('404s COUPON_NOT_FOUND for a missing coupon', async () => {
    prismaMock.coupon.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch('missing', { active: true }), paramsOf('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('COUPON_NOT_FOUND');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('400s on an invalid body', async () => {
    const res = await PATCH(makePatch('coupon_1', { active: 'yes' }), paramsOf('coupon_1'));
    expect(res.status).toBe(400);
    expect(prismaMock.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('coupon_1', { active: true }), paramsOf('coupon_1'));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });
});
