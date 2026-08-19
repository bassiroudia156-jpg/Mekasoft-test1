// POST /api/subscriptions/checkout — starts a real payment for the org's
// own PRO/BUSINESS plan (as opposed to /api/orders, which is the generic
// starter's dormant scaffolding, or /api/payments, which is a garage's
// CLIENT paying the garage for a repair — three unrelated money flows).
//
// requireCallerOrg('ADMIN') — same gating level as PATCH /api/organizations
// (shop identity/billing isn't a plain-MEMBER action).
export const runtime = 'nodejs';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { prisma } from '@/lib/server/prisma';
import { PLAN_PRICING } from '@/lib/server/plans/limits';
import {
  getSubscriptionProvider,
  SubscriptionProviderUnconfiguredError,
} from '@/lib/server/subscriptions/registry';
import { SUBSCRIPTION_PROVIDERS } from '@/lib/server/subscriptions/types';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  plan: z.enum(['PRO', 'BUSINESS']),
  provider: z.enum(SUBSCRIPTION_PROVIDERS),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { plan, provider: providerName } = parsed.data;

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: {
        id: true,
        name: true,
        phone: true,
        contactEmail: true,
        owner: { select: { email: true } },
      },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'ORGANIZATION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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

    if ((providerName === 'MONEROO' || providerName === 'CHARIOW') && !org.phone) {
      return NextResponse.json(
        {
          error: 'PHONE_REQUIRED',
          message:
            'Un numéro de téléphone est requis pour payer par mobile money. Ajoutez-le dans Paramètres > Atelier.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pricing = PLAN_PRICING[plan];
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

    const payment = await prisma.subscriptionPayment.create({
      data: {
        organizationId: org.id,
        plan,
        provider: providerName,
        // Temp placeholder — `providerRef` is unique per provider, so an
        // empty/shared value would collide across concurrent checkout
        // attempts. Overwritten with the real provider reference below.
        providerRef: `pending_${randomUUID()}`,
        amount: pricing.priceFcfa,
        currency: 'XOF',
        status: 'PENDING',
      },
    });

    const customerEmail = org.contactEmail ?? org.owner.email;

    try {
      const result = await provider.createCheckout({
        organizationId: org.id,
        organizationName: org.name,
        plan,
        amount: pricing.priceFcfa,
        currency: 'XOF',
        customerEmail,
        customerName: org.name,
        ...(org.phone ? { customerPhone: org.phone } : {}),
        subscriptionPaymentId: payment.id,
        successUrl: `${appUrl}/subscriptions/return?payment=${payment.id}`,
        cancelUrl: `${appUrl}/settings`,
      });

      await prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { providerRef: result.providerRef, checkoutUrl: result.checkoutUrl },
      });

      return NextResponse.json(
        { checkoutUrl: result.checkoutUrl, paymentId: payment.id },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      await prisma.subscriptionPayment.update({
        where: { id: payment.id },
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
