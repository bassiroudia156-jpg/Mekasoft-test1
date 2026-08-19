// Source: RESEARCH.md Pattern 19 — D-15/D-16 email template factories.
// French copy + MekaSoft brand shell (2026-08-18, explicit user request —
// see email-brand.ts for the spam-avoidance rationale behind the styling
// choices). Was English-by-default per D-15; this app's UI/customer-facing
// copy (invoices, the whole product) is French-first, so these two
// transactional auth emails — the ones real users actually receive — now
// match that convention instead of standing out as the one English surface.
// Plain HTML (per D-16) — no MJML / React Email; per-project may swap.
//
// Phase 5's email-queue cron consumes outbox `email.*` events and calls these
// factories to produce the EmailJob row. Phase 1 just defines the factories
// and emits the outbox events.
//
// WR-03 — Defense-in-depth: ALL interpolated values in HTML strings MUST
// flow through `htmlEscape()`. The verification code is currently constrained
// to `[A-Z2-9]{8}` upstream (VERIFICATION_CODE_REGEX), so XSS is impossible
// today. But the function signature accepts `string` and future templates
// (e.g. password-changed notifications including the user's display name)
// will reuse this pattern — escape at the source so a careless add can't
// inject HTML. Plain-text body has no HTML interpretation, so no escape
// needed there.
//
// O1 audit fix — `expiresAt` is now threaded from the outbox payload so the
// rendered TTL matches `AUTH_VERIFICATION_TTL_MIN` (was hardcoded "15 minutes"
// which lied when operators tuned the env var).
import 'server-only';
import { brandedEmailHtml } from '../email-brand';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface VerificationEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "bientôt" wording when omitted. */
  expiresAt?: string;
}

export interface ResetPasswordEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "bientôt" wording when omitted. */
  expiresAt?: string;
}

/**
 * Minimal HTML escape for template interpolation. Covers the OWASP-recommended
 * five-character set (`& < > " '`). Apply to EVERY user-controlled (or
 * potentially user-controlled) value before interpolating into an HTML
 * template string.
 */
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the TTL window as "dans N minutes" / "dans N heures" — rounds to the
 * unit the user would actually read. Falls back to a vague "bientôt" when no
 * timestamp is provided or the parse fails (defensive: a malformed payload
 * should never break email rendering).
 *
 * Bias rounding toward the FLOOR so we never overstate the TTL: telling a
 * user "dans 15 minutes" when 14m59s remain (and the code is about to expire)
 * leads to a frustrating retry loop. Floor it to "dans 14 minutes" — they may
 * be earlier than promised, never later.
 */
function ttlWording(expiresAtIso: string | undefined): string {
  if (!expiresAtIso) return 'bientôt';
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return 'bientôt';
  const remainingMs = expiresMs - Date.now();
  if (remainingMs <= 0) return 'bientôt'; // expired by the time we render; pre-cron drift
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return "dans moins d'une minute";
  if (minutes < 60) return `dans ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `dans ${hours} heure${hours === 1 ? '' : 's'}`;
}

export function verificationEmail(args: VerificationEmailArgs): EmailTemplate {
  const code = htmlEscape(args.code);
  const ttl = ttlWording(args.expiresAt);
  return {
    subject: 'Votre code de vérification MekaSoft',
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>Votre code de vérification est <strong style="font-size:20px;letter-spacing:3px;color:#152A4E;">${code}</strong>.</p><p>Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    ),
    text: `Votre code de vérification MekaSoft est ${args.code}. Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  };
}

export function resetPasswordEmail(args: ResetPasswordEmailArgs): EmailTemplate {
  const code = htmlEscape(args.code);
  const ttl = ttlWording(args.expiresAt);
  return {
    subject: 'Réinitialisation de votre mot de passe MekaSoft',
    html: brandedEmailHtml(
      `<p>Bonjour,</p><p>Votre code de réinitialisation de mot de passe est <strong style="font-size:20px;letter-spacing:3px;color:#152A4E;">${code}</strong>.</p><p>Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    ),
    text: `Votre code de réinitialisation de mot de passe MekaSoft est ${args.code}. Il expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  };
}
