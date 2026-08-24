// GET /api/interventions/[id]/devis/pdf — "Télécharger PDF" on the devis
// (quote) print page. Mirrors /api/invoices/[id]/pdf's shape exactly:
// renders fresh on every request via renderDevisPdf() rather than caching
// a stored copy (devis are small, single-page documents so the render cost
// is negligible next to the DB round-trip already needed to fetch them).
//
// 2026-08-24 — this route didn't exist before: the devis page's
// "Télécharger PDF" button called window.print() same as "Lancer
// l'impression" (Phase 5, before @react-pdf/renderer landed for invoices in
// Phase 6 — see devis-pdf.tsx's file comment). That only opens the
// browser's print dialog with "Save as PDF" as one destination among
// others, not an actual download — reported as "impossible de télécharger
// le pdf".
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeTotals } from '@/lib/server/interventions/totals';
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

    const row = await prisma.intervention.findFirst({
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
        { error: 'INTERVENTION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const totals = computeTotals(row.laborAmount, row.partsAmount, row.taxRatePct);

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
      subtotal: totals.subtotal,
      taxRatePct: row.taxRatePct,
      taxAmount: totals.tax,
      amount: row.amount,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Devis-${row.reference}.pdf"`,
      },
    });
  });
}
