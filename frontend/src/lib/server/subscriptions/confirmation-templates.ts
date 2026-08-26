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

/** Sent once for a brand-new account created by the anonymous checkout flow
 * (app/subscriptions/checkout) — the payment already succeeded; this is the
 * "claim your account" step, not a routine password reset, hence distinct
 * copy from resetPasswordEmail (lib/server/auth/email-templates.ts). */
export function subscriptionWelcomeEmail(args: {
  organizationName: string;
  plan: 'PRO' | 'BUSINESS';
  resetUrl: string;
}): EmailTemplate {
  const org = htmlEscape(args.organizationName);
  return {
    subject: `Bienvenue sur MekaSoft ${args.plan} !`,
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>Votre paiement pour <strong>${org}</strong> a bien été reçu — le plan <strong>${args.plan}</strong> est actif dès maintenant. Il ne reste qu'une étape : définissez votre mot de passe pour accéder à votre nouvel espace MekaSoft.</p><p style="margin:20px 0;">${brandButton('Définir mon mot de passe', args.resetUrl)}</p><p style="color:#6b7280;font-size:13px;">Ce lien expire dans quelques jours — pas d'urgence, mais ne tardez pas trop.</p>`,
    ),
    text: `Votre paiement pour ${args.organizationName} a bien été reçu — le plan ${args.plan} est actif. Définissez votre mot de passe pour y accéder : ${args.resetUrl}`,
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
