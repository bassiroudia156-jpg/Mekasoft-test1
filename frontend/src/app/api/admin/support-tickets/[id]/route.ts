// PATCH /api/admin/support-tickets/[id] — ADMIN can change status and/or
// send a reply (queued via EmailQueue, same durable pipeline the
// subscription webhooks use — never a fire-and-forget send). A reply
// without an explicit `status` implicitly moves OPEN → IN_PROGRESS;
// `status: 'RESOLVED'` stamps resolvedAt.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { supportReplyEmail } from '@/lib/server/support/email-templates';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  reply: z.string().min(1).max(5000).optional(),
});

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || (!parsed.data.status && !parsed.data.reply)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Provide status and/or reply.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const nextStatus = parsed.data.status ?? (parsed.data.reply ? 'IN_PROGRESS' : ticket.status);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.supportTicket.update({
        where: { id },
        data: {
          status: nextStatus,
          resolvedAt: nextStatus === 'RESOLVED' ? new Date() : ticket.resolvedAt,
        },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'support_ticket.update',
        targetType: 'SupportTicket',
        targetId: id,
        metadata: { from: ticket.status, to: nextStatus, replied: Boolean(parsed.data.reply) },
      });
      return row;
    });

    // Email send is best-effort side-effect, outside the tx (no financial/
    // idempotency stakes here — a retried PATCH just re-enqueues a reply,
    // acceptable for a support inbox, unlike the payment webhooks' outbox
    // requirement).
    if (parsed.data.reply) {
      const emailQueue = getEmailQueue();
      if (emailQueue) {
        const tpl = supportReplyEmail({ subject: ticket.subject, reply: parsed.data.reply });
        await emailQueue.enqueue({
          to: ticket.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
      }
    }

    return NextResponse.json(
      { ticket: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
