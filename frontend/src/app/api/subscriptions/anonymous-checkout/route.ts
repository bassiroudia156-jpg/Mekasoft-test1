// POST /api/subscriptions/anonymous-checkout — the landing page's "S'abonner"
// buttons for logged-out visitors (2026-08-19). Unlike
// POST /api/subscriptions/checkout (requireCallerOrg — an existing org pays
// for its own upgrade), there is no account yet: this collects just enough
// (email/atelier name/phone) to start a real hosted checkout, and defers
// account+org creation to the webhook once payment actually succeeds (see
// lib/server/subscriptions/anonymous.ts). Mirrors checkout/route.ts's
// PENDING-row-then-provider-call-then-reconcile shape closely — same
// provider adapters, just a different row type (AnonymousSubscriptionIntent
// instead of SubscriptionPayment, since there's no real organizationId yet).
//
// Pre-session route (no account exists to attach a CSRF cookie to) — same
// carve-out as signup/forgot-password. Rate-limited per email like signup.
export const runtime = 'nodejs';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getPlanPricing } from '@/lib/server/plans/pricing';
import { redeemCoupon, type CouponError } from '@/lib/server/coupons/redeem';
import {
  getSubscriptionProvider,
  listConfiguredProviders,
  SubscriptionProviderUnconfiguredError,
} from '@/lib/server/subscriptions/registry';
import { SUBSCRIPTION_PROVIDERS } from '@/lib/server/subscriptions/types';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  email: zEmail,
  atelierName: z.string().trim().min(2, 'Nom trop court').max(120),
  phone: zPhone,
  plan: z.enum(['PRO', 'BUSINESS']),
  provider: z.enum(SUBSCRIPTION_PROVIDERS),
  // 2026-08-20 — same optional promo code as the authenticated checkout
  // route, re-validated server-side.
  couponCode: z.string().min(1).max(64).optional(),
});

class CouponRejected extends Error {
  constructor(public readonly code: CouponError) {
    super(`Coupon rejected: ${code}`);
  }
}

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'subscriptions:anonymous-checkout',
  windowMs: 60 * 60 * 1000, // 1 hour — same window as signup
  max: Number(process.env.SUBSCRIPTION_ANONYMOUS_CHECKOUT_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_CHECKOUT_ATTEMPTS',
  message: 'Trop de tentatives. Réessayez plus tard.',
});

/** Public — exposes only which providers have env configured (same booleans
 * already returned to authenticated callers via GET /api/subscriptions),
 * so the anonymous payment picker doesn't offer a dead Mobile Money button. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ availableProviders: await listConfiguredProviders() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { email, atelierName, phone, plan, provider: providerName, couponCode } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    let provider;
    try {
      provider = await getSubscriptionProvider(providerName);
    } catch (err) {
      if (err instanceof SubscriptionProviderUnconfiguredError) {
        return NextResponse.json(
          {
            error: 'SUBSCRIPTION_PROVIDER_UNCONFIGURED',
            message: `${providerName} n'est pas encore configuré.`,
          },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    // 2026-08-22 bug fix — same guard as checkout/route.ts: Chariow has no
    // API for a custom checkout amount or arbitrary discount (Chariow.md §6),
    // only a `discount_code` pre-created in Chariow's own dashboard, which
    // our internal Coupon codes don't map to. Reject up front rather than
    // silently charge full price after showing a discounted total.
    if (providerName === 'CHARIOW' && couponCode) {
      return NextResponse.json(
        {
          error: 'COUPON_UNSUPPORTED_FOR_PROVIDER',
          message:
            'Les codes promo ne sont pas encore pris en charge pour ce moyen de paiement. Payez par carte ou retirez le code promo.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pricing = await getPlanPricing(plan);
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    let intent;
    try {
      intent = await prisma.$transaction(async (tx) => {
        let amount = pricing.priceFcfa;
        let redemption: {
          couponId: string;
          amountBeforeFcfa: number;
          amountAfterFcfa: number;
        } | null = null;

        if (couponCode) {
          const result = await redeemCoupon(tx, couponCode, plan, pricing.priceFcfa);
          if ('error' in result) throw new CouponRejected(result.error);
          redemption = result;
          amount = result.amountAfterFcfa;
        }

        const created = await tx.anonymousSubscriptionIntent.create({
          data: {
            email,
            atelierName,
            phone,
            plan,
            provider: providerName,
            // Temp placeholder, same reasoning as checkout/route.ts's
            // `pending_${randomUUID()}` — providerRef is unique per provider.
            providerRef: `pending_${randomUUID()}`,
            amount,
            currency: 'XOF',
            status: 'PENDING',
          },
        });

        if (redemption) {
          await tx.couponRedemption.create({
            data: {
              couponId: redemption.couponId,
              anonymousIntentId: created.id,
              amountBeforeFcfa: redemption.amountBeforeFcfa,
              amountAfterFcfa: redemption.amountAfterFcfa,
            },
          });
        }

        return created;
      });
    } catch (err) {
      if (err instanceof CouponRejected) {
        return NextResponse.json(
          { error: 'COUPON_' + err.code, message: 'Ce code promo ne peut pas être appliqué.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    try {
      const result = await provider.createCheckout({
        organizationId: intent.id,
        organizationName: atelierName,
        plan,
        // Actual charge, reflects any redeemed coupon discount.
        amount: intent.amount,
        // 2026-08-22 — see SubscriptionCheckoutInput.discountAmount.
        discountAmount: pricing.priceFcfa - intent.amount,
        currency: 'XOF',
        customerEmail: email,
        customerName: atelierName,
        customerPhone: phone,
        subscriptionPaymentId: intent.id,
        successUrl: `${appUrl}/subscriptions/welcome?intent=${intent.id}`,
        cancelUrl: `${appUrl}/subscriptions/checkout?plan=${plan}`,
      });

      await prisma.anonymousSubscriptionIntent.update({
        where: { id: intent.id },
        data: { providerRef: result.providerRef, checkoutUrl: result.checkoutUrl },
      });

      return NextResponse.json(
        { checkoutUrl: result.checkoutUrl, intentId: intent.id },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      await prisma.anonymousSubscriptionIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED' },
      });
      const message = err instanceof Error ? err.message : 'Unknown payment error';
      return NextResponse.json(
        { error: 'CHECKOUT_FAILED', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
