// GET /api/subscriptions — the caller's org subscription status, feeds the
// Settings "Abonnement" section (renewal date, provider, grace/expired
// state) and `listConfiguredProviders()` so the checkout UI only offers
// providers that actually have env configured.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { prisma } from '@/lib/server/prisma';
import { listConfiguredProviders } from '@/lib/server/subscriptions/registry';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const sub = await prisma.subscription.findUnique({
      where: { organizationId: auth.organizationId },
      select: {
        plan: true,
        provider: true,
        status: true,
        currentPeriodEnd: true,
        graceEndsAt: true,
        cancelAtPeriodEnd: true,
      },
    });

    return NextResponse.json(
      { subscription: sub, availableProviders: listConfiguredProviders() },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
