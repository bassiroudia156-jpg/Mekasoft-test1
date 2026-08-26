// Stripe adapter — subscription billing (2026-08-18). The only one of the
// three providers with first-class recurring billing: once a garage pays by
// card, Stripe re-charges automatically every period, no relance needed.
//
// Uses hosted Checkout in `mode: 'subscription'` against a pre-created
// Stripe Price (STRIPE_PRICE_ID_PRO/BUSINESS) rather than inline `price_data`
// — same "price lives in the provider's own dashboard, keep it in sync with
// our own pricing" constraint Chariow.md documents for Chariow products
// (§6 "Pas d'override de prix"). The admin must keep each Stripe Price's
// amount equal to PLAN_PRICING[plan].priceFcfa in lib/server/plans/limits.ts.
//
// Activation deliberately hinges on `invoice.paid` (not
// `checkout.session.completed`) for BOTH initial creation and renewals —
// Stripe always invoices a subscription's first period through Checkout, so
// `invoice.paid` covers both cases uniformly and sidesteps the "these two
// events fire in undefined order" gotcha that `checkout.session.completed`
// vs `invoice.paid` has for hosted Checkout.
import 'server-only';
import Stripe from 'stripe';
import type { WebhookProvider } from '../webhook/handler';
import { createLogger } from '../logger';
import type {
  SubscriptionCheckoutInput,
  SubscriptionCheckoutResult,
  SubscriptionProvider,
} from './types';

const log = createLogger();

// Pin explicitly — an unpinned client silently follows Stripe's account
// default, which can change under you when Stripe rotates it. Bump this on
// purpose, run the test suite, deploy. Matches the SDK's own baked-in
// default at install time (node_modules/stripe/esm/apiVersion.js).
const STRIPE_API_VERSION = '2026-07-29.dahlia' as const;

function priceIdForPlan(plan: 'PRO' | 'BUSINESS'): string | null {
  const id =
    plan === 'PRO' ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID_BUSINESS;
  return id && id.length > 0 ? id : null;
}

function isConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_ID_PRO &&
    process.env.STRIPE_PRICE_ID_BUSINESS
  );
}

let _client: Stripe | null | undefined;

/** Lazy singleton — cached null too, so a missing env doesn't re-check every call. */
export function getStripeClient(): Stripe | null {
  if (_client !== undefined) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    _client = null;
    return null;
  }
  _client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return _client;
}

/** Test-only — clear the cached client. */
export function __resetStripeClient(): void {
  _client = undefined;
}

export const stripeSubscriptionProvider: SubscriptionProvider = {
  name: 'STRIPE',
  isConfigured,

  async createCheckout(input: SubscriptionCheckoutInput): Promise<SubscriptionCheckoutResult> {
    const client = getStripeClient();
    if (!client) throw new Error('Stripe not configured');
    const priceId = priceIdForPlan(input.plan);
    if (!priceId) throw new Error(`No STRIPE_PRICE_ID configured for plan ${input.plan}`);

    // 2026-08-22 bug fix — a redeemed coupon (see coupons/redeem.ts) was
    // computed and stored on the SubscriptionPayment/AnonymousSubscription-
    // Intent row, but the recurring `priceId` above is fixed in Stripe's
    // own dashboard and this call never referenced the discount at all —
    // Checkout silently charged the full sticker price regardless of any
    // coupon. Fix: create a single-use, once-off Stripe Coupon for exactly
    // the discounted amount and scope it to just this Checkout Session via
    // `discounts`. The Price object itself — and therefore every renewal
    // after the first — stays untouched.
    let discounts: { coupon: string }[] | undefined;
    if (input.discountAmount && input.discountAmount > 0) {
      const coupon = await client.coupons.create({
        amount_off: input.discountAmount,
        currency: input.currency.toLowerCase(),
        duration: 'once',
        max_redemptions: 1,
        name: `Coupon — ${input.subscriptionPaymentId}`,
      });
      discounts = [{ coupon: coupon.id }];
    }

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.customerEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(discounts ? { discounts } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Metadata on the Checkout Session itself (for the session record) AND
      // on subscription_data.metadata (copied onto the created Subscription
      // object — that's what the invoice.paid handler reads back, since
      // Invoice objects don't reliably carry organizationId/plan directly).
      metadata: {
        subscriptionPaymentId: input.subscriptionPaymentId,
        organizationId: input.organizationId,
        plan: input.plan,
      },
      subscription_data: {
        metadata: {
          organizationId: input.organizationId,
          plan: input.plan,
        },
      },
    });

    if (!session.url) throw new Error('Stripe Checkout session created without a url');
    return { providerRef: session.id, checkoutUrl: session.url };
  },
};

/** "Manage my subscription" — lets the org owner update card / cancel from
 * Stripe's own hosted portal instead of us building cancellation UI. */
export async function createStripePortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const client = getStripeClient();
  if (!client) throw new Error('Stripe not configured');
  const session = await client.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Handles both Invoice shapes across Stripe API versions — the `subscription`
 * field moved to `parent.subscription_details.subscription` around the
 * 2025-x line. Checking both keeps this adapter working across a future
 * `STRIPE_API_VERSION` bump without a silent "no subscription found" bug.
 */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object' && 'id' in direct) return direct.id;

  const viaParent = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } };
    }
  ).parent?.subscription_details?.subscription;
  if (typeof viaParent === 'string') return viaParent;
  if (viaParent && typeof viaParent === 'object' && 'id' in viaParent) return viaParent.id;

  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Webhook — WebhookProvider<Stripe.Event>, consumed by createWebhookHandler
// (the PROTECTED factory at lib/server/webhook/handler.ts). Stripe's own
// `constructEvent` does timing-safe HMAC + a 5-min replay-window check
// internally, so verifySignature does the real work; parsePayload just
// hands back the already-verified event via a per-request WeakMap (keyed on
// the exact rawBody Buffer instance the factory passes to both calls —
// concurrent requests never collide since each gets its own Buffer).
// ───────────────────────────────────────────────────────────────────────

const verifiedEvents = new WeakMap<Buffer, Stripe.Event>();

function headersRecordToStripeSig(headers: Record<string, string>): string | undefined {
  return headers['stripe-signature'];
}

export const stripeWebhookProvider: WebhookProvider<Stripe.Event> = {
  name: 'stripe-subscription',

  verifySignature(rawBody, headers) {
    const client = getStripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!client || !secret) return { valid: false, reason: 'not configured' };

    const sig = headersRecordToStripeSig(headers);
    if (!sig) return { valid: false, reason: 'missing stripe-signature header' };

    try {
      const event = client.webhooks.constructEvent(rawBody, sig, secret);
      verifiedEvents.set(rawBody, event);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) };
    }
  },

  parsePayload(rawBody) {
    const event = verifiedEvents.get(rawBody);
    if (!event) throw new Error('Stripe event not found — verifySignature must run first');
    return event;
  },

  extractIds(event) {
    const kind =
      event.type === 'invoice.paid'
        ? ('paid' as const)
        : event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.deleted'
          ? ('failed' as const)
          : ('other' as const);
    if (kind === 'other') {
      log.info('stripe subscription webhook: unhandled event type (skipped)', {
        type: event.type,
      });
    }
    return { externalId: event.id, eventType: event.type, kind };
  },
};
