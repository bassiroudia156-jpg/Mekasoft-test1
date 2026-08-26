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
    let processed = 0;

    await withLease(redis ?? undefined, 'verification-cleanup', LEASE_TTL_MS, async () => {
      // D-13: inline deleteMany — single-query work doesn't deserve its own
      // lib helper. If complexity grows (e.g., per-purpose retention), refactor
      // to lib/server/auth/verification-cleanup.ts at that point.
      const result = await prisma.verificationCode.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      processed = result.count;
      log.info('verification-cleanup tick', { processed, requestId: ctx.requestId });
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
