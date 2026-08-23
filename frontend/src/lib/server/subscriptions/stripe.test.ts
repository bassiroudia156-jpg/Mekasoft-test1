// 2026-08-22 bug fix regression tests — see the comment block in
// createCheckout(): Checkout used to reference only the fixed
// STRIPE_PRICE_ID_PRO/BUSINESS Price object and never looked at any
// coupon-redeemed discount at all, so a customer who saw a discounted
// total on-screen was silently charged the full sticker price at Stripe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sessionsCreate = vi.fn();
const couponsCreate = vi.fn();

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: sessionsCreate } },
    coupons: { create: couponsCreate },
  })),
}));

import { stripeSubscriptionProvider, __resetStripeClient } from './stripe';
import type { SubscriptionCheckoutInput } from './types';

const baseInput: SubscriptionCheckoutInput = {
  organizationId: 'org_1',
  organizationName: 'Garage Demo',
  plan: 'PRO',
  amount: 9_900,
  currency: 'XOF',
  customerEmail: 'owner@test.local',
  subscriptionPaymentId: 'sp_1',
  successUrl: 'https://app.test/subscriptions/return?payment=sp_1',
  cancelUrl: 'https://app.test/profile',
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetStripeClient();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
  process.env.STRIPE_PRICE_ID_BUSINESS = 'price_business';
  sessionsCreate.mockResolvedValue({ id: 'cs_123', url: 'https://stripe.test/c/cs_123' });
  couponsCreate.mockResolvedValue({ id: 'coupon_1' });
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_ID_PRO;
  delete process.env.STRIPE_PRICE_ID_BUSINESS;
});

describe('stripeSubscriptionProvider.createCheckout', () => {
  it('charges the full plan price via the fixed Price when no coupon was redeemed', async () => {
    await stripeSubscriptionProvider.createCheckout(baseInput);

    expect(couponsCreate).not.toHaveBeenCalled();
    const call = sessionsCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['line_items']).toEqual([{ price: 'price_pro', quantity: 1 }]);
    expect(call['discounts']).toBeUndefined();
  });

  it('regression: applies a one-time Stripe Coupon for the redeemed discount instead of silently charging full price', async () => {
    await stripeSubscriptionProvider.createCheckout({
      ...baseInput,
      amount: 4_950,
      discountAmount: 4_950,
    });

    expect(couponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 4_950,
        currency: 'xof',
        duration: 'once',
        max_redemptions: 1,
      }),
    );
    const call = sessionsCreate.mock.calls[0]![0] as Record<string, unknown>;
    // The recurring Price itself is untouched — only this Checkout Session
    // gets the discount, so renewals after the first still bill full price.
    expect(call['line_items']).toEqual([{ price: 'price_pro', quantity: 1 }]);
    expect(call['discounts']).toEqual([{ coupon: 'coupon_1' }]);
  });

  it('treats a zero discountAmount the same as no coupon (no Stripe Coupon created)', async () => {
    await stripeSubscriptionProvider.createCheckout({ ...baseInput, discountAmount: 0 });
    expect(couponsCreate).not.toHaveBeenCalled();
    const call = sessionsCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['discounts']).toBeUndefined();
  });

  it('throws when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    __resetStripeClient();
    await expect(stripeSubscriptionProvider.createCheckout(baseInput)).rejects.toThrow(
      'Stripe not configured',
    );
  });

  it('throws when no STRIPE_PRICE_ID is configured for the plan', async () => {
    delete process.env.STRIPE_PRICE_ID_PRO;
    await expect(stripeSubscriptionProvider.createCheckout(baseInput)).rejects.toThrow(
      'No STRIPE_PRICE_ID configured for plan PRO',
    );
  });
});
