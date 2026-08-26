// GET/PATCH /api/payments/[id] — backs the internal success view's summary
// card (in case of a page refresh right after creation), the receipt PDF
// route, and (2026-08-18 audit) the row "..." menu's status change.
//
// PATCH only touches `status` — Banani never designed a full payment-edit
// flow, and this app's own money invariants (amount is always a snapshot
// of invoice.amount at registration, method-specific fields are set once)
// stay immutable on purpose. Status is the one field with a real business
// need to change after the fact: a Virement bancaire/Chèque payment is
// created `En attente` (see derivePaymentStatus) and needs to flip to
// `Payé` once the bank/cheque actually clears — previously nothing in the
// app could ever make that transition, so it stayed `En attente` forever.
// Does NOT touch the related Invoice — POST /api/payments already marks
// the invoice `Payée` unconditionally at payment-registration time
// (pre-existing behavior, out of scope here).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchPaymentBody = z.object({
  status: z.enum(['Payé', 'En attente']),
});

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

    const row = await prisma.payment.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        invoice: { select: { id: true, reference: true } },
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        payment: {
          id: row.id,
          reference: row.reference,
          amount: row.amount,
          method: row.method,
          status: row.status,
          paymentDate: row.paymentDate,
          notes: row.notes,
          generateReceipt: row.generateReceipt,
          receiptReference: row.receiptReference,
          bankName: row.bankName,
          bankAccountLast4: row.bankAccountLast4,
          transferReference: row.transferReference,
          payerName: row.payerName,
          mobileProvider: row.mobileProvider,
          mobilePhone: row.mobilePhone,
          mobileReference: row.mobileReference,
          chequeNumber: row.chequeNumber,
          chequeBank: row.chequeBank,
          chequeHolder: row.chequeHolder,
          chequeDueDate: row.chequeDueDate,
          createdAt: row.createdAt,
          invoice: { id: row.invoice.id, reference: row.invoice.reference },
          client: displayName(row.client),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(
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

    const parsed = PatchPaymentBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.payment.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, status: true },
    });

    return NextResponse.json({ payment }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
