// Quote-sent email — same factory pattern as organizations/email-templates.ts
// (htmlEscape everything interpolated, plain HTML + text bodies, no
// MJML/React Email). The link this renders is the public, no-account
// accept/reject page (/quotes/respond/[token]) — see Quote model comment.
import 'server-only';
import { brandedEmailHtml, brandButton } from '../email-brand';
import { formatMoneyForPdf } from '../pdf-format';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface QuoteSentEmailArgs {
  quoteReference: string;
  organizationName: string;
  clientName: string;
  amount: number;
  validUntil: string; // ISO-8601
  respondUrl: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function quoteSentEmail(args: QuoteSentEmailArgs): EmailTemplate {
  const org = htmlEscape(args.organizationName);
  const client = htmlEscape(args.clientName);
  const url = htmlEscape(args.respondUrl);
  const amount = formatMoneyForPdf(args.amount);
  const validUntilDate = new Date(args.validUntil).toLocaleDateString('fr-FR');
  return {
    subject: `Devis ${args.quoteReference} — ${args.organizationName}`,
    html: brandedEmailHtml(
      `<p>Bonjour ${client},</p><p><strong>${org}</strong> vous a envoyé un devis de réparation, réf. <strong>${args.quoteReference}</strong>, d'un montant de <strong>${amount}</strong>.</p><p style="margin:20px 0;">${brandButton('Consulter et répondre au devis', url)}</p><p>Ce devis est valable jusqu'au ${validUntilDate}. Vous pouvez l'accepter ou le refuser directement depuis ce lien, sans créer de compte.</p>`,
    ),
    text: `${args.organizationName} vous a envoyé un devis (réf. ${args.quoteReference}) d'un montant de ${amount}. Consultez-le et répondez ici : ${args.respondUrl} (valable jusqu'au ${validUntilDate}).`,
  };
}
