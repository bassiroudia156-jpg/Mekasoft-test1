// POST /api/quotes/[id]/send — DRAFT → SENT. Enqueues the client-facing
// email (public respond link) via the outbox, same reliability guarantee
// as every other transactional email in this app. NOTE: the matching
// 'email.quote_sent' case in outbox/dispatcher.ts (PROTECTED) still needs
// to be added for this to actually render/send — see the outbox/types.ts
// EmailQuoteSentEvent comment.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { enqueueOutbox } from '@/lib/server/outbox';

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

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

    const existing = await prisma.quote.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: {
        id: true,
        status: true,
        reference: true,
        amount: true,
        validUntil: true,
        token: true,
        client: {
          select: { type: true, firstName: true, lastName: true, companyName: true, email: true },
        },
        organization: { select: { name: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'QUOTE_NOT_DRAFT', message: 'Seul un devis en brouillon peut être envoyé.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const quote = await prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date() },
        select: { id: true, reference: true, status: true, sentAt: true },
      });
      if (existing.client.email) {
        await enqueueOutbox(tx, {
          kind: 'email.quote_sent',
          payload: {
            to: existing.client.email,
            quoteReference: existing.reference,
            organizationName: existing.organization.name,
            clientName: displayName(existing.client),
            amount: existing.amount,
            validUntil: existing.validUntil.toISOString(),
            token: existing.token,
          },
        });
      }
      return updated;
    });

    return NextResponse.json(
      { quote, emailQueued: !!existing.client.email },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
