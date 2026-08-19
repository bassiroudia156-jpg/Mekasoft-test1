/**
 * POST /api/webhooks/subscriptions/moneroo — thin shim over the PROTECTED
 * createWebhookHandler factory. HMAC-SHA256 verified over the raw body
 * (X-Moneroo-Signature) by moneroo.ts's WebhookProvider before this route
 * ever sees the payload.
 *
 * Deliberately does NOT re-query Moneroo's API inside this handler (the
 * skill's guidance recommends it as "cheap insurance", but that means an
 * outbound HTTP call held open across this factory's Serializable
 * transaction — a real connection-pool cost, and this codebase's existing
 * webhook precedent (webhooks/bictorys/route.ts) already trusts a verified
 * HMAC body without re-querying). The re-query DOES happen, out-of-band,
 * in the /verify-checkout poll route — that's the "belt" to this "suspenders".
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { monerooWebhookProvider } from '@/lib/server/subscriptions/moneroo';
import { activateSubscription } from '@/lib/server/subscriptions/fulfillment';
import { isPayablePlan } from '@/lib/server/subscriptions/types';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { subscriptionConfirmedEmail } from '@/lib/server/subscriptions/confirmation-templates';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

// ±5% tolerance, same as /verify-checkout — absorbs provider fee-display
// rounding without letting a genuinely tampered amount through.
function amountMatches(reported: number | undefined, expected: number): boolean {
  if (reported === undefined) return true;
  return Math.abs(reported - expected) <= expected * 0.05;
}

export const POST = createWebhookHandler({
  prisma,
  provider: monerooWebhookProvider,

  async onPaid(payload, tx) {
    const providerRef = payload.data?.id;
    if (!providerRef) return {};

    const payment = await tx.subscriptionPayment.findUnique({
      where: { provider_providerRef: { provider: 'MONEROO', providerRef } },
    });
    if (!payment) {
      log.warn('moneroo subscription webhook: no matching SubscriptionPayment row', {
        providerRef,
      });
      return {};
    }
    if (!isPayablePlan(payment.plan)) return {};

    const reportedAmount =
      typeof payload.data?.amount === 'string'
        ? parseInt(payload.data.amount, 10)
        : payload.data?.amount;
    if (!amountMatches(reportedAmount, payment.amount)) {
      log.warn('moneroo subscription webhook: amount mismatch — NOT crediting', {
        providerRef,
        expected: payment.amount,
        reported: reportedAmount,
      });
      return {};
    }

    await activateSubscription(tx, {
      organizationId: payment.organizationId,
      plan: payment.plan as 'PRO' | 'BUSINESS',
      provider: 'MONEROO',
      providerRef,
      amount: payment.amount,
      currency: payment.currency,
    });

    const org = await tx.organization.findUnique({
      where: { id: payment.organizationId },
      select: { name: true, contactEmail: true, owner: { select: { email: true } } },
    });
    const sub = await tx.subscription.findUnique({
      where: { organizationId: payment.organizationId },
      select: { currentPeriodEnd: true },
    });

    return {
      postCommit: async () => {
        const emailQueue = getEmailQueue();
        if (!emailQueue || !org || !sub) return;
        const to = org.contactEmail ?? org.owner.email;
        const tpl = subscriptionConfirmedEmail({
          organizationName: org.name,
          plan: payment.plan as 'PRO' | 'BUSINESS',
          currentPeriodEnd: sub.currentPeriodEnd.toLocaleDateString('fr-FR'),
          manageUrl: `${appUrl}/settings`,
        });
        await emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
      },
    };
  },

  async onFailed(payload, tx) {
    const providerRef = payload.data?.id;
    if (!providerRef) return {};
    await tx.subscriptionPayment.updateMany({
      where: { provider: 'MONEROO', providerRef, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    return {};
  },
});
