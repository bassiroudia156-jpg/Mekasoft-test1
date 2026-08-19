// Cron: relance emails/WhatsApp for MONEROO/CHARIOW subscriptions
// approaching expiry. See lib/server/subscriptions/reminders.ts for the
// tier-crossing logic; this route is a thin auth+lease+log wrapper, same
// shape as the other 6 cron routes (verification-cleanup is the closest
// reference).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { sendSubscriptionReminders } from '@/lib/server/subscriptions/reminders';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result = { candidates: 0, emailsSent: 0, whatsappSent: 0, skipped: 0 };

    await withLease(redis ?? undefined, 'subscription-reminders', LEASE_TTL_MS, async () => {
      result = await sendSubscriptionReminders();
      log.info('subscription-reminders tick complete', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
