// No dedicated test file existed for pricing.ts before this — a real gap:
// this is exactly the module whose "never throws, falls back to static
// PLAN_PRICING" promise (see its own file comment) silently broke `next
// build`'s static prerendering of `/` in CI (2026-08-24), because the
// read paths only degraded on a missing/empty table, not on the database
// being entirely unreachable (a real PrismaClientInitializationError).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { getPlanPricing, getAllPlanPricing, setPlanPricing } from './pricing';
import { PLAN_PRICING } from './limits';

describe('getPlanPricing', () => {
  it('returns the static PLAN_PRICING fallback when no DB row exists', async () => {
    prismaMock.planPricing.findUnique.mockResolvedValue(null);
    const resolved = await getPlanPricing('PRO');
    expect(resolved).toEqual({ ...PLAN_PRICING.PRO, isOverride: false });
  });

  it('returns the DB override when a row exists', async () => {
    prismaMock.planPricing.findUnique.mockResolvedValue({
      id: 'pp_1',
      plan: 'PRO',
      priceFcfa: 5_000,
      originalPriceFcfa: 9_900,
      updatedAt: new Date(),
      updatedByAdminId: 'admin_1',
    } as never);
    const resolved = await getPlanPricing('PRO');
    expect(resolved).toEqual({
      label: 'Pro',
      priceFcfa: 5_000,
      originalPriceFcfa: 9_900,
      isOverride: true,
    });
  });

  // The actual 2026-08-24 CI break: `next build` prerenders `/` with no
  // reachable DATABASE_URL, so Prisma throws instead of returning null.
  it('falls back to static PLAN_PRICING (not throwing) when the DB is entirely unreachable', async () => {
    prismaMock.planPricing.findUnique.mockRejectedValue(
      new Error("Can't reach database server at `localhost:5432`"),
    );
    await expect(getPlanPricing('BUSINESS')).resolves.toEqual({
      ...PLAN_PRICING.BUSINESS,
      isOverride: false,
    });
  });
});

describe('getAllPlanPricing', () => {
  it('mixes DB overrides with static fallbacks per plan', async () => {
    prismaMock.planPricing.findMany.mockResolvedValue([
      {
        id: 'pp_1',
        plan: 'PRO',
        priceFcfa: 5_000,
        originalPriceFcfa: null,
        updatedAt: new Date(),
        updatedByAdminId: 'admin_1',
      },
    ] as never);
    const all = await getAllPlanPricing();
    expect(all.PRO).toEqual({
      label: 'Pro',
      priceFcfa: 5_000,
      originalPriceFcfa: null,
      isOverride: true,
    });
    expect(all.FREE).toEqual({ ...PLAN_PRICING.FREE, isOverride: false });
    expect(all.BUSINESS).toEqual({ ...PLAN_PRICING.BUSINESS, isOverride: false });
  });

  it('falls back to static PLAN_PRICING for every plan when the DB is unreachable', async () => {
    prismaMock.planPricing.findMany.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const all = await getAllPlanPricing();
    expect(all.FREE).toEqual({ ...PLAN_PRICING.FREE, isOverride: false });
    expect(all.PRO).toEqual({ ...PLAN_PRICING.PRO, isOverride: false });
    expect(all.BUSINESS).toEqual({ ...PLAN_PRICING.BUSINESS, isOverride: false });
  });
});

describe('setPlanPricing', () => {
  it('upserts and returns the override, isOverride: true', async () => {
    prismaMock.planPricing.upsert.mockResolvedValue({
      id: 'pp_1',
      plan: 'PRO',
      priceFcfa: 7_500,
      originalPriceFcfa: null,
      updatedAt: new Date(),
      updatedByAdminId: 'admin_1',
    } as never);
    const resolved = await setPlanPricing(
      'PRO',
      { priceFcfa: 7_500, originalPriceFcfa: null },
      'admin_1',
    );
    expect(resolved).toEqual({
      label: 'Pro',
      priceFcfa: 7_500,
      originalPriceFcfa: null,
      isOverride: true,
    });
  });

  // Unlike the read paths, an explicit admin write must still surface a DB
  // failure instead of silently no-op'ing — the caller needs to know the
  // save didn't happen.
  it('propagates a DB failure instead of swallowing it', async () => {
    prismaMock.planPricing.upsert.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(
      setPlanPricing('PRO', { priceFcfa: 7_500, originalPriceFcfa: null }, 'admin_1'),
    ).rejects.toThrow('connect ECONNREFUSED');
  });
});
