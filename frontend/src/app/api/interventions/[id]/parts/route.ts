// POST /api/interventions/[id]/parts — Banani AddParts / AddAnotherPart
// (+_next1) / PartsAddedConfirmation. Adding a part to an *existing*
// intervention posts immediately (unlike the creation flow, where parts
// are itemized locally and submitted atomically with the intervention —
// see /api/interventions POST) — recomputes the denormalized
// partsAmount/amount totals in the same transaction as the Part insert.
//
// Refused once already invoiced (2026-08-24, mirrors /api/interventions/
// [id] PATCH's identical guard on taxRatePct) — the invoice now renders
// its own itemized parts list (read live off this same relation, not a
// separate snapshot table), so a part added after issue would silently
// appear on an invoice whose subtotal/amount never accounted for it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeTotals } from '@/lib/server/interventions/totals';

const PartBody = z.object({
  reference: z.string().max(60).optional(),
  name: z.string().trim().min(1, 'Dénomination requise').max(150),
  supplier: z.string().max(120).optional(),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().max(20).default('pcs'),
  unitPrice: z.number().int().min(0),
  inStock: z.boolean().default(true),
});

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

    const parsed = PartBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const intervention = await prisma.intervention.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: {
        id: true,
        laborAmount: true,
        partsAmount: true,
        taxRatePct: true,
        invoice: { select: { id: true } },
      },
    });
    if (!intervention) {
      return NextResponse.json(
        { error: 'INTERVENTION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (intervention.invoice) {
      return NextResponse.json(
        {
          error: 'INTERVENTION_ALREADY_INVOICED',
          message:
            'Cette intervention est déjà facturée — les pièces ne peuvent plus être modifiées.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const total = data.quantity * data.unitPrice;
    const newPartsAmount = intervention.partsAmount + total;
    const totals = computeTotals(intervention.laborAmount, newPartsAmount, intervention.taxRatePct);

    const [part] = await prisma.$transaction([
      prisma.part.create({
        data: {
          interventionId: id,
          ...(data.reference !== undefined ? { reference: data.reference } : {}),
          name: data.name,
          ...(data.supplier !== undefined ? { supplier: data.supplier } : {}),
          quantity: data.quantity,
          unit: data.unit,
          unitPrice: data.unitPrice,
          total,
          inStock: data.inStock,
        },
      }),
      prisma.intervention.update({
        where: { id },
        data: { partsAmount: newPartsAmount, amount: totals.total },
      }),
    ]);

    return NextResponse.json(
      {
        part,
        totals: { partsAmount: newPartsAmount, taxAmount: totals.tax, amount: totals.total },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
