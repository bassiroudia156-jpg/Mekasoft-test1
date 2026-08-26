// Invoice email — written in French, not English. Phase 3's
// teamInviteEmail() followed the starter's English-by-default convention
// (auth/email-templates.ts D-15), but an invoice is a customer-facing
// financial document sent by a French-speaking Senegalese garage to its
// French-speaking customers — a product-correctness call, not a
// re-litigation of the existing English templates elsewhere.
import 'server-only';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface InvoiceEmailArgs {
  clientName: string;
  reference: string;
  amount: string; // pre-formatted, e.g. "53 100 FCFA"
  issueDate: string; // pre-formatted, e.g. "15/05/2025"
  dueDate: string;
  organizationName: string;
  /** Optional free-text message from the sender (InvoiceResendEmail's "Message personnalisé"). */
  customMessage?: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function invoiceEmail(args: InvoiceEmailArgs): EmailTemplate {
  const client = htmlEscape(args.clientName);
  const org = htmlEscape(args.organizationName);
  const message = args.customMessage ? htmlEscape(args.customMessage) : null;

  const intro = message
    ? `<p>${message.replace(/\n/g, '<br/>')}</p>`
    : `<p>Bonjour ${client},</p><p>Vous trouverez ci-joint votre facture <strong>${args.reference}</strong> datée du ${args.issueDate}.</p>`;

  return {
    subject: `Facture ${args.reference} — ${args.organizationName}`,
    html: `${intro}<table style="margin:16px 0;font-size:14px"><tr><td style="padding:4px 12px 4px 0;color:#666">Facture</td><td><strong>${args.reference}</strong></td></tr><tr><td style="padding:4px 12px 4px 0;color:#666">Montant</td><td><strong>${args.amount}</strong></td></tr><tr><td style="padding:4px 12px 4px 0;color:#666">Échéance</td><td>${args.dueDate}</td></tr></table><p>Cordialement,<br/>${org}</p>`,
    text: `${message ?? `Bonjour ${args.clientName}, vous trouverez ci-joint votre facture ${args.reference} datée du ${args.issueDate}.`}\n\nFacture: ${args.reference}\nMontant: ${args.amount}\nÉchéance: ${args.dueDate}\n\nCordialement,\n${args.organizationName}`,
  };
}
