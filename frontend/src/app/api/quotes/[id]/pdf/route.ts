// GET /api/quotes/[id]/pdf — real PDF download for a Quote, reusing the
// exact same renderer as the intervention-based devis
// (lib/server/interventions/devis-pdf.tsx — its DevisPdfData shape has no
// Intervention-specific field, just reference/client/vehicle/work/parts/
// amounts, so a Quote maps onto it with zero changes to the renderer).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { renderDevisPdf } from '@/lib/server/interventions/devis-pdf';

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;

    const row = await prisma.quote.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        client: {
          select: { type: true, firstName: true, lastName: true, companyName: true, phone: true },
        },
        vehicle: {
          select: { brand: true, model: true, year: true, registration: true, mileage: true },
        },
        parts: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pdfBuffer = await renderDevisPdf({
      reference: row.reference,
      createdAt: row.createdAt.toLocaleDateString('fr-FR'),
      clientName: displayName(row.client),
      clientPhone: row.client.phone,
      vehicleBrand: row.vehicle.brand,
      vehicleModel: row.vehicle.model,
      vehicleYear: row.vehicle.year,
      vehicleRegistration: row.vehicle.registration,
      vehicleMileage: row.vehicle.mileage,
      work: row.work,
      parts: row.parts.map((p) => ({
        name: p.name,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        total: p.total,
      })),
      laborAmount: row.laborAmount,
      partsAmount: row.partsAmount,
      subtotal: row.subtotal,
      taxRatePct: row.taxRatePct,
      taxAmount: row.taxAmount,
      amount: row.amount,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${row.reference}.pdf"`,
      },
    });
  });
}
