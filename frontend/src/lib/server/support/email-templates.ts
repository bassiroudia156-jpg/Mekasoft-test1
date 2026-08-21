// Support-ticket reply email — same branded-shell convention as
// subscriptions/confirmation-templates.ts.
import 'server-only';
import { brandedEmailHtml } from '../email-brand';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function supportReplyEmail(args: { subject: string; reply: string }): EmailTemplate {
  const subject = htmlEscape(args.subject);
  const replyHtml = htmlEscape(args.reply).replace(/\n/g, '<br />');
  return {
    subject: `Re: ${args.subject}`,
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>Voici une réponse à votre message « <strong>${subject}</strong> » :</p><p style="margin:16px 0;padding:12px 16px;background:#f5f4f0;border-radius:6px;">${replyHtml}</p><p>L'équipe MekaSoft</p>`,
    ),
    text: `Réponse à votre message "${args.subject}":\n\n${args.reply}\n\nL'équipe MekaSoft`,
  };
}
