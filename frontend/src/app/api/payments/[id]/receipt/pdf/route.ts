// GET /api/payments/[id]/receipt/pdf — streams a real receipt PDF, same
// "render fresh on every request" pattern as invoices' pdf route. 404s if
// the payment doesn't have a receipt (generateReceipt was unchecked at
// registration) rather than rendering an empty/placeholder document.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { renderReceiptPdf } from '@/lib/server/payment-ledger/pdf';

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

    const payment = await prisma.payment.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        invoice: { select: { reference: true } },
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
        organization: { select: { name: true, phone: true, city: true } },
      },
    });
    if (!payment) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!payment.generateReceipt || !payment.receiptReference) {
      return NextResponse.json(
        { error: 'RECEIPT_NOT_GENERATED' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pdfBuffer = await renderReceiptPdf({
      receiptReference: payment.receiptReference,
      paymentReference: payment.reference,
      paymentDate: payment.paymentDate.toLocaleDateString('fr-FR'),
      invoiceReference: payment.invoice.reference,
      method: payment.method,
      organizationName: payment.organization.name,
      organizationPhone: payment.organization.phone,
      organizationCity: payment.organization.city,
      clientName: displayName(payment.client),
      amount: payment.amount,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${payment.receiptReference}.pdf"`,
      },
    });
  });
}
