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
import { PLAN_PRICING } from '@/lib/server/plans/limits';
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
});

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
  return NextResponse.json({ availableProviders: listConfiguredProviders() });
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
    const { email, atelierName, phone, plan, provider: providerName } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    let provider;
    try {
      provider = getSubscriptionProvider(providerName);
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

    const pricing = PLAN_PRICING[plan];
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    const intent = await prisma.anonymousSubscriptionIntent.create({
      data: {
        email,
        atelierName,
        phone,
        plan,
        provider: providerName,
        // Temp placeholder, same reasoning as checkout/route.ts's
        // `pending_${randomUUID()}` — providerRef is unique per provider.
        providerRef: `pending_${randomUUID()}`,
        amount: pricing.priceFcfa,
        currency: 'XOF',
        status: 'PENDING',
      },
    });

    try {
      const result = await provider.createCheckout({
        organizationId: intent.id,
        organizationName: atelierName,
        plan,
        amount: pricing.priceFcfa,
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
