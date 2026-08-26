// Team-invite email — same factory pattern as auth/email-templates.ts
// (htmlEscape everything interpolated, plain HTML + text bodies, no
// MJML/React Email). Kept in its own file rather than added to
// auth/email-templates.ts since it isn't an auth-flow email.
// French copy + MekaSoft brand shell (2026-08-18, explicit user request —
// see email-brand.ts for the spam-avoidance rationale), same as the other
// two auth-adjacent templates.
import 'server-only';
import { brandedEmailHtml, brandButton } from '../email-brand';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface TeamInviteEmailArgs {
  organizationName: string;
  inviterEmail: string;
  acceptUrl: string;
  /** Optional ISO-8601 expiry; falls back to "bientôt" wording when omitted. */
  expiresAt?: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ttlWording(expiresAtIso: string | undefined): string {
  if (!expiresAtIso) return 'bientôt';
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return 'bientôt';
  const remainingMs = expiresMs - Date.now();
  if (remainingMs <= 0) return 'bientôt';
  const days = Math.floor(remainingMs / 86_400_000);
  if (days >= 1) return `dans ${days} jour${days === 1 ? '' : 's'}`;
  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours >= 1) return `dans ${hours} heure${hours === 1 ? '' : 's'}`;
  return "dans moins d'une heure";
}

export function teamInviteEmail(args: TeamInviteEmailArgs): EmailTemplate {
  const org = htmlEscape(args.organizationName);
  const inviter = htmlEscape(args.inviterEmail);
  const url = htmlEscape(args.acceptUrl);
  const ttl = ttlWording(args.expiresAt);
  return {
    subject: `Invitation à rejoindre ${args.organizationName} sur MekaSoft`,
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p><strong>${inviter}</strong> vous invite à rejoindre <strong>${org}</strong> sur MekaSoft.</p><p style="margin:20px 0;">${brandButton("Accepter l'invitation", url)}</p><p>Ce lien expire ${ttl}. Si vous ne vous attendiez pas à cet email, vous pouvez l'ignorer sans risque.</p>`,
    ),
    text: `${args.inviterEmail} vous invite à rejoindre ${args.organizationName} sur MekaSoft. Acceptez l'invitation : ${args.acceptUrl} (expire ${ttl}). Si vous ne vous attendiez pas à cet email, ignorez-le.`,
  };
}
