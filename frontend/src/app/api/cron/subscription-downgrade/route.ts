// Cron: reverts MONEROO/CHARIOW orgs to FREE once their grace period has
// lapsed with no fresh checkout. See lib/server/subscriptions/downgrade.ts.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { downgradeExpiredSubscriptions } from '@/lib/server/subscriptions/downgrade';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let downgraded = 0;

    await withLease(redis ?? undefined, 'subscription-downgrade', LEASE_TTL_MS, async () => {
      const result = await downgradeExpiredSubscriptions();
      downgraded = result.downgraded;
      log.info('subscription-downgrade tick complete', { downgraded, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, downgraded },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
