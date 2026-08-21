// Shared "a payment for a subscription just succeeded" logic — called from
// all three webhook handlers AND the /verify-checkout poll route, so the
// activation logic (mark payment SUCCEEDED, upsert Subscription, bump
// Organization.plan) lives in exactly one place regardless of which
// provider confirmed it.
//
// Accepts a `PrismaTransactionClient` so webhook handlers can call it from
// inside the createWebhookHandler factory's Serializable tx — a plain
// PrismaClient (verify-checkout's use case) satisfies that same interface
// structurally (Omit only narrows the type, a full client has every member
// it requires plus more).
import 'server-only';
import type { PrismaTransactionClient } from '../webhook/handler';
import type { PayablePlan, SubscriptionProviderName } from './types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_SHOT_PERIOD_DAYS = 30; // Moneroo/Chariow: one paid checkout = 30 days of access

export interface ActivateSubscriptionInput {
  organizationId: string;
  plan: PayablePlan;
  provider: SubscriptionProviderName;
  /** Provider's own reference for THIS payment — used to mark the matching
   * SubscriptionPayment row SUCCEEDED. If no PENDING row matches (Stripe's
   * invoice.paid uses a different id than the checkout-session id used at
   * initiation — see stripe.ts's file comment), a new SUCCEEDED row is
   * created directly so the ledger still has an entry. */
  providerRef: string;
  amount: number;
  currency: string;
  /** Stripe only — the real period end computed by Stripe itself. When
   * omitted (Moneroo/Chariow), a 30-day one-shot period is computed here. */
  stripePeriodEnd?: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export async function activateSubscription(
  client: PrismaTransactionClient,
  input: ActivateSubscriptionInput,
): Promise<void> {
  const now = new Date();

  // 1. Ledger entry — reconcile the PENDING row if one exists (Moneroo/
  // Chariow always pre-create one at checkout time), else insert a fresh
  // SUCCEEDED row (Stripe's invoice.paid path, see stripe.ts comment).
  const existingPayment = await client.subscriptionPayment.findUnique({
    where: { provider_providerRef: { provider: input.provider, providerRef: input.providerRef } },
  });
  if (existingPayment) {
    if (existingPayment.status !== 'SUCCEEDED') {
      await client.subscriptionPayment.update({
        where: { id: existingPayment.id },
        data: { status: 'SUCCEEDED', succeededAt: now },
      });
    }
  } else {
    await client.subscriptionPayment.create({
      data: {
        organizationId: input.organizationId,
        plan: input.plan,
        provider: input.provider,
        providerRef: input.providerRef,
        amount: input.amount,
        currency: input.currency,
        status: 'SUCCEEDED',
        succeededAt: now,
      },
    });
  }

  // 2. Compute the new paid-through date.
  let currentPeriodEnd: Date;
  let graceEndsAt: Date | null;
  if (input.stripePeriodEnd) {
    currentPeriodEnd = input.stripePeriodEnd;
    graceEndsAt = null; // Stripe auto-renews — no app-level grace needed
  } else {
    const existingSub = await client.subscription.findUnique({
      where: { organizationId: input.organizationId },
    });
    // Extend from the existing paid-through date if still in the future
    // (don't waste remaining days on a same-provider renewal); otherwise
    // start fresh from now (lapsed subscription being reactivated).
    const base =
      existingSub && existingSub.currentPeriodEnd > now ? existingSub.currentPeriodEnd : now;
    currentPeriodEnd = new Date(base.getTime() + ONE_SHOT_PERIOD_DAYS * ONE_DAY_MS);
    const graceDays = Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? '3');
    graceEndsAt = new Date(currentPeriodEnd.getTime() + graceDays * ONE_DAY_MS);
  }

  // 3. Upsert the single Subscription row for this org.
  await client.subscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      plan: input.plan,
      provider: input.provider,
      status: 'ACTIVE',
      currentPeriodEnd,
      graceEndsAt,
      ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
      ...(input.stripeSubscriptionId ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
    },
    update: {
      plan: input.plan,
      provider: input.provider,
      status: 'ACTIVE',
      currentPeriodEnd,
      graceEndsAt,
      cancelAtPeriodEnd: false,
      remindersSent: 0,
      lastReminderSentAt: null,
      ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
      ...(input.stripeSubscriptionId ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
    },
  });

  // 4. Bump the org's plan — this is what actually lifts PLAN_LIMITS caps.
  // The isPayablePlan() guard at the call sites already ensures input.plan
  // is PRO or BUSINESS, never FREE.
  await client.organization.update({
    where: { id: input.organizationId },
    data: { plan: input.plan, planUpdatedAt: now },
  });
}
