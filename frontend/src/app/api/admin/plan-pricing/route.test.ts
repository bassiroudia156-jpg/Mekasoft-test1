// GET/PATCH /api/admin/plan-pricing — subscription price editor.
// GET is ADMIN-readable (goes through getAllPlanPricing(), which reads
// prisma.planPricing.findMany() and falls back to the static PLAN_PRICING
// default per plan when no DB row exists); PATCH requires SUPERADMIN.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
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

import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET, PATCH } from './route';
import { seedAdmin, seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};
const superadminUser = seedSuperadmin({ id: 'superadmin_1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadminUser.id, email: superadminUser.email },
  admin: { id: superadminUser.id, email: superadminUser.email, role: 'SUPERADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/plan-pricing', { method: 'GET' });
}
function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/plan-pricing', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
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

describe('GET /api/admin/plan-pricing', () => {
  it('falls back to the static default (no struck-through price) when no DB row exists', async () => {
    prismaMock.planPricing.findMany.mockResolvedValueOnce([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pricing: Record<
        string,
        { priceFcfa: number; originalPriceFcfa: number | null; isOverride: boolean }
      >;
    };
    expect(body.pricing.PRO).toMatchObject({
      priceFcfa: 9_900,
      originalPriceFcfa: null,
      isOverride: false,
    });
    expect(body.pricing.FREE).toMatchObject({ priceFcfa: 0, isOverride: false });
  });

  it('returns the DB override when a PlanPricing row exists', async () => {
    prismaMock.planPricing.findMany.mockResolvedValueOnce([
      {
        id: 'pp_1',
        plan: 'PRO',
        priceFcfa: 7_500,
        originalPriceFcfa: 9_900,
        updatedAt: new Date('2026-08-21T00:00:00Z'),
        updatedByAdminId: superadminUser.id,
      },
    ] as never);
    const res = await GET(makeGet());
    const body = (await res.json()) as {
      pricing: Record<
        string,
        { priceFcfa: number; originalPriceFcfa: number | null; isOverride: boolean }
      >;
    };
    expect(body.pricing.PRO).toMatchObject({
      priceFcfa: 7_500,
      originalPriceFcfa: 9_900,
      isOverride: true,
    });
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.planPricing.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/plan-pricing', () => {
  it('upserts the PRO price and writes an audited plan_pricing.update action', async () => {
    prismaMock.planPricing.findUnique.mockResolvedValueOnce(null);
    prismaMock.planPricing.upsert.mockResolvedValueOnce({
      id: 'pp_1',
      plan: 'PRO',
      priceFcfa: 8_000,
      originalPriceFcfa: null,
      updatedAt: new Date('2026-08-21T00:00:00Z'),
      updatedByAdminId: superadminUser.id,
    } as never);

    const res = await PATCH(makePatch({ plan: 'PRO', priceFcfa: 8_000, originalPriceFcfa: null }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pricing: { priceFcfa: number; isOverride: boolean } };
    expect(body.pricing.priceFcfa).toBe(8_000);
    expect(body.pricing.isOverride).toBe(true);
    expect(prismaMock.planPricing.upsert).toHaveBeenCalledWith({
      where: { plan: 'PRO' },
      create: {
        plan: 'PRO',
        priceFcfa: 8_000,
        originalPriceFcfa: null,
        updatedByAdminId: superadminUser.id,
      },
      update: { priceFcfa: 8_000, originalPriceFcfa: null, updatedByAdminId: superadminUser.id },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: superadminUser.id,
        action: 'plan_pricing.update',
        targetType: 'PlanPricing',
        targetId: 'PRO',
        metadata: {
          from: { priceFcfa: null, originalPriceFcfa: null },
          to: { priceFcfa: 8_000, originalPriceFcfa: null },
        },
      }),
    );
  });

  it('400s PLAN_NOT_EDITABLE when targeting FREE', async () => {
    const res = await PATCH(makePatch({ plan: 'FREE', priceFcfa: 0, originalPriceFcfa: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PLAN_NOT_EDITABLE');
    expect(prismaMock.planPricing.upsert).not.toHaveBeenCalled();
  });

  it('400s when originalPriceFcfa is below priceFcfa', async () => {
    const res = await PATCH(
      makePatch({ plan: 'PRO', priceFcfa: 10_000, originalPriceFcfa: 5_000 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.planPricing.upsert).not.toHaveBeenCalled();
  });

  it('400s on an invalid body (negative price)', async () => {
    const res = await PATCH(makePatch({ plan: 'PRO', priceFcfa: -1, originalPriceFcfa: null }));
    expect(res.status).toBe(400);
    expect(prismaMock.planPricing.upsert).not.toHaveBeenCalled();
  });

  it('rejects a non-SUPERADMIN (ADMIN) caller without touching the DB', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ plan: 'PRO', priceFcfa: 8_000, originalPriceFcfa: null }));
    expect(res.status).toBe(403);
    expect(prismaMock.planPricing.upsert).not.toHaveBeenCalled();
  });

  it('propagates a CSRF failure before any auth/DB work', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ plan: 'PRO', priceFcfa: 8_000, originalPriceFcfa: null }));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });
});
