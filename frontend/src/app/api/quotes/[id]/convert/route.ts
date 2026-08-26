// POST /api/quotes/[id]/convert — turns an ACCEPTED quote into a real
// Intervention (work order), copying work/parts/amounts across. Only
// meaningful for a from-scratch quote (no interventionId yet) — a quote
// created FROM an intervention already has one and is rejected here with
// QUOTE_ALREADY_CONVERTED (nothing to do, not an error state worth hiding).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { nextInterventionReference } from '@/lib/server/interventions/reference';
import { checkInterventionMonthlyLimit } from '@/lib/server/plans/guard';

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;

    const quote = await prisma.quote.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: { parts: true },
    });
    if (!quote) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (quote.status !== 'ACCEPTED') {
      return NextResponse.json(
        {
          error: 'QUOTE_NOT_ACCEPTED',
          message: 'Seul un devis accepté peut être converti en intervention.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (quote.interventionId) {
      return NextResponse.json(
        { error: 'QUOTE_ALREADY_CONVERTED', message: 'Ce devis a déjà une intervention liée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const limitError = await checkInterventionMonthlyLimit(auth.organizationId);
    if (limitError) {
      return NextResponse.json(
        {
          error: limitError.code,
          message: `Le plan ${limitError.plan} est limité à ${limitError.limit} interventions par mois.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const intervention = await prisma.$transaction(async (tx) => {
      const reference = await nextInterventionReference(tx, auth.organizationId);
      const created = await tx.intervention.create({
        data: {
          organizationId: auth.organizationId,
          reference,
          clientId: quote.clientId,
          vehicleId: quote.vehicleId,
          work: quote.work,
          laborAmount: quote.laborAmount,
          partsAmount: quote.partsAmount,
          taxRatePct: quote.taxRatePct,
          amount: quote.amount,
          ...(quote.notes !== null ? { notes: quote.notes } : {}),
          ...(quote.parts.length > 0
            ? {
                parts: {
                  create: quote.parts.map((p) => ({
                    name: p.name,
                    ...(p.supplier !== null ? { supplier: p.supplier } : {}),
                    quantity: p.quantity,
                    unit: p.unit,
                    unitPrice: p.unitPrice,
                    total: p.total,
                  })),
                },
              }
            : {}),
        },
        select: { id: true, reference: true, status: true },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { interventionId: created.id } });
      return created;
    });

    return NextResponse.json(
      { intervention },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
