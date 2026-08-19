// Payment-outcome emails (confirmation + failed-charge notice) — sent from
// webhook handlers via their `postCommit` hook (after the Serializable tx
// that activates the subscription has committed), same branded-shell
// convention as reminder-templates.ts / organizations/email-templates.ts.
import 'server-only';
import { brandedEmailHtml, brandButton } from '../email-brand';

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

export function subscriptionConfirmedEmail(args: {
  organizationName: string;
  plan: 'PRO' | 'BUSINESS';
  currentPeriodEnd: string; // pre-formatted (fr-FR)
  manageUrl: string;
}): EmailTemplate {
  const org = htmlEscape(args.organizationName);
  return {
    subject: `Abonnement ${args.plan} activé — merci !`,
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>Le paiement de <strong>${org}</strong> pour le plan <strong>${args.plan}</strong> a bien été reçu. L'abonnement est actif jusqu'au <strong>${args.currentPeriodEnd}</strong>.</p><p style="margin:20px 0;">${brandButton('Gérer mon abonnement', args.manageUrl)}</p>`,
    ),
    text: `Le paiement de ${args.organizationName} pour le plan ${args.plan} a bien été reçu. Abonnement actif jusqu'au ${args.currentPeriodEnd}. Gérer : ${args.manageUrl}`,
  };
}

export function subscriptionPaymentFailedEmail(args: {
  organizationName: string;
  manageUrl: string;
}): EmailTemplate {
  const org = htmlEscape(args.organizationName);
  return {
    subject: 'Échec de paiement — mettez à jour votre moyen de paiement',
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>Le paiement de l'abonnement de <strong>${org}</strong> a échoué. Stripe retentera automatiquement — pensez à vérifier votre carte si l'échec persiste.</p><p style="margin:20px 0;">${brandButton('Mettre à jour mon moyen de paiement', args.manageUrl)}</p>`,
    ),
    text: `Le paiement de l'abonnement de ${args.organizationName} a échoué. Stripe retentera automatiquement. Mettre à jour : ${args.manageUrl}`,
  };
}
