// GET /api/invoices/[id]/pdf — Banani InvoicePdfDownloaded / "Télécharger
// PDF" action (list row menu, detail page, print-preview page). Renders
// fresh on every request via `renderInvoicePdf()` (same builder the outbox
// dispatcher uses for the emailed attachment) rather than caching a stored
// copy — invoices are small, single-page documents so the render cost is
// negligible next to a DB round-trip.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { renderInvoicePdf } from '@/lib/server/invoices/pdf';
import { getPlanLimits } from '@/lib/server/plans/limits';

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

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        client: {
          select: {
            type: true,
            firstName: true,
            lastName: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
        organization: {
          select: { name: true, phone: true, city: true, plan: true, logoUrl: true },
        },
        intervention: {
          select: {
            laborAmount: true,
            parts: {
              select: { name: true, quantity: true, unit: true, unitPrice: true, total: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const clientName = displayName(invoice.client);
    const canBrand = getPlanLimits(invoice.organization.plan).features.invoiceBranding;
    const pdfBuffer = await renderInvoicePdf({
      reference: invoice.reference,
      issueDate: invoice.issueDate.toLocaleDateString('fr-FR'),
      dueDate: invoice.dueDate.toLocaleDateString('fr-FR'),
      paymentTerms: invoice.paymentTerms,
      organizationName: invoice.organization.name,
      organizationPhone: invoice.organization.phone,
      organizationCity: invoice.organization.city,
      organizationLogoUrl: canBrand ? invoice.organization.logoUrl : null,
      clientName,
      clientPhone: invoice.client.phone,
      clientEmail: invoice.client.email,
      description: invoice.description,
      laborAmount: invoice.intervention.laborAmount,
      parts: invoice.intervention.parts,
      subtotal: invoice.subtotal,
      taxRatePct: invoice.taxRatePct,
      taxAmount: invoice.taxAmount,
      amount: invoice.amount,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.reference}.pdf"`,
      },
    });
  });
}
