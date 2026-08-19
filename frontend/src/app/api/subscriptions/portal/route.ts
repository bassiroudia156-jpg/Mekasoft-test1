// POST /api/subscriptions/portal — Stripe Customer Portal only. Moneroo and
// Chariow have no customer-managed billing portal (one-shot checkouts, no
// stored payment method to manage) — the Settings UI simply hides this
// button unless Subscription.provider === 'STRIPE'.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { prisma } from '@/lib/server/prisma';
import { createStripePortalSession } from '@/lib/server/subscriptions/stripe';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const sub = await prisma.subscription.findUnique({
      where: { organizationId: auth.organizationId },
      select: { provider: true, stripeCustomerId: true },
    });
    if (!sub || sub.provider !== 'STRIPE' || !sub.stripeCustomerId) {
      return NextResponse.json(
        { error: 'NO_STRIPE_SUBSCRIPTION' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    try {
      const session = await createStripePortalSession(sub.stripeCustomerId, `${appUrl}/settings`);
      return NextResponse.json(
        { url: session.url },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { error: 'PORTAL_UNAVAILABLE', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
