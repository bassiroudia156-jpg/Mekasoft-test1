// PATCH /api/admin/feedback/[id] — ADMIN toggles the "traité" (reviewed) flag.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ reviewed: z.boolean() });

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
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

    const updated = await prisma.feedback
      .update({ where: { id }, data: { reviewed: parsed.data.reviewed } })
      .catch(() => null);
    if (!updated) {
      return NextResponse.json(
        { error: 'FEEDBACK_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // No AdminAction here — deliberately: toggling a triage checkbox on
    // one-way feedback isn't a "mutation with stakes" the way role/status/
    // plan/coupon/pricing changes are (T-03-06-08-style noise avoidance,
    // same reasoning the status route already applies to same-status PATCH).
    return NextResponse.json(
      { feedback: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
