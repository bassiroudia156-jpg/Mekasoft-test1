// Relance email — same branded-shell + htmlEscape convention as
// organizations/email-templates.ts (teamInviteEmail). Kept in its own file
// since it isn't an auth-flow or team-flow email.
import 'server-only';
import { brandedEmailHtml, brandButton } from '../email-brand';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SubscriptionReminderArgs {
  organizationName: string;
  plan: 'PRO';
  daysUntilExpiry: number;
  renewUrl: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function urgencyWording(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

export function subscriptionReminderEmail(args: SubscriptionReminderArgs): EmailTemplate {
  const org = htmlEscape(args.organizationName);
  const url = htmlEscape(args.renewUrl);
  const when = urgencyWording(args.daysUntilExpiry);
  return {
    subject: `Votre abonnement MekaSoft ${args.plan} expire ${when}`,
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>L'abonnement <strong>${args.plan}</strong> de <strong>${org}</strong> expire <strong>${when}</strong>.</p><p>Le paiement par mobile money ne se renouvelle pas automatiquement — pensez à renouveler pour garder l'accès à toutes vos fonctionnalités (facturation illimitée, partage WhatsApp, export de données…).</p><p style="margin:20px 0;">${brandButton('Renouveler mon abonnement', url)}</p><p>Si vous avez déjà renouvelé, ignorez cet email.</p>`,
    ),
    text: `L'abonnement ${args.plan} de ${args.organizationName} expire ${when}. Le paiement mobile money ne se renouvelle pas automatiquement — renouvelez ici : ${args.renewUrl}. Si vous avez déjà renouvelé, ignorez ce message.`,
  };
}

/** Plain text — sent as-is via Twilio WhatsApp (no HTML on that channel). */
export function subscriptionReminderWhatsAppText(args: SubscriptionReminderArgs): string {
  const when = urgencyWording(args.daysUntilExpiry);
  return `MekaSoft — l'abonnement ${args.plan} de ${args.organizationName} expire ${when}. Renouvelez ici : ${args.renewUrl}`;
}
