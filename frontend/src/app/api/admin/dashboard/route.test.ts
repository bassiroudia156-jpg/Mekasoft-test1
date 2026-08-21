// GET /api/admin/dashboard — real KPIs for /admin's "Vue d'ensemble" (users,
// MRR computed from the live plan price via getPlanPricing(), 7-day revenue
// chart, recent payments).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/dashboard', { method: 'GET' });
}

/** Wires every parallel query dashboard/route.ts issues to an empty/zero
 * default so a test only needs to override what it cares about. */
function emptyDefaults() {
  prismaMock.user.count.mockResolvedValueOnce(0); // totalUsers
  prismaMock.user.count.mockResolvedValueOnce(0); // activeUsers
  prismaMock.organization.count.mockResolvedValueOnce(0); // proOrgCount
  prismaMock.organization.count.mockResolvedValueOnce(0); // totalOrgCount
  prismaMock.planPricing.findUnique.mockResolvedValueOnce(null); // getPlanPricing('PRO') fallback
  prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([]); // weekPayments
  prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([]); // recentPayments
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/dashboard', () => {
  it('returns zeroed KPIs and empty chart/table when there is no data', async () => {
    emptyDefaults();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kpis: {
        totalUsers: number;
        activeUsers: number;
        mrrFcfa: number;
        premiumOrgCount: number;
        premiumSharePct: number;
      };
      revenueChart: { bars: unknown[]; totalFcfa: number };
      recentPayments: unknown[];
    };
    expect(body.kpis).toEqual({
      totalUsers: 0,
      activeUsers: 0,
      mrrFcfa: 0,
      premiumOrgCount: 0,
      premiumSharePct: 0,
    });
    expect(body.revenueChart.bars).toHaveLength(7);
    expect(body.revenueChart.totalFcfa).toBe(0);
    expect(body.recentPayments).toEqual([]);
  });

  it('computes MRR from the live (DB-overridden) PRO price, not the static default', async () => {
    prismaMock.user.count.mockResolvedValueOnce(50);
    prismaMock.user.count.mockResolvedValueOnce(10);
    prismaMock.organization.count.mockResolvedValueOnce(4); // proOrgCount
    prismaMock.organization.count.mockResolvedValueOnce(20); // totalOrgCount
    prismaMock.planPricing.findUnique.mockResolvedValueOnce({
      id: 'pp_1',
      plan: 'PRO',
      priceFcfa: 7_000,
      originalPriceFcfa: null,
      updatedAt: new Date('2026-08-21T00:00:00Z'),
      updatedByAdminId: adminUser.id,
    } as never);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([]);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGet());
    const body = (await res.json()) as {
      kpis: { mrrFcfa: number; premiumOrgCount: number; premiumSharePct: number };
    };
    // 4 PRO orgs * 7 000 FCFA override (not the static 9 900 default)
    expect(body.kpis.mrrFcfa).toBe(28_000);
    expect(body.kpis.premiumOrgCount).toBe(4);
    expect(body.kpis.premiumSharePct).toBe(20);
  });

  it('buckets this week’s succeeded payments and includes the recent-payments table', async () => {
    prismaMock.user.count.mockResolvedValueOnce(1);
    prismaMock.user.count.mockResolvedValueOnce(1);
    prismaMock.organization.count.mockResolvedValueOnce(1);
    prismaMock.organization.count.mockResolvedValueOnce(1);
    prismaMock.planPricing.findUnique.mockResolvedValueOnce(null);
    const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
      { amount: 9_900, succeededAt: recentDate },
    ] as never);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
      {
        id: 'sp_1',
        plan: 'PRO',
        provider: 'stripe',
        amount: 9_900,
        status: 'SUCCEEDED',
        createdAt: recentDate,
        organization: { name: 'Garage Demo' },
      },
    ] as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as {
      revenueChart: { bars: { day: string; amount: number }[]; totalFcfa: number };
      recentPayments: { id: string; organizationName: string; amount: number }[];
    };
    expect(body.revenueChart.totalFcfa).toBe(9_900);
    expect(body.revenueChart.bars[6]?.amount).toBe(9_900);
    expect(body.recentPayments).toEqual([
      {
        id: 'sp_1',
        organizationName: 'Garage Demo',
        plan: 'PRO',
        provider: 'stripe',
        amount: 9_900,
        status: 'SUCCEEDED',
        createdAt: recentDate.toISOString(),
      },
    ]);
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
