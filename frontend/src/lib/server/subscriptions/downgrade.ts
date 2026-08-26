// Grace-period expiry — reverts a MONEROO/CHARIOW org to FREE once
// `graceEndsAt` has passed with no fresh checkout. STRIPE subscriptions
// never appear here: `customer.subscription.deleted` (stripe.ts's webhook
// onFailed handler) downgrades those immediately — Stripe already gave its
// own retry grace before emitting that event, so no second app-level grace
// is needed.
//
// Injectable `prisma` — same testable pattern as reminders.ts.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { createLogger } from '../logger';

const log = createLogger();

export interface DowngradeExpiredOptions {
  prisma?: PrismaClient;
  batchSize?: number; // default 100 — matches orders/expire.ts's convention
}

export interface DowngradeExpiredResult {
  downgraded: number;
}

export async function downgradeExpiredSubscriptions(
  opts: DowngradeExpiredOptions = {},
): Promise<DowngradeExpiredResult> {
  const client = opts.prisma ?? defaultPrisma;
  const batchSize = opts.batchSize ?? 100;
  const now = new Date();

  const candidates = await client.subscription.findMany({
    where: {
      status: 'ACTIVE',
      provider: { in: ['MONEROO', 'CHARIOW'] },
      graceEndsAt: { lt: now },
    },
    orderBy: { graceEndsAt: 'asc' },
    take: batchSize,
    select: { id: true, organizationId: true, plan: true },
  });

  let downgraded = 0;
  for (const sub of candidates) {
    // Per-row tx, status='ACTIVE' WHERE-guard — mirrors orders/expire.ts's
    // race protection against a checkout that just succeeded (webhook
    // flipped this row back to a fresh ACTIVE period between the findMany
    // above and this update).
    const updated = await client.$transaction(async (tx) => {
      const flipped = await tx.subscription.updateMany({
        where: { id: sub.id, status: 'ACTIVE', graceEndsAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
      if (flipped.count === 0) return false;
      await tx.organization.update({
        where: { id: sub.organizationId },
        data: { plan: 'FREE', planUpdatedAt: now },
      });
      return true;
    });
    if (updated) {
      downgraded++;
      log.info('subscription-downgrade: reverted to FREE', {
        organizationId: sub.organizationId,
        previousPlan: sub.plan,
      });
    }
  }

  return { downgraded };
}
