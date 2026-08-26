// GET /api/admin/integrations — SUPERADMIN-only read-only status panel for
// every external provider this project wires. Reports configured/not
// configured from env-var PRESENCE only — never the values themselves —
// plus a live ping for the one provider cheap enough to check on every
// request (Redis).
//
// 2026-08-22: Chariow is the one exception to "no credentials form" — see
// credentials.ts's file comment for why (its webhook auth is a shared
// secret placed directly in the callback URL, no HMAC, and a human pasting
// the wrong value there is a real failure mode that already happened in
// prod). Its status here is DB-override-aware (getChariowCredentialsStatus)
// and only ever exposes a masked last-4 hint + the composed webhook URL —
// never a plaintext secret. Editing happens via PATCH
// /api/admin/payment-credentials (see admin/integrations/page.tsx).
// Every other provider stays env-var-only, unchanged.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { redis } from '@/lib/server/redis';
import { getChariowCredentialsStatus } from '@/lib/server/subscriptions/credentials';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  /** null = no live check attempted (env-presence only). */
  healthy: boolean | null;
  detail: string;
  /** Chariow only — true when the DB override (not env vars) is the
   * active source, i.e. an admin set it from the dashboard. */
  isOverride?: boolean;
  /** Chariow only — the exact "Pulse" webhook URL to paste into Chariow's
   * dashboard, built server-side from the real webhook secret. Copy it,
   * never hand-type it — see credentials.ts's file comment for why that
   * matters here specifically. */
  webhookUrl?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    let redisHealthy: boolean | null = null;
    if (redis) {
      try {
        await redis.ping();
        redisHealthy = true;
      } catch {
        redisHealthy = false;
      }
    }

    const chariow = await getChariowCredentialsStatus();

    const integrations: IntegrationStatus[] = [
      {
        id: 'stripe',
        label: 'Stripe (cartes bancaires)',
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        healthy: null,
        detail: 'Abonnements Pro/Business — paiement carte.',
      },
      {
        id: 'moneroo',
        label: 'Moneroo (Mobile Money)',
        configured: Boolean(process.env.MONEROO_SECRET_KEY),
        healthy: null,
        detail: 'Abonnements Pro/Business — paiement mobile money.',
      },
      {
        id: 'chariow',
        label: 'Chariow (Mobile Money)',
        configured: chariow.configured,
        healthy: null,
        detail: 'Abonnements Pro/Business — paiement mobile money (fallback).',
        isOverride: chariow.isOverride,
        ...(chariow.webhookUrl ? { webhookUrl: chariow.webhookUrl } : {}),
      },
      {
        id: 'cloudinary',
        label: 'Cloudinary (stockage fichiers)',
        configured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
        healthy: null,
        detail: 'Logos garage, pièces jointes.',
      },
      {
        id: 'resend',
        label: 'Resend (emails)',
        configured: Boolean(process.env.RESEND_API_KEY),
        healthy: null,
        detail: 'Emails transactionnels (bienvenue, factures, support).',
      },
      {
        id: 'twilio',
        label: 'Twilio (WhatsApp)',
        configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        healthy: null,
        detail: 'Relances abonnement par WhatsApp.',
      },
      {
        id: 'google-oauth',
        label: 'Google OAuth',
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        healthy: null,
        detail: 'Connexion "Se connecter avec Google".',
      },
      {
        id: 'upstash-redis',
        label: 'Upstash Redis',
        configured: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        healthy: redisHealthy,
        detail: 'Rate limiting, verrous, cache — PING testé en direct.',
      },
      {
        id: 'sentry',
        label: 'Sentry (observabilité)',
        configured: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
        healthy: null,
        detail: 'Suivi des erreurs serveur/client.',
      },
    ];

    return NextResponse.json({ integrations }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
