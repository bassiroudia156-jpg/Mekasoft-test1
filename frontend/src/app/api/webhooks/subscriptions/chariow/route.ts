/**
 * POST /api/webhooks/subscriptions/chariow?secret=... — "Pulse" webhook per
 * Chariow.md §7. Chariow has no HMAC signature (unlike Stripe/Moneroo) —
 * auth is a shared secret in the URL query string, compared in constant
 * time BEFORE delegating to the PROTECTED createWebhookHandler factory
 * (which only ever sees headers, never the URL — see chariow.ts's webhook
 * provider file comment for why verifySignature there is a pass-through).
 *
 * "Zéro confiance dans le corps" (Chariow.md §7): onPaid re-queries
 * GET /sales/{id} before crediting rather than trusting the webhook
 * payload's own status field — Chariow.md calls this out as a hard
 * requirement, not a nice-to-have, given the weaker (no-HMAC) auth scheme.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import {
  chariowWebhookProvider,
  getChariowSale,
  timingSafeEqualStrings,
} from '@/lib/server/subscriptions/chariow';
import { activateSubscription } from '@/lib/server/subscriptions/fulfillment';
import { resolveOrganizationForAnonymousIntent } from '@/lib/server/subscriptions/anonymous';
import { isPayablePlan } from '@/lib/server/subscriptions/types';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import {
  subscriptionConfirmedEmail,
  subscriptionWelcomeEmail,
} from '@/lib/server/subscriptions/confirmation-templates';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

function amountMatches(reported: number | undefined, expected: number): boolean {
  if (reported === undefined) return true;
  return Math.abs(reported - expected) <= expected * 0.05;
}

const chariowHandler = createWebhookHandler({
  prisma,
  provider: chariowWebhookProvider,

  async onPaid(payload, tx) {
    const providerRef = payload.data?.sale_id ?? payload.data?.id;
    if (!providerRef) return {};

    // Re-query — the source of truth per Chariow.md §3.2/§7. A webhook
    // claiming "paid" that the live sale doesn't confirm is NOT credited.
    const sale = await getChariowSale(providerRef);
    if (sale?.status !== 'succeeded') {
      log.warn('chariow subscription webhook: re-query did not confirm success — NOT crediting', {
        providerRef,
        reQueriedStatus: sale?.status,
      });
      return {};
    }

    // Anonymous landing-page checkout (2026-08-19) — see moneroo/route.ts's
    // onPaid for the fuller explanation; same shape here.
    const anonymousIntent = await tx.anonymousSubscriptionIntent.findUnique({
      where: { provider_providerRef: { provider: 'CHARIOW', providerRef } },
    });
    if (anonymousIntent) {
      if (anonymousIntent.status === 'SUCCEEDED') return {}; // idempotent replay
      if (!isPayablePlan(anonymousIntent.plan)) return {};

      if (!amountMatches(sale.amount, anonymousIntent.amount)) {
        log.warn('chariow subscription webhook: anonymous amount mismatch — NOT crediting', {
          providerRef,
          expected: anonymousIntent.amount,
          reported: sale.amount,
        });
        return {};
      }

      const resolution = await resolveOrganizationForAnonymousIntent(tx, anonymousIntent);
      await activateSubscription(tx, {
        organizationId: resolution.organizationId,
        plan: anonymousIntent.plan as 'PRO',
        provider: 'CHARIOW',
        providerRef,
        amount: anonymousIntent.amount,
        currency: anonymousIntent.currency,
      });
      await tx.anonymousSubscriptionIntent.update({
        where: { id: anonymousIntent.id },
        data: {
          status: 'SUCCEEDED',
          succeededAt: new Date(),
          organizationId: resolution.organizationId,
          resultKind: resolution.kind,
        },
      });

      const org = await tx.organization.findUnique({
        where: { id: resolution.organizationId },
        select: { name: true, contactEmail: true, owner: { select: { email: true } } },
      });
      const sub = await tx.subscription.findUnique({
        where: { organizationId: resolution.organizationId },
        select: { currentPeriodEnd: true },
      });

      return {
        postCommit: async () => {
          const emailQueue = getEmailQueue();
          if (!emailQueue || !org || !sub) return;

          if (resolution.kind === 'new_org_new_user') {
            const resetUrl = `${appUrl}/reset-password?email=${encodeURIComponent(anonymousIntent.email)}&code=${resolution.resetCode}`;
            const tpl = subscriptionWelcomeEmail({
              organizationName: org.name,
              plan: anonymousIntent.plan as 'PRO',
              resetUrl,
            });
            await emailQueue.enqueue({
              to: anonymousIntent.email,
              subject: tpl.subject,
              html: tpl.html,
              text: tpl.text,
            });
            return;
          }

          const to = org.contactEmail ?? org.owner.email;
          const tpl = subscriptionConfirmedEmail({
            organizationName: org.name,
            plan: anonymousIntent.plan as 'PRO',
            currentPeriodEnd: sub.currentPeriodEnd.toLocaleDateString('fr-FR'),
            manageUrl: `${appUrl}/profile`,
          });
          await emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
        },
      };
    }

    const payment = await tx.subscriptionPayment.findUnique({
      where: { provider_providerRef: { provider: 'CHARIOW', providerRef } },
    });
    if (!payment) {
      log.warn('chariow subscription webhook: no matching SubscriptionPayment row', {
        providerRef,
      });
      return {};
    }
    if (!isPayablePlan(payment.plan)) return {};

    if (!amountMatches(sale.amount, payment.amount)) {
      log.warn('chariow subscription webhook: amount mismatch — NOT crediting', {
        providerRef,
        expected: payment.amount,
        reported: sale.amount,
      });
      return {};
    }

    await activateSubscription(tx, {
      organizationId: payment.organizationId,
      plan: payment.plan as 'PRO',
      provider: 'CHARIOW',
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
          plan: payment.plan as 'PRO',
          currentPeriodEnd: sub.currentPeriodEnd.toLocaleDateString('fr-FR'),
          manageUrl: `${appUrl}/profile`,
        });
        await emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
      },
    };
  },
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get('secret') ?? '';
  const expected = process.env.CHARIOW_WEBHOOK_SECRET ?? '';
  if (!expected || !timingSafeEqualStrings(secret, expected)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  return chariowHandler(req);
}
