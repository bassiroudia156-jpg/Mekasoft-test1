// PATCH /api/admin/feedback/[id] — ADMIN toggles the "traité" (reviewed) flag.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
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

    const existing = await prisma.feedback.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'FEEDBACK_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // 2026-08-21 audit pass: every back-office write must go through
    // logAdminAction per CLAUDE.md ("every back-office write is auditable —
    // skipping it is a compliance regression"), including this triage
    // toggle — kept inside the same tx as the update itself, same pattern
    // as the sibling support-tickets PATCH route.
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.feedback.update({
        where: { id },
        data: { reviewed: parsed.data.reviewed },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'feedback.update',
        targetType: 'Feedback',
        targetId: id,
        metadata: { from: existing.reviewed, to: parsed.data.reviewed },
      });
      return row;
    });

    return NextResponse.json(
      { feedback: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
