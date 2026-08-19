// POST /api/subscriptions/anonymous-checkout/verify — polled by
// /subscriptions/welcome after a redirect back from a hosted checkout.
//
// Deliberately READ-ONLY, unlike the authenticated /api/subscriptions/verify
// (which can itself call activateSubscription as a fallback if the webhook
// hasn't landed yet). Here, fulfillment creates a real User + Organization —
// letting a public, unauthenticated, non-transactional poll route also
// trigger that would open a race against the webhook (both could pass the
// "no existing user for this email" check concurrently). The webhook's
// Serializable tx + WebhookLog dedup already guarantees at-most-once
// fulfillment, so this route only ever reports what the webhook has done —
// same "webhook is the source of truth, redirect/poll is a UX hint only"
// principle the Stripe integration notes already call out elsewhere. If the
// webhook is slow, the poll just shows "still pending" longer (existing
// `timeout` state, with a manual retry) rather than double-crediting.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ intentId: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const intent = await prisma.anonymousSubscriptionIntent.findUnique({
      where: { id: parsed.data.intentId },
    });
    if (!intent) {
      return NextResponse.json(
        { error: 'INTENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        status: intent.status,
        plan: intent.plan,
        provider: intent.provider,
        amount: intent.amount,
        currency: intent.currency,
        email: intent.email,
        // true only for the brand-new-account branch — drives whether the
        // confirmation page says "check your email to set a password" or
        // "log in now" (see resolveOrganizationForAnonymousIntent's `kind`).
        isNewAccount: intent.resultKind === 'new_org_new_user',
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
