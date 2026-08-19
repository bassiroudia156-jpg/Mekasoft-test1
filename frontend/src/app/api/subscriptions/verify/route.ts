// POST /api/subscriptions/verify — polled by the return page after a
// redirect back from a hosted checkout (Chariow.md §8's "3 chemins de
// crédit" pattern: user-return poll + webhook + a periodic reconciliation
// cron — this route covers the first two paths' outcome; a dedicated
// reconciliation cron for long-stuck PENDING rows is a documented
// follow-up, not built in this pass). Never trusts the client — always
// re-queries the provider (or short-circuits if the webhook already landed
// first, which is the common case: webhooks are typically faster than the
// user's browser redirect + this poll).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { prisma } from '@/lib/server/prisma';
import { activateSubscription } from '@/lib/server/subscriptions/fulfillment';
import { getStripeClient } from '@/lib/server/subscriptions/stripe';
import { verifyMonerooPayment } from '@/lib/server/subscriptions/moneroo';
import { getChariowSale } from '@/lib/server/subscriptions/chariow';
import { isPayablePlan } from '@/lib/server/subscriptions/types';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();
const Body = z.object({ paymentId: z.string().min(1) });

// ±5% tolerance — matches the skill's PayTech fee-variance guidance; applied
// uniformly here since Moneroo/Chariow can also report a slightly different
// settled amount (currency conversion, provider fee display quirks).
function amountMatches(reported: number | undefined, expected: number): boolean {
  if (reported === undefined) return true; // provider didn't report one — don't block on it
  return Math.abs(reported - expected) <= expected * 0.05;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id: parsed.data.paymentId },
    });
    if (!payment || payment.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (payment.status !== 'PENDING') {
      return NextResponse.json(
        { status: payment.status },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!isPayablePlan(payment.plan)) {
      // Defensive — SubscriptionPayment.plan is only ever written as PRO/
      // BUSINESS by the checkout route, but the column itself is a plain
      // String (no DB-level enum), so guard before it reaches activation.
      return NextResponse.json(
        { error: 'INVALID_PLAN' },
        { status: 500, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let credited = false;

    if (payment.provider === 'STRIPE') {
      const client = getStripeClient();
      if (client) {
        const session = await client.checkout.sessions.retrieve(payment.providerRef);
        if (session.payment_status === 'paid' && session.subscription) {
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await client.subscriptions.retrieve(subscriptionId);
          const invoiceId =
            typeof sub.latest_invoice === 'string'
              ? sub.latest_invoice
              : (sub.latest_invoice?.id ?? subscriptionId);
          await activateSubscription(prisma, {
            organizationId: payment.organizationId,
            plan: payment.plan,
            provider: 'STRIPE',
            providerRef: invoiceId,
            amount: payment.amount,
            currency: payment.currency,
            stripePeriodEnd: new Date(sub.items.data[0]!.current_period_end * 1000),
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
            stripeSubscriptionId: sub.id,
          });
          credited = true;
        }
      }
    } else if (payment.provider === 'MONEROO') {
      const result = await verifyMonerooPayment(payment.providerRef);
      if (result?.status === 'completed' || result?.status === 'success') {
        if (!amountMatches(result.amount, payment.amount)) {
          log.warn('subscriptions/verify: MONEROO amount mismatch — NOT crediting', {
            paymentId: payment.id,
            expected: payment.amount,
            reported: result.amount,
          });
        } else {
          await activateSubscription(prisma, {
            organizationId: payment.organizationId,
            plan: payment.plan,
            provider: 'MONEROO',
            providerRef: payment.providerRef,
            amount: payment.amount,
            currency: payment.currency,
          });
          credited = true;
        }
      }
    } else if (payment.provider === 'CHARIOW') {
      const sale = await getChariowSale(payment.providerRef);
      if (sale?.status === 'succeeded') {
        if (!amountMatches(sale.amount, payment.amount)) {
          log.warn('subscriptions/verify: CHARIOW amount mismatch — NOT crediting', {
            paymentId: payment.id,
            expected: payment.amount,
            reported: sale.amount,
          });
        } else {
          await activateSubscription(prisma, {
            organizationId: payment.organizationId,
            plan: payment.plan,
            provider: 'CHARIOW',
            providerRef: payment.providerRef,
            amount: payment.amount,
            currency: payment.currency,
          });
          credited = true;
        }
      }
    }

    if (credited) {
      return NextResponse.json(
        { status: 'SUCCEEDED' },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json({ status: 'PENDING' }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
