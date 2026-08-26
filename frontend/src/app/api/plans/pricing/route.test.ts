// GET /api/plans/pricing — public read-only pricing, no auth. Pins the
// exact bug this route fixes (see the route's own header comment): the
// landing page / /subscriptions/plans / /subscriptions/checkout /
// UpgradeSubscriptionModal must see the same price an admin override sets
// via /api/admin/plan-pricing, without needing to be an admin themselves.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/plans/pricing', () => {
  it('requires no auth and returns the static defaults when no override exists', async () => {
    prismaMock.planPricing.findMany.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pricing: Record<
        string,
        { priceFcfa: number; originalPriceFcfa: number | null; isOverride: boolean }
      >;
    };
    expect(body.pricing.FREE).toMatchObject({ priceFcfa: 0, isOverride: false });
    expect(body.pricing.PRO).toMatchObject({ priceFcfa: 9_900, isOverride: false });
    expect(body.pricing.BUSINESS).toMatchObject({ priceFcfa: 19_900, isOverride: false });
  });

  it('reflects an admin override immediately — the exact gap this route closes', async () => {
    prismaMock.planPricing.findMany.mockResolvedValueOnce([
      {
        id: 'pp_1',
        plan: 'PRO',
        priceFcfa: 7_500,
        originalPriceFcfa: 9_900,
        updatedAt: new Date('2026-08-21T00:00:00Z'),
        updatedByAdminId: 'admin_1',
      },
    ] as never);
    const res = await GET();
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
    // Untouched plans still fall back cleanly.
    expect(body.pricing.BUSINESS).toMatchObject({ priceFcfa: 19_900, isOverride: false });
  });

  it('never touches request auth/CSRF — a logged-out visitor gets the same data', async () => {
    prismaMock.planPricing.findMany.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
