// Shared types for the subscription-billing domain (2026-08-18) — a garage
// (Organization) paying MekaSoft for its own PRO/BUSINESS plan. See the
// schema.prisma comment above `model Subscription` for how this differs
// from the garage-invoicing `Payment` domain.
//
// Deliberately NOT `import 'server-only'` — pure types, no secrets, safe to
// import from both server routes and tests.
import type { Plan } from '../plans/limits';

export const SUBSCRIPTION_PROVIDERS = ['STRIPE', 'MONEROO', 'CHARIOW'] as const;
export type SubscriptionProviderName = (typeof SUBSCRIPTION_PROVIDERS)[number];

export function isSubscriptionProvider(value: string): value is SubscriptionProviderName {
  return (SUBSCRIPTION_PROVIDERS as readonly string[]).includes(value);
}

/** Plans a subscription can actually pay for — never FREE (nothing to buy). */
export type PayablePlan = Exclude<Plan, 'FREE'>;

export function isPayablePlan(value: string): value is PayablePlan {
  return value === 'PRO' || value === 'BUSINESS';
}

export interface SubscriptionCheckoutInput {
  organizationId: string;
  organizationName: string;
  plan: PayablePlan;
  /** FCFA, integer — from PLAN_PRICING[plan].priceFcfa. */
  amount: number;
  currency: string;
  /**
   * FCFA, integer — set only when a coupon was redeemed: the amount OFF the
   * plan's full price (pricing.priceFcfa - amount), not the discounted
   * price itself. 2026-08-22 bug fix: Stripe and Chariow both bill against
   * a fixed Price/Product object configured in the provider's own
   * dashboard (`amount` above was computed but never actually reached the
   * charge), so a redeemed coupon silently had zero effect on what the
   * customer paid. Stripe now applies this as a one-time Coupon scoped to
   * just the Checkout Session (see stripe.ts). Ignored by Chariow (see
   * `couponCode` below instead) and by Moneroo, which already charges
   * `amount` directly.
   */
  discountAmount?: number;
  /**
   * 2026-08-24 — Chariow-only. Chariow has no API for a custom discount
   * amount (Chariow.md §6 "Pas d'override de prix"): the ONLY way to
   * reduce its price is a `discount_code` pre-created in Chariow's own
   * dashboard and passed through verbatim at checkout time — it's Chariow
   * that validates/applies it (product scoping, expiry…), not us. Reuses
   * the same code the customer typed into our own coupon field; Chariow
   * will reject it (see SubscriptionCheckoutResult below / CHECKOUT_FAILED)
   * if that code doesn't happen to also exist, scoped to this product, on
   * Chariow's side. Ignored by Stripe/Moneroo, which get their discount via
   * `amount`/`discountAmount` above instead.
   */
  couponCode?: string;
  customerEmail: string;
  customerName?: string;
  /** E.164 phone — required by Moneroo/Chariow, unused by Stripe. */
  customerPhone?: string;
  /** Your row's id — becomes the provider's idempotency/reference field. */
  subscriptionPaymentId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface SubscriptionCheckoutResult {
  /** Provider-side reference — stored on SubscriptionPayment.providerRef.
   * For Stripe this is the Checkout Session id (cs_...). */
  providerRef: string;
  checkoutUrl: string;
  /**
   * 2026-08-24 — Chariow-only. `data.purchase.amount` from Chariow's own
   * `POST /checkout` response (Chariow.md §3.1) — the price it will ACTUALLY
   * debit, after any `discount_code` it applied. Chariow prices its own
   * product independently of our `amount` above (and a discount_code's real
   * value can differ from what our own Coupon record assumes), so the
   * caller must overwrite its stored amount with this before returning —
   * otherwise the webhook's `amountMatches` 5% tolerance check rejects the
   * (correctly paid) sale as a mismatch and never credits the subscription.
   */
  actualAmount?: { value: number; currency: string };
}

/**
 * A subscription provider adapter. Only Stripe implements `createPortalSession`
 * (Moneroo/Chariow have no customer-managed billing portal — cancellation
 * for those just means "don't do another manual checkout").
 */
export interface SubscriptionProvider {
  name: SubscriptionProviderName;
  /** False when required credentials are missing — routes translate this
   * to 503. Stripe/Moneroo check env vars only (sync); Chariow (2026-08-22)
   * also checks its admin-editable DB override, so it's async — `boolean |
   * Promise<boolean>` lets every caller just `await` this uniformly
   * without forcing the two sync providers to wrap a value in a Promise. */
  isConfigured(): boolean | Promise<boolean>;
  createCheckout(input: SubscriptionCheckoutInput): Promise<SubscriptionCheckoutResult>;
}
