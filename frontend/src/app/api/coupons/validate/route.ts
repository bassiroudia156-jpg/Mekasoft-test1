// POST /api/coupons/validate — public, read-only coupon preview.
//
// Used by /subscriptions/plans (authenticated upgrade) and
// /subscriptions/checkout (anonymous landing-page checkout) so the user
// sees the discounted price BEFORE submitting to the real checkout route.
// Never mutates redeemedCount — that only happens inside the checkout
// routes' own transaction, right before the charge is created, to avoid
// burning a redemption slot on a preview nobody completes.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { isPlan } from '@/lib/server/plans/limits';
import { getPlanPricing } from '@/lib/server/plans/pricing';
import { previewCoupon } from '@/lib/server/coupons/redeem';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  code: z.string().min(1).max(64),
  plan: z.string(),
});

// No email on this endpoint — `check(req, null)` routes onto the module's
// documented IP-key fallback. 20/5min is generous for a real user typing a
// code, tight enough to blunt brute-forcing short codes.
const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'coupons:validate',
    windowMs: 5 * 60 * 1000,
    max: 20,
    code: 'TOO_MANY_COUPON_ATTEMPTS',
    message: 'Too many coupon attempts. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rl = await limiter.check(req, null);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, error: 'VALIDATION_FAILED' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { code, plan } = parsed.data;
    if (!isPlan(plan) || plan === 'FREE') {
      return NextResponse.json(
        { valid: false, error: 'PLAN_MISMATCH' },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pricing = await getPlanPricing(plan);
    const result = await previewCoupon(prisma, code, plan, pricing.priceFcfa);

    if ('error' in result) {
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        valid: true,
        code: result.preview.code,
        originalPriceFcfa: pricing.priceFcfa,
        discountedPriceFcfa: result.preview.discountedPriceFcfa,
        discountType: result.preview.discountType,
        discountValue: result.preview.discountValue,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
