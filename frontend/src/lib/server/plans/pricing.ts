// Admin-editable subscription pricing (2026-08-20 admin dashboard build).
//
// `limits.ts`'s PLAN_PRICING constant stays the fallback/default — this
// file adds a live override read from the `PlanPricing` table so a
// SUPERADMIN can change the displayed/charged price from /admin/pricing
// without a code deploy. Every consumer (landing page pricing section,
// /subscriptions/plans, checkout amount calculation) should go through
// `getPlanPricing()` here rather than reading PLAN_PRICING directly, so a
// price change takes effect everywhere at once.
//
// Deliberately NOT `import 'server-only'` at the top — mirrors limits.ts's
// own reasoning (this file is imported from route handlers only in
// practice, but keeping it framework-agnostic avoids surprises if a future
// script needs it the way scripts/set-org-plan.ts needs limits.ts).
import { prisma } from '@/lib/server/prisma';
import { PLAN_PRICING, type Plan, type PlanPricing as StaticPlanPricing } from './limits';

export interface ResolvedPlanPricing extends StaticPlanPricing {
  /** true when this came from the DB override, false when it's the static fallback. */
  isOverride: boolean;
}

/**
 * Resolve the live price for a plan: DB row if one exists, else the static
 * PLAN_PRICING fallback from limits.ts. Never throws — a missing/empty
 * table degrades to the same prices the app always shipped with.
 */
export async function getPlanPricing(plan: Plan): Promise<ResolvedPlanPricing> {
  const row = await prisma.planPricing.findUnique({ where: { plan } });
  if (row) {
    return {
      label: PLAN_PRICING[plan].label,
      priceFcfa: row.priceFcfa,
      originalPriceFcfa: row.originalPriceFcfa,
      isOverride: true,
    };
  }
  return { ...PLAN_PRICING[plan], isOverride: false };
}

/** All plans' resolved pricing in one call — used by the admin pricing page
 * and anywhere that needs the full table (e.g. the pricing grid). */
export async function getAllPlanPricing(): Promise<Record<Plan, ResolvedPlanPricing>> {
  const rows = await prisma.planPricing.findMany();
  const byPlan = new Map(rows.map((r) => [r.plan, r]));
  const entries = (Object.keys(PLAN_PRICING) as Plan[]).map((plan) => {
    const row = byPlan.get(plan);
    const resolved: ResolvedPlanPricing = row
      ? {
          label: PLAN_PRICING[plan].label,
          priceFcfa: row.priceFcfa,
          originalPriceFcfa: row.originalPriceFcfa,
          isOverride: true,
        }
      : { ...PLAN_PRICING[plan], isOverride: false };
    return [plan, resolved] as const;
  });
  return Object.fromEntries(entries) as Record<Plan, ResolvedPlanPricing>;
}

/**
 * Upsert the override for a plan. Only PRO is expected to be called with
 * this in practice (FREE has no admin pricing UI), but the function itself
 * doesn't special-case a plan — that decision lives in the route/UI layer.
 */
export async function setPlanPricing(
  plan: Plan,
  input: { priceFcfa: number; originalPriceFcfa: number | null },
  updatedByAdminId: string,
): Promise<ResolvedPlanPricing> {
  const row = await prisma.planPricing.upsert({
    where: { plan },
    create: {
      plan,
      priceFcfa: input.priceFcfa,
      originalPriceFcfa: input.originalPriceFcfa,
      updatedByAdminId,
    },
    update: {
      priceFcfa: input.priceFcfa,
      originalPriceFcfa: input.originalPriceFcfa,
      updatedByAdminId,
    },
  });
  return {
    label: PLAN_PRICING[plan].label,
    priceFcfa: row.priceFcfa,
    originalPriceFcfa: row.originalPriceFcfa,
    isOverride: true,
  };
}
