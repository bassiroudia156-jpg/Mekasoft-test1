// Shared types for the subscription-billing domain (2026-08-18) — a garage
// (Organization) paying MekaSoft for its own PRO ("Premium") plan. See the
// schema.prisma comment above `model Subscription` for how this differs
// from the garage-invoicing `Payment` domain.
//
// 2026-08-20: BUSINESS retired, merged into PRO/"Premium" — see
// lib/server/plans/limits.ts's header comment. isPayablePlan() below no
// longer accepts 'BUSINESS': a stale row (webhook replay, old client, the
// legacy test fixture) carrying that value must NOT be treated as payable.
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
  return value === 'PRO';
}

export interface SubscriptionCheckoutInput {
  organizationId: string;
  organizationName: string;
  plan: PayablePlan;
  /** FCFA, integer — from PLAN_PRICING[plan].priceFcfa. */
  amount: number;
  currency: string;
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
}

/**
 * A subscription provider adapter. Only Stripe implements `createPortalSession`
 * (Moneroo/Chariow have no customer-managed billing portal — cancellation
 * for those just means "don't do another manual checkout").
 */
export interface SubscriptionProvider {
  name: SubscriptionProviderName;
  /** False when required env vars are missing — routes translate this to 503. */
  isConfigured(): boolean;
  createCheckout(input: SubscriptionCheckoutInput): Promise<SubscriptionCheckoutResult>;
}
