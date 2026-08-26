// PATCH /api/admin/organizations/[id]/plan — SUPERADMIN-only plan change.
// No payment collection is wired yet (next phase) — this is the manual
// lever until then. Every change is audited via logAdminAction, mirroring
// the user role-change route's shape (find → update → audit, in one tx).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { PLANS } from '@/lib/server/plans/limits';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ plan: z.enum(PLANS) });

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
      const target = await tx.organization.findUnique({
        where: { id },
        select: { id: true, plan: true },
      });
      if (!target) return null;

      const updated = await tx.organization.update({
        where: { id },
        data: { plan: parsed.data.plan, planUpdatedAt: new Date() },
        select: { id: true, name: true, plan: true, planUpdatedAt: true },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'organization.plan_change',
        targetType: 'Organization',
        targetId: id,
        metadata: { from: target.plan, to: parsed.data.plan },
      });

      return updated;
    });

    if (!result) {
      return NextResponse.json(
        { error: 'ORGANIZATION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { organization: result },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
