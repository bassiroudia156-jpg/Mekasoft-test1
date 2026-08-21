// PATCH /api/admin/coupons/[id] — SUPERADMIN-only activate/deactivate.
// Deliberately the only mutable field post-creation — changing
// discountType/discountValue on a coupon that's already been redeemed
// would retroactively misrepresent past CouponRedemption rows, so those
// are immutable; create a new code instead.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ active: z.boolean() });

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.coupon.findUnique({
        where: { id },
        select: { id: true, active: true, code: true },
      });
      if (!target) return null;
      if (target.active === parsed.data.active) return target;

      const updated = await tx.coupon.update({
        where: { id },
        data: { active: parsed.data.active },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: parsed.data.active ? 'coupon.activate' : 'coupon.deactivate',
        targetType: 'Coupon',
        targetId: id,
        metadata: { code: target.code },
      });
      return updated;
    });

    if (!result) {
      return NextResponse.json(
        { error: 'COUPON_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { coupon: result },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
