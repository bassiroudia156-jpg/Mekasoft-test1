// Coupon validation + atomic redemption (2026-08-20 admin dashboard build).
//
// Two entry points:
//   - `previewCoupon()` — read-only, used by POST /api/coupons/validate so
//     the pricing page can show a discount before the user pays. Never
//     mutates redeemedCount.
//   - `redeemCoupon()` — called from inside the checkout routes' own
//     transaction, right before creating the SubscriptionPayment /
//     AnonymousSubscriptionIntent row. Atomically guards maxRedemptions via
//     `updateMany` + affected-row check (same "guard + write in one tx"
//     shape as withdrawals/lock.ts, adapted to Prisma's update-count
//     idiom instead of an advisory lock — a coupon redemption isn't a
//     per-user contention point the way a withdrawal balance is, so the
//     lighter primitive is enough here).
//
// NOT `import 'server-only'` at module scope is wrong here — this file
// only ever runs in route handlers, unlike limits.ts / pricing.ts which
// also serve a CLI script. Server-only guard is appropriate.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Plan } from '@/lib/server/plans/limits';

export type CouponError =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'REDEMPTION_LIMIT_REACHED'
  | 'PLAN_MISMATCH';

export interface CouponPreview {
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  discountedPriceFcfa: number;
}

function computeDiscountedPrice(
  priceFcfa: number,
  discountType: string,
  discountValue: number,
): number {
  const raw =
    discountType === 'PERCENT'
      ? priceFcfa - Math.round((priceFcfa * discountValue) / 100)
      : priceFcfa - discountValue;
  // Never go below 0 or charge more than the sticker price.
  return Math.max(0, Math.min(priceFcfa, raw));
}

async function findValidCoupon(
  tx: Pick<PrismaClient, 'coupon'> | Prisma.TransactionClient,
  code: string,
  plan: Plan,
): Promise<
  | { error: CouponError }
  | { coupon: NonNullable<Awaited<ReturnType<PrismaClient['coupon']['findUnique']>>> }
> {
  const coupon = await tx.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) return { error: 'NOT_FOUND' };
  if (!coupon.active) return { error: 'INACTIVE' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return { error: 'EXPIRED' };
  if (coupon.appliesToPlan && coupon.appliesToPlan !== plan) return { error: 'PLAN_MISMATCH' };
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { error: 'REDEMPTION_LIMIT_REACHED' };
  }
  return { coupon };
}

/** Read-only preview — does not touch redeemedCount. */
export async function previewCoupon(
  prisma: PrismaClient,
  code: string,
  plan: Plan,
  priceFcfa: number,
): Promise<{ error: CouponError } | { preview: CouponPreview }> {
  const result = await findValidCoupon(prisma, code, plan);
  if ('error' in result) return result;
  const { coupon } = result;
  return {
    preview: {
      code: coupon.code,
      discountType: coupon.discountType as 'PERCENT' | 'FIXED',
      discountValue: coupon.discountValue,
      discountedPriceFcfa: computeDiscountedPrice(
        priceFcfa,
        coupon.discountType,
        coupon.discountValue,
      ),
    },
  };
}

/**
 * Call from inside the checkout route's own transaction. Atomically claims
 * one redemption slot (if maxRedemptions is set) via an `updateMany` whose
 * WHERE clause re-checks the limit — under a concurrent race, only as many
 * callers as there are remaining slots will see `count === 1`; the rest
 * see `count === 0` and must treat it as REDEMPTION_LIMIT_REACHED even
 * though the earlier `findValidCoupon` guard passed (the classic
 * check-then-act gap, closed here the same way withdrawals/lock.ts closes
 * it for balance checks).
 */
export async function redeemCoupon(
  tx: Prisma.TransactionClient,
  code: string,
  plan: Plan,
  priceFcfa: number,
): Promise<
  { error: CouponError } | { couponId: string; amountBeforeFcfa: number; amountAfterFcfa: number }
> {
  const result = await findValidCoupon(tx, code, plan);
  if ('error' in result) return result;
  const { coupon } = result;

  const claim = await tx.coupon.updateMany({
    where: {
      id: coupon.id,
      active: true,
      ...(coupon.maxRedemptions !== null ? { redeemedCount: { lt: coupon.maxRedemptions } } : {}),
    },
    data: { redeemedCount: { increment: 1 } },
  });
  if (claim.count !== 1) return { error: 'REDEMPTION_LIMIT_REACHED' };

  const amountAfterFcfa = computeDiscountedPrice(
    priceFcfa,
    coupon.discountType,
    coupon.discountValue,
  );
  return { couponId: coupon.id, amountBeforeFcfa: priceFcfa, amountAfterFcfa };
}
