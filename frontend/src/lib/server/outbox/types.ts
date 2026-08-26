/**
 * Outbox event types. Add new variants here, then handle them in
 * backend/src/lib/outbox/dispatcher.ts.
 *
 * `kind` is a dotted "domain.event" string. The dispatcher looks up the
 * handler by exact match — no inheritance, no fallback dispatching.
 *
 * Each variant carries its own `payload` shape; runtime validation
 * happens in the dispatcher (the JSON column is opaque to Prisma).
 */

export type OutboxEvent =
  | NotificationPaymentReceivedEvent
  | EmailPaymentConfirmationEvent
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | EmailTeamInviteEvent
  | EmailInvoiceEvent
  | EmailQuoteSentEvent;

export interface NotificationPaymentReceivedEvent {
  kind: 'notification.payment_received';
  payload: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

export interface EmailPaymentConfirmationEvent {
  kind: 'email.payment_confirmation';
  payload: {
    to: string;
    orderId: string;
    amount: number;
    currency: string;
  };
}

/**
 * Phase 1 — emitted by signup + resend-verification routes; consumed by the
 * email-queue cron in Phase 5 (which calls verificationEmail() to render).
 */
export interface EmailVerificationCodeEvent {
  kind: 'email.verification_code';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Phase 1 — emitted by forgot-password route; consumed by the email-queue cron
 * in Phase 5 (which calls resetPasswordEmail() to render).
 */
export interface EmailPasswordResetEvent {
  kind: 'email.password_reset';
  payload: {
    to: string;
    code: string;
    expiresAt: string;
  };
}

/**
 * Phase 3 (Banani AddTeamMemberModal → TeamMemberInvitationSent) — emitted
 * by POST /api/organizations/[id]/invite; consumed by the email-queue cron
 * (renders via teamInviteEmail() in lib/server/organizations/email-templates).
 */
export interface EmailTeamInviteEvent {
  kind: 'email.team_invite';
  payload: {
    to: string;
    organizationName: string;
    inviterEmail: string;
    token: string;
    expiresAt: string;
  };
}

/**
 * Phase 6 (Banani NewInvoice → InvoiceCreatedSuccess / InvoiceResendEmail
 * → InvoiceEmailSent) — emitted by POST /api/invoices (auto-send on
 * create) and POST /api/invoices/[id]/resend (manual resend, `to` may be
 * an operator-edited address, `customMessage` from the resend modal).
 * The dispatcher re-fetches the Invoice, renders the PDF attachment, and
 * — once successfully enqueued to the mailer — stamps
 * `emailSentAt`/`emailSentTo` on the row for the "Historique" timeline.
 */
export interface EmailInvoiceEvent {
  kind: 'email.invoice';
  payload: {
    invoiceId: string;
    to: string;
    customMessage?: string;
  };
}

/**
 * Phase C decision #8 (2026-08-25) — emitted by POST /api/quotes/[id]/send.
 * The dispatcher renders quoteSentEmail() with the public respond link
 * (`${APP_URL}/quotes/respond/${token}`, same token the client clicks to
 * accept/reject with no account — see the Quote model comment).
 */
export interface EmailQuoteSentEvent {
  kind: 'email.quote_sent';
  payload: {
    to: string;
    quoteReference: string;
    organizationName: string;
    clientName: string;
    amount: number;
    validUntil: string;
    token: string;
  };
}

export type OutboxEventKind = OutboxEvent['kind'];
