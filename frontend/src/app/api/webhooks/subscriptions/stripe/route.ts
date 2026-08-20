/**
 * POST /api/webhooks/subscriptions/stripe — thin shim over the PROTECTED
 * factory at lib/server/webhook/handler.ts (same pattern as
 * app/api/webhooks/bictorys/route.ts). The factory reads the raw body via
 * arrayBuffer(), Stripe's own `constructEvent` verifies the HMAC + 5-min
 * replay window, then Serializable-tx dedup on (event.id, event.type).
 *
 * Listens to exactly 3 event types (configure these in the Stripe dashboard
 * webhook endpoint): invoice.paid, invoice.payment_failed,
 * customer.subscription.deleted. See lib/server/subscriptions/stripe.ts's
 * file comment for why activation hinges on invoice.paid rather than
 * checkout.session.completed.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import type Stripe from 'stripe';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { stripeWebhookProvider, getStripeClient } from '@/lib/server/subscriptions/stripe';
import { activateSubscription } from '@/lib/server/subscriptions/fulfillment';
import { resolveOrganizationForAnonymousIntent } from '@/lib/server/subscriptions/anonymous';
import { isPayablePlan } from '@/lib/server/subscriptions/types';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import {
  subscriptionConfirmedEmail,
  subscriptionWelcomeEmail,
  subscriptionPaymentFailedEmail,
} from '@/lib/server/subscriptions/confirmation-templates';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

export const POST = createWebhookHandler({
  prisma,
  provider: stripeWebhookProvider,

  async onPaid(event, tx) {
    const invoice = event.data.object as Stripe.Invoice;
    const rawSubscription = (
      invoice as unknown as { subscription?: string | { id: string } | null }
    ).subscription;
    const viaParent = (
      invoice as unknown as {
        parent?: { subscription_details?: { subscription?: string | { id: string } | null } };
      }
    ).parent?.subscription_details?.subscription;
    const subRef = rawSubscription ?? viaParent;
    const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id;
    if (!subscriptionId) return {}; // not a subscription invoice — nothing to activate

    const client = getStripeClient();
    if (!client) return {}; // shouldn't happen (webhook only fires if configured), defensive

    const sub = await client.subscriptions.retrieve(subscriptionId);
    const organizationId = sub.metadata.organizationId;
    const planRaw = sub.metadata.plan;
    if (!organizationId || !isPayablePlan(planRaw ?? '')) {
      log.warn('stripe subscription webhook: missing/invalid metadata on subscription', {
        subscriptionId,
        organizationId,
        plan: planRaw,
      });
      return {};
    }
    const plan = planRaw as 'PRO';

    // `organizationId` is really an AnonymousSubscriptionIntent id when this
    // Checkout was started from the public landing page (2026-08-19) rather
    // than an authenticated org — see anonymous-checkout/route.ts, which
    // reuses this same metadata field for its own opaque reference. Resolve
    // (or create) the real org before activating, exactly once (guarded by
    // the intent's own status).
    const anonymousIntent = await tx.anonymousSubscriptionIntent.findUnique({
      where: { id: organizationId },
    });
    if (anonymousIntent && anonymousIntent.status === 'SUCCEEDED') return {}; // idempotent replay
    const resolution = anonymousIntent
      ? await resolveOrganizationForAnonymousIntent(tx, anonymousIntent)
      : null;
    const realOrganizationId = resolution?.organizationId ?? organizationId;

    const currentPeriodEnd = new Date((sub.items.data[0]?.current_period_end ?? 0) * 1000);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const amount = invoice.amount_paid ?? 0;

    await activateSubscription(tx, {
      organizationId: realOrganizationId,
      plan,
      provider: 'STRIPE',
      providerRef: invoice.id ?? subscriptionId,
      amount,
      currency: (invoice.currency ?? 'xof').toUpperCase(),
      stripePeriodEnd: currentPeriodEnd,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
    });

    if (anonymousIntent && resolution) {
      await tx.anonymousSubscriptionIntent.update({
        where: { id: anonymousIntent.id },
        data: {
          status: 'SUCCEEDED',
          succeededAt: new Date(),
          organizationId: realOrganizationId,
          resultKind: resolution.kind,
        },
      });
    }

    const org = await tx.organization.findUnique({
      where: { id: realOrganizationId },
      select: { name: true, contactEmail: true, owner: { select: { email: true } } },
    });

    return {
      postCommit: async () => {
        const emailQueue = getEmailQueue();
        if (!emailQueue || !org) return;

        if (resolution?.kind === 'new_org_new_user' && anonymousIntent) {
          const resetUrl = `${appUrl}/reset-password?email=${encodeURIComponent(anonymousIntent.email)}&code=${resolution.resetCode}`;
          const tpl = subscriptionWelcomeEmail({ organizationName: org.name, plan, resetUrl });
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
          plan,
          currentPeriodEnd: currentPeriodEnd.toLocaleDateString('fr-FR'),
          manageUrl: `${appUrl}/profile`,
        });
        await emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
      },
    };
  },

  async onFailed(event, tx) {
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const rawSubscription = (
        invoice as unknown as { subscription?: string | { id: string } | null }
      ).subscription;
      const subscriptionId =
        typeof rawSubscription === 'string' ? rawSubscription : rawSubscription?.id;
      if (!subscriptionId) return {};

      const subRow = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (!subRow) return {};

      const org = await tx.organization.findUnique({
        where: { id: subRow.organizationId },
        select: { name: true, contactEmail: true, owner: { select: { email: true } } },
      });

      return {
        postCommit: async () => {
          const emailQueue = getEmailQueue();
          if (!emailQueue || !org) return;
          const to = org.contactEmail ?? org.owner.email;
          const tpl = subscriptionPaymentFailedEmail({
            organizationName: org.name,
            manageUrl: `${appUrl}/profile`,
          });
          await emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
        },
      };
    }

    if (event.type === 'customer.subscription.deleted') {
      const stripeSub = event.data.object as Stripe.Subscription;
      // WHERE-guarded update: only flips a row that is still pointing at
      // THIS Stripe subscription id — protects against a stale/delayed
      // webhook clobbering a newer subscription the org already re-created.
      const updated = await tx.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSub.id },
        data: { status: 'CANCELED' },
      });
      if (updated.count === 0) return {};

      const subRow = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSub.id },
        select: { organizationId: true },
      });
      if (subRow) {
        await tx.organization.update({
          where: { id: subRow.organizationId },
          data: { plan: 'FREE', planUpdatedAt: new Date() },
        });
      }
      return {};
    }

    return {};
  },
});
