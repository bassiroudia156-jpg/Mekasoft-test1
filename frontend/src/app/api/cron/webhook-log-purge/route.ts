export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // D-10

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000; // ~2 × maxDuration (Pitfall 3)

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // Pitfall 6: read env at handler-call time so vi.stubEnv works in tests.
    const days = Number(process.env.WEBHOOK_LOG_RETENTION_DAYS ?? 90); // D-11 default
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let processed = 0;

    await withLease(redis ?? undefined, 'webhook-log-purge', LEASE_TTL_MS, async () => {
      // D-15 + A2: inline deleteMany; the WHERE column is `createdAt`
      // (schema-verified — see prisma/schema.prisma WebhookLog model).
      const result = await prisma.webhookLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      processed = result.count;
      log.info('webhook-log-purge tick', { processed, days, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// 2026-08-23: Vercel Cron invokes scheduled jobs via GET, not POST — see
// https://vercel.com/docs/cron-jobs (the platform sends a GET request to
// the configured `path`). This route only exported POST, so every real
// cron tick from Vercel was hitting a 405 and no cron logic ever ran.
// Manual/CI callers can still use POST directly; both share the same
// verifyCronSecret gate inside the handler above.
export const GET = POST;
