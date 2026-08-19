// DELETE /api/interventions/[id]/parts/[partId] — PartsRow's delete
// action. Recomputes partsAmount/amount in the same transaction as the
// Part removal.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeTotals } from '@/lib/server/interventions/totals';

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string; partId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id, partId } = await routeCtx.params;

    const intervention = await prisma.intervention.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, laborAmount: true, partsAmount: true, taxRatePct: true },
    });
    if (!intervention) {
      return NextResponse.json(
        { error: 'INTERVENTION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const part = await prisma.part.findFirst({
      where: { id: partId, interventionId: id },
      select: { id: true, total: true },
    });
    if (!part) {
      return NextResponse.json(
        { error: 'PART_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const newPartsAmount = Math.max(0, intervention.partsAmount - part.total);
    const totals = computeTotals(intervention.laborAmount, newPartsAmount, intervention.taxRatePct);

    await prisma.$transaction([
      prisma.part.delete({ where: { id: partId } }),
      prisma.intervention.update({
        where: { id },
        data: { partsAmount: newPartsAmount, amount: totals.total },
      }),
    ]);

    return NextResponse.json(
      { totals: { partsAmount: newPartsAmount, taxAmount: totals.tax, amount: totals.total } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
