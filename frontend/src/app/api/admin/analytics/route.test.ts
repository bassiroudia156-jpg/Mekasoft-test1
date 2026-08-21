// GET /api/admin/analytics — 30-day signups/revenue trends, plan
// distribution, and top-10 garages by intervention volume.
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

// prisma.<model>.groupBy is a heavily overloaded generic on the real
// PrismaClient type, which defeats vitest-mock-extended's ability to surface
// `.mockResolvedValueOnce` through normal property access (TS2339) even
// though the deep mock proxy provides it fine at runtime. Route to it
// through an `unknown` cast instead of sprinkling `as never` everywhere.
function mockGroupByOnce(fn: unknown, value: unknown): void {
  (fn as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(value);
}

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/analytics', { method: 'GET' });
}

function emptyDefaults() {
  prismaMock.user.findMany.mockResolvedValueOnce([]);
  prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([]);
  mockGroupByOnce(prismaMock.organization.groupBy, []);
  mockGroupByOnce(prismaMock.intervention.groupBy, []);
  prismaMock.organization.findMany.mockResolvedValueOnce([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/analytics', () => {
  it('returns a 30-day window with empty buckets when there is no data', async () => {
    emptyDefaults();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      windowDays: number;
      signupsByDay: number[];
      revenueByDay: number[];
      planDistribution: unknown[];
      topGarages: unknown[];
    };
    expect(body.windowDays).toBe(30);
    expect(body.signupsByDay).toHaveLength(30);
    expect(body.signupsByDay.every((n) => n === 0)).toBe(true);
    expect(body.revenueByDay).toHaveLength(30);
    expect(body.planDistribution).toEqual([]);
    expect(body.topGarages).toEqual([]);
  });

  it('buckets signups and revenue into today’s slot', async () => {
    // 12h ago rather than the exact instant `now` — the route computes its
    // own `new Date()` a few ms after this one, and a d/windowStart delta of
    // exactly 30*DAY_MS would floor to bucket index 30 (out of range,
    // silently dropped). Offsetting well inside the last day avoids that
    // race entirely.
    const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    prismaMock.user.findMany.mockResolvedValueOnce([{ createdAt: recentDate }] as never);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
      { amount: 9_900, succeededAt: recentDate },
    ] as never);
    mockGroupByOnce(prismaMock.organization.groupBy, [
      { plan: 'PRO', _count: { _all: 3 } },
      { plan: 'FREE', _count: { _all: 7 } },
    ]);
    mockGroupByOnce(prismaMock.intervention.groupBy, [
      { organizationId: 'org_1', _count: { _all: 12 } },
    ]);
    prismaMock.organization.findMany.mockResolvedValueOnce([
      { id: 'org_1', name: 'Garage Demo', plan: 'PRO' },
    ] as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as {
      signupsByDay: number[];
      revenueByDay: number[];
      planDistribution: { plan: string; count: number }[];
      topGarages: {
        organizationId: string;
        name: string;
        plan: string;
        interventionCount: number;
      }[];
    };
    expect(body.signupsByDay[29]).toBe(1);
    expect(body.revenueByDay[29]).toBe(9_900);
    expect(body.planDistribution).toEqual([
      { plan: 'PRO', count: 3 },
      { plan: 'FREE', count: 7 },
    ]);
    expect(body.topGarages).toEqual([
      { organizationId: 'org_1', name: 'Garage Demo', plan: 'PRO', interventionCount: 12 },
    ]);
  });

  it('falls back to "—"/FREE for a top garage whose Organization row vanished', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([]);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([]);
    mockGroupByOnce(prismaMock.organization.groupBy, []);
    mockGroupByOnce(prismaMock.intervention.groupBy, [
      { organizationId: 'org_gone', _count: { _all: 4 } },
    ]);
    prismaMock.organization.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGet());
    const body = (await res.json()) as {
      topGarages: { organizationId: string; name: string; plan: string }[];
    };
    expect(body.topGarages[0]).toMatchObject({
      organizationId: 'org_gone',
      name: '—',
      plan: 'FREE',
    });
  });

  it('rejects a non-admin caller without touching the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
