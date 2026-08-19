/**
 * Outbox dispatcher — drains PENDING OutboxEvent rows and routes each to
 * the correct side-effect handler.
 *
 *   draining order: oldest scheduledAt first.
 *   on success: row.status = SENT, sentAt = now.
 *   on failure: row.attempts++, lastError = err.message; if attempts <
 *               maxAttempts the row is rescheduled (status PENDING +
 *               scheduledAt += backoff), else marked DEAD.
 *
 * The dispatcher is single-instance safe via a per-row claim:
 *   UPDATE OutboxEvent SET status = 'PROCESSING', attempts = attempts + 1
 *   WHERE id = $1 AND status = 'PENDING'
 *   RETURNING id;
 *
 * Two competing workers see at most one of them claim each row (the other's
 * UPDATE returns 0 rows). For multi-instance prod a Redis-leader-election
 * variant is recommended on top of this — single-instance is the v1 stance.
 *
 * Backoff: 30s, 2m, 10m, 30m, 1h. Max 5 attempts before DEAD.
 */
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '../notifications/index';
import { paymentReceived } from '../notifications/templates';
import type { EmailQueue } from '../queues/email-queue';
import { createLogger } from '../logger';
import type { OutboxEvent } from './types';

const logger = createLogger();

const MAX_ATTEMPTS = 5;
const BACKOFF_MS: readonly number[] = [
  30_000, // 30s
  2 * 60_000, // 2 min
  10 * 60_000, // 10 min
  30 * 60_000, // 30 min
  60 * 60_000, // 1 h
];

export interface OutboxDispatcherDeps {
  prisma: PrismaClient;
  emailQueue?: EmailQueue;
}

/**
 * Process up to `batchSize` PENDING events whose scheduledAt has elapsed.
 * Returns count successfully processed (success or terminal failure).
 */
export async function drainOutbox(
  deps: OutboxDispatcherDeps,
  batchSize: number = 25,
): Promise<{ processed: number; succeeded: number; failed: number; dead: number }> {
  const now = new Date();
  const candidates = await deps.prisma.outboxEvent.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  for (const candidate of candidates) {
    // Per-row atomic claim — guards against concurrent dispatchers.
    const claimed = await deps.prisma.outboxEvent.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue; // another worker got it

    const row = await deps.prisma.outboxEvent.findUnique({
      where: { id: candidate.id },
    });
    if (!row) continue;

    const event: OutboxEvent = {
      kind: row.kind as OutboxEvent['kind'],
      payload: row.payload as OutboxEvent['payload'],
    } as OutboxEvent;

    try {
      await dispatchEvent(deps, event);
      await deps.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (row.attempts >= MAX_ATTEMPTS) {
        await deps.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { status: 'DEAD', lastError: message },
        });
        dead++;
        logger.error('outbox: event DEAD', { id: row.id, kind: row.kind, lastError: message });
      } else {
        const idx = Math.min(row.attempts - 1, BACKOFF_MS.length - 1);
        const delay = BACKOFF_MS[Math.max(0, idx)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
        await deps.prisma.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            lastError: message,
            scheduledAt: new Date(Date.now() + delay),
          },
        });
        failed++;
        logger.warn('outbox: event failed (will retry)', {
          id: row.id,
          kind: row.kind,
          attempts: row.attempts,
          retryInMs: delay,
          lastError: message,
        });
      }
    }
  }

  return { processed: candidates.length, succeeded, failed, dead };
}

/** Route a single event to the correct handler. */
async function dispatchEvent(deps: OutboxDispatcherDeps, event: OutboxEvent): Promise<void> {
  switch (event.kind) {
    case 'notification.payment_received': {
      const { userId, orderId, amount, currency } = event.payload;
      await createNotification(deps.prisma, paymentReceived(userId, orderId, amount, currency));
      return;
    }
    case 'email.payment_confirmation': {
      if (!deps.emailQueue) {
        // No mailer configured — skip silently. This event will be retried;
        // for permanent skips, ops should mark it DEAD manually.
        throw new Error('email queue not configured');
      }
      const { to, orderId, amount, currency } = event.payload;
      await deps.emailQueue.enqueue({
        to,
        subject: 'Payment received',
        html: `<p>Your order <strong>${orderId}</strong> for ${amount} ${currency} is confirmed. Thank you!</p>`,
      });
      return;
    }
    case 'email.verification_code': {
      // Phase 1 — emitted by signup + resend-verification routes. Phase 5's
      // email-queue cron will render via verificationEmail() and call enqueue.
      // O1 audit fix — thread `expiresAt` so the rendered TTL matches the
      // route-side `AUTH_VERIFICATION_TTL_MIN` env (was hardcoded "15 min").
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { verificationEmail } = await import('../auth/email-templates');
      const { to, code, expiresAt } = event.payload;
      const tpl = verificationEmail({ code, email: to, expiresAt });
      await deps.emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html });
      return;
    }
    case 'email.password_reset': {
      // Phase 1 — emitted by forgot-password route.
      // O1 audit fix — thread `expiresAt` (see email.verification_code above).
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { resetPasswordEmail } = await import('../auth/email-templates');
      const { to, code, expiresAt } = event.payload;
      const tpl = resetPasswordEmail({ code, email: to, expiresAt });
      await deps.emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html });
      return;
    }
    case 'email.team_invite': {
      // Phase 3 (Banani AddTeamMemberModal → TeamMemberInvitationSent) —
      // emitted by POST /api/organizations/[id]/invite.
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { teamInviteEmail } = await import('../organizations/email-templates');
      const { to, organizationName, inviterEmail, token, expiresAt } = event.payload;
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      const acceptUrl = `${appUrl}/invite/accept?token=${encodeURIComponent(token)}`;
      const tpl = teamInviteEmail({ organizationName, inviterEmail, acceptUrl, expiresAt });
      await deps.emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html });
      return;
    }
    case 'email.invoice': {
      // Phase 6 (Banani NewInvoice → InvoiceCreatedSuccess / InvoiceResendEmail
      // → InvoiceEmailSent) — emitted by POST /api/invoices and
      // POST /api/invoices/[id]/resend. Renders the PDF attachment here
      // (not at emit time) to keep the OutboxEvent payload small, same
      // "render in the dispatcher" precedent as the other email.* cases.
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { invoiceId, to, customMessage } = event.payload;

      const invoice = await deps.prisma.invoice.findUnique({
        where: { id: invoiceId },
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
          organization: { select: { name: true, phone: true, city: true } },
        },
      });
      if (!invoice) {
        // Invoice was deleted after the event was enqueued — nothing to send.
        return;
      }

      const clientName =
        invoice.client.type === 'COMPANY'
          ? (invoice.client.companyName ?? '')
          : [invoice.client.firstName, invoice.client.lastName].filter(Boolean).join(' ');
      const issueDateFmt = invoice.issueDate.toLocaleDateString('fr-FR');
      const dueDateFmt = invoice.dueDate.toLocaleDateString('fr-FR');

      const { renderInvoicePdf } = await import('../invoices/pdf');
      const pdfBuffer = await renderInvoicePdf({
        reference: invoice.reference,
        issueDate: issueDateFmt,
        dueDate: dueDateFmt,
        paymentTerms: invoice.paymentTerms,
        organizationName: invoice.organization.name,
        organizationPhone: invoice.organization.phone,
        organizationCity: invoice.organization.city,
        clientName,
        clientPhone: invoice.client.phone,
        clientEmail: invoice.client.email,
        description: invoice.description,
        subtotal: invoice.subtotal,
        taxRatePct: invoice.taxRatePct,
        taxAmount: invoice.taxAmount,
        amount: invoice.amount,
      });

      const { invoiceEmail } = await import('../invoices/email-templates');
      const tpl = invoiceEmail({
        clientName,
        reference: invoice.reference,
        amount: `${invoice.amount.toLocaleString('fr-FR')} FCFA`,
        issueDate: issueDateFmt,
        dueDate: dueDateFmt,
        organizationName: invoice.organization.name,
        ...(customMessage !== undefined ? { customMessage } : {}),
      });

      await deps.emailQueue.enqueue({
        to,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        attachments: [
          {
            filename: `${invoice.reference}.pdf`,
            content: pdfBuffer.toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      });

      await deps.prisma.invoice.update({
        where: { id: invoiceId },
        data: { emailSentAt: new Date(), emailSentTo: to },
      });
      return;
    }
    default: {
      // Exhaustive check — TS will yell if we add a new variant and forget it.
      const _exhaustive: never = event;
      void _exhaustive;
      throw new Error(`outbox: unknown event kind`);
    }
  }
}
