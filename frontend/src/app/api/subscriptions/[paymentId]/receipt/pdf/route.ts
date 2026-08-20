// GET /api/subscriptions/[paymentId]/receipt/pdf — streams a real receipt
// PDF for a SubscriptionPayment (garage → MekaSoft), same "render fresh on
// every request" pattern as payments/[id]/receipt/pdf (garage → client).
// 404s if the payment doesn't exist, belongs to another org, or hasn't
// SUCCEEDED yet — there's nothing to receipt for a pending/failed attempt.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { renderSubscriptionReceiptPdf } from '@/lib/server/subscriptions/receipt-pdf';
import { PLAN_PRICING } from '@/lib/server/plans/limits';

const PROVIDER_LABEL: Record<string, string> = {
  STRIPE: 'Carte bancaire (Stripe)',
  MONEROO: 'Mobile Money (Moneroo)',
  CHARIOW: 'Mobile Money (Chariow)',
};

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ paymentId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { paymentId } = await routeCtx.params;

    const payment = await prisma.subscriptionPayment.findFirst({
      where: { id: paymentId, organizationId: auth.organizationId },
      include: { organization: { select: { name: true } } },
    });
    if (!payment) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (payment.status !== 'SUCCEEDED') {
      return NextResponse.json(
        { error: 'RECEIPT_NOT_AVAILABLE' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const planLabel = (PLAN_PRICING[payment.plan as 'PRO'] ?? PLAN_PRICING.PRO).label;
    const paidAt = (payment.succeededAt ?? payment.createdAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const pdfBuffer = await renderSubscriptionReceiptPdf({
      paymentId: payment.id,
      organizationName: payment.organization.name,
      plan: payment.plan,
      planLabel,
      provider: payment.provider,
      providerLabel: PROVIDER_LABEL[payment.provider] ?? payment.provider,
      amount: payment.amount,
      currency: payment.currency,
      paidAt,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'x-request-id': ctx.requestId,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="mekasoft-recu-${payment.id}.pdf"`,
      },
    });
  });
}
