// POST /api/quotes/[id]/respond — staff-side manual accept/reject, for a
// client who responded by phone/in person instead of clicking the public
// link (POST /api/quotes/respond/[token], no auth, same status transition).
// Both write the same status/respondedAt/respondedByName fields —
// respondedByName just distinguishes how ("Client (lien)" vs the staff
// member's own email) for the audit trail.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ action: z.enum(['accept', 'reject']) });

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.quote.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, status: true, validUntil: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing.status !== 'SENT') {
      return NextResponse.json(
        {
          error: 'QUOTE_NOT_RESPONDABLE',
          message: 'Ce devis doit être envoyé avant de pouvoir être accepté ou refusé.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing.validUntil.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'QUOTE_EXPIRED', message: 'Ce devis a expiré.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        status: parsed.data.action === 'accept' ? 'ACCEPTED' : 'REJECTED',
        respondedAt: new Date(),
        respondedByName: auth.user.email,
      },
      select: { id: true, status: true, respondedAt: true },
    });

    return NextResponse.json({ quote }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
