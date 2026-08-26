// POST /api/invoices/[id]/resend — Banani InvoiceResendEmail →
// InvoiceEmailSent. Reachable from both the list row menu and the detail
// page's "Renvoyer" button — same Modal (form/sent), two entry points.
//
// `to` defaults to the client's email on file but may be operator-edited
// (Banani's resend form shows an editable "Adresse email" field);
// `customMessage` overrides the template's default intro paragraph. Enqueues
// the same `email.invoice` outbox event as auto-send on create — the
// dispatcher re-renders the PDF fresh each time rather than caching it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { enqueueOutbox } from '@/lib/server/outbox';

const ResendBody = z.object({
  to: zEmail.optional(),
  customMessage: z.string().max(2000).optional(),
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

    const parsed = ResendBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true, client: { select: { email: true } } },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const to = parsed.data.to ?? invoice.client.email;
    if (!to) {
      return NextResponse.json(
        { error: 'CLIENT_HAS_NO_EMAIL', message: "Ce client n'a pas d'adresse email enregistrée." },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await enqueueOutbox(prisma, {
      kind: 'email.invoice',
      payload: {
        invoiceId: invoice.id,
        to,
        ...(parsed.data.customMessage !== undefined
          ? { customMessage: parsed.data.customMessage }
          : {}),
      },
    });

    return NextResponse.json({ ok: true, to }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
