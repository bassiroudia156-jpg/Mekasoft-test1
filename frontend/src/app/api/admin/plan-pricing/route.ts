// GET/PATCH /api/admin/plan-pricing — SUPERADMIN-only subscription price
// editor (2026-08-20 admin dashboard build). GET is ADMIN-readable (so the
// dashboard/pricing pages can display the current price to any admin);
// PATCH requires SUPERADMIN, mirroring organizations/[id]/plan/route.ts's
// precedent for "changes money" mutations.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { PLANS, isPlan, PLAN_PRICING } from '@/lib/server/plans/limits';
import { getAllPlanPricing } from '@/lib/server/plans/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  plan: z.enum(PLANS),
  priceFcfa: z.number().int().min(0).max(10_000_000),
  originalPriceFcfa: z.number().int().min(0).max(10_000_000).nullable(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const pricing = await getAllPlanPricing();
    return NextResponse.json({ pricing }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { plan, priceFcfa, originalPriceFcfa } = parsed.data;
    if (!isPlan(plan) || plan === 'FREE') {
      return NextResponse.json(
        { error: 'PLAN_NOT_EDITABLE', message: 'FREE has no editable price.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (originalPriceFcfa !== null && originalPriceFcfa < priceFcfa) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message:
            'originalPriceFcfa must be >= priceFcfa (it is the struck-through "before" price).',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.planPricing.findUnique({ where: { plan } });
      const row = await tx.planPricing.upsert({
        where: { plan },
        create: { plan, priceFcfa, originalPriceFcfa, updatedByAdminId: auth.admin.id },
        update: { priceFcfa, originalPriceFcfa, updatedByAdminId: auth.admin.id },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'plan_pricing.update',
        targetType: 'PlanPricing',
        targetId: plan,
        metadata: {
          from: {
            priceFcfa: before?.priceFcfa ?? null,
            originalPriceFcfa: before?.originalPriceFcfa ?? null,
          },
          to: { priceFcfa, originalPriceFcfa },
        },
      });
      return row;
    });

    return NextResponse.json(
      {
        pricing: { label: PLAN_PRICING[plan].label, ...updated, isOverride: true },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
